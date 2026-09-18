import React, { useState, useEffect } from 'react';

interface SkillGroup {
  name: string;
  tools: { name: string; description: string }[];
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillGroup[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/skills')
      .then((r) => r.json())
      .then((d) => setSkills(d.skills || []))
      .catch(() => {});
  }, []);

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1000px' }}>
      <div className="page-header">
        <h1>Skills</h1>
        <p>Available tools and capabilities for each character</p>
      </div>

      {skills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading skills...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {skills.map((group) => (
            <div
              key={group.name}
              className="glass-card"
              style={{ overflow: 'hidden' }}
            >
              <button
                onClick={() => setExpanded(expanded === group.name ? null : group.name)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {group.name}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {group.tools.length} tool{group.tools.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    transition: 'transform 200ms',
                    transform: expanded === group.name ? 'rotate(90deg)' : 'none',
                  }}
                >
                  ▸
                </span>
              </button>

              {expanded === group.name && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
                  {group.tools.map((tool) => (
                    <div
                      key={tool.name}
                      style={{
                        padding: '12px 20px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '16px',
                      }}
                    >
                      <code
                        style={{
                          fontSize: '13px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: 'var(--accent)',
                          background: 'var(--accent-muted)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tool.name}
                      </code>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {tool.description || 'No description'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
