// scripts/dry-run.mjs — plugin dry run without mounting into DSH.
// Builds a stub ctx, applies the plugin, asserts tool/skill registration and
// exercises one sidecar round-trip (a network failure is the expected result,
// proving the spawn/JSON-lines wiring works end to end).
import { apply } from '../dsh/index.js'

const tools = []
const skills = []

const ctx = {
  tools: { register: (def) => tools.push(def) },
  skills: { register: (skill) => skills.push(skill) },
  settings: { get: () => undefined }, // no DSH settings in dry-run
  credentials: { resolve: async () => undefined },
}

const config = {
  autoResolveFromDsh: true,
  baseUrl: 'http://127.0.0.1:9', // unreachable on purpose
  apiKey: 'dry-run',
  model: 'test-model',
}

apply(ctx, config)

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 }
  else console.log('ok:', msg)
}

assert(tools.length === 4, `4 tools registered (got ${tools.length})`)
const names = tools.map((t) => t.name)
assert(
  ['llm_verifier_select', 'llm_verifier_compare', 'llm_verifier_track', 'llm_verifier_token_usage']
    .every((n) => names.includes(n)),
  `tool names: ${names.join(', ')}`,
)
for (const t of tools) {
  assert(t.output && t.output.schema && t.output.schema.type === 'object',
    `${t.name}: output.schema object-rooted`)
  assert(typeof t.execute === 'function', `${t.name}: has execute`)
  assert(t.parameters && t.parameters.type === 'object', `${t.name}: has parameters schema`)
}
assert(skills.length === 1 && skills[0].name === 'llm-verifier',
  `skill registered: ${skills[0]?.name}`)

// Mirror dsh-tools' enforced JSON Schema subset so a schema keyword that the
// registry would reject is caught here first (see dsh-tools constraint set).
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items',
  'enum', 'const', 'description', 'title', 'default', 'examples',
])
const checkSchema = (node, path) => {
  if (node === null || typeof node !== 'object') return
  for (const key of Object.keys(node)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) throw new Error(`unsupported schema keyword ${path}.${key}`)
  }
  if ('additionalProperties' in node && typeof node.additionalProperties !== 'boolean') {
    throw new Error(`${path}.additionalProperties must be a boolean`)
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [k, v] of Object.entries(node.properties)) checkSchema(v, `${path}.properties.${k}`)
  }
  if (node.items && typeof node.items === 'object') checkSchema(node.items, `${path}.items`)
  if (Array.isArray(node.oneOf)) node.oneOf.forEach((n, i) => checkSchema(n, `${path}.oneOf[${i}]`))
}
for (const t of tools) {
  try {
    checkSchema(t.parameters, `${t.name}.parameters`)
    checkSchema(t.output.schema, `${t.name}.output.schema`)
  } catch (err) {
    assert(false, `${t.name}: ${err.message}`)
  }
}
console.log('ok: all tool schemas within the dsh-tools enforced JSON Schema subset')

// End-to-end wiring: select.execute spawns the sidecar; expect a clean Error
// (network unreachable), not a hang or crash. Call it the way DSH's
// ToolRuntime does: execute(args, exec) — parsed arguments first, run context
// second (dsh-tools calls `tool.execute(exec.arguments, exec)`).
const selectTool = tools.find((t) => t.name === 'llm_verifier_select')
const outcome = await selectTool.execute({
  problem: 'Reverse a string',
  candidates: ['def rev(s): return s[::-1]', 'def rev(s): return s'],
  criteria: { Correctness: 'Does it reverse?' },
}, { signal: undefined }).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e && e.message || e) }))
assert(!outcome.ok && /llm-verifier|InternalServerError|Error code/i.test(outcome.e || ''),
  `execute round-trip through sidecar (error expected): ${outcome.e}`)

// token_usage must work under the (args, exec) convention: return the usage
// shape and honour reset.
const usageTool = tools.find((t) => t.name === 'llm_verifier_token_usage')
const snap = await usageTool.execute({ reset: false }, {})
assert(snap && typeof snap.input_tokens === 'number' && 'cache_hit_rate' in snap,
  `token_usage returns usage shape: ${JSON.stringify(snap)}`)
const snap2 = await usageTool.execute({ reset: true }, {})
assert(snap2 && snap2.calls === 0 && snap2.input_tokens === 0,
  `token_usage reset works: ${JSON.stringify(snap2)}`)

console.log(process.exitCode ? 'DRY-RUN FAILED' : 'DRY-RUN PASSED')
