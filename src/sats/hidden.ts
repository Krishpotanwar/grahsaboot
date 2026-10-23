export const SATS_HIDDEN_KEY = 'gs-sats-hidden'

/** Whether the person hid the satellites. Storage may be missing or blocked: then they show, as for everyone who has not chosen. */
export function readSatsHidden(): boolean {
  try {
    return localStorage.getItem(SATS_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export function writeSatsHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(SATS_HIDDEN_KEY, '1')
    else localStorage.removeItem(SATS_HIDDEN_KEY)
  } catch {
    /* never required: the choice is then forgotten with the page */
  }
}
