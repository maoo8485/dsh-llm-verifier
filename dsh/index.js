// dsh-llm-verifier — native DeepSeek Harness (Cordis) plugin wrapping
// llm-as-a-verifier (`llm_verifier`) as four agent tools.
//
// Registered as raw JSON-Schema tool definitions with zero @deepseek-ai
// imports (mirroring @liustack/modlens): the engine is a Python sidecar
// shipped in this package (dsh/python/sidecar.py) and spawned from the venv
// python, so plugin and engine version-lock together.
//
// Endpoint + credential are auto-resolved from DSH's own settings
// (`llm-pi-ai`, `agent-default-model`) and credential store, so no separate
// API key needs configuring. Explicit config.baseUrl / config.apiKey /
// config.model act as the escape hatch for other verifier backends (e.g.
// DeepSeek official or a local vLLM).
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIDECAR_PATH = fileURLToPath(new URL('./python/sidecar.py', import.meta.url))
const SKILL_PATH = fileURLToPath(new URL('../skills/llm-verifier/SKILL.md', import.meta.url))
// Conventional cadence for our own machine; consumers usually set config.pythonBin.
const DEFAULT_PYTHON = join(homedir(), 'dev', '.venv', 'llm-verifier', 'bin', 'python')
const DEFAULT_PROVIDER = 'scnet'
const DEFAULT_MODEL = 'DeepSeek-V4-Flash-0731'
const SIDECAR_TIMEOUT_MS = 300_000
const USAGE_KEYS = ['calls', 'input_tokens', 'cached_input_tokens',
  'uncached_input_tokens', 'output_tokens', 'reasoning_tokens']

export const name = 'llm-verifier'
export const inject = ['tools', 'skills', 'settings', 'credentials']

// Exported for testing / reuse; Cordis only consumes name/inject/apply.
export { resolveBackend }

// ---------------------------------------------------------------------------
// Schema helpers (raw JSON-Schema tool definitions, modlens-style)
// ---------------------------------------------------------------------------

const strSchema = (description) => ({ type: 'string', description })
// NOTE: dsh-tools enforces a JSON Schema subset (type/oneOf/properties/
// required/additionalProperties(boolean)/items/enum/const + description/
// title/default/examples). Keywords like minimum/minItems are rejected, and
// additionalProperties must be a boolean, so criteria is a loose object.
const criteriaSchema = {
  type: 'object',
  additionalProperties: true,
  description: 'Evaluation criteria as a {name: description} map, e.g. {"Correctness": "Does the code actually solve the task?"}.',
}
const candidatesSchema = {
  type: 'array',
  items: { type: 'string' },
  description: 'Candidate agent trajectories / answers to rank (best-of-N, at least two).',
}
const stepsSchema = {
  type: 'array',
  items: { type: 'string' },
  description: 'Agent steps, one string per step (action + observed output).',
}
const objectOutput = (props) => ({ type: 'object', properties: props, additionalProperties: false })
const textRender = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

const defaultConfig = {
  autoResolveFromDsh: true,
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  nEvaluations: 4,
  pivots: 2,
  maxConcurrency: 4,
  pythonBin: DEFAULT_PYTHON,
  baseUrl: undefined,
  apiKeyEnv: undefined,
  apiKey: undefined,
}

// ---------------------------------------------------------------------------
// Backend resolution (DSH-native: reuse DSH's own endpoint + credential)
// ---------------------------------------------------------------------------

async function resolveBackend(ctx, config) {
  const out = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  }
  let provider = config.provider
  let apiKeyEnv = null

  if (config.autoResolveFromDsh !== false && ctx.settings) {
    const agentModel = ctx.settings.get('agent-default-model')
    if (agentModel?.provider) provider = provider || agentModel.provider
    if (agentModel?.model && !out.model) out.model = agentModel.model
    const pi = ctx.settings.get('llm-pi-ai')
    const prov = pi?.providers?.[provider || DEFAULT_PROVIDER]
    if (prov) {
      if (!out.baseUrl) out.baseUrl = prov.baseURL
      apiKeyEnv = prov.apiKeyEnv || null
    }
  }
  if (!provider) provider = DEFAULT_PROVIDER
  if (!out.model) out.model = DEFAULT_MODEL

  // Explicit config.apiKeyEnv overrides the provider-derived ref (escape
  // hatch when the verifier backend differs from the DSH chat provider,
  // e.g. DeepSeek official while DSH chats via a relay).
  const keyRef = config.apiKeyEnv || apiKeyEnv
  if (!out.apiKey && keyRef && ctx.credentials) {
    // Runtime refs are plain strings; resolve per operation so a rotated
    // credential applies without a restart.
    const hit = await ctx.credentials.resolve(keyRef)
    out.apiKey = hit?.value
  }
  if (!out.baseUrl) {
    throw new Error(`no verifier baseURL resolved (provider=${provider}); set config.baseUrl or configure DSH llm-pi-ai.${provider}`)
  }
  if (!out.apiKey) {
    throw new Error(`no verifier API key resolved (ref=${keyRef}); set config.apiKey or configure the credential in DSH`)
  }
  return out
}

// ---------------------------------------------------------------------------
// Sidecar invocation (one-shot spawn, JSON-lines protocol)
// ---------------------------------------------------------------------------

function runSidecar(ctx, config, method, params, signal) {
  return new Promise((resolve, reject) => {
    resolveBackend(ctx, config)
      .then((backend) => {
        const env = {
          ...process.env,
          LLM_VERIFIER_BASE_URL: backend.baseUrl,
          LLM_VERIFIER_API_KEY: backend.apiKey,
          LLM_VERIFIER_MODEL: backend.model,
        }
        // Resolve the venv python: configured bin if present, else fall back
        // to a PATH `python3`/`python`. If that python lacks `llm_verifier`,
        // the sidecar fails with a clear ModuleNotFoundError.
        const configured = config.pythonBin || DEFAULT_PYTHON
        const pythonBin = existsSync(configured) ? configured
          : process.platform === 'win32' ? 'python' : 'python3'
        const child = spawn(pythonBin, [SIDECAR_PATH], { env, stdio: ['pipe', 'pipe', 'pipe'] })
        let buf = ''
        let stderrBuf = ''
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          child.kill('SIGKILL')
          reject(new Error(`[llm-verifier] sidecar timed out after ${SIDECAR_TIMEOUT_MS}ms (method=${method})`))
        }, SIDECAR_TIMEOUT_MS)
        const onAbort = () => {
          if (settled) return
          settled = true
          cleanup()
          child.kill('SIGKILL')
          reject(new Error('[llm-verifier] tool call aborted'))
        }
        const cleanup = () => {
          clearTimeout(timeout)
          signal?.removeEventListener('abort', onAbort)
          child.unref()
        }
        if (signal?.aborted) { onAbort(); return }
        signal?.addEventListener('abort', onAbort, { once: true })

        child.stdout.on('data', (d) => {
          buf += d.toString()
          const nl = buf.indexOf('\n')
          if (nl < 0) return
          const line = buf.slice(0, nl).trim()
          if (settled) return
          settled = true
          cleanup()
          let parsed
          try {
            parsed = JSON.parse(line)
          } catch (err) {
            reject(new Error(`[llm-verifier] invalid sidecar response: ${line.slice(0, 200)}`))
            return
          }
          if (parsed.error) reject(new Error(`[llm-verifier] ${parsed.error}`))
          else resolve({ result: parsed.result, usage: parsed.usage || null })
        })
        child.stderr.on('data', (d) => { stderrBuf += d.toString() })
        child.on('error', (err) => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error(`[llm-verifier] cannot spawn ${pythonBin}: ${err.message}`))
        })
        child.on('exit', (code, sig) => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error(`[llm-verifier] sidecar exited early (code=${code}, sig=${sig}); stderr: ${stderrBuf.slice(-800)}`))
        })
        child.stdin.write(JSON.stringify({ id: 1, method, params }) + '\n')
        child.stdin.end()
      })
      .catch((err) => reject(err))
  })
}

// ---------------------------------------------------------------------------
// Usage accounting (accumulated in the plugin, since each tool call spawns a
// fresh sidecar where llm_verifier.USAGE would otherwise reset)
// ---------------------------------------------------------------------------

const freshUsage = () => ({
  calls: 0,
  input_tokens: 0,
  cached_input_tokens: 0,
  uncached_input_tokens: 0,
  output_tokens: 0,
  reasoning_tokens: 0,
  cache_hit_rate: 0,
})
const accumulateUsage = (acc, usage) => {
  if (!usage) return
  for (const key of USAGE_KEYS) {
    if (typeof usage[key] === 'number') acc[key] += usage[key]
  }
  acc.cache_hit_rate = acc.input_tokens > 0 ? acc.cached_input_tokens / acc.input_tokens : 0
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx, config = {}) {
  const cfg = { ...defaultConfig, ...config }
  const usage = freshUsage()

  const makeTool = (definition) => {
    const methodFor = {
      llm_verifier_select: 'select',
      llm_verifier_compare: 'compare',
      llm_verifier_track: 'track',
    }[definition.name]
    const base = {
      timeoutMs: SIDECAR_TIMEOUT_MS,
      isConcurrencySafe: () => false,
      ...definition,
    }
    // A tool with its own execute (e.g. token_usage) keeps it; the rest
    // delegate to the sidecar.
    if (definition.execute) return base
    return {
      ...base,
      // DSH's ToolRuntime invokes registered tools as tool.execute(args, exec)
      // (see dsh-tools: `tool.execute(exec.arguments, exec)`), i.e. the parsed
      // arguments come first and the run context (signal, agent, ...) second —
      // NOT the modlens-style `execute(exec)` with exec.arguments.
      async execute(args, exec) {
        const call = await runSidecar(ctx, cfg, methodFor, args, exec?.signal)
        accumulateUsage(usage, call.usage)
        return call.result
      },
    }
  }

  const tools = [
    makeTool({
      name: 'llm_verifier_select',
      description: 'Rank candidate agent trajectories/answers with the LLM-as-a-Verifier fine-grained reward and return the best one (best-of-N via Probabilistic Pivot Tournament). Use to pick the best of several candidate solutions, verify which attempt actually solved a task, or score multiple rollouts. Returns the winning index, best text, full ranking best-first, and per-candidate scores in [0, 1] (higher = better).',
      parameters: {
        type: 'object',
        properties: {
          problem: strSchema('The task description shown to the verifier.'),
          candidates: candidatesSchema,
          criteria: criteriaSchema,
          model: strSchema('Optional verifier model id (defaults to the DSH-selected model, e.g. DeepSeek-V4-Flash-0731).'),
          n_evaluations: { type: 'integer', description: 'Repeated verifications K per criterion (default 4).' },
          pivots: { type: 'integer', description: 'Number of pivots k for the tournament (default 2).' },
        },
        required: ['problem', 'candidates', 'criteria'],
      },
      output: {
        schema: objectOutput({
          index: { type: 'integer', description: 'Index of the best candidate into `candidates`.' },
          best: { type: 'string', description: 'Text of the best candidate.' },
          ranking: { type: 'array', items: { type: 'string' }, description: 'Candidates ordered best-first.' },
          scores: { type: 'array', items: { type: 'number' }, description: 'Fine-grained score of each candidate in [0, 1].' },
        }),
        render: textRender,
      },
    }),
    makeTool({
      name: 'llm_verifier_compare',
      description: 'Fine-grained pairwise reward comparison of two candidate trajectories for one task. Returns reward_a / reward_b in [0, 1] (higher = more correct). Use to judge which of two candidates is better, or to get a fine-grained reward signal for a single comparison.',
      parameters: {
        type: 'object',
        properties: {
          problem: strSchema('The task description shown to the verifier.'),
          candidate_a: strSchema('First candidate trajectory/answer (slot A).'),
          candidate_b: strSchema('Second candidate trajectory/answer (slot B).'),
          criteria: criteriaSchema,
          model: strSchema('Optional verifier model id.'),
        },
        required: ['problem', 'candidate_a', 'candidate_b', 'criteria'],
      },
      output: {
        schema: objectOutput({
          reward_a: { type: 'number' },
          reward_b: { type: 'number' },
        }),
        render: textRender,
      },
    }),
    makeTool({
      name: 'llm_verifier_track',
      description: 'Score an agent trajectory step by step with the fine-grained reward, producing a progress curve in [0, 1] (higher = closer to verified completion). Use to evaluate whether an agent is making real progress, to spot a hopeless rollout early, or to compare two runs of the same task.',
      parameters: {
        type: 'object',
        properties: {
          problem: strSchema('The task description shown to the verifier.'),
          steps: stepsSchema,
          model: strSchema('Optional verifier model id.'),
        },
        required: ['problem', 'steps'],
      },
      output: {
        schema: objectOutput({
          scores: { type: 'array', items: { type: 'number' }, description: 'Progress score after each step in [0, 1].' },
        }),
        render: textRender,
      },
    }),
    makeTool({
      name: 'llm_verifier_token_usage',
      description: 'Report the cumulative verifier token accounting (calls, input/cached/uncached input, output, cache hit rate) accumulated by this plugin instance. Pass reset=true to zero the counters after returning the current snapshot.',
      parameters: {
        type: 'object',
        properties: {
          reset: { type: 'boolean', description: 'Zero the counters after returning (default false).' },
        },
        required: [],
      },
      output: {
        schema: objectOutput({
          calls: { type: 'number' },
          input_tokens: { type: 'number' },
          cached_input_tokens: { type: 'number' },
          uncached_input_tokens: { type: 'number' },
          output_tokens: { type: 'number' },
          reasoning_tokens: { type: 'number' },
          cache_hit_rate: { type: 'number' },
        }),
        render: textRender,
      },
      async execute(args, exec) {
        const snapshot = { ...usage }
        if (args?.reset) Object.assign(usage, freshUsage())
        return snapshot
      },
    }),
  ]

  for (const tool of tools) {
    try {
      ctx.tools.register(tool)
    } catch (error) {
      // Same-layer duplicate or preview-surface change: degrade loudly
      // instead of taking the whole plugin down (modlens issue #21 style).
      console.error(`[llm-verifier] ${tool.name} registration skipped: ${error}`)
    }
  }

  if (ctx.skills) {
    try {
      ctx.skills.register({
        name: 'llm-verifier',
        description: 'LLM-as-a-Verifier: fine-grained reward scoring for best-of-N selection, pairwise comparison, and step-by-step progress tracking of agent trajectories.',
        whenToUse: 'When the user wants to verify or select the best of several candidate answers/trajectories, compare two candidates, or score an agent\u2019s progress step by step.',
        // `source` is required by dsh-skill's validateDefinition when the
        // skill is loaded (the runtime provider defaults provider to "runtime").
        source: 'dsh-llm-verifier',
        content: readFileSync(SKILL_PATH, 'utf8'),
      })
    } catch (error) {
      console.error(`[llm-verifier] skill registration skipped: ${error}`)
    }
  }
}
