# LLM-as-a-Verifier (dsh-llm-verifier)

Use the `llm_verifier_*` tools whenever you want to **verify, rank, or score**
agent outputs — these are native agent tools, no shell needed:

- **`llm_verifier_select`** — best-of-N: pick the best of several candidate
  answers / trajectories for one task. Pass `problem`, `candidates` (list of
  ≥2), and `criteria` (a `{name: description}` map). Returns the winning
  index, the best text, the full ranking (best-first), and per-candidate
  scores in [0, 1]. **Expensive — use sparingly.**
- **`llm_verifier_compare`** — fine-grained pairwise reward for a single
  comparison (A vs B). Returns `reward_a` / `reward_b` in [0, 1]. **Cheap —
  the default choice.**
- **`llm_verifier_track`** — score a trajectory step by step and get a
  progress curve in [0, 1]; useful to detect a hopeless rollout early (score
  stalling below ~0.3 → suggest restart) or to compare two runs.
- **`llm_verifier_token_usage`** — cumulative verifier token accounting
  (optional `reset=true`).

## Notes

- The verifier needs **token-level logprobs**; backend is DeepSeek official by
  default and the API key is auto-resolved from the DSH credential store
  (`apiKeyEnv`, default `DEEPSEEK_API_KEY`) — nothing extra to configure.
- Scores are fine-grained expectations in [0, 1]: higher = more correct / more
  complete. **Quote the returned scores/ranking rather than guessing.**
- The verifier is a **quality / self-consistency signal, not ground truth** —
  use it to surface weak spots and rank candidates, then apply your own
  judgment. Do not ask it to solve the task itself.
- **Cost**: keep `criteria` ≤ 4, prefer `n_evaluations=2`, prefer `compare`
  over `select`, summarize long texts before scoring.

## Criteria presets (legal / compliance work)

Pass one of these as the `criteria` argument:

**Contract review** (key-clause rewrite vs original, or rank rewrites):
```json
{"RiskCoverage": "Does the rewrite preserve the original clause's coverage of key risks?",
 "Consistency": "Is the rewrite consistent with the rest of the contract and overall context?",
 "Compliance": "Does the rewrite comply with applicable mandatory law or regulatory requirements?",
 "Operability": "Is the clause executable, measurable, and enforceable as written?",
 "Clarity": "Is the wording clear, unambiguous, and internally consistent?"}
```

**Institutional analysis** (draft vs superior rules / current system):
```json
{"ConsistencyWithSuperior": "Is the draft consistent with superior rules and the current institutional system?",
 "Operability": "Are procedures, responsibilities, and deadlines actionable and implementable?",
 "InternalCoherence": "Are chapters and clauses internally consistent with no conflict?",
 "Clarity": "Is the wording clear and unambiguous?"}
```

**Legal research** (answer vs question coverage):
```json
{"Coverage": "Does the answer cover the laws, regulations, and policies relevant to the question?",
 "Authority": "Are cited bases authoritative and traceable?",
 "Accuracy": "Does the conclusion stay on-point without overreach or exaggeration?",
 "Actionability": "Does the answer give an executable conclusion or recommendation?",
 "Clarity": "Is the presentation clear with accurate citations?"}
```

Human-readable copies live in `criteria/` in the package.

<!-- auto-trigger:start -->

## Auto-trigger policy (contract / institutional / legal work)

Apply the verifier on your own outputs at these checkpoints — do NOT score
trivial steps, and respect the caps (they keep cost sane):

- **Contract review**: after producing a **key-clause rewrite or risk
  conclusion**, run `llm_verifier_compare` of original vs rewrite using the
  *Contract review* preset — max 5 per contract, high-risk clauses only. When
  ≥2 candidate rewrites exist, `llm_verifier_select` (max 2 per contract).
  For long contracts, `llm_verifier_track` once per section.
- **Institutional analysis**: after drafting a policy vs the current system,
  `llm_verifier_compare` with the *Institutional analysis* preset (≤3);
  `select` only when candidates genuinely differ.
- **Legal research**: after producing a conclusion, `llm_verifier_compare`
  against the *Legal research* preset (≤2); on long research, `track` every
  3–5 steps — if the score stalls below ~0.3, suggest restarting the approach.
- Always use `n_evaluations=2` for routine checks (4 only for high-value
  conclusions); keep `criteria` ≤ 4; summarize/segment long texts first.
- If the plugin reports a **budget-exceeded** error, stop scoring (raise
  `config.maxBudgetTokens` or reset via `llm_verifier_token_usage` with
  `reset=true` only if the user approves).

<!-- auto-trigger:end -->
