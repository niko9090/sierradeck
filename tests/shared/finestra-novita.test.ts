import { describe, it, expect } from 'vitest'
import {
  GRANDEZZA_MASSIMA, GRANDEZZA_MINIMA, GRANDEZZA_PREDEFINITA, LETTURA_INIZIALE, MARGINE_NOVITA, chiaveNotizia, grandezzaNeiLimiti,
  leggiGrandezzaSalvata, leggiVista, posizioneInBassoADestra, segnaLetto, suStato, testaNovita,
  type LetturaNovita, type StatoPerNovita
} from '../../src/shared/finestra-novita'

/** La finestra degli aggiornamenti in basso a destra (13/11): dove sta, quando si mostra, il pallino. */
describe('posizioneInBassoADestra', () => {
  it('nell’angolo in basso a destra dell’area di lavoro, con il margine', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 } // la barra delle applicazioni è già fuori
    const p = posizioneInBassoADestra(area, { width: 400, height: 300 })
    expect(p).toEqual({ x: 1920 - MARGINE_NOVITA - 400, y: 1040 - MARGINE_NOVITA - 300, width: 400, height: 300 })
  })
  it('su un secondo schermo a sinistra (coordinate negative) e con la barra in alto', () => {
    const p = posizioneInBassoADestra({ x: -1280, y: 40, width: 1280, height: 984 }, { width: 400, height: 300 }, 10)
    expect(p).toEqual({ x: -1280 + 1280 - 10 - 400, y: 40 + 984 - 10 - 300, width: 400, height: 300 })
  })
  it('in uno schermo più piccolo della finestra si stringe e non esce', () => {
    const area = { x: 0, y: 0, width: 300, height: 200 }
    const p = posizioneInBassoADestra(area, GRANDEZZA_PREDEFINITA, 12)
    expect(p.width).toBe(276)
    expect(p.height).toBe(176)
    expect(p.x).toBeGreaterThanOrEqual(area.x)
    expect(p.y).toBeGreaterThanOrEqual(area.y)
    expect(p.x + p.width).toBeLessThanOrEqual(area.x + area.width)
    expect(p.y + p.height).toBeLessThanOrEqual(area.y + area.height)
  })
})

describe('chiaveNotizia: cosa merita di aprire la finestra', () => {
  it('le fasi che dicono qualcosa hanno una chiave; quelle tranquille no', () => {
    for (const fase of ['disponibile', 'scarico', 'pronto', 'errore', 'attendo', 'installo']) {
      expect(chiaveNotizia({ fase, versione: '1.2.3' })).toBeDefined()
    }
    expect(chiaveNotizia({ fase: 'fermo' })).toBeUndefined()
    expect(chiaveNotizia({ fase: 'aggiornato' })).toBeUndefined()
  })
  it('«sto cercando» solo se l’ha chiesto il telefono', () => {
    expect(chiaveNotizia({ fase: 'cerco' })).toBeUndefined()
    expect(chiaveNotizia({ fase: 'cerco', daTelefono: true })).toBeDefined()
  })
  it('la percentuale non cambia la notizia', () => {
    expect(chiaveNotizia({ fase: 'scarico', versione: '1.2.3', percento: 10 } as StatoPerNovita))
      .toBe(chiaveNotizia({ fase: 'scarico', versione: '1.2.3', percento: 80 } as StatoPerNovita))
  })
  it('l’installazione non riuscita è una notizia anche a programma fermo, ma non durante attesa e installazione', () => {
    const f = { titolo: 'Non installata' }
    expect(chiaveNotizia({ fase: 'fermo', tentativoFallito: f })).toBeDefined()
    expect(chiaveNotizia({ fase: 'aggiornato', tentativoFallito: f })).toBe(chiaveNotizia({ fase: 'cerco', tentativoFallito: f }))
    expect(chiaveNotizia({ fase: 'attendo', versione: '2', tentativoFallito: f })).toBe(chiaveNotizia({ fase: 'attendo', versione: '2' }))
  })
})

describe('suStato: si mostra da sola solo per una notizia nuova', () => {
  const giro = (stati: StatoPerNovita[]): { mostre: boolean[]; l: LetturaNovita } => {
    let l = LETTURA_INIZIALE
    const mostre: boolean[] = []
    for (const s of stati) { const r = suStato(l, s); l = r.lettura; mostre.push(r.mostra) }
    return { mostre, l }
  }
  it('disponibile → scarico (tanti passi) → pronto: tre volte, non una per percentuale', () => {
    const { mostre } = giro([
      { fase: 'disponibile', versione: '2' },
      { fase: 'scarico', versione: '2', percento: 1 } as StatoPerNovita,
      { fase: 'scarico', versione: '2', percento: 50 } as StatoPerNovita,
      { fase: 'scarico', versione: '2', percento: 99 } as StatoPerNovita,
      { fase: 'pronto', versione: '2' }
    ])
    expect(mostre).toEqual([true, true, false, false, true])
  })
  it('la ricerca automatica in mezzo non la riapre per la stessa versione pronta', () => {
    const { mostre } = giro([{ fase: 'pronto', versione: '2' }, { fase: 'cerco' }, { fase: 'pronto', versione: '2' }])
    expect(mostre).toEqual([true, false, false])
  })
  it('chiusa con la ×, ricompare solo per una notizia diversa', () => {
    let l = suStato(LETTURA_INIZIALE, { fase: 'pronto', versione: '2' }).lettura
    expect(l.nonLetto).toBe(true)
    l = segnaLetto(l) // la ×
    expect(l.nonLetto).toBe(false)
    expect(suStato(l, { fase: 'pronto', versione: '2' }).mostra).toBe(false)
    const dopo = suStato(l, { fase: 'pronto', versione: '3' })
    expect(dopo.mostra).toBe(true)
    expect(dopo.lettura.nonLetto).toBe(true)
  })
  it('gli stati tranquilli non accendono il pallino', () => {
    const { l, mostre } = giro([{ fase: 'cerco' }, { fase: 'aggiornato' }, { fase: 'fermo' }])
    expect(mostre).toEqual([false, false, false])
    expect(l.nonLetto).toBe(false)
  })
  it('segnaLetto non cambia niente se era già letta', () => {
    const l = { ultima: 'x', nonLetto: false }
    expect(segnaLetto(l)).toBe(l)
  })
})

describe('le viste', () => {
  it('leggiVista accetta solo quello che conosce', () => {
    expect(leggiVista({ tipo: 'novita' })).toEqual({ tipo: 'novita' })
    expect(leggiVista({ tipo: 'installa', versione: '1.0.0' })).toEqual({ tipo: 'installa', versione: '1.0.0' })
    expect(leggiVista({ tipo: 'installa', versione: 5 })).toEqual({ tipo: 'installa', versione: '' })
    expect(leggiVista('qualcosa')).toEqual({ tipo: 'aggiornamento' })
    expect(leggiVista(undefined)).toEqual({ tipo: 'aggiornamento' })
  })
  it('la testa: frase dello stato e versioni', () => {
    const agg = { tipo: 'aggiornamento' } as const
    expect(testaNovita({ fase: 'pronto', versione: '0.106.2' }, '0.106.0', agg)).toEqual({ titolo: 'Nuova versione 0.106.2 pronta', versioni: 'da 0.106.0 → a 0.106.2' })
    expect(testaNovita({ fase: 'scarico', versione: '0.106.2', percento: 45 }, '0.106.0', agg).titolo).toBe('Sto scaricando… 45%')
    expect(testaNovita({ fase: 'disponibile', versione: '0.106.2' }, '0.106.0', agg).titolo).toBe('Nuova versione 0.106.2')
    expect(testaNovita({ fase: 'aggiornato' }, '0.106.1', agg)).toEqual({ titolo: 'Sei aggiornato', versioni: 'versione 0.106.1' })
    expect(testaNovita({ fase: 'fermo' }, '0.106.1', { tipo: 'novita' }).titolo).toBe('Installata: ecco cosa cambia')
    expect(testaNovita({ fase: 'errore' }, '0.106.1', agg)).toEqual({ titolo: 'Aggiornamento non riuscito', versioni: 'versione 0.106.1' })
    // Una versione in uno stato tranquillo (la ricerca dopo «pronta») non fa dire «da → a».
    expect(testaNovita({ fase: 'cerco', versione: '0.106.2' }, '0.106.1', agg).versioni).toBe('versione 0.106.1')
  })
})

describe('la grandezza scelta da chi la usa', () => {
  it('predefinita più grande di prima, e fra i limiti', () => {
    expect(GRANDEZZA_PREDEFINITA).toEqual({ width: 520, height: 640 })
    expect(grandezzaNeiLimiti(GRANDEZZA_PREDEFINITA)).toEqual(GRANDEZZA_PREDEFINITA)
  })
  it('il file letto: valori buoni restano, troppo piccoli o troppo grandi si fermano ai limiti', () => {
    expect(leggiGrandezzaSalvata({ width: 700.4, height: 820.6 })).toEqual({ width: 700, height: 821 })
    expect(leggiGrandezzaSalvata({ width: 10, height: 10 })).toEqual(GRANDEZZA_MINIMA)
    expect(leggiGrandezzaSalvata({ width: 99999, height: 99999 })).toEqual(GRANDEZZA_MASSIMA)
  })
  it('un file rovinato torna alla predefinita', () => {
    for (const x of [undefined, null, 'x', {}, { width: '600', height: 600 }, { width: Number.NaN, height: 600 }, { width: Infinity, height: 600 }]) {
      expect(leggiGrandezzaSalvata(x)).toEqual(GRANDEZZA_PREDEFINITA)
    }
  })
  it('su uno schermo piccolo la grandezza ricordata si stringe e resta dentro l’area di lavoro', () => {
    const area = { x: 0, y: 0, width: 1366, height: 728 }
    const p = posizioneInBassoADestra(area, leggiGrandezzaSalvata({ width: 1600, height: 1400 }))
    expect(p.x).toBeGreaterThanOrEqual(area.x)
    expect(p.y).toBeGreaterThanOrEqual(area.y)
    expect(p.x + p.width).toBe(area.width - MARGINE_NOVITA)
    expect(p.y + p.height).toBe(area.height - MARGINE_NOVITA)
  })
})
