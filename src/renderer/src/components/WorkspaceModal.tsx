import { useState } from 'react'
import type { WorkspaceKind } from '@shared/types'

interface Props {
  onClose: () => void
  onSaved: () => void
}

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d']

export function WorkspaceModal({ onClose, onSaved }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<WorkspaceKind>('business')
  const [color, setColor] = useState(COLORS[1])
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    await window.api.createWorkspace({ name: name.trim(), kind, color })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add Workspace</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              placeholder="e.g. Acme LLC"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </label>

          <label className="field">
            <span>Type</span>
            <div className="segmented">
              <button
                className={kind === 'personal' ? 'active' : ''}
                onClick={() => setKind('personal')}
              >
                👤 Personal
              </button>
              <button
                className={kind === 'business' ? 'active' : ''}
                onClick={() => setKind('business')}
              >
                🏢 Business
              </button>
            </div>
          </label>

          <label className="field">
            <span>Color</span>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </label>
        </div>

        <div className="modal-foot">
          <span />
          <div className="modal-foot-right">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!name.trim() || saving} onClick={save}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
