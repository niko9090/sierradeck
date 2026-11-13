import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { inScarico, installaAdesso, perLaFinestra, postiAiutante, rigaAggiornamento, tooltipIcona } from '../../src/aiutante/regole'
import { noteAiutante, novitaDaTesto } from '../../src/aiutante/novita-aiutante'
import { testoScaricamento } from '../../src/shared/registro-versioni'
import { bloccoDiAiutante } from '../../src/shared/posta'

/**
 * 13/11, Aiutante 1.0.3: Claude che non va → 0 posti; gli aggiornamenti nella
 * stessa finestra del programma completo (stato tradotto, barra con le misure),
 * «Installa adesso» con la conferma se ci sono lavori; le novità dal suo file.
 */
const misura = { processori: 16, memoriaLiberaMb: 32_000, memoriaTotaleMb: 64_000, caricoPercento: 10 }
const ADESSO = Date.parse('2026-11-13T10:00:00.000Z')

describe('Claude non va: zero posti', () => {
  it('con il motivo di Claude i posti sono 0 anche se tutto il resto c’è', () => {
    const p = postiAiutante({ misura, inCorso: 0, scelti: 3, pronto: true, claudeBloccato: 'Claude non collegato o accesso scaduto', inScarico: false, adesso: ADESSO })
    expect(p).toEqual({ liberi: 0, tetto: 3, perche: 'claude' })
    expect(postiAiutante({ misura, inCorso: 0, scelti: 3, pronto: true, inScarico: false, adesso: ADESSO }).liberi).toBe(3)
  })
  it('il battito: il motivo vale solo per un Aiutante, ed è corto', () => {
    expect(bloccoDiAiutante({ aiutante: true, bloccoAiutante: 'Claude non collegato' })).toBe('Claude non collegato')
    expect(bloccoDiAiutante({ aiutante: true })).toBeUndefined()
    expect(bloccoDiAiutante({ bloccoAiutante: 'x' })).toBeUndefined()
    expect(bloccoDiAiutante({ aiutante: true, bloccoAiutante: 'a'.repeat(500) })?.length).toBe(120)
  })
})

describe('«Installa adesso»', () => {
  it('senza lavori installa; con lavori chiede prima, poi installa', () => {
    expect(installaAdesso({ fase: 'pronto', inCorso: 0, confermato: false })).toEqual({ esito: 'installa' })
    const c = installaAdesso({ fase: 'pronto', inCorso: 2, confermato: false })
    expect(c.esito).toBe('conferma')
    expect(c.esito === 'conferma' ? c.domanda : '').toContain('2 lavori in corso verranno ripresi da un altro PC')
    expect(installaAdesso({ fase: 'pronto', inCorso: 1, confermato: false })).toMatchObject({ domanda: expect.stringContaining('1 lavoro in corso verrà ripreso') })
    expect(installaAdesso({ fase: 'pronto', inCorso: 2, confermato: true })).toEqual({ esito: 'installa' })
  })
  it('niente da installare se non è scaricato, o se sta già installando', () => {
    expect(installaAdesso({ fase: 'scarico', inCorso: 0, confermato: true }).esito).toBe('no')
    expect(installaAdesso({ fase: 'niente', inCorso: 0, confermato: true }).esito).toBe('no')
    expect(installaAdesso({ fase: 'installo', inCorso: 0, confermato: true }).esito).toBe('no')
  })
  it('da «Installa adesso» in poi niente lavori nuovi, anche con gli automatici spenti', () => {
    expect(inScarico({ fase: 'installo', automatici: false })).toBe(true)
  })
})

describe('lo stato nella forma della finestra del programma completo', () => {
  const progresso = { percento: 42.7, scaricati: 30 * 1024 ** 2, totale: 72 * 1024 ** 2, velocita: 2 * 1024 ** 2 }
  it('scarico: percento intero, MB scaricati e totali, velocità', () => {
    const f = perLaFinestra({ fase: 'scarico', versione: '1.0.3', progresso })
    expect(f).toEqual({ fase: 'scarico', versione: '1.0.3', percento: 42, scaricati: progresso.scaricati, totale: progresso.totale, velocita: progresso.velocita })
    // La riga sotto la barra (la stessa funzione della finestra): MB, MB/s e il tempo che manca.
    expect(testoScaricamento(f)).toBe('30,0 di 72,0 MB · 2,0 MB/s · ancora circa 20 s')
  })
  it('scarico appena partito: barra a 0, nessuna misura inventata', () => {
    expect(perLaFinestra({ fase: 'scarico', versione: '1.0.3' })).toEqual({ fase: 'scarico', versione: '1.0.3', percento: 0 })
  })
  it('le altre fasi', () => {
    expect(perLaFinestra({ fase: 'pronto', versione: '1.0.3' })).toEqual({ fase: 'pronto', versione: '1.0.3' })
    expect(perLaFinestra({ fase: 'installo', versione: '1.0.3' }).fase).toBe('installo')
    expect(perLaFinestra({ fase: 'disponibile', versione: '1.0.3' }).fase).toBe('disponibile')
    expect(perLaFinestra({ fase: 'niente', cercando: true }).fase).toBe('cerco')
    expect(perLaFinestra({ fase: 'niente', errore: '404' })).toEqual({ fase: 'errore', errore: '404' })
    expect(perLaFinestra({ fase: 'niente', ultimaRicerca: ADESSO }).fase).toBe('aggiornato')
    expect(perLaFinestra({ fase: 'niente' }).fase).toBe('fermo')
  })
  it('la riga corta nella finestra principale e il tooltip dell’icona', () => {
    expect(rigaAggiornamento({ fase: 'scarico', versione: '1.0.3', progresso })).toBe('Aggiornamento in corso: 1.0.3, 42%')
    expect(rigaAggiornamento({ fase: 'niente' })).toBeUndefined()
    expect(tooltipIcona({ lavori: 1, liberi: 2, aggiornamento: { fase: 'scarico', versione: '1.0.3', percento: 42.7 } })).toBe('SierraDeck Aiutante — 1 lavori, 2 posti liberi — scarico 1.0.3 42%')
    expect(tooltipIcona({ lavori: 0, liberi: 0, claude: 'Claude non collegato o accesso scaduto' })).toContain('Claude non collegato')
    expect(tooltipIcona({ lavori: 0, liberi: 0, claude: 'x'.repeat(300) }).length).toBeLessThanOrEqual(127)
  })
})

describe('le novità dell’Aiutante', () => {
  const testo = [
    'Intestazione: un apice qui non conta (\\\').',
    "versione: '1.0.3'",
    "  'Novità tre con l\\'apice.',",
    "  'Seconda.'",
    "versione: '1.0.2'",
    "  'Correzione due.'",
    "versione: '1.0.1'",
    "  'Uno.'"
  ].join('\n')
  it('dal testo del file: versioni e righe, gli apici tolti dagli escape', () => {
    const n = novitaDaTesto(testo)
    expect(n.map((x) => x.versione)).toEqual(['1.0.3', '1.0.2', '1.0.1'])
    expect(n[0]?.righe).toEqual(["Novità tre con l'apice.", 'Seconda.'])
  })
  it('per un aggiornamento: la nuova e le saltate, non la installata', () => {
    const note = noteAiutante({ sorgente: testo, installata: '1.0.1', nuova: '1.0.3' })
    expect(note.note.map((x) => x.versione)).toEqual(['1.0.3', '1.0.2'])
    expect(note.avviso).toBeUndefined()
  })
  it('senza rete: nessuna nota, ma un avviso con dove leggerle', () => {
    const note = noteAiutante({ sorgente: undefined, installata: '1.0.2', nuova: '1.0.3' })
    expect(note.note).toEqual([])
    expect(note.avviso).toContain('github.com')
  })
  it('il file vero si legge, e la versione dell’Aiutante ha le sue novità', () => {
    const vero = novitaDaTesto(readFileSync('src/aiutante/novita-aiutante.txt', 'utf8'))
    const versione = (JSON.parse(readFileSync('src/aiutante/versione.json', 'utf8')) as { versione: string }).versione
    expect(vero[0]?.versione).toBe(versione)
    expect(vero[0]?.righe.length).toBeGreaterThan(0)
  })
})
