import { app, shell, BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { startBriefingScheduler } from './briefing'
import { startFollowUpScheduler } from './followups'
import { startReminders } from './reminders'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Organizer',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Open links in the system browser, never in-app. Only hand off safe schemes
  // (covers email-body links, which open via target="_blank" popups).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) {
      void shell.openExternal(url).catch((e) => console.error('openExternal failed:', e))
    }
    return { action: 'deny' }
  })

  // electron-vite injects the dev server URL in development.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Lets Windows show notifications under the app's name.
  if (process.platform === 'win32') app.setAppUserModelId('com.organizer.app')
  registerIpc()
  createWindow()
  startReminders()
  startBriefingScheduler((b) => {
    const n = new Notification({
      title: 'Morning briefing ready',
      body: `${b.topics.length} topic${b.topics.length === 1 ? '' : 's'} from ${b.emailCount} emails`
    })
    n.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
      win.webContents.send('open-briefing')
    })
    n.show()
  })
  startFollowUpScheduler((count) => {
    const n = new Notification({
      title: 'Follow-up tasks created',
      body: `${count} email${count === 1 ? '' : 's'} need follow-up — added to your board`
    })
    n.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
      win.webContents.send('open-board')
    })
    n.show()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
