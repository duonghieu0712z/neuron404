# Architecture and storage

## Knowledge model

A **Neuron** is a knowledge unit, a **Synapse** is a typed semantic relationship, a **Region** groups neurons, and the **Network** visualizes their connections. A neuron can belong to several Regions or have no Synapses. Region membership is metadata, not a semantic relationship. These names are product metaphors rather than a biological simulation.

Markdown holds authoritative knowledge; SQLite is a derived search index. The web application, CLI and remote API use the same storage services, revision checks and history.

## Code boundaries

Routes load data, handle requests and compose feature components. Product components live in `src/lib/components/` under `network`, `neuron`, `review`, `markdown` and `workspace`; `ui` contains the shadcn-svelte primitives. Workspace components own the header, search, resizable detail layout and scroll controls. Markdown rendering and citation interactions are separate from the content components.

`src/lib/network/` owns graph preparation, renderer state and styles, WebGL layers, motion, simulation forces, search and browser preferences. Each renderer instance owns its layers and disposes event listeners, observers and animation frames when the view changes. The Network route connects these services to selection and controls.

Server modules separate orchestration from storage and validation. Maintenance builds review bundles, prepares evidence references, validates results, stores reports and schedules leased work independently of model execution. Neuron retrieval separates catalogs, context expansion, neighbors and history; index reconciliation delegates transactional persistence. Sync keeps path checks, content validation, scoped reads, manifests and remote transport separate from conflict resolution. Existing command entry points retain their public exports.

Split modules when their responsibilities diverge, rather than to meet a line limit. Keep small, cohesive modules intact, place helpers beside their feature and keep dependencies directed toward domain and storage services. Release archive helpers live in `scripts/release/`; executable scripts retain their existing command paths.

## Data layout

The default root is `~/.neuron404`. Docker mounts that directory at `/data`; `NEURON404_DATA_DIR` can override the root for another deployment location.

| Path under the data root        | Contents                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `content/neurons/<id>.md`       | Current neuron frontmatter and body                                             |
| `content/sources/<sha256>.json` | Immutable evidence snapshots with source URI and capture metadata               |
| `content/regions.json`          | Region definitions                                                              |
| `content/regions/<id>.md`       | Authored Region overviews and supporting revisions                              |
| `content/history/`              | Exact prior neuron, overview and catalog revisions, including migration history |
| `content/operations.jsonl`      | Append-only write receipts                                                      |
| `neuron404.db`                  | Derived indexes and database migration state                                    |
| `maintenance/`                  | Worker state, reports and events                                                |
| `sync/`                         | Remote checkpoints and unavailable-reference metadata                           |

Writes use a cross-process lock, atomic file replacement and content-hash optimistic concurrency. Updates preserve previous file bytes. Older neurons without lifecycle metadata default to `active`; that status does not imply verification. See [CLI operations and recovery](agent-workflows.md).

Application Git history does not contain personal data. Back up the full data root; rebuilding SQLite cannot restore lost Markdown, source snapshots or history. See [deployment](deployment.md).

## Indexing and retrieval

Search uses SQLite full-text indexes; it does not require embeddings or a model call. Region catalogs and neuron summaries allow callers to narrow the scope before loading bodies.

CLI writes update the index immediately. A persisted checkpoint tracks file stamps and revisions. External edits are reconciled on subsequent queries after 30 seconds, or earlier when directory/catalog changes or a dirty marker are detected. Reconciliation parses changed files; reading a selected neuron verifies its actual content hash. `neuron404 index` synchronizes immediately, while `neuron404 index --rebuild` reparses the store. Markdown remains authoritative throughout.

## Network

The `/network` view renders neurons, typed Synapses, Region boundaries, membership lines and animated signals in a single WebGL2 canvas through Sigma custom layer programs. Region geometry renders before edges; signals render before nodes and labels. Detached Canvas 2D contexts only measure text and resolve colors; the color readback context requests `willReadFrequently`. All node labels share a final depth pass because Sigma caches a single label buffer across passes; node focus depth remains independent. Region boundaries group related members; a draggable hexagonal marker opens each Region's overview. These metadata markers and optional dashed membership lines are excluded from neuron/Synapse counts and do not create stored relationships.

Search, hover and selection emphasize relevant neurons while fading unrelated content. Selecting a neuron on the graph or in search frames its Region when membership is unambiguous; shared neurons retain the current Region or fall back to their direct neighborhood. Region buttons in the neuron sidebar change focus without replacing the open neuron. Camera fitting accounts for the resized sidebar, bounds excessive zoom-out and respects reduced-motion preferences. Background snapshot updates preserve the current camera.

Automatic selection focus uses the shadcn-svelte Toggle component with its standard active and inactive styles. It can be disabled independently of explicit Region focus; that preference is saved in browser storage. The `neuron` and `region` URL parameters restore selected context on reload or external navigation, while preserving the `q` search parameter. Selection writes replace the current shallow history entry and are serialized to avoid obsolete requests restoring an older selection. The sidebar's View in Network link carries its selected neuron into that URL.

## Maintenance integrations

The optional maintenance worker schedules evidence audits and Region overview generation. Agent adapters prepare executable arguments, input and output parsing; the shared runner controls timeouts, cancellation, output limits and schema validation. Adapters implement `MaintenanceAgentAdapter` in `src/lib/server/maintenance/agents/types.ts` and register in `agents/index.ts`. Registering an adapter does not enable it. See [maintenance](maintenance.md) for configuration and report handling.

## Evidence and reviewed updates

Saved source snapshots can be read in a resizable pane beside a neuron. Numbered citations with snapshot metadata open that exact snapshot; a citation with one unambiguous matching structured source URI can also open it. Modified clicks and original-source links retain normal new-tab behavior. The source view distinguishes the cited passage in the neuron from an optional exact excerpt suggested by word overlap, and exposes the complete stored raw text. Matching words do not establish that the source supports the claim.

Region reading paths live in `content/reading-paths/<region>.json`, with prior bytes under `content/history/reading-paths/`. They are authored navigation, separate from Region membership and semantic Synapses. Proposals live in `content/proposals/<uuid>.json`, retaining their base snapshot, patch, reason, client label and final selection. Neither is included in the existing sync manifest.

The Network checks its authenticated snapshot endpoint every two seconds while visible, returns no model payload for unchanged ETags, and backs off after errors. Updates retain existing positions, camera state and normalization bounds. A request does not replace the graph during pointer interaction. New neurons are placed near existing neighbors or their Region. Search results preserve full-text relevance order, support Region, grounding and endorsement filters, and use the same Region or neighborhood focus behavior as graph selection.
