# Deployment

Install Docker with Compose v2, then run these commands from the repository:

```sh
mkdir -p "$HOME/.neuron404"
docker compose up -d --build
```

Open `http://localhost:3000/neurons`. Both the image and container are named `neuron404`. The image builds a standalone production server with [SvelteKit's Node adapter](https://svelte.dev/docs/kit/adapter-node). Compose binds the port to the local machine and mounts `~/.neuron404` at `/data`:

| Host path                   | Container path       | Purpose                                                    |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `~/.neuron404/content/`     | `/data/content/`     | Neurons, sources, history, regions, and operation receipts |
| `~/.neuron404/neuron404.db` | `/data/neuron404.db` | Derived SQLite index and migration state                   |

The image contains the web build, compiled initialization and CLI tools in `dist/`, production dependencies, and migrations. It excludes application source, TypeScript tooling, application source maps, personal content, local databases, and `.env` files. Startup applies committed migrations and synchronizes the index before accepting requests. A new volume starts empty. Rebuilding the image or running `docker compose down` preserves the host directory. Back up the entire directory with the container stopped to capture consistent files.

`GET /healthz` returns `200` with `{"status":"ok"}` when SQLite responds and the content directory is readable and writable; otherwise it returns `503` with `{"status":"error"}`. Responses are not cached. Compose uses this endpoint for its healthcheck.

To change the host port, run `NEURON404_PORT=8765 docker compose up -d`. On Linux, if your user is not UID/GID 1000, pass `NEURON404_UID=$(id -u) NEURON404_GID=$(id -g)` before Compose commands that start containers so the process can write to your directory. Keep these overrides consistent when recreating containers.

### Import existing local knowledge

When upgrading from repository-local `content/`, stop other writers and copy that directory into an empty destination before the first Docker startup:

```sh
mkdir -p "$HOME/.neuron404"
test ! -e "$HOME/.neuron404/content" && cp -Rp content "$HOME/.neuron404/content"
docker compose up -d --build
```

This retains the repository's original files. SQLite is rebuilt from the copied Markdown, so copying `local.db` is unnecessary. If the destination already contains content, the copy command deliberately does nothing; do not merge independent stores by overwriting files. The repository CLI automatically uses the same store. You can also invoke the container CLI:

```sh
docker compose exec -T neuron404 node dist/neuron.js catalog
docker compose exec -T neuron404 node dist/neuron.js search "runtime defaults"
docker compose logs -f neuron404
docker compose down
```

For `add`, `update`, and `source:add`, pipe JSON into the same `exec -T` command. Rebuild after updating the code with `docker compose up -d --build`.
