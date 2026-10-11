import type { CasaChat, CaseChat } from './una-casa'
import { casaDelGruppo, raggruppaProgetti, type MembroProgetto } from './progetti-unificati'

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

/**
 * Il piano, **per progetto unificato** (0.60.0: stesso nome = stesso
 * progetto). Il registro del 10/10: «SierraDeck» e un «Wdeck» erano
 * registrati solo con la cartella del portatile; reso residente questo PC, il
 * piano li vedeva «assenti» e partiva da solo «porta qui» — 661 file in una
 * cartella nuova accanto a quella vera. Adesso un progetto è qui se c'è una
 * cartella di **uno qualunque** dei suoi id, e una cartella di qui con lo
 * stesso nome (`trovate`) ferma l'automatico: la unisce «Rendi residente qui».
 */
export function pianoAllineamento(p: {
  io: string
  case: CaseChat
  progetti: MembroProgetto[]
  /** Se una cartella esiste su questo PC. */
  esiste: (percorso: string) => boolean
  home: string
  /** Per progetto (id principale del gruppo): una cartella di qui con lo stesso nome, non registrata. */
  trovate?: Record<string, string>
  /**
   * Gli id dei progetti con una cartella di questo PC nella cartella di
   * recupero (0.60.7). Toglierla vuol dire «qui no»: senza, il giro dopo il
   * residente la vedeva sparita e la riscaricava da solo (collaudo dell'11/10,
   * il progetto di prova tornato due minuti dopo). «Ripristina» toglie la voce
   * dal recupero, e con lei questo stop: lo stato torna quello di prima.
   */
  inRecupero?: ReadonlySet<string>
}): PianoAllineamento {
  const azioni: AzionePiano[] = []
  let senzaScelta = 0
  for (const g of raggruppaProgetti(p.progetti, p.case)) {
    const voluto = casaDelGruppo(p.case, g.ids)
    if (voluto === undefined) { senzaScelta += 1; continue }
    const mie = g.percorsi.filter((x) => x.pc === p.io).map((x) => x.percorso)
    const valide = mie.filter((m) => cartellaDiProgettoValida(m, p.home))
    const presente = valide.find((m) => p.esiste(m))
    const trovata = p.trovate?.[g.id]
    if (voluto.pc === p.io) {
      if (presente !== undefined) continue
      if (g.ids.some((id) => p.inRecupero?.has(id) === true)) {
        azioni.push({
          tipo: 'porta-qui', progetto: g.id, nome: g.nome, automatica: false,
          perche: `Questo PC è il residente di «${g.nome}», ma la sua cartella di qui è nella cartella di recupero: non la riscarico da solo. «Ripristina» la rimette dov’era; «Porta qui» la riscarica dal Drive.`
        })
        continue
      }
      if (trovata !== undefined) {
        azioni.push({
          tipo: 'porta-qui', progetto: g.id, nome: g.nome, automatica: false,
          perche: `Questo PC è il residente di «${g.nome}», e qui c’è già una cartella con lo stesso nome (${trovata}): non la riscarico accanto. «Unisci qui le copie» la confronta con le altre e ne fa una sola, con la tua conferma.`
        })
        continue
      }
      // Niente registrato qui, o registrato e sparito: si porta giù da solo. Altrimenti (cartella registrata male) si chiede.
      const automatica = mie.length === 0 || (valide.length === mie.length && valide.every((m) => !p.esiste(m)))
      azioni.push({
        tipo: 'porta-qui', progetto: g.id, nome: g.nome, automatica,
        perche: automatica
          ? `Questo PC è il residente di «${g.nome}», ma qui il progetto non c’è: lo porto giù dal Drive in una cartella nuova, senza sovrascrivere niente.`
          : `Questo PC è il residente di «${g.nome}», ma la sua cartella qui non è utilizzabile (${mie.join(', ')}): scegli tu dove portarlo.`
      })
      continue
    }
    if (presente !== undefined) {
      azioni.push({
        tipo: 'solo-cloud', progetto: g.id, nome: g.nome, percorso: presente, residente: voluto.pcNome,
        perche: `Il residente di «${g.nome}» è ${voluto.pcNome}: qui dovrebbe essere solo cloud. La copia di qui (${presente}) per ora resta dov’è: toglierla passa da un controllo che recupera prima quello che c’è solo qui, e da una tua conferma.`
      })
    }
  }
  return { azioni, senzaScelta }
}

/**
 * Un «porta qui» automatico non riuscito si riprova al giro dopo se il motivo
 * passa da solo (0.60.0): il 10/10 «Salvo sul Drive» era in corso, il porta
 * qui ha risposto LAVORO_IN_CORSO e non è più ripartito.
 */
export function daRiprovare(messaggio: string): boolean {
  return /LAVORO_IN_CORSO|sta gia'? girando|sta già girando|uno alla volta/i.test(messaggio)
}

/** Una riga per il registro quando il piano cambia (vuota se non c'è niente da fare). */
export function rigaPiano(piano: PianoAllineamento): string {
  if (piano.azioni.length === 0) return ''
  const porta = piano.azioni.filter((a) => a.tipo === 'porta-qui').map((a) => `«${a.nome}»${a.tipo === 'porta-qui' && a.automatica ? '' : ' (da confermare)'}`)
  const cloud = piano.azioni.filter((a) => a.tipo === 'solo-cloud').map((a) => `«${a.nome}»`)
  return [porta.length > 0 ? `da portare qui ${porta.join(', ')}` : '', cloud.length > 0 ? `da rendere solo cloud ${cloud.join(', ')} (solo mostrato: nessuna rimozione)` : ''].filter((x) => x !== '').join('; ')
}
