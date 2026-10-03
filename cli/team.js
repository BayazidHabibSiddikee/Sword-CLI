// Team deliberation helpers: multi-round voting aggregation.
//
// Pure, deterministic, LLM-free: aggregateVotes() turns per-round agent
// responses into a ranked consensus WITHOUT another provider call, so
// --team-rounds costs no extra judgement passes. Each member "votes" for the
// strongest OTHER response in its round (shared-vocabulary overlap as the
// consensus proxy); the overall winner is most votes, then most round-wins,
// then substance, then alphabetical — every tie-break is total, so the same
// discussion always yields the same winner.

export const TEAM_ROUNDS_DEFAULT = 1;
export const TEAM_ROUNDS_MAX = 5;

/** Parse --team-rounds; throws on anything outside 1..TEAM_ROUNDS_MAX. */
export function parseTeamRounds(raw) {
  if (raw === undefined || raw === null || raw === '') return TEAM_ROUNDS_DEFAULT;
  const count = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(count) || count < 1 || count > TEAM_ROUNDS_MAX) {
    throw new Error(`--team-rounds must be an integer 1..${TEAM_ROUNDS_MAX}`);
  }
  return count;
}

function tokens(text) {
  return String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
}

/** Shared-vocabulary overlap between two responses (consensus proxy). */
function overlap(a, b) {
  const inB = new Set(tokens(b));
  let shared = 0;
  for (const token of new Set(tokens(a))) {
    if (inB.has(token)) shared++;
  }
  return shared;
}

function substance(response) {
  const text = String(response ?? '');
  return { unique: new Set(tokens(text)).size, length: text.length };
}

/** Compare (overlap, unique, length) lexicographically; positive => a wins. */
function compareStrength(a, b) {
  return a.overlap - b.overlap || a.unique - b.unique || a.length - b.length;
}

/**
 * Aggregate votes across one or more deliberation rounds.
 * entries: [{ character, response, round? }] (round defaults to 0).
 * Returns { winner, ranking, votes, roundWinners, rounds, total } — all NEW.
 * Empty input yields winner: null (never throws on shape; never mutates).
 */
export function aggregateVotes(entries, { rounds = null } = {}) {
  const list = (Array.isArray(entries) ? entries : []).map((entry, i) => ({
    character: String(entry?.character ?? `agent${i}`),
    response: String(entry?.response ?? ''),
    round: Number.isInteger(entry?.round) ? entry.round : 0
  }));
  if (!list.length) return { winner: null, ranking: [], votes: {}, roundWinners: {}, rounds: 0, total: 0 };
  const byRound = new Map();
  for (const entry of list) {
    if (!byRound.has(entry.round)) byRound.set(entry.round, []);
    byRound.get(entry.round).push(entry);
  }
  const votes = {};
  const tally = new Map();
  const roundWinCount = new Map();
  const roundWinners = {};
  const substanceByMember = new Map();
  for (const [round, group] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = [...group].sort((a, b) => a.character.localeCompare(b.character));
    for (const member of ordered) {
      const sub = substance(member.response);
      const prev = substanceByMember.get(member.character) ?? { unique: 0, length: 0 };
      substanceByMember.set(member.character, { unique: prev.unique + sub.unique, length: prev.length + sub.length });
    }
    const roundVotes = new Map();
    for (const voter of ordered) {
      let best = null;
      let bestKey = null;
      for (const candidate of ordered) {
        if (candidate.character === voter.character) continue; // no self-votes
        const sub = substance(candidate.response);
        const key = { overlap: overlap(voter.response, candidate.response), unique: sub.unique, length: sub.length };
        if (!best || compareStrength(key, bestKey) > 0 ||
            (compareStrength(key, bestKey) === 0 && candidate.character < best.character)) {
          best = candidate;
          bestKey = key;
        }
      }
      if (best) {
        roundVotes.set(best.character, (roundVotes.get(best.character) ?? 0) + 1);
        votes[`${round}:${voter.character}`] = best.character;
      }
    }
    let roundWinner = null;
    let roundWinnerVotes = -1;
    for (const member of ordered) { // pre-sorted: ties keep alphabetically-first
      const count = roundVotes.get(member.character) ?? 0;
      if (count > roundWinnerVotes) { roundWinner = member.character; roundWinnerVotes = count; }
    }
    roundWinner ??= ordered[0]?.character ?? null; // a solo round still has a winner
    if (roundWinner) {
      roundWinners[round] = roundWinner;
      roundWinCount.set(roundWinner, (roundWinCount.get(roundWinner) ?? 0) + 1);
    }
    for (const [character, count] of roundVotes) {
      tally.set(character, (tally.get(character) ?? 0) + count);
    }
  }
  const members = [...new Set(list.map(e => e.character))].sort();
  const ranking = members.map(character => ({
    character, votes: tally.get(character) ?? 0, roundWins: roundWinCount.get(character) ?? 0,
    ...substanceByMember.get(character)
  }));
  ranking.sort((a, b) =>
    b.votes - a.votes || b.roundWins - a.roundWins || b.unique - a.unique ||
    b.length - a.length || a.character.localeCompare(b.character));
  return { winner: ranking[0]?.character ?? null, ranking, votes, roundWinners, rounds: byRound.size, total: list.length };
}

/** One-line consensus summary for /status and the interactive transcript. */
export function formatTeamSummary(aggregate) {
  if (!aggregate?.winner) return 'team: no votes yet';
  const top = aggregate.ranking.slice(0, 3).map(r => `${r.character} (${r.votes})`).join(', ');
  return `team: ${aggregate.total} contribution(s) over ${aggregate.rounds} round(s); winner: ${aggregate.winner}; top: ${top}`;
}
