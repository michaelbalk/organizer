import { OAuth2Client } from 'google-auth-library'
import type { Account } from '@shared/types'
import { getGoogleConfig } from '../config'
import { getStore } from '../store'
import { getTokenStore } from './tokenStore'
import { runGoogleAuthFlow } from './oauth'

/**
 * Launches the consent flow and links the resulting Google account to a
 * workspace. Re-connecting an already-known email refreshes its tokens in place
 * rather than creating a duplicate account.
 */
export async function connectGoogleAccount(workspaceId: string): Promise<Account> {
  const result = await runGoogleAuthFlow()
  const store = getStore()

  const existing = store
    .getData()
    .accounts.find((a) => a.provider === 'google' && a.email === result.email)

  const account = existing
    ? store.updateAccount(existing.id, { connected: true, displayName: result.name })!
    : store.addAccount({
        provider: 'google',
        email: result.email,
        displayName: result.name,
        workspaceId,
        connected: true
      })

  getTokenStore().save(account.id, result.credentials)
  return account
}

/** Revokes local tokens and marks the account disconnected (keeps the record). */
export function disconnectGoogleAccount(accountId: string): boolean {
  getTokenStore().remove(accountId)
  return getStore().updateAccount(accountId, { connected: false }) !== null
}

/** Fully removes the account and its tokens. */
export function removeGoogleAccount(accountId: string): boolean {
  getTokenStore().remove(accountId)
  return getStore().removeAccount(accountId)
}

/**
 * Returns an OAuth client primed with stored credentials and wired to persist
 * any silently-refreshed access tokens. Used by the Gmail/Calendar services
 * (Phase 2b/2c).
 */
export function getAuthorizedClient(accountId: string): OAuth2Client {
  const cfg = getGoogleConfig()
  if (!cfg) throw new Error('Google credentials are not configured.')

  const creds = getTokenStore().get(accountId)
  if (!creds) throw new Error('This account is not connected. Please sign in again.')

  const client = new OAuth2Client({ clientId: cfg.clientId, clientSecret: cfg.clientSecret })
  client.setCredentials(creds)

  client.on('tokens', (tokens) => {
    const current = getTokenStore().get(accountId) ?? {}
    getTokenStore().save(accountId, { ...current, ...tokens })
  })

  return client
}
