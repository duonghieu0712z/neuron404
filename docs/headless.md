# Installation without the web UI

The web UI is optional. A headless distribution includes the local CLI, maintenance CLI, migrations, skill and an authenticated API server. It excludes SvelteKit's web build and does not start a server for ordinary local commands. Its data directory is still `~/.neuron404`.

## Install without cloning

After the CLI has been published, install Node.js >=24 and run:

```sh
pnpm add -g @duonghieu0712z/neuron404@beta
neuron404 --version
neuron404 migrate
neuron404 catalog
```

Use `@latest` after the first stable package is published. `npm install -g` is also supported. The package includes compiled JavaScript, production dependency declarations, migrations and the skill; it contains no web UI or personal data. Installing does not initialize storage or start a server. These commands use the package manager's native launcher on Windows, Linux and macOS. CI is configured to check those platforms; only macOS has been checked locally.

To install without using the npm registry, download `neuron404-cli-VERSION.tgz` from a GitHub Release and run `pnpm add -g ./neuron404-cli-VERSION.tgz`; production dependencies still need a registry connection. Downloaded archives and checksums are also used by the release pipeline. See [skill installation](installation.md) for agent setup.

## Build from source

On a build machine with Node.js >=24 and this repository's pnpm version:

```sh
pnpm install
pnpm build:headless
```

This creates `headless/` containing compiled JavaScript and a production-only package manifest. Copy that directory to the target machine; neither source files nor the repository's development dependencies are required there. From the copied directory:

```sh
pnpm install --prod --ignore-scripts
node dist/neuron.js migrate
node dist/neuron.js catalog
```

No web interface is installed in this directory. `node bin/neuron404.mjs` provides the same portable entrypoint as the installed global command; the shell launcher `bin/neuron404` also works. Keep the installation's directories together. Point `NEURON404_HOME` at its absolute path when using a skill installed separately.

`build:headless` replaces the repository's `dist/` output; run `pnpm build` again before using the web production server. Copy the complete generated `headless/` distribution rather than mixing outputs from the two builds.

## Local use and optional sync

All ordinary commands stay local. To exchange knowledge with a remote server:

```sh
export NEURON404_URL="https://neuron.example.com"
export NEURON404_TOKEN="YOUR_ACCESS_TOKEN"
neuron404 sync
```

See [remote access](remote-access.md) for conflict handling, data scope and first-sync authorization. Sync is explicit; configuring a remote does not prevent offline saves or automatically upload knowledge.

## API without a website

Only machines accepting remote clients need a running API server. Set a random `NEURON404_AUTH_TOKEN` in the server process environment, optionally set `NEURON404_PUBLIC_URL` to its public HTTPS origin, then run:

```sh
neuron404 serve
```

The API binds to `127.0.0.1:3000` by default. `HOST` and `PORT` override the listener. It serves `/api/v1/commands` and `/healthz`; it has no login page, dashboard or web session. Owner/read Bearer tokens, revision checks, body limits and write replay protection match the web server's API. Put it behind HTTPS when used outside the local machine. Any compatible reverse proxy works; Cloudflare remains optional. Initialize storage with `migrate` before starting the service.
