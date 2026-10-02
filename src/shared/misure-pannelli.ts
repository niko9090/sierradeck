/**
 * Le misure della parte destra (0.41.0): quanto è larga la scheda
 * dell'autopilota, la colonna Domande, la colonna Consumi, e dove sta la barra
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

export type Sezione = 'domande' | 'consumi' | 'autopilota' | 'divisione'

/**
 * Per ogni sezione: l'unità, i limiti, la misura iniziale e i testi della
 * barra. Le colonne in pixel; la scheda dell'autopilota in percentuale del
 * riquadro della sua chat; la divisione in percentuale della scheda (quanto
 * prende la chat con lui, il resto va alle linguette).
 */
export const MISURE: Record<Sezione, { unita: 'px' | '%'; min: number; max: number; predefinita: number; passo: number; nome: string }> = {
  domande: { unita: 'px', min: 300, max: 760, predefinita: 400, passo: 20, nome: 'la colonna delle Domande' },
  consumi: { unita: 'px', min: 300, max: 760, predefinita: 380, passo: 20, nome: 'la colonna «Consumi e limiti»' },
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
export function massimoColonna(sezione: 'domande' | 'consumi', finestra: number, altreColonne: number): number {
  const m = MISURE[sezione]
  return Math.max(m.min, Math.min(m.max, Math.floor(finestra - altreColonne - MOSAICO_MINIMO_PX)))
}

/**
 * Durante il trascinamento del bordo sinistro di una colonna: verso sinistra si
 * allarga. Dentro i limiti e dentro lo spazio che lascia le chat leggibili.
 */
export function larghezzaTrascinata(p: { sezione: 'domande' | 'consumi'; iniziale: number; partenzaX: number; x: number; finestra: number; altreColonne: number }): number {
  const voluta = p.iniziale + (p.partenzaX - p.x)
  return Math.min(limita(p.sezione, voluta), massimoColonna(p.sezione, p.finestra, p.altreColonne))
}

/**
 * La larghezza da disegnare: quella salvata, ma ristretta se adesso la
 * finestra è più piccola. Quella salvata non si tocca: allargando di nuovo la
 * finestra la colonna torna com'era.
 */
export function larghezzaEffettiva(sezione: 'domande' | 'consumi', salvata: number, finestra: number, altreColonne: number): number {
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
  if (sezione === 'domande' || sezione === 'consumi') return tasto === 'ArrowLeft' ? passo : tasto === 'ArrowRight' ? -passo : 0
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
