import type { OrganizerApi } from './index'

declare global {
  interface Window {
    api: OrganizerApi
  }
}

export {}
