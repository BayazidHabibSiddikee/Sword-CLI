import React, { useState, useEffect } from 'react';

interface Character {
  key: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  brain: string;
  hasAgentSkills: boolean;
}

export default function CharactersPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/characters')
      .then((r) => r.json())
      .then((d) => setCharacters(d.characters || []))
      .catch(() => {});
  }, []);

  const active = characters.find((c) => c.key === selected);

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1200px' }}>
      <div className="page-header">
        <h1>Characters</h1>
        <p>AI agents with distinct personalities, knowledge, and capabilities</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: '24px', alignItems: 'start' }}>
        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {characters.map((c) => (
            <div
              key={c.key}
              className="char-card"
              onClick={() => setSelected(c.key === selected ? null : c.key)}
              style={{
                padding: '20px',
                borderColor: c.key === selected ? 'var(--accent)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: `color-mix(in srgb, ${c.color} 15%, var(--bg-primary))`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    flexShrink: 0,
                  }}
                >
                  {c.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{c.role}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {c.hasAgentSkills && <span className="badge badge-green">Agent skills</span>}
                    <span className="badge badge-blue">{c.key}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && active && (
          <div className="glass-card fade-in" style={{ padding: '24px', position: 'sticky', top: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: `color-mix(in srgb, ${active.color} 15%, var(--bg-primary))`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                }}
              >
                {active.emoji}
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{active.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{active.role}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Key</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{active.key}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Brain</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '13px' }}>{active.brain.split('/').pop()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Skills</span>
                <span className={active.hasAgentSkills ? 'badge badge-green' : 'badge badge-yellow'}>
                  {active.hasAgentSkills ? 'Extended' : 'Base'}
                </span>
              </div>
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('chat')}
            >
              Start conversation →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
