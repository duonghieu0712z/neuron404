# Local storage, sync and direct remote access

Ordinary skill commands always read and write the local store. Configuring `NEURON404_URL` does not change that destination. The web UI is optional; a headless distribution supplies the same local CLI.

## Synchronize

Configure `NEURON404_URL` and `NEURON404_TOKEN`, then invoke the launcher with `sync`. Use `sync --direction both|push|pull --region ID --region OTHER_ID` to select the direction and any number of Regions. Omitted direction means `both`; omitted Regions means all. `push` means local to remote, `pull` means remote to local. Resolve Region titles to exact IDs with the catalog; never broaden a requested subset to all Regions. Obtain authorization for that destination before the first upload. Never upload automatically merely because credentials exist. When sync is authorized, use it before retrieval when freshness matters and after an authorized save when remote delivery is requested. An offline save remains local; report failed sync separately without repeating the save.

Interpret natural language such as “upload Region A,” “download Region B,” or “preview sync for A and B.” `--dry-run` reports planned transfers without changing knowledge, checkpoints or remote write receipts. Report the selected direction, Region scope, `dryRun`, `pushed`, `pulled`, `skipped`, `files` and `conflicts`, distinguishing planned transfers from completed ones. One-way sync skips changes requiring the other direction; it does not force source versions over destination edits.

A selected Region includes its member neurons, metadata, overview, matching historical revisions, referenced sources and operation receipts for those neurons. Global catalog/log files are filtered and merged so unselected entries stay at their destination. Global catalog history is excluded from scoped sync. History whose original Region membership cannot establish the selected scope is omitted. A shared neuron is transferred intact, including its other Region IDs; it does not bring every other member of those Regions. Synapses and replacements outside scope remain references without automatically downloading their targets. Sources are immutable whole snapshots and can contain broader context; do not describe Region selection as redaction or per-Region access control. Explain shared neuron/source boundaries when material to the requested transfer.

Local partial-reference metadata tracks deliberately unavailable targets and Region definitions. `read` reports them in `unavailableReferences`; missing caution/replacement context also sets `contextTruncated`. Do not interpret unavailable content as nonexistent or claim a complete assessment. Later sync of its Region restores indexed relationships. Both client and server must support sync protocol 2; an incompatible server fails before upload.

Sync is incremental by file hash. It includes neurons, Region metadata and overviews, sources, exact history and operation receipts. SQLite is rebuilt locally when needed. Review reports, worker state, sessions, authentication receipts, backups and sync checkpoints stay machine-local. No deletion is propagated. A file deleted after an earlier sync is reported as a conflict. Initial divergent files and files changed on both machines are conflicts; neither side is overwritten. Operation logs are the exception: complete lines are combined without dropping receipts.

A nonzero exit with `conflicts` requires comparing both versions and reconciling through normal revision-checked writes. Do not delete checkpoints, force an overwrite, or invent a merged claim. Completed transfers remain valid if a later transfer fails; rerun sync after restoring connectivity. Sync is not an atomic multi-file transaction. Existing replaced files are retained under `content/sync-backups/`. Requests retain the 1 MiB API limit; an oversized file fails explicitly and remains local.

## Direct remote operations

Only an explicit `remote <command>` uses the bundled `scripts/remote.mjs` client. This mode needs Node.js >=24, but no local repository, pnpm or database. On native Windows invoke the Node script directly. It accepts the same ordinary read/write commands as local mode. Do not invoke internal `sync:*` commands to bypass the sync conflict checks.

Use `NEURON404_URL` for the HTTPS server origin and `NEURON404_TOKEN` for its owner/read token. Read-only tokens support direct reads and `sync --direction pull`; uploads require the owner token. HTTP is accepted only on loopback. Redirects are rejected; never disable TLS verification or print credentials.

A failed direct write prints `requestId`. Reuse `NEURON404_REQUEST_ID` with identical input to recover its result. Inspect uncertain outcomes rather than issuing a new write blindly. Revision conflicts require a fresh read and a reconciled update.

Optional `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` add Cloudflare Access service headers; both must be supplied together. Application authentication remains required. An HTML login challenge indicates an access-policy problem, not missing knowledge.
