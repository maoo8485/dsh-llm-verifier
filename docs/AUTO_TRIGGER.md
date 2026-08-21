# Auto-trigger strategy for legal work

This document is the reviewed, finalized version of the automatic-trigger
strategy for this plugin in **legal / compliance work** (contract review,
institutional/policy analysis, legal-regulatory research). It was itself
validated with `llm_verifier` (see "Verifier self-review" at the end) and then
extended with the gaps that an LLM judge cannot surface (cost, calibration,
frequency caps, off-switch).

## Positioning & boundary

The verifier is a **quality / self-consistency signal**, not a legal fact finder.

- Strong at judging: coverage, consistency, compliance with a stated standard,
  clarity, operability — i.e. "did the review/rewrite/answer cover the key
  dimensions and stay consistent".
- NOT a judge of: whether a clause is legally valid, whether a contract is
  fair in a substantive sense, whether a legal conclusion is correct in fact.

Treat its scores as a **reviewer/QA layer**: surface weak spots and rank
candidates — then apply your own legal judgment. Never gate a deliverable
purely on a verifier score.

## Three work types → trigger points

| Work | Trigger point | Tool | Frequency cap |
|---|---|---|---|
| Contract review | After producing a **key-clause rewrite** or **risk conclusion** | `compare` (original vs rewrite) | ≤ 5 per contract; only high-risk / key clauses |
| Contract review | When ≥ 2 candidate rewrites exist | `select` | ≤ 2 per contract (select is expensive) |
| Contract review | Long contract reviewed section by section | `track` | 1× per section (≈1 per 3–5 sections) |
| Institutional analysis | Draft policy vs current institutional system / superior rules | `compare` | ≤ 3 per analysis |
| Institutional analysis | Multiple candidate designs | `select` | only when candidates genuinely differ |
| Legal research | After producing a conclusion / answer | `compare` (answer vs coverage rubric) | ≤ 2 per research task |
| Legal research | Long multi-step research | `track` | every 3–5 steps; if score stalls < 0.3, suggest restart |

Rule of thumb: **`compare` is cheap, `select` is expensive, `track` is for long
runs**. When in doubt, use `compare`.

## Criteria presets

Inline JSON the agent passes as the `criteria` argument.

### Contract review (`criteria/contract_review.md`)
```json
{"RiskCoverage": "Does the rewrite preserve the original clause's coverage of key risks?",
 "Consistency": "Is the rewrite consistent with the rest of the contract and overall context?",
 "Compliance": "Does the rewrite comply with applicable mandatory law or regulatory requirements?",
 "Operability": "Is the clause executable, measurable, and enforceable as written?",
 "Clarity": "Is the wording clear, unambiguous, and internally consistent?"}
```
(Selected by verifier over two alternatives — the 5-dimension set with
Consistency + Operability wins; avoid judge-only sets like "IsValid", which are
not verifiable.)

### Institutional analysis (`criteria/institutional_analysis.md`)
```json
{"ConsistencyWithSuperior": "Is the draft consistent with superior rules and the current institutional system?",
 "Operability": "Are procedures, responsibilities, and deadlines actionable and implementable?",
 "InternalCoherence": "Are chapters and clauses internally consistent with no conflict?",
 "Clarity": "Is the wording clear and unambiguous?"}
```

### Legal research (`criteria/legal_research.md`)
```json
{"Coverage": "Does the answer cover the laws, regulations, and policies relevant to the question?",
 "Authority": "Are cited bases authoritative and traceable?",
 "Accuracy": "Does the conclusion stay on-point without overreach or exaggeration?",
 "Actionability": "Does the answer give an executable conclusion or recommendation?",
 "Clarity": "Is the presentation clear with accurate citations?"}
```

## Calibration (do this before trusting auto-trigger)

The verifier's judgment must agree with yours in your domain before you let it
drive behavior:

1. Take **10 clause rewrites / risk conclusions you already judged** (mix of
   good and bad).
2. Have the verifier score them (`compare` original vs rewrite, or `track` the
   conclusion).
3. Check the agreement rate between its ranking and your judgment.
4. If agreement < ~70%, **do not enable auto-trigger**: tune the criteria,
   raise thresholds, or keep the plugin on manual invocation.

## Cost guardrails

Measured on this repo (DeepSeek official, `deepseek-v4-flash`):

- A 3-candidate `select` (default params, 4 criteria × 4 evaluations) cost
  **≈ 96 calls / 39万 output tokens** — criteria count × evaluations × pairs
  multiply the bill linearly.
- Therefore:
  - `n_evaluations = 2` for routine checks (4 only for high-value conclusions);
  - keep `criteria ≤ 4` (the 5-dimension contract preset is the accepted
    exception — it is the selected set);
  - prefer `compare` over `select`;
  - long clauses: **summarize / segment before scoring**, never score a whole
    contract verbatim;
  - track the per-session bill with `llm_verifier_token_usage`; set
    `config.maxBudgetTokens` to hard-stop the verifier above a budget.

## Switch & rollback

- `config.autoTrigger` (default `true`): when `false`, the skill's auto-trigger
  policy section is stripped from the registered skill — agents fall back to
  manual invocation only. No code change, flip it in `cordis.patch.yml`.
- `config.maxBudgetTokens` (default unset = unlimited): when the plugin's
  cumulative verifier input tokens reach this, verifier tool calls fail with a
  clear "budget exceeded" message (reset via `llm_verifier_token_usage` with
  `reset=true`).
- Both are per-instance config in the bundle `cordis.patch.yml`.

## Bilingual / long-text notes

- For bilingual (zh/en) contracts, "Clarity/Consistency" judgment is harder;
  score the **translated/key parts** separately rather than the whole.
- Long clauses: extract the operative parts (subject / obligation / condition /
  consequence) and score those.

## Verifier self-review (this doc's validation)

`llm_verifier` was asked to review the draft strategy:

- Skill-discipline triggering vs hard auto-execution → **1.0 vs 0.053** (skill
  discipline strongly preferred).
- Phased rollout (layers 1+2 first) vs all-at-once → **0.999999 vs 0.105**
  (phased strongly preferred).
- Contract-review criteria set selection → **C3 (5-dimension) best** over the
  4-dimension and 3-dimension alternatives.

Caveat: the verifier is the same model family as the chat agent and the
criteria encode our own preferences, so this is confirmation + artifact
selection, not independent proof. The cost/calibration/off-switch gaps below it
are the substantive additions from human review.
