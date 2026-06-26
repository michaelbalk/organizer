// Server startup checks. Loaded first by index.ts (before store/tokenStore init).
//
// Token encryption: the shared tokenStore automatically uses AES-256-GCM keyed by
// ORGANIZER_ENCRYPTION_KEY when no OS-keystore encryptor is injected — which is
// exactly the server case — so there is nothing to wire up here, only to verify.

if (!process.env.ORGANIZER_ENCRYPTION_KEY?.trim()) {
  console.warn(
    '[organizer] ORGANIZER_ENCRYPTION_KEY is not set — OAuth tokens will be stored UNENCRYPTED. ' +
      'Set a strong random value in production.'
  )
}

// ORGANIZER_DATA_DIR is read by paths.ts; it defaults to ~/.organizer/data when
// unset. On Render this should point at the mounted persistent disk.
if (!process.env.ORGANIZER_DATA_DIR?.trim()) {
  console.warn('[organizer] ORGANIZER_DATA_DIR is not set — using the default home directory path.')
}
