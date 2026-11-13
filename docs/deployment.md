# Deployment

For a server accessed from other machines, configure [remote access](remote-access.md) before publishing the web application.

Install Docker with Compose v2, then run these commands from the repository:

```sh
mkdir -p "$HOME/.neuron404"
docker compose pull
docker compose up -d
```

Open `http://localhost:3000/neurons`. Compose pulls `ghcr.io/duonghieu0712z/neuron404` and names the container `neuron404`. Set `NEURON404_VERSION` in `.env` to pin a release; otherwise it uses `latest`. Images are available after the first successful release. The image contains a standalone production server built with [SvelteKit's Node adapter](https://svelte.dev/docs/kit/adapter-node). Compose binds the port to the local machine and mounts `~/.neuron404` at `/data`:

| Host path                   | Container path       | Purpose                                                    |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `~/.neuron404/content/`     | `/data/content/`     | Neurons, sources, history, regions, and operation receipts |
| `~/.neuron404/neuron404.db` | `/data/neuron404.db` | Derived SQLite index and migration state                   |

The image contains the web build, compiled initialization and CLI tools in `dist/`, production dependencies, and migrations. It excludes application source, TypeScript tooling, application source maps, personal content, local databases, and `.env` files. Startup applies committed migrations and synchronizes the index before accepting requests. A new volume starts empty. Rebuilding the image or running `docker compose down` preserves the host directory. Back up the entire directory with the container stopped to capture consistent files.

`GET /healthz` returns `200` with `{"status":"ok"}` when SQLite responds and the content directory is readable and writable; otherwise it returns `503` with `{"status":"error"}`. Responses are not cached. Compose uses this endpoint for its healthcheck.

To change the host port, run `NEURON404_PORT=8765 docker compose up -d`. On Linux, if your user is not UID/GID 1000, pass `NEURON404_UID=$(id -u) NEURON404_GID=$(id -g)` before Compose commands that start containers so the process can write to your directory. Keep these overrides consistent when recreating containers.

### Secrets from files

The server and CLI accept `_FILE` alternatives for environment variables ending in
`_TOKEN`, `_API_KEY`, `_SECRET`, or `_PASSWORD`, plus `CF_ACCESS_CLIENT_ID_FILE`.
For example, use `NEURON404_AUTH_TOKEN_FILE`, `NEURON404_READ_TOKEN_FILE`,
`NEURON404_TOKEN_FILE`, `OPENAI_API_KEY_FILE`, or `ANTHROPIC_API_KEY_FILE`. The path
must point to a UTF-8 file readable by the process inside the container. Final
CR/LF characters are removed. An unreadable or empty file stops startup; setting
both a nonempty direct value and its `_FILE` alternative is an error. Resolved
file settings are removed from child environments, which inherit the secret value.
Do not use `VITE_` variables for secrets: those are intended for browser code.

The default Compose file forwards the owner/read token file paths. Mount each
secret separately; setting a path alone does not mount the host file. For example,
create `compose.secrets.yaml` with:

```yaml
services:
    neuron404:
        environment:
            NEURON404_AUTH_TOKEN: ''
            NEURON404_AUTH_TOKEN_FILE: /run/secrets/neuron404_auth_token
        secrets:
            - neuron404_auth_token

secrets:
    neuron404_auth_token:
        file: ./secrets/neuron404_auth_token
```

Store only the token in that file, keep it outside version control, and grant read
access only to the container UID/GID and necessary administrators. Then use
`docker compose -f compose.yaml -f compose.secrets.yaml up -d`. For other supported
credentials, add their `_FILE` variable and secret mount to the override in the
same way. This changes how credentials are supplied; the web image still does
not bundle provider CLIs or start a maintenance worker.

### Import existing local knowledge

When upgrading from repository-local `content/`, stop other writers and copy that directory into an empty destination before the first Docker startup:

```sh
mkdir -p "$HOME/.neuron404"
test ! -e "$HOME/.neuron404/content" && cp -Rp content "$HOME/.neuron404/content"
docker compose up -d
```

This retains the repository's original files. SQLite is rebuilt from the copied Markdown, so copying `local.db` is unnecessary. If the destination already contains content, the copy command deliberately does nothing; do not merge independent stores by overwriting files. The repository CLI automatically uses the same store. You can also invoke the container CLI:

```sh
docker compose exec -T neuron404 node dist/neuron.js catalog
docker compose exec -T neuron404 node dist/neuron.js search "runtime defaults"
docker compose logs -f neuron404
docker compose down
```

For `add`, `update`, and `source:add`, pipe JSON into the same `exec -T` command. To upgrade a published image, update the pinned version if applicable, run `docker compose pull`, then `docker compose up -d`. Back up the store first; changing the image version does not reverse migrations.

## Build from source

Use the build override when developing or before the first image has been published:

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

This builds `neuron404:local` and retains the same service, container name, and data mount. Continue using both `-f` arguments for source-build operations. It does not push anything to GHCR. See [releases](releases.md) for CI, versioning, and publishing.
