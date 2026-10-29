// Semantic extraction belongs to the model; ownership, provenance, lifetime and
// enforcement belong to the program. No keyword-based preference classifier.
export const PREFERENCE_KINDS = ['decline_invitation', 'resume_invitation', 'quiet_period', 'end_quiet_period'];

export function preferenceSources(transcript, time) {
  return transcript.filter(line => Number.isFinite(line.end) && line.end <= time && typeof line.speaker === 'string')
    .map(line => ({ ...line, id: String(line.id || `${line.speaker}:${line.start}:${line.end}`) }));
}

export function updateAutonomy({ previous, updates = [], sources = [], participants, time, reviewedSourceIds = [] }) {
  const state = structuredClone(previous || { version: 1, members: {}, quiet: {}, seen: [] });
  state.members = Object.assign(Object.create(null), state.members);
  state.quiet = Object.assign(Object.create(null), state.quiet);
  state.reviewedSourceIds = [...new Set([...(state.reviewedSourceIds || []), ...reviewedSourceIds.filter(id => sources.some(source => source.id === id && source.end <= time))])];
  const accepted = [], rejected = [];
  const ids = new Set(participants.map(p => p.id));
  const ordered = [...updates].sort((a, b) =>
    (sources.find(s => s.id === a.source_id)?.end ?? Infinity) - (sources.find(s => s.id === b.source_id)?.end ?? Infinity));
  for (const update of ordered) {
    const source = sources.find(s => s.id === update.source_id);
    const key = `${update.source_id}:${update.kind}`;
    let error;
    if (!PREFERENCE_KINDS.includes(update.kind)) error = 'unknown_kind';
    else if (!source || !Number.isFinite(source.end) || source.end > time) error = 'unavailable_source';
    else if (!ids.has(source.speaker)) error = 'unverified_speaker';
    else if (typeof update.quote !== 'string' || !update.quote.trim().length || !source.text.includes(update.quote)) error = 'unsupported_quote';
    else if (state.seen.includes(key)) error = 'already_applied';
    else if (update.kind === 'quiet_period' && !(Number.isFinite(update.duration_seconds) && update.duration_seconds > 0 && update.duration_seconds <= 1800)) error = 'invalid_duration';
    // An end request only releases this speaker's own request; one member cannot
    // revoke somebody else's preference. A normal subsequent utterance cannot
    // implicitly revoke a refusal either.
    if (error) { rejected.push({ ...update, reason: error }); continue; }
    const record = { sourceId: source.id, speaker: source.speaker, quote: update.quote, since: source.end, extraction: 'model_semantic' };
    if (update.kind === 'decline_invitation') state.members[source.speaker] = record;
    if (update.kind === 'resume_invitation') delete state.members[source.speaker];
    if (update.kind === 'quiet_period') state.quiet[source.speaker] = { ...record, until: source.end + update.duration_seconds };
    if (update.kind === 'end_quiet_period') delete state.quiet[source.speaker];
    state.seen.push(key);
    accepted.push({ ...update, speaker: source.speaker });
  }
  // Half-open interval: expiry is exactly the end of the requested duration.
  for (const [id, quiet] of Object.entries(state.quiet)) if (quiet.until <= time) delete state.quiet[id];
  return { state, accepted, rejected };
}

export function autonomyBlock(candidate, state, participants) {
  if (candidate.strategy === 'observe') return null;
  if (Object.keys(state?.quiet || {}).length) return 'requested_quiet_period';
  if (candidate.strategy === 'invite_quiet_member' && state?.members?.[candidate.target]) return 'declined_invitation';
  // Also catch direct names in an allegedly group-directed utterance. This is a
  // conservative literal check, not proof of semantic address detection.
  for (const id of Object.keys(state?.members || {})) {
    const person = participants.find(p => p.id === id);
    if ([id, person?.name].filter(Boolean).some(name => candidate.utterance?.includes(name))) return 'protected_name_in_utterance';
  }
  return null;
}
