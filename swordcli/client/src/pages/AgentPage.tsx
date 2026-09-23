import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Plus, Trash2, Wrench, Settings2, Save, Loader2, Terminal, X } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  apiFetch,
} from '@/lib/api'
import type { AgentSession, AgentSseEvent, AgentMcpServer, AgentStreamHandle } from '@/lib/agent'
import {
  listSessions, createSession, getSession, patchSession, deleteSession,
  getMcpConfig, putMcpConfig, reloadMcp, streamMessage, listTools, listCharacters,
} from '@/lib/agent'

// ---- Chat transcript state ----

interface ToolEventItem {
  kind: 'tool'
  id: string
  name: string
  args: string
  result?: { ok: boolean; preview: string; truncated: boolean }
}
interface AssistantEventItem {
  kind: 'assistant'
  key: number
  text: string
  pending: boolean
}
type TranscriptItem = ToolEventItem | AssistantEventItem

function parseJsonArray(raw: string | null): unknown[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Hydrate persisted history (assistant+tool messages) into transcript items.
function hydrateHistory(messages: { role: string; content: string; tool_calls: string | null; tool_call_id: string | null; name: string | null }[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  const pending = new Map<string, ToolEventItem>()
  for (const m of messages) {
    if (m.role === 'assistant') {
      const calls = parseJsonArray(m.tool_calls) as { id: string; function: { name: string; arguments: string } }[]
      for (const c of calls) {
        const item: ToolEventItem = { kind: 'tool', id: c.id, name: c.function.name, args: c.function.arguments }
        pending.set(c.id, item)
        items.push(item)
      }
      if (m.content.trim()) {
        items.push({ kind: 'assistant', key: items.length, text: m.content, pending: false })
      }
    } else if (m.role === 'tool') {
      const tool = m.tool_call_id ? pending.get(m.tool_call_id) : undefined
      if (tool) {
        tool.result = { ok: !m.content.toLowerCase().includes('failed') && !m.content.includes('escapes workdir'), preview: m.content.slice(0, 1500), truncated: m.content.length > 1500 }
      } else {
        items.push({
          kind: 'tool',
          id: m.tool_call_id ?? `anon-${items.length}`,
          name: m.name ?? 'tool',
          args: '',
          result: { ok: true, preview: m.content.slice(0, 1500), truncated: m.content.length > 1500 },
        })
      }
    } else if (m.role === 'user') {
      items.push({ kind: 'assistant', key: items.length, text: `You: ${m.content}`, pending: false })
    }
  }
  return items
}

export default function AgentPage() {
  const qc = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const handleRef = useRef<AgentStreamHandle | null>(null)
  const keyCounter = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: session } = useQuery({
    queryKey: ['agent', 'session', selectedId],
    queryFn: () => getSession(selectedId!),
    enabled: !!selectedId,
  })
  useEffect(() => {
    if (session?.recentMessages) {
      setTranscript(hydrateHistory(session.recentMessages))
    } else {
      setTranscript([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, session])

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['agent', 'sessions'] })
    if (selectedId) qc.invalidateQueries({ queryKey: ['agent', 'session', selectedId] })
  }, [qc, selectedId])

  const { data: sessionsData } = useQuery({
    queryKey: ['agent', 'sessions'],
    queryFn: listSessions,
  })
  const sessions = sessionsData?.sessions ?? []

  const { data: modelsData } = useQuery({
    queryKey: ['agent', 'models'],
    queryFn: () => apiFetch<any[]>('/api/models'),
  })
  const models: { modelId: string; displayName: string; platform: string }[] = modelsData ?? []

  const { data: mcpConfig } = useQuery({
    queryKey: ['agent', 'mcp'],
    queryFn: getMcpConfig,
  })

  const { data: toolList } = useQuery({
    queryKey: ['agent', 'tools', selectedId],
    queryFn: () => listTools(selectedId ?? undefined),
    enabled: !!selectedId,
  })

  const { data: charactersData } = useQuery({
    queryKey: ['agent', 'characters'],
    queryFn: listCharacters,
  })
  const characters = charactersData ?? []

  const createMut = useMutation({
    mutationFn: (body: Parameters<typeof createSession>[0]) => createSession(body),
    onSuccess: (s) => {
      invalidate()
      setSelectedId(s.id)
      setShowNew(false)
      setTranscript([])
    },
  })
  const deleteMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      invalidate()
      if (selectedId) {
        setSelectedId(null)
        setTranscript([])
      }
    },
  })
  const mcpMut = useMutation({
    mutationFn: async (servers: AgentMcpServer[]) => {
      const saved = await putMcpConfig(servers)
      await reloadMcp()
      return saved
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'mcp'] })
      qc.invalidateQueries({ queryKey: ['agent', 'tools'] })
    },
  })

  // ---- Send a message + stream events into the transcript ----
  const send = useCallback((text: string) => {
    if (!selectedId || streaming || !text.trim()) return
    setTranscript((prev) => [...prev, { kind: 'assistant', key: keyCounter.current++, text: '', pending: true }])
    setStreaming(true)
    const assistantKey = keyCounter.current - 1
    const toolStart = new Map<string, number>()

    const push = (ev: AgentSseEvent) => {
      setTranscript((prev) => {
        const next = [...prev]
        switch (ev.type) {
          case 'token':
            for (let i = next.length - 1; i >= 0; i--) {
              const item = next[i]
              if (item.kind === 'assistant' && item.key === assistantKey) {
                next[i] = { ...item, text: item.text + ev.delta }
                break
              }
            }
            break
          case 'tool_call':
            toolStart.set(ev.id, Date.now())
            next.push({ kind: 'tool', id: ev.id, name: ev.name, args: JSON.stringify(ev.arguments ?? {}) })
            break
          case 'tool_result': {
            for (let i = next.length - 1; i >= 0; i--) {
              const item = next[i]
              if (item.kind === 'tool' && item.id === ev.id) {
                next[i] = { ...item, result: { ok: ev.ok, preview: ev.preview, truncated: ev.truncated } }
                break
              }
            }
            break
          }
          case 'done':
            break
          case 'error': {
            const errItem: TranscriptItem = { kind: 'assistant', key: keyCounter.current++, text: `**error:** ${ev.error}${ev.hint ? ` ${ev.hint}` : ''}`, pending: false }
            next.push(errItem)
            break
          }
        }
        return next
      })
    }

    handleRef.current = streamMessage(selectedId, text, (ev) => push(ev))
    void handleRef.current.done.finally(() => setStreaming(false))
  }, [selectedId, streaming])

  const onKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = draft
      setDraft('')
      send(text)
    }
  }, [draft, send])

  // Autoscroll to bottom as the transcript grows.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [transcript, streaming])

  return (
    <div>
      <PageHeader
        title="Agent"
        description="Run tasks with a coding agent — tool calls, shell, files, and MCP tools inside a sandboxed workdir."
        actions={
          <div className="flex items-center gap-2">
            {selectedId && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
                  <Settings2 className="size-3.5 mr-1" /> Settings
                </Button>
                <Button variant="outline" size="sm" onClick={() => deleteMut.mutate(selectedId)}>
                  <Trash2 className="size-3.5 mr-1" /> Delete
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="size-3.5 mr-1" /> New session
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ---- Session list ---- */}
        <div className="space-y-3">
          <div className="rounded-3xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider px-1 pb-2">Sessions</p>
            <div className="space-y-1 max-h-[420px] overflow-y-auto">
              {sessions.length === 0 && (
                <p className="text-xs text-muted-foreground px-1 py-4">No sessions yet — create one to start.</p>
              )}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left rounded-xl px-3 py-2 text-xs transition-colors ${
                    s.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{s.title || s.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{s.messageCount ?? 0}</span>
                  </div>
                  <div className="truncate text-muted-foreground">{s.model ?? 'auto'} · {s.workdir}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tools catalog */}
          <div className="rounded-3xl border bg-card p-3">
            <div className="flex items-center gap-2 px-1 pb-2">
              <Wrench className="size-3.5" />
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Tools {selectedId ? '' : '(default)'}
              </p>
            </div>
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {(toolList ?? []).map((t) => (
                <div key={t.name} className="px-2 py-1 text-xs rounded-lg hover:bg-accent/50" title={t.description}>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground ml-2">{t.source.replace(/^mcp\./, 'mcp:')}</span>
                </div>
              ))}
              {(toolList ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground px-1">Loading catalog…</p>
              )}
            </div>
          </div>
        </div>

        {/* ---- Chat ---- */}
        <div className="space-y-4 min-w-0">
          {showNew && <NewSessionForm onCreate={(wd, body) => createMut.mutate({ workdir: wd, ...body })} onClose={() => setShowNew(false)} busy={createMut.isPending} models={models} characters={characters} />}

          {showSettings && session && (
            <SessionSettings
              key={session.id}
              session={session}
              models={models}
              mcpServers={mcpConfig?.servers ?? []}
              onMcp={async (servers) => {
                await mcpMut.mutateAsync(servers)
              }}
              mcpBusy={mcpMut.isPending}
              onSaved={invalidate}
              onClose={() => setShowSettings(false)}
            />
          )}

          <div className="rounded-3xl border bg-card flex flex-col min-h-[420px] max-h-[60vh]">
            <div className="px-4 py-2 border-b flex items-center gap-2">
              <Terminal className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {session ? `${session.workdir} · ${session.model ?? 'auto'} · ${session.max_turns} max turns${session.character ? ` · 👤 ${session.character}` : ''}` : 'Select or create a session'}
              </span>
              {streaming && <Badge className="ml-auto"><Loader2 className="size-3 animate-spin mr-1" /> running</Badge>}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {transcript.length === 0 && !streaming && (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <Bot className="size-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Send a task to the agent. It will use file, shell, RAG and memory tools to complete it.</p>
                </div>
              )}
              {transcript.map((item) => {
                if (item.kind === 'assistant') {
                  const isUser = item.text.startsWith('You: ')
                  return (
                    <div key={item.key}>
                      <div className={`text-xs mb-1 ${isUser ? 'text-muted-foreground' : 'text-blue-500'}`}>{isUser ? 'you' : 'agent'}</div>
                      <div className="text-sm whitespace-pre-wrap">{isUser ? item.text.slice(5) : item.text || (item.pending ? '…' : '')}</div>
                    </div>
                  )
                }
                return (
                  <div key={item.id} className="rounded-xl border bg-accent/30 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Wrench className="size-3" />
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground truncate flex-1" title={item.args}>{item.args}</span>
                      {item.result && (
                        <Badge variant="outline" className={item.result.ok ? 'text-green-600' : 'text-red-500'}>
                          {item.result.ok ? 'ok' : 'failed'}{item.result.truncated ? ' · truncated' : ''}
                        </Badge>
                      )}
                      {!item.result && streaming && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                    </div>
                    {item.result && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">result</summary>
                        <pre className="mt-1 text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto text-muted-foreground">{item.result.preview}</pre>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="p-3 border-t flex gap-2 items-end">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder={selectedId ? 'Describe a task… (Enter to send, Shift+Enter for newline)' : 'Select a session to chat'}
                disabled={!selectedId || streaming}
                rows={2}
                className="flex-1 min-h-[52px]"
              />
              <Button onClick={() => { const t = draft; setDraft(''); send(t) }} disabled={!selectedId || streaming || !draft.trim()}>
                Send
              </Button>
              {streaming && (
                <Button variant="ghost" onClick={() => handleRef.current?.abort()}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- New session form ----

function NewSessionForm({
  onCreate, onClose, busy, models, characters,
}: {
  onCreate: (workdir: string, body: {
    title?: string
    model?: string | null
    maxTurns?: number
    systemPrompt?: string | null
    character?: string | null
    voice?: string
  }) => void
  onClose: () => void
  busy: boolean
  models: { modelId: string; displayName: string; platform: string }[]
  characters: { id: string; name: string; voice: string; hint: string }[]
}) {
  const [workdir, setWorkdir] = useState('')
  const [title, setTitle] = useState('')
  const [model, setModel] = useState('')
  const [maxTurns, setMaxTurns] = useState(10)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [character, setCharacter] = useState('')
  return (
    <div className="rounded-3xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">New agent session</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="size-3.5" /></Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Working directory</Label>
          <Input value={workdir} onChange={(e) => setWorkdir(e.target.value)} placeholder="/home/user/project" />
        </div>
        <div className="space-y-1">
          <Label>Title (optional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="my task" />
        </div>
        <div className="space-y-1">
          <Label>Max model turns</Label>
          <Input type="number" min={1} max={50} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>Model (blank = auto-route)</Label>
          <Input list="agent-new-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="auto" />
          <datalist id="agent-new-models">
            {models.map((m) => <option key={m.modelId} value={m.modelId}>{m.displayName}</option>)}
          </datalist>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Character (persona + voice)</Label>
          <select className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={character} onChange={(e) => setCharacter(e.target.value)}>
            <option value="">none (default agent)</option>
            {characters.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name} — {ch.hint} ({ch.voice})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>System prompt override (optional)</Label>
        <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={2} placeholder="Default coding-agent prompt" />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            const ch = characters.find((x) => x.id === character)
            onCreate(workdir.trim() || '.', {
              title: title.trim() || undefined,
              model: model.trim() || null,
              maxTurns,
              systemPrompt: systemPrompt.trim() || null,
              character: character || null,
              ...(ch ? { voice: ch.voice } : {}),
            })
          }
          }
          disabled={busy || !workdir.trim()}
        >
          <Plus className="size-3.5 mr-1" /> Create
        </Button>
      </div>
    </div>
  )
}

// ---- Session settings ----

function SessionSettings({
  session, models, mcpServers, onMcp, mcpBusy, onSaved, onClose,
}: {
  session: AgentSession
  models: { modelId: string; displayName: string; platform: string }[]
  mcpServers: AgentMcpServer[]
  onMcp: (servers: AgentMcpServer[]) => Promise<unknown>
  mcpBusy: boolean
  onSaved: () => void
  onClose: () => void
}) {
  const [model, setModel] = useState(session.model ?? '')
  const [systemPrompt, setSystemPrompt] = useState(session.system_prompt ?? '')
  const [maxTurns, setMaxTurns] = useState(session.max_turns)
  const [toolDeny, setToolDeny] = useState<string>(
    (() => {
      try {
        const arr = JSON.parse(session.tool_deny || '[]')
        return Array.isArray(arr) ? arr.join(', ') : ''
      } catch {
        return ''
      }
    })(),
  )
  const [shellTimeoutMs, setShellTimeoutMs] = useState(session.shell_timeout_ms ?? 120000)
  const [servers, setServers] = useState<AgentMcpServer[]>(mcpServers)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await patchSession(session.id, {
        model: model.trim() || null,
        systemPrompt: systemPrompt.trim() || null,
        maxTurns,
        toolDeny: toolDeny.split(',').map((s) => s.trim()).filter(Boolean),
        shellTimeoutMs,
      })
      await onMcp(servers)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const [show, setShow] = useState(false)
  const [addServer, setAddServer] = useState<AgentMcpServer>({ name: '', command: '' })

  return (
    <div className="rounded-3xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Session settings — {session.id.slice(0, 8)}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShow(!show)}><Wrench className="size-3.5 mr-1" /> MCP</Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="size-3.5" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Model</Label>
          <Input list="agent-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="auto" />
          <datalist id="agent-models">
            {models.map((m) => <option key={m.modelId} value={m.modelId}>{m.displayName}</option>)}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label>Max turns</Label>
          <Input type="number" min={1} max={50} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>Shell timeout (ms)</Label>
          <Input type="number" min={1000} value={shellTimeoutMs} onChange={(e) => setShellTimeoutMs(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>Denied tools (comma-separated)</Label>
          <Input value={toolDeny} onChange={(e) => setToolDeny(e.target.value)} placeholder="run_shell" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>System prompt</Label>
        <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} placeholder="Default coding-agent prompt" />
      </div>

      {show && (
        <div className="space-y-3 rounded-2xl border p-3">
          <p className="text-xs text-muted-foreground">External MCP servers (stdio). Their tools appear in the catalog as <code>mcp.{'<server>'}.{'<tool>'}</code>.</p>
          {servers.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input className="w-28" value={s.name} onChange={(e) => setServers((prev) => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))} placeholder="name" />
              <Input className="w-40" value={s.command} onChange={(e) => setServers((prev) => prev.map((p, j) => j === i ? { ...p, command: e.target.value } : p))} placeholder="node" />
              <Input
                className="flex-1"
                value={(s.args ?? []).join(' ')}
                onChange={(e) => setServers((prev) => prev.map((p, j) => j === i ? { ...p, args: e.target.value.split(' ').filter(Boolean) } : p))}
                placeholder="args (space-separated)"
              />
              <Button variant="ghost" size="sm" onClick={() => setServers((prev) => prev.filter((_, j) => j !== i))}><X className="size-3.5" /></Button>
            </div>
          ))}
          <div className="flex gap-2 items-center">
            <Input className="w-28" value={addServer.name} onChange={(e) => setAddServer((s) => ({ ...s, name: e.target.value }))} placeholder="name" />
            <Input className="w-40" value={addServer.command} onChange={(e) => setAddServer((s) => ({ ...s, command: e.target.value }))} placeholder="node" />
            <Input
              className="flex-1"
              value={(addServer.args ?? []).join(' ')}
              onChange={(e) => setAddServer((s) => ({ ...s, args: e.target.value.split(' ').filter(Boolean) }))}
              placeholder="args"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (addServer.name && addServer.command) {
                  setServers((prev) => [...prev, addServer])
                  setAddServer({ name: '', command: '' })
                }
              }}
            >
              <Plus className="size-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={save} disabled={saving || mcpBusy}>
          {saving || mcpBusy ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Save className="size-3.5 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  )
}
