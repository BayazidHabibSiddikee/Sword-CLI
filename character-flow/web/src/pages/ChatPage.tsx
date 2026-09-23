import React, { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
}

interface Character {
  key: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
}

export default function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/characters')
      .then((r) => r.json())
      .then((d) => {
        const chars = d.characters || [];
        setCharacters(chars);
        if (chars.length > 0) setSelectedChar(chars[0].key);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const charMeta = characters.find((c) => c.key === selectedChar);

  const sendMessage = async () => {
    if (!input.trim() || !selectedChar || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: selectedChar, message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response || data.error || 'No response', timestamp: Date.now() },
      ]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (!selectedChar) return;
    fetch('/api/session/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: selectedChar }),
    });
    setMessages([]);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header bar */}
      <div
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: '16px',
          flexShrink: 0,
          background: 'var(--bg-secondary)',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Chat</span>

        {/* Character selector */}
        <select
          value={selectedChar}
          onChange={(e) => {
            setSelectedChar(e.target.value);
            setMessages([]);
          }}
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            padding: '6px 10px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {characters.map((c) => (
            <option key={c.key} value={c.key}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>

        {charMeta && (
          <span className="badge badge-blue" style={{ fontSize: '12px' }}>
            {charMeta.role}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn-ghost" onClick={clearChat} style={{ fontSize: '13px', padding: '6px 12px' }}>
          Clear
        </button>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '40px', opacity: 0.3 }}>▸</div>
            <div style={{ fontSize: '15px', color: 'var(--text-muted)', textAlign: 'center' }}>
              {charMeta ? `Start a conversation with ${charMeta.name}` : 'Select a character to begin'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Type a message below to begin
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${msg.role === 'user' ? 'msg-user' : msg.role === 'assistant' ? 'msg-assistant' : 'msg-tool'} fade-in`}
                style={{ padding: '14px 18px' }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  {msg.role === 'user' ? 'You' : charMeta?.name || 'Assistant'}
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="msg-assistant fade-in" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  {charMeta?.name || 'Assistant'}
                </div>
                <div className="dot-pulse">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', background: 'var(--bg-secondary)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', gap: '10px' }}>
          <textarea
            className="input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={charMeta ? `Message ${charMeta.name}...` : 'Select a character...'}
            disabled={loading || !selectedChar}
            rows={1}
            style={{ flex: 1, minHeight: '44px', maxHeight: '120px', resize: 'none' }}
          />
          <button
            className="btn-primary"
            onClick={sendMessage}
            disabled={loading || !input.trim() || !selectedChar}
            style={{
              opacity: loading || !input.trim() || !selectedChar ? 0.5 : 1,
              minWidth: '80px',
              height: '44px',
              flexShrink: 0,
            }}
          >
            {loading ? <div className="spinner" /> : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
