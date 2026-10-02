import { apiFetch } from './api'

// ---- Channels ---------------------------------------------------------------
// A connection is a saved destination for agent output: a Telegram chat, a
// Discord/Slack webhook, or a generic webhook. The bot token is write-only — the
// server never returns it, so a view only says whether one is stored.

export type Platform = 'telegram' | 'discord' | 'slack' | 'webhook'

export interface ChannelConnection {
  id: string
  platform: Platform
  label: string
  agentId: string
  target: string
  hasSecret: boolean
  /** OpenClaw-style session key: agent:<agentId>:<platform>:<kind>:<target>. */
  session: string
  createdAt: string
  updatedAt: string
}

export interface ChannelInput {
  id?: string
  platform: Platform
  label?: string
  agentId?: string
  target: string
  secret?: string
}

export interface DeliveryResult {
  ok: boolean
  detail: string
  messageId?: string
}

export const PLATFORMS: Array<{ value: Platform; label: string; targetHint: string; needsToken: boolean }> = [
  { value: 'telegram', label: 'Telegram', targetHint: 'Chat id (e.g. 123456789) or @channelname', needsToken: true },
  { value: 'discord', label: 'Discord', targetHint: 'Discord webhook URL', needsToken: false },
  { value: 'slack', label: 'Slack', targetHint: 'Slack incoming-webhook URL', needsToken: false },
  { value: 'webhook', label: 'Webhook', targetHint: 'Any https endpoint that accepts JSON', needsToken: false },
]

export function listChannels(): Promise<{ connections: ChannelConnection[] }> {
  return apiFetch('/api/channels')
}

export function saveChannel(input: ChannelInput): Promise<{ connection: ChannelConnection }> {
  return apiFetch('/api/channels', { method: 'POST', body: JSON.stringify(input) })
}

export function deleteChannel(id: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/channels/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function verifyChannel(id: string): Promise<DeliveryResult> {
  return apiFetch(`/api/channels/${encodeURIComponent(id)}/verify`, { method: 'POST' })
}

export function sendChannel(id: string, text: string): Promise<DeliveryResult> {
  return apiFetch(`/api/channels/${encodeURIComponent(id)}/send`, { method: 'POST', body: JSON.stringify({ text }) })
}