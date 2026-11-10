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

/**
 * Le dipendenze di un compito che non sono ancora unite. Non contano quelle che non esistono più
 * e quelle di una richiesta già chiusa (`chiuse`: gli id delle richieste «fatte»): non si
 * uniranno mai e bloccherebbero il compito per sempre.
 */
export function dipendenzeNonUnite(piano: Piano, id: string, chiuse?: ReadonlySet<string>): string[] {
  const k = piano.compiti.find((c) => c.id === id)
  if (k === undefined) return []
  return k.dopo.filter((d) => {
    const c = piano.compiti.find((y) => y.id === d)
    return c !== undefined && !unito(c) && chiuse?.has(c.richiesta) !== true
  })
}

/**
 * Il rifiuto per un Agent che lancia un compito «da fare» con le dipendenze
 * non unite. `undefined` se si può lanciare (nessun compito, già in corso,
 * dipendenze tutte unite). `chat`: l'id dell'Agent che chiama.
 */
export function aspettaDipendenze(piano: Piano, compito: string | undefined, chat?: string, chiuse?: ReadonlySet<string>): { compito: string; aspetta: string[]; motivo: string } | undefined {
  if (compito === undefined) return undefined
  const k = piano.compiti.find((c) => c.id === compito)
  // Il flusso può aver già segnato «in corso» il compito di questo stesso Agent, prima che la guardia lo giudichi.
  const eQuestoAgent = k?.stato === 'in-corso' && chat !== undefined && k.chat === chat
  if (k === undefined || (k.stato !== 'da-fare' && !eQuestoAgent)) return undefined
  const aspetta = dipendenzeNonUnite(piano, compito, chiuse)
  if (aspetta.length === 0) return undefined
  return {
    compito, aspetta,
    motivo: `aspetta l’unione di ${aspetta.join(', ')}: ti avviso io quando è unita (${compito} è in fila), non lanciarlo prima e non aspettare con sleep né con altri comandi di attesa.`
  }
}

/**
 * I compiti da fare con tutte le dipendenze unite, divisi fra quelli da lanciare, quelli che
 * aspettano una correzione (dipendenza unita con il criterio rosso) e quelli che aspettano
 * una misura (dipendenza unita ma criterio non ancora misurato: non è rosso).
 * `tra`: solo questi compiti; `escludi`: mai questi (per esempio quelli nella lista d'attesa dei posti).
 */
export function compitiSbloccati(
  piano: Piano, tra?: ReadonlySet<string>, escludi?: ReadonlySet<string>, chiuse?: ReadonlySet<string>
): { pronti: CompitoPiano[]; daCorreggere: { compito: CompitoPiano; rossi: string[] }[]; daMisurare: { compito: CompitoPiano; ignote: string[] }[] } {
  const pronti: CompitoPiano[] = []
  const daCorreggere: { compito: CompitoPiano; rossi: string[] }[] = []
  const daMisurare: { compito: CompitoPiano; ignote: string[] }[] = []
  for (const c of piano.compiti) {
    if (c.stato !== 'da-fare' || (tra !== undefined && !tra.has(c.id)) || escludi?.has(c.id) === true) continue
    if (dipendenzeNonUnite(piano, c.id, chiuse).length > 0) continue
    const dip = c.dopo.map((d) => piano.compiti.find((y) => y.id === d)).filter((y): y is CompitoPiano => y !== undefined && unito(y) && chiuse?.has(y.richiesta) !== true)
    const rossi = dip.filter((y) => y.criterioVerde === false).map((y) => y.id)
    const ignote = dip.filter((y) => y.criterioVerde === undefined).map((y) => y.id)
    if (rossi.length > 0) daCorreggere.push({ compito: c, rossi })
    else if (ignote.length > 0) daMisurare.push({ compito: c, ignote })
    else pronti.push(c)
  }
  return { pronti, daCorreggere, daMisurare }
}

/**
 * Le righe da aggiungere all'esito di un'unione finita: solo i compiti che aspettavano
 * `unitoId` e ora sono pronti (da lanciare adesso, nello stesso turno), o aspettano una
 * correzione o una misura. Vuote se l'unione non è riuscita, se nessun compito dipende da
 * quello appena unito, o se il compito è già nella lista d'attesa dei posti (`inAttesa`).
 */
export function righeDopoUnione(piano: Piano, unitoId: string, opzioni: { riuscita?: boolean; inAttesa?: ReadonlySet<string>; chiuse?: ReadonlySet<string> } = {}): string[] {
  if (opzioni.riuscita === false) return []
  const tra = new Set(piano.compiti.filter((c) => c.dopo.includes(unitoId)).map((c) => c.id))
  if (tra.size === 0) return []
  const { pronti, daCorreggere, daMisurare } = compitiSbloccati(piano, tra, opzioni.inAttesa, opzioni.chiuse)
  const righe: string[] = []
  if (pronti.length > 0) {
    righe.push(`Adesso sono pronti da lanciare: ${pronti.map((c) => `${c.id} («${corto(c.titolo, 80)}»)`).join(', ')}. Lanciali ORA con Agent, nello stesso turno: le dipendenze sono unite e nessuno li sta facendo.`)
  }
  for (const d of daCorreggere) {
    righe.push(`${d.compito.id} aspetta la correzione di ${d.rossi.join(', ')} (unito con il criterio rosso): prima affida la correzione.`)
  }
  for (const d of daMisurare) {
    righe.push(`${d.compito.id} aspetta la misura del criterio di ${d.ignote.join(', ')} (unito ma non ancora misurato): misuralo di nuovo, poi lancia ${d.compito.id}.`)
  }
  return righe
}

/** Una riga per il riassunto: unione in corso, poi parte X. `undefined` se non c'è niente da dire. */
export function rigaUnioneEPoi(piano: Piano, inUnione: readonly string[]): string | undefined {
  if (inUnione.length === 0) return undefined
  const ids = new Set(inUnione)
  // «Poi parte» solo chi non aspetta anche altro: le altre dipendenze devono essere unite.
  const dopo = piano.compiti.filter((c) => c.stato === 'da-fare' && c.dopo.some((d) => ids.has(d)) && dipendenzeNonUnite(piano, c.id).every((d) => ids.has(d)))
  const inCorso = inUnione.join(', ')
  if (dopo.length === 0) return `Unione in corso: ${inCorso}. Non è un lavoro fermo.`
  return `Unione in corso: ${inCorso}, poi parte ${dopo.map((c) => c.id).join(', ')}. Non è un lavoro fermo: il programma ti avvisa appena l’unione finisce.`
}
