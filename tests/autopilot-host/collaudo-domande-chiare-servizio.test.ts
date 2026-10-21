import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { nuovoAutopilota, type ChatGovernata } from '@shared/autopilota'
import { sigleIn } from '@shared/domanda-chiara'

/**
 * Collaudo nel servizio vero (0.84.0): dove compare una risposta deve vedersi
 * la domanda intera, **chiara**, senza le sigle che la domanda aperta non ha
 * più. I casi «DIFETTO» sono `it.fails`: vedi collaudo-domande-chiare.test.ts.
 */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let registro: RegistroDomande

const chat = (id: string, compito: string, stato: ChatGovernata['stato'] = 'lavoro'): ChatGovernata => ({ id, compito, stato, cicli: 1, sessionId: `s-${id}` })

async function avvia(p: { interroga: () => Promise<{ testo: string }>; chats: ChatGovernata[]; detto: string }): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-collaudo-')))
  registro = creaRegistroDomande({ adesso: () => Date.now() })
  const s = creaServer({
    archivio,
    memoria: apriMemoria(undefined),
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: p.interroga,
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: registro,
    ultimoDetto: () => p.detto,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString()
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  archivio.scrivi({
    ...nuovoAutopilota({ id: 'ap-col', nome: 'Domande chiare', obiettivo: '0.84.0 (minor)', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-10-21T06:00:00.000Z' }),
    stato: 'lavoro',
    chats: p.chats
  })
}

async function notifica(chatId: string): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-col&chat=${chatId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_type: 'idle_prompt', message: 'Claude is waiting for your input' })
  })
}

afterEach(() => { server?.close(); server = undefined })

const REVISIONE = 'Rivedi il ramo ap/ap-f1e631f5/c-61 della chat c-61 («Domande chiare per sempre (0.84.0)»)'

describe('le risposte dell’autopilota, con la domanda accanto', () => {
  it('la domanda e la risposta finiscono fra le risolte', async () => {
    await avvia({
      interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'rispondo', risposta: 'Sì: chiudile, i rami sono già in main.' }) }),
      chats: [chat('c-65', 'Collaudo delle domande chiare'), chat('c-7', 'Collaudo della gestione delle chat', 'finita')],
      detto: 'Ho finito il collaudo.\n\nChiudo anche la chat che ha fatto il collaudo della gestione delle chat?'
    })
    await notifica('c-65')
    const [r] = registro.risolte('ap-col')
    expect(r?.domanda).toBe('Chiudo anche la chat che ha fatto il collaudo della gestione delle chat?')
    expect(r?.risposta).toBe('Sì: chiudile, i rami sono già in main.')
  })

  it.fails('DIFETTO 7: la domanda della chat fra le risolte tiene le sigle («chiudo la c-7?») (server.ts:3611)', async () => {
    await avvia({
      interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'rispondo', risposta: 'Sì, chiudila.' }) }),
      chats: [chat('c-65', 'Collaudo delle domande chiare'), chat('c-7', 'Collaudo della gestione delle chat', 'finita')],
      detto: 'Ho finito il collaudo.\n\nChiudo anche la chat c-7, che ha il ramo già in main?'
    })
    await notifica('c-65')
    const [r] = registro.risolte('ap-col')
    expect(r).toBeDefined()
    expect(sigleIn(r!.domanda)).toEqual([])
  })

  it.fails('DIFETTO 8: il nome della chat accanto alla risposta è il compito grezzo, con le sigle della Revisione (server.ts:293)', async () => {
    await avvia({
      interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'rispondo', risposta: 'Sì, prosegui.' }) }),
      chats: [chat('c-66', REVISIONE)],
      detto: 'Ho riletto il ramo.\n\nScrivo l’esito della Revisione nel quaderno adesso?'
    })
    await notifica('c-66')
    const [r] = registro.risolte('ap-col')
    expect(r?.chatTitolo).toBeDefined()
    expect(sigleIn(r!.chatTitolo!)).toEqual([])
  })
})
