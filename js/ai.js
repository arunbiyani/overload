// Optional: let Claude adjust the plan. The user's own API key is kept on the
// device and sent only to api.anthropic.com. The SDK loads on first use, so the
// rest of the app keeps working offline.

import { EXERCISES } from './exercises.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.135.0/+esm';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'days'],
  properties: {
    explanation: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'exercises'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exId', 'sets', 'repMin', 'repMax', 'rir', 'restSec'],
              properties: {
                exId: { type: 'string', enum: EXERCISES.map((e) => e.id) },
                sets: { type: 'integer' },
                repMin: { type: 'integer' },
                repMax: { type: 'integer' },
                rir: { type: 'integer' },
                restSec: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are an evidence-based strength coach editing a lifter's training plan.
Follow current sports-science guidance: about 10-20 hard sets per muscle per week, each muscle trained at least twice weekly, 0-3 reps in reserve, compounds before isolations, rep ranges that suit the goal.
Change only what the request needs and keep each day's "id" unchanged so logged history stays linked. Use only exercise ids from the provided library.
In "explanation", give the lifter 2-4 plain sentences on what you changed and why.`;

export async function askClaude({ apiKey, profile, plan, request }) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const library = EXERCISES.map((e) => `${e.id}: ${e.name} (${e.muscle}, ${e.equip}, ${e.type})`).join('\n');
  const current = plan.days.map((d) => ({
    id: d.id,
    name: d.name,
    exercises: d.exercises.map(({ exId, sets, repMin, repMax, rir, restSec }) => ({ exId, sets, repMin, repMax, rir, restSec })),
  }));
  const { goal, experience, sessionMinutes, sex, age } = profile;

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `Lifter: ${JSON.stringify({ goal, experience, sessionMinutes, sex, age })}
Exercise library:
${library}

Current plan:
${JSON.stringify(current)}

Request: ${request}`,
    }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing it.');
  if (response.stop_reason === 'max_tokens') throw new Error('The response was cut off. Try a smaller change.');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Claude.');
  return JSON.parse(text);
}
