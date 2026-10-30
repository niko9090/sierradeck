/**
 * Il menu dei workspace (0.82.0), uguale su PC, pagina e app: le regole pure.
 *
 * In cima una ricerca per nome; sotto i gruppi «Recenti» e uno per PC (prima
 * questo, poi gli altri); le azioni di ogni workspace dietro «⋯». La tendina
 * sta sempre dentro lo schermo: altezza massima, scorrimento interno, e
 * vicino ai bordi si sposta o si apre sopra il tasto.
 *
 * `gruppiMenuWorkspace` e `postoTendina` finiscono anche nella pagina con
 * `toString()`: per questo non chiamano altre funzioni del modulo.
 * L'app Android ha la stessa regola in `MenuWorkspace.kt`.
 */

/** Quanti workspace al massimo in «Recenti». */
export const RECENTI_MAX = 5

/** Senza accenti e maiuscole: «Dèsk» trova «desk». */
export function pianoNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** I nomi che contengono il testo cercato, nell'ordine di sempre; con testo vuoto, tutti. */
export function filtraWorkspace(nomi: string[], filtro: string): string[] {
  const f = pianoNome(filtro.trim())
  if (f === '') return nomi
  return nomi.filter((n) => pianoNome(n).includes(f))
}

/** `nome` in cima ai recenti, senza doppioni, al massimo `max`. */
export function ricordaRecente(recenti: readonly string[], nome: string, max = RECENTI_MAX): string[] {
  if (nome === '') return recenti.slice(0, max)
  return [nome, ...recenti.filter((r) => r !== nome)].slice(0, max)
}

/** Un nome cambiato resta al suo posto fra i recenti. */
export function rinominaRecente(recenti: readonly string[], vecchio: string, nuovo: string): string[] {
  return recenti.filter((r) => r !== nuovo || r === vecchio).map((r) => (r === vecchio ? nuovo : r))
}

/** I recenti come stanno sul disco: solo stringhe non vuote, senza doppioni, al massimo `RECENTI_MAX`. */
export function recentiValidi(x: unknown): string[] {
  if (!Array.isArray(x)) return []
  const visti: string[] = []
  for (const v of x) {
    if (typeof v === 'string' && v.trim() !== '' && !visti.includes(v)) visti.push(v)
    if (visti.length >= RECENTI_MAX) break
  }
  return visti
}

/** Una riga del menu: un workspace di questo PC o di un altro. */
export type VoceMenuWs = { nome: string; qui: boolean; pc?: { id: string; nome: string } }
export type GruppoMenuWs = { chiave: string; titolo: string; voci: VoceMenuWs[] }

/**
 * I gruppi del menu, già filtrati dalla ricerca.
 *
 * «Recenti»: dove sei, poi gli ultimi in cui sei andato (al massimo
 * `RECENTI_MAX`). Poi «Questo PC» con tutti gli altri, nell'ordine di sempre,
 * e un gruppo per ogni altro PC con i suoi workspace che qui non ci sono. Un
 * workspace compare una volta sola. Con pochi workspace (non più di
 * `RECENTI_MAX`) «Recenti» non c'è: un gruppo solo.
 */
export function gruppiMenuWorkspace(p: {
  nomi: readonly string[]
  attivo: string
  recenti?: readonly string[] | undefined
  filtro?: string | undefined
  nomePc?: string | undefined
  altrove?: readonly { pc: string; nome: string; workspace: readonly string[] }[] | undefined
  max?: number | undefined
}): GruppoMenuWs[] {
  const piano = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const f = piano((p.filtro ?? '').trim())
  const passa = (n: string): boolean => f === '' || piano(n).includes(f)
  const max = p.max ?? 5
  const recenti: string[] = []
  for (const n of [p.attivo, ...(p.recenti ?? [])]) {
    if (recenti.length >= max) break
    if (n !== '' && p.nomi.includes(n) && !recenti.includes(n)) recenti.push(n)
  }
  // «Recenti» serve quando l'elenco è lungo: con pochi workspace sarebbe lo stesso elenco spezzato in due.
  const conRecenti = p.nomi.length > max && recenti.length > 0
  const restanti = conRecenti ? p.nomi.filter((n) => !recenti.includes(n)) : [...p.nomi]
  const gruppi: GruppoMenuWs[] = []
  const voci = (nomi: readonly string[]): VoceMenuWs[] => nomi.filter(passa).map((nome) => ({ nome, qui: true }))
  if (conRecenti) gruppi.push({ chiave: 'recenti', titolo: 'Recenti', voci: voci(recenti) })
  gruppi.push({ chiave: 'qui', titolo: p.nomePc !== undefined && p.nomePc !== '' ? `Questo PC · ${p.nomePc}` : 'Questo PC', voci: voci(restanti) })
  for (const a of p.altrove ?? []) {
    const suoi = a.workspace.filter((n) => passa(n) && !p.nomi.includes(n))
    gruppi.push({ chiave: `pc:${a.pc}`, titolo: a.nome, voci: suoi.map((nome) => ({ nome, qui: false, pc: { id: a.pc, nome: a.nome } })) })
  }
  return gruppi.filter((g) => g.voci.length > 0)
}

/** Tutte le righe dei gruppi, in fila: è l'ordine delle frecce ↑↓. */
export function vociInFila(gruppi: readonly GruppoMenuWs[]): VoceMenuWs[] {
  return gruppi.flatMap((g) => g.voci)
}

export type AzioneMenuWs = 'apri' | 'rinomina' | 'cartella' | 'elimina' | 'portaQui'
export type VoceAzioneWs = { azione: AzioneMenuWs; etichetta: string; spiega: string; spenta?: string; pericolo?: boolean }

/**
 * Cosa c'è dietro «⋯» di una riga. Un workspace di questo PC: apri,
 * rinomina, Apri cartella, Elimina (un progetto cambia PC solo con «Sposta su
 * questo PC», dal pannello Progetti: 0.88.0). Uno di
 * un altro PC: apri dal vivo e Porta qui, come prima.
 */
export function azioniMenuWorkspace(v: VoceMenuWs, p: { attivo: string; quanti: number; cartella?: boolean }): VoceAzioneWs[] {
  if (!v.qui) {
    const pc = v.pc?.nome ?? 'l’altro PC'
    return [
      { azione: 'apri', etichetta: 'Apri', spiega: `Apre qui «${v.nome}»: le sue chat dal vivo su ${pc}, dove continuano a girare. Su ${pc} non cambia niente.` },
      { azione: 'portaQui', etichetta: 'Porta qui', spiega: `Porta qui «${v.nome}» con le sue chat (le copia dal Drive). Su ${pc} non cambia niente.` }
    ]
  }
  const davanti = v.nome === p.attivo
  return [
    { azione: 'apri', etichetta: davanti ? 'Sei qui' : 'Apri', spiega: davanti ? `«${v.nome}» è già davanti.` : `Passa a «${v.nome}». Le chat che lasci continuano a lavorare.`, ...(davanti ? { spenta: `«${v.nome}» è già davanti` } : {}) },
    { azione: 'rinomina', etichetta: 'Rinomina…', spiega: 'Cambia solo il nome: le chat restano dove sono.' },
    ...(p.cartella !== false ? [{ azione: 'cartella' as const, etichetta: 'Apri cartella', spiega: 'Apre la cartella del progetto di questo workspace.' }] : []),
    {
      azione: 'elimina', etichetta: 'Elimina…', pericolo: true,
      spiega: 'Lo toglie dalla fascia; resta 30 giorni in «Eliminati», con «Ripristina».',
      ...(p.quanti <= 1 ? { spenta: 'L’ultimo workspace non si può eliminare: non resterebbe dove salvare il layout.' } : {})
    }
  ]
}

export type Rettangolo = { top: number; bottom: number; left: number; right: number }
export type PostoTendina = { top: number; left: number; larghezza: number; altezzaMax: number; sopra: boolean }

/**
 * Dove mettere una tendina attaccata a un tasto, sempre dentro la finestra.
 *
 * Sotto il tasto, allineata a sinistra; se a destra non c'è posto si sposta a
 * sinistra; se sotto non ci sta e sopra c'è più spazio, si apre sopra.
 * L'altezza massima è lo spazio che resta: dentro, l'elenco scorre. Con una
 * finestra più stretta della tendina, la tendina si stringe.
 */
export function postoTendina(p: {
  ancora: Rettangolo
  finestra: { larghezza: number; altezza: number }
  larghezza: number
  /** L'altezza che vorrebbe (tutto il contenuto). */
  altezza?: number
  margine?: number
  /** Allineata al bordo destro del tasto invece che al sinistro (il menu «⋯»). */
  aDestra?: boolean
}): PostoTendina {
  const m = p.margine ?? 8
  const W = Math.max(0, p.finestra.larghezza)
  const H = Math.max(0, p.finestra.altezza)
  const larghezza = Math.max(0, Math.min(p.larghezza, W - 2 * m))
  const voluta = p.aDestra === true ? p.ancora.right - larghezza : p.ancora.left
  const left = Math.max(m, Math.min(voluta, W - larghezza - m))
  // Un tasto mezzo fuori dalla finestra non porta la tendina fuori con sé.
  const alto = Math.min(Math.max(p.ancora.top, m), H - m)
  const basso = Math.min(Math.max(p.ancora.bottom, m), H - m)
  const sotto = H - basso - 4 - m
  const sopraSpazio = alto - 4 - m
  const serve = p.altezza ?? Number.POSITIVE_INFINITY
  // Sopra solo se sotto non ci sta e sopra c'è più posto: con 240 px sotto
  // un elenco lungo si apre lo stesso sotto, e scorre.
  const sopra = sotto < Math.min(serve, 240) && sopraSpazio > sotto
  const spazio = Math.max(0, sopra ? sopraSpazio : sotto)
  const altezzaMax = Math.min(spazio, serve)
  const top = sopra
    ? Math.max(m, alto - 4 - altezzaMax)
    : Math.min(Math.max(m, basso + 4), Math.max(m, H - m - altezzaMax))
  return { top, left, larghezza, altezzaMax, sopra }
}
