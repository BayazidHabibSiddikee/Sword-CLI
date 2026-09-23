import { apiFetch, getToken } from './api'

// ---- Types (mirror server /api/agent) ----

export interface AgentSession {
  id: string
  title: string | null
  workdir: string
  model: string | null
  system_prompt: string | null
  max_turns: number
  tool_allow: string | null
  tool_deny: string
  shell_timeout_ms: number | null
  character: string | null
  voice: string
  created_at: string
  updated_at: string
  messageCount?: number
}

export interface AgentMessageRow {
  id: number
  session_id: string
  seq: number
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_calls: string | null
  tool_call_id: string | null
  name: string | null
  created_at: string
}

export interface AgentMcpServer {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export interface AgentToolInfo {
  name: string
  description: string
  source: string
}

export interface AgentCharacter {
  id: string
  name: string
  voice: string
  hint: string
  systemPrompt: string | null
}

export async function listCharacters(): Promise<AgentCharacter[]> {
  return apiFetch<{ data: { characters: AgentCharacter[] } }>('/api/agent/characters')
    .then((r) => r.data.characters)
}

// ---- Non-stream endpoints (JSON envelope) ----

export async function listSessions(): Promise<{ sessions: AgentSession[]; total: number }> {
  return apiFetch<{ sessions: AgentSession[]; total: number }>('/api/agent/sessions')
}

export async function createSession(body: {
  workdir: string
  title?: string
  model?: string | null
  systemPrompt?: string | null
  maxTurns?: number
  toolDeny?: string[]
  shellTimeoutMs?: number | null
  character?: string | null
  voice?: string
}): Promise<AgentSession> {
  return apiFetch<{ data: AgentSession }>('/api/agent/sessions', { method: 'POST', body: JSON.stringify(body) })
    .then((r) => r.data)
}

export async function getSession(id: string): Promise<AgentSession & { recentMessages: AgentMessageRow[] }> {
  return apiFetch<{ data: AgentSession & { recentMessages: AgentMessageRow[] } }>(`/api/agent/sessions/${id}`)
    .then((r) => r.data)
}

export async function patchSession(
  id: string,
  body: {
    title?: string
    workdir?: string
    model?: string | null
    systemPrompt?: string | null
    maxTurns?: number
    toolDeny?: string[]
    shellTimeoutMs?: number | null
    character?: string | null
    voice?: string
  },
): Promise<AgentSession> {
  return apiFetch<{ data: AgentSession }>(`/api/agent/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    .then((r) => r.data)
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/api/agent/sessions/${id}`, { method: 'DELETE' })
}

export async function listTools(sessionId?: string): Promise<AgentToolInfo[]> {
  const path = sessionId
    ? `/api/agent/sessions/${sessionId}/tools`
    : '/api/agent/tools'
  const r = await apiFetch<{ tools: AgentToolInfo[] }>(path)
  return r.tools
}

export async function getMcpConfig(): Promise<{ servers: AgentMcpServer[] }> {
  return apiFetch<{ data: { config: { servers: AgentMcpServer[] } } }>('/api/agent/mcp')
    .then((r) => r.data.config)
}

export async function putMcpConfig(servers: AgentMcpServer[]): Promise<{ servers: AgentMcpServer[] }> {
  return apiFetch<{ data: { servers: AgentMcpServer[] } }>('/api/agent/mcp', {
    method: 'PUT',
    body: JSON.stringify({ servers }),
  }).then((r) => r.data)
}

export async function reloadMcp(): Promise<{ reloaded: number }> {
  return apiFetch<{ data: { reloaded: number } }>('/api/agent/mcp/reload', { method: 'POST' }).then((r) => r.data)
}

// ---- Streaming chat ----

export type AgentSseEvent =
  | { type: 'start'; turn: number }
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; id: string; ok: boolean; preview: string; truncated: boolean }
  | { type: 'done'; text: string; turns: number }
  | { type: 'error'; error: string; hint?: string }

export interface AgentStreamHandle {
  abort: () => void
  done: Promise<void>
}

/**
 * POST a chat message and stream the SSE events back. `onEvent` fires for each
 * event; `done` resolves when the stream ends (success or error). Returns
 * an abort handle so the caller can cancel mid-stream.
 */
export function streamMessage(
  sessionId: string,
  content: string,
  onEvent: (ev: AgentSseEvent) => void,
): AgentStreamHandle {
  const controller = new AbortController()
  const token = getToken()
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')

  const done = (async () => {
    let res: Response
    try {
      res = await fetch(`${base}/api/agent/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onEvent({ type: 'error', error: String((err as Error).message) })
      return
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      onEvent({ type: 'error', error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}` })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const dataLines = frame
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
        for (const raw of dataLines) {
          try {
            onEvent(JSON.parse(raw) as AgentSseEvent)
          } catch {
            // ignore malformed frame
          }
        }
      }
    }
  })()

  return { abort: () => controller.abort(), done }
}
