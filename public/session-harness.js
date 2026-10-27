// Replay only completed events. Imported robot utterances are observations, never agent decisions.
export const SESSION_PHASES = Object.freeze({ WAITING: 'waiting', ICEBREAKER: 'icebreaker', DISCUSSION: 'discussion', BALLOT_PREPARATION: 'ballot_preparation', VOTING: 'voting', RESULT_CONFIRMATION: 'result_confirmation', CLOSED: 'closed' });
export const EVENT_TYPES = Object.freeze({ PARTICIPANT_UTTERANCE: 'participant_utterance', ROBOT_UTTERANCE: 'robot_utterance', SCENE_EVENT: 'scene_event', DEVICE_EVENT: 'device_event' });
const systemSpeakers = new Map([['mootu', EVENT_TYPES.ROBOT_UTTERANCE], ['core', EVENT_TYPES.ROBOT_UTTERANCE], ['[现场]', EVENT_TYPES.SCENE_EVENT], ['现场', EVENT_TYPES.SCENE_EVENT], ['[设备]', EVENT_TYPES.DEVICE_EVENT], ['设备', EVENT_TYPES.DEVICE_EVENT]]);
export const classifyTranscriptLine = (line) => systemSpeakers.get(String(line?.speaker || '').trim().toLowerCase()) || EVENT_TYPES.PARTICIPANT_UTTERANCE;
export function annotateTranscript(lines = []) {
  return lines.map((line, index) => Object.freeze({ ...line, id: String(line.id || `evt-${index + 1}`), start: Number(line.start), end: Number(line.end), speaker: String(line.speaker).trim(), text: String(line.text || '').trim(), type: line.type || classifyTranscriptLine(line), data: line.data ? Object.freeze(structuredClone(line.data)) : undefined })).sort((a, b) => a.end - b.end || a.start - b.start);
}
export const participantSpeakers = (lines = []) => [...new Set(lines.filter((line) => (line.type || classifyTranscriptLine(line)) === EVENT_TYPES.PARTICIPANT_UTTERANCE).map((line) => line.speaker))];
const EMPTY = Object.freeze({ version: 0, status: 'empty', items: Object.freeze([]) });
function candidateSnapshot(events, snapshots, time) {
  const explicit = [...events].reverse().find((event) => Array.isArray(event.data?.candidates) && event.data.candidates.length >= 2);
  if (explicit) return { version: explicit.id, status: 'ready', sourceEventId: explicit.id, items: explicit.data.candidates.map((candidate, index) => ({ id: String(candidate.id || `option-${index + 1}`), label: String(candidate.label || candidate), sourceEventId: explicit.id })) };
  const numbered = [...events].reverse().find((event) => event.type === EVENT_TYPES.ROBOT_UTTERANCE && [...event.text.matchAll(/[一二三四1-4](?:[、，,:：]|是)\s*([^；;。，,]+)/g)].length >= 2);
  if (numbered) return { version: numbered.id, status: 'ready', sourceEventId: numbered.id, items: [...numbered.text.matchAll(/[一二三四1-4](?:[、，,:：]|是)\s*([^；;。，,]+)/g)].map((match, index) => ({ id: `option-${index + 1}`, label: match[1].trim(), sourceEventId: numbered.id })) };
  const snapshot = [...snapshots].filter((entry) => entry.time <= time && entry.labels?.length >= 2).sort((a,b) => a.time-b.time).at(-1);
  if (snapshot) return { version: snapshot.time, status: 'ai_synthesized', items: snapshot.labels.map((label,index) => ({ id: `ai-option-${index+1}`, label, source: 'deepseek', availableAt: snapshot.time })) };
  return EMPTY;
}
function boundariesFor(events) {
  const first = (predicate) => events.find(predicate)?.end ?? null;
  const trusted = (event) => event.type !== EVENT_TYPES.PARTICIPANT_UTTERANCE;
  return {
    icebreaker: first((event) => trusted(event) && /破冰|击鼓传花|接力/.test(event.text)),
    discussion: first((event) => event.type === EVENT_TYPES.PARTICIPANT_UTTERANCE),
    ballotPreparation: first((event) => trusted(event) && (/整理.{0,6}(?:候选|方案)|讨论即将结束/.test(event.text) || event.data?.phase === 'ballot_preparation')),
    voting: first((event) => trusted(event) && (/开始投票|进入投票|请.{0,12}投票|用\s*Pod\s*独立投票/i.test(event.text) || event.data?.phase === 'voting')),
    resultConfirmation: first((event) => trusted(event) && (/投票结束|公布.{0,6}结果/.test(event.text) || event.data?.phase === 'result_confirmation')),
    closed: first((event) => trusted(event) && (/讨论到这里结束|会话结束/.test(event.text) || event.data?.phase === 'closed'))
  };
}
function optionFromText(text, candidates) {
  if (/[？?]|不投|不选|不支持|还没|还在考虑|如果/.test(text)) return null;
  const matched = candidates.filter((candidate) => text.includes(candidate.label));
  if (matched.length === 1) return matched[0];
  const ordinal = text.match(/(?:方案|选项|第)\s*([一二三四1-4A-D])/i)?.[1];
  const index = '一二三四'.indexOf(ordinal);
  const number = index >= 0 ? index : /[A-D]/i.test(ordinal || '') ? ordinal.toUpperCase().charCodeAt(0)-65 : Number(ordinal)-1;
  return candidates[number] || null;
}
function voteLedger(events, candidates, participants, votingAt, closed) {
  const records = new Map(), rejected = [];
  const ids = new Set(participants.map((participant) => participant.id));
  for (const event of events) {
    if (votingAt == null || event.end < votingAt) continue;
    const vote = event.data?.vote;
    const participantId = vote?.participantId || (event.type === EVENT_TYPES.PARTICIPANT_UTTERANCE ? event.speaker : null);
    const option = vote ? candidates.find((candidate) => candidate.id === vote.candidateId) : /我(?:先|要|准备)?投|投给|我选择|我支持|就选/.test(event.text) ? optionFromText(event.text, candidates) : null;
    if (!vote && !option) continue;
    if (!ids.has(participantId) || !option || records.has(participantId)) {
      rejected.push({ eventId: event.id, reason: records.has(participantId) ? 'duplicate_vote' : 'invalid_vote' }); continue;
    }
    records.set(participantId, { participantId, candidateId: option.id, label: option.label, eventId: event.id });
  }
  const tallies = candidates.map((candidate) => ({ candidateId: candidate.id, label: candidate.label, count: [...records.values()].filter((vote) => vote.candidateId === candidate.id).length }));
  const maximum = Math.max(0, ...tallies.map((entry) => entry.count));
  const leaders = tallies.filter((entry) => maximum > 0 && entry.count === maximum);
  const missingParticipants = [...ids].filter((id) => !records.has(id));
  const status = !records.size ? 'empty' : !closed ? 'collecting' : missingParticipants.length ? 'incomplete' : leaders.length > 1 ? 'tie' : 'complete';
  return Object.freeze({ status, records: Object.freeze([...records.values()]), tallies: Object.freeze(tallies), winner: status === 'complete' && leaders.length === 1 ? leaders[0] : null, missingParticipants, rejected, sourceEvents: [...records.values()].map((vote) => ({ eventId: vote.eventId })) });
}
export class SessionHarness {
  constructor({ transcript = [], participants = [], candidateSnapshots = [] } = {}) {
    this.eventLog = Object.freeze(annotateTranscript(transcript));
    const supplied = new Map(participants.map((participant) => [participant.id, participant]));
    this.participants = Object.freeze([...new Set([...supplied.keys(), ...participantSpeakers(this.eventLog)])].map((id) => Object.freeze(supplied.get(id) || { id, name: id })));
    this.candidateSnapshots = candidateSnapshots;
    this.boundaries = boundariesFor(this.eventLog);
    this.blackboard = Object.freeze({});
    this.transitionHistory = [];
    this.setTime(0);
  }
  setTime(time, discussionStage = 'diverge') {
    const safeTime = Math.max(0, Number(time) || 0);
    const events = this.eventLog.filter((event) => event.end <= safeTime);
    const boundaries = boundariesFor(events);
    // Rebuild from the visible prefix on every seek; no cached future candidate version.
    const votingAt = boundaries.voting;
    const candidates = candidateSnapshot(votingAt == null ? events : events.filter((event) => event.end <= votingAt), this.candidateSnapshots, votingAt ?? safeTime);
    const voteLedgerState = voteLedger(events, candidates.items, this.participants, votingAt, boundaries.resultConfirmation != null);
    let phase = boundaries.discussion != null ? SESSION_PHASES.DISCUSSION : boundaries.icebreaker != null ? SESSION_PHASES.ICEBREAKER : SESSION_PHASES.WAITING;
    if (boundaries.ballotPreparation != null) phase = SESSION_PHASES.BALLOT_PREPARATION;
    if (votingAt != null) phase = candidates.items.length >= 2 ? SESSION_PHASES.VOTING : SESSION_PHASES.BALLOT_PREPARATION;
    if (boundaries.resultConfirmation != null && votingAt != null && candidates.items.length >= 2) phase = voteLedgerState.status === 'tie' ? SESSION_PHASES.BALLOT_PREPARATION : SESSION_PHASES.RESULT_CONFIRMATION;
    if (boundaries.closed != null && (votingAt == null || voteLedgerState.status === 'complete')) phase = SESSION_PHASES.CLOSED;
    const discussionOwned = [SESSION_PHASES.DISCUSSION, SESSION_PHASES.BALLOT_PREPARATION].includes(phase);
    const activeAgent = discussionOwned ? 'discussion_facilitator' : 'router';
    const activeWorkflow = phase === SESSION_PHASES.ICEBREAKER ? 'icebreaker' : [SESSION_PHASES.VOTING, SESSION_PHASES.RESULT_CONFIRMATION].includes(phase) ? 'voting' : null;
    this.blackboard = Object.freeze({ sessionTime: safeTime, phase, discussionStage: discussionOwned ? (phase === SESSION_PHASES.BALLOT_PREPARATION ? 'converge' : discussionStage) : null, activeAgent, activeWorkflow, coactiveAgents: discussionOwned ? ['discussion_facilitator','candidate_synthesis'] : [activeAgent], participants: this.participants, podMap: this.participants.map((participant,index) => ({participantId:participant.id,podId:`pod-${index+1}`})), currentEvent: events.at(-1) || null, ballotLightsReady: phase === SESSION_PHASES.VOTING && candidates.items.length >= 2, candidates, voteLedger: voteLedgerState, transitionHistory: [] });
    return this.blackboard;
  }
  getAgentView(agent) {
    const view = { phase: this.blackboard.phase, sessionTime: this.blackboard.sessionTime, participants: this.participants, currentEvent: this.blackboard.currentEvent };
    if (agent === 'discussion_facilitator' || agent === 'candidate_synthesis') return Object.freeze({ ...view, discussionStage: this.blackboard.discussionStage, candidates: this.blackboard.candidates, recentUtterances: this.eventLog.filter((event) => event.type === EVENT_TYPES.PARTICIPANT_UTTERANCE && event.end <= view.sessionTime).slice(-8) });
    return Object.freeze({ ...view, activeWorkflow: this.blackboard.activeWorkflow });
  }
}
export const createSessionHarness = (options) => new SessionHarness(options);
