import {
  TOOL_CATALOG, ROLE_TOOL_GRANTS, toolsForRole, parseToolCall,
} from '../../lib/business-tools.js';

describe('role-based tool gating', () => {
  it('grants tools only to roles whose job needs them', () => {
    expect(toolsForRole('eng-lead').map(t => t.name)).toContain('rag_search');
    expect(toolsForRole('cto').map(t => t.name)).toContain('rag_search');
    // money/design roles get NO tools — tools are not for everyone
    expect(toolsForRole('finance')).toEqual([]);
    expect(toolsForRole('design')).toEqual([]);
  });

  it('unknown or unassigned roles get no tools', () => {
    expect(toolsForRole('nonexistent')).toEqual([]);
    expect(toolsForRole('')).toEqual([]);
  });

  it('never grants destructive or unlisted tools implicitly', () => {
    for (const roleId of Object.keys(ROLE_TOOL_GRANTS)) {
      for (const t of toolsForRole(roleId)) {
        expect(TOOL_CATALOG.map(c => c.name)).toContain(t.name);
      }
    }
  });
});

describe('tool-call parsing', () => {
  it('parses a fenced JSON tool call', () => {
    const text = 'Let me check the library.\n```json\n{"tool":"rag_search","args":{"query":"revenue"}}" \n```';
    expect(parseToolCall(text)).toEqual({ tool: 'rag_search', args: { query: 'revenue' } });
  });

  it('parses a bare JSON object tool call', () => {
    expect(parseToolCall('{"tool":"rag_search","args":{"query":"q"}}'))
      .toEqual({ tool: 'rag_search', args: { query: 'q' } });
  });

  it('returns null for plain speech (no hallucinated calls)', () => {
    expect(parseToolCall('I think we should ship on Friday.')).toBeNull();
    expect(parseToolCall('')).toBeNull();
    expect(parseToolCall(null as unknown as string)).toBeNull();
  });

  it('rejects malformed tool payloads', () => {
    expect(parseToolCall('{"tool":"rag_search"}')).toBeNull(); // missing args
    expect(parseToolCall('[{"tool":"x"},{"args":{}}]')).toBeNull(); // not an object
  });
});
