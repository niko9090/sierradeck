import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { paginaClient } from '../../src/main/client-pagina'
import { scelteDiTerminale } from '@shared/scelte-terminale'
import { contestoSopraDomanda, domandaPerBattito, raccogliDomande, type AltroPcPerDomande } from '@shared/domande-telefono'
import { conversazioniDomande, type Conversazione } from '@shared/domande-conversazioni'
import { opzioneInItaliano } from '@shared/scheda-domanda'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.84.1 — Le domande che arrivano dalle chat degli altri PC.
 *
 * Fino alla 0.84.0 una chat di un altro PC ferma su un elenco di scelte
 * arrivava nelle Domande con le sole opzioni, in inglese, e al posto della
 * domanda «Su <PC>: la chat aspetta che tu scelga». Adesso il battito porta
 * la domanda intera e qualche riga di contesto; la scheda dice progetto e PC
 * e le opzioni fisse di Claude Code in italiano. Se il testo manca (un PC più
 * vecchio) c'è il tasto «Apri la chat su <PC>». Lo schermo è quello vero di
 * claude.exe 2.1.294 (`tests/fixtures/claude-2.1.294-domande`).
 */
const schermo = (nome: string): string[] =>
  readFileSync(join(__dirname, '../fixtures/claude-2.1.294-domande', `${nome}.txt`), 'utf8').split('\n')
const pulite = (r: string[]): string[] => r.map((x) => x.replace(new RegExp(String.fromCharCode(27) + '[[][0-9;]*m', 'g'), '').replace(/\r$/, ''))

/** La chat di B ferma sulla domanda vera, come la mette il postino nel battito (index.ts). */
function chatDelBattito(): BattitoPc['chat'][number] {
  const grezze = schermo('singola')
  const s = scelteDiTerminale(grezze.join('\n'))!
  return {
    sessione: 's-prova', titolo: 'Prova', cwd: 'C:\\Progetti\\Esempio', aspetta: false,
    ...domandaPerBattito({ coda: pulite(grezze) }, s),
    scelte: s.opzioni.map((o) => ({ numero: o.numero, testo: o.testo, ...(o.libera === true ? { libera: true } : {}) }))
  }
}

function conversazioniCon(altriPc: AltroPcPerDomande[]): Conversazione[] {
  const voci = raccogliDomande({ domande: [], autopiloti: [], chat: [], scelteDi: () => undefined, altriPc })
  return conversazioniDomande({ voci, autopiloti: [] })
}

describe('il battito porta la domanda intera e il contesto (0.84.1)', () => {
  it('una scelta sullo schermo vero: la domanda è il testo sopra l’elenco, il contesto le righe sopra il riquadro', () => {
    const c = chatDelBattito()
    expect(c.domanda).toContain('Quale colore preferisci?')
    expect(c.domanda).not.toContain('Rosso')
    expect(c.contesto?.join('\n')).toContain('AskUserQuestion')
    expect(c.contesto!.length).toBeLessThanOrEqual(6)
  })
  it('senza scelte: la domanda scritta in fondo al turno, con il paragrafo prima', () => {
    const msg = 'Ho finito la prima parte.\nI test sono verdi e il ramo è pronto.\n\nLo unisco in main adesso?'
    expect(contestoSopraDomanda(msg)).toEqual(['Ho finito la prima parte.', 'I test sono verdi e il ramo è pronto.'])
    expect(domandaPerBattito({ domanda: 'Lo unisco in main adesso?', contesto: contestoSopraDomanda(msg) }, undefined))
      .toEqual({ domanda: 'Lo unisco in main adesso?', contesto: ['Ho finito la prima parte.', 'I test sono verdi e il ramo è pronto.'] })
  })
  it('una domanda troppo lunga si taglia dall’inizio e il contesto ha al massimo 6 righe da 200 caratteri', () => {
    const d = domandaPerBattito({ domanda: 'x'.repeat(5000) + '?', contesto: Array.from({ length: 20 }, (_, i) => `${i} ${'y'.repeat(400)}`) }, undefined)
    expect(d.domanda!.length).toBe(1200)
    expect(d.domanda!.endsWith('?')).toBe(true)
    expect(d.contesto).toHaveLength(6)
    expect(d.contesto![0]!.startsWith('14 ')).toBe(true)
    expect(d.contesto!.every((r) => r.length <= 200)).toBe(true)
  })
})

describe('la scheda di una domanda di un altro PC (0.84.1)', () => {
  const pc: AltroPcPerDomande = { pcId: 'pc-b', nome: 'PC-ESEMPIO', vivo: true, strada: 'Tailscale', chat: [chatDelBattito()] }

  it('domanda intera, contesto, progetto e PC; niente più «la chat aspetta che tu scelga»', () => {
    const [c] = conversazioniCon([pc])
    expect(c?.scheda?.domanda).toBe('Quale colore preferisci?')
    expect(c?.scheda?.chi).toBe('chat «Prova» · Esempio · su PC-ESEMPIO')
    expect(c?.suPc).toBe('PC-ESEMPIO')
    expect(c?.viaPc).toBe('Tailscale')
    const dettagli = Object.fromEntries((c?.scheda?.dettagli ?? []).map((d) => [d.etichetta, d.testo]))
    expect(dettagli['La domanda intera']).toContain('Quale colore preferisci?')
    expect(dettagli['Prima della domanda']).toContain('AskUserQuestion')
    expect(dettagli['Dove']).toContain('La chat lavora su PC-ESEMPIO')
    expect(JSON.stringify(c)).not.toContain('aspetta che tu scelga')
    expect(c?.scheda?.apri).toBeUndefined()
  })
  it('le opzioni di Claude in italiano: «Scrivo io la risposta», «Ne parlo nella chat»; al tocco si manda il testo vero', () => {
    const [c] = conversazioniCon([pc])
    const scelte = c?.scheda?.scelte ?? []
    expect(scelte.map((s) => s.etichetta ?? s.testo)).toEqual(['Rosso', 'Verde', 'Blu', 'Scrivo io la risposta', 'Ne parlo nella chat'])
    expect(scelte.map((s) => s.testo)).toEqual(['Rosso', 'Verde', 'Blu', 'Type something.', 'Chat about this'])
    // Anche le opzioni del messaggio (la pagina e l'app vecchie le disegnano da lì).
    expect(c?.messaggi.at(-1)?.opzioni?.map((o) => o.etichetta ?? o.testo)).toEqual(['Rosso', 'Verde', 'Blu', 'Scrivo io la risposta', 'Ne parlo nella chat'])
    expect(c?.scelte?.chat).toBe('pc:pc-b:s-prova')
  })
  it('senza il testo (un PC più vecchio): il tasto «Apri la chat su <PC>» con la conversazione giusta', () => {
    const { domanda: _d, contesto: _c, ...vecchia } = chatDelBattito()
    const [c] = conversazioniCon([{ ...pc, chat: [vecchia] }])
    expect(c?.scheda?.apri).toEqual({ pcId: 'pc-b', pc: 'PC-ESEMPIO', sessione: 's-prova', cwd: 'C:\\Progetti\\Esempio', titolo: 'Prova' })
    expect(c?.scheda?.domanda).toContain('il testo della domanda non è arrivato da PC-ESEMPIO')
    expect(c?.scheda?.scelte).toHaveLength(5)
  })
  it('una domanda scritta di un altro PC porta anche il contesto', () => {
    const [c] = conversazioniCon([{ ...pc, chat: [{ sessione: 's-2', titolo: 'Sito', cwd: 'E:\\sito', aspetta: true, domanda: 'Lo pubblico?', contesto: ['Ho rifatto la home.'] }] }])
    expect(c?.scheda?.domanda).toBe('Lo pubblico?')
    expect(c?.scheda?.chi).toBe('chat «Sito» · sito · su PC-ESEMPIO')
    expect(c?.scheda?.dettagli).toContainEqual({ etichetta: 'Prima della domanda', testo: 'Ho rifatto la home.' })
    expect(c?.scheda?.apri).toBeUndefined()
  })
  it('un contesto che non è un elenco di stringhe (un battito guasto) non rompe niente', () => {
    const [c] = conversazioniCon([{ ...pc, chat: [{ ...chatDelBattito(), contesto: 'non un elenco' as unknown as string[] }] }])
    expect(c?.scheda?.dettagli.some((d) => d.etichetta === 'Prima della domanda')).toBe(false)
  })
})

describe('le opzioni fisse di Claude Code in italiano', () => {
  it.each([
    [{ testo: 'Type something.', libera: true }, 'Scrivo io la risposta'],
    [{ testo: 'Chat about this' }, 'Ne parlo nella chat'],
    [{ testo: 'Submit', invio: true }, 'Manda le scelte spuntate'],
    [{ testo: 'Yes' }, 'Sì'],
    [{ testo: 'Yes, and don’t ask again for npm test commands' }, 'Sì, e non chiedere più per npm test commands'],
    [{ testo: 'No, and tell Claude what to do differently (esc)' }, 'No, e dico a Claude cosa fare invece'],
    [{ testo: 'Rosso' }, undefined]
  ])('%o → %s', (o, atteso) => {
    expect(opzioneInItaliano(o)).toBe(atteso)
  })
})

describe('uguale sul PC, sulla pagina e nell’app (0.84.1)', () => {
  it('/api/domande del PC A porta la scheda con domanda, italiano e PC dal battito di B', async () => {
    const battitoB: BattitoPc = { pcId: 'pc-b', nome: 'PC-ESEMPIO', versione: '0.84.1', battito: new Date().toISOString(), cartelle: [], chat: [chatDelBattito()] }
    const a = rotteClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-domande-0841-'))),
      chat: () => [], autopiloti: async () => [], domande: async () => [], workspace: async () => ({ nomi: [], attivo: '' }),
      scriviAChat: () => undefined, aggiornamento: () => ({ fase: 'fermo' }),
      pcIo: () => 'pc-a',
      pc: async () => [battitoB],
      scriviAltroPc: async () => ({ ok: true })
    } as unknown as DipendenzeRotte)
    const d = await a({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    const conv = (d.corpo as { conversazioni: Conversazione[] }).conversazioni.find((c) => c.scelte?.chat === 'pc:pc-b:s-prova')
    expect(conv?.scheda?.domanda).toBe('Quale colore preferisci?')
    expect(conv?.scheda?.chi).toContain('su PC-ESEMPIO')
    expect(conv?.scheda?.scelte.find((s) => s.libera === true)?.etichetta).toBe('Scrivo io la risposta')
  })
  it('la pagina mostra l’etichetta italiana e il tasto «Apri la chat su <PC>»', () => {
    const html = paginaClient()
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    const funzione = (nome: string): string => {
      const inizio = script.indexOf(`function ${nome}(`)
      let p = 0
      for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
        if (script[i] === '{') p += 1
        else if (script[i] === '}' && --p === 0) return script.slice(inizio, i + 1)
      }
      throw new Error(`${nome} non trovata`)
    }
    const esc = (s: string): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    const fn = new Function('esc', `${funzione('etichettaScelta')}; ${funzione('apriAltroveHtml')}; ${funzione('etichettaOpzione')}; return { etichettaScelta, apriAltroveHtml, etichettaOpzione }`)(esc) as {
      etichettaScelta: (c: unknown) => string; apriAltroveHtml: (s: unknown) => string; etichettaOpzione: (o: unknown) => string
    }
    expect(fn.etichettaScelta({ testo: 'Chat about this', etichetta: 'Ne parlo nella chat' })).toBe('Ne parlo nella chat')
    expect(fn.etichettaOpzione({ numero: 5, testo: 'Chat about this', etichetta: 'Ne parlo nella chat' })).toContain('Ne parlo nella chat')
    expect(fn.etichettaOpzione({ numero: 4, testo: 'Type something.', libera: true })).toContain('Scrivo io la risposta')
    const tasto = fn.apriAltroveHtml({ apri: { pcId: 'pc-b', pc: 'PC-ESEMPIO', sessione: 's-prova', cwd: 'C:\\x', titolo: 'Prova' } })
    expect(tasto).toContain('Apri la chat su PC-ESEMPIO')
    expect(tasto).toContain('pdApriChat(')
    expect(tasto).toContain('data-p="pc-b"')
    expect(fn.apriAltroveHtml({})).toBe('')
  })
  it('il PC e l’app hanno lo stesso tasto e le stesse etichette', () => {
    const pc = readFileSync(join(__dirname, '../../src/renderer/components/SchedaDomandaVista.tsx'), 'utf8')
    expect(pc).toContain('Apri la chat su {s.apri.pc}')
    expect(pc).toContain('c.etichetta ?? c.testo')
    const app = readFileSync(join(__dirname, '../../android/app/src/main/java/it/ferrariconsulenze/sierradeck/SchedaDomandaVista.kt'), 'utf8')
    expect(app).toContain('Apri la chat su ${a.pc}')
    expect(app).toContain('Apertura.apriChatSu(a)')
  })
})
