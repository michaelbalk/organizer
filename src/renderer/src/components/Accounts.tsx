import { useEffect, useState } from 'react'
import type { Account, AutomationState, Workspace } from '@shared/types'

interface Props {
  accounts: Account[]
  workspaces: Workspace[]
  automation: AutomationState
  onChanged: () => Promise<void>
}

export function Accounts({ accounts, workspaces, automation, onChanged }: Props): JSX.Element {
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)

  const toggleFollowUp = async (enabled: boolean): Promise<void> => {
    await window.api.updateAutomation({ followUpScan: enabled })
    await onChanged()
  }

  const scanNow = async (): Promise<void> => {
    setScanMsg(null)
    setScanning(true)
    try {
      const { created, scanned } = await window.api.scanFollowUpsNow()
      setScanMsg(
        created > 0
          ? `Created ${created} follow-up task${created === 1 ? '' : 's'} from ${scanned} new email${scanned === 1 ? '' : 's'}.`
          : `No follow-ups found in ${scanned} new email${scanned === 1 ? '' : 's'}.`
      )
      await onChanged()
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : 'Scan failed.')
    } finally {
      setScanning(false)
    }
  }

  const [configured, setConfigured] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetWs, setTargetWs] = useState<string>(workspaces[0]?.id ?? '')

  useEffect(() => {
    window.api.isGoogleConfigured().then(setConfigured)
  }, [])

  useEffect(() => {
    if (!targetWs && workspaces[0]) setTargetWs(workspaces[0].id)
  }, [workspaces, targetWs])

  const googleAccounts = accounts.filter((a) => a.provider === 'google')

  const connect = async (): Promise<void> => {
    setError(null)
    setConnecting(true)
    try {
      await window.api.connectAccount(targetWs)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect account.')
    } finally {
      setConnecting(false)
    }
  }

  const reassign = async (id: string, workspaceId: string): Promise<void> => {
    await window.api.updateAccount(id, { workspaceId })
    await onChanged()
  }

  const disconnect = async (id: string): Promise<void> => {
    await window.api.disconnectAccount(id)
    await onChanged()
  }

  // Reconnect the SPECIFIC account: re-auth its own email into its own workspace.
  const reconnect = async (account: Account): Promise<void> => {
    setError(null)
    setConnecting(true)
    try {
      await window.api.connectAccount(account.workspaceId, account.email)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconnect account.')
    } finally {
      setConnecting(false)
    }
  }

  const remove = async (id: string, email: string): Promise<void> => {
    if (!window.confirm(`Remove ${email}? You can reconnect it later.`)) return
    await window.api.removeAccount(id)
    await onChanged()
  }

  return (
    <div className="accounts">
      <div className="accounts-head">
        <h2>Connected accounts</h2>
        <p className="muted">
          Link your Gmail accounts. Each account belongs to a workspace, so its mail,
          calendar, and tasks land in the right place.
        </p>
      </div>

      {configured === false && (
        <div className="banner banner-warn">
          <strong>Google credentials not found.</strong> Add{' '}
          <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your{' '}
          <code>.env</code> file, then restart the app.
        </div>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      <div className="connect-row">
        <label>
          Add to workspace
          <select value={targetWs} onChange={(e) => setTargetWs(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-primary"
          disabled={configured !== true || connecting || !targetWs}
          onClick={connect}
        >
          {connecting ? 'Waiting for Google…' : '+ Connect Gmail account'}
        </button>
      </div>

      {googleAccounts.length === 0 ? (
        <div className="accounts-empty">No accounts connected yet.</div>
      ) : (
        <ul className="account-list">
          {googleAccounts.map((a) => (
            <li key={a.id} className="account-card">
              <div className="account-avatar">{a.email.charAt(0).toUpperCase()}</div>
              <div className="account-info">
                <div className="account-name">
                  {a.displayName}
                  <span className={`pill ${a.connected ? 'pill-on' : 'pill-off'}`}>
                    {a.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="account-email">{a.email}</div>
              </div>
              <div className="account-actions">
                <select value={a.workspaceId} onChange={(e) => reassign(a.id, e.target.value)}>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                {a.connected ? (
                  <button className="btn btn-ghost" onClick={() => disconnect(a.id)}>
                    Disconnect
                  </button>
                ) : (
                  <button className="btn btn-ghost" onClick={() => reconnect(a)}>
                    Reconnect
                  </button>
                )}
                <button className="btn btn-danger-ghost" onClick={() => remove(a.id, a.email)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="accounts-head" style={{ marginTop: 8 }}>
        <h2>Automation</h2>
        <p className="muted">
          Let Claude scan your inbox twice a day (≈6am &amp; 6pm) and turn emails that need a
          response into tasks — each titled by sender &amp; what&apos;s required, with a link to the
          email and its attachments listed.
        </p>
      </div>
      <div className="account-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <label className="brief-toggle">
          <input
            type="checkbox"
            checked={automation.followUpScan}
            onChange={(e) => toggleFollowUp(e.target.checked)}
          />
          <span>Scan email for follow-ups at 6am &amp; 6pm</span>
        </label>
        <div className="account-actions">
          <button className="btn btn-ghost btn-sm" onClick={scanNow} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
          {scanMsg && <span className="muted">{scanMsg}</span>}
        </div>
      </div>
    </div>
  )
}
