import type { FigureDef } from './run.ts'

/** The figure of prints.js, a plain script of the kernel's own shape: it reads the global HL that kernel.js sets. */
declare const figure: FigureDef & { means: string }
export default figure
