import React from 'react';

export default function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  onToggle,
}: {
  activePage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '◈' },
    { id: 'characters', label: 'Characters', icon: '◆' },
    { id: 'chat', label: 'Chat', icon: '▸' },
    { id: 'skills', label: 'Skills', icon: '⬡' },
    { id: 'sessions', label: 'Sessions', icon: '☰' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  return (
    <aside
      style={{
        width: collapsed ? '64px' : 'var(--sidebar-width)',
        height: '100vh',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          gap: '10px',
          cursor: 'pointer',
        }}
        onClick={() => onNavigate('dashboard')}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 700,
            color: 'white',
            flexShrink: 0,
          }}
        >
          S
        </div>
        {!collapsed && (
          <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            SwordCLI
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {nav.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            style={{
              width: '100%',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px 0' : '8px 12px',
            }}
            title={collapsed ? item.label : undefined}
          >
            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', flexShrink: 0 }}>
              {item.icon}
            </span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button
          className="nav-item"
          onClick={onToggle}
          style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start' }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span style={{ fontSize: '14px', width: '20px', textAlign: 'center', transition: 'transform 200ms', transform: collapsed ? 'rotate(180deg)' : 'none' }}>
            ◁
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
