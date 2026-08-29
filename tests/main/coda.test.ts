import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { creaCoda, nomeSicuro, type MotoreCoda, type StatoCoda, type VoceCamminata } from '../../src/main/trasferimenti/coda'

/**
 * La coda si prova senza un server acceso, ed è il motivo per cui il motore è
 * un parametro: quello che si sbaglia qui non è il protocollo SFTP — quello ha
 * i suoi test contro un server vero — ma **l'ordine e gli errori**. Cosa parte
 * per primo, cosa succede al file numero 3 di 500 quando non ha i permessi,
 * quante copie corrono insieme.
 */

type Albero = Record<string, VoceCamminata[]>

function motoreFinto(opzioni: {
  remoto?: Albero
  locale?: Albero
  /** I percorsi che devono fallire, con la scusa. */
  rotti?: Record<string, string>
  /** Trattiene una copia finché non la lasci andare. */
  trattieni?: Set<string>
} = {}): {
  motore: MotoreCoda
  fatti: string[]
  cartelleCreate: string[]
  lascia: (percorso: string) => void
} {
  const fatti: string[] = []
  const cartelleCreate: string[] = []
  const trattenuti = new Map<string, () => void>()

  const copia = async (chiave: string, avanza: (fatti: number) => void): Promise<void> => {
    const scusa = opzioni.rotti?.[chiave]
    if (scusa !== undefined) throw new Error(scusa)
    if (opzioni.trattieni?.has(chiave) === true) {
      await new Promise<void>((risolvi) => trattenuti.set(chiave, risolvi))
    }
    avanza(10)
    fatti.push(chiave)
  }

  return {
    fatti,
    cartelleCreate,
    lascia: (percorso) => {
      trattenuti.get(percorso)?.()
      trattenuti.delete(percorso)
    },
    motore: {
      elencaRemoto: (_d, percorso) => Promise.resolve(opzioni.remoto?.[percorso] ?? []),
      elencaLocale: (percorso) => opzioni.locale?.[percorso] ?? [],
      scarica: (_d, remoto, _l, avanza) => copia(remoto, avanza),
      carica: (_d, locale, _r, avanza) => copia(locale, avanza),
      creaCartellaRemota: (_d, percorso) => {
        cartelleCreate.push(percorso)
        return Promise.resolve()
      }
    }
  }
}

/** Aspetta che la coda non abbia più niente da fare. */
async function finoAllaFine(stato: () => StatoCoda): Promise<void> {
  for (let giro = 0; giro < 200; giro += 1) {
    const s = stato()
    if (s.contando === 0 && !s.lavori.some((l) => l.stato === 'attesa' || l.stato === 'corso')) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('la coda non finisce mai')
}

const file = (nome: string, percorso: string): VoceCamminata =>
  ({ nome, percorso, cartella: false, dimensione: 10 })
const dir = (nome: string, percorso: string): VoceCamminata =>
  ({ nome, percorso, cartella: true, dimensione: 0 })

describe('accodare una cartella', () => {
  it('la cammina e ne mette in fila i file, non la cartella', async () => {
    // È la differenza fra sapere quanto manca e guardare un'animazione: un
    // solo lavoro «cartella» non ha un totale, dieci file sì.
    const { motore, fatti } = motoreFinto({
      remoto: {
        '/casa/roba': [dir('sotto', '/casa/roba/sotto'), file('a.txt', '/casa/roba/a.txt')],
        '/casa/roba/sotto': [file('b.txt', '/casa/roba/sotto/b.txt')]
      }
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/casa/roba', arrivo: 'C:\\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    expect(fatti).toEqual(['/casa/roba/sotto/b.txt', '/casa/roba/a.txt'])
  })

  it('ricostruisce l albero di sotto, non appiattisce tutto in una cartella', async () => {
    // Appiattire e' il modo piu' rapido di sovrascrivere due file diversi che
    // si chiamano tutti e due `index.js`.
    const { motore } = motoreFinto({
      remoto: {
        '/casa/roba': [dir('uno', '/casa/roba/uno')],
        '/casa/roba/uno': [file('index.js', '/casa/roba/uno/index.js')]
      }
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/casa/roba', arrivo: 'C:\\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    expect(coda.stato().lavori[0]?.locale).toBe(join('C:\\giu', 'roba', 'uno', 'index.js'))
    expect(coda.stato().lavori[0]?.nome).toBe('roba/uno/index.js')
  })

  it('mentre conta lo dice', async () => {
    const visti: number[] = []
    const { motore } = motoreFinto({ remoto: { '/casa/roba': [file('a', '/casa/roba/a')] } })
    const coda = creaCoda(motore, (s) => visti.push(s.contando))
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/casa/roba', arrivo: 'C:\\giu', cartella: true }
    ])
    expect(visti).toContain(1)
    expect(visti[visti.length - 1]).toBe(0)
  })
})

describe('caricare una cartella', () => {
  it('crea la strada sul server prima di scriverci dentro', async () => {
    const { motore, cartelleCreate } = motoreFinto({
      locale: {
        'C:\\p\\sito': [dir('css', 'C:\\p\\sito\\css')],
        'C:\\p\\sito\\css': [file('stile.css', 'C:\\p\\sito\\css\\stile.css')]
      }
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'su', origine: 'C:\\p\\sito', arrivo: '/var/www', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    // `mkdir` su una cartella che c'e' gia' fallisce, e va bene: qui interessa
    // che l'albero sia stato tentato per intero, dalla radice in giu'.
    expect(cartelleCreate).toEqual(['/var', '/var/www', '/var/www/sito', '/var/www/sito/css'])
    expect(coda.stato().lavori[0]?.remoto).toBe('/var/www/sito/css/stile.css')
  })
})

describe('quando qualcosa va storto', () => {
  it('un file rotto non ferma gli altri', async () => {
    // La regola che rende una coda utile: chi ha lanciato una copia da mezz'ora
    // vuole i file che si potevano prendere, non il primo intoppo.
    const { motore, fatti } = motoreFinto({
      remoto: { '/r': [file('a', '/r/a'), file('b', '/r/b'), file('c', '/r/c')] },
      rotti: { '/r/b': 'permesso negato' }
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    expect(fatti).toEqual(['/r/a', '/r/c'])
    const rotto = coda.stato().lavori.find((l) => l.remoto === '/r/b')
    expect(rotto?.stato).toBe('errore')
    expect(rotto?.errore).toBe('permesso negato')
  })

  it('riprovare rimette in fila solo quello che era fallito', async () => {
    const rotti: Record<string, string> = { '/r/a': 'rete caduta' }
    const { motore, fatti } = motoreFinto({ remoto: { '/r': [file('a', '/r/a')] }, rotti })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    expect(coda.stato().lavori[0]?.stato).toBe('errore')

    delete rotti['/r/a']
    coda.riprova(coda.stato().lavori[0]?.id ?? '')
    await finoAllaFine(coda.stato)
    expect(fatti).toEqual(['/r/a'])
    expect(coda.stato().lavori[0]?.errore).toBeUndefined()
  })
})

describe('l ordine delle copie', () => {
  it('sullo stesso server va una per volta', async () => {
    // In parallelo su un canale solo non si va piu' veloce: ci si divide la
    // stessa banda e non si capisce piu' quale copia ha fallito.
    const trattieni = new Set(['/r/a'])
    const { motore, fatti, lascia } = motoreFinto({
      remoto: { '/r': [file('a', '/r/a'), file('b', '/r/b')] },
      trattieni
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true }
    ])
    await new Promise((r) => setTimeout(r, 20))
    expect(fatti).toEqual([])
    expect(coda.stato().lavori.filter((l) => l.stato === 'corso')).toHaveLength(1)
    lascia('/r/a')
    await finoAllaFine(coda.stato)
    expect(fatti).toEqual(['/r/a', '/r/b'])
  })

  it('server diversi camminano insieme', async () => {
    // Li' il canale e' un altro davvero: farli aspettare in fila sarebbe una
    // lentezza inventata da noi.
    const trattieni = new Set(['/r/a'])
    const { motore, lascia } = motoreFinto({
      remoto: { '/r': [file('a', '/r/a')], '/s': [file('z', '/s/z')] },
      trattieni
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true },
      { destinazione: 'd2', verso: 'giu', origine: '/s', arrivo: 'C:\\giu', cartella: true }
    ])
    await new Promise((r) => setTimeout(r, 20))
    const suD2 = coda.stato().lavori.find((l) => l.destinazione === 'd2')
    expect(suD2?.stato).toBe('fatto')
    lascia('/r/a')
    await finoAllaFine(coda.stato)
  })
})

describe('togliere roba dalla fila', () => {
  it('annulla quello che non e ancora partito, non quello in corso', async () => {
    // Interrompere una copia a meta' lascia sul disco un file troncato che
    // sembra buono: e' un danno peggiore dell'attesa di un file solo.
    const trattieni = new Set(['/r/a'])
    const { motore, fatti, lascia } = motoreFinto({
      remoto: { '/r': [file('a', '/r/a'), file('b', '/r/b')] },
      trattieni
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true }
    ])
    await new Promise((r) => setTimeout(r, 20))
    coda.annullaTutto()
    expect(coda.stato().lavori.find((l) => l.remoto === '/r/b')?.stato).toBe('annullato')
    expect(coda.stato().lavori.find((l) => l.remoto === '/r/a')?.stato).toBe('corso')
    lascia('/r/a')
    await finoAllaFine(coda.stato)
    expect(fatti).toEqual(['/r/a'])
  })

  it('pulire lascia gli errori finche non li togli tu', async () => {
    const { motore } = motoreFinto({
      remoto: { '/r': [file('a', '/r/a'), file('b', '/r/b')] },
      rotti: { '/r/b': 'niente permessi' }
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    coda.pulisci(false)
    expect(coda.stato().lavori.map((l) => l.stato)).toEqual(['errore'])
    coda.pulisci(true)
    expect(coda.stato().lavori).toEqual([])
  })
})

describe('quanto si parla', () => {
  it('l avanzamento dei byte non si racconta a ogni pezzo', async () => {
    // Un file da un giga manda migliaia di eventi: ridisegnare il pannello a
    // ognuno costa piu' della copia.
    const avvisa = vi.fn()
    const { motore } = motoreFinto({ remoto: { '/r': [file('a', '/r/a')] } })
    const coda = creaCoda(motore, avvisa)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/r', arrivo: 'C:\\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    // Contando, accodato, partito, finito: pochi eventi, non uno per pezzo.
    expect(avvisa.mock.calls.length).toBeLessThan(10)
  })
})

describe('i nomi che manda il server non decidono dove finiscono i file', () => {
  /**
   * Scaricando una cartella si ricostruisce l'albero **con i nomi che manda
   * l'altra parte**. Se uno di quei nomi e' `..`, o contiene una barra, il
   * percorso locale esce dalla cartella scelta: e' il server a decidere dove
   * scriverti i file. La vecchia trappola degli archivi che si estraggono da
   * soli, con la differenza che qui l'altra parte e' una macchina.
   */
  it('la guardia riconosce i nomi che escono', () => {
    expect(nomeSicuro('a.txt')).toBe(true)
    expect(nomeSicuro('con spazio e.punti.txt')).toBe(true)
    expect(nomeSicuro('..')).toBe(false)
    expect(nomeSicuro('.')).toBe(false)
    expect(nomeSicuro('')).toBe(false)
    expect(nomeSicuro('../fuori')).toBe(false)
    expect(nomeSicuro('sotto/altro')).toBe(false)
    expect(nomeSicuro('C:\Windows\system32')).toBe(false)
  })

  it('IL DIFETTO: una voce storta viene saltata, le altre passano', async () => {
    const { motore, fatti } = motoreFinto({
      remoto: {
        '/casa/roba': [
          file('..', '/casa/roba/..'),
          file('buono.txt', '/casa/roba/buono.txt')
        ]
      }
    })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/casa/roba', arrivo: 'C:\giu', cartella: true }
    ])
    await finoAllaFine(coda.stato)
    // Un nome storto non ferma il trasferimento: ferma se stesso.
    expect(fatti).toEqual(['/casa/roba/buono.txt'])
    expect(coda.stato().lavori).toHaveLength(1)
  })

  it('e un file solo con un nome storto non parte, e lo dice', async () => {
    const { motore, fatti } = motoreFinto({ remoto: {} })
    const coda = creaCoda(motore)
    await coda.accoda([
      { destinazione: 'd1', verso: 'giu', origine: '/casa/roba/..', arrivo: 'C:\giu', cartella: false }
    ])
    await finoAllaFine(coda.stato)
    expect(fatti).toEqual([])
    expect(coda.stato().lavori[0]?.stato).toBe('errore')
    expect(coda.stato().lavori[0]?.errore).toContain('non ammesso')
  })
})
