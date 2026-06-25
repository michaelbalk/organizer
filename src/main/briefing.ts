import type { EmailFull, NewsBriefing } from '@shared/types'
import { getStore } from './store'
import { getAuthorizedClient } from './google/accounts'
import { getMessage } from './google/gmail'
import { generateNewsBriefing } from './anthropic'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_EMAILS = 25
const MAX_LINKS = 18
const FETCH_TIMEOUT_MS = 8000
const EMAIL_TEXT_CHARS = 1200
const ARTICLE_TEXT_CHARS = 1600
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

interface Source {
  title: string
  url: string
  from: string
  text: string
}

/** Builds a multi-topic news briefing from recent newsletter/news emails. */
export async function buildNewsBriefing(hours = 48): Promise<NewsBriefing> {
  const accounts = getStore()
    .getData()
    .accounts.filter((a) => a.provider === 'google' && a.connected)
  const days = Math.max(1, Math.ceil(hours / 24))

  // 1. Gather recent inbox emails (full bodies) across accounts.
  const emails: EmailFull[] = []
  for (const acc of accounts) {
    if (emails.length >= MAX_EMAILS) break
    try {
      const client = getAuthorizedClient(acc.id)
      const list = await client.request<{ messages?: { id: string }[] }>({
        url: `${GMAIL_BASE}/messages?q=${encodeURIComponent(`in:inbox newer_than:${days}d`)}&maxResults=${MAX_EMAILS}`
      })
      for (const ref of list.data.messages ?? []) {
        if (emails.length >= MAX_EMAILS) break
        try {
          emails.push(await getMessage(acc.id, ref.id))
        } catch {
          /* skip a message we can't read */
        }
      }
    } catch {
      /* skip an account we can't reach */
    }
  }

  // 2. Extract candidate article links from the emails.
  const candidates = extractLinks(emails).slice(0, MAX_LINKS)

  // 3. Best-effort fetch each link (resolve redirects + pull readable text).
  const fetched = await Promise.allSettled(candidates.map((c) => fetchArticle(c)))
  const sources: Source[] = fetched
    .map((r, i) => (r.status === 'fulfilled' ? r.value : fallbackSource(candidates[i])))
    .filter((s): s is Source => s !== null)

  // 4. Summarize with Claude.
  const material = buildMaterial(emails, sources)
  const { topics } = await generateNewsBriefing(material)

  return {
    topics,
    generatedAt: new Date().toISOString(),
    emailCount: emails.length,
    sourceCount: sources.length
  }
}

interface Candidate {
  url: string
  text: string
  from: string
}

const SKIP_LINK = /unsubscribe|preferences|email[-_]?settings|list-manage|manage.*subscription|\/profile|facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|youtube\.com|t\.me|\.(png|jpe?g|gif|svg|webp|css|js)(\?|#|$)/i

function extractLinks(emails: EmailFull[]): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const e of emails) {
    let m: RegExpExecArray | null
    while ((m = re.exec(e.bodyHtml)) !== null) {
      const url = m[1].trim()
      if (!/^https?:\/\//i.test(url) || SKIP_LINK.test(url)) continue
      if (seen.has(url)) continue
      const text = stripTags(m[2]).trim().slice(0, 160)
      if (text.length < 12) continue // skip "click here"/icon links
      seen.add(url)
      out.push({ url, text, from: e.from })
    }
  }
  return out
}

async function fetchArticle(c: Candidate): Promise<Source> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(c.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html' }
    })
    const finalUrl = res.url || c.url
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok || !ct.includes('text/html')) {
      return { url: finalUrl, title: c.text, from: c.from, text: '' }
    }
    const html = await res.text()
    const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
    return {
      url: finalUrl,
      title: title || c.text,
      from: c.from,
      text: htmlToText(html).slice(0, ARTICLE_TEXT_CHARS)
    }
  } catch {
    // Couldn't fetch — still cite the original link using the email's anchor text.
    return fallbackSource(c)
  } finally {
    clearTimeout(timer)
  }
}

function fallbackSource(c: Candidate): Source {
  return { url: c.url, title: c.text, from: c.from, text: '' }
}

function buildMaterial(emails: EmailFull[], sources: Source[]): string {
  const lines: string[] = ['=== RECENT NEWSLETTER EMAILS ===']
  emails.forEach((e, i) => {
    lines.push(`[E${i + 1}] From: ${e.from} | Subject: ${e.subject}`)
    lines.push(e.bodyText.replace(/\s+\n/g, '\n').trim().slice(0, EMAIL_TEXT_CHARS))
    lines.push('')
  })
  lines.push('=== LINKED SOURCES (cite these URLs) ===')
  sources.forEach((s, i) => {
    lines.push(`[S${i + 1}] Title: ${s.title} | URL: ${s.url} | Newsletter: ${s.from}`)
    if (s.text) lines.push(s.text)
    lines.push('')
  })
  return lines.join('\n')
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}
