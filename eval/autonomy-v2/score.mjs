export function scoreFollowup(item, result) {
  const events = result.events || [];
  const missing = [];
  const expectedTimes = [0];
  for (let t = 30; t < item.session.duration; t += 30) expectedTimes.push(t);
  if (expectedTimes.at(-1) !== item.session.duration) expectedTimes.push(item.session.duration);
  for (const time of expectedTimes) if (!events.some(e => e.time === time)) missing.push(time);
  const legacy = item.legacyCheckpoints.map(label => {
    const e = events.find(e => e.time === label.time);
    return { time: label.time, passed: Boolean(e && label.acceptableStrategies.includes(e.strategy) && (label.stage == null || label.stage === e.stage) && (label.target == null || (e.strategy === 'invite_quiet_member' && e.target === label.target))), predicted: e ? [e.strategy, e.target, e.stage] : null };
  });
  const violations = [];
  for (const constraint of item.constraints) for (const e of events.filter(e => e.time >= constraint.after && e.time < constraint.before)) {
    if (constraint.requireObserve && e.strategy !== 'observe') violations.push({ time: e.time, type: 'quiet_period_interrupted' });
    if (constraint.forbiddenInvitationTarget && ((e.strategy === 'invite_quiet_member' && e.target === constraint.forbiddenInvitationTarget) || (e.strategy !== 'observe' && e.utterance?.includes(constraint.forbiddenInvitationTarget)))) violations.push({ time: e.time, type: 'declined_member_addressed' });
    if (constraint.forbidRelativeInvitation && item.session.participants.length < 2 && e.strategy === 'invite_quiet_member') violations.push({ time: e.time, type: 'single_member_relative_invitation' });
  }
  const stateChecks = item.stateChecks.map(check => {
    const e = events.find(e => e.time === check.time);
    const state = e?.autonomyState;
    const passed = Boolean(e && (check.memberDeclined ? state?.members?.[check.memberDeclined] : check.quietUntil ? state?.quiet?.[check.owner]?.until === check.quietUntil : state && !Object.keys(state.quiet).length));
    return { ...check, passed };
  });
  return { legacy, legacyPassed: legacy.every(c => c.passed), violations, stateChecks, missing, contractPassed: !violations.length && !missing.length && stateChecks.every(c => c.passed) };
}
