# dsh-llm-verifier

A native [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(Cordis) plugin that brings
[LLM-as-a-Verifier](https://github.com/llm-as-a-verifier/llm-as-a-verifier)
(`llm_verifier`, a Python package) into DSH as four first-class agent tools:

| Tool | Purpose |
|---|---|
| `llm_verifier_select` | Best-of-N: rank candidates with the fine-grained reward (Probabilistic Pivot Tournament) and pick the best |
| `llm_verifier_compare` | Fine-grained pairwise reward for a single comparison (A vs B) |
| `llm_verifier_track` | Step-by-step progress curve of an agent trajectory (early-stop / progress tracking) |
| `llm_verifier_token_usage` | Cumulative verifier token accounting |

The plugin registers raw JSON-Schema tools (no `@deepseek-ai` imports) and
spawns a bundled Python sidecar (`dsh/python/sidecar.py`) that calls
`llm_verifier` — same architecture as `@liustack/modlens`.

## Requirements

1. **DeepSeek Harness Desktop** (or a DSH host) — the web profile is fine.
2. **A Python venv with `llm-verifier` installed** (Python ≥ 3.9):

   ```bash
   python3 -m venv ~/.venv/llm-verifier
   ~/.venv/llm-verifier/bin/pip install llm-verifier
   ```

   Point the plugin at it with `config.pythonBin` (see Configuration). If the
   configured bin does not exist, the plugin falls back to `python3`/`python`
   on `PATH`.

   The plugin is tested against **`llm-verifier ≥ 0.2.0`**; the sidecar checks
   the installed version and reports a clear message if it's below the
   minimum. When upstream releases a new version, see
   [UPGRADING.md](UPGRADING.md) — usually it's just `pip install -U
   llm-verifier`.
3. **A verifier backend that returns token-level logprobs.** Default is DeepSeek
   official (`https://api.deepseek.com`, model `deepseek-v4-flash`); the API key
   is resolved automatically from the DSH credential store via `config.apiKeyEnv`
   (default ref `DEEPSEEK_API_KEY`) — no separate key config.
   > Note: chat relays that reject `logprobs` (e.g. some gateways like a scnet
   > relay) do **not** work as the verifier backend.

## Installation

In DSH Desktop: **Settings → Plugins → Add** the package name, or from the
command line (`dsh plugin --profile web add ...`):

```bash
# from npm
dsh plugin --profile web add dsh-llm-verifier

# from a GitHub repo (installs sources; pure-JS, no build step needed)
dsh plugin --profile web add github:you/dsh-llm-verifier

# from a local tarball produced by `pnpm pack`
dsh plugin --profile web add ./dsh-llm-verifier-0.1.0.tgz
```

It is also indexed by community DSH plugin markets such as
[DSH Marketplace](https://dshmarketplace.dev) and the in-app 1024 store.

After installing, **fully restart DSH Desktop** so the new bundle loads. The
four `llm_verifier_*` tools then appear in every new session, and the
`llm-verifier` skill is available.

## Configuration

Set through the plugin instance's `config:` in its `cordis.patch.yml` (bundle
layer defaults) or overridden by the profile's `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `pythonBin` | `~/dev/.venv/llm-verifier/bin/python` | venv python that has `llm_verifier`; falls back to `python3`/`python` |
| `baseUrl` | `https://api.deepseek.com` | verifier endpoint (must expose logprobs) |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | credential-store ref for the verifier API key |
| `model` | `deepseek-v4-flash` | verifier model id |
| `nEvaluations` | `4` | repeated verifications K (select) |
| `pivots` | `2` | pivot count k (select) |
| `maxConcurrency` | `4` | reserved for future parallel sidecars |
| `apiKey` | — | explicit key; overrides `apiKeyEnv` resolution |
| `autoTrigger` | `true` | keep the auto-trigger policy in the registered skill; `false` strips it (manual calls only) |
| `maxBudgetTokens` | — | hard cap on cumulative verifier input tokens; calls fail with a clear error above it |

Example overlay (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

```yaml
- id: llm-verifier
  name: dsh-llm-verifier
  config:
    pythonBin: /Users/me/.venv/llm-verifier/bin/python
    baseUrl: https://api.deepseek.com
    apiKeyEnv: DEEPSEEK_API_KEY
    model: deepseek-v4-flash
    autoTrigger: true
    maxBudgetTokens: 200000
```

## Auto-trigger (legal / compliance work)

The registered `llm-verifier` skill carries an **auto-trigger policy** tuned for
contract review, institutional/policy analysis, and legal-regulatory research:
the agent automatically runs `compare`/`select`/`track` at defined checkpoints
(e.g. after a key-clause rewrite, when ≥2 candidate rewrites exist, during long
research), with frequency caps and cost guardrails. It also ships three ready
criteria presets (`criteria/contract_review.md`, `criteria/institutional_analysis.md`,
`criteria/legal_research.md`).

- Disable auto-trigger: `autoTrigger: false` (skill falls back to manual calls).
- Hard budget: `maxBudgetTokens` stops the verifier above a token cap.
- Full strategy, calibration steps, and cost data: see
  [docs/AUTO_TRIGGER.md](docs/AUTO_TRIGGER.md).

## Usage

Just ask the agent in a conversation — it calls the tools natively. For example:

> "用 llm_verifier_compare 对比这两段代码，任务是 reverse a string:
> A = `def rev(s): return s[::-1]`, B = `def rev(s): return s`,
> criteria = {"Correctness": "Does the code actually reverse the string?"}"

Scores are fine-grained rewards in [0, 1]; higher = more correct.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Tool errors like `KeyError: 'problem'` | Restart DSH — the installed plugin copy predates the fix. |
| `ModuleNotFoundError: llm_verifier` | `config.pythonBin` does not point at a venv with `llm-verifier` installed. |
| Scores stuck near `0.5` | Backend does not return logprobs (e.g. a chat relay); switch `baseUrl`/`model` to a logprobs-capable endpoint. |
| `no verifier API key resolved (ref=...)` | The credential named by `apiKeyEnv` is not configured in DSH; set it (or `config.apiKey`). |
| Tools don't appear after install | Restart DSH fully; confirm the package appears in Settings → Plugins. |

## Development

```bash
npm test                       # plugin dry-run (registration + sidecar wiring)
# sidecar self-test (needs LLM_VERIFIER_BASE_URL / *_API_KEY / *_MODEL env)
printf '%s\n' '{"id":1,"method":"compare","params":{"problem":"Reverse a string","candidate_a":"a","candidate_b":"b","criteria":{"C":"c"}}}' \
  | <venv-python> dsh/python/sidecar.py
```

## Attribution / 来源

This plugin is a DeepSeek Harness integration of **LLM-as-a-Verifier**, the
open-source verification framework this repo wraps:

- **Project**: [llm-as-a-verifier/llm-as-a-verifier](https://github.com/llm-as-a-verifier/llm-as-a-verifier)
  (the Python package `llm-verifier`)
- **Paper**: *LLM-as-a-Verifier: A General-Purpose Verification Framework*,
  Kwok et al., [arXiv:2607.05391](https://arxiv.org/abs/2607.05391)
- **Website**: [llm-as-a-verifier.com](https://llm-as-a-verifier.com) ・
  [Documentation](https://llm-as-a-verifier.com/docs/)

`llm-verifier` is distributed under the MIT License; this package is likewise
MIT. This package adds the DSH-native tool + skill surface on top of that
library — all verification/scoring logic comes from the upstream project.

## License

[MIT](LICENSE)

See [CHANGELOG.md](CHANGELOG.md) for release history.
