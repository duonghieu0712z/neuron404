# Retrieve recorded knowledge

Use the skill launcher described in `SKILL.md`; commands below are its arguments.

## Locate and read

Interpret the subject, project context, time frame, and requested depth. Region scope is optional: search globally when the question crosses contexts or the region is unknown. For a broad question, use `catalog --query "<project or subject>"` to locate Region definitions and counts. This filters Region names/descriptions, not neuron content; a miss is not evidence of absence. `catalog` is paginated (20 Regions by default); follow `nextOffset` with `--offset N` when necessary instead of loading the whole catalog. Narrow questions can start with search directly.

Use `search "<specific terms>" [--region <id>] [--limit <1-50>] [--offset N]`. Prefer named subjects, identifiers, or distinctive terminology over a full conversational sentence. Search uses token prefixes over titles, aliases, retrieval cues and bodies; it is lexical, not semantic. At most 24 distinct non-stopword terms are accepted. If relevant evidence is missing, try alternate wording, abbreviations, aliases, or a broader scope. Use `--include-history` when investigating replaced decisions or retracted knowledge. A no-match result does not establish absence of knowledge.

Search returns candidates and snippets, not a ready-made answer. Use `catalog --region ID --limit N --offset N` when selecting by scope or reading situation rather than keywords. It returns titles, aliases, optional `retrievalCues` and revisions without article bodies; follow `nextOffset` only as needed. Existing neurons may have no cues, so keep global keyword/alias searches available rather than treating the catalog as complete semantic routing.

Use `read <id> [<id> ...]` to read the relevant neurons together, up to 50 at a time. Read their bodies, incoming relationships, and relevant `cautions`, including contradictions, questions, and replacement chains. Keep historical and current viewpoints distinct. `read` bounds incoming links and automatically expanded caution/replacement bodies; if `contextTruncated` is true, inspect `neighbors ID --kind contradicts --direction incoming --limit N --offset N` (also inspect questions, outgoing cautions, and replacement IDs as needed) and follow replacement IDs explicitly before claiming a complete assessment. `neighbors` also supports selective traversal of other synapse kinds and returns metadata without neighbor bodies. Follow its `nextOffset`; read only neighbors needed for the answer. A contradiction alone does not decide which side is correct; an old neuron's default `active` lifecycle is compatibility metadata, not a validity judgment.

`read` also returns relevant persisted knowledge reviews when available. Inspect open findings, evidence checks and `stale` before relying on a claim; follow the original evidence when a review flags unsupported content. A report is another assessment, not proof. Historical reports are available through `review:read ID`; ordinary queries do not trigger maintenance.

For a broad project or Region question, locate the relevant Region with `catalog` and read its overview with `region:read ID --summary` first. This omits the membership revision map, full member list and review reports; it is for orientation, not editing. Use it to identify the relevant member neurons, then read the supporting details needed for the answer. Check `stale` and distinguish historical claims; an overview is synthesis, not independent evidence. If it is absent or stale, browse current members with the paginated Region catalog and read the relevant neurons without silently refreshing the article. For a narrow question, search directly rather than loading a whole Region.

Cover the relevant aspects across multiple neurons when the question calls for an overview. Do not describe an entire project as fully understood from one debugging note. Follow links selectively rather than loading every neuron or source.

## Index freshness

Writes through the CLI update the index immediately. Ordinary reads reuse it; external in-place Markdown edits are checked on the next query after a 30-second reconciliation interval. Directory/catalog changes and a dirty marker bypass that interval. Reconciliation stats files and parses only changed ones. `read ID` verifies selected Markdown against its indexed revision and reconciles a mismatch immediately. Use `index` when external edits must be searchable immediately; `index --rebuild` reparses everything for recovery. No daemon or model is required for indexing.

## Answer from evidence

Cite supporting neuron IDs and titles, linking to the actual Markdown files when the client supports file links. Keep the applicable version, dates, conditions, uncertainty, and disputed status attached to the claims they qualify. Use `source:read <source-id>` when the original evidence matters. Source snapshots establish what a source said, not whether it was correct.

Distinguish stored knowledge from new inference or outside knowledge. If the requested answer is incomplete, state the specific gap. If retrieval failed because access was unavailable, report that failure instead of presenting an empty store.

Ordinary queries do not modify knowledge or save the answer. If the session authorizes retaining a useful synthesis or correction, switch to the Maintain workflow within that scope. Do not turn automatic skill improvement into permission to rewrite personal knowledge.
