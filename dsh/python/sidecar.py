#!/usr/bin/env python3
"""LLM-as-a-Verifier sidecar for the dsh-llm-verifier plugin.

JSON-lines stdio service wrapping the `llm_verifier` Python package:
one request per line on stdin, one response per line on stdout.
stderr is reserved for logs.

    Request : {"id": 1, "method": "select", "params": {...}}
    Response: {"id": 1, "result": {...}, "usage": {...}}
              {"id": 1, "error": "..."}

Backend is configured through the environment (injected by the plugin, so
the user configures nothing extra):

    LLM_VERIFIER_BASE_URL  OpenAI-compatible endpoint (e.g. scnet)
    LLM_VERIFIER_API_KEY   API key for that endpoint
    LLM_VERIFIER_MODEL     model id (default DeepSeek-V4-Flash-0731)

The verifier needs token-level logprobs. For a DeepSeek-style relay (scnet)
we build the OpenAI client ourselves and tag it `_llm_verifier_deepseek =
True`, so llm_verifier uses the DeepSeek direct-distribution path (the model
emits its own <score_X> tags) instead of the vLLM-only prefill trick. This
keeps the third-party package unmodified.
"""

import json
import os
import sys
import traceback

import llm_verifier

DEFAULT_MODEL = "DeepSeek-V4-Flash-0731"
FALLBACK_CRITERIA = {"Overall": "Does the trajectory correctly and completely solve the task?"}
USAGE_KEYS = ("calls", "input_tokens", "cached_input_tokens",
              "uncached_input_tokens", "output_tokens", "reasoning_tokens",
              "cache_hit_rate")


def build_client():
    base_url = os.environ.get("LLM_VERIFIER_BASE_URL", "").strip()
    if not base_url:
        raise RuntimeError(
            "LLM_VERIFIER_BASE_URL is not set (plugin failed to resolve a "
            "verifier backend from DSH settings)")
    api_key = os.environ.get("LLM_VERIFIER_API_KEY", "").strip() or "EMPTY"
    from openai import OpenAI
    client = OpenAI(base_url=base_url, api_key=api_key)
    # Route scnet / OpenAI-compatible DeepSeek-style relays down the DeepSeek
    # direct-distribution path (skips the vLLM-only prefill trick).
    client._llm_verifier_deepseek = True
    return client


def _model():
    return os.environ.get("LLM_VERIFIER_MODEL", DEFAULT_MODEL).strip()


def _criteria(params):
    criteria = params.get("criteria")
    return criteria if criteria else FALLBACK_CRITERIA


def _usage_snapshot():
    try:
        usage = llm_verifier.token_usage()
        return {key: usage.get(key) for key in USAGE_KEYS}
    except Exception:
        return None


def _f64(value):
    return round(float(value), 6)


def handle(method, params):
    client = build_client()
    model = params.get("model") or _model()

    if method == "select":
        result = llm_verifier.select(
            problem=params["problem"],
            candidates=params["candidates"],
            criteria=_criteria(params),
            n_evaluations=params.get("n_evaluations", 4),
            pivots=params.get("pivots", 2),
            model=model,
            client=client,
            on_error="raise",
        )
        return {
            "index": result.index,
            "best": getattr(result, "best", None),
            "ranking": list(result.ranking),
            "scores": [_f64(s) for s in result.scores],
        }

    if method == "compare":
        reward_a, reward_b = llm_verifier.compare(
            problem=params["problem"],
            trace_a=params["candidate_a"],
            trace_b=params["candidate_b"],
            criteria=_criteria(params),
            model=model,
            client=client,
        )
        return {"reward_a": _f64(reward_a), "reward_b": _f64(reward_b)}

    if method == "track":
        steps = params["steps"]
        # Score EVERY step by default (1..T) so the progress curve includes
        # the final verified-complete state; the library's interior-only
        # default (2..T-1) truncates the rise to 1.0.
        checkpoint_steps = params.get("checkpoint_steps") or list(range(1, len(steps) + 1))
        result = llm_verifier.track(
            problem=params["problem"],
            steps=steps,
            checkpoint_steps=checkpoint_steps,
            model=model,
            client=client,
        )
        return {"scores": [_f64(s) for s in result.scores]}

    raise ValueError(f"unknown method: {method}")


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = {}
        try:
            request = json.loads(line)
            rid = request.get("id")
            method = request.get("method")
            params = request.get("params") or {}
            result = handle(method, params)
            response = {"id": rid, "result": result, "usage": _usage_snapshot()}
        except Exception as exc:  # never let one bad request kill the sidecar
            sys.stderr.write(
                f"[llm-verifier sidecar] {request.get('method')} failed: "
                f"{exc}\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            response = {"id": request.get("id"), "error": f"{type(exc).__name__}: {exc}"}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
