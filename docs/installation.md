# Install the CLI and agent skill

Node.js >=24 is required. Neither the CLI nor the skill needs a repository clone or a running web application. Version 0.1.0 is available as a GitHub Release archive; the npm package is not yet published.

## Local knowledge and optional sync

Install the CLI and initialize the local store:

```sh
pnpm add -g https://github.com/duonghieu0712z/neuron404/releases/download/v0.1.0/neuron404-cli-0.1.0.tgz
neuron404 --version
neuron404 migrate
neuron404 catalog
```

This installs the published archive directly; production dependencies still need a registry connection. Alternatively, download `neuron404-cli-0.1.0.tgz` from the release and run `pnpm add -g ./neuron404-cli-0.1.0.tgz`. npm global installation of the archive is also supported. If pnpm reports that its global executable directory is missing or absent from `PATH`, run `pnpm setup` and reopen the terminal. The CLI stores knowledge in `~/.neuron404`; upgrades do not replace it. No server starts during installation or ordinary commands. See [headless installation](headless.md) for building from source and API hosting.

Once the npm package is published, `pnpm add -g @duonghieu0712z/neuron404@latest` will also work. Until then, a registry 404 means the package is unavailable; use the release archive above.

Download and install just the skill archive, without Git cloning, for Claude and Codex:

```sh
pnpm dlx skills@latest add \
  https://github.com/duonghieu0712z/neuron404/releases/download/v0.1.0/neuron404-skill-0.1.0.tgz \
  --skill neuron404 --global --agent claude-code codex
```

The archive contains only the skill directory, references and portable helpers. The skills installer keeps one canonical skill copy and can link both clients to it. Restart or reload the agent client if needed for discovery. Invoke `/neuron404` in Claude or `$neuron404` in Codex. The installer does not grant filesystem or command permissions to the agent.

The skill uses the global CLI from `PATH`. Development installations may use the repository-backed launcher or explicitly set `NEURON404_HOME`. An invalid explicit path fails instead of falling back elsewhere. On Windows the installed `neuron404` command uses the native package-manager shim, so a Unix shell is not required for local commands.

## Remote only

Install just the skill archive and Node.js; the local CLI is optional for explicit direct remote operations. Configure `NEURON404_URL` and `NEURON404_TOKEN` in the environment that starts the agent, then ask the skill to operate on the remote explicitly. Its bundled `scripts/remote.mjs` supports this mode without pnpm, SQLite or a local knowledge store.

Local-first operation and sync still require the CLI. Configuring a remote does not redirect ordinary local saves or automatically upload data. See [remote access](remote-access.md).

## Updates and versions

Update the CLI by installing the new release archive URL. Once npm publishing is available, a published npm tag or exact version can also be used. To update a skill pinned to a release archive, run the skill installation command with the new release URL. Keep a versioned URL for reproducibility; it does not automatically follow newer releases.

Use matching release versions for the skill, CLI and web. See [releases](releases.md) for build identity and prerelease promotion.
