/** Escape dei caratteri jolly di LIKE (%, _, [) per ricerche "contiene". */
export function likeEscape(s: string) {
  return s.replace(/[[%_]/g, (c) => `[${c}]`)
}

/** Termini di ricerca separati da spazi (tutti devono comparire, come nel vecchio ServerProcessing). */
export function termini(search: string | null | undefined, max = 6): string[] {
  return (search || '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, max)
}
