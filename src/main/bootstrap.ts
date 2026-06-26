import { app, safeStorage } from 'electron'
import { join } from 'path'
import { setEncryptor } from './google/tokenStore'

// Point the shared store/token-store at Electron's userData before they initialize.
process.env.ORGANIZER_DATA_DIR = process.env.ORGANIZER_DATA_DIR || join(app.getPath('userData'), 'data')

// Encrypt OAuth tokens at rest with the OS keystore (DPAPI on Windows, Keychain on macOS).
setEncryptor({
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64'))
})
