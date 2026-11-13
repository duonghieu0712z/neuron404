# Agent workflows

## Agent commands

Use the installed `neuron404 <command>` CLI. In a source checkout, `pnpm neuron <command>` runs knowledge and sync commands; use `pnpm maintenance` for the worker and `bin/neuron404 remote <command>` for direct remote access. The repository's shell launcher can also be called by absolute path from another directory. Ordinary commands use local storage even when `NEURON404_URL` is configured. Use `sync` to exchange data with a remote or the installed CLI's `remote <command>` for an explicit direct server operation. See [installation](installation.md) and [remote access](remote-access.md).

```sh
neuron404 catalog --query "project" --limit 20
neuron404 catalog --region project-id --limit 20 --offset 0
neuron404 region:add < region.json
neuron404 region:read region-id --summary
neuron404 region:read region-id
neuron404 region:write region-id < overview.json
neuron404 search "runtime defaults" --region project-id --limit 5
neuron404 read neuron-id another-neuron-id
neuron404 neighbors neuron-id --kind extends --limit 10
neuron404 source:read source-id
neuron404 history neuron-id
neuron404 history neuron-id revision-hash
neuron404 index
neuron404 index --rebuild
neuron404 lint
```

`source:add`, `add`, and `update <id>` accept JSON on stdin. `source:add` requires `title`, `uri`, and `content`, with optional `locator`. It returns a snapshot ID; a neuron's `sources` array references those IDs. Repeated captures of identical source payloads reuse the same snapshot.

A Region hexagon opens a full authored overview in the detail sidebar. After an ingestion batch, the agent reads the Region members and maintains this article with citations. `region:read ID` returns the article revision and member revisions; `region:write ID` accepts `{body, expectedRevision, memberRevisions}`. Use `null` as the expected revision for a new article. Changes to supporting neurons mark the article as needing a refresh; conflicting writes are rejected and previous article bytes are preserved.

The agent classifies knowledge during ingestion, reusing a suitable Region from `catalog` or creating one with `region:add`. This command accepts `{id, title, description}` on stdin, locks the catalog, preserves its previous bytes, and refuses to overwrite a conflicting definition. Repeating an identical definition reuses it. Classification uses the AI running the skill; the CLI does not call a separate model. A new subject should not silently become Unfiled because its Region is absent.

When upgrading an existing store, run `neuron404 migrate` once before using the application. It applies database migrations, renames the old membership key and catalog to `regions`, refreshes overview member revisions, and synchronizes SQLite. Exact previous files are preserved in history; interrupted migrations can be rerun. Docker initialization performs the same migration automatically.

Agent `add` commands require `title`, `body`, `grounding`, `endorsement`, `provenance`, and a nonempty `regions` array of Region IDs. Optional arrays are `aliases`, `sources`, `synapses`, and `retrievalCues` (up to eight reading situations of 240 characters each). Retrieval cues guide article selection; they are not extra knowledge claims. Existing Markdown remains unchanged when this field is absent. Each synapse has `target`, `kind`, and optional `note`; supported kinds are `supports`, `contradicts`, `extends`, `cites`, and `questions`. Legacy unfiled neurons remain readable, and the manual web form remains compatible; automatic classification belongs to the agent ingestion workflow.

`read` returns the neuron, its content-hash `revision`, incoming links, and relevant contradiction/question/replacement bodies. `update` accepts changed fields plus the exact `expectedRevision` from a fresh read. Write receipts include `regions` so the agent can confirm Region assignment. Concurrent or stale updates fail instead of overwriting newer knowledge. Prior versions retain their exact bytes. Update the same neuron when knowledge develops; create a new neuron for a distinct concept.

Lifecycle is separate from semantic relationships: `active`, `superseded` with `supersededBy`, or `retracted`. Use `--include-history` to include inactive neurons in search. A `contradicts` synapse does not automatically mark either neuron superseded.

Retrieval has two metadata levels: paginated Region definitions (`catalog`, optionally `--query`) and paginated neuron entries (`catalog --region ID`). Entries contain titles, aliases and reading situations, not bodies. Follow `nextOffset` as needed; root catalog queries match Region definitions only. `region:read ID --summary` returns the overview and freshness without membership maps or review reports. Full `region:read` remains available for editing with optimistic concurrency.

Search uses weighted BM25 over titles, aliases, retrieval cues, and bodies, with token prefixes, optional Region scope and lexical coverage calculated inside SQLite before pagination. `--limit 1-50` and `--offset N` bound results; queries accept at most 24 distinct non-stopword terms. It returns caution links even if those linked neurons were not separate search hits. This is not embedding search: different wording may require another query. Snippets locate candidates; read the supporting neurons before answering. `read` opens selected Markdown and relevant cautions rather than every neuron; its compact review assessments omit Region-wide revision maps. It limits automatic expansion to 200 incoming links and 50 caution/replacement bodies per selected neuron, with `contextTruncated` when incomplete. Use paginated `neighbors ID` with `--kind` and `--direction incoming|outgoing|both` to inspect further relationships without loading their bodies.

CLI writes synchronize the index immediately. External file edits are discovered on subsequent queries; run `neuron404 index` for immediate synchronization or `--rebuild` for a complete reparse. Reading a selected neuron verifies its current revision. See [storage and indexing](architecture.md) for the underlying mechanism.

## Recovery and chat access

Writes use a storage lock, immutable revision snapshots, and atomic file replacement. Index synchronization updates changed rows in a transaction and preserves existing synapse IDs when their source, target and kind remain unchanged. If a file was saved but subsequent processing failed, read the neuron identified by the error before retrying, then run `neuron404 index`. A leftover `content/.write-lock` after a crash must be checked against its recorded PID before removal; never remove a live writer's lock.

The [neuron404 skill](../skills/neuron404/SKILL.md) provides retrieval, ingestion and review workflows through this CLI. Use `/neuron404` in Claude or `$neuron404` in Codex. Calling it alone reviews the current conversation and proposes knowledge without saving; a natural-language request selects the relevant operation. Installation and client discovery are covered in the [installation guide](installation.md).

## Propose changes for review

When a change should be reviewed before it affects the current neuron, use `proposal:add ID` instead of `update ID`. The JSON payload contains `expectedRevision`, `author`, `reason`, and `changes`. Supported changes are `title`, `body`, `sources`, and `synapses`; omitted fields are preserved, and arrays replace their corresponding proposed arrays. Add evidence with `source:add` first and include its snapshot ID in the proposed sources.

```json
{
    "expectedRevision": "<current-neuron-revision>",
    "author": "Claude",
    "reason": "Clarify the example and attach its evidence.",
    "changes": {
        "body": "<complete proposed Markdown body>",
        "sources": ["<existing-and-new-source-snapshot-ids>"]
    }
}
```

`proposal:list` and `proposal:read ID` return proposals and their comparison details. The web's **Proposals** view lets a reviewer accept or reject individual content edits, title changes, sources, and groups of synapses sharing a target and relation. Saving resolves the proposal: accepted changes are applied together, and rejected changes remain in its audit record. No proposal changes current knowledge merely by being created. A newer neuron revision blocks application; regenerate the proposal from that revision. Rejection remains available for stale proposals. Existing explicitly authorized `update` operations continue to work directly.

Proposal writes validate the final selection, including source dependencies, preserve neuron history, and leave a prepared receipt for recovery if processing stops after the neuron write. The supplied `author` is a client label, not a verified identity. Remote `proposal:add` requires write permission; resolution is a web session operation.

## Curate a region reading path

Open a Region from Neurons or its network overview, then edit **Reading path**. Save an introduction, an ordered selection of active member neurons, and optional guidance for each step. Reading a step opens its neuron alongside the path, with Previous and Next navigation. Removing a neuron does not silently rewrite the authored path; unavailable steps are omitted from navigation with a notice.

CLI clients use `region:path:read ID` and `region:path:write ID`. A write payload is `{ "expectedRevision": null, "introduction": "...", "steps": [{ "id": "...", "purpose": "..." }] }`; replace `null` with the last returned path revision after the first write. Writes reject duplicate or inactive/nonmember steps and retain the previous path bytes in history.

Proposals and reading paths belong to the selected data root. They are not part of the current neuron/source sync manifest; direct remote commands operate on that remote store. Back up the complete data root to preserve them.
