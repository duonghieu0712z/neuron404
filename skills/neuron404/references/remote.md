# Remote connection

With `NEURON404_URL` set, the launcher uses its bundled `scripts/remote.mjs` with Node.js >=24. It does not require a repository, pnpm or a local database. `NEURON404_TOKEN` supplies the server's read/write or read-only token. These variables must already exist in the environment that starts the client; the launcher does not read a repository `.env` in remote mode.

Use the same launcher arguments as local mode for catalog, search, read, neighbors, history, sources, Region operations and review reports. Server administration (`index`, `migrate`, `lint`, maintenance execution) is not exposed remotely. HTTP is allowed only on loopback; other endpoints require HTTPS. Do not change the selected endpoint, disable TLS validation, print credentials or fall back to a different/local store after a connection failure.

Every remote write uses an idempotency key. A failed call prints `requestId`. Reuse it through `NEURON404_REQUEST_ID` with identical command, arguments and JSON payload to recover a completed result. Do not generate a new key and repeat an uncertain write blindly. An in-progress/uncertain response requires reading the relevant knowledge and checking server state before issuing a new operation. Revision conflicts require a fresh read and a reconciled update, not a forced overwrite. Successful receipts have the same neuron ID/revision contract as local mode.

Optional `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` add Cloudflare Access service headers. Both must be supplied together. Cloudflare is not required; the application token is always required for remote requests. An HTML login challenge indicates an access-policy problem, not absence of knowledge.

Installing a copied skill on another machine does not synchronize skill updates automatically. Keep the repository's `skills/neuron404/` as the canonical source and deploy updated copies intentionally; existing local global symlinks still share the canonical source.
