import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import CharactersPage from './pages/CharactersPage';
import ChatPage from './pages/ChatPage';
import SkillsPage from './pages/SkillsPage';
import SessionsPage from './pages/SessionsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigate = (p: string) => setPage(p);

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <DashboardPage onNavigate={navigate} />;
      case 'characters':
        return <CharactersPage onNavigate={navigate} />;
      case 'chat':
        return <ChatPage />;
      case 'skills':
        return <SkillsPage />;
      case 'sessions':
        return <SessionsPage onNavigate={navigate} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        activePage={page}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
        {renderPage()}
      </main>
    </div>
  );
}
