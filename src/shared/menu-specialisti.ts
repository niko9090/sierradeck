/**
 * **Il menu «Specialisti» nella chat dell'autopilota** (k-54, 06/11): la lista
 * d'attesa (`attesa-specialisti.ts`, con le stime di k-53) in una forma pronta
 * da disegnare, sul PC e sulla pagina del telefono. Funzioni pure.
 *
 * Come in `attesa-vista.ts`, le funzioni finiscono **scritte dentro lo script
 * della pagina** con `.toString()`: ognuna basta a se stessa (niente import,
 * niente chiamate fra loro, niente costanti di fuori, niente apici rovesciati
 * né barre rovesciate nelle stringhe). Le prove: `tests/shared/menu-specialisti.test.ts`.
 */

export type RigaMenuSpecialisti = {
  id: string
  titolo: string
  /** Da 0 a 95, solo per chi lavora. */
  percentuale?: number
  cosaFa: string
  /** «mancano circa 12 min», «attesa circa 20 min», o vuoto se non si sa. */
  manca: string
  inRitardo: boolean
  /** Il nome del workspace, solo se non è quello della chat; vuoto altrimenti. */
  altroWorkspace: string
  /** È del workspace della chat in cui si guarda il menu. */
  corrente: boolean
  /** Solo in fila: il posto, da 1. */
  posizione?: number
  /** Solo in fila: «tocca a lui», cioè il posto è già prenotato. */
  prenotata: boolean
  /** In fila ma fermato da Nicholas: riparte per primo. */
  parcheggiata: boolean
  /** Solo chi lavora: la fermata è già stata chiesta. */
  fermaRichiesta: boolean
}

export type MenuSpecialisti = {
  /** Il testo del tasto: «Specialisti 2 · 1 in fila». */
  etichetta: string
  lavorano: RigaMenuSpecialisti[]
  inFila: RigaMenuSpecialisti[]
  /** «circa 45 min per finire tutto», o vuoto. */
  totale: string
}

type VoceMenu = {
  id: string
  workspace: string
  compito?: string
  descrizione: string
  workspaceNome?: string
  titolo?: string
  cosaFa?: string
  percentuale?: number
  minutiStimati?: number
  inRitardo?: true
  posizione?: number
  prenotata?: boolean
  parcheggiata?: true
  fermaRichiesta?: true
}

export type VistaMenu = {
  alLavoro: VoceMenu[]
  inFila: VoceMenu[]
  totale?: { minuti: number; compiti: number }
}

/**
 * Costruisce il menu. `riferimenti` sono i modi in cui la chat chiama il suo
 * workspace (la chiave, la cartella): una voce è «corrente» se il suo
 * workspace coincide con uno di essi.
 */
export function menuSpecialisti(vista: VistaMenu, riferimenti: string[]): MenuSpecialisti {
  const norma = (t: string): string => String(t || '').replace(/\\/g, '/').replace(/\/+$/, '').replace(/^cartella:/, '').toLowerCase()
  const miei = riferimenti.filter((r) => r !== undefined && r !== '').map(norma)
  const nome = (ws: string): string => {
    const pezzi = String(ws || '').replace(/^cartella:/, '').replace(/[\\/]+$/, '').split(/[\\/]/)
    const u = pezzi[pezzi.length - 1]
    return u !== undefined && u !== '' ? u : 'senza nome'
  }
  const durata = (min: number): string => {
    const m = Math.max(1, Math.round(min))
    if (m < 60) return m + ' min'
    const h = Math.floor(m / 60)
    return h + ' h' + (m % 60 > 0 ? ' ' + (m % 60) + ' min' : '')
  }
  const corto = (t: string): string => {
    const s = String(t || '').replace(/\s+/g, ' ').trim()
    return s.length > 60 ? s.slice(0, 59).trimEnd() + '…' : s
  }
  const riga = (v: VoceMenu, inAttesa: boolean): RigaMenuSpecialisti => {
    const corrente = miei.indexOf(norma(v.workspace)) >= 0
    const base = v.titolo !== undefined && v.titolo !== '' ? v.titolo : (v.compito !== undefined ? v.compito + ': ' : '') + v.descrizione
    const r: RigaMenuSpecialisti = {
      id: v.id,
      titolo: corto(base),
      cosaFa: v.cosaFa !== undefined ? corto(v.cosaFa) : '',
      manca: v.minutiStimati === undefined ? '' : (inAttesa ? 'attesa circa ' : 'mancano circa ') + durata(v.minutiStimati),
      inRitardo: v.inRitardo === true,
      altroWorkspace: corrente ? '' : (v.workspaceNome !== undefined && v.workspaceNome !== '' ? v.workspaceNome : nome(v.workspace)),
      corrente,
      prenotata: v.prenotata === true,
      parcheggiata: v.parcheggiata === true,
      fermaRichiesta: v.fermaRichiesta === true
    }
    if (!inAttesa && v.percentuale !== undefined) r.percentuale = Math.max(0, Math.min(95, Math.round(v.percentuale)))
    if (inAttesa && v.posizione !== undefined) r.posizione = v.posizione
    return r
  }
  // Chi lavora: prima quelli di questa chat, poi gli altri. La fila resta com'è: il posto conta.
  const tutti = vista.alLavoro.map((v) => riga(v, false))
  const lavorano = tutti.filter((x) => x.corrente).concat(tutti.filter((x) => !x.corrente))
  const inFila = vista.inFila.map((v) => riga(v, true))
  const etichetta = lavorano.length === 0 && inFila.length === 0
    ? 'Specialisti · nessuno'
    : 'Specialisti ' + lavorano.length + (inFila.length > 0 ? ' · ' + inFila.length + ' in fila' : '')
  const totale = vista.totale !== undefined && vista.totale.compiti > 0 ? 'circa ' + durata(vista.totale.minuti) + ' per finire tutto' : ''
  return { etichetta, lavorano, inFila, totale }
}
