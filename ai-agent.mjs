import { validateSession } from "./public/input-contract.js";
import { EVENT_TYPES, participantSpeakers } from "./public/session-harness.js";
import { buildObservations, runAgent } from "./public/agent-engine.js";
import { runPiBatchAgent, runPiLiveAgent } from "./agent/pi-runtime.mjs";

const defaultEnv = (name, fallback = "") => typeof process === "undefined" ? fallback : (process.env[name] || fallback);

export async function runAIAgent({
  transcript,
  participants = [],
  duration,
  discussionStart = 0,
  config,
  apiKey = defaultEnv("DEEPSEEK_API_KEY"),
  baseUrl = defaultEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
  model = defaultEnv("DEEPSEEK_MODEL", "deepseek-chat"),
  streamFn,
  modelDefinition,
  onProgress
}) {
  const validated = validateSession({ transcript, participants, duration, discussionStart });
  transcript = validated.transcript.filter((line) => line.type === EVENT_TYPES.PARTICIPANT_UTTERANCE);
  participants = participants.length ? participants : participantSpeakers(transcript).map((id) => ({ id, name: id }));
  duration = validated.duration;
  if (!transcript.length) throw new Error("分析需要至少一条参与者发言");
  if (!apiKey && !streamFn) {
    const analysis = runAgent({ transcript, participants, duration, discussionStart, config });
    return { mode: "fallback", model, architecture: "pi", analysis, events: analysis.events, trace: [] };
  }
  const observations = buildObservations({ transcript, participants, duration, discussionStart, config });
  const events = [], trace = [], executions = [], candidateSnapshots = [];
  let latestAnalysis = {};
  // A fresh model context for each window: later observations cannot influence earlier actions.
  for (const baseObservation of observations) {
    const reviewed = new Set(events.at(-1)?.autonomyState?.reviewedSourceIds || []);
    const observation = { ...baseObservation, preferenceSources: transcript.filter(line => line.end <= baseObservation.time && !reviewed.has(line.id)) };
    let result;
    try {
      result = await runPiBatchAgent({ observations: [observation], participants, memory: events, config, apiKey, baseUrl, model, streamFn, modelDefinition });
    } catch (error) {
      error.time = observation.time;
      error.partialEvents = [...events];
      throw error;
    }
    latestAnalysis = result.analysis;
    events.push(...result.analysis.events);
    await onProgress?.({ time: observation.time, events: result.analysis.events });
    trace.push(...result.trace.map((entry) => ({ ...entry, time: observation.time })));
    executions.push({ time: observation.time, ...result.execution });
    candidateSnapshots.push({ time: observation.time, labels: result.analysis.voteCandidates || [] });
  }
  const analysis = { ...latestAnalysis, events, candidateSnapshots };
  return { mode: "deepseek", model, architecture: "pi-causal", analysis, events, trace, execution: executions };

}

export async function decideLiveWithAI({
  transcript = [],
  participants = [],
  stage = "diverge",
  signal = {},
  memory = [],
  config,
  apiKey = defaultEnv("DEEPSEEK_API_KEY"),
  baseUrl = defaultEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
  model = defaultEnv("DEEPSEEK_MODEL", "deepseek-chat"),
  streamFn,
  modelDefinition
}) {
  if (!apiKey && !streamFn) return { mode: "fallback", architecture: "pi", decision: null, trace: [] };
  const result = await runPiLiveAgent({ transcript, participants, stage, signal, memory, config, apiKey, baseUrl, model, streamFn, modelDefinition });
  return { mode: "deepseek", architecture: "pi", ...result };
}
