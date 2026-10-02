import { describe, it, expect } from 'vitest'
import {
  MISURE, MOSAICO_MINIMO_PX, divisioneTrascinata, larghezzaEffettiva, larghezzaTrascinata, limita, massimoColonna, passoFreccia, suggerimentoBarra
} from '@shared/misure-pannelli'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE } from '@shared/preferenze'

/**
 * 0.41.0, Nicholas (02/10): «permetti di modificare le dimensioni di
 * visualizzazione di tutta la parte qui di destra così ognuno può allargare o
 * stringere a piacimento tutte le sezioni».
 */
describe('i limiti', () => {
  it('ogni sezione resta fra il suo minimo e il suo massimo; un valore storto torna alla misura iniziale', () => {
    expect(limita('domande', 100)).toBe(MISURE.domande.min)
    expect(limita('domande', 5000)).toBe(MISURE.domande.max)
    expect(limita('divisione', 99)).toBe(80)
    expect(limita('consumi', Number.NaN)).toBe(MISURE.consumi.predefinita)
  })
  it('le chat a sinistra non scendono mai sotto la larghezza minima', () => {
    // Finestra di 1400: con i Consumi aperti a 380, le Domande arrivano al massimo a 500.
    expect(massimoColonna('domande', 1400, 380)).toBe(1400 - 380 - MOSAICO_MINIMO_PX)
    // Finestra larga: vale il massimo della colonna.
    expect(massimoColonna('domande', 3000, 0)).toBe(MISURE.domande.max)
    // Finestra troppo stretta anche per il minimo: il minimo (e il CSS impedisce che esca).
    expect(massimoColonna('domande', 700, 0)).toBe(MISURE.domande.min)
  })
})

describe('il trascinamento', () => {
  it('il bordo sinistro di una colonna: verso sinistra allarga, dentro i limiti e lo spazio', () => {
    expect(larghezzaTrascinata({ sezione: 'domande', iniziale: 400, partenzaX: 1000, x: 900, finestra: 2000, altreColonne: 0 })).toBe(500)
    expect(larghezzaTrascinata({ sezione: 'domande', iniziale: 400, partenzaX: 1000, x: 1200, finestra: 2000, altreColonne: 0 })).toBe(300)
    expect(larghezzaTrascinata({ sezione: 'consumi', iniziale: 400, partenzaX: 1000, x: 200, finestra: 1300, altreColonne: 400 })).toBe(380)
  })
  it('la barra fra la chat e le linguette: la percentuale della scheda che prende la chat', () => {
    expect(divisioneTrascinata({ inizio: 100, lunghezza: 600, posizione: 400 })).toBe(50)
    expect(divisioneTrascinata({ inizio: 100, lunghezza: 600, posizione: 120 })).toBe(20)
    expect(divisioneTrascinata({ inizio: 100, lunghezza: 0, posizione: 120 })).toBe(MISURE.divisione.predefinita)
  })
  it('a finestra rimpicciolita la colonna si stringe da sola; la misura salvata resta', () => {
    expect(larghezzaEffettiva('domande', 700, 2400, 0)).toBe(700)
    expect(larghezzaEffettiva('domande', 700, 1000, 0)).toBe(1000 - MOSAICO_MINIMO_PX)
  })
})

describe('frecce, doppio clic, suggerimenti', () => {
  it('le frecce vanno nel verso della barra', () => {
    expect(passoFreccia('domande', 'ArrowLeft')).toBe(MISURE.domande.passo)
    expect(passoFreccia('domande', 'ArrowRight')).toBe(-MISURE.domande.passo)
    expect(passoFreccia('divisione', 'ArrowDown', true)).toBe(MISURE.divisione.passo)
    expect(passoFreccia('divisione', 'ArrowRight', false)).toBe(MISURE.divisione.passo)
    expect(passoFreccia('divisione', 'ArrowRight', true)).toBe(0)
    expect(passoFreccia('domande', 'Enter')).toBe(0)
  })
  it('il suggerimento dice cosa fa trascinare, il doppio clic (con la misura iniziale) e che resta', () => {
    const t = suggerimentoBarra('domande')
    expect(t).toContain('Trascina per allargare o stringere la colonna delle Domande')
    expect(t).toContain('Doppio clic: torna alla misura iniziale (400 pixel)')
    expect(t).toContain('anche dopo un riavvio')
    expect(suggerimentoBarra('divisione')).toContain('linguette')
  })
})

describe('le misure restano nelle preferenze', () => {
  it('la divisione si salva, entro i limiti; manca nelle preferenze vecchie e vale la predefinita', () => {
    expect(PREFERENZE_PREDEFINITE.divisioneAutopilota).toBe(MISURE.divisione.predefinita)
    expect(normalizzaPreferenze({ divisioneAutopilota: 70 }).divisioneAutopilota).toBe(70)
    expect(normalizzaPreferenze({ divisioneAutopilota: 3 }).divisioneAutopilota).toBe(20)
    expect(normalizzaPreferenze({}).divisioneAutopilota).toBe(55)
    expect(normalizzaPreferenze({ larghezzaDomande: 9999 }).larghezzaDomande).toBe(MISURE.domande.max)
  })
  it('le misure iniziali delle colonne sono quelle delle preferenze', () => {
    expect(PREFERENZE_PREDEFINITE.larghezzaDomande).toBe(MISURE.domande.predefinita)
    expect(PREFERENZE_PREDEFINITE.larghezzaConsumi).toBe(MISURE.consumi.predefinita)
    expect(PREFERENZE_PREDEFINITE.larghezzaAutopilota).toBe(MISURE.autopilota.predefinita)
  })
})
