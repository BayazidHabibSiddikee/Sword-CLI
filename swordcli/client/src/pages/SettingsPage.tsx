import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, TestTube, Mail, Bot, BookOpen, Clock, Bell, Save as SaveIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'

// Types
interface Settings {
  bookDownload?: { defaultDir: string; defaultSource: string; defaultFormat: string }
  smtp?: { host: string; port: number; user: string; pass: string; secure: boolean }
  imap?: { host: string; port: number; user: string; pass: string; tls: boolean }
  telegram?: { botToken: string; chatId: string }
  routines?: { defaultSchedule: string; defaultCwd: string }
  bookmarks?: { autoArchive: boolean; maxAgeDays: number }
}

const SETTINGS_QUERY_KEY = ['settings']

function loadSettings(): Promise<Settings> {
  return fetch('/api/settings').then(r => r.ok ? r.json() : {})
}

function saveSettings(settings: Settings): Promise<void> {
  return fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }).then(r => { if (!r.ok) throw new Error('Failed to save') })
}

function testSmtp(config: Settings['smtp']): Promise<{ ok: boolean; message: string }> {
  return fetch('/api/settings/test-smtp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(r => r.json())
}

function testImap(config: Settings['imap']): Promise<{ ok: boolean; message: string }> {
  return fetch('/api/settings/test-imap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(r => r.json())
}

function testTelegram(config: Settings['telegram']): Promise<{ ok: boolean; message: string }> {
  return fetch('/api/settings/test-telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(r => r.json())
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    bookDownload: { defaultDir: './books', defaultSource: 'all', defaultFormat: 'text' },
    smtp: { host: '', port: 587, user: '', pass: '', secure: false },
    imap: { host: '', port: 993, user: '', pass: '', tls: true },
    telegram: { botToken: '', chatId: '' },
    routines: { defaultSchedule: 'daily', defaultCwd: '.' },
    bookmarks: { autoArchive: true, maxAgeDays: 30 },
  })
  const [activeTab, setActiveTab] = useState<string>('integrations')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)

  const qc = useQueryClient()

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: loadSettings,
    initialData: undefined,
  })

  // Load initial settings
  if (settingsData) {
    setSettings(prev => ({ ...prev, ...settingsData }))
  }

  const saveMut = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err) => alert('Failed to save: ' + err.message),
    onSettled: () => setSaving(false),
  })

  const testSmtpMut = useMutation({
    mutationFn: testSmtp,
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  })

  const testImapMut = useMutation({
    mutationFn: testImap,
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  })

  const testTelegramMut = useMutation({
    mutationFn: testTelegram,
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  })

  const handleSave = () => {
    setSaving(true)
    saveMut.mutate({ ...settings })
  }

  const handleChange = <K extends keyof Settings>(section: K, key: keyof Settings[K], value: any) => {
    setSettings(prev => ({ ...prev, [section]: { ...settings[section], [key]: value } }))
  }

  const handleTest = (type: 'smtp' | 'imap' | 'telegram') => {
    setTesting(type)
    setTestResult(null)
    if (type === 'smtp') testSmtpMut.mutate(settings.smtp)
    else if (type === 'imap') testImapMut.mutate(settings.imap)
    else if (type === 'telegram') testTelegramMut.mutate(settings.telegram)
  }

  const tabs = [
    { id: 'integrations', label: 'Integrations', icon: 'plug' },
    { id: 'bookmarks', label: 'Bookmarks', icon: 'book' },
    { id: 'routines', label: 'Routines', icon: 'clock' },
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
  ]

  const testButtons = [
    { id: 'smtp', label: 'Test SMTP', mut: 'testSmtpMut' as const, icon: Mail },
    { id: 'imap', label: 'Test IMAP', mut: 'testImapMut' as const, icon: Mail },
    { id: 'telegram', label: 'Test Telegram', mut: 'testTelegramMut' as const, icon: Bot },
  ]

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure integrations, appearance, and default behaviors."
      />

      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="integrations" className="space-y-6">
            {/* Telegram */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">Telegram Bot</CardTitle>
                <Badge variant="secondary">Bot API</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-bot-token">Bot Token</Label>
                    <Input
                      id="telegram-bot-token"
                      type="password"
                      value={settings.telegram?.botToken || ''}
                      onChange={e => handleChange('telegram', 'botToken', e.target.value)}
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                      placeholder="From @BotFather"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-chat-id">Default Chat ID</Label>
                    <Input
                      id="telegram-chat-id"
                      value={settings.telegram?.chatId || ''}
                      onChange={e => setSettings(prev => ({ ...prev, telegram: { ...settings.telegram, chatId: e.target.value } }))}
                      placeholder="123456789 or @channelname"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setTesting('telegram')} disabled={testTelegramMut.isPending}>
                    <Bot className="mr-1.5 h-4 w-4" /> Test Connection
                  </Button>
                  {testResult && testResult.ok && <Badge variant="default" className="text-green-600">✓ Connected</Badge>}
                  {testResult && !testResult.ok && <Badge variant="destructive">✗ {testResult.message}</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Email SMTP */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">Email (SMTP) — Sending</CardTitle>
                <Badge variant="secondary">SMTP</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input id="smtp-host" value={settings.smtp?.host || ''} onChange={e => handleChange('smtp', 'host', e.target.value)} placeholder="smtp.gmail.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input id="smtp-port" type="number" value={settings.smtp?.port || 587} onChange={e => handleChange('smtp', 'port', Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-user">Username</Label>
                    <Input id="smtp-user" value={settings.smtp?.user || ''} onChange={e => handleChange('smtp', 'user', e.target.value)} placeholder="your@email.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-pass">Password / App Password</Label>
                    <Input id="smtp-pass" type="password" value={settings.smtp?.pass || ''} onChange={e => handleChange('smtp', 'pass', e.target.value)} placeholder="App password" autoComplete="current-password" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="smtp-secure" className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={settings.smtp?.secure} onChange={e => handleChange('smtp', 'secure', e.target.checked)} />
                      <span className="text-sm">Use SSL/TLS (port 465)</span>
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => testSmtpMut.mutate(settings.smtp)} disabled={testSmtpMut.isPending}>
                    <TestTube className="mr-1.5 h-4 w-4" /> Test SMTP
                  </Button>
                  {testResult && testResult.ok && <Badge variant="default" className="text-green-600">✓ Connected</Badge>}
                  {testResult && !testResult.ok && <Badge variant="destructive">✗ {testResult.message}</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Email IMAP */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">Email (IMAP) — Reading</CardTitle>
                <Badge variant="secondary">IMAP</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="imap-host">IMAP Host</Label>
                    <Input id="imap-host" value={settings.imap?.host || ''} onChange={e => handleChange('imap', 'host', e.target.value)} placeholder="imap.gmail.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="imap-port">Port</Label>
                    <Input id="imap-port" type="number" value={settings.imap?.port || 993} onChange={e => handleChange('imap', 'port', Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="imap-user">Username</Label>
                    <Input id="imap-user" value={settings.imap?.user || ''} onChange={e => handleChange('imap', 'user', e.target.value)} placeholder="your@email.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="imap-pass">Password / App Password</Label>
                    <Input id="imap-pass" type="password" value={settings.imap?.pass || ''} onChange={e => handleChange('imap', 'pass', e.target.value)} autoComplete="current-password" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="imap-tls" className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={settings.imap?.tls !== false} onChange={e => handleChange('imap', 'tls', e.target.checked)} />
                      <span className="text-sm">Use TLS (port 993)</span>
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => testImapMut.mutate(settings.imap)} disabled={testImapMut.isPending}>
                    <TestTube className="mr-1.5 h-4 w-4" /> Test IMAP
                  </Button>
                  {testResult && testResult.ok && <Badge variant="default" className="text-green-600">✓ Connected</Badge>}
                  {testResult && !testResult.ok && <Badge variant="destructive">✗ {testResult.message}</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Gmail Quick Setup */}
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Badge variant="outline" className="bg-green-500/10 text-green-600">Gmail</Badge> Quick Setup</CardTitle>
                <p className="text-xs text-muted-foreground">Use Google App Password (not your main password). Enable 2FA first, then create an App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" className="underline">myaccount.google.com/apppasswords</a>.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="gmail-email">Gmail Address</Label>
                    <Input value={settings.smtp?.user || ''} onChange={e => handleChange('smtp', 'user', e.target.value)} placeholder="your@gmail.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gmail-app-pass">App Password (16 chars)</Label>
                    <Input type="password" value={settings.smtp?.pass || ''} onChange={e => { handleChange('smtp', 'pass', e.target.value); handleChange('imap', 'pass', e.target.value) }} placeholder="16-char app password" />
                  </div>
                  <div className="space-y-1.5">
                    <Button variant="outline" onClick={() => testSmtpMut.mutate({ ...settings.smtp, host: 'smtp.gmail.com', port: 587, secure: false })}>Test SMTP (587/STARTTLS)</Button>
                    <Button variant="outline" onClick={() => testImapMut.mutate({ ...settings.imap, host: 'imap.gmail.com', port: 993, tls: true })}>Test IMAP (993/SSL)</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookmarks & Knowledge */}
          <TabsContent value="bookmarks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Knowledge Base</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bookmarks-auto-archive">Auto-archive old bookmarks</Label>
                    <Switch checked={settings.bookmarks?.autoArchive} onCheckedChange={checked => handleChange('bookmarks', 'autoArchive', e.target.checked)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bookmarks-max-age">Archive after (days)</Label>
                    <Input type="number" min={1} max={365} value={settings.bookmarks?.maxAgeDays || 30} onChange={e => handleChange('bookmarks', 'maxAgeDays', Number(e.target.value))} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Routines */}
          <TabsContent value="routines" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Default Routine Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="routines-schedule">Default Schedule</Label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={settings.routines?.defaultSchedule || 'daily'} onChange={e => handleChange('routines', 'defaultSchedule', e.target.value)}>
                      <option value="on-demand">On demand (manual only)</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily (6 AM)</option>
                      <option value="weekdays">Weekdays (Mon-Fri, 9 AM)</option>
                      <option value="weekly">Weekly (Monday 9 AM)</option>
                      <option value="once">Once (run once)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="routines-cwd">Default Working Directory</Label>
                    <Input value={settings.routines?.defaultCwd || '.'} onChange={e => handleChange('routines', 'defaultCwd', e.target.value)} placeholder="." />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Button variant="outline" className="w-32" onClick={() => { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light') }}>
                    <span className="flex items-center gap-2"><span className="size-4">☀️</span> Light</span>
                  </Button>
                  <Button variant="outline" className="w-32" onClick={() => { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark') }}>
                    <span className="flex items-center gap-2"><span className="size-4">🌙</span> Dark</span>
                  </Button>
                  <Button variant="outline" className="w-32" onClick={() => { localStorage.removeItem('theme'); document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches) }}>
                    <span className="flex items-center gap-2"><span className="size-4">⚙️</span> System</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={() => setSettings(prev => ({ ...settings }))}>Reset</Button>
        <Button onClick={() => saveSettings()} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}