import { stato, peggiore, type StatoVista } from './stato-vista'

/**
 * La schermata principale (0.70.0): lo stato di ogni chat in una parola, sulla
 * testata del riquadro, nella pagina e nell'app. Prima una chat che aspettava
 * una risposta e una ferma sul prompt erano lo stesso riquadro con sei icone.
 */

/** Dal più importante: quello che chiede te vince su tutto. */
export const ORDINE_CHAT = ['aspetta', 'errore', 'al-lavoro', 'autopilota', 'ferma', 'dorme', 'altrove'] as const

export function statoChat(c: {
  /** Ferma su una domanda o una scelta. */
  chiede?: boolean
  /** Ferma per un errore dell'API. */
  errore?: string
  /** Da lì sta arrivando qualcosa adesso. */
  lavora?: boolean
  /** Un autopilota la guida. */
  governata?: boolean
  dorme?: boolean
  /** Gira su un altro PC: si guarda dal vivo. */
  altrove?: string
}): StatoVista {
  if (c.chiede === true) return stato('aspetta', 'aspetta te', 'ambra')
  if (c.errore !== undefined && c.errore !== '') return stato('errore', 'errore', 'rosso', c.errore)
  if (c.lavora === true) return c.governata === true ? stato('autopilota', 'autopilota', 'blu', 'la guida un autopilota') : stato('al-lavoro', 'al lavoro', 'verde')
  if (c.dorme === true) return stato('dorme', 'dorme', 'quieto')
  if (c.governata === true) return stato('autopilota', 'autopilota', 'blu', 'la guida un autopilota')
  if (c.altrove !== undefined && c.altrove !== '') return stato('altrove', `su ${c.altrove}`, 'quieto')
  return stato('ferma', 'ferma', 'quieto')
}

/** Il peggiore di un workspace, e quante chat sono in quello stato: «● 3» sulla linguetta. */
export function riassuntoWorkspace(stati: StatoVista[]): { stato?: StatoVista; numero: number } {
  const p = peggiore(stati, ORDINE_CHAT)
  if (p === undefined) return { numero: 0 }
  return { stato: p, numero: stati.filter((s) => s.id === p.id).length }
}

/**
 * Nomi distinti da mostrare: tre chat «Lavoro-esempio» nello stesso workspace
 * diventano «Lavoro-esempio», «Lavoro-esempio #2», «Lavoro-esempio #3». Solo
 * da mostrare: il nome salvato non cambia.
 */
export function nomiDistinti(chat: { id: string; titolo: string }[]): Map<string, string> {
  const visti = new Map<string, number>()
  const fuori = new Map<string, string>()
  for (const c of chat) {
    const n = (visti.get(c.titolo) ?? 0) + 1
    visti.set(c.titolo, n)
    fuori.set(c.id, n === 1 ? c.titolo : `${c.titolo} #${n}`)
  }
  return fuori
}

/** Le righe d'aiuto di Claude Code che non dicono niente su cosa fa la chat. */
const PIEDI = [/enter to confirm/i, /esc to (cancel|interrupt)/i, /^\?\s*for shortcuts/i, /bypass permissions on/i, /shift\+tab to cycle/i, /^[─━\-=_\s>❯›]+$/, /ctrl\+[a-z] to/i]

/** L'ultima riga che dice qualcosa: senza i piedi di Claude Code. */
export function rigaUtile(righe: string[]): string {
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const r = (righe[i] ?? '').replace(/\s+/g, ' ').trim()
    if (r === '' || PIEDI.some((p) => p.test(r))) continue
    return r.slice(0, 140)
  }
  return ''
}

/** La spia dell'aggiornamento in una parola, o niente quando non c'è niente da dire. */
export function statoAggiornamento(a: { fase?: string; versione?: string; percento?: number } | undefined): StatoVista | undefined {
  switch (a?.fase) {
    case 'disponibile': return stato('nuova', `c'è la ${a.versione ?? 'nuova'}`, 'blu')
    case 'scarico': return stato('scarico', `scarico ${a.percento ?? 0}%`, 'blu')
    case 'pronto': return stato('pronta', 'pronta da installare', 'verde')
    case 'installo': return stato('installo', 'installo…', 'blu')
    case 'errore': return stato('errore', 'non riuscito', 'rosso')
    default: return undefined
  }
}

/** I gruppi della pagina e dell'app: prima chi aspetta te, poi chi lavora, poi le altre. */
export function gruppoChat(s: StatoVista): 'aspettano' | 'lavorano' | 'altre' {
  if (s.id === 'aspetta' || s.id === 'errore') return 'aspettano'
  if (s.id === 'al-lavoro' || s.id === 'autopilota') return 'lavorano'
  return 'altre'
}
