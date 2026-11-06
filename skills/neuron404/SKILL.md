---
name: neuron404
description: Search personal knowledge with evidence, save or update authorized knowledge, or review the current conversation for knowledge worth retaining. Use when neuron404 is invoked, or for requests to remember, revisit earlier decisions, ingest knowledge, or verify recorded claims.
---

# neuron404

Use the shared personal knowledge store across projects and conversations. Its foundation is LLM Wiki: preserve evidence, maintain accumulated knowledge, and retrieve it with citations. **Neuron** is a coherent knowledge unit; **Synapse** is a typed semantic relationship; **Region** groups knowledge; **Network** is the exploration view. Use neuroscience or neurobiology terminology for new product concepts, according to their actual roles. Region membership uses `regions` in CLI payloads and results. An isolated neuron is valid. Shared region membership does not imply a synapse.

## Connect to the store

Invoke `scripts/neuron404` relative to this skill's actual directory. It follows the installed symlink to this repository and delegates to the existing CLI, independently of the calling project. `NEURON404_HOME` optionally selects a different neuron404 repository. Use the client's discovered skill path, not its current project directory, to locate this launcher.

```sh
"/absolute/path/to/skills/neuron404/scripts/neuron404" catalog --limit 20
```

The launcher requires local shell access, Node.js, pnpm, and an initialized repository database. A missing capability or inaccessible store is a connection failure, not evidence that no knowledge exists. Do not create another store, install dependencies, or change client permissions merely to answer a recall question.

## Interpret the invocation

The skill is named `neuron404`. In clients that expose skills as slash commands, use `/neuron404`; use the client's native skill invocation otherwise. Commands below are optional skill intents, not additional CLI subcommands. Interpret natural-language requests in the user's language without requiring a keyword.

| Invocation or intent                                                       | Workflow                                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| No arguments                                                               | [Review the current conversation](references/context-review.md); propose useful additions or updates without writing |
| `search <request>` or a question about stored knowledge                    | [Retrieve](references/retrieve.md); find, read, and answer with evidence                                             |
| `save <request>` or an explicit request to remember or update knowledge    | [Maintain](references/maintain.md), using the specified conversation context or material                             |
| `ingest <source or request>` or a request to learn from specified material | [Maintain](references/maintain.md), preserving source evidence and synthesizing durable knowledge                    |
| `review <subject>` or a request to assess stored knowledge                 | [Verify](references/verify.md); report findings and proposed changes without applying them                           |

Examples: `/neuron404`, `/neuron404 search how does asset remapping work?`, `/neuron404 save the decision we just agreed on`, `/neuron404 what did we decide about deployment?`, `/neuron404 learn from the notes in /path/to/project`.

Read only the references needed for the actual request. Keywords are hints: the full request determines scope, including instructions to only propose or not save. Do not pass skill intents such as `save`, `ingest`, or `review` verbatim to the CLI. Translate them into the documented CLI operations in the chosen reference. If a requested subject or source is omitted, use an unambiguous reference in the visible conversation; ask briefly only when the ambiguity prevents useful work. An explicit question without a keyword remains a retrieval request, not a no-argument review.

A request to read or evaluate does not authorize saving, rewriting, or adding synapses. Respect standing authorization when it exists; do not ask again for actions already covered by it. Development lessons can be knowledge, but raw progress and temporary work logs need not be stored.

Use the CLI for mutations. It handles source snapshots, revision history, validation, and index synchronization. Do not bypass optimistic concurrency or edit SQLite directly. A save is complete only when its receipt returns an ID and revision.

Authorized ingestion includes automatic Region classification. Reuse a suitable Region or register one with `region:add` before saving; do not leave knowledge Unfiled merely because its Region is new. The Maintain workflow defines the classification criteria.

## Improve the shared skill

The user authorizes improving this skill during real use when an observed failure, ambiguity, or repeated friction justifies a focused correction. The canonical source is this skill directory after resolving symlinks, normally `<repository>/skills/neuron404/`; a store override does not relocate the skill source. Claude and Codex global entries should remain symlinks to it, so improvements remain in the project and reach both clients. Resolve symlinks before editing; preserve links instead of replacing them with copies.

Update only the relevant instructions or helper, check affected behavior, and briefly report material changes. Do not store private neuron content, project-specific examples, credentials, or transcripts in the skill, invent a new policy from one example, modify unrelated application behavior, or commit automatically. If the repository moves or an installation is copied, reconcile the installed paths with the canonical source before continuing skill maintenance.
