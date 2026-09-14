#!/usr/bin/env node
/**
 * seed_sable.js — Seed Sable Chen engineering knowledge base.
 */
import Database from 'better-sqlite3';
import { RagEngine } from './rag.js';

const DB_PATH = new URL('../data/sable_knowledge.db', import.meta.url).pathname;
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'engineering',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge(category);
  CREATE TABLE IF NOT EXISTS postmortems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident TEXT NOT NULL,
    cause TEXT NOT NULL,
    lesson TEXT NOT NULL,
    domain TEXT DEFAULT 'system'
  );
`);
const rag = new RagEngine(DB_PATH);

const QUOTES = [
  ["Premature optimization is the root of all measurement errors.", "engineering", "Knuth Law"],
  ["The best architecture is the one your team can actually maintain.", "architecture", "Pragmatism Law"],
  ["If it cannot be tested, it cannot be trusted.", "testing", "Verification Law"],
  ["Complexity is contagious — once introduced, it spreads.", "complexity", "Entropy Law"],
  ["Every abstraction leaks. Budget for the leak.", "abstraction", "Boundary Law"],
  ["The hardest bug to find is the one you are sure does not exist.", "debugging", "Humility Law"],
  ["Documentation is code — and it decays faster than anything else.", "docs", "Maintenance Law"],
  ["If you need a comment to explain what the code does, the code is wrong.", "code_quality", "Clarity Law"],
  ["Scaling horizontally is easier than scaling vertically — but only if stateless.", "scaling", "Statelessness Law"],
  ["The first 90% of a project takes 90% of the time. The last 10% takes the other 90%.", "estimation", "Moravec Law"],
];

const KNOWLEDGE = [
  ['engineering', 'CAP Theorem: Pick Two', 'In a distributed system, you can guarantee at most TWO of: Consistency, Availability, Partition tolerance. You MUST pick partition tolerance (networks fail). So it is CA vs CP vs AP. Most choose AP (eventual consistency) for web scale.'],
  ['engineering', 'Database Indexing: B-Trees vs Hash', 'B-tree indexes support range queries (>, <, BETWEEN) and ordered traversal. Hash indexes only support equality (=). B-tree is O(log n), hash is O(1) average but degenerates to O(n) on collisions.'],
  ['engineering', 'REST API Design: Resource Naming', 'Use nouns, not verbs. GET /users (list), GET /users/42 (single), POST /users (create), PUT /users/42 (replace), PATCH /users/42 (partial), DELETE /users/42 (remove). Status codes matter.'],
  ['engineering', 'Microservices: When to Use Them', 'Use microservices when teams need independent deployment and different components have different scaling needs. Do NOT use when everything is tightly coupled. Microservices before monoliths is a common mistake.'],
  ['engineering', 'CI/CD: The Deployment Pipeline', 'A proper pipeline: lint → test → build → security scan → staging deploy → integration tests → canary → production. Each stage gates the next. Rollback is a first-class operation.'],
  ['engineering', 'Debugging Methodology: Binary Search', 'When a bug appears, halve the search space. Git bisect finds the commit. Comment out half the code. Speed comes from narrowing, not guessing.'],
  ['engineering', 'Load Testing: Finding the Breaking Point', 'Do not test at expected load — test at 3x, 5x, 10x. Measure response time percentiles (p50, p95, p99), error rate, resource saturation. Watch for the cliff where response time explodes.'],
  ['engineering', 'Code Review: What Actually Matters', 'Not style — function. Check: (1) Does it do what it claims? (2) Edge cases handled? (3) Security implications? (4) Performance concerns? (5) Test coverage adequate? Style can be auto-formatted. Judgment cannot.'],
  ['engineering', 'Logging: Structured Over Unstructured', 'JSON logs with consistent fields: timestamp, level, service, trace_id, message, context. Structured logs enable querying, alerting, and correlation across services. Correlation IDs let you follow a request across microservices.'],
  ['engineering', 'Security: Defense in Depth', 'No single layer is sufficient. Layers: input validation, authentication, authorization, encryption, rate limiting, monitoring, incident response. The goal is not perfection — it is raising the cost of attack above the value of the target.'],
];

for (const [text, theme, law] of QUOTES) rag.insertQuote(text, theme, law);
for (const [cat, title, content] of KNOWLEDGE) rag.insertKnowledge(cat, title, content);

const postmortems = [
  ['The Cascading Timeout (2019)', 'Downstream auth service slowed to 2s. Thread pools exhausted. Total outage 47 min.', 'Every external call needs timeout and fallback. Circuit breakers are not optional — they are insurance.', 'reliability'],
  ['The N+1 Query That Killed Our API', '500 orders, one query each = 50,000 qps against single MySQL.', 'Always profile queries. Eager loading is not optional. Use EXPLAIN ANALYZE.', 'performance'],
  ['The Midnight Merge Conflict', 'Migration in Branch A, app code in Branch B. Deploy succeeded, crashed at runtime.', 'Deploy migrations BEFORE code that depends on them. Use feature flags.', 'deployment'],
  ['The Infinite Retry Loop', '503 retry with exponential backoff capped at 30min. 50,000 duplicate calls over 3 days.', 'Every retry loop needs max attempts, dead-letter queue, alerting on queue depth.', 'resilience'],
];
for (const [incident, cause, lesson, domain] of postmortems) {
  db.prepare('INSERT INTO postmortems (incident, cause, lesson, domain) VALUES (?, ?, ?, ?)').run(incident, cause, lesson, domain);
}

const s = rag.getStats();
console.log(`Sable Chen seeded: ${s.k} knowledge, ${s.pm} postmortems`);
