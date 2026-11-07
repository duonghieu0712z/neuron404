# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-beta.2] - 2026-11-07

### Changed

- Require every commit, including documentation, CI, dependency, and refactoring changes, to include its corresponding changelog update.

### Fixed

- Normalize Windows paths before adding the installed CLI to Git Bash's `PATH`, and check the native PowerShell command shim during release validation.

## [0.1.0-beta.1] - 2026-11-07

### Added

- Initial release baseline for local-first knowledge storage using Markdown Neurons, typed Synapses, and Regions, with a derived SQLite search index.
- Source snapshots, revision history, evidence-aware retrieval, and revision-checked writes through the CLI and shared Claude/Codex skill.
- Neuron browsing and an interactive Network with Region overviews, search emphasis, draggable neurons, and configurable motion and labels.
- Optional background maintenance through an explicitly selected Claude or Codex CLI.
- Authenticated remote API and web sessions, plus optional synchronization with direction, Region selection, dry runs, and conflict preservation.
- Standalone headless CLI/API distribution for installations without the web interface.
- Publishable CLI package, standalone skill archives, and checksum receipts for installation without cloning the repository; stable promotion reuses compiled CLI code and the tested skill archive.
- Container packaging with persistent storage under `~/.neuron404`, automatic initialization, and a `/healthz` endpoint.
- GitHub quality checks, weekly Dependabot updates, and version-tagged multi-platform GHCR publishing with changelog-based release drafts and promotion of tested prerelease images without rebuilding.

[Unreleased]: https://github.com/duonghieu0712z/neuron404/compare/v0.1.0-beta.2...HEAD
[0.1.0-beta.2]: https://github.com/duonghieu0712z/neuron404/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/duonghieu0712z/neuron404/releases/tag/v0.1.0-beta.1
