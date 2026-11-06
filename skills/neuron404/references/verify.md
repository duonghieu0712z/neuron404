# Verify structure or content

Use the skill launcher described in `SKILL.md`. Distinguish structural integrity, source fidelity, and factual validity; they answer different questions.

## Structural checks

`lint` validates frontmatter, references, Region membership, lifecycle consistency, and referenced source hashes. A clean result does not establish that the knowledge is true. Isolated neurons are valid and do not need invented synapses.

`index` synchronizes changed Markdown into SQLite and recovers stale derived data. Use `index --rebuild` when a full reindex is needed. Indexing does not rewrite the authoritative neuron bodies or repair factual mistakes.

## Content verification

For a requested claim, use search and `read` to identify the actual neuron, caution context, and attached `reviews`. Read its cited evidence with `source:read`. `review:reports` lists the latest stored reviews; `review:read ID` reads an immutable report, including the exact input revisions and evidence quotes. Reports assess fidelity to supplied evidence, not independent real-world truth.

Background maintenance is disabled unless `NEURON404_MAINTENANCE_PROVIDER` explicitly selects an adapter. Claude and Codex implement the shared `MaintenanceAgentAdapter` interface; neither is selected automatically. Do not enable a provider as a side effect of retrieval or review.

The optional host maintenance worker performs source audits and independently checks Region overview candidates before publishing. Knowledge reviews cover Region members, direct semantic neighbors/replacements, and a small set of title/alias candidates; they are not exhaustive all-pairs checks. Missing or inaccessible source snapshots mean unverifiable, not false. Findings about contradictions, duplication, missing concepts, or proposed synapses are suggestions and do not edit neurons.

Check report freshness, its coverage, and individual finding decisions. Unresolved findings are carried into later knowledge reports rather than silently disappearing. A carried finding retains its origin report and may need reassessment against changed knowledge. Do not interpret a successful worker job, `stale: false`, or a passing fidelity check as proof that a source is correct. Ordinary retrieval must not start maintenance or trigger model calls.

Compare the claim with its evidence: does the source support the same subject, version, date, conditions, and degree of certainty? Note unsupported details, omitted limitations, reasoning presented as observation, and later contradictions or replacements. Separate a faithful account of a source from independent confirmation that the source is correct.

If a legacy neuron cites a path or URL only in its body, inspect it when tools and authorization permit. Do not silently create snapshots or relabel provenance during an audit. A changed or inaccessible source limits verification; it does not prove the stored claim false. Refresh time-sensitive evidence when required, explicitly distinguishing the new check from the historical source.

Report the relevant neuron, evidence, mismatch or uncertainty, and proposed correction. Verification alone does not authorize applying it. Follow the Maintain workflow when correction is requested or covered by standing authorization; do not require repeated approval for an already authorized correction.

## Interrupted writes

A remaining `content/.write-lock` can indicate a live writer or a crashed one. Check its recorded PID before taking action. Do not remove a live writer's lock or guess that a timeout means the writer died. When access or recovery exceeds available permissions, report the limitation without editing the database as a workaround.
