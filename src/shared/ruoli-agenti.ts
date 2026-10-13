/**
 * Gli agenti specializzati dell'autopilota (0.71.0). Nicholas: «soprattutto
 * li voglio specializzati».
 *
 * L'autopilota fa da coordinatore: scompone l'obiettivo in compiti, dà a ogni
 * compito un ruolo, apre (o riusa) una chat per compito, ognuna nel suo
 * worktree e sul suo ramo, e **unisce il lavoro di una chat solo dopo l'ok
 * della Revisione**. Qui le regole pure, uguali per il servizio, il PC, la
 * pagina e l'app: i ruoli con le loro istruzioni, parola e colore; la lettura
 * della scomposizione con le dipendenze (il grafo lo tiene il programma, non il
 * modello: i cicli si rifiutano); il verdetto della Revisione, che il programma
 * non accetta a occhi chiusi.
 *
 * Revisione dell'esperto di sistemi multi-agente (13/10), recepita così:
 * la Revisione lavora in sola lettura (lo impone l'hook PreToolUse, non il
 * modello); un «OK» con i criteri rossi o senza un file citato vale «da
 * rifare»; dopo due rifacimenti si chiede a Nicholas; il Rilascio non
 * pubblica né installa mai fuori dalla regola del progetto.
 */

export type Ruolo = 'sviluppo' | 'collaudo' | 'interfaccia' | 'revisione' | 'rilascio'

export const RUOLI_ORDINE: readonly Ruolo[] = ['sviluppo', 'interfaccia', 'collaudo', 'revisione', 'rilascio']

export type SchedaRuolo = {
  nome: string
  /** La parola corta sul riquadro e nell'albero. */
  parola: string
  colore: 'blu' | 'viola' | 'verde' | 'ambra' | 'rosso'
  /** Lavora nel suo worktree e il suo ramo passa dalla Revisione. */
  conRevisione: boolean
  /** Le istruzioni del ruolo, in testa al primo messaggio della chat. */
  istruzioni: string
}

export const RUOLI: Record<Ruolo, SchedaRuolo> = {
  sviluppo: {
    nome: 'Sviluppo', parola: 'sviluppo', colore: 'blu', conRevisione: true,
    istruzioni: 'Sei l’agente di SVILUPPO. Scrivi il codice del tuo compito nella tua cartella, con i test che lo provano. Fai commit piccoli con messaggi chiari. Non toccare file che non servono al tuo compito: altre chat lavorano in parallelo. Quando il compito è fatto dillo in una riga: un revisore leggerà il tuo ramo prima che venga unito.'
  },
  interfaccia: {
    nome: 'Interfaccia', parola: 'interfaccia', colore: 'viola', conRevisione: true,
    istruzioni: 'Sei l’agente di INTERFACCIA. Ti occupi di quello che vede la persona: PC, pagina del telefono e app devono dire le stesse cose, con le stesse parole. Testi corti, la spiegazione dietro un «?», gli stati in una parola con il colore, niente funzioni tolte. Prova con clic veri, non solo con i test. Un revisore leggerà il tuo ramo prima che venga unito.'
  },
  collaudo: {
    nome: 'Collaudo', parola: 'collaudo', colore: 'verde', conRevisione: true,
    istruzioni: 'Sei l’agente di COLLAUDO. Scrivi ed esegui i test e le prove dal vero del compito, trova i difetti e descrivili con i passi per riprodurli. Correggi solo i test; un difetto del prodotto lo segnali con file e riga. Le prove dal vero si fanno solo su copie e progetti di prova, mai sulle chat vere.'
  },
  revisione: {
    nome: 'Revisione', parola: 'revisione', colore: 'ambra', conRevisione: false,
    istruzioni: 'Sei l’agente di REVISIONE. Leggi il lavoro di un’altra chat (il suo ramo) e decidi se si può unire. NON modifichi file e NON fai commit: il programma te lo impedisce. Guarda il diff, esegui i test, cerca difetti veri (comportamento sbagliato, casi mancanti, dati privati nel codice). Chiudi SEMPRE con una riga sola, l’ultima del messaggio, in una di queste due forme:\nREVISIONE: OK <ramo> — con almeno un file:riga che hai controllato\nREVISIONE: DA RIFARE <ramo>: cosa correggere, con file:riga'
  },
  rilascio: {
    nome: 'Rilascio', parola: 'rilascio', colore: 'rosso', conRevisione: false,
    istruzioni: 'Sei l’agente di RILASCIO. Lavori dopo che gli altri compiti sono uniti: versione, voce delle novità, note, controlli finali. NON pubblichi e NON installi niente da solo: la pubblicazione la decide la regola del progetto e l’installazione la fa solo Nicholas. Prepara tutto e dillo in una riga.'
  }
}

export function eRuolo(x: unknown): x is Ruolo {
  return typeof x === 'string' && (RUOLI_ORDINE as readonly string[]).includes(x)
}

/** Il ruolo dal testo del compito, quando il coordinatore non l'ha detto. */
export function ruoloDaTesto(compito: string): Ruolo {
  const t = compito.toLowerCase()
  if (/\b(rilascio|rilascia|pubblica|pubblicazione|release|versione|novit[aà]|changelog)\b/.test(t)) return 'rilascio'
  if (/\b(revision[ei]|rivedi|review|controlla il ramo)\b/.test(t)) return 'revisione'
  if (/\b(test|collaud|prova dal vero|prove dal vero|verifica)\w*/.test(t)) return 'collaudo'
  if (/\b(interfaccia|pagina|app android|schermat|grafica|css|ui|ux|pulsant|tasto|menu)\w*/.test(t)) return 'interfaccia'
  return 'sviluppo'
}

/** Un compito della scomposizione, con il suo ruolo e da quali compiti dipende (per indice). */
export type CompitoRuolo = { compito: string; ruolo: Ruolo; dipendeDa: number[] }

/**
 * La scomposizione del coordinatore. Accetta la forma vecchia
 * (`{"compiti": ["…"]}`) e quella nuova (`{"compiti": [{"compito", "ruolo",
 * "dipendeDa": [0]}]}`). Un ruolo mancante o sconosciuto si ricava dal testo;
 * le dipendenze fuori elenco o verso sé stessi si scartano.
 */
export function leggiScomposizione(testo: string): CompitoRuolo[] | undefined {
  const inizio = testo.indexOf('{')
  const fine = testo.lastIndexOf('}')
  if (inizio === -1 || fine <= inizio) return undefined
  let o: unknown
  try { o = JSON.parse(testo.slice(inizio, fine + 1)) } catch { return undefined }
  const grezzi = (o as { compiti?: unknown } | null)?.compiti
  if (!Array.isArray(grezzi)) return undefined
  const compiti: CompitoRuolo[] = []
  for (const g of grezzi) {
    if (typeof g === 'string' && g.trim() !== '') { compiti.push({ compito: g.trim(), ruolo: ruoloDaTesto(g), dipendeDa: [] }); continue }
    if (typeof g !== 'object' || g === null) continue
    const x = g as { compito?: unknown; ruolo?: unknown; dipendeDa?: unknown }
    if (typeof x.compito !== 'string' || x.compito.trim() === '') continue
    compiti.push({
      compito: x.compito.trim(),
      ruolo: eRuolo(x.ruolo) ? x.ruolo : ruoloDaTesto(x.compito),
      dipendeDa: Array.isArray(x.dipendeDa) ? x.dipendeDa.filter((d): d is number => Number.isInteger(d)) : []
    })
  }
  if (compiti.length === 0) return undefined
  return compiti.map((c, i) => ({ ...c, dipendeDa: [...new Set(c.dipendeDa.filter((d) => d >= 0 && d < compiti.length && d !== i))] }))
}

/**
 * Il grafo dei compiti senza cicli: se le dipendenze formano un cerchio, il
 * cerchio si rompe togliendo le dipendenze dei compiti che ne fanno parte, e lo
 * si dice. Il Rilascio dipende sempre da tutti gli altri compiti.
 */
export function grafoSenzaCicli(compiti: CompitoRuolo[]): { compiti: CompitoRuolo[]; tolte: string[] } {
  const conRilascio = compiti.map((c, i) => (c.ruolo === 'rilascio'
    ? { ...c, dipendeDa: [...new Set([...c.dipendeDa, ...compiti.map((_, j) => j).filter((j) => j !== i && compiti[j]?.ruolo !== 'rilascio')])] }
    : c))
  const tolte: string[] = []
  const stato = new Array<number>(conRilascio.length).fill(0)
  const nelCerchio = new Set<number>()
  const visita = (i: number, pila: number[]): void => {
    if (stato[i] === 2) return
    if (stato[i] === 1) { for (const j of pila.slice(pila.indexOf(i))) nelCerchio.add(j); return }
    stato[i] = 1
    for (const d of conRilascio[i]?.dipendeDa ?? []) visita(d, [...pila, i])
    stato[i] = 2
  }
  for (let i = 0; i < conRilascio.length; i += 1) visita(i, [])
  const fuori = conRilascio.map((c, i) => {
    if (!nelCerchio.has(i) || c.dipendeDa.length === 0) return c
    tolte.push(`«${c.compito.slice(0, 60)}» non aspetta più altri compiti: le dipendenze facevano un cerchio`)
    return { ...c, dipendeDa: [] }
  })
  return { compiti: fuori, tolte }
}

/** Un compito si può aprire quando tutti quelli da cui dipende sono fatti (uniti). */
export function prontoDaAprire(c: CompitoRuolo, fatti: ReadonlySet<number>): boolean {
  return c.dipendeDa.every((d) => fatti.has(d))
}

/** Le istruzioni del ruolo, in testa al primo messaggio di una chat. */
export function preamboloRuolo(r: Ruolo | undefined): string[] {
  if (r === undefined) return []
  return [`Il tuo ruolo: ${RUOLI[r].nome}.`, RUOLI[r].istruzioni, '']
}

export type Verdetto = { esito: 'ok' | 'rifare'; ramo?: string; note: string }

/** L'ultima riga «REVISIONE: OK …» o «REVISIONE: DA RIFARE …» del messaggio, se c'è. */
export function leggiVerdetto(messaggio: string): Verdetto | undefined {
  const righe = messaggio.split(/\r?\n/).map((r) => r.trim()).filter((r) => r !== '')
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const r = (righe[i] ?? '').replace(/^[*_`>\s-]+|[*_`\s]+$/g, '')
    const ok = /^REVISIONE:\s*OK\b\s*(\S*)\s*[—:-]*\s*(.*)$/i.exec(r)
    if (ok !== null) return { esito: 'ok', ...(ok[1] !== undefined && ok[1] !== '' ? { ramo: ok[1] } : {}), note: (ok[2] ?? '').trim() }
    const no = /^REVISIONE:\s*DA\s+RIFARE\b\s*([^\s:]*)\s*:?\s*(.*)$/i.exec(r)
    if (no !== null) return { esito: 'rifare', ...(no[1] !== undefined && no[1] !== '' ? { ramo: no[1] } : {}), note: (no[2] ?? '').trim() }
  }
  return undefined
}

/** Cita almeno un file (con o senza riga): `src/x.ts`, `Modelli.kt:12`. */
export function citaUnFile(testo: string): boolean {
  return /[A-Za-z0-9_\-./\\]+\.[A-Za-z0-9]{1,6}(:\d+)?/.test(testo)
}

/**
 * Il programma non timbra a occhi chiusi: un OK vale solo con i criteri del
 * ramo verdi e almeno un file citato; altrimenti è «da rifare», con il perché.
 */
export function verdettoAccettato(v: Verdetto, criteriVerdi: boolean, messaggio: string): Verdetto {
  if (v.esito !== 'ok') return v
  if (!criteriVerdi) return { esito: 'rifare', ...(v.ramo !== undefined ? { ramo: v.ramo } : {}), note: `La revisione diceva OK, ma sul ramo i criteri non passano: prima si sistemano quelli. ${v.note}`.trim() }
  if (!citaUnFile(`${v.note}\n${messaggio}`)) return { esito: 'rifare', ...(v.ramo !== undefined ? { ramo: v.ramo } : {}), note: 'La revisione diceva OK senza citare nessun file controllato: va rifatta guardando davvero il diff.' }
  return v
}

/** Dopo quanti «da rifare» sullo stesso compito si chiede a Nicholas. */
export const RIFACIMENTI_MAX = 2

/** Il compito di Revisione per il ramo di una chat: il testo dice quale chat, il programma lo rilegge. */
export function testoRevisione(c: { id: string; ramo?: string; compito: string }): string {
  return `Rivedi il ramo ${c.ramo ?? '(senza ramo)'} della chat ${c.id} («${c.compito.slice(0, 120)}»)`
}

/** La chat da rivedere, dal testo del compito di Revisione. */
export function chatDaRivedere(compito: string): string | undefined {
  return / della chat (c-\d+) /.exec(compito)?.[1]
}

/**
 * I compiti fatti (per testo): quelli la cui chat ha avuto l'ok della Revisione
 * ed è stata unita, o che non passano dalla Revisione e sono finiti.
 */
export function compitiFatti(chats: { compito: string; stato: string; ruolo?: Ruolo; approvata?: boolean }[]): Set<string> {
  return new Set(chats.filter((c) => c.approvata === true || (c.stato === 'finita' && (c.ruolo === undefined || !RUOLI[c.ruolo].conRevisione))).map((c) => c.compito))
}
