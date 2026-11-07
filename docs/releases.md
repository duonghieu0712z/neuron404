# Releases and dependency updates

## Quality checks

Pull requests and pushes to `main` run Conventional Commit validation and the reusable `quality-checks.yml` workflow. It runs `pnpm format`, `pnpm lint`, release metadata validation, and `pnpm build` (including Svelte/TypeScript checking). Headless packages are built and initialized on Linux, macOS, and Windows. Docker images are built on native Linux amd64/arm64 runners and started with disposable storage to check `/healthz`.

Checks use temporary stores. The same quality workflow gates releases. pnpm comes from `packageManager` in `package.json`; Node.js uses the supported 24 line.

In repository settings, enable squash merging and auto-merge, allow GitHub Actions to create and approve pull requests, and protect `main` with required checks: `Commit message`, `Code quality / Application quality`, all three `Code quality / Headless (...)` checks, and both `Code quality / Docker (...)` checks. Select the actual check names after the first run. Require branches to be up to date before merging.

## Dependabot

Dependabot checks npm/pnpm, Docker, and GitHub Actions every Monday on staggered schedules. npm updates increase declared version requirements. Minor and patch updates are grouped per ecosystem; major updates remain separate.

Minor and patch Dependabot PRs are approved and queued for squash auto-merge only after commit and quality checks pass. The merge request is tied to the checked head commit. Major updates require manual review. Workflows use `pull_request`, not privileged execution of PR code through `pull_request_target`.

## Prepare a version

Use `0.x` while the public CLI/API and storage contracts are evolving. Use patch releases for compatible fixes and minor releases for substantial features or incompatible changes during this phase. Describe compatibility changes and required migration steps explicitly.

Prepare `CHANGELOG.md` using the applicable Keep a Changelog sections. Before release:

```sh
pnpm bump 0.2.0
pnpm release:check
```

Between those commands, move the accumulated changes into a dated `## [0.2.0] - YYYY-MM-DD` section, retain an empty `[Unreleased]` section, and update comparison links. The bump command only changes `package.json`. `release:check` requires a valid matching version, date, and nonempty changelog.

Commit reviewed release changes, then create and push the version tag. The tag must match `package.json` and its changelog section. Released versions and their tags must not be moved or reused for different source. A manual workflow must select an existing version tag, not a branch.

## GHCR and GitHub Release

The skill, CLI and web currently share one release version. Build identity is recorded separately so a stable release can reuse tested artifacts.

Pushing a prerelease tag such as `v0.1.0-beta.2` starts the Release workflow. It validates release metadata, runs all quality checks, and publishes `ghcr.io/duonghieu0712z/neuron404` for `linux/amd64` and `linux/arm64`. It uses the workflow's `GITHUB_TOKEN` with `packages: write`; no registry PAT is needed. OCI labels identify the build source, version, and revision; the build includes provenance and SBOM attestations.

Prereleases get their full version and SHA tags without updating `latest` or a minor-version tag. The GitHub Release is created as a draft from the matching changelog, with an `image.json` asset recording the repository, version, build commit, and multi-platform digest. Keep this receipt: promotion requires it. Review and publish the draft separately. A version whose image already exists is rejected before the publish build, including on reruns; quality jobs may already have run their disposable builds. To deliberately build a new version from scratch, including a stable version with no prerelease, run Release manually on that version tag.

The same release attaches `neuron404-cli-VERSION.tgz`, `neuron404-skill-VERSION.tgz`, and `release-artifacts.json`. The CLI archive is the public `@duonghieu0712z/neuron404` npm package with compiled headless tools, production dependency declarations, migrations and a cross-platform Node entrypoint. The skill archive contains only the skill directory. The receipt records SHA-256 checksums and the build/release commits for both archives. `pnpm build:headless` followed by `pnpm package:release` creates these files locally under ignored `artifacts/` without publishing.

## Promote a tested prerelease

After testing `0.1.0-beta.2`, prepare the stable release without changing application code:

1. Run `pnpm bump 0.1.0`, add a dated `0.1.0` changelog section describing the promotion, retain the beta history, and update comparison links.
2. Commit those metadata/documentation changes, create `v0.1.0`, and push the commit and tag. A stable tag does not automatically rebuild an image.
3. Open **Actions → Promote Release → Run workflow**, select tag `v0.1.0`, and enter `v0.1.0-beta.2` as `source_tag`.

The GitHub CLI equivalent is:

```sh
gh workflow run promote.yml --ref v0.1.0 -f source_tag=v0.1.0-beta.2
```

Promotion verifies the beta receipt against its Git tag, requires the beta commit to be an ancestor of the stable commit, and checks that only `package.json`'s version, `CHANGELOG.md`, `README.md`, or files under `docs/` changed. Changes to dependencies, lockfiles, application code, build scripts, workflows, or other tracked files require a new prerelease build. It then copies the existing multi-platform image index by digest to `0.1.0`, `0.1`, and `latest`, verifying that every destination retains the original digest. It does not install dependencies, run a build, or start containers.

The original image's `package.json`, OCI version/revision labels, provenance, and SBOM remain unchanged. They describe the tested beta build; stable tags describe its approved distribution. Rewriting embedded version metadata would change the digest. The stable draft release and its `image.json` explicitly record the beta source, build version/commit, stable release commit, and unchanged digest. Do not use the embedded package version as the release-channel version.

Promotion also verifies the prerelease archive checksums and build identity. It reuses the skill archive byte for byte, and repacks the CLI with only its package version changed to the stable version. Compiled code, migrations, dependencies and `build.json` stay unchanged; no compiler or dependency installation runs. The stable archive gets a new checksum because its package version changed. Both receipts are attached to the stable draft.

Promotion creates or updates a stable release draft; review and publish it separately. An already published release is rejected. If tagging succeeds but a later step fails, rerun the same promotion inputs; no rebuild is needed. If a normal build succeeded but creating its draft/receipt failed, recover the draft and receipt from that run's exact image digest instead of rebuilding a tested image.

After the first publish, make the GHCR package public if anonymous pulls are intended; initial package visibility is private. Protect version tags in GitHub settings. These repository/package settings are administrative steps, not changes applied by the workflow files.

## npm publishing

Publishing the GitHub Release starts `publish-npm.yml`. It downloads the already packaged CLI and skill archives, verifies their checksums, package/build metadata and release Git tag, then publishes the CLI archive without rebuilding. Prereleases use the npm `beta` tag; stable versions use `latest`. A manual recovery run accepts a published `release_tag`. An identical archive already on npm is skipped after checking its SHA-512 integrity; a different archive at that version is rejected. npm does not allow replacing an existing package version.

The chosen scope is `@duonghieu0712z`; the maintainer must own that npm scope. Bootstrap the first package from the reviewed release archive using an authenticated npm account (`npm publish neuron404-cli-VERSION.tgz --access public --tag beta`). Then configure its npm Trusted Publisher for GitHub owner `duonghieu0712z`, repository `neuron404`, workflow `publish-npm.yml`, allowing direct publishing. Subsequent workflow publishes use OIDC and `id-token: write`, with no stored npm token. The workflow requires npm >=11.5.1, supplied by current Node.js 24 releases. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

For the first release, bootstrap from the draft's archive before publishing it on GitHub; the workflow recognizes and skips that identical npm package. Configure Trusted Publishing before later versions. If the first workflow instead reports missing authentication, publish the reviewed archive manually, configure npm, and rerun the workflow. Do not rebuild or replace the version to recover authentication setup. Package ownership and Trusted Publisher configuration must be completed on npm; workflow files do not create an npm account or reserve the package name.

For running published images, source builds and upgrade backups, see [deployment](deployment.md).
