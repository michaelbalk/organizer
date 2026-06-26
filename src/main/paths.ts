import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

let cached: string | null = null

/**
 * Resolves the data directory used by the file-backed store and token store.
 * The Electron entrypoint sets ORGANIZER_DATA_DIR to its userData folder; the
 * web server sets it to a persistent disk path. Kept free of any Electron import
 * so these modules run unchanged in a plain Node (server) context.
 */
export function dataDir(): string {
  if (cached) return cached
  const base = process.env.ORGANIZER_DATA_DIR || join(homedir(), '.organizer', 'data')
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  cached = base
  return base
}
