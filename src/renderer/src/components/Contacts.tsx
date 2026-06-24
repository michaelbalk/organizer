import { useMemo, useState } from 'react'
import {
  CONTACT_STAGES,
  type Contact,
  type ContactPatch,
  type ContactStage,
  type InteractionKind,
  type Workspace
} from '@shared/types'

interface Props {
  contacts: Contact[]
  workspaces: Workspace[]
  workspaceById: Map<string, Workspace>
  onChanged: () => Promise<void>
}

/** Address book + lightweight CRM: searchable contact list with an editable
 *  detail panel and a per-contact interaction log. */
export function Contacts({ contacts, workspaces, workspaceById, onChanged }: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...contacts]
      .filter(
        (c) =>
          !q ||
          `${c.name} ${c.company} ${c.email} ${c.tags.join(' ')}`.toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [contacts, search])

  const selected = contacts.find((c) => c.id === selectedId) ?? null

  const addContact = async (): Promise<void> => {
    const created = await window.api.createContact({
      name: 'New contact',
      workspaceId: workspaces[0]?.id
    })
    await onChanged()
    setSelectedId(created.id)
  }

  return (
    <div className="crm">
      <aside className="crm-list-col">
        <div className="crm-list-head">
          <input
            className="search crm-search"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={addContact}>
            + New
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="crm-empty">
            {contacts.length === 0 ? 'No contacts yet — add your first.' : 'No matches.'}
          </div>
        ) : (
          <ul className="crm-list">
            {filtered.map((c) => {
              const ws = workspaceById.get(c.workspaceId)
              const stage = CONTACT_STAGES.find((s) => s.id === c.stage)!
              return (
                <li
                  key={c.id}
                  className={`crm-row ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="crm-dot" style={{ background: ws?.color ?? '#64748b' }} />
                  <div className="crm-row-main">
                    <div className="crm-row-name">{c.name}</div>
                    <div className="crm-row-sub muted">{c.company || c.email || '—'}</div>
                  </div>
                  <span
                    className="crm-stage"
                    style={{ color: stage.color, borderColor: stage.color }}
                  >
                    {stage.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      <div className="crm-detail-col">
        {selected ? (
          <ContactDetail
            key={selected.id}
            contact={selected}
            workspaces={workspaces}
            onChanged={onChanged}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className="crm-detail-empty">
            <div className="placeholder-icon">👥</div>
            <p className="muted">Select a contact, or add a new one.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ContactDetail({
  contact,
  workspaces,
  onChanged,
  onDeleted
}: {
  contact: Contact
  workspaces: Workspace[]
  onChanged: () => Promise<void>
  onDeleted: () => void
}): JSX.Element {
  const [name, setName] = useState(contact.name)
  const [email, setEmail] = useState(contact.email)
  const [phone, setPhone] = useState(contact.phone)
  const [company, setCompany] = useState(contact.company)
  const [title, setTitle] = useState(contact.title)
  const [notes, setNotes] = useState(contact.notes)
  const [tagsText, setTagsText] = useState(contact.tags.join(', '))
  const [logKind, setLogKind] = useState<InteractionKind>('note')
  const [logNote, setLogNote] = useState('')

  const save = async (patch: ContactPatch): Promise<void> => {
    await window.api.updateContact(contact.id, patch)
    await onChanged()
  }

  const addLog = async (): Promise<void> => {
    if (!logNote.trim()) return
    await window.api.addInteraction(contact.id, { kind: logKind, note: logNote.trim() })
    setLogNote('')
    await onChanged()
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(`Delete ${contact.name}? This can't be undone.`)) return
    await window.api.deleteContact(contact.id)
    onDeleted()
    await onChanged()
  }

  const log = [...contact.interactions].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="crm-detail">
      <div className="crm-detail-head">
        <input
          className="crm-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== contact.name && save({ name: name.trim() || 'Unnamed contact' })}
        />
        <button className="btn btn-danger-ghost btn-sm" onClick={remove}>
          Delete
        </button>
      </div>

      <div className="crm-fields">
        <div className="field-row">
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => save({ email })} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => save({ phone })} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={() => save({ company })} />
          </label>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => save({ title })} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Workspace</span>
            <select value={contact.workspaceId} onChange={(e) => save({ workspaceId: e.target.value })}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Stage</span>
            <select
              value={contact.stage}
              onChange={(e) => save({ stage: e.target.value as ContactStage })}
            >
              {CONTACT_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Tags (comma-separated)</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            onBlur={() =>
              save({ tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean) })
            }
          />
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => save({ notes })} />
        </label>
      </div>

      <div className="crm-log-section">
        <div className="crm-log-head">Interaction log</div>
        <div className="crm-log-add">
          <select value={logKind} onChange={(e) => setLogKind(e.target.value as InteractionKind)}>
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
          </select>
          <input
            className="crm-log-input"
            placeholder="What happened?"
            value={logNote}
            onChange={(e) => setLogNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addLog()
            }}
          />
          <button className="btn btn-sm" onClick={addLog} disabled={!logNote.trim()}>
            Log
          </button>
        </div>

        {log.length === 0 ? (
          <div className="crm-empty">No interactions logged yet.</div>
        ) : (
          <ul className="crm-log">
            {log.map((it) => (
              <li key={it.id} className="crm-log-item">
                <span className="crm-log-kind">{KIND_ICON[it.kind]}</span>
                <div className="crm-log-body">
                  <div className="crm-log-note">{it.note}</div>
                  <div className="crm-log-when muted">{formatWhen(it.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const KIND_ICON: Record<InteractionKind, string> = {
  note: '📝',
  call: '📞',
  email: '✉️',
  meeting: '🤝'
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
