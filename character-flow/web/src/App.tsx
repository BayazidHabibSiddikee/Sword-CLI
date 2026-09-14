import { useState, useRef, useEffect } from 'react'

interface Character {
  id: string
  name: string
  emoji: string
  color: string
  role: string
}

interface Message {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
}

const API_BASE = import.meta.env.VITE_API_BASE || ''
const DEFAULT_MODEL = 'agnes-2.5-flash'

export default function App() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedChar, setSelectedChar] = useState<string>('izuku')
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [teamMode, setTeamMode] = useState(false)
  const [teamMembers, setTeamMembers] = useState<string[]>(['izuku'])
  const [showCharSelect, setShowCharSelect] = useState(true)
  const [history, setHistory] = useState<{char: string, msgs: Message[]}[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/characters`)
      .then(r => r.json())
      .then(setCharacters)
      .catch(() => {
        // Fallback hardcoded characters
        setCharacters([
          { id: 'izuku', name: 'Izuku Midoriya', emoji: '🦸', color: '#00CED1', role: 'Philosopher Hero' },
          { id: 'mahina', name: 'Mahina Artemis', emoji: '💜', color: '#DA70D6', role: 'Strategist' },
          { id: 'muhan', name: 'Muhan Haswaz', emoji: '📊', color: '#FFD700', role: 'Math Professor' },
          { id: 'plastos', name: 'Plastos Jiade', emoji: '📰', color: '#FF4466', role: 'War Reporter' },
          { id: 'monk', name: 'Monk Maecenas', emoji: '🧘', color: '#9370DB', role: 'Religious Scholar' },
          { id: 'rishad', name: 'Prince Rishad', emoji: '🎭', color: '#FF6B35', role: 'Comedy Lover' },
          { id: 'turing', name: 'Turing Voss', emoji: '🔮', color: '#7B68EE', role: 'Logic Master' },
          { id: 'sable', name: 'Sable Chen', emoji: '🔧', color: '#FF6B35', role: 'Pragmatic Engineer' },
          { id: 'ada', name: 'Dr. Ada Vance', emoji: '✨', color: '#00CED1', role: 'Comp. Mathematician' },
          { id: 'kael', name: 'Kael Vector', emoji: '🤖', color: '#00FF7F', role: 'ML Engineer' },
        ])
      })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    // Auto-resize textarea
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [input])

  const getChar = (id: string) => characters.find(c => c.id === id) || characters[0]

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setLoading(true)
    setInput('')

    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: getSystemPrompt() },
            ...messages.filter(m => m.role !== 'tool'),
            { role: 'user', content: text },
          ],
          stream: false,
          tools: getToolDefinitions(),
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const reply = data.choices?.[0]?.message
      if (reply?.content) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply.content, timestamp: Date.now() }])
      }
      if (reply?.tool_calls) {
        for (const tc of reply.tool_calls) {
          const toolResult = await callTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'))
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `[Calling ${tc.function.name}...]`, timestamp: Date.now() },
            { role: 'tool', content: String(toolResult).slice(0, 500), timestamp: Date.now() },
          ])
          // One more turn after tool result
          const res2 = await fetch(`${API_BASE}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: getSystemPrompt() },
                ...messages.filter(m => m.role !== 'tool'),
                { role: 'user', content: text },
                { role: 'assistant', tool_calls: [tc] },
                { role: 'tool', tool_call_id: tc.id, content: String(toolResult) },
              ],
              stream: false,
              tools: getToolDefinitions(),
            }),
          })
          const data2 = await res2.json()
          const reply2 = data2.choices?.[0]?.message
          if (reply2?.content) {
            setMessages(prev => [...prev, { role: 'assistant', content: reply2.content, timestamp: Date.now() }])
          }
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${e.message}`, timestamp: Date.now() }])
    } finally {
      setLoading(false)
    }
  }

  function getSystemPrompt() {
    const char = getChar(selectedChar)
    return `You are ${char?.name || 'Assistant'}. ${char?.role || ''}. Be helpful, precise, and engaging.`
  }

  function getToolDefinitions() {
    return [
      { type: 'function', function: { name: 'get_crypto_price', description: 'Get live crypto price', parameters: { type: 'object', properties: { coin: { type: 'string' } }, required: ['coin'] } }},
      { type: 'function', function: { name: 'calculate', description: 'Calculate math expression', parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] } }},
      { type: 'function', function: { name: 'search_web', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }},
      { type: 'function', function: { name: 'run_python', description: 'Run Python code', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } }},
      { type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }},
    ]
  }

  async function callTool(name: string, args: any): Promise<string> {
    try {
      const res = await fetch(`${API_BASE}/api/tools/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      const data = await res.json()
      return data.result ?? data.error ?? JSON.stringify(data)
    } catch (e: any) {
      return `Error: ${e.message}`
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function switchCharacter(charId: string) {
    setSelectedChar(charId)
    setShowCharSelect(false)
    setMessages([])
  }

  // ── Character Select Screen ─────────────────────────────────────────────────
  if (showCharSelect) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 fade-in">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            CHARACTER FLOW
          </h1>
          <p className="text-muted text-lg">Multi-Agent AI System — Select Your Agent</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-6xl w-full">
          {characters.map(char => (
            <button
              key={char.id}
              onClick={() => switchCharacter(char.id)}
              style={{ borderColor: char.color + '40', background: 'var(--card)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = char.color + '15' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
              className="rounded-xl border-2 p-6 text-left transition-all duration-200 hover:scale-105 hover:shadow-lg group"
            >
              <div className="text-4xl mb-3">{char.emoji}</div>
              <div className="font-semibold text-base mb-1" style={{ color: char.color }}>{char.name}</div>
              <div className="text-sm text-muted">{char.role}</div>
              <div className="mt-3 text-xs text-muted group-hover:text-foreground transition-colors">
                Click to select →
              </div>
            </button>
          ))}
        </div>

        <div className="mt-12 text-center text-muted text-sm">
          <p>10 agents · LangGraph-powered · Real tools · Multi-turn memory</p>
        </div>
      </div>
    )
  }

  // ── Chat Screen ───────────────────────────────────────────────────────────────
  const char = getChar(selectedChar)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <button onClick={() => setShowCharSelect(true)} className="text-muted hover:text-foreground transition-colors text-sm">
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{char?.emoji}</span>
          <div>
            <div className="font-semibold text-sm" style={{ color: char?.color }}>{char?.name}</div>
            <div className="text-xs text-muted">{char?.role}</div>
          </div>
        </div>
        <div className="flex-1" />

        {/* Model selector */}
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer"
          style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
        >
          <option value="agnes-2.5-flash">agnes-2.5-flash</option>
          <option value="auto">auto</option>
        </select>

        {/* Team toggle */}
        <button
          onClick={() => setTeamMode(!teamMode)}
          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${teamMode ? 'px-3 py-1.5 rounded-lg text-sm font-medium' : ''}`}
          style={{
            background: teamMode ? '#FF4444' : 'var(--card)',
            color: teamMode ? 'white' : 'var(--muted)',
            border: `1px solid ${teamMode ? '#FF4444' : 'var(--border)'}`,
          }}
        >
          {teamMode ? '🚨 Team ON' : '👥 Team'}
        </button>

        {/* Character selector (compact) */}
        <div className="relative group">
          <button className="px-2 py-1 rounded-lg text-sm text-muted hover:text-foreground transition-colors">
            {char?.emoji} {selectedChar}
          </button>
          <div className="absolute top-full right-0 mt-2 hidden group-hover:block rounded-xl border p-2 z-50" style={{ background: 'var(--card)', borderColor: 'var(--border)', minWidth: 200 }}>
            <div className="text-xs text-muted px-2 py-1">Switch character:</div>
            {characters.map(c => (
              <button key={c.id} onClick={() => { setSelectedChar(c.id); setMessages([]); }}
                className="w-full text-left px-2 py-1.5 rounded-lg text-sm hover:opacity-80 transition-colors flex items-center gap-2"
                style={{ color: c.color, background: c.id === selectedChar ? c.color + '20' : 'transparent' }}
              >
                <span>{c.emoji}</span> {c.id}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-20 fade-in">
            <div className="text-6xl mb-4">{char?.emoji}</div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: char?.color }}>{char?.name}</h2>
            <p className="text-muted mb-6">{char?.role}</p>
            <div className="inline-flex gap-2 flex-wrap justify-center">
              {['What\'s Bitcoin price?', 'Explain quantum computing', 'Write a Python script', 'Help me with git'].map(suggestion => (
                <button key={suggestion} onClick={() => sendMessage(suggestion)}
                  className="px-4 py-2 rounded-full text-sm border transition-all hover:scale-105"
                  style={{ borderColor: char?.color + '60', color: 'var(--muted)', background: 'transparent' }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`max-w-3xl fade-in ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
            <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user' ? 'msg-user' : msg.role === 'tool' ? 'msg-tool' : 'msg-assistant'
            }`} style={msg.role === 'assistant' ? { borderColor: char?.color + '80' } : undefined}>
              {msg.content}
            </div>
            <div className="text-xs text-muted mt-1 px-1">
              {msg.role === 'user' ? 'You' : msg.role === 'tool' ? '⚡ Tool' : char?.emoji + ' ' + char?.name} · {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}

        {loading && (
          <div className="max-w-3xl mr-auto fade-in">
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--card)', borderLeft: `3px solid ${char?.color || '#7c3aed'}` }}>
              <span className="inline-block animate-pulse" style={{ color: char?.color }}>{char?.emoji}</span>
              <span className="text-muted ml-2">thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="border-t p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${char?.name}... (Enter to send, Shift+Enter for new line)`}
            rows={2}
            className="flex-1 rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all focus:ring-2"
            style={{
              background: 'var(--background)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              '--tw-ring-color': char?.color || '#7c3aed',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl font-medium text-sm transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: loading ? 'var(--muted)' : char?.color || '#7c3aed', color: 'white' }}
          >
            {loading ? '⏳' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  )
}
