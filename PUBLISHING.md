# Publishing guide

This plugin is a standard DSH (Cordis) **bundle**: a plain-JS ESM package with
no build step, distributed through the same channels as any other DSH plugin.

## Prerequisites (one-time)

- npm account — `npm whoami` / `npm login`
- GitHub account (for source + releases)
- Before the first **public** commit, set your real Git identity:

  ```bash
  git config user.name "Your Name"
  git config user.email "you@example.com"
  # if you already committed with the placeholder identity:
  git commit --amend --reset-author --no-edit
  ```

  The current history uses a placeholder identity (`dsh-llm-verifier`) set
  only in this repo; change it before pushing anything public.
- Optionally set the copyright holder in [LICENSE](LICENSE) to your name/org.

## Final checks before publishing

```bash
npm test                                # dry-run self-test must pass
pnpm pack --dry-run                     # inspect exactly what ships
```

The published tarball should contain exactly:
`CHANGELOG.md`, `cordis.patch.yml`, `dsh/index.js`, `dsh/python/sidecar.py`,
`LICENSE`, `package.json`, `README.md`, `skills/llm-verifier/SKILL.md`.

## 1) GitHub (source + releases)

1. Create a repository (e.g. `dsh-llm-verifier`) on GitHub.
2. Push the code:

   ```bash
   git remote add origin https://github.com/you/dsh-llm-verifier.git
   git push -u origin main
   ```

3. Tag a release for each npm version (semver):

   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```

Consumers can install straight from GitHub with `dsh plugin add github:you/dsh-llm-verifier`
(no build step is needed — the package ships source as-is).

## 2) npm (canonical distribution)

```bash
npm login
npm publish          # or: pnpm publish
```

Version bumps after the first release:

```bash
npm version patch    # 0.1.0 -> 0.1.1 (also tags if configured)
npm publish
```

Consumers then install with `dsh plugin --profile <profile> add dsh-llm-verifier`.

## 3) DSH community markets

The plugin is an npm package, so any DSH market that indexes npm packages can
list it. Known community markets:

- **In-app 1024 store** (`dsh-1024store`, bundled as
  `dsh-community-market`) — a community catalog; register the published package
  through its submission flow in the plugin-settings marketplace tab.
- **[DSH Marketplace](https://dshmarketplace.dev)** (GitHub:
  [DshMarketPlace](https://github.com/DshMarketPlace)) — aggregates DSH
  plugins; submit via its GitHub/site.

Exact submission steps are maintained by each market; the prerequisite is
always the npm publication above.

## 4) Local tarball distribution

For people who prefer not to use a registry:

```bash
pnpm pack                      # -> dsh-llm-verifier-<version>.tgz
dsh plugin --profile <profile> add ./dsh-llm-verifier-<version>.tgz
```

## Consumer install recap

```bash
# npm
dsh plugin --profile web add dsh-llm-verifier
# GitHub
dsh plugin --profile web add github:you/dsh-llm-verifier
# tarball
dsh plugin --profile web add ./dsh-llm-verifier-0.1.0.tgz
```

After install, **restart DSH Desktop**; the `llm_verifier_*` tools and the
`llm-verifier` skill appear in new sessions. See [README.md](README.md) for
requirements (`llm-verifier` venv + logprobs-capable backend) and config.
