# Installation without the web UI

The web UI is optional. A headless distribution includes the local CLI, maintenance CLI, migrations, skill and an authenticated API server. It excludes SvelteKit's web build and does not start a server for ordinary local commands. Its data directory is still `~/.neuron404`.

For CLI and skill installation from release archives, follow [installation](installation.md). This page covers building a standalone distribution and hosting the API without a website.

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

No web interface is installed in this directory. `node bin/neuron404.mjs` provides the same portable entrypoint as the installed global command. The shell launcher `bin/neuron404` supports knowledge and direct remote commands; use the Node entrypoint for `maintenance` and `serve`. Keep the installation's directories together. Point `NEURON404_HOME` at its absolute path when using a skill installed separately.

`build:headless` replaces the repository's `dist/` output; run `pnpm build` again before using the web production server. Copy the complete generated `headless/` distribution rather than mixing outputs from the two builds.

Ordinary commands use local storage. Optional synchronization is described in [remote access](remote-access.md).

## API without a website

Only machines accepting remote clients need a running API server. Set a random `NEURON404_AUTH_TOKEN` in the server process environment, optionally set `NEURON404_PUBLIC_URL` to its public HTTPS origin, then run:

```sh
node bin/neuron404.mjs serve
```

Run this from the copied distribution directory. For a globally installed CLI, use `neuron404 serve` instead. Initialize storage with `migrate` before starting the service.

The API binds to `127.0.0.1:3000` by default. `HOST` and `PORT` override the listener. It serves `/api/v1/commands` and `/healthz`; it has no login page, dashboard or web session. Owner/read Bearer tokens, revision checks, body limits and write replay protection match the web server's API. Its `/healthz` is a liveness check only; unlike the web endpoint, it does not check SQLite or content-directory access. Put the API behind HTTPS when used outside the local machine. Any compatible reverse proxy works; Cloudflare remains optional.
