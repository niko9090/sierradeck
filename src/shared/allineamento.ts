import type { CasaChat, CaseChat } from './una-casa'

/**
 * L'allineamento dei PC alle scelte (0.58.0, tappa 2).
 *
 * **Lo stato voluto** di ogni progetto: residente su un PC, solo cloud sugli
 * altri. Si salva dove sta già `case-chat`, con la chiave `progetto:<id>`: così
 * viaggia, si unisce e si risolve come le case delle chat (`unisciCase`), e i
 * PC vecchi lo portano avanti senza saperlo (per loro è una «chat» che non
 * hanno mai). Nessuno schema nuovo.
 *
 * **Il piano** di un PC: a ogni giro confronta lo stato voluto con il suo disco.
 * - è il residente e il progetto qui non c'è → «porta qui» (da solo solo se
 *   la cartella non esiste affatto: non sovrascrive niente; altrimenti chiede);
 * - non è il residente e il progetto qui c'è → «solo cloud»: in questa tappa
 *   **si mostra e basta**. Toglierlo davvero (analisi, recupero, conferma,
 *   cartella di recupero) è la tappa 3.
 * Il piano non contiene mai azioni distruttive, e non tocca mai cartelle che
 * non siano quelle registrate del progetto.
 */

export const PREFISSO_PROGETTO = 'progetto:'
export function chiaveProgetto(id: string): string { return `${PREFISSO_PROGETTO}${id}` }
export function eChiaveProgetto(k: string): boolean { return k.startsWith(PREFISSO_PROGETTO) }

/** Il residente voluto di un progetto, se c'è. */
export function casaProgetto(cc: CaseChat, id: string): CasaChat | undefined {
  return cc.case[chiaveProgetto(id)]
}

/** La scelta di Nicholas per un progetto, come voce di `case-chat`. */
export function sceltaProgetto(p: { id: string; nome: string; pc: { id: string; nome: string }; chi: { id: string; nome: string }; quando: string }): Record<string, CasaChat> {
  return {
    [chiaveProgetto(p.id)]: {
      pc: p.pc.id, pcNome: p.pc.nome, decisaIl: p.quando, da: 'nicholas', sceltaDa: p.chi.id,
      motivo: `progetto «${p.nome}»: residente ${p.pc.nome}, solo cloud sugli altri PC (scelta di Nicholas da ${p.chi.nome}, ${p.quando.slice(0, 16).replace('T', ' ')})`
    }
  }
}

export type AzionePiano =
  | { tipo: 'porta-qui'; progetto: string; nome: string; automatica: boolean; perche: string }
  | { tipo: 'solo-cloud'; progetto: string; nome: string; percorso: string; residente: string; perche: string }

export type PianoAllineamento = {
  azioni: AzionePiano[]
  /** Progetti senza uno stato voluto: nessuna azione, si dice quanti sono. */
  senzaScelta: number
}

/**
 * Una cartella che un piano può nominare: assoluta, non la radice di un disco,
 * non la cartella dell'utente né una che la contiene. Un progetto registrato
 * male (`C:\`, il profilo) non entra mai in un piano.
 */
export function cartellaDiProgettoValida(percorso: string, home: string): boolean {
  const p = percorso.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const h = home.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  if (!/^[a-z]:\\[^\\]/.test(p) && !p.startsWith('\\\\')) return false
  if (/^[a-z]:$/.test(p)) return false
  if (h !== '' && (p === h || h.startsWith(`${p}\\`))) return false
  return true
}

export function pianoAllineamento(p: {
  io: string
  case: CaseChat
  progetti: { id: string; nome: string; percorsi: Record<string, string> }[]
  /** Se una cartella esiste su questo PC. */
  esiste: (percorso: string) => boolean
  home: string
}): PianoAllineamento {
  const azioni: AzionePiano[] = []
  let senzaScelta = 0
  for (const g of p.progetti) {
    const voluto = casaProgetto(p.case, g.id)
    if (voluto === undefined) { senzaScelta += 1; continue }
    const mio = g.percorsi[p.io]
    const quiValido = mio !== undefined && cartellaDiProgettoValida(mio, p.home)
    const quiC = quiValido && p.esiste(mio as string)
    if (voluto.pc === p.io) {
      if (quiC) continue
      // La cartella c'è ma non è registrata come valida, o c'è altro al suo posto: si chiede.
      const automatica = mio === undefined || (quiValido && !p.esiste(mio))
      azioni.push({
        tipo: 'porta-qui', progetto: g.id, nome: g.nome, automatica,
        perche: automatica
          ? `Questo PC è il residente di «${g.nome}», ma qui il progetto non c’è: lo porto giù dal Drive in una cartella nuova, senza sovrascrivere niente.`
          : `Questo PC è il residente di «${g.nome}», ma la sua cartella qui non è utilizzabile (${mio ?? 'nessuna'}): scegli tu dove portarlo.`
      })
      continue
    }
    if (quiC) {
      azioni.push({
        tipo: 'solo-cloud', progetto: g.id, nome: g.nome, percorso: mio as string, residente: voluto.pcNome,
        perche: `Il residente di «${g.nome}» è ${voluto.pcNome}: qui dovrebbe essere solo cloud. La copia di qui (${mio}) per ora resta dov’è: toglierla passa da un controllo che recupera prima quello che c’è solo qui, e da una tua conferma.`
      })
    }
  }
  return { azioni, senzaScelta }
}

/** Una riga per il registro quando il piano cambia (vuota se non c'è niente da fare). */
export function rigaPiano(piano: PianoAllineamento): string {
  if (piano.azioni.length === 0) return ''
  const porta = piano.azioni.filter((a) => a.tipo === 'porta-qui').map((a) => `«${a.nome}»${a.tipo === 'porta-qui' && a.automatica ? '' : ' (da confermare)'}`)
  const cloud = piano.azioni.filter((a) => a.tipo === 'solo-cloud').map((a) => `«${a.nome}»`)
  return [porta.length > 0 ? `da portare qui ${porta.join(', ')}` : '', cloud.length > 0 ? `da rendere solo cloud ${cloud.join(', ')} (solo mostrato: nessuna rimozione)` : ''].filter((x) => x !== '').join('; ')
}
