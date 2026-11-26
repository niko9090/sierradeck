import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import { livelloRigaAiuto } from '../../src/shared/aiuto-esito'
import { causaDalTesto, causaDelFallimento, motivoDelRisultato, motivoSuPc, pauseAiuti, pcInPausa, PAUSA_ACCESSO_MS, PAUSA_IRRAGGIUNGIBILE_MS } from '../../src/shared/aiuto-esito'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'
import { chiaveErrore, raggruppa, type ArrivoLetto } from '../../src/main/errori-arrivati-lavoro'

/** k-152: un PC con l'accesso Claude scaduto non riceve più lavoro; il motivo vero arriva; i fallimenti uguali sono un gruppo solo. */

const T0 = Date.parse('2026-11-13T10:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
let n = 0
const lavoro = (p: Partial<LavoroAffidato> & { fineMs?: number }): LavoroAffidato => {
  const { fineMs, ...resto } = p
  n++
  return {
    id: `r${n.toString(16).padStart(12, '0')}`, workspace: 'progetto-a', cwd: '/progetti/a', pcId: 'pc-finto', pcNome: 'PC-Finto',
    ruolo: 'sviluppatore', descrizione: `k-${n}: cosa`, compito: `k-${n}`, prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [],
    stato: 'fallito', inizio: iso((fineMs ?? T0) - 20_000), fine: iso(fineMs ?? T0), motivo: 'lo specialista ha chiuso con un errore', ...resto
  }
}

describe('accesso scaduto: il PC esce subito', () => {
  const testo = 'Failed to authenticate: OAuth session expired and could not be refreshed'

  it('riconosce il testo vero della CLI come accesso', () => {
    expect(causaDalTesto(testo)).toBe('accesso')
    expect(motivoDelRisultato({ tipo: 'error', testo }).causa).toBe('accesso')
  })

  it('un solo fallimento per accesso mette il PC in pausa per tutti i compiti e i progetti', () => {
    const l = lavoro({ causa: 'accesso' })
    const pause = pauseAiuti([l], T0 + 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeDefined()
    expect(pcInPausa(pause, 'altro-pc', 'progetto-a', 'k-999')).toBeUndefined()
    expect(pcInPausa(pauseAiuti([l], T0 + PAUSA_ACCESSO_MS + 1), 'pc-finto', 'progetto-a', 'k-999')).toBeUndefined()
  })

  it('un lavoro riuscito dopo il fallimento rimette il PC in gioco', () => {
    const pause = pauseAiuti([lavoro({ causa: 'accesso' }), lavoro({ stato: 'finito', fineMs: T0 + 30_000, motivo: undefined })], T0 + 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeUndefined()
  })

  it('un PC che non risponde sta fuori un quarto d’ora, poi torna', () => {
    const l = lavoro({ causa: 'pc', motivo: 'PC-Finto non risponde da 5 minuti' })
    expect(pcInPausa(pauseAiuti([l], T0 + 60_000), 'pc-finto', 'progetto-a', 'k-1')).toBeDefined()
    expect(pcInPausa(pauseAiuti([l], T0 + PAUSA_IRRAGGIUNGIBILE_MS + 1), 'pc-finto', 'altro-progetto', 'k-1')).toBeUndefined()
  })

  it('un compito fallito per colpa sua (prove rosse) non toglie il PC agli altri', () => {
    const pause = pauseAiuti([lavoro({ causa: 'compito' })], T0 + 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeUndefined()
  })

  it('un PC di prima che manda causa «sconosciuta» ma col testo dell’accesso scaduto è in pausa lo stesso (k-138)', () => {
    const motivo = `lo specialista ha chiuso con un errore (tipo success; «${testo}»)`
    const l = lavoro({ causa: 'sconosciuta', motivo })
    // 22 minuti dopo (come alle 14:23 dopo le 14:01) il PC non riceve lavoro, per nessun compito né progetto.
    const pause = pauseAiuti([l], T0 + 22 * 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeDefined()
    expect(causaDelFallimento('sconosciuta', motivo)).toBe('accesso')
    expect(causaDelFallimento(undefined, 'lo specialista ha chiuso con un errore', testo)).toBe('accesso')
    expect(causaDelFallimento('limite', motivo)).toBe('limite')
  })

  it('a ogni fallimento di accesso di fila l’attesa cresce: 1 h, 2 h, 6 h', () => {
    const h = 60 * 60_000
    const uno = lavoro({ causa: 'accesso' })
    const due = lavoro({ causa: 'accesso', fineMs: T0 + h + 60_000 })
    const tre = lavoro({ causa: 'accesso', fineMs: T0 + 4 * h })
    const inPausa = (l: LavoroAffidato[], t: number): boolean => pcInPausa(pauseAiuti(l, t), 'pc-finto', 'progetto-a', 'k-999') !== undefined
    expect(inPausa([uno], T0 + h - 1)).toBe(true)
    expect(inPausa([uno], T0 + h + 1)).toBe(false)
    expect(inPausa([uno, due], due.fine === undefined ? 0 : Date.parse(due.fine) + 2 * h - 1)).toBe(true)
    expect(inPausa([uno, due], Date.parse(due.fine!) + 2 * h + 1)).toBe(false)
    expect(inPausa([uno, due, tre], Date.parse(tre.fine!) + 6 * h - 1)).toBe(true)
    expect(inPausa([uno, due, tre], Date.parse(tre.fine!) + 6 * h + 1)).toBe(false)
    // Un lavoro riuscito riporta tutto a come prima.
    const ok = lavoro({ stato: 'finito', fineMs: T0 + 5 * h, motivo: undefined })
    const quarto = lavoro({ causa: 'accesso', fineMs: T0 + 6 * h })
    expect(inPausa([uno, due, tre, ok, quarto], T0 + 6 * h + h + 1)).toBe(false)
  })

  it('il motivo dice «accesso Claude scaduto su <PC>»', () => {
    const { motivo, causa } = motivoDelRisultato({ tipo: 'error', testo })
    const m = motivoSuPc(motivo, causa, 'PC-Finto')
    expect(m.startsWith('accesso Claude scaduto su PC-Finto')).toBe(true)
    expect(m).toContain('Failed to authenticate')
    expect(motivoSuPc('altro', 'compito', 'PC-Finto')).toBe('altro')
  })
})

describe('PC che non risponde: avviso, non errore', () => {
  const radice = mkdtempSync(join(tmpdir(), 'aiuto-fuori-'))
  afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows tiene i file un attimo */ } })

  it('solo la causa «pc» scende a livello avviso', () => {
    expect(livelloRigaAiuto('pc')).toBe('avviso')
    for (const c of ['accesso', 'compito', 'progetto', 'sconosciuta', 'limite'] as const) expect(livelloRigaAiuto(c)).toBe('errore')
    expect(livelloRigaAiuto(undefined)).toBe('errore')
  })

  it('la pausa del PC irraggiungibile resta applicata, quella per accesso scaduto pure', () => {
    const pc = lavoro({ causa: 'pc', motivo: 'non sono riuscito a spedirlo a PC-Finto: acceso ma non risponde' })
    expect(pcInPausa(pauseAiuti([pc], T0 + 60_000), 'pc-finto', 'altro-progetto', 'k-1')).toBeDefined()
    const accesso = lavoro({ causa: 'accesso' })
    expect(pcInPausa(pauseAiuti([accesso], T0 + 60_000), 'pc-finto', 'altro-progetto', 'k-1')).toBeDefined()
  })

  const spedisciA = async (nome: string, guasto: string | undefined): Promise<{ avvisi: string[]; errori: string[]; esiti: Record<string, unknown>[] }> => {
    const qui = join(radice, nome)
    execFileSync('git', ['init', '-b', 'main', qui])
    writeFileSync(join(qui, 'leggimi.txt'), 'ciao\n')
    execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', 'add', '.'], { cwd: qui })
    execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', 'commit', '-m', 'inizio'], { cwd: qui })
    const l: LavoroAffidato = {
      id: 'r0000000000f1', workspace: 'progetto-a', cwd: qui, pcId: 'pc-la', pcNome: 'PC-Finto', ruolo: 'sviluppatore',
      descrizione: 'k-1: x', compito: 'k-1', prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString()
    }
    const esiti: Record<string, unknown>[] = []
    const avvisi: string[] = []
    const errori: string[] = []
    const sp = creaSpedizioniere({
      altri: () => [{ pcId: 'pc-la', nome: 'PC-Finto' }],
      chiama: async (_pc, percorso) => {
        if (percorso === '/api/aiuto/posti') return { modo: 'dedicato', liberi: 2, tetto: 2 }
        if (guasto !== undefined && (percorso === '/api/aiuto/pezzo' || percorso === '/api/aiuto/avvia')) throw new Error(guasto)
        return {}
      },
      servizio: async (percorso, corpo) => {
        if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' ? [l] : [] }
        if (percorso === '/aiuto/avanza') { esiti.push(corpo!); if (corpo!.stato !== undefined) l.stato = corpo!.stato as LavoroAffidato['stato']; return { fatto: true } }
        throw new Error(`rotta inattesa ${percorso}`)
      },
      cartella: join(radice, `sped-${nome}`), log: () => undefined,
      errore: (r) => errori.push(r), avviso: (r) => avvisi.push(r), dorme: async () => undefined
    })
    try {
      await sp.giro()
      const fine = Date.now() + 30_000
      while (l.stato === 'da-spedire' && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 30))
    } finally { sp.ferma() }
    return { avvisi, errori, esiti }
  }

  it('spedizione a un PC che non risponde: nessun errore, solo avviso, il lavoro fallisce con causa «pc»', async () => {
    const r = await spedisciA('fuori', 'acceso ma non risponde sulla porta 1')
    expect(r.errori).toEqual([])
    expect(r.avvisi.some((a) => a.includes('non spedito a PC-Finto'))).toBe(true)
    expect(r.esiti.at(-1)).toMatchObject({ stato: 'fallito', causa: 'pc' })
  }, 60_000)
})

describe('errori arrivati: lo stesso fallimento con id diversi è un gruppo solo', () => {
  const msg = (id: string, ruolo: string): string => `[aiuto] lavoro ${id} (${ruolo}) per PC-Finto non riuscito: accesso Claude scaduto su PC-Aiuto`
  const voce = (id: string, ruolo: string) => ({ quando: '2026-11-13T15:00:00.000Z', ultima: '2026-11-13T15:00:00.000Z', dove: 'pc' as const, volte: 1, messaggio: msg(id, ruolo), versione: '1.0.1' })

  it('la chiave non contiene l’id del lavoro', () => {
    expect(chiaveErrore(voce('r9aa071b61902', 'sviluppatore'))).toBe(chiaveErrore(voce('raed21fb22a76', 'interfaccia')))
    expect(chiaveErrore(voce('r9aa071b61902', 'sviluppatore'))).not.toContain('9aa071')
  })

  it('cinque fallimenti diventano un gruppo con volte 5', () => {
    const ids = ['r9aa071b61902', 'raed21fb22a76', 'rd0e7ef75d1fe', 'r1899a417a8f3', 'r247602b441d4']
    const arrivo: ArrivoLetto = { file: 'PC-Aiuto/x.json', da: 'PC-Aiuto', versione: '1.0.1', voci: ids.map((i) => voce(i, 'sviluppatore')) }
    const r = raggruppa({ arrivi: [arrivo], versioneQui: '0.106.1', affidati: {}, adesso: Date.parse('2026-11-13T16:00:00.000Z') })
    expect(r.gruppi).toHaveLength(1)
    expect(r.gruppi[0]?.volte).toBe(5)
  })
})

describe('raggruppa: il «cosa si faceva» è quello dell’ultima volta (lotto 20261126113649)', () => {
  const base = { dove: 'pc' as const, messaggio: '[aggiornamenti] l updater non si e fatto vivo: non chiudo niente', volte: 1 }

  it('l’arrivo più recente senza «cosa» non lascia al gruppo quello vecchio', () => {
    const vecchio: ArrivoLetto = { file: 'a.json', da: 'PC-A', versione: '0.121.1', voci: [{ ...base, quando: '2026-11-25T15:06:29.000Z', ultima: '2026-11-25T15:06:29.000Z', cosa: 'installo la 0.119.1 dalla 0.119.0', versione: '0.121.1' }] }
    const nuovo: ArrivoLetto = { file: 'b.json', da: 'PC-A', versione: '0.121.1', voci: [{ ...base, quando: '2026-11-25T15:10:00.000Z', ultima: '2026-11-26T11:30:46.000Z', versione: '0.121.1' }] }
    const r = raggruppa({ arrivi: [vecchio, nuovo], versioneQui: '0.121.2', affidati: {}, adesso: Date.parse('2026-11-26T11:40:00.000Z') })
    expect(r.gruppi).toHaveLength(1)
    expect(r.gruppi[0]?.ultima).toBe('2026-11-26T11:30:46.000Z')
    expect(r.gruppi[0]?.cosa).toBeUndefined()
  })
})
