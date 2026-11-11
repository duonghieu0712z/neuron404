# Architecture and storage

## Knowledge model

A **Neuron** is a knowledge unit, a **Synapse** is a typed semantic relationship, a **Region** groups neurons, and the **Network** visualizes their connections. A neuron can belong to several Regions or have no Synapses. Region membership is metadata, not a semantic relationship. These names are product metaphors rather than a biological simulation.

Markdown holds authoritative knowledge; SQLite is a derived search index. The web application, CLI and remote API use the same storage services, revision checks and history.

## Code boundaries

Routes load data, handle requests and compose feature components. Product components live in `src/lib/components/` under `network`, `neuron`, `review`, `markdown` and `workspace`; `ui` contains the shadcn-svelte primitives. Workspace components own the header, search, resizable detail layout and scroll controls. Markdown rendering and citation interactions are separate from the content components.

`src/lib/network/` owns graph preparation, renderer state and styles, canvas layers, motion, simulation forces, search and browser preferences. Each renderer instance owns its layers and disposes event listeners, observers and animation frames when the view changes. The Network route connects these services to selection and controls.

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

The `/network` view renders real neurons and typed Synapses with WebGL. Region boundaries group related members; a draggable hexagonal marker opens each Region's overview. These metadata markers and optional dashed membership lines are excluded from neuron/Synapse counts and do not create stored relationships.

Search, hover and selection emphasize relevant neurons while fading unrelated content. Search takes priority over the sidebar selection until cleared. The sidebar retains selection when switching between Neurons and Network. Motion and display controls are saved in the browser; motion respects reduced-motion preferences.

## Maintenance integrations

The optional maintenance worker schedules evidence audits and Region overview generation. Agent adapters prepare executable arguments, input and output parsing; the shared runner controls timeouts, cancellation, output limits and schema validation. Adapters implement `MaintenanceAgentAdapter` in `src/lib/server/maintenance/agents/types.ts` and register in `agents/index.ts`. Registering an adapter does not enable it. See [maintenance](maintenance.md) for configuration and report handling.
