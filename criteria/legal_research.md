# Legal research criteria

Used to score a research conclusion / answer against the question
(`llm_verifier_compare`), or to rank candidate answers (`llm_verifier_select`).

## Criteria

- **Coverage** — Does the answer cover the laws, regulations, and policies
  relevant to the question?
- **Authority** — Are the cited bases authoritative and traceable?
- **Accuracy** — Does the conclusion stay on-point, without overreach or
  exaggeration?
- **Actionability** — Does the answer give an executable conclusion or
  recommendation?
- **Clarity** — Is the presentation clear, with accurate citations?

## Ground-truth note

These judge **research quality** (coverage, authority, on-pointness of the
answer), not whether a legal conclusion is factually correct in court — that
requires professional verification beyond an LLM scorer.

## Usage

Pass as the `criteria` argument:

```json
{"Coverage": "Does the answer cover the laws, regulations, and policies relevant to the question?",
 "Authority": "Are cited bases authoritative and traceable?",
 "Accuracy": "Does the conclusion stay on-point without overreach or exaggeration?",
 "Actionability": "Does the answer give an executable conclusion or recommendation?",
 "Clarity": "Is the presentation clear with accurate citations?"}
```
