import { describe, it, expect } from 'vitest'
import { componiAvvisi, type FontiAvvisi } from '../../src/renderer/avvisi'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'o', cwd: 'C:\\p',
      criteri: [{ descrizione: 'c', soddisfatto: false }],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    }),
    ...over
  }
}

function fonti(over: Partial<FontiAvvisi> = {}): FontiAvvisi {
  return {
    accesso: { autenticato: true },
    servizioRaggiungibile: true,
    autopiloti: [],
    preparazione: { claude: 'C:\\c\\claude.exe', avvisi: [] },
    ...over
  }
}

describe('componiAvvisi', () => {
  it('non dice niente quando va tutto bene', () => {
    // Un avviso che compare sempre smette di essere un avviso.
    expect(componiAvvisi(fonti())).toEqual([])
  })

  it('l accesso mancante viene prima di tutto', () => {
    // Senza accesso nessuna chat parte: ogni altro avviso e' una conseguenza.
    const avvisi = componiAvvisi(fonti({
      accesso: { autenticato: false, motivo: 'Manca l’accesso a Claude Code' },
      servizioRaggiungibile: false
    }))
    expect(avvisi[0]?.gravita).toBe('blocco')
    expect(avvisi[0]?.testo).toContain('accesso')
  })

  it('avvisa quando il servizio autopilota non risponde', () => {
    const avvisi = componiAvvisi(fonti({ servizioRaggiungibile: false }))
    expect(avvisi).toHaveLength(1)
    expect(avvisi[0]?.testo.toLowerCase()).toContain('servizio')
    expect(avvisi[0]?.azione).toBe('riavviaServizio')
  })

  it('avvisa quando un autopilota aspetta una risposta', () => {
    const avvisi = componiAvvisi(fonti({ autopiloti: [ap({ stato: 'attesa' })] }))
    expect(avvisi[0]?.gravita).toBe('attenzione')
    expect(avvisi[0]?.azione).toBe('apriDomanda')
  })

  it('conta gli autopiloti fermi invece di ripetersi per ognuno', () => {
    // Tre righe identiche sono rumore: il numero dice la stessa cosa in una.
    const avvisi = componiAvvisi(fonti({
      autopiloti: [
        ap({ id: 'a', stato: 'sospeso', motivoSospensione: 'stallo' }),
        ap({ id: 'b', stato: 'sospeso', motivoSospensione: 'stallo' }),
        ap({ id: 'c', stato: 'lavoro' })
      ]
    }))
    expect(avvisi).toHaveLength(1)
    expect(avvisi[0]?.testo).toContain('2')
  })

  it('non avvisa per un autopilota finito', () => {
    // Ha fatto il suo lavoro: e' una notizia buona, non un avviso.
    expect(componiAvvisi(fonti({ autopiloti: [ap({ stato: 'finito' })] }))).toEqual([])
  })

  it('mette l attesa prima della sospensione', () => {
    // L'attesa si sblocca in dieci secondi rispondendo; una sospensione va
    // capita. Prima quello che si risolve subito.
    const avvisi = componiAvvisi(fonti({
      autopiloti: [ap({ id: 'a', stato: 'sospeso' }), ap({ id: 'b', stato: 'attesa' })]
    }))
    expect(avvisi[0]?.azione).toBe('apriDomanda')
  })

  it('ogni avviso ha una chiave stabile, per non far ballare l elenco', () => {
    const primi = componiAvvisi(fonti({ servizioRaggiungibile: false }))
    const secondi = componiAvvisi(fonti({ servizioRaggiungibile: false }))
    expect(primi.map((a) => a.id)).toEqual(secondi.map((a) => a.id))
  })
})

describe('un avviso resta una riga', () => {
  it('accorcia il motivo di una sospensione invece di riversarlo', () => {
    // Visto dal vivo: un autopilota fermo per stallo ha riempito la banda con
    // otto righe di output SSH, e all'avvio sembrava che fosse esploso il
    // programma. Il motivo per intero sta nel pannello, non qui.
    const lungo = 'stallo: 3 tentativi con lo stesso esito — ' + 'x'.repeat(600)
    const [avviso] = componiAvvisi({
      accesso: { autenticato: true },
      servizioRaggiungibile: true,
      autopiloti: [ap({ nome: 'Audit', stato: 'sospeso', motivoSospensione: lungo })]
    })
    expect(avviso?.testo.length).toBeLessThanOrEqual(160)
    expect(avviso?.testo).toContain('Audit')
    expect(avviso?.testo).toContain('stallo')
  })

  it('dice subito che si e fermato un autopilota, non il programma', () => {
    const [avviso] = componiAvvisi({
      accesso: { autenticato: true },
      servizioRaggiungibile: true,
      autopiloti: [ap({ nome: 'Audit', stato: 'sospeso', motivoSospensione: 'stallo' })]
    })
    expect(avviso?.testo.startsWith('L’autopilota')).toBe(true)
  })
})

describe('componiAvvisi — preparazione', () => {
  it('Claude Code mancante viene prima persino dell accesso', () => {
    // Non c'e' niente in cui accedere finche' il programma non c'e': mostrare
    // «manca l'accesso» manderebbe a cercare la causa sbagliata, ed e' proprio
    // quello che vedeva chi apriva SierraDeck senza aver mai installato Claude
    // Code — riquadri vuoti e nessuna spiegazione.
    const avvisi = componiAvvisi(fonti({
      preparazione: { avvisi: [] },
      accesso: { autenticato: false, motivo: 'Manca l’accesso a Claude Code' }
    }))
    expect(avvisi).toHaveLength(1)
    expect(avvisi[0]?.gravita).toBe('blocco')
    expect(avvisi[0]?.azione).toBe('apriPreparazione')
    expect(avvisi[0]?.testo).toContain('Claude Code')
  })

  it('con Claude Code presente si torna a parlare di accesso', () => {
    const avvisi = componiAvvisi(fonti({
      preparazione: { claude: 'C:\\c\\claude.exe', avvisi: [] },
      accesso: { autenticato: false, motivo: 'Manca l’accesso a Claude Code' }
    }))
    expect(avvisi[0]?.azione).toBe('apriAccesso')
  })

  it('cio che manca e va solo detto non blocca, e resta un avviso solo', () => {
    // Node.js e Git non impediscono di lavorare: dirlo tre volte in tre righe
    // trasformerebbe la banda in arredamento.
    const avvisi = componiAvvisi(fonti({
      preparazione: { claude: 'C:\\c\\claude.exe', avvisi: ['manca Node.js', 'manca Git'] }
    }))
    expect(avvisi).toHaveLength(1)
    expect(avvisi[0]?.gravita).toBe('attenzione')
    expect(avvisi[0]?.azione).toBe('apriPreparazione')
  })

  it('senza notizie dalla preparazione non inventa avvisi', () => {
    // Lo stato arriva dal Core con un giro di IPC: nell'istante prima che
    // risponda non si deve gridare che manca tutto.
    expect(componiAvvisi(fonti({ preparazione: undefined }))).toEqual([])
  })
})
