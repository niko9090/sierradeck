import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 12/11: lo spedizioniere non lascia niente di là né di qua. Se il PC che
 * aiuta tace o non conosce più il lavoro, gli si manda comunque «chiudi»
 * (se torna, pulisce); i pacchetti rimasti da un programma chiuso a metà
 * spedizione se ne vanno all'avvio.
 */
const lavoro = (id: string): LavoroAffidato => ({
  id, workspace: 'Prova', cwd: tmpdir(), pcId: 'pc-la', pcNome: 'Portatile', ruolo: 'sviluppatore',
  descrizione: 'x', prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'spedito', inizio: new Date().toISOString()
})

describe('lo spedizioniere pulisce', () => {
  for (const [caso, errore, silenzio] of [
    ['il lavoro sconosciuto', 'lavoro sconosciuto su questo PC', 0],
    ['il PC che non risponde più', 'connessione rifiutata', 10 * 60 * 60_000]
  ] as const) {
    it(`${caso}: non riuscito, e «chiudi» parte lo stesso`, async () => {
      const l = lavoro('r0000000000d1')
      const chiamate: string[] = []
      let ora = Date.now()
      const sp = creaSpedizioniere({
        altri: () => [],
        chiama: async (_pc, percorso) => {
          chiamate.push(percorso)
          if (percorso === '/api/aiuto/stato') { ora += silenzio; throw new Error(errore) }
          return {}
        },
        servizio: async (percorso, corpo) => {
          if (percorso === '/aiuto/giro') return { lavori: l.stato === 'spedito' ? [l] : [] }
          if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
          return {}
        },
        cartella: mkdtempSync(join(tmpdir(), 'spedizioni-')), log: () => undefined, dorme: async () => undefined, adesso: () => ora
      })
      try {
        await sp.giro()
        const fine = Date.now() + 5000
        while (!chiamate.includes('/api/aiuto/chiudi') && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 20))
      } finally { sp.ferma() }
      expect(l.stato).toBe('fallito')
      expect(chiamate).toContain('/api/aiuto/chiudi')
    })
  }

  it('all’avvio via i pacchetti rimasti nella cartella delle spedizioni, e solo quelli', () => {
    const cartella = join(mkdtempSync(join(tmpdir(), 'spedizioni-')), 'aiuto-spedizioni')
    mkdirSync(cartella, { recursive: true })
    for (const f of ['r0123456789ab.bundle', 'r0123456789ab-ritorno.bundle', 'leggimi.txt']) writeFileSync(join(cartella, f), 'x')
    const sp = creaSpedizioniere({ altri: () => [], chiama: async () => ({}), servizio: async () => ({}), cartella, log: () => undefined })
    sp.ferma()
    expect(existsSync(join(cartella, 'r0123456789ab.bundle'))).toBe(false)
    expect(existsSync(join(cartella, 'r0123456789ab-ritorno.bundle'))).toBe(false)
    expect(existsSync(join(cartella, 'leggimi.txt'))).toBe(true)
    // Una cartella che non c'è ancora: nessun errore.
    creaSpedizioniere({ altri: () => [], chiama: async () => ({}), servizio: async () => ({}), cartella: join(cartella, 'non-c-e'), log: () => undefined }).ferma()
  })
})
