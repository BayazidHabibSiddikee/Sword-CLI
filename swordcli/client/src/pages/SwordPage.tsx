import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

type SessionInfo = { id: string; title: string; workdir: string; mode: string; model: string | null; revision: number }
type Session = SessionInfo & { messages: { role: string; content?: string | null | Record<string, unknown>[] }[] }
type Memory = { sessionSummary: string; globalSummary: string }
type Hit = { sessionId: string; messageIndex: number; snippet: string }
type Envelope<T> = { success: boolean; data?: T; error?: string | { message?: string } }
const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/sword`

// Deliberately independent of the dashboard helper: no stored tokens or key discovery.
async function request<T>(key: string, path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method, signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => { throw new Error('Expected JSON from the Sword API. Check that the local backend is running.') }) as Envelope<T>
  if (!response.ok || !result.success || result.data === undefined) {
    if (response.status === 401) throw new Error('Unified key rejected. Log out and enter the key from Keys again.')
    if (response.status === 409) throw new Error('Session changed elsewhere. Refresh before retrying; your draft has been kept.')
    const detail = typeof result.error === 'string' ? result.error : result.error?.message
    throw new Error(detail || `Sword API request failed (${response.status}).`)
  }
  return result.data
}

function useOperation() {
  const controller = useRef<AbortController | null>(null)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  useEffect(() => () => { controller.current?.abort() }, [])
  function cancel() {
    controller.current?.abort()
    controller.current = null
    setPending('')
    setError('')
  }
  async function run(label: string, work: (signal: AbortSignal, current: () => boolean) => Promise<void>) {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    const current = () => controller.current === next && !next.signal.aborted
    setPending(label)
    setError('')
    try { await work(next.signal, current) } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : 'Unable to complete request.')
    } finally { if (current()) setPending('') }
  }
  return { pending, error, cancel, run }
}

export default function SwordPage() {
  const [keyInput, setKeyInput] = useState('')
  const [auth, setAuth] = useState<{ key: string; sessions: SessionInfo[] } | null>(null)
  const operation = useOperation()
  function logout() {
    operation.cancel()
    setAuth(null)
    setKeyInput('')
  }
  return (
    <div className="space-y-6">
      <PageHeader title="SwordCLI" description="Shared sessions, conversation history, and project memory."
        actions={auth && <Button variant="outline" onClick={logout}>Log out</Button>} />
      <div className="rounded-2xl border bg-muted/40 p-4 text-sm space-y-2">
        <Badge variant="secondary">Text-only chat · server tools disabled</Badge>
        <p>Local single-user use only. Do not expose this dashboard to remote access. No uploads, command execution, or tool execution are available here.</p>
        <p className="text-muted-foreground">Use your unified API key from <Link to="/keys" className="underline">Keys</Link>, not a provider key or dashboard password. This page keeps the credential only in component memory, never in storage or the URL. Leaving this page or logging out clears it.</p>
      </div>
      {auth ? <SwordWorkspace credential={auth.key} initialSessions={auth.sessions} /> : (
        <form className="max-w-lg rounded-3xl border bg-card p-5 space-y-3" onSubmit={event => {
          event.preventDefault()
          if (operation.pending || !keyInput.trim()) return
          const key = keyInput.trim()
          void operation.run('Connecting…', async (signal, current) => {
            const data = await request<{ sessions: SessionInfo[] }>(key, '/sessions', signal)
            if (current()) { setAuth({ key, sessions: data.sessions }); setKeyInput('') }
          })
        }}>
          <Label htmlFor="sword-key">Unified API key</Label>
          <Input id="sword-key" type="password" autoComplete="off" spellCheck={false} required
            value={keyInput} onChange={event => setKeyInput(event.target.value)} disabled={!!operation.pending} />
          <Button type="submit" disabled={!!operation.pending || !keyInput.trim()}>Connect</Button>
          <RequestStatus pending={operation.pending} error={operation.error} />
        </form>
      )}
    </div>
  )
}

function RequestStatus({ pending, error }: { pending: string; error: string }) {
  return <>
    {pending && <p role="status" className="text-sm text-muted-foreground">{pending}</p>}
    {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap wrap-anywhere">{error}</p>}
  </>
}

function SwordWorkspace({ credential, initialSessions }: { credential: string; initialSessions: SessionInfo[] }) {
  const [sessions, setSessions] = useState(initialSessions)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [memory, setMemory] = useState<Memory | null>(null)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [workdir, setWorkdir] = useState('')
  const [mode, setMode] = useState('coding')
  const [model, setModel] = useState('auto')
  const operation = useOperation()
  const busy = !!operation.pending
  const path = (id: string) => `/sessions/${encodeURIComponent(id)}`

  async function readSession(id: string, signal: AbortSignal, current: () => boolean) {
    const [detail, summaries] = await Promise.all([
      request<{ session: Session }>(credential, path(id), signal),
      request<{ memory: Memory }>(credential, `${path(id)}/memory`, signal),
    ])
    if (current()) { setSession(detail.session); setMemory(summaries.memory) }
  }
  function clearSelection(id: string | null) {
    // Invalidate immediately rather than waiting for an effect after rendering.
    operation.cancel()
    setSelectedId(id)
    setSession(null)
    setMemory(null)
    setHits(null)
    setQuery('')
    setDraft('')
  }
  function select(id: string) {
    clearSelection(id)
    void operation.run('Loading session…', (signal, current) => readSession(id, signal, current))
  }
  function refresh() {
    void operation.run('Refreshing…', async (signal, current) => {
      const [list] = await Promise.all([
        request<{ sessions: SessionInfo[] }>(credential, '/sessions', signal),
        selectedId ? readSession(selectedId, signal, current) : Promise.resolve(),
      ])
      if (current()) { setSessions(list.sessions); setHits(null) }
    })
  }
  function create() {
    if (busy || !title.trim() || !workdir.trim()) return
    clearSelection(null)
    void operation.run('Creating session…', async (signal, current) => {
      const data = await request<{ session: Session }>(credential, '/sessions', signal, 'POST', {
        title: title.trim(), workdir: workdir.trim(), mode, model: model.trim() || 'auto',
      })
      if (!current()) return
      setSessions(previous => [data.session, ...previous])
      setSelectedId(data.session.id)
      setSession(data.session)
      setTitle('')
      await readSession(data.session.id, signal, current)
    })
  }
  function remove() {
    if (!session || busy || !window.confirm(`Delete “${session.title}” and its stored history? This cannot be undone.`)) return
    const id = session.id
    void operation.run('Deleting session…', async (signal, current) => {
      await request<{ deleted: string | boolean }>(credential, path(id), signal, 'DELETE')
      if (!current()) return
      setSessions(previous => previous.filter(item => item.id !== id))
      clearSelection(null)
    })
  }
  function send() {
    if (!session || busy || !draft.trim()) return
    const active = session
    void operation.run('Waiting for text reply…', async (signal, current) => {
      const data = await request<{ session: Session }>(credential, `${path(active.id)}/chat`, signal, 'POST', {
        content: draft, revision: active.revision,
      })
      if (!current()) return
      setSession(data.session)
      setDraft('')
      setHits(null)
      setMemory(null)
      setSessions(previous => previous.map(item => item.id === active.id ? data.session : item))
      const summaries = await request<{ memory: Memory }>(credential, `${path(active.id)}/memory`, signal)
      if (current()) setMemory(summaries.memory)
    })
  }
  function search() {
    if (!selectedId || busy || !query.trim()) return
    setHits(null)
    void operation.run('Searching memory…', async (signal, current) => {
      const data = await request<{ hits: Hit[] }>(credential, `${path(selectedId)}/search?q=${encodeURIComponent(query.trim())}`, signal)
      if (current()) setHits(data.hits)
    })
  }



  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy} onClick={refresh}>Refresh sessions and memory</Button>
        <RequestStatus pending={operation.pending} error={operation.error} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-4">
          <section className="rounded-3xl border bg-card p-4 space-y-3" aria-label="Sessions">
            <h2 className="font-medium text-sm">Sessions</h2>
            {!sessions.length && <p className="text-sm text-muted-foreground">No sessions yet. Create one below.</p>}
            <div className="max-h-80 overflow-y-auto space-y-1">
              {sessions.map(item => <button key={item.id} type="button" onClick={() => select(item.id)}
                aria-pressed={selectedId === item.id}
                className={`w-full rounded-xl p-2 text-left text-sm focus-visible:outline-2 ${selectedId === item.id ? 'bg-accent' : 'hover:bg-muted'}`}>
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-xs text-muted-foreground truncate">{item.model || 'auto'} · {item.workdir}</div>
              </button>)}
            </div>
          </section>
          <form className="rounded-3xl border bg-card p-4 space-y-3" onSubmit={event => { event.preventDefault(); create() }}>
            <h2 className="font-medium text-sm">New session</h2>
            <Label htmlFor="sword-title">Title</Label>
            <Input id="sword-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={500} disabled={busy} />
            <Label htmlFor="sword-workdir">Working directory</Label>
            <Input id="sword-workdir" value={workdir} onChange={event => setWorkdir(event.target.value)} placeholder="/absolute/project/path" required maxLength={4096} disabled={busy} />
            <p className="text-xs text-muted-foreground">Project scope for memory; this page does not read or execute files.</p>
            <Label htmlFor="sword-mode">Mode</Label>
            <select id="sword-mode" className="w-full rounded-lg border bg-background p-2 text-sm" value={mode} onChange={event => setMode(event.target.value)} disabled={busy}>
              <option value="coding">Coding</option><option value="marketing-video">Marketing video (text planning)</option>
            </select>
            <Label htmlFor="sword-model">Model ID</Label>
            <Input id="sword-model" value={model} onChange={event => setModel(event.target.value)} placeholder="auto" maxLength={200} disabled={busy} />
            <Button type="submit" disabled={busy || !title.trim() || !workdir.trim()}>Create session</Button>
          </form>
        </aside>
        <div className="min-w-0 space-y-4">
          {!session ? <p className="rounded-3xl border p-6 text-sm text-muted-foreground">{selectedId ? 'Loading failed or is in progress. Use Refresh to retry.' : 'Select or create a session to view its full transcript.'}</p> : <>
            <section className="rounded-3xl border bg-card p-4 space-y-4" aria-label="Conversation">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-medium wrap-anywhere">{session.title}</h2>
                  <p className="text-xs text-muted-foreground wrap-anywhere">{session.id} · revision {session.revision}</p>
                  <p className="text-xs text-muted-foreground wrap-anywhere">{session.mode} · {session.model || 'auto'} · {session.workdir}</p>
                </div>
                <Button variant="destructive" disabled={busy} onClick={remove}>Delete session</Button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto space-y-4" tabIndex={0} aria-label="Full transcript">
                {!session.messages.length && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                {session.messages.map((message, index) => <article key={`${session.id}-${index}`} className="rounded-xl border p-3">
                  <h3 className="text-xs font-medium mb-2">{message.role} · message {index}</h3>
                  <pre className="font-sans text-sm whitespace-pre-wrap wrap-anywhere">{typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? null, null, 2)}</pre>
                </article>)}
              </div>
              <form className="space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); send() }}>
                <Label htmlFor="sword-message">Message (text only)</Label>
                <Textarea id="sword-message" value={draft} onChange={event => setDraft(event.target.value)} rows={3} maxLength={32000} disabled={busy} required />
                <Button type="submit" disabled={busy || !draft.trim()}>Send message</Button>
                <p className="text-xs text-muted-foreground">Switching sessions cancels display updates, not necessarily server work. Refresh before retrying an interrupted send.</p>
              </form>
            </section>
            <div className="grid sm:grid-cols-2 gap-4">
              <MemoryPanel title="Session memory" text={memory?.sessionSummary} />
              <MemoryPanel title="Global memory (working directory)" text={memory?.globalSummary} />
            </div>
            <section className="rounded-3xl border bg-card p-4 space-y-3" aria-label="Memory search">
              <form className="space-y-3" onSubmit={event => { event.preventDefault(); search() }}>
                <Label htmlFor="sword-search">Search memory</Label>
                <div className="flex gap-2">
                  <Input id="sword-search" value={query} onChange={event => { setQuery(event.target.value); setHits(null) }} maxLength={200} disabled={busy} />
                  <Button type="submit" variant="outline" disabled={busy || !query.trim()}>Search</Button>
                </div>
              </form>
              {hits?.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
              {hits?.map((hit, index) => <article key={`${hit.sessionId}-${hit.messageIndex}-${index}`} className="border-t pt-3">
                <p className="text-xs text-muted-foreground wrap-anywhere">Source: {hit.sessionId} · message {hit.messageIndex}</p>
                <p className="text-sm whitespace-pre-wrap wrap-anywhere">{hit.snippet}</p>
              </article>)}
            </section>
          </>}
        </div>
      </div>
    </div>
  )
}

function MemoryPanel({ title, text }: { title: string; text?: string }) {
  return <section className="rounded-3xl border bg-card p-4 space-y-3">
    <h2 className="text-sm font-medium">{title}</h2>
    <pre className="max-h-64 overflow-y-auto font-sans text-sm whitespace-pre-wrap wrap-anywhere">{text ?? 'Memory unavailable. Refresh to load.'}{text === '' ? 'No memory recorded yet.' : ''}</pre>
  </section>
}

