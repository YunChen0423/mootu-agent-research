import { annotateTranscript, EVENT_TYPES } from './session-harness.js';
export class InputError extends Error { constructor(message) { super(message); this.status = 400; } }
export function validateSession(payload) {
  if (!payload || !Array.isArray(payload.transcript) || !payload.transcript.length) throw new InputError('transcript 必须是非空数组');
  const ids = new Set();
  const lines = payload.transcript.map((line, index) => {
    if (!line || !Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < 0 || line.end <= line.start) throw new InputError(`transcript[${index}] 时间必须为秒数，且 0 <= start < end`);
    if (typeof line.speaker !== 'string' || !line.speaker.trim() || typeof line.text !== 'string') throw new InputError(`transcript[${index}] 缺少 speaker/text`);
    if (line.type && !Object.values(EVENT_TYPES).includes(line.type)) throw new InputError(`transcript[${index}] type 无效`);
    const id = line.id || `evt-${index+1}`;
    if (ids.has(String(id))) throw new InputError('事件 id 必须唯一');
    ids.add(String(id));
    if (line.data?.candidates) {
      const options = line.data.candidates;
      if (!Array.isArray(options) || options.length < 2 || options.some((option) => typeof option.id !== 'string' || !option.id.trim() || typeof option.label !== 'string' || !option.label.trim()) || new Set(options.map((option) => option.id)).size !== options.length) throw new InputError('候选需要至少两项，id 唯一且 label 非空');
    }
    if (line.data?.vote && (typeof line.data.vote.participantId !== 'string' || typeof line.data.vote.candidateId !== 'string')) throw new InputError('投票必须包含 participantId 和 candidateId');
    return line;
  });
  if (payload.participants != null && !Array.isArray(payload.participants)) throw new InputError('participants 必须是数组');
  const participants = payload.participants || [];
  const participantIds = participants.map((person) => person?.id);
  if (participantIds.some((id) => typeof id !== 'string' || !id.trim()) || new Set(participantIds).size !== participantIds.length) throw new InputError('participants.id 必须为非空且唯一的字符串');
  const end = Math.max(...lines.map((line) => line.end));
  const duration = payload.duration ?? end;
  if (!Number.isFinite(duration) || duration < end) throw new InputError('duration 必须是覆盖全部事件的秒数');
  const discussionStart = payload.discussionStart ?? 0;
  if (!Number.isFinite(discussionStart) || discussionStart < 0 || discussionStart > duration) throw new InputError('discussionStart 超出会话范围');
  const transcript = annotateTranscript(lines);
  const speakers = transcript.filter((line) => line.type === EVENT_TYPES.PARTICIPANT_UTTERANCE).map((line) => line.speaker);
  if (participants.length && speakers.some((id) => !participantIds.includes(id))) throw new InputError('逐字稿出现参与者名单以外的发言者');
  return { transcript, participants, duration, discussionStart };
}
