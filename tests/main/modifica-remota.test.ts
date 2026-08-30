import { describe, it, expect } from 'vitest'
import {
  creaModificheRemote, daRisalire, type DipendenzeModifiche, type Impronta
} from '../../src/main/trasferimenti/modifica-remota'

/**
 * Aprire un file remoto, modificarlo, vederlo risalire.
 *
 * Le tre cose che si sbagliano non sono la logica: sono i tempi e gli eventi.
 * Un salvataggio non è un evento solo, un editor non riscrive il file che hai
 * aperto, e una data che cambia da sola non è una modifica.
 */
function banco(over: Partial<DipendenzeModifiche> = {}) {
  const caricati: string[] = []
  const aperti: string[] = []
  let impronta: Impronta | undefined = { dimensione: 10, quando: 100 }
  let sveglia: (() => void) | undefined
  let attese: (() => void)[] = []
  const scaricati: string[] = []
  let smesso = 0

  const deps: DipendenzeModifiche = {
    scarica: async (_d, remoto) => { scaricati.push(remoto) },
    carica: async (_d, _l, remoto) => { caricati.push(remoto) },
    apriFuori: async (l) => { aperti.push(l) },
    cartellaDiLavoro: (_d, remoto) => `/tmp/lav/${remoto.split('/').pop() ?? 'x'}`,
    sorveglia: (_cartella, _nome, quando) => {
      sveglia = quando
      return () => { smesso += 1 }
    },
    impronta: () => impronta,
    // L'attesa non passa: la fa scattare il test, quando vuole.
    attendi: (_ms, cosa) => {
      attese.push(cosa)
      return () => { attese = attese.filter((x) => x !== cosa) }
    },
    adesso: () => 1_000,
    ...over
  }

  return {
    deps,
    caricati,
    aperti,
    scaricati,
    smesso: (): number => smesso,
    salva: (nuova: Impronta): void => { impronta = nuova },
    tocca: (): void => { sveglia?.() },
    scatta: (): void => { const da = [...attese]; attese = []; for (const f of da) f() }
  }
}

describe('cosa vale come modifica', () => {
  it('dimensione o data diverse: e cambiato', () => {
    expect(daRisalire({ dimensione: 10, quando: 100 }, { dimensione: 11, quando: 100 })).toBe(true)
    expect(daRisalire({ dimensione: 10, quando: 100 }, { dimensione: 10, quando: 200 })).toBe(true)
  })

  it('identico: non si risale', () => {
    // Ricaricare una copia identica cambierebbe la data sul server, e da lì in
    // poi il confronto fra i due lati direbbe «più nuovo di là» per un file che
    // nessuno ha toccato.
    expect(daRisalire({ dimensione: 10, quando: 100 }, { dimensione: 10, quando: 100 })).toBe(false)
  })

  it('senza un termine di paragone si risale', () => {
    expect(daRisalire(undefined, { dimensione: 10, quando: 100 })).toBe(true)
  })
})

describe('aprire e sorvegliare', () => {
  it('scarica, apre col programma di sistema, e resta in ascolto', async () => {
    const b = banco()
    const m = creaModificheRemote(b.deps)
    const f = await m.apri('d1', '/var/www/indice.html', 'indice.html')
    expect(b.scaricati).toEqual(['/var/www/indice.html'])
    expect(b.aperti).toEqual([f.locale])
    expect(m.aperti()).toHaveLength(1)
  })

  it('riaprire lo stesso file non lo riscarica', async () => {
    // Riscaricarlo butterebbe via le modifiche non salvate di chi lo ha ancora
    // davanti agli occhi.
    const b = banco()
    const m = creaModificheRemote(b.deps)
    await m.apri('d1', '/a.txt', 'a.txt')
    await m.apri('d1', '/a.txt', 'a.txt')
    expect(b.scaricati).toHaveLength(1)
    expect(b.aperti).toHaveLength(2)
  })

  it('un salvataggio risale una volta sola, non a ogni evento', async () => {
    // Ctrl+S produce scrittura, rinomina e metadati: caricare a ogni evento
    // manda lo stesso file tre volte, e sul terzo il server ha in mano il primo.
    const b = banco()
    const m = creaModificheRemote(b.deps)
    await m.apri('d1', '/a.txt', 'a.txt')
    b.salva({ dimensione: 12, quando: 200 })
    b.tocca(); b.tocca(); b.tocca()
    b.scatta()
    await Promise.resolve()
    expect(b.caricati).toEqual(['/a.txt'])
  })

  it('un movimento che non cambia niente non risale', async () => {
    const b = banco()
    const m = creaModificheRemote(b.deps)
    await m.apri('d1', '/a.txt', 'a.txt')
    b.tocca()
    b.scatta()
    await Promise.resolve()
    expect(b.caricati).toEqual([])
  })

  it('un errore non stacca il collegamento: il prossimo salvataggio riprova', async () => {
    let rifiuta = true
    const b = banco({
      carica: () => rifiuta
        ? Promise.reject(new Error('permesso negato'))
        : Promise.resolve()
    })
    const m = creaModificheRemote(b.deps)
    await m.apri('d1', '/a.txt', 'a.txt')
    b.salva({ dimensione: 12, quando: 200 })
    b.tocca(); b.scatta()
    await new Promise((r) => setTimeout(r, 0))
    expect(m.aperti()[0]?.errore).toContain('permesso negato')
    // Ancora sorvegliato: si riprova al salvataggio dopo.
    rifiuta = false
    b.salva({ dimensione: 13, quando: 300 })
    b.tocca(); b.scatta()
    await new Promise((r) => setTimeout(r, 0))
    expect(m.aperti()[0]?.risalite).toBe(1)
    expect(m.aperti()[0]?.errore).toBeUndefined()
  })

  it('chiudere smette di sorvegliare', async () => {
    const b = banco()
    const m = creaModificheRemote(b.deps)
    await m.apri('d1', '/a.txt', 'a.txt')
    m.chiudi('d1', '/a.txt')
    expect(b.smesso()).toBe(1)
    expect(m.aperti()).toEqual([])
  })

  it('chiudere tutto non lascia niente in ascolto', async () => {
    // Un sorvegliante lasciato vivo tiene aperto un handle sul filesystem per
    // tutta la vita del processo, e su un programma che sta giorni acceso se ne
    // accumula uno per ogni file mai aperto.
    const b = banco()
    const m = creaModificheRemote(b.deps)
    await m.apri('d1', '/a.txt', 'a.txt')
    await m.apri('d1', '/b.txt', 'b.txt')
    m.chiudiTutto()
    expect(b.smesso()).toBe(2)
    expect(m.aperti()).toEqual([])
  })
})
