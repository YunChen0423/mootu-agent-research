import { Agent } from "@earendil-works/pi-agent-core";
import { streamSimple as openAICompletionsStream } from "@earendil-works/pi-ai/api/openai-completions";
import { Type } from "typebox";
import { PREFERENCE_KINDS } from "./autonomy.mjs";
import { STRATEGIES } from "./policy.mjs";
import { createBatchToolset, createLiveToolset, toolStateSnapshot } from "./tools.mjs";

const score = Type.Number({ minimum: 0, maximum: 100 });
const candidateSchema = Type.Object({
  strategy: Type.String(),
  target: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  title: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
  benefit: score,
  disruption: score,
  goal_fit: score,
  confidence: score,
  follow_up: Type.Optional(Type.String()),
  expected_effect: Type.Optional(Type.String()),
  utterance: Type.Optional(Type.String())
});

const decisionSchema = Type.Object({
  time: Type.Optional(Type.Number()),
  stage_recommendation: Type.Union([Type.Literal("diverge"), Type.Literal("converge")]),
  evidence: Type.Array(Type.String(), { maxItems: 3 }),
  missing_evidence: Type.Array(Type.String(), { maxItems: 4 }),
  candidates: Type.Array(candidateSchema, { minItems: 1, maxItems: 3 }),
  reviewed_source_ids: Type.Array(Type.String()),
  preference_updates: Type.Array(Type.Object({
    kind: Type.Union(PREFERENCE_KINDS.map(kind => Type.Literal(kind))),
    source_id: Type.String(), quote: Type.String(),
    duration_seconds: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1800 }))
  }), { maxItems: 32 })
});

const analysisSchema = Type.Object({
  summary: Type.String(),
  screen_topic: Type.Optional(Type.String({ maxLength: 8 })),
  idea_clusters: Type.Optional(Type.Array(Type.String(), { maxItems: 8 })),
  vote_candidates: Type.Optional(Type.Array(Type.String({ maxLength: 8 }), { minItems: 2, maxItems: 4 })),
  events: Type.Array(decisionSchema, { minItems: 1 })
});

function createDeepSeekModel(model, baseUrl) {
  return {
    id: model,
    name: model,
    api: "openai-completions",
    provider: "deepseek",
    baseUrl: baseUrl.replace(/\/$/, ""),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
      supportsStrictMode: false,
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: "deepseek"
    }
  };
}

function compactTraceEvent(event) {
  if (event.type === "tool_execution_start") return { type: event.type, tool: event.toolName };
  if (event.type === "tool_execution_end") return { type: event.type, tool: event.toolName, isError: event.isError, durationMs: event.durationMs };
  if (event.type === "message_end") return { type: event.type, role: event.message.role };
  return { type: event.type };
}

function makeAgent({ systemPrompt, tools, shouldFinish, apiKey, baseUrl, model, streamFn, modelDefinition }) {
  return new Agent({
    initialState: {
      systemPrompt,
      model: modelDefinition || createDeepSeekModel(model, baseUrl),
      thinkingLevel: "off",
      tools
    },
    streamFn: streamFn || openAICompletionsStream,
    getApiKey: () => apiKey,
    toolExecution: "sequential",
    finishTurn: () => shouldFinish?.() ? { action: "end" } : undefined
  });
}

async function runToolAgent({ systemPrompt, userPayload, tools, shouldFinish, runtime }) {
  const trace = [];
  const agent = makeAgent({ systemPrompt, tools, shouldFinish, ...runtime });
  agent.subscribe((event) => { trace.push(compactTraceEvent(event)); });
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; agent.abort(); }, 180000);
  try {
    await agent.prompt(JSON.stringify(userPayload));
    // The model may end with text before completing the tool chain. Resume the
    // same agent/tool state, bounded by both attempts and the original deadline.
    for (let attempt = 0; !shouldFinish?.() && !timedOut && !agent.state.errorMessage && attempt < 2; attempt++) {
      trace.push({ type: "harness_continuation", attempt: attempt + 1 });
      await agent.prompt("工具链尚未完成。请检查已有工具结果，补齐缺失步骤直到 record_expected_effect 成功。不要只输出普通文字，也不要改写已经批准的决策。");
    }
    if (timedOut) throw new Error("单窗口工具链超时（180秒）");
    if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
    if (!shouldFinish?.()) throw new Error("模型未完成工具链（已尝试2次续做）");
  } catch (error) {
    error.trace = trace;
    throw error;
  } finally {
    clearTimeout(deadline);
  }
  return trace;
}

const preferencePrompt = `每次必须逐条检查 preference_sources 中待审的已完成原话，reviewed_source_ids 必须列出全部已审来源 ID（即使没有意愿），并在对应决策的 preference_updates 返回明确的成员意愿（没有则 []，不可省略）：decline_invitation=本人明确不愿被点名；resume_invitation=本人明确重新允许邀请，普通发言不算撤销；quiet_period=明确请求整组暂停提问以安静思考，并提供原话中的 duration_seconds；end_quiet_period=本人明确结束自己请求的安静期。每项 source_id 必须来自工具，quote 必须逐字引用原话且非空；意愿归属原话 speaker，不可替别人设定或解除。不要将引用他人的话、假设、否定句或普通沉默误认为请求。不明确时不编造更新，并写入 missing_evidence。超过30分钟或没有明确时长的安静请求暂不自动设定期限，报告缺少证据。autonomy_state 是跨窗口保留的程序约束：拒绝只禁止对该成员的点名，允许合适的全组问题；安静期内不提问，不因沉默升级；到期重新评估而非强制发言。低参与、模型分数和普通后续发言不能覆盖有效意愿。`;

const sharedPrompt = `${preferencePrompt}\n你是 MooTu 具身讨论促进 Agent。你只引用工具返回的可观察证据，不推断心理、生理、性格或身份。可用策略仅限：${STRATEGIES.join("、")}。每组候选必须包含 observe；只有 invite_quiet_member 可以指定已有参与者为 target。必须通过工具完成感知、评估、提案、动作生成、模拟 dispatch 和效果记录，不要直接用普通文本回答。读取类工具可以在同一轮调用；所有带状态变化的工具必须按流程顺序调用。`;

export async function runPiBatchAgent({ observations, participants, memory = [], config, apiKey, baseUrl, model, streamFn, modelDefinition }) {
  const toolkit = createBatchToolset({ observations, participants, memory, config, decisionSchema, analysisSchema });
  const trace = await runToolAgent({
    systemPrompt: `${sharedPrompt}\n流程：先调用全部 6 个感知/记忆工具；再调用 evaluate_candidates；最后依次调用 propose_intervention、generate_robot_action、dispatch_core_action、dispatch_pod_feedback、record_expected_effect。仅判断本次输入的检查点，不得虚构后续发言。evaluate_candidates 的 screen_topic 必须是一个语义完整、可直接显示在屏幕上的中文讨论主题，不超过 8 个字；不能截取半句话，不能写成员正在说的句子。vote_candidates 必须是从当前已观察到的讨论中去重归纳出的 2 到 4 个可投票方案名称，每项不超过 8 个字，必须是名词短语而不是发言片段。`,
    userPayload: { goal: "促进参与开放性、创意发散性和讨论流动性；仅在预期收益明显高于打断成本时介入", participant_count: participants.length, checkpoint_count: observations.length },
    tools: toolkit.tools,
    shouldFinish: () => toolkit.state.recorded,
    runtime: { apiKey, baseUrl, model, streamFn, modelDefinition }
  });
  if (!toolkit.state.analysis || !toolkit.state.recorded) throw new Error("pi agent 未完成完整讨论工具链");
  return { analysis: toolkit.state.analysis, trace, execution: toolStateSnapshot(toolkit.state) };
}

export async function runPiLiveAgent({ transcript, participants, stage, signal, memory, config, apiKey, baseUrl, model, streamFn, modelDefinition }) {
  const toolkit = createLiveToolset({ transcript, participants, stage, signal, memory, config, decisionSchema });
  const trace = await runToolAgent({
    systemPrompt: `${sharedPrompt}\n流程：先调用全部 6 个感知/记忆工具；再调用 evaluate_candidates；最后依次调用 propose_intervention、generate_robot_action、dispatch_core_action、dispatch_pod_feedback、record_expected_effect。只评估当前窗口。`,
    userPayload: { task: "评估当前现场讨论窗口" },
    tools: toolkit.tools,
    shouldFinish: () => toolkit.state.recorded,
    runtime: { apiKey, baseUrl, model, streamFn, modelDefinition }
  });
  if (!toolkit.state.decision || !toolkit.state.recorded) throw new Error("pi agent 未完成完整实时工具链");
  return { decision: toolkit.state.decision, trace, execution: toolStateSnapshot(toolkit.state) };
}
