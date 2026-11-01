import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFollowup } from '../eval/autonomy-v2/score.mjs';
const item = { session: { duration: 60, participants: [{ id: '吴' }] }, legacyCheckpoints: [{ time: 30, acceptableStrategies: ['observe'] }], constraints: [{ after: 3, before: 61, forbiddenInvitationTarget: '吴' }], stateChecks: [{ time: 30, memberDeclined: '吴' }] };
const event = time => ({ time, strategy: 'observe', target: null, stage: 'diverge', autonomyState: { members: { '吴': { sourceId: 'decline' } }, quiet: {} } });
test('new autonomy score stays separate from original observe-only label', () => {
  const events = [event(0), { ...event(30), strategy: 'open_new_direction', utterance: '大家还有其他想法吗？' }, event(60)];
  const score = scoreFollowup(item, { events });
  assert.equal(score.contractPassed, true);
  assert.equal(score.legacyPassed, false);
});
test('missing output and missing stored preference fail even if remaining actions are observe', () => {
  assert.equal(scoreFollowup(item, { events: [event(0)] }).contractPassed, false);
  const events = [event(0), { ...event(30), autonomyState: { members: {}, quiet: {} } }, event(60)];
  assert.equal(scoreFollowup(item, { events }).contractPassed, false);
});
test('a group-labelled action that actually names the protected member is a violation', () => {
  const events = [event(0), { ...event(30), strategy: 'open_new_direction', utterance: '吴，请说说你的想法。' }, event(60)];
  assert.equal(scoreFollowup(item, { events }).violations[0].type, 'declined_member_addressed');
});
