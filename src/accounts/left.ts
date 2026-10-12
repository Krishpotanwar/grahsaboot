// What has left this browser (signed out, or deleted), so a save that was already running does not bring it back: its final
// updates would write the copy into the store again, and a 401 after sign-out would send the person who just left to Google.
// Module state, not React state: the run outlives the component that started it.

let epoch = 0
const gone = new Set<string>()

/** The person has signed out, or the account is deleted: every run started before now must stand down. */
export const left = (): void => void epoch++
/** One investigation was deleted here: runs for it stand down. */
export const forget = (localId: string): void => void gone.add(localId)
/** A run records `epoch` and its investigation's local id when it starts; this says whether it may still write. */
export const mark = (): number => epoch
export const stale = (since: number, localId: string): boolean => epoch !== since || gone.has(localId)
