import type { DraftReplyInput, MeetingBriefInput } from '@shared/types'
import { getAnthropicConfig, type AnthropicConfig } from './config'

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_BODY_CHARS = 6000

interface ContentBlock {
  type: string
  text?: string
}
interface MessagesResponse {
  content?: ContentBlock[]
  stop_reason?: string
  error?: { message?: string }
}

/** Drafts an email reply/forward note with Claude, returning the body text. */
export async function draftReply(input: DraftReplyInput): Promise<string> {
  const cfg = getAnthropicConfig()
  if (!cfg) {
    throw new Error('Claude is not configured. Add ANTHROPIC_API_KEY to your .env file.')
  }

  const system = buildSystemPrompt(input)
  const userText = buildUserPrompt(input)
  return callClaude(cfg, system, userText)
}

function buildSystemPrompt(input: DraftReplyInput): string {
  const role =
    input.mode === 'new'
      ? `You are an email assistant drafting a brand-new email that ${input.accountEmail} will send.`
      : input.mode === 'forward'
        ? `You are an email assistant writing a brief note to accompany an email that ${input.accountEmail} is forwarding.`
        : `You are an email assistant drafting a reply that ${input.accountEmail} will send.`
  return [
    role,
    'Write in a warm, clear, professional tone, matched to the original message.',
    'Output ONLY the body text of the email — no subject line, no greeting placeholders like [Name], no "Here is a draft" preamble, no surrounding quotes, and no signature block (the sender adds their own).',
    'Keep it concise and ready to send.'
  ].join(' ')
}

function buildUserPrompt(input: DraftReplyInput): string {
  const guidance = input.guidance?.trim()

  // A brand-new message has no original to quote — drive entirely off guidance.
  if (input.mode === 'new') {
    const lines: string[] = []
    if (input.subject?.trim()) lines.push(`The email subject is: ${input.subject.trim()}`)
    lines.push(guidance ? `Write an email that: ${guidance}` : 'Write a clear, friendly email.')
    return lines.join('\n')
  }

  const lines = [
    input.mode === 'forward' ? 'You are forwarding this email:' : 'You are replying to this email:',
    `From: ${input.fromName ?? ''}`,
    `Subject: ${input.subject ?? ''}`,
    '',
    (input.originalBody ?? '').slice(0, MAX_BODY_CHARS),
    ''
  ]
  if (guidance) {
    lines.push(`Write the message so it conveys: ${guidance}`)
  } else if (input.mode === 'forward') {
    lines.push('Write a short, friendly note introducing why this is being forwarded.')
  } else {
    lines.push('Write an appropriate, helpful reply.')
  }
  return lines.join('\n')
}

/** Drafts a concise, skimmable meeting brief with Claude. */
export async function draftMeetingBrief(input: MeetingBriefInput): Promise<string> {
  const cfg = getAnthropicConfig()
  if (!cfg) {
    throw new Error('Claude is not configured. Add ANTHROPIC_API_KEY to your .env file.')
  }

  const system = [
    `You are an executive assistant preparing ${input.accountEmail} for a meeting.`,
    'Write a concise, skimmable brief in plain text (no markdown headings or "#").',
    'Include, in this order: a one-line purpose; a short agenda (3-5 bullets using "-"); key context or background; and 2-3 sharp questions or talking points to raise.',
    'Keep it under ~200 words. Output only the brief — no preamble.'
  ].join(' ')

  const lines = [
    `Meeting: ${input.title}`,
    `When: ${input.when}`,
    input.attendees ? `Attendees: ${input.attendees}` : '',
    input.location ? `Location: ${input.location}` : '',
    input.description ? `Existing notes: ${input.description}` : '',
    '',
    input.guidance
      ? `Focus the brief on: ${input.guidance}`
      : 'Prepare me to lead this meeting effectively.'
  ].filter(Boolean)

  return callClaude(cfg, system, lines.join('\n'))
}

async function callClaude(cfg: AnthropicConfig, system: string, userText: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      // No temperature/thinking — Opus 4.8 rejects sampling params; drafts are short.
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userText }]
      })
    })
  } catch (err) {
    throw new Error(`Could not reach Claude: ${err instanceof Error ? err.message : String(err)}`)
  }

  const data = (await res.json().catch(() => ({}))) as MessagesResponse
  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}${data.error?.message ? `: ${data.error.message}` : ''}`)
  }
  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined to draft this message.')
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('')
    .trim()
  if (!text) throw new Error('Claude returned an empty draft.')
  return text
}
