# SwordCLI background services (systemd --user)

This project is self-contained: it runs its **own API background**, `swordcli`,
instead of borrowing another project's server (freellmapi / `GET_API`).

| unit                | what it runs                    | port | notes                                     |
| ------------------- | ------------------------------- | ---- | ----------------------------------------- |
| `swordcli-api`      | `swordcli/server` (`tsx watch`)  | 3001 | the API: `/v1` proxy + catalog, `/api/sword` shared sessions, `/api/keys`, `/api/agent`. SQLite: `swordcli/server/data/freeapi.db` |
| `swordcli-web`      | `swordcli/client` (`vite`)       | 3002 | dashboard; proxies `/api` + `/v1` → :3001  |
| `sword-server`      | `sword-server` (`node`)          | 3101 | minimal API, **no install step**; the fallback when the workspace is not installed |

The `swordcli` units need the workspace dependencies once:

```bash
npm install --prefix swordcli          # tsx, vite, better-sqlite3 (native binding)
```

`better-sqlite3` is built only because `swordcli/package.json` carries an
`allowScripts` entry — npm blocks lifecycle scripts otherwise, and the API then
fails to open its database.

## Install / migrate

```bash
bash scripts/systemd/install.sh
```

It installs and enables `swordcli-api` + `swordcli-web`, and **disables the
legacy freellmapi units** (`sword-legacy`, `sword-web`, `freellmapi`) so nothing
else keeps :3001/:3002 bound.

## Day to day

```bash
./sword.mjs            # brings the stack up, then drops into the agent
./sword.mjs status     # ollama · swordcli API · sword-server · web · agent
./sword.mjs api        # start only the swordcli API
./sword.mjs web        # start only the dashboard
./sword.mjs down       # stop what the launcher started
./sword.mjs logs       # tail the service logs (.sword/*.log)
systemctl --user status swordcli-api swordcli-web
```

The launcher points the agent at `swordcli :3001` when it is up, otherwise at
`sword-server :3101`, and falls back to g4f when neither is reachable. Logs live
in `.sword/` (`swordcli.log`, `sword-server.log`, `web.log`, `ollama.log`).
