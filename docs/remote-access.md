# Remote access

Run the web application and its knowledge store on one server. Local clients use the same skill commands over HTTPS. Cloudflare is optional; any reverse proxy that preserves the host and sets the forwarded protocol can be used.

## Server

Copy `.env.example` to `.env`. Generate a random secret with `openssl rand -hex 32` and set:

```dotenv
NEURON404_AUTH_TOKEN=REPLACE_WITH_A_RANDOM_SECRET
NEURON404_PUBLIC_URL=https://neuron.example.com
```

Tokens must contain 32–1024 printable, non-whitespace ASCII characters; the generated hex secret satisfies this requirement. `NEURON404_AUTH_TOKEN` grants API read/write access and signs web sessions. An optional, different `NEURON404_READ_TOKEN` grants read-only API access and cannot sign into the web. Keep these values private; rotating the main token invalidates its API access and all web sessions.

For Docker secret mounts, use `NEURON404_AUTH_TOKEN_FILE` and
`NEURON404_READ_TOKEN_FILE` instead of direct values. The CLI also supports
`NEURON404_TOKEN_FILE`, `CF_ACCESS_CLIENT_ID_FILE`, and
`CF_ACCESS_CLIENT_SECRET_FILE`. See [file-based secrets](deployment.md#secrets-from-files)
for mount configuration and validation rules.

Run the existing Compose deployment behind your HTTPS reverse proxy. For a non-Docker production build, start with `node dist/server.js`; this wrapper retains the adapter’s shutdown handling and supplies the correct local/proxy protocol default. Compose keeps the application port bound to loopback and passes the authentication variables to the container. It trusts `X-Forwarded-Proto` from that proxy. Set `NEURON404_PUBLIC_URL` to the exact external HTTPS origin so requests with an unexpected origin are rejected. Do not expose the application port directly to untrusted clients.

Open the domain and sign in with the main access token. Sessions use an HttpOnly, SameSite cookie, expire after 12 hours, and use Secure cookies over HTTPS. Sign out from the header. Failed sign-ins are limited per observed client address in memory; a proxy may make clients share that address. Use proxy-side rate limiting for Internet-facing deployments.

No auth token preserves local web behavior and disables the remote API. Setting a public URL without a valid main token fails closed. `/healthz` remains public and returns only basic service status. Personal pages and API responses use `Cache-Control: no-store`; do not configure proxy cache rules to override it.

## Client

Local storage remains the default, whether or not a remote is configured. Install the CLI and skill using the [installation guide](installation.md), or use an existing [headless distribution](headless.md). Ordinary search/save commands always use `~/.neuron404` and continue working offline.

Export the remote configuration when synchronization is wanted:

```sh
export NEURON404_URL="https://neuron.example.com"
export NEURON404_TOKEN="YOUR_ACCESS_TOKEN"
neuron404 sync
```

`pnpm neuron sync` also works from the repository. On native Windows, set the variables in PowerShell and run the installed `neuron404 sync` command. Linux, macOS, WSL and Git Bash can use the shell launcher.

Sync compares file hashes against a checkpoint for this remote origin. It uploads local additions/edits and downloads remote additions/edits when only one side changed. It transfers neurons, Region metadata/overviews, sources, history and operation logs. SQLite, maintenance state/reports, authentication receipts and configuration stay local. Operation logs combine complete lines; other files changed differently on both sides produce conflicts. Initial files with the same path but different bytes also conflict. Resolve the content deliberately using the normal revision-checked commands; sync never chooses a winning claim.

Deletions are not propagated. A file missing after an earlier sync is reported as a conflict. Previous replaced bytes remain under `content/sync-backups/`; checkpoints live in `~/.neuron404/sync/`. Back up the complete data directory. Sync is not a multi-file transaction: completed files remain transferred if a later file fails. Rerun after restoring connectivity. API requests retain the 1 MiB limit, so oversized files fail explicitly. No background network traffic or automatic upload is enabled merely by configuring a URL. Without `--region`, the first sync covers all supported local knowledge.

### Select direction and Regions

The skill understands requests such as “upload Region A,” “download Region B,” and “preview sync for A and B.” Its CLI equivalents are:

```sh
neuron404 sync --direction push --region region-a --region region-b --dry-run
neuron404 sync --direction push --region region-a --region region-b
neuron404 sync --direction pull --region region-a
neuron404 sync --region region-a --region region-b
```

`push` sends local changes to remote; `pull` downloads remote changes; `both` is the default. Repeat `--region` to select several IDs; omitting it selects all. Output includes direction, Region IDs, preview status, push/pull counts, each transferred path, skipped paths and conflicts. In a dry run those are planned counts; no knowledge, sync checkpoints or remote write receipts are changed. One-way sync skips changes needing the other direction and never forces an overwrite of a conflicting destination.

Scoped sync transfers member neurons, selected Region definitions/overviews, matching history, referenced sources and their operation receipts. It merges selected catalog entries and receipts while preserving other Regions at the destination. Global catalog history and historical neuron revisions outside the selected membership are omitted. Checkpoints are separate for each Region selection.

Shared neurons remain whole, including other Region IDs. Synapses outside scope keep their IDs without importing the target neuron. Source snapshots also remain whole and may contain broader context; Region filtering is not content redaction or an access-control boundary. Missing targets/Region definitions are recorded locally in `sync/references.json`, reported by `read` as `unavailableReferences`, and excluded from indexed edges until their knowledge arrives. Missing caution/replacement context is explicitly incomplete. A later sync restores those edges without editing the saved neuron. Both client and server require sync protocol 2.

For an explicitly remote operation, use:

```sh
neuron404 remote catalog --limit 5
neuron404 remote search "runtime defaults"
```

A copied skill can use `scripts/neuron404 remote <command>` without a local installation; this direct remote mode needs only Node.js >=24. Native Windows can invoke `node <skill-directory>/scripts/remote.mjs <command>`. Direct remote writes do not update the local replica until sync runs. For direct reads or pull-only sync, set the client's `NEURON404_TOKEN` to the server's `NEURON404_READ_TOKEN` value. The client does not read a variable named `NEURON404_READ_TOKEN`. Uploading requires the server's owner token instead. Failure never switches destinations automatically. HTTP is allowed only on loopback, credentials use headers, and redirects are rejected.

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
