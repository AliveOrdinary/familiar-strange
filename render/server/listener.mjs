// The cold listener: a model that hears only the voiceover, once, with no
// background, and says what the point was. If that isn't the turn, the
// script gets a flag in the Studio. It never blocks or rewrites anything.
import { askGemini, vertexConfigured } from './vertex.mjs'
import { stripPauses } from '../shared/captions.js'

const HEAR = {
  type: 'object',
  required: ['point', 'lost'],
  properties: {
    point: { type: 'string' },
    lost: { type: 'string' },
  },
}

const JUDGE = {
  type: 'object',
  required: ['matches', 'gap'],
  properties: {
    matches: { type: 'boolean' },
    gap: { type: 'string' },
  },
}

export const voiceover = (beats) => (beats || []).map((b) => stripPauses(b.say || '').trim()).filter(Boolean).join(' ')

export async function coldListen(beats, turn) {
  if (!vertexConfigured()) return null
  const text = voiceover(beats)
  const heard = await askGemini([
    `You are scrolling Instagram Reels. You hear this 30-second voiceover once, at speaking pace, and you can't rewind. You know nothing about the topic beyond everyday life.

Voiceover:
"${text}"

Reply in JSON:
- point: in one plain sentence, what was the point of the reel? Say it the way you'd tell a friend.
- lost: the one place where you got lost, or where the idea seemed to change direction, quoting a few of its words. Empty if you followed it all the way.`,
  ], HEAR, { temperature: 0.2 })
  const judged = await askGemini([
    `The writer meant this reel to make one point:
"${turn}"

A first-time listener came away with:
"${heard.point}"

Reply in JSON:
- matches: true if the listener got the same main idea (wording can differ), false if they missed it or came away with a different idea.
- gap: if it doesn't match, one short sentence on what got lost. Empty if it matches.`,
  ], JUDGE, { temperature: 0 })
  return { point: heard.point, lost: heard.lost || '', matches: !!judged.matches, gap: judged.gap || '', at: new Date().toISOString() }
}
