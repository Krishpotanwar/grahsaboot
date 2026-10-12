// What a person agreed to before their first save (the 18+ confirmation and the notice). Pure: the dialog and SaveBar use it,
// and the tests read the order of its steps without a DOM. The key is read only here, inside src/accounts/.

/** The notice the agreement is for. The server stores it as `consent:<version>` (record_consent). */
export const CONSENT_VERSION = 'v1'

/** One key per user: the next person to sign in on this browser has not agreed (E9). */
export const consentKey = (userId: string) => `gs-consent:${userId}`

/** A storage that cannot be read is "not agreed": the person is asked again, never skipped. */
export function hasConsent(userId: string, store: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return store.getItem(consentKey(userId)) === CONSENT_VERSION
  } catch {
    return false
  }
}

/**
 * Records the agreement on the server FIRST and writes the local key only after that succeeded, so a refused or lost call is
 * never remembered as an agreement (E9). `record` throws when the server did not record it, and so does this: nothing is
 * stored then. A storage that cannot be written is not an error: the server holds the agreement and the person is asked once more.
 */
export async function giveConsent(
  userId: string,
  record: (version: string) => Promise<void>,
  store: Pick<Storage, 'setItem'> = localStorage,
): Promise<void> {
  await record(CONSENT_VERSION)
  try {
    store.setItem(consentKey(userId), CONSENT_VERSION)
  } catch {
    // the server has it
  }
}
