# neuron404

A personal knowledge store based on the [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). AI agents save and maintain knowledge as **neurons**, connect justified semantic relationships with **synapses**, and retrieve evidence in later conversations. The web application browses that same store.

## Development

Use Node.js >=24 and the pnpm version in `package.json`.

```sh
pnpm install
mkdir -p "$HOME/.neuron404/content/neurons"
cp .env.example .env
```

Data paths are detected automatically. Local development and Docker share `~/.neuron404/content/` and `~/.neuron404/neuron404.db`. Set `NEURON404_UID` and `NEURON404_GID` to the output of `id -u` and `id -g` when they differ from 1000, so container writes remain accessible to your local user. Then initialize the database and start development:

```sh
pnpm db:migrate
pnpm db:index
pnpm dev
```

`pnpm check`, `pnpm lint`, `pnpm format`, and `pnpm build` verify the application. `pnpm neuron:lint` checks stored structure and source integrity. There is no test runner configured.

## Docker

Install Docker with Compose v2, then run these commands from the repository:

```sh
mkdir -p "$HOME/.neuron404"
docker compose up -d --build
```

Open `http://localhost:3000/neurons`. Both the image and container are named `neuron404`. The image builds a standalone production server with [SvelteKit's Node adapter](https://svelte.dev/docs/kit/adapter-node). Compose binds the port to the local machine and mounts `~/.neuron404` at `/data`:

| Host path                   | Container path       | Purpose                                                    |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `~/.neuron404/content/`     | `/data/content/`     | Neurons, sources, history, regions, and operation receipts |
| `~/.neuron404/neuron404.db` | `/data/neuron404.db` | Derived SQLite index and migration state                   |

The image excludes personal content, local databases, and `.env` files. Startup applies committed migrations and synchronizes the index before accepting requests. A new volume starts empty. Rebuilding the image or running `docker compose down` preserves the host directory. Back up the entire directory with the container stopped to capture consistent files.

`GET /healthz` returns `200` with `{"status":"ok"}` when SQLite responds and the content directory is readable and writable; otherwise it returns `503` with `{"status":"error"}`. Responses are not cached. Compose uses this endpoint for its healthcheck.

To change the host port, run `NEURON404_PORT=8765 docker compose up -d`. On Linux, if your user is not UID/GID 1000, pass `NEURON404_UID=$(id -u) NEURON404_GID=$(id -g)` before Compose commands that start containers so the process can write to your directory. Keep these overrides consistent when recreating containers.

### Import existing local knowledge

When upgrading from repository-local `content/`, stop other writers and copy that directory into an empty destination before the first Docker startup:

```sh
mkdir -p "$HOME/.neuron404"
test ! -e "$HOME/.neuron404/content" && cp -Rp content "$HOME/.neuron404/content"
docker compose up -d --build
```

This retains the repository's original files. SQLite is rebuilt from the copied Markdown, so copying `local.db` is unnecessary. If the destination already contains content, the copy command deliberately does nothing; do not merge independent stores by overwriting files. The repository CLI automatically uses the same store. You can also invoke the container CLI:

```sh
docker compose exec -T neuron404 node --import tsx scripts/neuron.ts catalog
docker compose exec -T neuron404 node --import tsx scripts/neuron.ts search "runtime defaults"
docker compose logs -f neuron404
docker compose down
```

For `add`, `update`, and `source:add`, pipe JSON into the same `exec -T` command. Rebuild after updating the code with `docker compose up -d --build`.

## Terminology

**Neuron** is a knowledge unit, **Synapse** is a semantic relationship, **Region** groups neurons by knowledge context, and **Network** is the exploration view. Region membership does not require synapses. These names are neuroscience-inspired product metaphors, not a biological simulation. Legacy `topics` fields, `content/topics.json`, and the legacy `--topic` flag remain compatible; new search commands use `--region`. These are compatibility names for regions, not a separate taxonomy.

## Storage

- `content/neurons/<id>.md`: current neuron bodies and frontmatter; authoritative knowledge.
- `content/sources/<sha256>.json`: immutable evidence snapshots with source URI, optional locator, and capture time.
- `content/history/<id>/<revision>.md`: exact original and subsequent versions saved by updates.
- `content/operations.jsonl`: append-only write receipts with current and previous revisions.
- `content/topics.json`: topic definitions; membership is neuron metadata.
- `content/history/regions/<revision>.json`: exact catalog snapshots before adding Regions.
- SQLite: derived neuron, relation, and full-text indexes. Rebuild from Markdown with `pnpm neuron index --rebuild`.

Personal content and databases are ignored by Git. Application Git history is not a backup of personal knowledge. Keep private backups of the content directory; rebuilding SQLite cannot recreate lost source files or neuron revisions.

Local web and CLI commands derive the data directory from the operating system home directory: `~/.neuron404`. SQLite is always `neuron404.db` and knowledge files are under `content/` in that directory. No path configuration is required. Docker sets `NEURON404_DATA_DIR=/data` internally to use its bind mount; this optional root override also supports other deployment locations.

Existing Markdown remains valid without aliases, structured sources, or lifecycle fields. Its default lifecycle is `active`, which does not imply verified or current knowledge. The storage refactor does not rewrite legacy bodies, invent source snapshots, or infer replacements.

Network renders actual neurons and typed synapses. Regions define labeled background areas and layout forces that keep members near one another, including isolated neurons. A neuron can belong to multiple regions. There is no synthetic root index, region node, or membership edge. Grouping does not create semantic relationships.

## Agent commands

Use `pnpm neuron <command>` inside this repository. From another directory, invoke this repository's `bin/neuron404` using its absolute path. It resolves the repository itself, loads its `.env`, and uses the same content and database. It does not install global configuration.

```sh
pnpm neuron catalog
pnpm neuron region:add < region.json
pnpm neuron search "runtime defaults" --region project-id --limit 5
pnpm neuron read neuron-id another-neuron-id
pnpm neuron source:read source-id
pnpm neuron history neuron-id
pnpm neuron history neuron-id revision-hash
pnpm neuron index
pnpm neuron index --rebuild
pnpm neuron lint
```

`source:add`, `add`, and `update <id>` accept JSON on stdin. `source:add` requires `title`, `uri`, and `content`, with optional `locator`. It returns a snapshot ID; a neuron's `sources` array references those IDs. Repeated captures of identical source payloads reuse the same snapshot.

The agent classifies knowledge during ingestion, reusing a suitable Region from `catalog` or creating one with `region:add`. This command accepts `{id, title, description}` on stdin, locks the catalog, preserves its previous bytes, and refuses to overwrite a conflicting definition. Repeating an identical definition reuses it. Classification uses the AI running the skill; the CLI does not call a separate model. A new subject should not silently become Unfiled because its Region is absent.

Agent `add` commands require `title`, `body`, `grounding`, `endorsement`, `provenance`, and a nonempty `topics` array of Region IDs. Optional arrays are `aliases`, `sources`, and `synapses`. Each synapse has `target`, `kind`, and optional `note`; supported kinds are `supports`, `contradicts`, `extends`, `cites`, and `questions`. Legacy unfiled neurons remain readable, and the manual web form remains compatible; automatic classification belongs to the agent ingestion workflow.

`read` returns the neuron, its content-hash `revision`, incoming links, and relevant contradiction/question/replacement bodies. `update` accepts changed fields plus the exact `expectedRevision` from a fresh read. Write receipts include `topics` so the agent can confirm Region assignment. Concurrent or stale updates fail instead of overwriting newer knowledge. Prior versions retain their exact bytes. Update the same neuron when knowledge develops; create a new neuron for a distinct concept.

Lifecycle is separate from semantic relationships: `active`, `superseded` with `supersededBy`, or `retracted`. Use `--include-history` to include inactive neurons in search. A `contradicts` synapse does not automatically mark either neuron superseded.

Search uses weighted BM25 over titles, aliases, and bodies, with optional region scope and a lexical coverage filter. It returns caution links even if those linked neurons were not separate search hits. This is not embedding search: different wording may require another query. Snippets locate candidates; read the supporting neurons before answering.

## Recovery and chat access

Writes use a storage lock, immutable revision snapshots, and atomic file replacement. Index synchronization updates changed rows in a transaction. If a file was saved but subsequent processing failed, read the neuron identified by the error before retrying, then run `pnpm neuron index`. A leftover `content/.write-lock` after a crash must be checked against its recorded PID before removal; never remove a live writer's lock.

The portable skill source is [skills/neuron404/SKILL.md](skills/neuron404/SKILL.md). It loads only the workflow reference needed for retrieval, maintenance, or verification and delegates to the existing CLI through `skills/neuron404/scripts/neuron404`.

Claude's global entry at `~/.claude/skills/neuron404` and Codex's global entry at `~/.agents/skills/neuron404` are symlinks to this repository's `skills/neuron404/`. The launcher resolves that link to locate the repository from any working directory; `NEURON404_HOME` can explicitly select another repository. The project-local `.claude/skills/neuron404/` copy has been removed.

The user authorizes improving this skill during actual use. Keep the repository directory as the canonical source: changes made through either global link already update the project and the other client. Resolve links before editing and preserve this setup instead of creating independent copies. If the repository moves, update both links. Do not include personal knowledge or local transcripts in skill changes, modify unrelated client settings, or commit automatically.

Global discovery applies to local clients with access to these paths. It does not provide cloud access, remote hosting, an MCP server, or an additional LLM provider; each client still needs tool access to the same store.
