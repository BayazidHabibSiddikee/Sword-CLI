#!/usr/bin/env node
/**
 * seed_ada.js — Seed Dr. Ada Vance theorem & math knowledge base.
 */
import Database from 'better-sqlite3';
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/ada_knowledge.db', import.meta.url).pathname;
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS theorems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    statement TEXT NOT NULL,
    intuition TEXT NOT NULL,
    application TEXT DEFAULT 'general'
  );
`);
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["First, solve the problem. Then, write the code.", "wisdom", "Process Law"],
  ["In theory, theory and practice are the same. In practice, they are not.", "theory", "Practice Law"],
  ["The best way to predict the future is to invent it.", "innovation", "Agency Law"],
  ["Talk is cheap. Show me the code.", "action", "Evidence Law"],
  ["Simplicity is the ultimate sophistication.", "elegance", "Beauty Law"],
  ["Programs must be written for people to read, and only incidentally for machines to execute.", "readability", "Human Law"],
  ["Sometimes it pays to stay in bed on Monday, rather than spending the rest of the week debugging Monday code.", "priorities", "Rest Law"],
  ["Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", "minimalism", "Subtraction Law"],
  ["The only way to learn a new programming language is by writing programs in it.", "practice", "Immersion Law"],
  ["Knowledge is power.", "learning", "Foundation Law"],
];

const KNOWLEDGE = [
  ['math', 'Why QuickSort is O(n log n) on Average', 'Partitioning divides the array randomly. Expected recursion depth is O(log n). At each level, O(n) comparisons. Total: O(n) × O(log n) = O(n log n). Worst case O(n2) only on already-sorted input — why randomized pivot exists.'],
  ['math', 'The Math Behind Hash Functions', 'Good hash distributes uniformly. Birthday paradox: collisions likely after sqrt(n) inserts. 64-bit hash gives ~2^32 safe entries before 50% collision probability. Cryptographic hashes: small input changes produce completely different outputs (avalanche effect).'],
  ['math', 'Dynamic Programming: The Bellman Equation', 'Richard Bellman discovered that optimal decisions satisfy a recursive equation: V(s) = max_a [R(s,a) + gamma*V(s\')]. This looks like DP but is actually the foundation of reinforcement learning.'],
  ['math', 'Graph Theory: Euler Formula V-E+F=2', 'For any convex polyhedron (or planar graph): vertices minus edges plus faces equals 2. Explains why four-color theorem is hard. Also proves you cannot connect 3 houses to 3 utilities without crossings.'],
  ['math', 'Linear Algebra: Why SVD Matters', 'Singular Value Decomposition writes any matrix A = U*Sigma*V transposed. Singular values tell importance of each dimension. Google PageRank uses power iteration on hyperlink matrix. Image compression keeps top-k singular values.'],
  ['cs', 'Binary Search Variants', 'Basic algorithm trivial. Bugs hide in variants: (1) First occurrence — lo = mid + 1 when nums[mid] >= target. (2) Last occurrence — hi = mid - 1 when nums[mid] <= target. (3) Rotated sorted array. (4) Binary search on answer.'],
  ['cs', 'Concurrency: Dining Philosophers', 'Five philosophers, five forks. Each needs two to eat. Naive: pick left then right — deadlock if all pick left simultaneously. Solutions: limit to 4 diners, asymmetric ordering, resource hierarchy. Lesson: lock ordering prevents deadlock.'],
  ['cs', 'Testing: Property-Based vs Example-Based', 'Example-based: given input [3,1,2], expect sorted [1,2,3]. Property-based: for all lists L, sort(sort(L)) == sort(L). Latter catches edge cases you would not think to write examples for. Libraries: QuickCheck, pytest-randomly, fast-check.'],
  ['cs', 'The Unix Philosophy as Architecture', '"Do one thing well." Not just CLI — composability. Small focused components compose into complex systems. Modern microservices inherit this. Danger: over-decomposition creates orchestration overhead.'],
  ['cs', 'Memory: Stack vs Heap', 'Stack allocation is O(1) — just move a pointer. Heap requires free list search, fragmentation management, GC. Recursion crashes via stack overflow. Smart pointers automate heap safely.'],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const theorems = [
  ['Eulers Identity', 'e^(i*pi) + 1 = 0', 'Five fundamental constants connected simply. Rotation in complex plane linked to exponential growth and circles.', 'signal_processing'],
  ['Four Color Theorem', 'Any planar map colored with at most 4 colors, no adjacent regions same color', 'Proof checked 1936 cases by computer — first major theorem proven this way. Sparked debate on computer-assisted proof.', 'graph_theory'],
  ['Prime Number Theorem', 'Number of primes less than or equal to x is approximately x/ln(x)', 'Primes appear random, density follows smooth curve. Deepest connection between discrete and continuous mathematics.', 'cryptography'],
  ['No-Extra-Information Theorem', 'I(X;Y) >= I(X;g(Y)) — processing cannot increase information', 'Cannot create knowledge from nothing. Every transformation loses or preserves information, never gains it.', 'information_theory'],
  ['Dijkstra Optimality Lemma', 'Every subpath of a shortest path is itself a shortest path', 'Recursive structure is why Dijkstra works. Greedy choice works because future depends only on present state.', 'graph_algorithms'],
];
for (const [name, statement, intuition, application] of theorems) {
  db.prepare('INSERT INTO theorems (name, statement, intuition, application) VALUES (?, ?, ?, ?)').run(name, statement, intuition, application);
}

const s = rag.getStats();
console.log(`Dr. Ada Vance seeded: ${s.k} knowledge, ${s.t} theorems`);
