import React, { useState, useEffect } from 'react';

interface Stats {
  total_sessions: number;
  total_messages: number;
  characters: number;
}

interface Character {
  key: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
}

export default function DashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    fetch('/api/characters')
      .then((r) => r.json())
      .then((d) => setCharacters(d.characters || []))
      .catch(() => {});
  }, []);

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1200px' }}>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your SwordCLI environment</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Characters
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {stats?.characters ?? characters.length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Active agents
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sessions
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {stats?.total_sessions ?? '—'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Total conversations
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Messages
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {stats?.total_messages ?? '—'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Across all sessions
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
            <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--success)' }}>Online</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            API server running
          </div>
        </div>
      </div>

      {/* Characters preview */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Characters</h2>
          <button className="btn-ghost" onClick={() => onNavigate('characters')} style={{ fontSize: '13px', padding: '6px 12px' }}>
            View all →
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
          {characters.slice(0, 6).map((c) => (
            <div
              key={c.key}
              className="char-card"
              onClick={() => onNavigate('chat')}
              style={{ padding: '16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: `color-mix(in srgb, ${c.color} 15%, var(--bg-primary))`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    flexShrink: 0,
                  }}
                >
                  {c.emoji}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Quick Start</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <div
            className="char-card"
            onClick={() => onNavigate('chat')}
            style={{ padding: '20px' }}
          >
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>▸</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Start a conversation</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Chat with any character about anything</div>
          </div>
          <div
            className="char-card"
            onClick={() => onNavigate('skills')}
            style={{ padding: '20px' }}
          >
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>⬡</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Browse skills</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>View available tools and capabilities</div>
          </div>
          <div
            className="char-card"
            onClick={() => onNavigate('sessions')}
            style={{ padding: '20px' }}
          >
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>☰</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Session history</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Review past conversations and context</div>
          </div>
        </div>
      </div>
    </div>
  );
}
