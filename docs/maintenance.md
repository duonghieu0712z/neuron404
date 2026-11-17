# Knowledge maintenance

Maintenance is disabled until `NEURON404_MAINTENANCE_PROVIDER` explicitly selects `claude` or `codex`. No CLI, model or login is installed or selected automatically. The web development server, production web server and headless API start the configured worker; build does not. The process singleton prevents duplicate loops during hot reload, and persisted leases prevent concurrent model calls across processes sharing the store. A host can also run `pnpm maintenance` independently of Docker.

```sh
pnpm maintenance --once
pnpm maintenance --audit --once
pnpm maintenance --overview --once
pnpm neuron review:status
pnpm neuron review:request NEURON_ID
pnpm neuron review:reports
pnpm neuron review:read REPORT_ID
pnpm neuron dispute:list
pnpm neuron dispute:read DISPUTE_ID
pnpm neuron source:refresh SOURCE_ID
```

The scanner reads files independently and records errors without blocking valid neurons or requiring a successful index rebuild. Each neuron, including unfiled and historical neurons, has revision-specific work with continuation scopes when input is large. Source and context excerpts retain original positions. Region overviews remain a separate task. Coverage describes what was actually supplied, not exhaustive all-pairs comparison or independent confirmation of truth. Source fidelity, cross-check findings, infrastructure completion and unverifiable content remain distinct.

Candidate selection uses direct incoming/outgoing relations, replacement chains, shared sources, folded content/alias/retrieval-cue overlap and a stable rotating catalog page. BM25 retains partial term matches after stronger matches and respects Region/lifecycle filters. No embedding model or vector database is used. Catalog discovery is orientation; conclusions require actual excerpts.

HTTP/HTTPS sources and URLs recorded in neuron bodies are refreshed with bounded requests, validated public DNS addresses pinned to each connection, conditional headers, redirect limits and a 512 KB response limit. Text, UTF-8 HTML and JSON are supported. Raw bytes (base64), their hash, extraction version, timestamps and immutable extracted snapshots are retained. Layout-only whitespace changes do not invalidate semantic review. A 304 indicates unchanged HTTP resource state, not correct knowledge. Errors and unsupported formats are recorded without retracting neurons. File refresh requires `NEURON404_SOURCE_ROOTS` containing a JSON array of explicitly registered source directories; arbitrary historical paths are not read.

Sources default to weekly refresh; daily and monthly policies can be recorded by the source refresh command, with a reason required for monthly. Scheduling is an operating policy, not a truth expiry date. Changed evidence is supplied alongside old snapshots for dependent review.

New reports, dispute events, refresh evidence and repair receipts are immutable hashed artifacts under `content/maintenance/`. Original version-1 reports remain intact under `maintenance/reports/` and can be imported without changing their hashes. New per-neuron reports use version 2 with explicit scopes. Dispute states are open, waiting for evidence, resolved and dismissed. Comments and all prior arguments remain visible; concurrent decision heads are conflicts. Source counts and timestamps do not determine which claim wins.

A report can prepare one focused Proposal with original evidence. Another model session receives before/after content and original sources, independently verifies the entire patch, and can reject it. Code checks exact quotes, references, source IDs, patch size, revisions and lease ownership. Supported small patches can be applied through the existing Proposal revision service. Personal/original decisions, unresolved contradictions and broad changes remain reviewable Proposals. The worker never deletes or merges neurons, changes lifecycle or assigns human endorsement. Missing evidence waits for evidence rather than forcing approval. Rejected inputs do not repeat indefinitely; infrastructure errors use bounded retries. Post-write failures retain the prepared target revision for recovery without overwriting newer edits.

Default limits are one model call at a time, four reserved calls per hour, 120 seconds per call and three infrastructure attempts. Review and repair work alternate when available; oldest review jobs run first. Requests are reserved before a call and remain consumed after interruption. A repair may require several passes. Queue, leases and rate windows are machine-local under `maintenance/state.json` and are not synced.

Sync protocol 3 carries immutable maintenance artifacts plus Proposals, reading paths and their history. Both peers must support the protocol before writes. Scoped sync includes only artifacts whose recorded neuron/Region dependencies fit the selected scope and includes their necessary source snapshots. Missing parents/context remains incomplete, preventing automatic resolution. Concurrent immutable events are retained rather than resolved by last-write-wins. No remote sync is initiated by maintenance.

`dispute:open`, `dispute:comment` and `dispute:resolve` use JSON payloads with `neurons`, `author`, `note`, optional exact `evidence` and `expectedHeads` for updates. Resolution accepts `status`: `waiting-evidence`, `resolved` or `dismissed`. Existing report and finding-decision commands remain available. Review requests and source refresh requests queue work rather than calling the model in HTTP handlers.
