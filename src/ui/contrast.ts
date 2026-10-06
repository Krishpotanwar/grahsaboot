const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export function luminance(hex: string): number {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(n.slice(i, i + 2), 16) / 255))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

export function readThemeTokens(css: string): Record<'dark' | 'light', Record<string, string>> {
  const out = { dark: {}, light: {} } as Record<'dark' | 'light', Record<string, string>>
  for (const m of css.matchAll(/\[data-theme='(dark|light)'\]\s*\{([^}]*)\}/g)) {
    // ??=: first definition wins; the @media print block reuses these selectors and must not shadow the theme
    for (const v of m[2]!.matchAll(/--gs-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g))
      out[m[1] as 'dark' | 'light'][v[1]!] ??= v[2]!
  }
  return out
}
