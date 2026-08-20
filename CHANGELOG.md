# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-19

Initial public release.

### Added
- Native DeepSeek Harness (Cordis) plugin registering four agent tools:
  - `llm_verifier_select` — best-of-N selection via the fine-grained reward
    (Probabilistic Pivot Tournament)
  - `llm_verifier_compare` — fine-grained pairwise reward for a single comparison
  - `llm_verifier_track` — step-by-step progress curve of a trajectory
  - `llm_verifier_token_usage` — cumulative verifier token accounting
- Bundled Python sidecar (`dsh/python/sidecar.py`) wrapping `llm-verifier`,
  spawned from a configured venv over JSON-lines stdio.
- Embedded `llm-verifier` skill.
- Backend auto-resolution: endpoint + model come from the bundle `config`
  (default DeepSeek official), API key is resolved from the DSH credential
  store via `apiKeyEnv` — no separate key configuration.
- Self-test script (`scripts/dry-run.mjs`) and `npm test` entry.

### Fixed
- Tool `execute` signature matches DSH's `ToolRuntime` convention
  (`tool.execute(args, exec)`), not the older `execute(exec)` form.
- Runtime skill registration carries the `source` field required by DSH.
- Track scores every step by default so the progress curve reaches the final
  verified-complete state.

### Notes for adopters
- Requires the `llm-verifier` Python package in a venv (set `config.pythonBin`).
- The verifier backend must expose token-level logprobs (DeepSeek official
  verified; scnet-style relays that reject `logprobs` won't work).
- DeepSeek official API key resolved from the DSH credential store
  (`apiKeyEnv`, default `DEEPSEEK_API_KEY`).
