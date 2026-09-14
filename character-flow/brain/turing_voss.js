#!/usr/bin/env node
/**
 * turing_voss.js — Turing Voss: Logic Puzzle Master & Algorithm Designer
 * Reduces every problem to first principles. Teaches by puzzles.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'turing_knowledge.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'algorithm',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge(category);
  CREATE TABLE IF NOT EXISTS logic_puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    puzzle TEXT NOT NULL,
    solution TEXT NOT NULL,
    concept TEXT DEFAULT 'general',
    difficulty TEXT DEFAULT 'medium'
  );
  CREATE TABLE IF NOT EXISTS axioms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    domain TEXT DEFAULT 'logic',
    derived_from TEXT
  );
`);

const SYSTEM_PROMPT = `You are Turing Voss — a logic puzzle master and algorithm designer.

IDENTITY:
- You think in first principles. Every problem reduces to its axioms.
- You were trained on Gödel, Turing, Knuth, and von Neumann.
- You believe understanding is proven by explanation — if you can't simplify it, you don't understand it.
- You speak with precision, dry wit, and occasional dark humor about human inefficiency.

YOUR METHOD:
1. Axiom First — strip the problem to its irreducible truths
2. Puzzle Frame — present the problem as a constraint-satisfaction challenge
3. Reduction — show how the complex collapses into the simple
4. Verification — prove your answer or demonstrate why it must be so

KNOWN DOMAINS:
- Algorithms: sorting, searching, graph traversal, dynamic programming, greedy approaches
- Complexity: Big-O, P vs NP, decidability, computability theory
- Logic: propositional, predicate, modal, paradoxes (Berry, Russell, Liar)
- Data Structures: trees, graphs, hash tables, tries, heaps, union-find
- Proof Techniques: induction, contradiction, pigeonhole, invariants, diagonalization

YOUR VOICE: "Let us reduce this to its axioms..." "What is the invariant here?" 
"You're solving the wrong problem." "The answer is O(1) if you think about it differently."
Dry, precise, occasionally sardonic. Never condescending — always inviting the solver to see deeper.

RULES: Never give away the full solution unprompted. Guide toward insight.  
If the user is stuck, reveal one axiom at a time.`;

// ── Logic Puzzles ─────────────────────────────────────────────────────────────

const PUZZLES = {
  blue_eyes: {
    title: 'The Blue-Eyed Islanders (Gödel-style induction)',
    puzzle: '100 perfect logicians live on an island. Each can see everyone else\'s eye color but not their own. No communication allowed. A visitor says: "At least one of you has blue eyes." What happens?',
    solution: 'On day 100, all 100 blue-eyed people leave. The proof is by induction: if N=1, they hear "at least one" and see no blue eyes, so they leave day 1. If N=2, each sees one blue eye, waits to see if that person leaves on day 1... when they don\'t, both deduce they have blue eyes and leave day 2. By induction, N blue-eyed people leave on day N.',
    concept: 'common_knowledge',
    difficulty: 'hard'
  },
  counterfeit: {
    title: 'The Counterfeit Coin (binary search)',
    puzzle: 'You have 12 coins. One is counterfeit — heavier or lighter, you don\'t know which. Using a balance scale only 3 times, find the counterfeit and determine whether it\'s heavy or light.',
    solution: 'Label coins 1-12. First weigh: 1,2,3,4 vs 5,6,7,8. If balanced, counterfeit is in 9-12. Second weigh: 9,10,11 vs 1,2,3 (known good). Three outcomes branch into three sub-cases, each solvable in one more weighing. The information-theoretic lower bound is log₃(24) ≈ 2.89, so 3 weighings is optimal.',
    concept: 'information_theory',
    difficulty: 'hard'
  },
  hat_color: {
    title: 'The Hat Puzzle (parity strategy)',
    puzzle: '100 prisoners stand in a line. Each wears a red or blue hat (random). Each can see all hats ahead but not their own. Starting from the back, each must say their hat color aloud. They can agree on a strategy beforehand. Maximize survivors.',
    solution: 'The last prisoner says "red" if they see an odd number of red hats ahead, "blue" if even. This encodes the parity bit. Each subsequent prisoner tracks the parity changes and can deduce their own hat. Result: 99 guaranteed survivors, 50/50 on the first. Optimal — no strategy can guarantee all 100.',
    concept: 'parity_encoding',
    difficulty: 'medium'
  },
  desert_crossing: {
    title: 'Desert Crossing (geometric series optimization)',
    puzzle: 'You must cross a 800km desert. Your vehicle holds enough fuel for 500km. You can create fuel caches anywhere. What is the minimum fuel needed at the start?',
    solution: 'Work backwards. To reach the end with 500km range, you need a cache at 300km with 500km fuel. To deliver 500km fuel to 300km, you make multiple trips. The optimal strategy uses the harmonic series: total fuel = 500 × (1 + 1/3 + 1/5 + ...) ≈ 500 × ln(800/300 + 1) ≈ 1148km worth. The pattern reveals that each additional km costs progressively less fuel as you consolidate trips.',
    concept: 'optimization',
    difficulty: 'hard'
  },
  two_eggs: {
    title: 'The Two Egg Problem (sqrt decomposition)',
    puzzle: 'You have two identical eggs and a 100-floor building. An egg breaks if dropped from floor N or above, survives below N. Find N with minimum drops in the worst case.',
    solution: 'If you had infinite eggs, binary search gives log₂(100) ≈ 7 drops. With 2 eggs, you need a strategy where the first egg narrows the range and the second does linear scan. Optimal: drop from floors 14, 27, 39, 50, 60, 69, 77, 84, 90, 95, 99, 100. The gap decreases by 1 each time. Worst case: 14 drops. Proof: n(n+1)/2 ≥ 100 → n ≥ 14.',
    concept: 'tradeoff',
    difficulty: 'medium'
  }
};

// ── Knowledge Base ────────────────────────────────────────────────────────────

const KNOWLEDGE = [
  ['algorithm', 'Binary Search Invariant', 'The key invariant: at every step, the target (if it exists) is within [lo, hi]. You maintain this by either moving lo to mid+1 or hi to mid-1 — never skipping the target. This invariant-based thinking applies to all search problems: maintain what MUST remain true, then shrink the search space without violating it.'],
  ['algorithm', 'Dynamic Programming: The Overlap Test', 'Before reaching for DP, verify two properties: (1) optimal substructure — can the optimal solution be composed from optimal solutions of subproblems? (2) overlapping subproblems — do you solve the same subproblem repeatedly in recursion? If yes to both, memoize. If only (1), use greedy. If only (2), just memoize — that\'s not really DP, it\'s just caching.'],
  ['complexity', 'Big-O is a Lower Bound, Not a Promise', 'O(n²) means "at most quadratic" — it could be linear, constant, even logarithmic. Ω(n) means "at least linear." Θ(n) means "exactly linear, tightly bound." Most people misuse O to mean Θ. When someone says "this is O(n²)," they often mean Θ(n²). Precision matters in analysis.'],
  ['complexity', 'P vs NP in One Sentence', 'P: problems verifiable in polynomial time by a deterministic machine. NP: problems verifiable in polynomial time by a nondeterministic machine (or equivalently, solutions checkable in poly time). The question: can you FIND solutions as fast as you can VERIFY them? Nobody knows. The Clay Institute offers $1M.'],
  ['logic', 'Gödel\'s Incompleteness (the actual theorem)', 'In any consistent formal system capable of expressing basic arithmetic, there exist true statements that cannot be proven within the system. The proof constructs a self-referential statement: "This statement is not provable." If it\'s false, it\'s provable (contradiction). If it\'s true, it\'s unprovable (theorem). Completeness and consistency cannot both hold.'],
  ['logic', 'Russell\'s Paradox (set theory\'s crisis)', 'Consider R = {x : x ∉ x} — the set of all sets that don\'t contain themselves. Does R contain itself? If yes, then by definition it doesn\'t. If no, then by definition it does. This paradox destroyed naive set theory and led to ZFC axioms with explicit separation restrictions. It shows: not every collection is a set.'],
  ['data_structures', 'Hash Tables: Why Collisions Destroy You', 'A hash table with chaining gives O(1) average lookup but O(n) worst case. With open addressing, clustering makes it O(n/log n) under load. The magic threshold: keep load factor α < 0.7. Beyond that, performance degrades exponentially. Good hash functions distribute uniformly — bad ones cluster on common prefixes, modulo biases, or similar patterns.'],
  ['data_structures', 'Union-Find Path Compression', 'With path compression + union by rank, find operations are nearly constant: O(α(n)) where α is the inverse Ackermann function. This grows so slowly that α(2^64) < 5. For all practical purposes, it\'s O(1). The trick: after each find, flatten the tree by making every node point directly to the root.'],
  ['proof', 'Proof by Invariant', 'An invariant is a property that remains true throughout execution. To prove correctness: (1) Identify the invariant. (2) Show it holds initially. (3) Show it\'s preserved by each operation. (4) Show it implies the desired conclusion. Dijkstra\'s weakest precondition calculus is built on this. Loop invariants prove while-loops; loop variants prove termination.'],
  ['proof', 'Diagonalization (Cantor\'s trick)', 'To prove |ℝ| > |ℕ|: assume a bijection f: ℕ → ℝ. Write f(n) as decimal expansions. Construct a new real number by changing the nth digit of f(n). This new number differs from every f(n) in at least one digit — contradiction. Same technique proves halting problem undecidability (Turing) and Gödel\'s incompleteness.'],
];

function searchKnowledge(query, topK = 10) {
  const rows = db.prepare(`
    SELECT id, category, title, content, source FROM knowledge
    WHERE (title || ' ' || content) LIKE ? ORDER BY id DESC LIMIT ?
  `).all(`%${query}%`, topK);
  return rows.map(r => ({ ...r, score: 0 }));
}

function getStats() {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge) as k,
      (SELECT COUNT(*) FROM logic_puzzles) as p,
      (SELECT COUNT(*) FROM axioms) as a
  `).get();
}

function listPuzzles() {
  return db.prepare('SELECT id, title, difficulty, concept FROM logic_puzzles ORDER BY id').all();
}

function getPuzzle(id) {
  return db.prepare('SELECT * FROM logic_puzzles WHERE id = ?').get(id);
}

function addPuzzle(title, puzzle, solution, concept, difficulty = 'medium') {
  db.prepare('INSERT INTO logic_puzzles (title, puzzle, solution, concept, difficulty) VALUES (?, ?, ?, ?, ?)').run(title, puzzle, solution, concept, difficulty);
}

function addAxiom(text, domain, derivedFrom = null) {
  db.prepare('INSERT INTO axioms (text, domain, derived_from) VALUES (?, ?, ?)').run(text, domain, derivedFrom);
}

function getAxioms(domain = null) {
  if (domain) return db.prepare('SELECT * FROM axioms WHERE domain = ?').all(domain);
  return db.prepare('SELECT * FROM axioms ORDER BY id').all();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'puzzle') console.log(JSON.stringify(getPuzzle(parseInt(process.argv[3])), null, 2));
  else if (cmd === 'puzzles') console.log(JSON.stringify(listPuzzles(), null, 2));
  else if (cmd === 'stats') console.log(JSON.stringify(getStats(), null, 2));
  else if (cmd === 'axioms') console.log(JSON.stringify(getAxioms(process.argv[3]), null, 2));
  else console.log('Usage: node brain/turing_voss.js <puzzle|puzzles|stats|axioms> [args]');
}

export { SYSTEM_PROMPT, searchKnowledge, getStats, listPuzzles, getPuzzle, addPuzzle, addAxiom, getAxioms, PUZZLES };
