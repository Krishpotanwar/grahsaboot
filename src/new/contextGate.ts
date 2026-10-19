import { lazy } from 'react'

/**
 * The one place the satellite switch (ContextToggle.tsx, and with it everything under src/context) is loaded from. A MEMBER read
 * of `import.meta.env.VITE_CONTEXT_IMAGERY` is replaced by Vite with a literal, so a build made with VITE_CONTEXT_IMAGERY=0
 * folds `ON` and the import() away before chunking: that build holds none of it (the same arrangement as src/accounts/enabled.ts;
 * keep the import() IN THIS FILE, an exported flag tested elsewhere still emits the chunk).
 */
const ON = import.meta.env.VITE_CONTEXT_IMAGERY !== '0'
export const LazyContextToggle = ON ? lazy(() => import('./ContextToggle.tsx')) : null
