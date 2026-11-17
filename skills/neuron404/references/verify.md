# Verify structure or content

Use the skill launcher described in `SKILL.md`. Distinguish structural integrity, source fidelity, and factual validity; they answer different questions.

## Structural checks

`lint` validates frontmatter, references, Region membership, lifecycle consistency, and referenced source hashes. A clean result does not establish that the knowledge is true. Isolated neurons are valid and do not need invented synapses.

`index` synchronizes changed Markdown into SQLite and recovers stale derived data. Use `index --rebuild` when a full reindex is needed. Indexing does not rewrite the authoritative neuron bodies or repair factual mistakes.

## Content verification

For a requested claim, use search and `read` to identify the actual neuron, caution context, and attached `reviews`. Read its cited evidence with `source:read`. `review:reports` lists the latest stored reviews; `review:read ID` reads an immutable report, including the exact input revisions and evidence quotes. Reports assess fidelity to supplied evidence, not independent real-world truth.

Background maintenance is disabled unless `NEURON404_MAINTENANCE_PROVIDER` explicitly selects an adapter. Claude and Codex implement the shared `MaintenanceAgentAdapter` interface; neither is selected automatically. Do not enable a provider as a side effect of retrieval or review.

The configured worker scans each neuron independently, including unfiled neurons, and records coverage by revision and excerpt. It keeps Region overview synthesis separate. `review:status [ID]` exposes pending/running/failed scopes, source-support outcomes, provider availability and hourly limits. `review:request ID` schedules background work; it does not call the model in the request. A completed job only means its recorded scope ran. Large sources are processed as exact excerpts with positions and continuation scopes; do not claim the entire source was read from one excerpt.

Use `dispute:list` and `dispute:read ID` to inspect persistent issues, arguments, evidence and decisions. Contradictions open a dispute; missing evidence stays waiting for evidence and is not evidence of falsity. Events are immutable. Concurrent decision heads are a conflict; incomplete synced context cannot be automatically resolved. A material revision or new evidence can reopen a prior issue. `dispute:open`, `dispute:comment` and `dispute:resolve` accept JSON with `neurons`, `note`, `author`, optional `evidence`, and `expectedHeads` for updates. Resolve also accepts `status` (`resolved`, `dismissed`, `waiting-evidence`). Use these only when authorized.

`source:refresh SOURCE_ID` queues a refresh of a recorded source. HTTP/HTTPS refresh retains raw responses and extracted snapshots; an HTTP 304 is not a truth check. File sources require explicit registered roots. A source failure does not retract knowledge. The worker can prepare a focused Proposal and use a separate verifier against the original sources before applying it. Personal choices, unsupported changes and unresolved contradictions remain for human review or further evidence. Lifecycle, endorsement, deletion and merging are never automatic. A rejected repair is not retried for the same evidence merely because time passed.

Compare the claim with its evidence: does the source support the same subject, version, date, conditions, and degree of certainty? Note unsupported details, omitted limitations, reasoning presented as observation, and later contradictions or replacements. Separate a faithful account of a source from independent confirmation that the source is correct.

If a legacy neuron cites a path or URL only in its body, inspect it when tools and authorization permit. Do not silently create snapshots or relabel provenance during an audit. A changed or inaccessible source limits verification; it does not prove the stored claim false. Refresh time-sensitive evidence when required, explicitly distinguishing the new check from the historical source.

Report the relevant neuron, evidence, mismatch or uncertainty, and proposed correction. Verification alone does not authorize applying it. Follow the Maintain workflow when correction is requested or covered by standing authorization; do not require repeated approval for an already authorized correction.

## Interrupted writes

A remaining `content/.write-lock` can indicate a live writer or a crashed one. Check its recorded PID before taking action. Do not remove a live writer's lock or guess that a timeout means the writer died. When access or recovery exceeds available permissions, report the limitation without editing the database as a workaround.
