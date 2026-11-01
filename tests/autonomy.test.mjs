import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { updateAutonomy, autonomyBlock } from '../agent/autonomy.mjs';
import { sanitizeEvents, sanitizeLiveDecision, selectCandidate } from '../agent/policy.mjs';
import { createBatchToolset } from '../agent/tools.mjs';
import { runPiBatchAgent } from '../agent/pi-runtime.mjs';
import { buildObservations } from '../public/agent-engine.js';
import { runAIAgent } from '../ai-agent.mjs';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
const config = JSON.parse(await readFile(new URL('../public/config/actions.json', import.meta.url)));
const participants = ['林', '周', '吴'].map(id => ({ id }));
const source = { id: 'refusal', speaker: '吴', start: 0, end: 3, text: '我暂时不想发言，请先不要点我。' };
const decline = { kind: 'decline_invitation', source_id: source.id, quote: '请先不要点我' };
const apply = (updates, sources = [source], previous, time = 90) => updateAutonomy({ previous, updates, sources, participants, time });
const high = { benefit: 100, disruption: 0, goal_fit: 100, confidence: 100 };
const observe = { strategy: 'observe', benefit: 0, disruption: 0, goal_fit: 0, confidence: 70 };
const invitation = { ...high, strategy: 'invite_quiet_member', target: '吴', utterance: '吴，你愿意补充吗？' };

test('refusal persists beyond recent windows; a group question is still allowed', () => {
  const first = apply([decline]);
  const later = apply([], [], first.state, 600);
  assert.equal(autonomyBlock(invitation, later.state, participants), 'declined_invitation');
  assert.equal(autonomyBlock({ strategy: 'open_new_direction', utterance: '大家还有其他想法吗？' }, later.state, participants), null);
  assert.equal(autonomyBlock({ strategy: 'open_new_direction', utterance: '吴，请补充。' }, later.state, participants), 'protected_name_in_utterance');
});

test('unavailable/future sources, fabricated quotes, and unverified speakers cannot set preferences', () => {
  for (const [updates, sources, reason] of [
    [[decline], [], 'unavailable_source'],
    [[decline], [{ ...source, end: 100 }], 'unavailable_source'],
    [[{ ...decline, quote: '我想要继续发言' }], [source], 'unsupported_quote'],
    [[decline], [{ ...source, speaker: '未识别' }], 'unverified_speaker']
  ]) {
    const result = apply(updates, sources);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected[0].reason, reason);
  }
});

test('only the same member can explicitly resume; ordinary speech does not revoke refusal', () => {
  const first = apply([decline]);
  const other = { id: 'other', speaker: '林', end: 80, text: '我准备好了，可以邀请我。' };
  const update = { kind: 'resume_invitation', source_id: 'other', quote: other.text };
  const second = apply([update], [other], first.state);
  assert.ok(second.state.members['吴']);
  const resumed = apply([{ ...update, source_id: 'ready' }], [{ ...other, id: 'ready', speaker: '吴' }], second.state);
  assert.equal(resumed.state.members['吴'], undefined);
  // Replaying an old model extraction must not restore the revoked refusal.
  assert.equal(apply([decline], [source], resumed.state).rejected[0].reason, 'already_applied');
});

test('quiet requests expire at their exact boundary and do not force an action afterwards', () => {
  const line = { id: 'thinking', speaker: '吴', end: 55, text: '请给我一分钟安静思考，先不要提问。' };
  const update = { kind: 'quiet_period', source_id: line.id, quote: line.text, duration_seconds: 60 };
  const active = apply([update], [line], undefined, 90);
  assert.equal(active.state.quiet['吴'].until, 115);
  assert.equal(autonomyBlock({ strategy: 'sustain_flow' }, active.state, participants), 'requested_quiet_period');
  const expired = apply([], [], active.state, 115);
  assert.equal(autonomyBlock({ strategy: 'sustain_flow' }, expired.state, participants), null);
  assert.equal(autonomyBlock({ strategy: 'observe' }, active.state, participants), null);
  assert.equal(apply([update], [line], expired.state, 120).accepted.length, 0);
});

test('overlapping quiet requests need independent expiry or owner release', () => {
  const sources = [{ id: 'a', speaker: '林', end: 30, text: '请先给我一分钟安静思考。' }, { id: 'b', speaker: '吴', end: 40, text: '也给我两分钟安静思考。' }];
  const updates = sources.map((s, i) => ({ kind: 'quiet_period', source_id: s.id, quote: s.text, duration_seconds: (i + 1) * 60 }));
  const first = apply(updates, sources, undefined, 60);
  const ready = { id: 'ready', speaker: '林', end: 70, text: '我已经想好了，可以继续。' };
  const second = apply([{ kind: 'end_quiet_period', source_id: ready.id, quote: ready.text }], [ready], first.state, 80);
  assert.equal(second.state.quiet['林'], undefined);
  assert.equal(second.state.quiet['吴'].until, 160);
});

test('a blocked highest-scoring candidate does not suppress another eligible group action', () => {
  const obs = { time: 90, suggestedStage: 'diverge', recentTranscript: [source], diagnostics: { discussion_elapsed_seconds: 90, quiet_target: '吴', quiet_seconds: 87, quiet_share: 0 }, metrics: { flow: 50, participation: 50, diversity: 50 } };
  const [event] = sanitizeEvents([{ time: 90, preference_updates: [decline], candidates: [observe, invitation, { ...high, strategy: 'open_new_direction', confidence: 90, utterance: '还有别的方向吗？' }] }], [obs], participants, config);
  assert.equal(event.strategy, 'open_new_direction');
  assert.equal(event.blockedCandidates[0].reason, 'declined_invitation');
});

test('a high-utility but low-confidence proposal cannot hide an eligible alternative', () => {
  const selection = selectCandidate({ candidates: [observe, { ...high, strategy: 'sustain_flow', confidence: 55 }, { ...high, strategy: 'open_new_direction', benefit: 80, confidence: 70 }] }, new Set(), config);
  assert.equal(selection.selected.strategy, 'open_new_direction');
});

test('one participant cannot be labelled relatively less involved than others', () => {
  const session = { transcript: [{ id: 'hello', speaker: '林', start: 1, end: 10, text: '现在开始讨论。' }], participants: [{ id: '林' }], duration: 120, config };
  const obs = buildObservations(session).find(o => o.time === 90);
  const [event] = sanitizeEvents([{ time: 90, candidates: [observe, { ...invitation, target: '林' }] }], [obs], session.participants, config);
  assert.equal(event.strategy, 'observe');
  assert.equal(event.blockedCandidates[0].reason, 'insufficient_relative_participation_evidence');
});

test('causal model path extracts from all new sources and carries refusal past eight recent turns', async () => {
  const transcript = [source, ...Array.from({ length: 10 }, (_, i) => ({ id: `dense-${i}`, start: 4 + i * 2, end: 5 + i * 2, speaker: i % 2 ? '林' : '周', text: '我们讨论共享书架。' })), { id: 'later', start: 60, end: 80, speaker: '林', text: '还有预约方案。' }];
  const provider = fauxProvider(), responses = [];
  const reads = ['observe_discussion_window', 'get_participation_metrics', 'get_flow_metrics', 'get_diversity_metrics', 'read_recent_memory', 'check_intervention_cooldown'];
  const actions = ['propose_intervention', 'generate_robot_action', 'dispatch_core_action', 'dispatch_pod_feedback', 'record_expected_effect'];
  for (const time of [0, 30, 60, 90, 120]) {
    const params = { summary: '测试', events: [{ time, stage_recommendation: 'diverge', evidence: [], missing_evidence: [], reviewed_source_ids: transcript.filter(line => line.end <= time && line.end > time - 30).map(line => line.id), preference_updates: time === 30 ? [decline] : [], candidates: time >= 90 ? [observe, invitation] : [observe] }] };
    for (const calls of [reads.map(t => [t, {}]), [['evaluate_candidates', params]], actions.map(t => [t, {}])]) responses.push(fauxAssistantMessage(calls.map(([t, p], i) => fauxToolCall(t, p, { id: `${time}-${responses.length}-${i}` })), { stopReason: 'toolUse' }));
  }
  provider.setResponses(responses);
  const result = await runAIAgent({ transcript, participants, duration: 120, config, streamFn: provider.provider.streamSimple, modelDefinition: provider.getModel() });
  assert.equal(result.events.find(e => e.time === 30).preferenceAudit.accepted.length, 1);
  assert.ok(result.events.at(-1).autonomyState.members['吴']);
  assert.ok(result.events.every(e => e.strategy === 'observe'));
  assert.ok(result.events.find(e => e.time === 90).blockedCandidates.some(c => c.reason === 'declined_invitation'));
});

test('candidate evaluation cannot silently skip reviewing newly completed sources', async () => {
  const observation = { time: 30, suggestedStage: 'diverge', recentTranscript: [source], preferenceSources: [source], diagnostics: { discussion_elapsed_seconds: 30 }, metrics: { participation: 50, flow: 50, diversity: 50 } };
  const toolkit = createBatchToolset({ observations: [observation], participants, config });
  for (const tool of toolkit.tools.slice(0, 6)) await tool.execute('read', {});
  const evaluate = toolkit.tools.find(t => t.name === 'evaluate_candidates');
  const params = { summary: '检查', events: [{ time: 30, candidates: [observe], preference_updates: [] }] };
  const skipped = await evaluate.execute('skip', params);
  assert.equal(skipped.isError, true);
  assert.equal(toolkit.state.analysis, null);
  params.events[0].reviewed_source_ids = [source.id];
  assert.notEqual((await evaluate.execute('review', params)).isError, true);
  assert.deepEqual(toolkit.state.analysis.events[0].autonomyState.reviewedSourceIds, [source.id]);
});

test('source timestamps determine update order even when model lists resumption first', () => {
  const ready = { id: 'ready', speaker: '吴', end: 20, text: '我准备好了，可以点我发言。' };
  const result = apply([{ kind: 'resume_invitation', source_id: ready.id, quote: ready.text }, decline], [source, ready]);
  assert.equal(result.state.members['吴'], undefined);
});

test('live preferences use the session clock rather than wall-clock expiry', () => {
  const thinking = { id: 'think', start: 45, end: 55, speaker: '吴', text: '请给我一分钟安静思考。' };
  const raw = { candidates: [observe, { ...high, strategy: 'open_new_direction', utterance: '大家还有其他方向吗？' }], preference_updates: [{ kind: 'quiet_period', source_id: 'think', quote: thinking.text, duration_seconds: 60 }], reviewed_source_ids: ['think'] };
  const context = { participants, stage: 'diverge', transcript: [thinking], memory: [], config };
  const active = sanitizeLiveDecision(raw, { ...context, sessionTime: 90 });
  assert.equal(active.strategy, 'observe');
  assert.equal(active.autonomyState.quiet['吴'].until, 115);
  const expired = sanitizeLiveDecision({ ...raw, preference_updates: [] }, { ...context, sessionTime: 120, memory: [active] });
  assert.equal(expired.strategy, 'open_new_direction');
  const unclocked = sanitizeLiveDecision(raw, context);
  assert.equal(unclocked.preferenceAudit.accepted.length, 0);
});

test('short explicit refusals such as 别点我 retain their exact evidence', () => {
  const short = { ...source, text: '别点我' };
  const result = apply([{ ...decline, quote: short.text }], [short]);
  assert.equal(result.state.members['吴'].quote, '别点我');
});

test('tool chain resumes after premature plain text, without restarting its completed steps', async () => {
  const provider = fauxProvider();
  const observation = { time: 90, suggestedStage: 'diverge', recentTranscript: [], preferenceSources: [], diagnostics: { discussion_elapsed_seconds: 90 }, metrics: { participation: 50, flow: 50, diversity: 50 } };
  const reads = ['observe_discussion_window', 'get_participation_metrics', 'get_flow_metrics', 'get_diversity_metrics', 'read_recent_memory', 'check_intervention_cooldown'];
  const actions = ['propose_intervention', 'generate_robot_action', 'dispatch_core_action', 'dispatch_pod_feedback', 'record_expected_effect'];
  const calls = (names, prefix) => fauxAssistantMessage(names.map((name, i) => fauxToolCall(name, {}, { id: `${prefix}-${i}` })), { stopReason: 'toolUse' });
  const evaluation = { summary: '检查', events: [{ time: 90, stage_recommendation: 'diverge', evidence: [], missing_evidence: [], reviewed_source_ids: [], preference_updates: [], candidates: [observe] }] };
  provider.setResponses([calls(reads, 'read'), fauxAssistantMessage([fauxToolCall('evaluate_candidates', evaluation, { id: 'eval' })], { stopReason: 'toolUse' }), fauxAssistantMessage('已完成判断。'), calls(actions, 'action')]);
  const result = await runPiBatchAgent({ observations: [observation], participants, memory: [], config, streamFn: provider.provider.streamSimple, modelDefinition: provider.getModel() });
  assert.equal(result.execution.recorded, true);
  assert.equal(result.trace.filter(e => e.type === 'harness_continuation').length, 1);
  assert.equal(result.trace.filter(e => e.tool === 'evaluate_candidates' && e.type === 'tool_execution_start').length, 1);
});

test('repeated text-only completion is bounded and exposes a diagnostic trace', async () => {
  const provider = fauxProvider();
  provider.setResponses([fauxAssistantMessage('完成。'), fauxAssistantMessage('完成。'), fauxAssistantMessage('完成。')]);
  await assert.rejects(runPiBatchAgent({ observations: [], participants, memory: [], config, streamFn: provider.provider.streamSimple, modelDefinition: provider.getModel() }), error => {
    assert.match(error.message, /2次续做/);
    assert.equal(error.trace.filter(e => e.type === 'harness_continuation').length, 2);
    return true;
  });
});
