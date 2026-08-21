# Contract review criteria

Used to score a clause rewrite against the original (`llm_verifier_compare`),
or to rank candidate rewrites (`llm_verifier_select`).

## Criteria

- **RiskCoverage** — Does the rewrite preserve the original clause's coverage
  of key risks?
- **Consistency** — Is the rewrite consistent with the rest of the contract
  and the overall context?
- **Compliance** — Does the rewrite comply with applicable mandatory law or
  regulatory requirements?
- **Operability** — Is the clause executable, measurable, and enforceable as
  written?
- **Clarity** — Is the wording clear, unambiguous, and internally consistent?

## Ground-truth note

These criteria judge **review/rewrite quality** (coverage, consistency,
compliance of the review output), not the legal validity of the underlying
clause — that stays the reviewer's job. Avoid "IsValid"-style criteria, which
are not verifiable by a scorer.

## Usage

Pass as the `criteria` argument:

```json
{"RiskCoverage": "Does the rewrite preserve the original clause's coverage of key risks?",
 "Consistency": "Is the rewrite consistent with the rest of the contract and overall context?",
 "Compliance": "Does the rewrite comply with applicable mandatory law or regulatory requirements?",
 "Operability": "Is the clause executable, measurable, and enforceable as written?",
 "Clarity": "Is the wording clear, unambiguous, and internally consistent?"}
```
