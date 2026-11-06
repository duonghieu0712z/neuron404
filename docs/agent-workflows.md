# Agent workflows

## Agent commands

Use `pnpm neuron <command>` inside this repository. From another directory, invoke this repository's `bin/neuron404` using its absolute path. By default it resolves the repository itself, loads its `.env`, and uses the same content and database. With `NEURON404_URL` exported, `bin/neuron404` uses the HTTPS client instead; `pnpm neuron` remains local administration. See [remote access](remote-access.md). It does not install global configuration.

```sh
pnpm neuron catalog --query "project" --limit 20
pnpm neuron catalog --region project-id --limit 20 --offset 0
pnpm neuron region:add < region.json
pnpm neuron region:read region-id --summary
pnpm neuron region:read region-id
pnpm neuron region:write region-id < overview.json
pnpm neuron search "runtime defaults" --region project-id --limit 5
pnpm neuron read neuron-id another-neuron-id
pnpm neuron neighbors neuron-id --kind extends --limit 10
pnpm neuron source:read source-id
pnpm neuron history neuron-id
pnpm neuron history neuron-id revision-hash
pnpm neuron index
pnpm neuron index --rebuild
pnpm neuron lint
```

`source:add`, `add`, and `update <id>` accept JSON on stdin. `source:add` requires `title`, `uri`, and `content`, with optional `locator`. It returns a snapshot ID; a neuron's `sources` array references those IDs. Repeated captures of identical source payloads reuse the same snapshot.

A Region hexagon opens a full authored overview in the detail sidebar. After an ingestion batch, the agent reads the Region members and maintains this article with citations. `region:read ID` returns the article revision and member revisions; `region:write ID` accepts `{body, expectedRevision, memberRevisions}`. Use `null` as the expected revision for a new article. Changes to supporting neurons mark the article as needing a refresh; conflicting writes are rejected and previous article bytes are preserved.

The agent classifies knowledge during ingestion, reusing a suitable Region from `catalog` or creating one with `region:add`. This command accepts `{id, title, description}` on stdin, locks the catalog, preserves its previous bytes, and refuses to overwrite a conflicting definition. Repeating an identical definition reuses it. Classification uses the AI running the skill; the CLI does not call a separate model. A new subject should not silently become Unfiled because its Region is absent.

When upgrading an existing store, run `pnpm neuron migrate` once before using the application. It applies database migrations, renames the old membership key and catalog to `regions`, refreshes overview member revisions, and synchronizes SQLite. Exact previous files are preserved in history; interrupted migrations can be rerun. Docker initialization performs the same migration automatically.

Agent `add` commands require `title`, `body`, `grounding`, `endorsement`, `provenance`, and a nonempty `regions` array of Region IDs. Optional arrays are `aliases`, `sources`, `synapses`, and `retrievalCues` (up to eight reading situations of 240 characters each). Retrieval cues guide article selection; they are not extra knowledge claims. Existing Markdown remains unchanged when this field is absent. Each synapse has `target`, `kind`, and optional `note`; supported kinds are `supports`, `contradicts`, `extends`, `cites`, and `questions`. Legacy unfiled neurons remain readable, and the manual web form remains compatible; automatic classification belongs to the agent ingestion workflow.

`read` returns the neuron, its content-hash `revision`, incoming links, and relevant contradiction/question/replacement bodies. `update` accepts changed fields plus the exact `expectedRevision` from a fresh read. Write receipts include `regions` so the agent can confirm Region assignment. Concurrent or stale updates fail instead of overwriting newer knowledge. Prior versions retain their exact bytes. Update the same neuron when knowledge develops; create a new neuron for a distinct concept.

Lifecycle is separate from semantic relationships: `active`, `superseded` with `supersededBy`, or `retracted`. Use `--include-history` to include inactive neurons in search. A `contradicts` synapse does not automatically mark either neuron superseded.

Retrieval has two metadata levels: paginated Region definitions (`catalog`, optionally `--query`) and paginated neuron entries (`catalog --region ID`). Entries contain titles, aliases and reading situations, not bodies. Follow `nextOffset` as needed; root catalog queries match Region definitions only. `region:read ID --summary` returns the overview and freshness without membership maps or review reports. Full `region:read` remains available for editing with optimistic concurrency.

Search uses weighted BM25 over titles, aliases, retrieval cues, and bodies, with token prefixes, optional Region scope and lexical coverage calculated inside SQLite before pagination. `--limit 1-50` and `--offset N` bound results; queries accept at most 24 distinct non-stopword terms. It returns caution links even if those linked neurons were not separate search hits. This is not embedding search: different wording may require another query. Snippets locate candidates; read the supporting neurons before answering. `read` opens selected Markdown and relevant cautions rather than every neuron; its compact review assessments omit Region-wide revision maps. It limits automatic expansion to 200 incoming links and 50 caution/replacement bodies per selected neuron, with `contextTruncated` when incomplete. Use paginated `neighbors ID` with `--kind` and `--direction incoming|outgoing|both` to inspect further relationships without loading their bodies.

Ordinary retrieval reuses a persisted index checkpoint. CLI writes synchronize immediately. External edits are reconciled on the next query after 30 seconds; directory/catalog changes and the dirty marker trigger an earlier check. Reconciliation walks file metadata and parses only changed files with bounded concurrency. Reading a selected neuron verifies its actual content hash and reconciles a mismatch immediately. Run `pnpm neuron index` for immediate discovery of external edits or `--rebuild` for a complete reparse and evidence validation. No watcher daemon or model call is required. The checkpoint, file stamps and retrieval columns are derived SQLite data; this does not rewrite Markdown or source snapshots.

The index structure and SQLite retrieval approach are provisional. Their effectiveness has not yet been evaluated sufficiently to establish an advantage over a multi-level Markdown index. Functional checks and synthetic timing measurements do not establish long-term retrieval quality; assess real use as the knowledge store grows and improve the design incrementally.

## Recovery and chat access

Writes use a storage lock, immutable revision snapshots, and atomic file replacement. Index synchronization updates changed rows in a transaction and preserves existing synapse IDs when their source, target and kind remain unchanged. If a file was saved but subsequent processing failed, read the neuron identified by the error before retrying, then run `pnpm neuron index`. A leftover `content/.write-lock` after a crash must be checked against its recorded PID before removal; never remove a live writer's lock.

The portable skill source is [skills/neuron404/SKILL.md](../skills/neuron404/SKILL.md). It loads only the workflow reference needed for retrieval, maintenance, or verification and delegates to the existing CLI through `skills/neuron404/scripts/neuron404`.

In Claude Code, invoke `/neuron404` alone to review the current conversation and propose knowledge to retain or update without saving it. Add an optional intent such as `search`, `save`, `ingest`, or `review`, or simply write a natural-language request: `/neuron404 what did we decide about deployment?` or `/neuron404 save the decision we just agreed on`. These intents select agent workflows, not new CLI subcommands. Use the client's native skill syntax elsewhere, such as `$neuron404` in Codex. Explicit saves include classification and affected Region overview maintenance; questions and reviews remain read-only.

Claude's global entry at `~/.claude/skills/neuron404` and Codex's global entry at `~/.agents/skills/neuron404` are symlinks to this repository's `skills/neuron404/`. The launcher resolves that link to locate the repository from any working directory; `NEURON404_HOME` can explicitly select another repository. The project-local `.claude/skills/neuron404/` copy has been removed.

The user authorizes improving this skill during actual use. Keep the repository directory as the canonical source: changes made through either global link already update the project and the other client. Resolve links before editing and preserve this setup instead of creating independent copies. If the repository moves, update both links. Do not include personal knowledge or local transcripts in skill changes, modify unrelated client settings, or commit automatically.

Global discovery applies to local clients with access to these paths. It does not provide cloud access, remote hosting, an MCP server, or an additional LLM provider; each client still needs tool access to the same store.
