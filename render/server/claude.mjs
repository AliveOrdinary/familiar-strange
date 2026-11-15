// Claude API: research with web search, then hand back one structured result.
//
// The model searches as much as it needs (capped), then calls the single
// "submit" tool we give it. `check` may reject the submission with a list of
// problems, which is sent back once or twice for repair.
import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
let client = null
export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY
const api = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 }))

export async function research({ system, user, tool, maxSearches = 8, check, maxTokens = 8000 }) {
  if (!claudeConfigured()) throw new Error('ANTHROPIC_API_KEY is not set on the stack')
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }, tool]
  const messages = [{ role: 'user', content: user }]
  const usage = { searches: 0, input: 0, output: 0 }
  let repairs = 0
  let forced = false
  for (let turn = 0; turn < 10; turn++) {
    const msg = await api().messages
      .stream({ model: MODEL, max_tokens: maxTokens, system, tools, messages, ...(forced ? { tool_choice: { type: 'tool', name: tool.name } } : {}) })
      .finalMessage()
    usage.searches += msg.usage?.server_tool_use?.web_search_requests || 0
    usage.input += msg.usage?.input_tokens || 0
    usage.output += msg.usage?.output_tokens || 0
    messages.push({ role: 'assistant', content: msg.content })
    if (msg.stop_reason === 'pause_turn') continue // long search turn: let it carry on
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === tool.name)
    if (!call) {
      if (msg.stop_reason === 'max_tokens') throw new Error('Claude ran out of room before submitting; try again')
      messages.push({ role: 'user', content: `Call ${tool.name} now with your final answer.` })
      forced = true
      continue
    }
    const problems = check ? check(call.input) : []
    if (!problems.length) return { result: call.input, usage, model: MODEL }
    if (++repairs > 2) throw new Error('Claude could not produce a valid result: ' + problems.slice(0, 4).join('; '))
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Not accepted. Fix every problem and submit again:\n- ' + problems.join('\n- ') }],
    })
    forced = true
  }
  throw new Error('Claude did not finish within the turn limit')
}
