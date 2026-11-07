# neuron404

A personal knowledge store for AI-assisted learning and retrieval across projects and conversations. Instead of leaving useful knowledge scattered through chat history, neuron404 keeps it in a shared, local store that AI agents can read, update, and cite later.

The foundation is the [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): preserve source material, synthesize durable knowledge, and maintain it as understanding changes. Markdown holds the knowledge; SQLite provides the search index. The web application and agent tools use the same data.

## What it does

- **Save knowledge with context.** Retain explanations, decisions, and useful lessons alongside source snapshots and revision history.
- **Find it again.** Search by text or word prefix, browse Regions, and read related cautions and replacements before reusing a claim.
- **Explore connections.** Browse articles in Neurons or use the interactive Network to inspect relationships, drag neurons, and open Region overviews.
- **Maintain it with AI.** An optional worker checks knowledge against saved evidence, proposes corrections, and refreshes Region overviews. It requires an explicitly selected Claude or Codex CLI.

A **Neuron** is a coherent knowledge unit. A **Synapse** is a meaningful relationship between neurons. A **Region** groups related knowledge and has its own overview. Sharing a Region does not require a Synapse, and independent neurons are valid.

## Getting started

### Docker

With Docker and Compose v2 installed, run from the repository root:

```sh
mkdir -p "$HOME/.neuron404"
docker compose pull
docker compose up -d
```

Open [localhost:3000/neurons](http://localhost:3000/neurons). Compose uses the published `ghcr.io/duonghieu0712z/neuron404` image and names the container `neuron404`. Startup applies migrations and synchronizes the index; a new data directory starts empty. Published images become available after the first release workflow succeeds.

Set `NEURON404_VERSION` to pin a release (for example `0.1.0-beta.2` before the first stable image), or build from source with `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.

Set `NEURON404_PORT` to change the host port. If your UID/GID differs from 1000, set `NEURON404_UID` and `NEURON404_GID` in `.env` before starting Compose; see [.env.example](.env.example). Health checks use `/healthz`.

### Local development

Requires Node.js >=24 and the pnpm version specified in `package.json`.

```sh
pnpm install
pnpm db:migrate
pnpm db:index
pnpm dev
```

Open the URL printed by Vite. Local development and Docker share `~/.neuron404`; no data-path configuration is needed.

## Using it with AI

Install the CLI with `pnpm add -g @duonghieu0712z/neuron404@beta`, then run `neuron404 migrate`. Install the skill separately from its release archive; see [installation without cloning](docs/installation.md). These downloads become available after publishing the first release and npm package.

The [neuron404 skill](skills/neuron404/SKILL.md) guides an agent through searching, saving, and reviewing knowledge via the CLI. Once configured in the client, use `/neuron404` in Claude or `$neuron404` in Codex, followed by a natural-language request such as “What did we decide about deployment?” or “Save this decision with its rationale.”

Calling the skill without a request reviews the current conversation and proposes knowledge worth keeping; it does not save automatically. Access across conversations requires a client with tool access to the store. Local storage is always the default, including offline use. The web UI is optional: use the [headless CLI/API distribution](docs/headless.md) for an installation without it. An optional remote can synchronize knowledge over HTTPS; see [remote access](docs/remote-access.md).

The CLI is also available directly:

```sh
neuron404 search "runtime defaults"
neuron404 catalog --region REGION_ID
neuron404 read NEURON_ID
```

Background maintenance is disabled by default. To enable it, select an installed, authenticated CLI explicitly:

```sh
NEURON404_MAINTENANCE_PROVIDER=claude pnpm maintenance
```

Use `codex` to select Codex instead. The worker checks supplied evidence, not independent real-world truth, and does not rewrite neuron bodies or Synapses. See the [maintenance guide](docs/maintenance.md) for reports and limits.

## Data and development

Knowledge, source snapshots, history, and Region overviews live under `~/.neuron404/content/`. The derived index is `~/.neuron404/neuron404.db`. Back up the entire directory: rebuilding SQLite cannot recover lost Markdown or source snapshots, and application Git history does not include personal data.

The application uses SvelteKit, Svelte, TypeScript, Tailwind CSS, shadcn-svelte, and SQLite. Before submitting changes, run:

```sh
pnpm check
pnpm lint
pnpm format
pnpm build
```

Run `pnpm neuron:lint` when changing stored knowledge. The retrieval design is still evolving; long-term effectiveness as the store grows remains to be evaluated.

## Further documentation

- [Remote access and optional Cloudflare deployment](docs/remote-access.md)
- [Deployment, migration, and container operations](docs/deployment.md)
- [Agent workflows, CLI reference, and recovery](docs/agent-workflows.md)
- [Background maintenance and review reports](docs/maintenance.md)
- [Architecture, storage, and Network behavior](docs/architecture.md)
- [Versioning, changelog, and GitHub releases](docs/releases.md)
