import { useEffect, useState } from 'react'
import type { Account, BriefingState, NewsBriefing } from '@shared/types'

interface Props {
  accounts: Account[]
  state: BriefingState
  onChanged: () => Promise<void>
  onGoToSettings: () => void
}

/**
 * News briefing: summarizes the last day or two of newsletter/news emails (and
 * the articles they link to) into a multi-topic briefing with citations.
 * Can auto-generate once each morning with a desktop notification.
 */
export function Briefing({ accounts, state, onChanged, onGoToSettings }: Props): JSX.Element {
  const [briefing, setBriefing] = useState<NewsBriefing | null>(state.last)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep showing the latest cached briefing (e.g. one generated overnight).
  useEffect(() => {
    setBriefing(state.last)
  }, [state.last?.generatedAt])

  const connected = accounts.filter((a) => a.provider === 'google' && a.connected)

  const generate = async (): Promise<void> => {
    setError(null)
    setLoading(true)
    try {
      setBriefing(await window.api.generateBriefing(48))
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the briefing.')
    } finally {
      setLoading(false)
    }
  }

  const setAuto = async (autoDaily: boolean): Promise<void> => {
    await window.api.updateBriefingSettings({ autoDaily })
    await onChanged()
  }
  const setTime = async (time: string): Promise<void> => {
    await window.api.updateBriefingSettings({ time })
    await onChanged()
  }

  if (connected.length === 0) {
    return (
      <div className="inbox-empty-state">
        <div className="placeholder-icon">📰</div>
        <h2>No Gmail accounts connected</h2>
        <p>Connect an account so I can summarize your newsletters into a briefing.</p>
        <button className="btn btn-primary" onClick={onGoToSettings}>
          Go to Settings
        </button>
      </div>
    )
  }

  return (
    <div className="briefing">
      <div className="cal-head">
        <div>
          <div className="cal-title">News briefing</div>
          <div className="muted">
            {briefing
              ? `Generated ${formatWhen(briefing.generatedAt)} · ${briefing.emailCount} emails · ${briefing.sourceCount} sources`
              : 'Summarize the last 48 hours of newsletters & news emails, with citations'}
          </div>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? 'Building…' : briefing ? '↻ Regenerate' : '✨ Generate briefing'}
        </button>
      </div>

      <div className="brief-schedule">
        <label className="brief-toggle">
          <input
            type="checkbox"
            checked={state.autoDaily}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span>Auto-generate every morning</span>
        </label>
        <span className="muted">at</span>
        <input
          type="time"
          className="brief-time"
          value={state.time}
          disabled={!state.autoDaily}
          onChange={(e) => setTime(e.target.value)}
        />
        {state.autoDaily && <span className="muted">· you&apos;ll get a notification when it&apos;s ready</span>}
      </div>

      {error && <div className="banner banner-warn">{error}</div>}

      {loading && !briefing && (
        <div className="app-loading" style={{ height: 'auto', paddingTop: 50 }}>
          <div className="spinner" />
          <span>Reading newsletters and fetching linked articles… (this can take ~20s)</span>
        </div>
      )}

      {!loading && !briefing && !error && (
        <div className="celebrate">
          <div className="celebrate-emoji">📰</div>
          <h3>Your daily briefing, on demand</h3>
          <p>
            Hit <strong>Generate briefing</strong> and I&apos;ll pull the news from your recent
            newsletters, follow the article links, and lay it out by topic — each with a clickable
            source.
          </p>
        </div>
      )}

      {briefing && briefing.topics.length === 0 && (
        <div className="cal-empty">No news found in the last 48 hours of email.</div>
      )}

      {briefing &&
        briefing.topics.map((topic, ti) => (
          <div key={ti} className="brief-topic">
            <div className="brief-topic-title">{topic.title}</div>
            <ul className="brief-items">
              {topic.items.map((item, ii) => (
                <li key={ii} className="brief-item">
                  <div className="brief-summary">{item.summary}</div>
                  {item.sourceUrl && (
                    <button
                      className="brief-cite"
                      onClick={() => window.open(item.sourceUrl, '_blank')}
                      title={item.sourceUrl}
                    >
                      ↗ {item.sourceTitle || 'Source'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
