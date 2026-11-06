# Retrieve recorded knowledge

Use the skill launcher described in `SKILL.md`; commands below are its arguments.

## Locate and read

Interpret the subject, project context, time frame, and requested depth. Region scope is optional: search globally when the question crosses contexts or the region is unknown. `catalog` lists region definitions under the JSON key `regions` and their member counts.

Start with `search "<specific terms>" [--region <id>] [--limit <1-50>]`. Prefer named subjects, identifiers, or distinctive terminology over a full conversational sentence. Search is lexical, not semantic. If relevant evidence is missing, try alternate wording, abbreviations, aliases, or a broader scope. Use `--include-history` when investigating replaced decisions or retracted knowledge. A no-match result does not establish absence of knowledge.

Search returns candidates and snippets, not a ready-made answer. Use `read <id> [<id> ...]` to read the relevant neurons together, up to 50 at a time. Read their bodies, incoming relationships, and relevant `cautions`, including contradictions, questions, and replacement chains. Keep historical and current viewpoints distinct. A contradiction alone does not decide which side is correct; an old neuron's default `active` lifecycle is compatibility metadata, not a validity judgment.

`read` also returns relevant persisted knowledge reviews when available. Inspect open findings, evidence checks and `stale` before relying on a claim; follow the original evidence when a review flags unsupported content. A report is another assessment, not proof. Historical reports are available through `review:read ID`; ordinary queries do not trigger maintenance.

For a broad project or Region question, locate the relevant Region with `catalog` and read its overview with `region:read ID` first. Use it to identify the relevant member neurons, then read the supporting details needed for the answer. Check `stale` and distinguish historical claims; an overview is synthesis, not independent evidence. If it is absent or stale, derive the answer from current members without silently refreshing the article. For a narrow question, search directly rather than loading a whole Region.

Cover the relevant aspects across multiple neurons when the question calls for an overview. Do not describe an entire project as fully understood from one debugging note. Follow links selectively rather than loading every neuron or source.

## Answer from evidence

Cite supporting neuron IDs and titles, linking to the actual Markdown files when the client supports file links. Keep the applicable version, dates, conditions, uncertainty, and disputed status attached to the claims they qualify. Use `source:read <source-id>` when the original evidence matters. Source snapshots establish what a source said, not whether it was correct.

Distinguish stored knowledge from new inference or outside knowledge. If the requested answer is incomplete, state the specific gap. If retrieval failed because access was unavailable, report that failure instead of presenting an empty store.

Ordinary queries do not modify knowledge or save the answer. If the session authorizes retaining a useful synthesis or correction, switch to the Maintain workflow within that scope. Do not turn automatic skill improvement into permission to rewrite personal knowledge.
