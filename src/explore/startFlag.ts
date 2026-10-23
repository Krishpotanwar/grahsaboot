// The in-app start flag (review answers D8 and R8): the time-lapse loads at once only for a person who pressed our own button on the
// home screen, because that button already says what it costs. A link, a reload or a new tab never comes through here (module
// state does not survive them), so each of them waits for a tap on Load. It lives in its own file so that the home screen can set
// it without importing the lazy Explore page, as GlobeScreen keeps `lastPlace`.

let armed: string | null = null

/** The home screen's button was pressed for the place with this key (`startKey`). */
export function armStart(key: string): void {
  armed = key
}

/** The button was pressed for this very place and the load has not started yet. Reading does not spend it: a screen may be drawn twice. */
export const isArmed = (key: string): boolean => armed === key

/** The load has started: going back to the page later waits for a tap. */
export function spendStart(): void {
  armed = null
}
