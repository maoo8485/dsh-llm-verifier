# Upgrading

This plugin is a thin wrapper around the upstream
[`llm-verifier`](https://github.com/llm-as-a-verifier/llm-as-a-verifier)
Python package. The engine lives in **your own venv** (installed separately, not
bundled in this package), so an upstream update is normally a one-line venv
upgrade — and only rarely requires touching this plugin.

## Two independent layers

| Layer | Where it lives | How it updates |
|---|---|---|
| Engine (`llm_verifier`) | your Python venv (see [README](README.md) → Requirements) | `pip install -U llm-verifier` |
| Wrapper (this plugin) | this repo — `dsh/index.js` + `dsh/python/sidecar.py` | bump + publish (only when the upstream API changes) |

## 1) Update the engine (the usual case)

```bash
# upgrade the venv the plugin uses (match your config.pythonBin)
~/dev/.venv/llm-verifier/bin/pip install -U llm-verifier

# confirm the new version (must be >= MIN_LLM_VERIFIER, see dsh/python/sidecar.py)
~/dev/.venv/llm-verifier/bin/python -c "import llm_verifier; print(llm_verifier.__version__)"

# regression: the sidecar spawns a fresh python on every call, so no restart
# of DSH is needed for an engine-only update.
cd <this repo> && npm test
# plus one real end-to-end call (compare/select/track) against your backend.
```

If the sidecar reports a version below the minimum, run the upgrade above.

> Tip: with `autoProvision: true` (default), the plugin recreates a missing
> venv on the first tool call, so an engine-only "upgrade" can also be done by
> deleting the venv and letting the plugin re-provision it fresh.

## 2) Update the wrapper (only when the upstream API changes)

1. Read the upstream
   [CHANGELOG](https://github.com/llm-as-a-verifier/llm-as-a-verifier/blob/main/CHANGELOG.md)
   / release notes for the new version.
2. Check whether the APIs this plugin uses changed: `select`, `compare`,
   `track`, `token_usage`, the `client=` argument, and the
   `_llm_verifier_deepseek` client flag (see `dsh/python/sidecar.py`).
3. If anything changed:
   - update `dsh/python/sidecar.py` (and `dsh/index.js` tool schemas if the
     input/output shapes changed);
   - bump `MIN_LLM_VERIFIER` and the package version (`npm version patch`);
   - run `npm test` + one real end-to-end call;
   - publish (`git tag`, `npm publish`) — see [PUBLISHING.md](PUBLISHING.md).
4. If nothing changed: **no plugin release is needed** — the engine upgrade in
   step 1 is all you do.

## Watching upstream

- Star / Watch the
  [upstream repo](https://github.com/llm-as-a-verifier/llm-as-a-verifier) →
  Releases / CHANGELOG.
- `pip index versions llm-verifier` — list published versions.
- `pip show llm-verifier` (in the venv) — what you currently have.

## Consumer note

Engine upgrades are per-install (`pip install -U llm-verifier` on the
consumer's machine). Wrapper changes ship through the normal plugin channels
(`dsh plugin ...` / marketplace), so consumers never rebuild anything.
