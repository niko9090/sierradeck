import { describe, it, expect, vi } from 'vitest'
import { leggiConsegne, avviaRitiro, versoIlSuoWorkspace, type Consegna } from '../../src/main/autopilota-consegne'

const buona = {
  id: 'c-1',
  autopilotaId: 'ap-1',
  chatId: 'ch-1',
  cwd: 'C:\\p',
  sessionId: 'sess-1',
  titolo: 'Notte',
  cosa: 'scrivi',
  testo: 'continua'
}

describe('leggere le consegne', () => {
  it('legge quelle buone', () => {
    expect(leggiConsegne({ consegne: [buona] })).toHaveLength(1)
  })

  it('non solleva mai, qualunque cosa arrivi', () => {
    // Un servizio vecchio rimasto vivo dopo un aggiornamento non deve far
    // cadere il Gestore: deve far cadere la consegna.
    for (const rotta of [undefined, null, 'testo', 42, {}, { consegne: 'no' }, { consegne: [null, 7] }]) {
      expect(() => leggiConsegne(rotta)).not.toThrow()
      expect(leggiConsegne(rotta)).toEqual([])
    }
  })

  it('scarta le istruzioni vuote', () => {
    // Premere invio in una chat senza dirle niente la farebbe ripartire a
    // vuoto, e l'autopilota aspetterebbe la risposta a una domanda mai fatta.
    expect(leggiConsegne({ consegne: [{ ...buona, testo: '   ' }] })).toEqual([])
  })

  it('ma un interrompi non ha bisogno di testo', () => {
    const lette = leggiConsegne({ consegne: [{ ...buona, cosa: 'interrompi', testo: '' }] })
    expect(lette.map((c) => c.cosa)).toEqual(['interrompi'])
  })

  it('scarta chi non dice quale chat o quale sessione', () => {
    expect(leggiConsegne({ consegne: [{ ...buona, chatId: '' }] })).toEqual([])
    expect(leggiConsegne({ consegne: [{ ...buona, sessionId: '' }] })).toEqual([])
  })
})

describe('il ritiro', () => {
  it('consegna quello che trova', async () => {
    const viste: Consegna[] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [buona] }),
      consegna: (c) => { viste.push(c) },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(viste.length).toBeGreaterThan(0))
    ferma()
    expect(viste[0]?.testo).toBe('continua')
  })

  it('un giro che fallisce non ferma i successivi', async () => {
    // Il servizio spento non è un guasto: è lo stato normale finché nessuno ha
    // creato un autopilota.
    let giri = 0
    const viste: Consegna[] = []
    const ferma = avviaRitiro({
      chiedi: () => {
        giri += 1
        if (giri < 3) return Promise.reject(new Error('servizio spento'))
        return Promise.resolve({ consegne: [buona] })
      },
      consegna: (c) => { viste.push(c) },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(viste.length).toBeGreaterThan(0))
    ferma()
  })

  it('smette quando glielo si dice', async () => {
    let giri = 0
    const ferma = avviaRitiro({
      chiedi: () => { giri += 1; return Promise.resolve({}) },
      consegna: () => undefined,
      attesaMs: 5
    })
    await vi.waitFor(() => expect(giri).toBeGreaterThan(0))
    ferma()
    const dopoLoStop = giri
    await new Promise((r) => setTimeout(r, 30))
    // Al più il giro già cominciato: nessuno nuovo.
    expect(giri).toBeLessThanOrEqual(dopoLoStop + 1)
  })
})

describe('dove va consegnata', () => {
  // Due sorgenti, e un ordine che conta. Quella dell'autopilota vale sempre:
  // e' una decisione, non una deduzione. Cercare la sessione nei workspace
  // salvati e' un ripiego per gli autopiloti nati prima, e per una chat che
  // deve ancora nascere non trova niente — che e' esattamente come le chat
  // finivano nel workspace che avevi davanti.
  const c: Consegna = { ...buona, cosa: 'scrivi' } as Consegna

  it('dove ha deciso l autopilota', () => {
    const suo = versoIlSuoWorkspace({ ...c, workspace: 'lavoro' }, () => 'finanza')
    expect(suo.workspace).toBe('lavoro')
  })

  it('e se non ha deciso, dove la chat e gia salvata', () => {
    expect(versoIlSuoWorkspace(c, () => 'finanza').workspace).toBe('finanza')
  })

  it('e se non e salvata da nessuna parte, da nessuna parte', () => {
    // Nasce dove sei: e' il comportamento di sempre per una chat nuova aperta
    // da chi non ha detto dove volerla.
    expect(versoIlSuoWorkspace(c, () => undefined).workspace).toBeUndefined()
  })

  it('non si cerca la sessione quando la decisione c e gia', () => {
    // Non e' un risparmio: leggere `workspaces.json` a ogni consegna e' I/O su
    // un percorso che scatta ogni secondo e mezzo.
    const cerca = vi.fn(() => 'finanza')
    versoIlSuoWorkspace({ ...c, workspace: 'lavoro' }, cerca)
    expect(cerca).not.toHaveBeenCalled()
  })
})

describe('la conferma al servizio', () => {
  it('conferma solo quello che e stato davvero consegnato', async () => {
    // La conferma va **dopo** la consegna, mai prima: confermare per poi non
    // riuscire a scrivere e' esattamente il difetto che si sta chiudendo — il
    // servizio toglierebbe l'istruzione dalla coda e nessuno l'avrebbe scritta.
    const confermati: string[][] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [buona] }),
      // Nessuna finestra dove metterla: non si conferma.
      consegna: () => false,
      conferma: async (ids) => { confermati.push(ids) },
      attesaMs: 5
    })
    await new Promise((r) => setTimeout(r, 40))
    ferma()
    expect(confermati).toEqual([])
  })

  it('conferma quando la consegna riesce', async () => {
    const confermati: string[][] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [buona] }),
      consegna: () => true,
      conferma: async (ids) => { confermati.push(ids) },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(confermati.length).toBeGreaterThan(0))
    ferma()
    expect(confermati[0]).toEqual([buona.id])
  })

  it('la stessa consegna non si scrive due volte', async () => {
    // Il prezzo dell'ack e' che una consegna puo' tornare: presa, conferma
    // persa, riconsegnata. Scriverla due volte dentro una chat sarebbe peggio
    // che perderla — la chat lavorerebbe due volte sullo stesso ordine, e
    // l'autopilota si troverebbe due risposte a una domanda sola.
    let scritte = 0
    const confermati: string[][] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [buona] }),
      consegna: () => { scritte += 1; return true },
      conferma: async (ids) => { confermati.push(ids) },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(confermati.length).toBeGreaterThan(2))
    ferma()
    expect(scritte).toBe(1)
    // Riconfermata a ogni giro, pero': la conferma di prima puo' essersi persa.
    expect(confermati.every((ids) => ids[0] === buona.id)).toBe(true)
  })

  it('senza conferma configurata si comporta come prima', async () => {
    // Un servizio vecchio rimasto vivo dopo un aggiornamento non ha la rotta di
    // conferma: il ritiro deve continuare a funzionare lo stesso.
    const viste: Consegna[] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [buona] }),
      consegna: (c) => { viste.push(c); return true },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(viste.length).toBeGreaterThan(0))
    ferma()
  })
})
