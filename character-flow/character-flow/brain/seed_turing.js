#!/usr/bin/env node
/**
 * seed_turing.js — Seed Turing Voss logic puzzle & algorithm knowledge.
 */
import Database from 'better-sqlite3';
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/turing_knowledge.db', import.meta.url).pathname;
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
`);
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["First, solve the problem. Then, write the code.", "wisdom", "John Johnson Law"],
  ["The best way to predict the future is to invent it.", "innovation", "Alan Kay Law"],
  ["In theory, theory and practice are the same. In practice, they're not.", "practice", "Einstein Law"],
  ["Simplicity is the ultimate sophistication.", "elegance", "Da Vinci Law"],
  ["There are only two hard things in Computer Science: cache invalidation and naming things.", "naming", "Fox Law"],
  ["Talk is cheap. Show me the code.", "action", "Torvalds Law"],
  ["Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", "clarity", "Fowler Law"],
  ["The only way to learn a new programming language is by writing programs in it.", "practice", "Ritchie Law"],
  ["Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", "simplicity", "Saint-Exupery Law"],
  ["Sometimes it pays to stay in bed on Monday, rather than spending the rest of the week debugging Monday's code.", "priorities", "Salomon Law"],
];

const KNOWLEDGE = [
  ['algorithm', 'Binary Search: The Invariant', 'The key invariant: at every step, the target (if it exists) is within [lo, hi]. You maintain this by either moving lo to mid+1 or hi to mid-1. This invariant-based thinking applies to all search problems.'],
  ['algorithm', 'Dynamic Programming: When to Use It', 'Two properties must hold: (1) optimal substructure — optimal solution composed from subproblem optima. (2) overlapping subproblems — same subproblems solved repeatedly. If both yes → memoize. Only (1) → greedy. Only (2) → just caching.'],
  ['complexity', 'Big-O Misconceptions', 'O(n²) means "at most quadratic" — could be linear or constant. Ω(n) means "at least linear." Θ(n) means "exactly linear, tightly bounded." Most misuse O to mean Θ. Precision matters in analysis.'],
  ['complexity', 'P vs NP — The Actual Question', 'P: verifiable in polynomial time by deterministic machine. NP: verifiable in polynomial time by nondeterministic machine (or solutions checkable in poly time). Question: can you FIND as fast as VERIFY? Nobody knows. Clay Institute: $1M prize.'],
  ['logic', 'Godel Incompleteness Simplified', 'In any consistent formal system capable of arithmetic, there exist TRUE statements that CANNOT be proven. The proof constructs: "This statement is not provable." If false → provable (contradiction). If true → unprovable (theorem).'],
  ['logic', 'Russell Paradox: Set Theory Crisis', 'R = {x : x not in x} — the set of all sets that do not contain themselves. Does R contain itself? If yes → no. If no → yes. This destroyed naive set theory and led to ZFC axioms with explicit separation restrictions.'],
  ['data_structures', 'Hash Table Collision Handling', 'Chaining: O(1) average, O(n) worst. Open addressing: clustering makes it O(n/log n) under load. Keep load factor α < 0.7. Good hash functions distribute uniformly — bad ones cluster on prefixes, modulo biases, or patterns.'],
  ['data_structures', 'Union-Find Nearly Constant Time', 'With path compression + union by rank: O(α(n)) where α is inverse Ackermann. α(2^64) < 5. For all practical purposes: O(1). After each find, flatten the tree by making every node point directly to root.'],
  ['proof', 'Proof by Invariant', 'An invariant is a property that remains true throughout execution. Prove correctness: (1) Identify invariant. (2) Show initial truth. (3) Show preservation. (4) Show conclusion. Dijkstra weakest precondition is built on this.'],
  ['proof', 'Diagonalization Cantor Trick', 'Prove |R| > |N|: assume bijection f: N → R. Write f(n) as decimals. Construct new real by changing nth digit of f(n). New number differs from every f(n) — contradiction. Same technique proves halting undecidability (Turing) and Godel incompleteness.'],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const puzzles = [
  ['The Blue-Eyed Islanders (Godel-style induction)',
   '100 perfect logicians live on an island. Each can see everyone else eye color but not their own. No communication allowed. A visitor says: At least one of you has blue eyes. What happens?',
   'On day 100, all 100 blue-eyed people leave. Proof by induction: if N=1, they see no blue eyes and leave day 1. If N=2, each sees one blue eye, waits to see if that person leaves day 1... when they do not, both deduce they have blue eyes and leave day 2. By induction, N blue-eyed people leave on day N.',
   'common_knowledge', 'hard'],
  ['The Counterfeit Coin (binary search)',
   'You have 12 coins. One is counterfeit — heavier or lighter, you do not know which. Using a balance scale only 3 times, find the counterfeit and determine whether it is heavy or light.',
   'Label coins 1-12. First weigh: 1,2,3,4 vs 5,6,7,8. If balanced, counterfeit is in 9-12. Three outcomes branch into three sub-cases, each solvable in one more weighing. Information-theoretic lower bound: log3(24) ≈ 2.89, so 3 weighings is optimal.',
   'information_theory', 'hard'],
  ['The Hat Puzzle (parity strategy)',
   '100 prisoners stand in a line. Each wears red or blue hat. Each can see all hats ahead but not their own. Starting from the back, each must say their hat color aloud. They can agree on a strategy beforehand. Maximize survivors.',
   'Last prisoner says red if they see odd number of red hats ahead, blue if even. This encodes parity bit. Each subsequent prisoner tracks parity changes and deduces their own hat. Result: 99 guaranteed survivors, 50/50 on first. Optimal.',
   'parity_encoding', 'medium'],
  ['Desert Crossing (geometric series)',
   'You must cross an 800km desert. Your vehicle holds enough fuel for 500km. You can create fuel caches anywhere. What is the minimum fuel needed at the start?',
   'Work backwards. To reach end with 500km range, need cache at 300km with 500km fuel. Multiple trips required. Optimal uses harmonic series: total fuel approximately 500 × ln(800/300 + 1) ≈ 1148km worth. Pattern reveals each additional km costs progressively less.',
   'optimization', 'hard'],
  ['The Two Egg Problem (sqrt decomposition)',
   'You have two identical eggs and a 100-floor building. An egg breaks from floor N or above. Find N with minimum drops in worst case.',
   'Optimal: drop from floors 14, 27, 39, 50, 60, 69, 77, 84, 90, 95, 99, 100. Gap decreases by 1 each time. Worst case: 14 drops. Proof: n(n+1)/2 >= 100 → n >= 14.',
   'tradeoff', 'medium'],
];
for (const [title, puzzle, solution, concept, difficulty] of puzzles) {
  db.prepare('INSERT INTO logic_puzzles (title, puzzle, solution, concept, difficulty) VALUES (?, ?, ?, ?, ?)').run(title, puzzle, solution, concept, difficulty);
}

const s = rag.getStats();
console.log(`Turing Voss seeded: ${s.k} knowledge, ${s.p} puzzles`);
