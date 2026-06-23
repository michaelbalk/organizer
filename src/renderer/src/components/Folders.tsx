import { useCallback, useEffect, useState } from 'react'
import type { Account, FolderMeta } from '@shared/types'

interface Props {
  /** Local color/note metadata, keyed by folder name. */
  folderMeta: FolderMeta[]
  accounts: Account[]
  /** Refresh the app's persisted state after a metadata change. */
  onChanged: () => Promise<void>
  /** Open this folder's emails in the Inbox. */
  onOpenFolder: (name: string) => void
}

const DEFAULT_COLOR = '#64748b'

/** Folder (Gmail label) manager: create, rename, recolor, annotate, delete. */
export function Folders({ folderMeta, accounts, onChanged, onOpenFolder }: Props): JSX.Element {
  const [names, setNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#2563eb')
  const [creating, setCreating] = useState(false)

  const connected = accounts.filter((a) => a.provider === 'google' && a.connected)

  const metaFor = useCallback(
    (name: string): FolderMeta =>
      folderMeta.find((f) => f.name === name) ?? { name, color: DEFAULT_COLOR, note: '' },
    [folderMeta]
  )

  const loadNames = useCallback(async () => {
    setLoading(true)
    try {
      setNames(await window.api.listFolders())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load folders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected.length > 0) loadNames()
    else setLoading(false)
  }, [connected.length, loadNames])

  const create = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      await window.api.createFolder(name, newColor)
      setNewName('')
      await Promise.all([loadNames(), onChanged()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder')
    } finally {
      setCreating(false)
    }
  }

  const rename = async (oldName: string, next: string): Promise<void> => {
    const trimmed = next.trim()
    if (!trimmed || trimmed === oldName) return
    try {
      await window.api.renameFolder(oldName, trimmed)
      await Promise.all([loadNames(), onChanged()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename folder')
    }
  }

  const recolor = async (name: string, color: string): Promise<void> => {
    await window.api.updateFolderMeta(name, { color })
    await onChanged()
  }

  const setNote = async (name: string, note: string): Promise<void> => {
    await window.api.updateFolderMeta(name, { note })
    await onChanged()
  }

  const remove = async (name: string): Promise<void> => {
    if (!window.confirm(`Delete the folder “${name}”?\n\nEmails are kept — they just lose this label.`)) {
      return
    }
    try {
      await window.api.deleteFolder(name)
      await Promise.all([loadNames(), onChanged()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete folder')
    }
  }

  if (connected.length === 0) {
    return (
      <div className="placeholder">
        <div className="placeholder-icon">🗂️</div>
        <h2>Connect an account to use folders</h2>
        <p>Folders are Gmail labels — connect a Google account in Settings first.</p>
      </div>
    )
  }

  return (
    <div className="folders-view">
      {error && <div className="banner banner-error">{error}</div>}

      <div className="folders-add">
        <input
          className="folder-add-color"
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          title="Folder color"
        />
        <input
          className="folder-add-name"
          placeholder="New folder name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
        />
        <button className="btn btn-primary" onClick={create} disabled={creating || !newName.trim()}>
          {creating ? 'Creating…' : '+ Add folder'}
        </button>
      </div>

      {loading ? (
        <div className="app-loading" style={{ height: 'auto', paddingTop: 40 }}>
          <div className="spinner" />
          <span>Loading folders…</span>
        </div>
      ) : names.length === 0 ? (
        <div className="folders-empty">No folders yet. Create one above to get started.</div>
      ) : (
        <ul className="folder-cards">
          {names.map((name) => (
            <FolderCard
              key={name}
              meta={metaFor(name)}
              onOpen={() => onOpenFolder(name)}
              onRename={(next) => rename(name, next)}
              onRecolor={(color) => recolor(name, color)}
              onNote={(note) => setNote(name, note)}
              onDelete={() => remove(name)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FolderCard({
  meta,
  onOpen,
  onRename,
  onRecolor,
  onNote,
  onDelete
}: {
  meta: FolderMeta
  onOpen: () => void
  onRename: (next: string) => void
  onRecolor: (color: string) => void
  onNote: (note: string) => void
  onDelete: () => void
}): JSX.Element {
  const [name, setName] = useState(meta.name)
  const [note, setNote] = useState(meta.note)

  // Keep local fields in sync if the folder list refreshes underneath us.
  useEffect(() => setName(meta.name), [meta.name])
  useEffect(() => setNote(meta.note), [meta.note])

  return (
    <li className="folder-card" style={{ borderLeftColor: meta.color }}>
      <div className="folder-card-top">
        <input
          className="folder-card-color"
          type="color"
          value={meta.color}
          onChange={(e) => onRecolor(e.target.value)}
          title="Folder color"
        />
        <input
          className="folder-card-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button className="btn btn-ghost btn-sm" onClick={onOpen} title="Open this folder's emails">
          ✉ Open
        </button>
        <button className="btn btn-danger-ghost btn-sm" onClick={onDelete}>
          Delete
        </button>
      </div>
      <input
        className="folder-card-note"
        placeholder="What's this folder for? (a note to your future self)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => onNote(note)}
      />
    </li>
  )
}
