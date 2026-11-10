import type { CompitoPiano, Piano } from '@shared/piano-orchestratore'

/**
 * **I compiti che aspettano un altro compito** (10/11). Un compito «da fare»
 * con un «dopo» non ancora unito non parte: se l'autopilota ci prova con
 * Agent il programma lo rifiuta e lo mette in fila; quando l'ultima
 * dipendenza è unita, lo dice all'autopilota. Il disco ricorda il piano, quindi
 * la fila delle dipendenze si ricostruisce da lì anche dopo un riavvio.
 */

const corto = (t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

const unito = (c: CompitoPiano | undefined): boolean => c?.stato === 'unito'

/** Le dipendenze di un compito che non sono ancora unite (quelle che non esistono più non contano). */
export function dipendenzeNonUnite(piano: Piano, id: string): string[] {
  const k = piano.compiti.find((c) => c.id === id)
  if (k === undefined) return []
  return k.dopo.filter((d) => {
    const c = piano.compiti.find((y) => y.id === d)
    return c !== undefined && !unito(c)
  })
}

/**
 * Il rifiuto per un Agent che lancia un compito «da fare» con le dipendenze
 * non unite. `undefined` se si può lanciare (nessun compito, già in corso,
 * dipendenze tutte unite). `chat`: l'id dell'Agent che chiama.
 */
export function aspettaDipendenze(piano: Piano, compito: string | undefined, chat?: string): { compito: string; aspetta: string[]; motivo: string } | undefined {
  if (compito === undefined) return undefined
  const k = piano.compiti.find((c) => c.id === compito)
  // Il flusso può aver già segnato «in corso» il compito di questo stesso Agent, prima che la guardia lo giudichi.
  const eQuestoAgent = k?.stato === 'in-corso' && chat !== undefined && k.chat === chat
  if (k === undefined || (k.stato !== 'da-fare' && !eQuestoAgent)) return undefined
  const aspetta = dipendenzeNonUnite(piano, compito)
  if (aspetta.length === 0) return undefined
  return {
    compito, aspetta,
    motivo: `aspetta l’unione di ${aspetta.join(', ')}: ti avviso io quando è unita (${compito} è in fila), non lanciarlo prima e non aspettare con sleep né con altri comandi di attesa.`
  }
}

/** I compiti da fare con tutte le dipendenze unite, divisi fra quelli da lanciare e quelli che aspettano una correzione (dipendenza unita con il criterio rosso). */
export function compitiSbloccati(piano: Piano, tra?: ReadonlySet<string>): { pronti: CompitoPiano[]; daCorreggere: { compito: CompitoPiano; rossi: string[] }[] } {
  const pronti: CompitoPiano[] = []
  const daCorreggere: { compito: CompitoPiano; rossi: string[] }[] = []
  for (const c of piano.compiti) {
    if (c.stato !== 'da-fare' || (tra !== undefined && !tra.has(c.id))) continue
    const dip = c.dopo.map((d) => piano.compiti.find((y) => y.id === d)).filter((y): y is CompitoPiano => y !== undefined)
    if (!dip.every(unito)) continue
    const rossi = dip.filter((y) => y.criterioVerde !== true).map((y) => y.id)
    if (rossi.length > 0) daCorreggere.push({ compito: c, rossi })
    else pronti.push(c)
  }
  return { pronti, daCorreggere }
}

/**
 * Le righe da aggiungere all'esito di un'unione finita: i compiti ora pronti
 * (da lanciare adesso, nello stesso turno) e quelli che aspettano una
 * correzione. Vuote se nessun compito è cambiato.
 */
export function righeDopoUnione(piano: Piano): string[] {
  const { pronti, daCorreggere } = compitiSbloccati(piano)
  const righe: string[] = []
  if (pronti.length > 0) {
    righe.push(`Adesso sono pronti da lanciare: ${pronti.map((c) => `${c.id} («${corto(c.titolo, 80)}»)`).join(', ')}. Lanciali ORA con Agent, nello stesso turno: le dipendenze sono unite e nessuno li sta facendo.`)
  }
  for (const d of daCorreggere) {
    righe.push(`${d.compito.id} aspetta la correzione di ${d.rossi.join(', ')} (unito con il criterio rosso): prima affida la correzione.`)
  }
  return righe
}

/** Una riga per il riassunto: unione in corso, poi parte X. `undefined` se non c'è niente da dire. */
export function rigaUnioneEPoi(piano: Piano, inUnione: readonly string[]): string | undefined {
  if (inUnione.length === 0) return undefined
  const ids = new Set(inUnione)
  const dopo = piano.compiti.filter((c) => c.stato === 'da-fare' && c.dopo.some((d) => ids.has(d)))
  const inCorso = inUnione.join(', ')
  if (dopo.length === 0) return `Unione in corso: ${inCorso}. Non è un lavoro fermo.`
  return `Unione in corso: ${inCorso}, poi parte ${dopo.map((c) => c.id).join(', ')}. Non è un lavoro fermo: il programma ti avvisa appena l’unione finisce.`
}
