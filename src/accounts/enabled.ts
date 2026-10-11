/**
 * The ONE accounts switch. On only when all three are set at BUILD time; anything else is the dormant build.
 * Vite replaces each `import.meta.env.VITE_*` MEMBER read with a literal, so here `ON` is a constant and the import() below
 * is dropped before chunking: a dormant dist holds no accounts or Supabase bytes (scripts/check-bundle.ts proves it).
 * Keep the import() IN THIS FILE: an exported boolean tested in another module still emits the chunk (measured on
 * rolldown 1.2.12). Never read `import.meta.env` as a whole object here, and never import src/accounts/* anywhere else.
 */
const ON =
  import.meta.env.VITE_ACCOUNTS === '1' &&
  !!import.meta.env.VITE_SUPABASE_URL &&
  !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const loadAccounts = ON ? () => import('./index.ts') : null
