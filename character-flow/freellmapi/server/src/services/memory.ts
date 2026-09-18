// Persona memory system (Phase 1 of the industry architecture).
//
// Characters learn about each other: every Business-meeting statement is
// recorded as an episodic memory ABOUT the speaker. When any colleague next
// speaks in a meeting with them, relevant memories are retrieved and injected
// as "[What you know about your colleagues]" — so private impressions formed
// in meetings carry forward into future ones.
//
// Storage deliberately stays on the existing better-sqlite3 database (Phase 1);
// the accessors below are the only surface the rest of the code touches, so
// the Phase 2 PostgreSQL/pgvector move is a swap inside this file.
import { getDb } from '../db/index.js';

export interface PersonaMemory {
  id: number;
  observer: string | null;
  subject: string;
  kind: string; // 'statement' | 'trait' | 'event'
  content: string;
  source_topic: string | null;
  created_at: string;
}

export function remember(m: {
  observer?: string | null;
  subject: string;
  kind?: string;
  content: string;
  sourceTopic?: string | null;
}): PersonaMemory {
  const db = getDb();
  const row = db.prepare(`
    INSERT INTO persona_memories (observer, subject, kind, content, source_topic)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    m.observer ?? null,
    m.subject,
    m.kind ?? 'statement',
    m.content,
    m.sourceTopic ?? null,
  );
  return getMemory(Number(row.lastInsertRowid))!;
}

export function getMemory(id: number): PersonaMemory | undefined {
  return getDb().prepare('SELECT * FROM persona_memories WHERE id = ?').get(id) as PersonaMemory | undefined;
}

export function listMemories(limit = 100): PersonaMemory[] {
  return getDb().prepare(
    'SELECT * FROM persona_memories ORDER BY id DESC LIMIT ?',
  ).all(limit) as PersonaMemory[];
}

export function countMemories(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM persona_memories').get() as { n: number };
  return row.n;
}

/** Everything the team has implicitly learned about the given people. */
export function memoriesAboutSubjects(subjects: string[], limit = 8): PersonaMemory[] {
  if (subjects.length === 0) return [];
  const placeholders = subjects.map(() => '?').join(',');
  return getDb().prepare(`
    SELECT * FROM persona_memories
    WHERE subject IN (${placeholders})
    ORDER BY id DESC LIMIT ?
  `).all(...subjects, limit) as PersonaMemory[];
}

/**
 * Build the prompt block describing what the team knows about the other
 * participants ('' when there is nothing yet — never inject an empty header).
 */
export function buildColleagueKnowledgeBlock(participants: string[], excludeSpeaker: string): string {
  const others = participants.filter((p) => p !== excludeSpeaker);
  const rows = memoriesAboutSubjects(others, 8);
  if (rows.length === 0) return '';
  const lines = rows.map((r) => {
    const who = r.subject;
    const src = r.source_topic ? ` (during "${r.source_topic}")` : '';
    return `- About ${who}${src}: ${r.content}`;
  });
  return `\n\n[What you know about your colleagues from working together]\n${lines.join('\n')}\nUse this context subtly — you already know these people.`;
}

/** Record an episodic memory of what a character said in a meeting. */
export function recordStatement(speaker: string, text: string, topic: string): PersonaMemory {
  return remember({
    observer: null,
    subject: speaker,
    kind: 'statement',
    content: text.slice(0, 400),
    sourceTopic: topic,
  });
}

export function forgetMemory(id: number): boolean {
  const r = getDb().prepare('DELETE FROM persona_memories WHERE id = ?').run(id);
  return r.changes > 0;
}
