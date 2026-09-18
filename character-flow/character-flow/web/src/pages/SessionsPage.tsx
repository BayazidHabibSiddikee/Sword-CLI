import React, { useState, useEffect } from 'react';

interface SessionList {
  [character: string]: {
    message_count: number;
    last_active: string;
  };
}

export default function SessionsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [sessions, setSessions] = useState<SessionList>({});

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || {}))
      .catch(() => {});
  }, []);

  const entries = Object.entries(sessions);

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1000px' }}>
      <div className="page-header">
        <h1>Sessions</h1>
        <p>Conversation history and session management</p>
      </div>

      {entries.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', opacity: 0.2, marginBottom: '12px' }}>☰</div>
          <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            No active sessions yet
          </div>
          <button className="btn-primary" onClick={() => onNavigate('chat')}>
            Start a conversation →
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map(([character, data]) => (
            <div
              key={character}
              className="char-card"
              onClick={() => onNavigate('chat')}
              style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {character}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {data.message_count} message{data.message_count !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {data.last_active ? new Date(data.last_active).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
