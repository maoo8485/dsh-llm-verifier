# Institutional analysis criteria

Used to score a draft policy/rule against the current institutional system or
superior rules (`llm_verifier_compare`), or to rank candidate institutional
designs (`llm_verifier_select`).

## Criteria

- **ConsistencyWithSuperior** — Is the draft consistent with superior rules
  and the current institutional system?
- **Operability** — Are procedures, responsibilities, and deadlines actionable
  and implementable in practice?
- **InternalCoherence** — Are chapters and clauses internally consistent, with
  no conflict between them?
- **Clarity** — Is the wording clear and unambiguous?

## Ground-truth note

These judge **analysis quality** (consistency, operability, coherence of the
draft/analysis), not whether the institutional design is politically
acceptable — that is the decision-maker's call.

## Usage

Pass as the `criteria` argument:

```json
{"ConsistencyWithSuperior": "Is the draft consistent with superior rules and the current institutional system?",
 "Operability": "Are procedures, responsibilities, and deadlines actionable and implementable?",
 "InternalCoherence": "Are chapters and clauses internally consistent with no conflict?",
 "Clarity": "Is the wording clear and unambiguous?"}
```
