# LLM-as-a-Verifier (dsh-llm-verifier)

Use the `llm_verifier_*` tools whenever the user wants to **verify, rank, or
score** agent outputs — these are native agent tools, no shell needed:

- **`llm_verifier_select`** — best-of-N: pick the best of several candidate
  answers / trajectories for one task. Pass `problem`, `candidates` (list of
  ≥2), and `criteria` (a `{name: description}` map). Returns the winning
  index, the best text, the full ranking (best-first), and per-candidate
  scores in [0, 1].
- **`llm_verifier_compare`** — fine-grained pairwise reward for a single
  comparison (A vs B). Returns `reward_a` / `reward_b` in [0, 1].
- **`llm_verifier_track`** — score a trajectory step by step and get a
  progress curve in [0, 1]; useful to detect a hopeless rollout early or to
  compare two runs of the same task.
- **`llm_verifier_token_usage`** — cumulative verifier token accounting
  (optional `reset=true`).

## Notes

- The verifier needs **token-level logprobs** from its backend; it is
  auto-configured from DSH's own model settings (scnet) — the endpoint and
  API key are reused from DSH, nothing extra to configure.
- Scores are fine-grained expectations in [0, 1]: higher = more correct /
  more complete. **Quote the returned scores/ranking rather than guessing.**
- The verifier model is a cheap/fast model used for scoring, not for
  reasoning — do not ask it to solve the task itself.
