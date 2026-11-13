/**
 * Le misure della parte destra (0.41.0): quanto è larga la scheda
 * dell'autopilota, la colonna Domande, e dove sta la barra
 * fra la chat con l'autopilota e le sue linguette.
 *
 * Nicholas (02/10): «permetti di modificare le dimensioni di visualizzazione
 * di tutta la parte qui di destra così ognuno può allargare o stringere a
 * piacimento tutte le sezioni». Ogni sezione si trascina dal suo bordo; le
 * misure restano nelle preferenze (anche dopo un riavvio); il doppio clic
 * riporta alla misura iniziale; ci sono dei minimi, e le chat a sinistra non
 * scendono mai sotto una larghezza che si legge.
 *
 * Qui solo regole pure, provate senza finestra: i limiti, il calcolo durante il
 * trascinamento, le frecce, e la misura effettiva quando la finestra si
 * rimpicciolisce.
 */

/** Sotto questa larghezza il mosaico delle chat a sinistra non si legge piu'. */
export const MOSAICO_MINIMO_PX = 520

export type Colonna = 'domande' | 'specialisti'
export type Sezione = Colonna | 'autopilota' | 'divisione'

/**
 * Per ogni sezione: l'unità, i limiti, la misura iniziale e i testi della
 * barra. Le colonne in pixel; la scheda dell'autopilota in percentuale del
 * riquadro della sua chat; la divisione in percentuale della scheda (quanto
 * prende la chat con lui, il resto va alle linguette).
 */
export const MISURE: Record<Sezione, { unita: 'px' | '%'; min: number; max: number; predefinita: number; passo: number; nome: string }> = {
  domande: { unita: 'px', min: 300, max: 760, predefinita: 400, passo: 20, nome: 'la colonna delle Domande' },
  specialisti: { unita: 'px', min: 320, max: 760, predefinita: 420, passo: 20, nome: 'la colonna degli Specialisti' },
  autopilota: { unita: '%', min: 15, max: 70, predefinita: 34, passo: 2, nome: 'la scheda dell’autopilota' },
  divisione: { unita: '%', min: 20, max: 80, predefinita: 55, passo: 5, nome: 'la chat con l’autopilota' }
}

/** Dentro i limiti, arrotondata. Un valore non numerico torna alla predefinita. */
export function limita(sezione: Sezione, valore: number): number {
  const m = MISURE[sezione]
  if (!Number.isFinite(valore)) return m.predefinita
  return Math.round(Math.min(m.max, Math.max(m.min, valore)))
}

/**
 * La larghezza massima di una colonna con la finestra com'è adesso: le chat a
 * sinistra tengono almeno `MOSAICO_MINIMO_PX`, contando anche l'altra colonna
 * aperta. Mai sotto il minimo della colonna (allora è la finestra che è
 * troppo stretta, e il CSS impedisce che esca dallo schermo).
 */
export function massimoColonna(sezione: Colonna, finestra: number, altreColonne: number): number {
  const m = MISURE[sezione]
  return Math.max(m.min, Math.min(m.max, Math.floor(finestra - altreColonne - MOSAICO_MINIMO_PX)))
}

/**
 * Durante il trascinamento del bordo sinistro di una colonna: verso sinistra si
 * allarga. Dentro i limiti e dentro lo spazio che lascia le chat leggibili.
 */
export function larghezzaTrascinata(p: { sezione: Colonna; iniziale: number; partenzaX: number; x: number; finestra: number; altreColonne: number }): number {
  const voluta = p.iniziale + (p.partenzaX - p.x)
  return Math.min(limita(p.sezione, voluta), massimoColonna(p.sezione, p.finestra, p.altreColonne))
}

/**
 * La larghezza da disegnare: quella salvata, ma ristretta se adesso la
 * finestra è più piccola. Quella salvata non si tocca: allargando di nuovo la
 * finestra la colonna torna com'era.
 */
export function larghezzaEffettiva(sezione: Colonna, salvata: number, finestra: number, altreColonne: number): number {
  return Math.min(limita(sezione, salvata), massimoColonna(sezione, finestra, altreColonne))
}

/**
 * La divisione fra la chat con l'autopilota e le linguette, durante il
 * trascinamento: la percentuale della scheda che prende la chat. In pila
 * (scheda stretta) si misura in altezza, fianco a fianco in larghezza.
 */
export function divisioneTrascinata(p: { inizio: number; lunghezza: number; posizione: number }): number {
  if (!(p.lunghezza > 0)) return MISURE.divisione.predefinita
  return limita('divisione', ((p.posizione - p.inizio) / p.lunghezza) * 100)
}

/**
 * Le frecce sulla barra: di quanto si muove la misura. Per le colonne (bordo
 * sinistro) freccia a sinistra allarga; per la divisione in pila freccia giù
 * allarga la chat, fianco a fianco freccia a destra. 0 = tasto che non
 * riguarda la barra.
 */
export function passoFreccia(sezione: Sezione, tasto: string, inPila = true): number {
  const passo = MISURE[sezione].passo
  if (sezione === 'domande' || sezione === 'specialisti') return tasto === 'ArrowLeft' ? passo : tasto === 'ArrowRight' ? -passo : 0
  if (sezione === 'divisione') {
    if (inPila) return tasto === 'ArrowDown' ? passo : tasto === 'ArrowUp' ? -passo : 0
    return tasto === 'ArrowRight' ? passo : tasto === 'ArrowLeft' ? -passo : 0
  }
  return 0
}

/** Il suggerimento sulla barra: cosa fa trascinare, cosa fanno il doppio clic e le frecce. */
export function suggerimentoBarra(sezione: Sezione): string {
  const m = MISURE[sezione]
  const iniziale = `${m.predefinita}${m.unita === 'px' ? ' pixel' : '%'}`
  const cosa = sezione === 'divisione'
    ? 'Trascina per dare più spazio alla chat con l’autopilota o alle linguette sotto'
    : `Trascina per allargare o stringere ${m.nome}`
  return `${cosa}. Doppio clic: torna alla misura iniziale (${iniziale}). Con le frecce si sposta a passi. La misura resta anche dopo un riavvio.`
}

// ── Tutte le sezioni (13/11) ───────────────────────────────────────────────
//
// Nicholas: «voglio che tutte le dimensioni delle varie sezioni del programma
// siano personalizzabili direttamente col mouse». Oltre alle due colonne di
// destra (sopra), ogni divisione della finestra ha il suo bordo da trascinare:
// la colonna dell'autopilota, la conversazione della Panoramica, il dettaglio
// di Progetti e di Autopiloti, la sezione «Altri PC», i pannelli che scorrono
// sopra il mosaico. Le misure stanno solo su questo PC (localStorage, come la
// colonna Specialisti): non sono impostazioni da portare sul telefono.
// Senza misura salvata vale quella del foglio di stile, com'era prima; il
// doppio clic sul bordo la toglie.

export type SezioneLibera = 'colonnaAutopilota' | 'panDialogo' | 'progettiDettaglio' | 'autopilotiDettaglio' | 'altriPc'
export type LatoBordo = 'destra' | 'sinistra'

/**
 * `lato`: dove sta il bordo da trascinare rispetto alla sezione. A destra
 * (colonna di sinistra) trascinando a destra si allarga; a sinistra (colonna
 * di destra) si allarga trascinando a sinistra.
 */
export const MISURE_LIBERE: Record<SezioneLibera, { min: number; max: number; passo: number; nome: string; lato: LatoBordo }> = {
  colonnaAutopilota: { min: 220, max: 720, passo: 20, nome: 'la colonna dell’autopilota', lato: 'destra' },
  panDialogo: { min: 300, max: 1200, passo: 20, nome: 'la conversazione con l’autopilota', lato: 'destra' },
  progettiDettaglio: { min: 320, max: 1100, passo: 20, nome: 'il dettaglio del progetto', lato: 'sinistra' },
  autopilotiDettaglio: { min: 320, max: 1100, passo: 20, nome: 'il dettaglio dell’autopilota', lato: 'sinistra' },
  altriPc: { min: 120, max: 900, passo: 20, nome: 'la sezione Altri PC', lato: 'sinistra' }
}

/** I pannelli che scorrono sopra il mosaico: la chiave è `pannello:<nome>`. */
export const PANNELLO = { prefisso: 'pannello:', min: 320, max: 2400 } as const

export type ArchivioMisure = Readonly<Record<string, number>>

function limitiDi(chiave: string): { min: number; max: number } | undefined {
  if (chiave.startsWith(PANNELLO.prefisso)) return chiave.length > PANNELLO.prefisso.length && chiave.length <= 120 ? PANNELLO : undefined
  return Object.prototype.hasOwnProperty.call(MISURE_LIBERE, chiave) ? MISURE_LIBERE[chiave as SezioneLibera] : undefined
}

/** Dentro i limiti della sezione e, se si sa, dello spazio che c'è adesso (mai sotto il minimo). */
export function limitaMisura(chiave: string, valore: number, spazio?: number): number {
  const l = limitiDi(chiave) ?? { min: 0, max: Number.MAX_SAFE_INTEGER }
  const tetto = spazio !== undefined && Number.isFinite(spazio) ? Math.max(l.min, Math.min(l.max, Math.floor(spazio))) : l.max
  if (!Number.isFinite(valore)) return l.min
  return Math.round(Math.min(tetto, Math.max(l.min, valore)))
}

/** L'archivio letto dal disco: solo chiavi note, solo numeri, già dentro i limiti. */
export function leggiArchivioMisure(raw: unknown): ArchivioMisure {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const fuori: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (limitiDi(k) === undefined || typeof v !== 'number' || !Number.isFinite(v)) continue
    fuori[k] = limitaMisura(k, v)
  }
  return fuori
}

/** L'archivio con quella misura cambiata; `undefined` la toglie (torna quella del foglio di stile). */
export function conMisura(a: ArchivioMisure, chiave: string, valore: number | undefined): ArchivioMisure {
  if (limitiDi(chiave) === undefined) return a
  const resto: Record<string, number> = { ...a }
  delete resto[chiave]
  return valore === undefined ? resto : { ...resto, [chiave]: limitaMisura(chiave, valore) }
}

/** Il verso: +1 se trascinare a destra allarga, -1 se allarga trascinare a sinistra. */
export function versoDi(lato: LatoBordo): 1 | -1 {
  return lato === 'destra' ? 1 : -1
}

/** Durante il trascinamento: la misura di partenza più lo spostamento nel verso del bordo, nei limiti. */
export function misuraTrascinata(p: { chiave: string; lato: LatoBordo; iniziale: number; partenza: number; posizione: number; spazio?: number }): number {
  return limitaMisura(p.chiave, p.iniziale + (p.posizione - p.partenza) * versoDi(p.lato), p.spazio)
}

/** Le frecce sul bordo: di quanto cambia la misura (0 = tasto che non lo riguarda). */
export function passoMisura(lato: LatoBordo, tasto: string, passo = 20): number {
  if (tasto === 'ArrowRight') return passo * versoDi(lato)
  if (tasto === 'ArrowLeft') return -passo * versoDi(lato)
  return 0
}

/** Il suggerimento sul bordo, corto. */
export function suggerimentoBordo(nome: string): string {
  return `Trascina per allargare o stringere ${nome}. Doppio clic: misura iniziale. Frecce: a passi.`
}

/**
 * La chiave di un pannello che scorre sopra il mosaico, per ricordarne la
 * larghezza: il suo nome accessibile, o la classe che lo distingue, o il
 * titolo della sua testa. Senza niente di questo: nessuna chiave (non si ricorda).
 */
export function chiaveDelPannello(p: { etichetta?: string | null; classi: readonly string[]; titolo?: string | null }): string | undefined {
  const pulito = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const nome = pulito(p.etichetta) || p.classi.find((c) => c.startsWith('pannello--') && c !== 'pannello--in-mano') || pulito(p.titolo)
  return nome === '' ? undefined : `${PANNELLO.prefisso}${nome}`
}
