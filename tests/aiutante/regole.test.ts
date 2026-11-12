import { describe, it, expect } from 'vitest'
import {
  blocchiRete, decidiInstallazione, DISCO_MINIMO_BYTE, FEED_AIUTANTE, inScarico, limiteDaFine, PORTA_AIUTANTE, postiAiutante,
  requisitiPersi, SCARICO_MAX_MS, TAG_AIUTANTE, valutaRequisiti, type MisureRequisiti
} from '../../src/aiutante/regole'
import { LAVORO_MAX_MS } from '../../src/shared/aiuto-rete'
import { PREFERENZE_PREDEFINITE } from '../../src/shared/preferenze'

/**
 * 12/11, SierraDeck Aiutante: le regole pure. Quanti posti dà agli altri PC
 * (pronto, non pronto, in attesa di aggiornamento, piano esaurito), quando
 * installa un aggiornamento senza interrompere i lavori, cosa gli manca.
 */
const misura = { processori: 16, memoriaLiberaMb: 32_000, memoriaTotaleMb: 64_000, caricoPercento: 10 }
const ADESSO = Date.parse('2026-11-12T10:00:00.000Z')

describe('i posti dell’Aiutante', () => {
  it('pronto: il tetto del PC meno i lavori in corso', () => {
    const p = postiAiutante({ misura, inCorso: 2, pronto: true, inScarico: false, adesso: ADESSO })
    expect(p.tetto).toBeGreaterThan(2)
    expect(p.liberi).toBe(p.tetto - 2)
    expect(p.perche).toBe('pronto')
  })
  it('il numero scelto a mano vince, come nel programma completo', () => {
    expect(postiAiutante({ misura, inCorso: 1, scelti: 3, pronto: true, inScarico: false, adesso: ADESSO })).toEqual({ liberi: 2, tetto: 3, perche: 'pronto' })
  })
  it('pieno: zero liberi, e lo dice', () => {
    expect(postiAiutante({ misura, inCorso: 3, scelti: 3, pronto: true, inScarico: false, adesso: ADESSO })).toEqual({ liberi: 0, tetto: 3, perche: 'pieno' })
  })
  it('non pronto (manca Claude, git…): zero posti', () => {
    expect(postiAiutante({ misura, inCorso: 0, pronto: false, inScarico: false, adesso: ADESSO })).toMatchObject({ liberi: 0, perche: 'requisiti' })
  })
  it('con un aggiornamento pronto: zero posti (non prende lavori nuovi)', () => {
    expect(postiAiutante({ misura, inCorso: 0, pronto: true, inScarico: true, adesso: ADESSO })).toMatchObject({ liberi: 0, perche: 'aggiornamento' })
  })
  it('piano esaurito: zero fino all’azzeramento, poi di nuovo pronto', () => {
    const fino = ADESSO + 60_000
    expect(postiAiutante({ misura, inCorso: 0, pronto: true, inScarico: false, limiteFino: fino, adesso: ADESSO })).toMatchObject({ liberi: 0, perche: 'limite' })
    expect(postiAiutante({ misura, inCorso: 0, pronto: true, inScarico: false, limiteFino: fino, adesso: fino + 1 }).perche).toBe('pronto')
  })
})

describe('il limite del piano da un lavoro finito', () => {
  it('un lavoro fallito con il testo del limite: zero posti per un po’ (al più un’ora)', () => {
    const fino = limiteDaFine({ stato: 'fallito', testo: 'Claude AI usage limit reached' }, ADESSO)
    expect(fino).toBeGreaterThan(ADESSO)
    expect(fino! - ADESSO).toBeLessThanOrEqual(60 * 60_000)
  })
  it('un lavoro riuscito, o fallito per altro, non è il limite', () => {
    expect(limiteDaFine({ stato: 'finito', testo: 'usage limit reached' }, ADESSO)).toBeUndefined()
    expect(limiteDaFine({ stato: 'fallito', testo: 'npm ci non riuscito' }, ADESSO)).toBeUndefined()
  })
  it('anche il motivo conta', () => {
    expect(limiteDaFine({ stato: 'fallito', testo: '', motivo: "You've hit your limit · resets 3pm" }, ADESSO)).toBeDefined()
  })
})

describe('installare l’aggiornamento senza perdere lavoro', () => {
  it('pronto e nessun lavoro: installa', () => {
    expect(decidiInstallazione({ fase: 'pronto', automatici: true, inCorso: 0, prontoDa: ADESSO, adesso: ADESSO })).toBe('installa')
  })
  it('pronto con lavori in corso: aspetta', () => {
    expect(decidiInstallazione({ fase: 'pronto', automatici: true, inCorso: 2, prontoDa: ADESSO, adesso: ADESSO + 60_000 })).toBe('aspetta')
  })
  it('un lavoro bloccato non tiene fermo l’aggiornamento oltre il lavoro più lungo più un quarto d’ora', () => {
    expect(SCARICO_MAX_MS).toBe(LAVORO_MAX_MS + 15 * 60_000)
    expect(decidiInstallazione({ fase: 'pronto', automatici: true, inCorso: 1, prontoDa: ADESSO, adesso: ADESSO + SCARICO_MAX_MS })).toBe('installa')
  })
  it('con gli aggiornamenti automatici spenti, o niente di pronto: aspetta', () => {
    expect(decidiInstallazione({ fase: 'pronto', automatici: false, inCorso: 0, adesso: ADESSO })).toBe('aspetta')
    expect(decidiInstallazione({ fase: 'scarico', automatici: true, inCorso: 0, adesso: ADESSO })).toBe('aspetta')
  })
  it('lo scarico (niente lavori nuovi) solo con un aggiornamento pronto e gli automatici accesi', () => {
    expect(inScarico({ fase: 'pronto', automatici: true })).toBe(true)
    expect(inScarico({ fase: 'pronto', automatici: false })).toBe(false)
    expect(inScarico({ fase: 'scarico', automatici: true })).toBe(false)
  })
})

describe('da dove si aggiorna e dove ascolta', () => {
  it('la pubblicazione FISSA «aiutante», mai l’ultima del programma completo', () => {
    expect(TAG_AIUTANTE).toBe('aiutante')
    expect(FEED_AIUTANTE).toBe('https://github.com/niko9090/sierradeck/releases/download/aiutante/')
    expect(FEED_AIUTANTE).not.toMatch(/latest/u)
  })
  it('una porta diversa dal programma completo, così stanno insieme sullo stesso PC', () => {
    expect(PORTA_AIUTANTE).toBe(47641)
    expect(PORTA_AIUTANTE).not.toBe(PREFERENZE_PREDEFINITE.portaClient)
  })
})

describe('cosa serve all’Aiutante', () => {
  const tutto: MisureRequisiti = {
    claude: { ok: true, versione: '2.1.0 (Claude Code)' }, claudeAccesso: true,
    git: { ok: true, versione: 'git version 2.50' }, node: { ok: true, versione: 'v24' }, npm: { ok: true, versione: '11' },
    discoLibero: DISCO_MINIMO_BYTE * 4
  }
  it('con tutto: pronto', () => {
    expect(valutaRequisiti(tutto).pronto).toBe(true)
  })
  it('senza l’accesso a Claude, senza git o con il disco pieno: non pronto, e dice cosa', () => {
    for (const m of [{ ...tutto, claudeAccesso: false }, { ...tutto, git: { ok: false as const, motivo: 'non installato' } }, { ...tutto, discoLibero: 1024 }]) {
      const v = valutaRequisiti(m)
      expect(v.pronto).toBe(false)
      expect(v.voci.filter((x) => !x.ok)).toHaveLength(1)
    }
  })
  it('un requisito perso va nello storico una volta sola (al cambio, non a ogni controllo)', () => {
    const prima = valutaRequisiti(tutto).voci
    const dopo = valutaRequisiti({ ...tutto, claudeAccesso: false }).voci
    expect(requisitiPersi(prima, dopo).map((v) => v.chiave)).toEqual(['accesso'])
    expect(requisitiPersi(dopo, dopo)).toEqual([])
    expect(requisitiPersi(undefined, dopo).map((v) => v.chiave)).toEqual(['accesso'])
  })
})

describe('i blocchi del collegamento', () => {
  const su = { driveConnesso: true, cassaforteAperta: true, inAscolto: true }
  it('il Drive che cade e la cassaforte che si chiude: una riga ciascuno, al cambio', () => {
    const righe = blocchiRete(su, { ...su, driveConnesso: false, cassaforteAperta: false }, true)
    expect(righe).toHaveLength(2)
    expect(blocchiRete({ ...su, driveConnesso: false }, { ...su, driveConnesso: false }, true)).toEqual([])
  })
  it('alla prima accensione, mai collegato: niente blocchi (non è un guasto, è da fare)', () => {
    expect(blocchiRete(undefined, { driveConnesso: false, cassaforteAperta: false, inAscolto: true }, false)).toEqual([])
  })
})
