# Cloudflare deployment

Cloudflare is an optional network layer. neuron404 authenticates browsers and API clients itself; its storage and API also work behind other HTTPS proxies. Complete the [remote-access setup](remote-access.md) first.

## DNS proxy or Tunnel

With a public reverse proxy, point the domain to the server, enable Cloudflare proxying and use **Full (strict)** TLS with a valid origin certificate. Forward the original host and the HTTPS protocol to neuron404. Restrict direct origin access so clients cannot bypass the intended proxy. See [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

Alternatively, run `cloudflared` on the server and configure a published hostname for the app. If `cloudflared` runs on the host, target `http://localhost:3000`. If it runs in the same Compose network, target `http://neuron404:3000`; `localhost` inside that container refers to itself. Keep the Tunnel credential outside Git. A Tunnel establishes outbound connections and does not require an inbound public application port. See [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).

In either setup, set `NEURON404_PUBLIC_URL=https://YOUR_DOMAIN` and retain neuron404's own authentication. Do not cache private HTML, API responses or authenticated data. Keep application/API routes free of interactive browser challenges that would block machine clients.

## Optional Cloudflare Access

Access can add another gate in front of the app. Permit your browser identity through a normal user policy. For skill requests, configure a **Service Auth** policy restricted to the intended service token, rather than a browser-login requirement or a broad Bypass rule.

Export the service credentials on the client, in addition to `NEURON404_URL` and `NEURON404_TOKEN`:

```sh
export CF_ACCESS_CLIENT_ID="YOUR_CLIENT_ID"
export CF_ACCESS_CLIENT_SECRET="YOUR_CLIENT_SECRET"
```

The remote client sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` alongside neuron404's Bearer token. This authenticates independently at both layers. Cloudflare credentials remain optional and never replace application authentication. See [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

A login redirect or HTML challenge is reported as a connection failure, not a missing neuron. Use a Service Auth policy for machine access. Local Docker health checks continue to use the internal `/healthz` endpoint without crossing Cloudflare.
