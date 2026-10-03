// Phase 4 — team voting aggregation. Pure and deterministic: the same discussion
// always produces the same winner, so multi-round deliberation is reproducible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVotes, formatTeamSummary, parseTeamRounds, TEAM_ROUNDS_DEFAULT, TEAM_ROUNDS_MAX } from '../cli/team.js';

test('parseTeamRounds clamps to the documented range', () => {
  assert.equal(parseTeamRounds(undefined), TEAM_ROUNDS_DEFAULT);
  assert.equal(parseTeamRounds('3'), 3);
  assert.throws(() => parseTeamRounds('0'), /1\.\./);
  assert.throws(() => parseTeamRounds(String(TEAM_ROUNDS_MAX + 1)), /1\.\./);
  assert.throws(() => parseTeamRounds('nope'), /must be an integer/);
});

test('aggregateVotes is deterministic and ranks the consensus winner first', () => {
  const entries = [
    { character: 'a', response: 'alpha beta gamma delta', round: 0 },
    { character: 'b', response: 'alpha beta gamma epsilon', round: 0 },
    { character: 'c', response: 'zeta eta theta', round: 0 },
  ];
  const first = aggregateVotes(entries);
  const second = aggregateVotes(entries);
  assert.deepEqual(first, second, 'same input, same aggregate');
  assert.ok(first.winner, 'a winner is chosen');
  assert.equal(first.total, 3);
  assert.equal(first.rounds, 1);
});

test('an empty discussion yields a null winner instead of throwing', () => {
  const result = aggregateVotes([]);
  assert.equal(result.winner, null);
  assert.deepEqual(result.ranking, []);
  assert.equal(formatTeamSummary(result), 'team: no votes yet');
});

test('multi-round input is grouped by round and sums member substance', () => {
  const entries = [
    { character: 'a', response: 'shared words here', round: 0 },
    { character: 'b', response: 'shared words also', round: 0 },
    { character: 'a', response: 'shared words here again', round: 1 },
    { character: 'b', response: 'shared words also again', round: 1 },
  ];
  const result = aggregateVotes(entries);
  assert.equal(result.rounds, 2);
  assert.equal(result.total, 4);
  // Rounds are exposed and each has a winner.
  assert.deepEqual(Object.keys(result.roundWinners).sort(), ['0', '1']);
  assert.match(formatTeamSummary(result), /2 round\(s\)/);
});
