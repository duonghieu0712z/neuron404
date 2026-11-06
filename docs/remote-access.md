# Remote access

Run the web application and its knowledge store on one server. Local clients use the same skill commands over HTTPS. Cloudflare is optional; any reverse proxy that preserves the host and sets the forwarded protocol can be used.

## Server

Copy `.env.example` to `.env`. Generate a random secret with `openssl rand -hex 32` and set:

```dotenv
NEURON404_AUTH_TOKEN=REPLACE_WITH_A_RANDOM_SECRET
NEURON404_PUBLIC_URL=https://neuron.example.com
```

Tokens must contain 32–1024 printable, non-whitespace ASCII characters; the generated hex secret satisfies this requirement. `NEURON404_AUTH_TOKEN` grants API read/write access and signs web sessions. An optional, different `NEURON404_READ_TOKEN` grants read-only API access and cannot sign into the web. Keep these values private; rotating the main token invalidates its API access and all web sessions.

Run the existing Compose deployment behind your HTTPS reverse proxy. For a non-Docker production build, start with `node dist/server.js`; this wrapper retains the adapter’s shutdown handling and supplies the correct local/proxy protocol default. Compose keeps the application port bound to loopback and passes the authentication variables to the container. It trusts `X-Forwarded-Proto` from that proxy. Set `NEURON404_PUBLIC_URL` to the exact external HTTPS origin so requests with an unexpected origin are rejected. Do not expose the application port directly to untrusted clients.

Open the domain and sign in with the main access token. Sessions use an HttpOnly, SameSite cookie, expire after 12 hours, and use Secure cookies over HTTPS. Sign out from the header. Failed sign-ins are limited per observed client address in memory; a proxy may make clients share that address. Use proxy-side rate limiting for Internet-facing deployments.

No auth token preserves local web behavior and disables the remote API. Setting a public URL without a valid main token fails closed. `/healthz` remains public and returns only basic service status. Personal pages and API responses use `Cache-Control: no-store`; do not configure proxy cache rules to override it.

## Client

Install the `skills/neuron404/` folder in the client's skill directory. A remote-only copy needs Node.js >=24 and its bundled scripts; it does not need this repository, pnpm, SQLite, or a local knowledge store. Existing global symlinks continue to work.

Export these variables in the environment that launches Claude or Codex:

```sh
export NEURON404_URL="https://neuron.example.com"
export NEURON404_TOKEN="YOUR_ACCESS_TOKEN"
```

Invoke the installed skill normally. To check its connection directly, use its actual installation path:

```sh
"$HOME/.agents/skills/neuron404/scripts/neuron404" catalog --limit 5
"$HOME/.agents/skills/neuron404/scripts/neuron404" search "runtime defaults"
```

On native Windows, set the same variables in PowerShell and call the Node script directly, using the installed skill's actual path:

```powershell
$env:NEURON404_URL = 'https://neuron.example.com'
$env:NEURON404_TOKEN = 'YOUR_ACCESS_TOKEN'
node C:\path\to\neuron404\scripts\remote.mjs catalog --limit 5
```

Linux, macOS, WSL and Git Bash can use the shell launcher. For local mode on native Windows, run `pnpm --dir C:\path\to\repository neuron catalog` instead. The remote client uses Node's built-in APIs; native Windows/Linux execution has not been validated in this development environment.

`bin/neuron404` also respects these variables. `pnpm neuron` is the server/local administration command and always accesses the local store. An invalid remote URL, missing token or failed connection never falls back to local storage. HTTP is accepted only for loopback development endpoints. Credentials are sent in headers, never URL parameters; redirects are rejected.

Unsetting `NEURON404_URL` restores the existing local launcher. Local and remote stores are separate destinations, not automatically synchronized replicas. To move an existing store, stop its writers and transfer the complete `~/.neuron404` directory to the server before opening it to clients. Do not overwrite an already populated independent store.

## API and write recovery

`POST /api/v1/commands` accepts JSON `{command, args, payload?}` and a Bearer token. Read commands cover search, catalog, neurons, neighbors, history, sources, Region overviews and reports. Write commands cover neuron creation/update, source capture and Region creation/overview updates. They reuse the local services, validation, revision checks and history. Migration, reindexing, lint and maintenance execution remain local administrative operations.

```sh
curl https://neuron.example.com/api/v1/commands \
  -H "Authorization: Bearer $NEURON404_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"command":"catalog","args":["--limit","5"]}'
```

Writes require an `Idempotency-Key` header (16–128 letters, digits, underscores or hyphens). The client generates one automatically; `NEURON404_REQUEST_ID` supplies an explicit key. Reusing a completed key with identical input returns its stored result, including after a server restart. Different input with the same key is rejected. Keep the command, argument order and JSON payload identical when replaying.

The client does not retry automatically. On a failed write it prints its request ID. Retry with that ID to retrieve a completed result. If the server reports an in-progress or uncertain outcome, inspect the knowledge and server logs before using a new ID. A reservation is persisted before execution; an interrupted request is not automatically executed again. Receipts live in `~/.neuron404/remote/requests/` and are included in full-directory backups. Removing them removes replay protection for those keys.

Requests are limited to 1 MiB and the client waits up to 30 seconds. Existing optimistic concurrency still requires a fresh `expectedRevision` when updating a neuron or overview. A write receipt does not make a batch of multiple commands atomic. Initial authentication uses shared owner/read tokens, not multiple users or per-Region permissions.

## Background maintenance

Run maintenance on the server beside its store, using an explicitly selected authenticated agent CLI. The Docker web image still does not contain Claude or Codex credentials. Remote skill requests do not start a worker, call a model on the server, or forward the client's model login.

For an optional Cloudflare setup, see [Cloudflare deployment](cloudflare.md).
