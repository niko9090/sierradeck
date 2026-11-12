import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import type { Aiutante, LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 12/11: dal lato di chi chiede. Lo spedizioniere sa che un PC è SierraDeck
 * Aiutante (dal battito o dalla risposta dei posti) e lo dice al servizio,
 * che lo sceglie per primo; all'avvio di un lavoro manda chi firma i commit
 * (nome ed email di git del progetto), perché su un Aiutante appena preparato
 * git non li sa.
 */
describe('lo spedizioniere e gli Aiutanti', () => {
  it('«aiutante» dal battito o dalla risposta dei posti arriva al servizio', async () => {
    let lista: Aiutante[] = []
    const sp = creaSpedizioniere({
      altri: () => [{ pcId: 'dal-battito', nome: 'A', aiutante: true }, { pcId: 'dalla-risposta', nome: 'B' }, { pcId: 'normale', nome: 'C' }],
      chiama: async (pc) => ({ modo: 'dedicato', liberi: 2, ...(pc === 'dalla-risposta' ? { programma: 'aiutante' } : {}) }),
      servizio: async (percorso, corpo) => { if (percorso === '/aiuto/giro') lista = corpo?.aiutanti as Aiutante[]; return { lavori: [] } },
      cartella: mkdtempSync(join(tmpdir(), 'spedizioni-')), log: () => undefined
    })
    try { await sp.giro() } finally { sp.ferma() }
    const per = Object.fromEntries(lista.map((a) => [a.pcId, a.programma]))
    expect(per).toEqual({ 'dal-battito': 'aiutante', 'dalla-risposta': 'aiutante', normale: undefined })
  })

  it('l’avvio porta l’autore di git del progetto', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'spedizioni-'))
    const l: LavoroAffidato = {
      id: 'r0000000000a1', workspace: 'Prova', cwd: tmpdir(), pcId: 'pc-aiu', pcNome: 'Aiutante', ruolo: 'sviluppatore',
      descrizione: 'x', prompt: 'fai x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString()
    }
    const avvii: Record<string, unknown>[] = []
    const git = async (args: string[]): Promise<string> => {
      if (args[0] === 'symbolic-ref') return 'main\n'
      if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`
      if (args[0] === 'bundle') { writeFileSync(args[2]!, Buffer.from('pacchetto')); return '' }
      if (args[0] === 'config' && args[1] === 'user.name') return 'Mario Rossi\n'
      if (args[0] === 'config' && args[1] === 'user.email') return 'mario@example.com\n'
      return ''
    }
    const sp = creaSpedizioniere({
      altri: () => [],
      chiama: async (_pc, percorso, corpo) => {
        if (percorso === '/api/aiuto/avvia') avvii.push(corpo ?? {})
        if (percorso === '/api/aiuto/stato') return { id: l.id, stato: 'finito', byte: 0 }
        return {}
      },
      servizio: async (percorso, corpo) => {
        if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' || l.stato === 'spedito' ? [l] : [] }
        if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
        return {}
      },
      cartella, git, log: () => undefined, dorme: async () => undefined
    })
    try {
      await sp.giro()
      const fine = Date.now() + 5000
      while (avvii.length === 0 && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 20))
    } finally { sp.ferma() }
    expect(avvii[0]?.autore).toEqual({ nome: 'Mario Rossi', email: 'mario@example.com' })
  })
})
