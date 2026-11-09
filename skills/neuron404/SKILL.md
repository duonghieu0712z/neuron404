---
name: neuron404
description: Search personal knowledge with evidence, save or update authorized knowledge, or review the current conversation for knowledge worth retaining. Use when neuron404 is invoked, or for requests to remember, revisit earlier decisions, ingest knowledge, or verify recorded claims.
---

# neuron404

Use the shared personal knowledge store across projects and conversations. Its foundation is LLM Wiki: preserve evidence, maintain accumulated knowledge, and retrieve it with citations. **Neuron** is a coherent knowledge unit; **Synapse** is a typed semantic relationship; **Region** groups knowledge; **Network** is the exploration view. Use neuroscience or neurobiology terminology for new product concepts, according to their actual roles. Region membership uses `regions` in CLI payloads and results. An isolated neuron is valid. Shared region membership does not imply a synapse.

The store serves human readers and AI retrieval. Knowledge must be understandable as well as accurate and traceable; the Maintain workflow covers explanation, titles, examples, and evidence presentation.

## Connect to the store

Use the installed `neuron404` CLI, or invoke `scripts/neuron404` relative to this skill's actual directory. The shell launcher uses an explicit `NEURON404_HOME` installation first, then a repository-backed installation, then the CLI in `PATH`. It works independently of the calling project. An invalid explicit override fails instead of switching installations. Use the client's discovered skill path, not its current project directory, to locate this launcher.

```sh
"/absolute/path/to/skills/neuron404/scripts/neuron404" catalog --limit 20
```

Ordinary commands always use local storage, even when `NEURON404_URL` is configured. Local data defaults to `~/.neuron404`; the local runtime needs Node.js >=24 and the installed `@duonghieu0712z/neuron404` CLI, an existing repository with pnpm, or a headless distribution. A standalone skill does not require a repository clone. The web application is optional. Use `sync` to synchronize an authorized local store with a configured remote; use `remote <command>` only when the user explicitly wants a direct remote operation. Read [remote connection and sync](references/remote.md) before either operation. Never silently switch destinations after a failure.

On native Windows without `sh`, use `neuron404 <command>` through the package manager's native command shim, or `node <installation>/bin/neuron404.mjs <command>`, and `node <skill-directory>/scripts/remote.mjs <command>` for direct remote access. Current releases use one shared version for the skill, CLI and web; retain sync protocol compatibility when connecting them. A missing runtime or inaccessible store is a connection failure, not evidence that no knowledge exists. Do not create another store, install dependencies, or change client permissions merely to answer a retrieval question.

## Interpret the invocation

The skill is named `neuron404`. In clients that expose skills as slash commands, use `/neuron404`; use the client's native skill invocation otherwise. Commands below are optional skill intents, not additional CLI subcommands. Interpret natural-language requests in the user's language without requiring a keyword.

| Invocation or intent                                                       | Workflow                                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| No arguments                                                               | [Review the current conversation](references/context-review.md); propose useful additions or updates without writing |
| `search <request>` or a question about stored knowledge                    | [Retrieve](references/retrieve.md); find, read, and answer with evidence                                             |
| `save <request>` or an explicit request to remember or update knowledge    | [Maintain](references/maintain.md), using the specified conversation context or material                             |
| `ingest <source or request>` or a request to learn from specified material | [Maintain](references/maintain.md), preserving source evidence and synthesizing durable knowledge                    |
| `sync` or a request to exchange local and remote knowledge                 | [Synchronize](references/remote.md); preserve requested direction and Regions, then report transfers and conflicts   |
| `remote <request>` or explicit direct server access                        | [Remote access](references/remote.md); use the specified remote instead of the local replica                         |
| `review <subject>` or a request to assess stored knowledge                 | [Verify](references/verify.md); report findings and proposed changes without applying them                           |

Examples: `/neuron404`, `/neuron404 search how does asset remapping work?`, `/neuron404 save the decision we just agreed on`, `/neuron404 what did we decide about deployment?`, `/neuron404 learn from the notes in /path/to/project`.

Read only the references needed for the actual request. Keywords are hints: the full request determines scope, including instructions to only propose or not save. Do not pass skill intents such as `save`, `ingest`, or `review` verbatim to the CLI. Translate them into the documented CLI operations in the chosen reference. If a requested subject or source is omitted, use an unambiguous reference in the visible conversation; ask briefly only when the ambiguity prevents useful work. An explicit question without a keyword remains a retrieval request, not a no-argument review.

A request to read or evaluate does not authorize saving, rewriting, or adding synapses. Respect standing authorization when it exists; do not ask again for actions already covered by it. Development lessons can be knowledge, but raw progress and temporary work logs need not be stored.

Use the CLI for mutations. It handles source snapshots, revision history, validation, and index synchronization. Do not bypass optimistic concurrency or edit SQLite directly. A save is complete only when its receipt returns an ID and revision.

Authorized ingestion includes automatic Region classification. Reuse a suitable Region or register one with `region:add` before saving; do not leave knowledge Unfiled merely because its Region is new. The Maintain workflow defines the classification criteria.

## Improve the shared skill

The user authorizes improving this skill during real use when an observed failure, ambiguity, or repeated friction justifies a focused correction. The canonical source is this skill directory after resolving symlinks; a store override does not relocate the skill source. In a repository-backed development installation, it is normally `<repository>/skills/neuron404/`, shared by Claude and Codex through symlinks. An archive installation has its own installed canonical copy and does not require cloning a repository. Preserve existing links, and carry authorized improvements back to the development repository when available; do not silently create a checkout or change the installation method.

Update only the relevant instructions or helper, check affected behavior, and briefly report material changes. Do not store private neuron content, project-specific examples, credentials, or transcripts in the skill, invent a new policy from one example, modify unrelated application behavior, or commit automatically. If the repository moves or an installation is copied, reconcile the installed paths with the canonical source before continuing skill maintenance.
