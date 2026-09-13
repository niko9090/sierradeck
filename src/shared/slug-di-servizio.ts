/**
 * Le cartelle di trascrizioni che **non sono chat di una persona**.
 *
 * Il plugin claude-mem tiene le sue sessioni «observer» in
 * `~/.claude-mem/observer-sessions`, e Claude Code le archivia come un
 * progetto qualunque (slug `C--Users-nikof--claude-mem-observer-sessions`):
 * sul fisso erano 621 voci nell'elenco Chat, viaggiavano sul Drive come
 * chat, e non si aprivano in modo utile.
 *
 * L'elenco e' esplicito e non un'euristica sui trattini: la forma slug e' a
 * perdita (`_`, `-`, `.` e spazio diventano tutti `-`), e un'euristica
 * prenderebbe anche cartelle vere di qualcuno. Lo stesso predicato vale per
 * l'indice (scanner), per la raccolta che sale sul Drive, per l'arrivo, il
 * ripristino, il catalogo e la fusione: escluderle in un punto solo le
 * farebbe vedere come «solo sul Drive» e riscaricare a ogni giro.
 */
const DI_SERVIZIO = [/--claude-mem-observer-sessions$/i]

/** Vero se lo slug (il nome della cartella in `~/.claude/projects`) e' di uno strumento, non di una persona. */
export function eSlugDiServizio(slug: string): boolean {
  return DI_SERVIZIO.some((r) => r.test(slug))
}

/** Vero se un percorso del Drive (`chat/<slug>/<uuid>.jsonl`) o relativo (`<slug>/<uuid>.jsonl`) sta sotto uno slug di servizio. */
export function ePercorsoDiServizio(percorso: string): boolean {
  const parti = percorso.split('/')
  // `chat/<slug>/<file>` oppure `<slug>/<file>`: lo slug e' il penultimo pezzo.
  const slug = parti.length >= 2 ? parti[parti.length - 2] : undefined
  return slug !== undefined && eSlugDiServizio(slug)
}
