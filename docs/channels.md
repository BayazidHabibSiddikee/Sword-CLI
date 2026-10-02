# Channels

Send SwordCLI/agent output to a messaging platform. Implemented as a small,
dependency-free service plus a dashboard page — deliberately not a full
orchestration platform.

## Surfaces

| Layer | Path |
|---|---|
| Service (store, validation, adapters) | `swordcli/server/src/services/channels.ts` |
| REST routes | `swordcli/server/src/routes/channels.ts` (mounted at `/api/channels`) |
| Dashboard page | `swordcli/client/src/pages/ConnectionsPage.tsx` (`/connections`) |
| Client helpers | `swordcli/client/src/lib/channels.ts` |
| Store | `swordcli/server/data/channels.json` (mode `0600`, gitignored) |

## Connection model

```ts
interface ChannelConnection {
  id: string;
  platform: 'telegram' | 'discord' | 'slack' | 'webhook';
  label: string;
  agentId: string;   // default 'main'
  target: string;    // Telegram chat id, or a webhook URL
  secret?: string;   // Telegram bot token; webhooks carry auth in the URL
  createdAt: string;
  updatedAt: string;
}
```

Reads return a `ChannelView` with the secret removed and `hasSecret: boolean`
instead, so a token cannot leak through the dashboard or a logs dump. An update
that omits `secret` reuses the stored one, so a label can be edited without
re-pasting the token.

## Session keys (OpenClaw addressing)

```
agent:<agentId>:<platform>:<kind>:<target>
```

`kind` is `chat` for Telegram, `channel` for Discord/Slack, `hook` for a generic
webhook. Examples:

- `agent:main:telegram:chat:123456789`
- `agent:ops:discord:channel:https://discord.com/api/webhooks/...`

## Adapters

| Platform | Verify | Send |
|---|---|---|
| Telegram | `getMe` | `sendMessage` via `https://api.telegram.org` |
| Discord | `GET` the webhook | `POST { content }` |
| Slack | shape-only (a real post is the only live check) | `POST { text }` |
| webhook | shape-only | `POST { text, session }` |

## Security

- Telegram is called only at the hardcoded `api.telegram.org` host.
- User-supplied webhook URLs must be `https` and must not be private/loopback
  (`assertPublicHttpsUrl`), preventing an SSRF pivot into the local network.
- A webhook connection may not also carry a token (it belongs in the URL).
- Deliveries are bounded by a 10 s timeout and a ~16 KB body cap.
- Failures surface the upstream reason (e.g. Telegram's `description`), returned
  as HTTP 502 — the request was valid, the destination refused it.

## Tests

- `swordcli/server/src/__tests__/services/channels.test.ts` — session keys,
  validation/SSRF, redaction + `0600`, secret reuse, Telegram `getMe`/`sendMessage`,
  error propagation, Slack shape.
- `swordcli/server/src/__tests__/routes/channels.test.ts` — CRUD + verify/send
  over HTTP on an isolated Express app (no database needed).