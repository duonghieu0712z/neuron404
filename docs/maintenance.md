# Background Region maintenance

Maintenance is **disabled by default**. With no `NEURON404_MAINTENANCE_PROVIDER` (or with `none`),
`pnpm maintenance` exits without claiming jobs, writing state, or calling a model. It never selects
Claude or Codex automatically, including when both CLIs are installed.

To enable it, explicitly choose `claude` or `codex` and use that CLI's existing login. The host worker
audits source fidelity, checks related knowledge, and maintains Region overviews. Docker shares the
same `~/.neuron404` store; its image does not install agent CLIs or copy login credentials.

```sh
NEURON404_MAINTENANCE_PROVIDER=claude pnpm maintenance
NEURON404_MAINTENANCE_PROVIDER=codex pnpm maintenance
pnpm maintenance --status
pnpm maintenance --once
pnpm maintenance --overview --once
pnpm maintenance --audit --once
pnpm maintenance --reports
pnpm maintenance --report REPORT_ID
pnpm maintenance --retry-failed --once
```

Alternatively, select the provider in `.env`; the remaining commands use that explicit selection.
`--status` and report-reading commands work while maintenance is disabled. An invalid or unavailable
provider fails without falling back to another agent. No model is hard-coded: the optional
`NEURON404_MAINTENANCE_MODEL` overrides the selected CLI's own model default.

A pass processes at most one job. The default daemon polls every 30 seconds and waits for 60 seconds
of stable revisions; `--once` bypasses that settling delay. It does not install an OS service.
Overviews are generated and checked in separate ephemeral agent sessions. Every paragraph must
have a check backed by an exact member quote; unknown citations and invented quotations are rejected.
Only a passing candidate is published through the existing revision/history service. A rejected
candidate leaves the current article unchanged. Existing fresh overviews without a matching review
are checked without rewriting them.

Knowledge audits compare every Region member with its own supplied source snapshots. They also
read direct semantic neighbors/replacements and up to three title/alias candidates outside the
Region to look for contradictions, obsolete claims, duplicates, substantive missing synapses, and
missing concepts. This is not an exhaustive all-pairs comparison. Changed member and neighbor
revisions trigger another audit; unchanged inputs are audited again in seven-day periods by default.
Missing evidence means unverifiable, not false. Sources are not fetched again, so fidelity checks
cannot establish independent real-world truth or discover every external change.

Reports are immutable and content-hashed under `~/.neuron404/maintenance/reports/`. They retain input
revisions, reviewed scope, evidence checks, exact quotes, and proposals. Open findings carry into
later knowledge reports with their origin report. Reports appear in Region and neuron sidebars and
are returned by `pnpm neuron read`; stale reports are labeled when supporting inputs change.
`pnpm neuron review:reports` and `review:read ID` also expose them to agents. Review events, overview
publication, failures, and finding decisions are recorded in `maintenance/events.jsonl`.

Neuron bodies, synapses, source snapshots, and lifecycle states are never modified by the worker.
Apply an authorized correction through the normal knowledge workflow, then explicitly record its
finding decision; neither command below edits knowledge or marks it human-verified:

```sh
pnpm maintenance --report REPORT_ID --resolve FINDING_ID --note "Corrected the claim and checked its evidence."
pnpm maintenance --report REPORT_ID --dismiss FINDING_ID --note "Reviewed the finding; its interpretation does not apply."
```

When enabled, defaults are 4 reserved CLI requests per hour, a 120-second timeout per call, and 3 attempts
per unchanged job with backoff. An overview refresh reserves two requests for generation and review;
an audit or a check of an existing overview reserves one. Failed or interrupted jobs conservatively
consume their reservation. The shared state and leases in `maintenance/state.json` prevent duplicate
claims and recover expired jobs; limits persist across restarts. Claude invocations also receive a `$0.50` estimated API-cost cap. Codex has no equivalent CLI dollar
cap; its adapter uses the shared request, input-size, timeout and retry limits. The Claude estimate
is not a subscription invoice or a guaranteed billing limit. See
[Claude CLI](https://code.claude.com/docs/en/headless) and
[Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).

Configure the commented `NEURON404_MAINTENANCE_*` variables in `.env.example`.
`NEURON404_MAINTENANCE_CLI` optionally overrides the selected agent's executable; it is not a shell
command. Claude runs with tools, MCP, hooks, skills and persistence disabled. Codex uses an ephemeral
read-only run without user config/rules, with command execution, web search, apps, plugins, hooks,
and subagents disabled. Its existing authentication is retained. Both run in a temporary directory
and return schema-validated output; only neuron404 writes knowledge. Oversized evidence is blocked
rather than truncated. Fix issues and inspect the report before `--retry-failed`. Ordinary queries
never start maintenance or call a review model.

Agent integrations implement `MaintenanceAgentAdapter` in
`src/lib/server/maintenance/agents/types.ts` and register in `agents/index.ts`. An adapter prepares
an executable, argument array, stdin, and output reader; it does not own scheduling or store writes.
The shared runner enforces timeout, cancellation, output size and Zod validation. Evidence passage
references resolve to exact original quotations, and reviewed neuron IDs are constrained by schema.
Adding an adapter does not enable it or select it by default.
