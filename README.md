# neuron404

A personal knowledge store based on the [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). AI agents save and maintain knowledge as **neurons**, connect justified semantic relationships with **synapses**, and retrieve evidence in later conversations. The web application browses that same store.

## Development

Use Node.js >=24 and the pnpm version in `package.json`.

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:index
pnpm dev
```

`pnpm check`, `pnpm lint`, `pnpm format`, and `pnpm build` verify the application. `pnpm neuron:lint` checks stored structure and source integrity. There is no test runner configured.

## Terminology

**Neuron** is a knowledge unit, **Synapse** is a semantic relationship, **Region** groups neurons by knowledge context, and **Network** is the exploration view. Region membership does not require synapses. These names are neuroscience-inspired product metaphors, not a biological simulation. Legacy `topics` fields, `content/topics.json`, and the legacy `--topic` flag remain compatible; new search commands use `--region`. These are compatibility names for regions, not a separate taxonomy.

## Storage

- `content/neurons/<id>.md`: current neuron bodies and frontmatter; authoritative knowledge.
- `content/sources/<sha256>.json`: immutable evidence snapshots with source URI, optional locator, and capture time.
- `content/history/<id>/<revision>.md`: exact original and subsequent versions saved by updates.
- `content/operations.jsonl`: append-only write receipts with current and previous revisions.
- `content/topics.json`: topic definitions; membership is neuron metadata.
- SQLite: derived neuron, relation, and full-text indexes. Rebuild from Markdown with `pnpm neuron index --rebuild`.

Personal content and databases are ignored by Git. Application Git history is not a backup of personal knowledge. Keep private backups of the content directory; rebuilding SQLite cannot recreate lost source files or neuron revisions.

Existing Markdown remains valid without aliases, structured sources, or lifecycle fields. Its default lifecycle is `active`, which does not imply verified or current knowledge. The storage refactor does not rewrite legacy bodies, invent source snapshots, or infer replacements.

Network renders actual neurons and typed synapses. Regions define labeled background areas and layout forces that keep members near one another, including isolated neurons. A neuron can belong to multiple regions. There is no synthetic root index, region node, or membership edge. Grouping does not create semantic relationships.

## Agent commands

Use `pnpm neuron <command>` inside this repository. From another directory, invoke this repository's `bin/neuron404` using its absolute path. It resolves the repository itself, loads its `.env`, and uses the same content and database. It does not install global configuration.

```sh
pnpm neuron catalog
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

`add` requires `title`, `body`, `grounding`, `endorsement`, and `provenance`. Optional arrays are `aliases`, `topics`, `sources`, and `synapses`. Each synapse has `target`, `kind`, and optional `note`; supported kinds are `supports`, `contradicts`, `extends`, `cites`, and `questions`.

`read` returns the neuron, its content-hash `revision`, incoming links, and relevant contradiction/question/replacement bodies. `update` accepts changed fields plus the exact `expectedRevision` from a fresh read. Concurrent or stale updates fail instead of overwriting newer knowledge. Prior versions retain their exact bytes. Update the same neuron when knowledge develops; create a new neuron for a distinct concept.

Lifecycle is separate from semantic relationships: `active`, `superseded` with `supersededBy`, or `retracted`. Use `--include-history` to include inactive neurons in search. A `contradicts` synapse does not automatically mark either neuron superseded.

Search uses weighted BM25 over titles, aliases, and bodies, with optional region scope and a lexical coverage filter. It returns caution links even if those linked neurons were not separate search hits. This is not embedding search: different wording may require another query. Snippets locate candidates; read the supporting neurons before answering.

## Recovery and chat access

Writes use a storage lock, immutable revision snapshots, and atomic file replacement. Index synchronization updates changed rows in a transaction. If a file was saved but subsequent processing failed, read the neuron identified by the error before retrying, then run `pnpm neuron index`. A leftover `content/.write-lock` after a crash must be checked against its recorded PID before removal; never remove a live writer's lock.

The repository-local skill is `.claude/skills/neuron404/SKILL.md`. Other projects can configure `NEURON404_HOME` to this repository and call `"$NEURON404_HOME/bin/neuron404"`. Skills provide workflow instructions, not storage. Each chat client still needs permission and a tool capable of reaching the same store. No global skill installation, remote hosting, MCP server, embedding model, or additional LLM provider is configured by this project.
