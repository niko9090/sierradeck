import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import { risorseMancantiDelMotivo } from '../../src/shared/aiuto-riassegna'
import type { EventoAiuto } from '../../src/shared/eventi-aiuto'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 16/11: il registro dei passaggi di mano riceve anche «affidato», «risorsa-mancante»
 * e «rifiutato», negli stessi punti del flusso di «riassegnato».
 */

const nuovoLavoro = (extra: Partial<LavoroAffidato> = {}): LavoroAffidato => ({
  id: 'r0000000000c1', workspace: 'Prova', cwd: tmpdir(), pcId: 'pc-uno', pcNome: 'Uno', ruolo: 'sviluppatore',
  descrizione: 'x', compito: 'k-9', prompt: 'fai x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString(), ...extra
})

type Esito = { stato: string; causa?: string; motivo?: string }

/** Un solo PC (`pc-uno`), senza altri a cui passare: `avvia` può rifiutare, `stato` dice come va. */
async function prova(l: LavoroAffidato, comportamento: { rifiuta?: string; esito?: Esito }): Promise<EventoAiuto[]> {
  const eventi: EventoAiuto[] = []
  const git = async (args: string[]): Promise<string> => {
    if (args[0] === 'symbolic-ref') return 'main\n'
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`
    if (args[0] === 'bundle') { writeFileSync(args[2]!, Buffer.from('pacchetto')); return '' }
    return ''
  }
  const sp = creaSpedizioniere({
    altri: () => [],
    chiama: async (_pcId, percorso) => {
      if (percorso === '/api/aiuto/avvia') { if (comportamento.rifiuta !== undefined) throw new Error(comportamento.rifiuta); return {} }
      if (percorso === '/api/aiuto/stato') return { id: l.id, ...(comportamento.esito ?? { stato: 'finito' }), byte: 0 }
      return {}
    },
    servizio: async (percorso, corpo) => {
      if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' || l.stato === 'spedito' ? [{ ...l }] : [] }
      if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
      return {}
    },
    cartella: mkdtempSync(join(tmpdir(), 'spedizioni-')), git, log: () => undefined, errore: () => undefined, avviso: () => undefined,
    registra: (e) => { eventi.push(e) }, dorme: async () => undefined
  })
  try {
    await sp.giro()
    const fine = Date.now() + 8000
    while ((l.stato === 'da-spedire' || l.stato === 'spedito' || sp.inMano().length > 0) && Date.now() < fine) {
      await new Promise((ok) => setTimeout(ok, 20))
    }
  } finally { sp.ferma() }
  return eventi
}

describe('registro dei passaggi di mano: gli altri eventi', () => {
  it('affidato: il lavoro arriva all’altro PC', async () => {
    const eventi = await prova(nuovoLavoro(), { esito: { stato: 'finito' } })
    expect(eventi.map((e) => e.tipo)).toEqual(['affidato'])
    expect(eventi[0]).toMatchObject({ lavoroId: 'r0000000000c1', compito: 'k-9', aPc: 'Uno', motivo: 'mandato a Uno' })
  })

  it('risorsa-mancante: dice quali risorse dichiarate mancano', async () => {
    const l = nuovoLavoro({ risorse: [{ tipo: 'percorso-rete', valore: '\\\\nas\\dati', perche: 'i dati', indispensabile: true }] })
    const eventi = await prova(l, { esito: { stato: 'fallito', causa: 'risorsa', motivo: 'su quel PC manca una risorsa indispensabile al lavoro (cartella, percorso di rete, programma o variabile) — percorso di rete \\\\nas\\dati non c’è su questo PC' } })
    const e = eventi.find((x) => x.tipo === 'risorsa-mancante')
    expect(e).toBeDefined()
    expect(e).toMatchObject({ aPc: 'Uno', risorsa: '\\\\nas\\dati' })
    expect(e!.motivo.length).toBeGreaterThan(0)
  })

  it('rifiutato: il PC risponde di no, con il motivo', async () => {
    const eventi = await prova(nuovoLavoro(), { rifiuta: 'questo PC non presta più i suoi posti' })
    const e = eventi.find((x) => x.tipo === 'rifiutato')
    expect(e).toBeDefined()
    expect(e!.motivo).toMatch(/non presta più i suoi posti/u)
    expect(eventi.some((x) => x.tipo === 'affidato')).toBe(false)
  })

  it('rifiutato: anche senza accesso a Claude; un PC che non risponde invece non è un rifiuto', async () => {
    const senzaAccesso = await prova(nuovoLavoro(), { esito: { stato: 'fallito', causa: 'accesso', motivo: 'accesso scaduto' } })
    expect(senzaAccesso.map((x) => x.tipo)).toContain('rifiutato')
    const giu = await prova(nuovoLavoro(), { rifiuta: 'non raggiungibile' })
    expect(giu.some((x) => x.tipo === 'rifiutato')).toBe(false)
  })

  it('un percorso ricavato dal testo non è una risorsa dichiarata: si legge il testo del motivo', () => {
    expect(risorseMancantiDelMotivo('x — cartella D:\\lavoro non c’è', [])).toBe('cartella D:\\lavoro non c’è')
    expect(risorseMancantiDelMotivo('x — cartella D:\\lavoro non c’è', [{ tipo: 'cartella', valore: 'D:\\lavoro', perche: '', indispensabile: false }])).toBe('cartella D:\\lavoro non c’è')
  })
})
