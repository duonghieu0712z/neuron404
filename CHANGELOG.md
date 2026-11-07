# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Correct CLI installation instructions to use the published GitHub Release archive while the npm package is unavailable, and fix the npm publishing workflow's local archive path.
- Correct first-run development initialization, standalone API commands and healthcheck scope, read-only client token configuration, and release promotion/runtime documentation.

## [0.1.0] - 2026-11-07

### Added

- Local-first knowledge storage using Markdown Neurons, typed Synapses, and Regions, with a derived SQLite index and a shared data directory at `~/.neuron404`.
- Immutable source snapshots, exact revision history, write receipts, atomic file updates, and revision-checked concurrent writes that preserve existing knowledge.
- Knowledge metadata for aliases, grounding, endorsement, provenance, and active/superseded/retracted lifecycle states, with caution and replacement context returned during retrieval.
- Ranked full-text and token-prefix search, Region filters, paginated catalogs and neighbors, retrieval cues, and incremental indexing of external Markdown edits.
- Agent-driven ingestion with automatic Region classification and versioned Region overview articles backed by member revisions and citations.
- A web interface for creating and browsing Neurons grouped by Region, with light/dark themes, Markdown rendering, evidence reports, and a shared detail sidebar.
- An interactive WebGL Network with draggable neurons and Region overview markers, grouped layouts, zoom and fit-to-view controls, search emphasis, configurable labels and motion, collapsible panels, and animated Synapse signals.
- A shared Claude/Codex skill supporting natural-language search, save, ingest, review, and sync requests; invocation without a request proposes useful knowledge from the current conversation without saving automatically.
- Optional background maintenance through explicitly selected Claude or Codex CLIs, including source-evidence audits, checked Region overviews, persisted findings, and configurable request/retry limits. Maintenance is disabled by default.
- Authenticated remote API access and browser sessions, separate owner/read tokens, HTTPS proxy support, and idempotent write recovery. Cloudflare integration is optional.
- Optional local/remote synchronization with push, pull, or both directions, Region selection, dry-run previews, hash-based change detection, conflict preservation, and deferred resolution of references outside a partial replica.
- A standalone headless CLI/API distribution, an installable `@duonghieu0712z/neuron404` package, and separate skill archives for installation without cloning the repository or installing the web UI. CLI launchers support Windows, Linux, and macOS.
- Production Docker packaging with persistent data mounts, automatic storage initialization, a dedicated `/healthz` endpoint, minified builds without application source maps, and a separate Compose override for local source builds.
- GitHub quality gates, weekly grouped Dependabot updates, multi-platform GHCR publishing, checksum-protected CLI/skill artifacts, npm trusted-publishing automation, and promotion of tested images without rebuilding.
- Installation, CLI, storage, maintenance, deployment, and release guides, with consistent Neuron/Synapse/Region/Network terminology.

[Unreleased]: https://github.com/duonghieu0712z/neuron404/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/duonghieu0712z/neuron404/releases/tag/v0.1.0
