const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => MAP[c]!)
/** JSON safe to embed in <script type="application/json">: no `<` can close the element. */
export const jsonForHtml = (v: unknown) =>
  JSON.stringify(v, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
