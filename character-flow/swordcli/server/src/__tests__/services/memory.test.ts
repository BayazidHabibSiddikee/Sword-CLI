import { initDb } from '../../db/index.js';
import {
  remember, memoriesAboutSubjects, buildColleagueKnowledgeBlock,
  recordStatement, forgetMemory, listMemories,
} from '../../services/memory.js';

beforeEach(() => {
  initDb(':memory:');
});

describe('persona memory service (phase 1 industry memory)', () => {
  it('stores and retrieves memories about a subject', () => {
    remember({ subject: 'Makima', content: 'prioritizes quality over deadlines', kind: 'trait', sourceTopic: 'launch date' });
    const rows = memoriesAboutSubjects(['Makima']);
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe('Makima');
    expect(rows[0].content).toContain('quality over deadlines');
  });

  it('scopes retrieval to the requested subjects', () => {
    remember({ subject: 'Makima', content: 'a' });
    remember({ subject: 'Viktor', content: 'b' });
    expect(memoriesAboutSubjects(['Makima'])).toHaveLength(1);
    expect(memoriesAboutSubjects(['Makima', 'Viktor'])).toHaveLength(2);
    expect(memoriesAboutSubjects([])).toHaveLength(0);
  });

  it('builds a colleague-knowledge block for the other participants only', () => {
    recordStatement('Makima', 'I will not ship untested code.', 'release plan');
    recordStatement('Viktor', 'Budget is tight this quarter.', 'q3 planning');
    const block = buildColleagueKnowledgeBlock(['Makima', 'Viktor'], 'Viktor');
    expect(block).toContain('About Makima');
    expect(block).toContain('release plan');
    expect(block).not.toContain('About Viktor'); // speaker is excluded
  });

  it('returns an empty block when nothing is known yet (no empty headers)', () => {
    expect(buildColleagueKnowledgeBlock(['Makima', 'Viktor'], 'Viktor')).toBe('');
  });

  it('recordStatement truncates long statements to 400 chars', () => {
    const m = recordStatement('Makima', 'x'.repeat(1000), 't');
    expect(m.content).toHaveLength(400);
  });

  it('forgetMemory deletes and reports misses honestly', () => {
    const m = remember({ subject: 'Makima', content: 'note' });
    expect(forgetMemory(m.id)).toBe(true);
    expect(forgetMemory(m.id)).toBe(false);
    expect(listMemories()).toHaveLength(0);
  });
});
