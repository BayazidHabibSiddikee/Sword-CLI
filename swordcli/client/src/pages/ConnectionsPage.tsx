import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, Loader2, Plus, Send, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  PLATFORMS, deleteChannel, listChannels, saveChannel, sendChannel, verifyChannel,
  type ChannelConnection, type Platform,
} from '@/lib/channels'

const PLATFORM_FIELD = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export default function ConnectionsPage() {
  const qc = useQueryClient()
  const channels = useQuery({ queryKey: ['channels'], queryFn: listChannels })

  const [platform, setPlatform] = useState<Platform>('telegram')
  const [label, setLabel] = useState('')
  const [target, setTarget] = useState('')
  const [agentId, setAgentId] = useState('main')
  const [secret, setSecret] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})

  const spec = PLATFORMS.find(p => p.value === platform)!

  const create = useMutation({
    mutationFn: () => saveChannel({ platform, label: label || undefined, target, agentId, secret: secret || undefined }),
    onSuccess: () => {
      setLabel(''); setTarget(''); setSecret('')
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const remove = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })

  const verify = useMutation({
    mutationFn: verifyChannel,
    onSuccess: (data, id) => setNote(prev => ({ ...prev, [id]: `${data.ok ? '✓' : '✗'} ${data.detail}` })),
    onError: (error, id) => setNote(prev => ({ ...prev, [id]: `✗ ${(error as Error).message}` })),
  })

  const send = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => sendChannel(id, text),
    onSuccess: (data, { id }) => setNote(prev => ({ ...prev, [id]: `✓ sent${data.messageId ? ` (id ${data.messageId})` : ''}` })),
    onError: (error, { id }) => setNote(prev => ({ ...prev, [id]: `✗ ${(error as Error).message}` })),
  })

  const items: ChannelConnection[] = channels.data?.connections ?? []

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Send agent output to Telegram, Discord, Slack or a webhook. Tokens are stored locally and never read back."
      />

      <div className="space-y-8">
        {/* Add a connection */}
        <section className="rounded-lg border border-border p-4 space-y-4">
          <p className="text-sm font-medium">Add a connection</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="platform">Platform</Label>
              <select id="platform" className={PLATFORM_FIELD} value={platform}
                onChange={e => setPlatform(e.target.value as Platform)}>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agentId">Agent id</Label>
              <Input id="agentId" value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="main" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="target">{platform === 'telegram' ? 'Telegram chat id' : 'Webhook URL'}</Label>
              <Input id="target" value={target} onChange={e => setTarget(e.target.value)} placeholder={spec.targetHint} />
            </div>
            {spec.needsToken && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="secret">Bot token</Label>
                <Input id="secret" type="password" value={secret} onChange={e => setSecret(e.target.value)}
                  placeholder="123456:ABC-DEF… (from @BotFather)" autoComplete="off" />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input id="label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Team channel" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{spec.targetHint}.</p>
          <Button disabled={!target.trim() || (spec.needsToken && !secret.trim()) || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add connection
          </Button>
          {create.isError && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
        </section>

        {/* Existing connections */}
        <section className="space-y-3">
          {channels.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {channels.isError && <p className="text-sm text-destructive">{(channels.error as Error).message}</p>}
          {channels.isSuccess && items.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No connections yet. Add a Telegram chat id and bot token above to send your first message.
            </p>
          )}
          {items.map(conn => (
            <div key={conn.id} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{conn.platform}</Badge>
                <span className="text-sm font-medium">{conn.label}</span>
                <span className="text-xs text-muted-foreground">{conn.target}</span>
                <Button variant="ghost" size="icon" aria-label={`Remove ${conn.label}`}
                  disabled={remove.isPending} onClick={() => remove.mutate(conn.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="font-mono text-xs text-muted-foreground break-all">{conn.session}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={drafts[conn.id] ?? ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [conn.id]: e.target.value }))}
                  placeholder="Message to send…"
                  aria-label={`Message to send to ${conn.label}`}
                />
                <Button variant="outline" disabled={verify.isPending} onClick={() => verify.mutate(conn.id)}>
                  {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Verify
                </Button>
                <Button
                  disabled={!(drafts[conn.id] ?? '').trim() || send.isPending}
                  onClick={() => send.mutate({ id: conn.id, text: drafts[conn.id] })}
                >
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
              </div>
              {note[conn.id] && (
                <p className={`text-sm ${note[conn.id].startsWith('✓') ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {note[conn.id].startsWith('✗') && <Ban className="mr-1 inline h-3.5 w-3.5" />}
                  {note[conn.id]}
                </p>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}