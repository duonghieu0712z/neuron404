---
name: neuron404
description: Retrieve personal knowledge from neuron404 with evidence and corrections, save or update authorized durable knowledge, or inspect stored knowledge. Use for requests to remember, recall, revisit earlier project decisions, or verify recorded claims.
---

# neuron404

Use the shared personal knowledge store across projects and conversations. Its foundation is LLM Wiki: preserve evidence, maintain accumulated knowledge, and retrieve it with citations. **Neuron** is a coherent knowledge unit; **Synapse** is a typed semantic relationship; **Region** groups knowledge; **Network** is the exploration view. An isolated neuron is valid. Shared region membership does not imply a synapse.

## Connect to the store

Invoke `scripts/neuron404` relative to this skill's actual directory. It follows the installed symlink to this repository and delegates to the existing CLI, independently of the calling project. `NEURON404_HOME` optionally selects a different neuron404 repository. Use the client's discovered skill path, not its current project directory, to locate this launcher.

```sh
"/absolute/path/to/skills/neuron404/scripts/neuron404" catalog
```

The launcher requires local shell access, Node.js, pnpm, and an initialized repository database. A missing capability or inaccessible store is a connection failure, not evidence that no knowledge exists. Do not create another store, install dependencies, or change client permissions merely to answer a recall question.

## Select the workflow

Read only the relevant reference:

- Recall, explain, compare, or summarize recorded knowledge: [Retrieve](references/retrieve.md).
- Save durable knowledge, enrich an existing neuron, or apply an authorized correction: [Maintain](references/maintain.md).
- Inspect integrity or verify a recorded claim against evidence: [Verify](references/verify.md).

A request to read or evaluate does not authorize saving, rewriting, or adding synapses. Respect standing authorization when it exists; do not ask again for actions already covered by it. Development lessons can be knowledge, but raw progress and temporary work logs need not be stored.

Use the CLI for mutations. It handles source snapshots, revision history, validation, and index synchronization. Do not bypass optimistic concurrency or edit SQLite directly. A save is complete only when its receipt returns an ID and revision.

## Improve the shared skill

The user authorizes improving this skill during real use when an observed failure, ambiguity, or repeated friction justifies a focused correction. The canonical source is this skill directory after resolving symlinks, normally `<repository>/skills/neuron404/`; a store override does not relocate the skill source. Claude and Codex global entries should remain symlinks to it, so improvements remain in the project and reach both clients. Resolve symlinks before editing; preserve links instead of replacing them with copies.

Update only the relevant instructions or helper, check affected behavior, and briefly report material changes. Do not store private neuron content, project-specific examples, credentials, or transcripts in the skill, invent a new policy from one example, modify unrelated application behavior, or commit automatically. If the repository moves or an installation is copied, reconcile the installed paths with the canonical source before continuing skill maintenance.
