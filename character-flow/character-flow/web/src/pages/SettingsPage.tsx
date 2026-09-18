import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [proxyHost, setProxyHost] = useState('http://localhost:3001');
  const [serverPort, setServerPort] = useState('3002');
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '800px' }}>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure your SwordCLI environment</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Server */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Server</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Server Port
              </label>
              <input
                className="input-field"
                value={serverPort}
                onChange={(e) => setServerPort(e.target.value)}
                style={{ maxWidth: '200px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Freellmapi Proxy URL
              </label>
              <input
                className="input-field"
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                style={{ maxWidth: '400px' }}
              />
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Requests to /v1/* are forwarded here
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>About</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Application</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>SwordCLI</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Version</span>
              <span style={{ color: 'var(--text-primary)' }}>0.1.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Runtime</span>
              <span style={{ color: 'var(--text-primary)' }}>Node.js + LangGraph</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Frontend</span>
              <span style={{ color: 'var(--text-primary)' }}>React + Vite + Tailwind CSS</span>
            </div>
          </div>
        </div>

        {/* Save */}
        <div>
          <button className="btn-primary" onClick={save} style={{ minWidth: '120px' }}>
            {saved ? '✓ Saved' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
