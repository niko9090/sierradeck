import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paginaClient } from '../../src/main/client-pagina'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { rigaPosti, spiegaPosti, type PostiChat } from '@shared/posti-chat'

/**
 * «N di M chat» (0.82.0) sulla pagina del telefono e nell'app: il computer
 * manda in `/api/stato` i numeri con i testi già scritti, la pagina li mette in
 * cima agli autopiloti con il «?». Uguali al PC (stesse funzioni).
 */
const POSTI: PostiChat = {
  attive: 3, posti: 3, inFila: 2, regolazione: 0, perche: 'carico', risale: false,
  misura: { processori: 8, memoriaLiberaMb: 9000, memoriaTotaleMb: 16384, caricoPercento: 91 }
}

function deps(over: Partial<DipendenzeRotte> = {}): DipendenzeRotte {
  const nulla = (): Promise<void> => Promise.resolve()
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-posti-'))),
    chat: () => [],
    autopiloti: () => Promise.resolve([]),
    rispondi: nulla,
    domande: () => Promise.resolve([]),
    scriviAChat: () => undefined,
    apriChat: () => undefined,
    cartelle: () => Promise.resolve([]),
    workspace: () => Promise.resolve({ nomi: [], attivo: '' }),
    cambiaWorkspace: nulla,
    fermaAutopilota: nulla,
    riprendiAutopilota: nulla,
    vaiAutopilota: nulla,
    creaAutopilota: () => Promise.resolve({ id: 'ap-9' }),
    eliminaAutopilota: nulla,
    riprendiAlRiavvio: nulla,
    chiudiChat: () => undefined,
    rinominaChat: () => undefined,
    sessioni: () => Promise.resolve([]),
    riprendiSessione: () => undefined,
    creaWorkspace: nulla,
    eliminaWorkspace: nulla,
    salvataggi: () => Promise.resolve([]),
    caricaIstantanea: nulla,
    consumi: () => Promise.resolve({}),
    quaderno: () => [],
    scheda: () => undefined,
    impostaPreferenze: nulla,
    aggiornamento: () => ({ fase: 'fermo' as const }),
    cercaAggiornamento: () => undefined,
    scaricaAggiornamento: () => undefined,
    installaAggiornamento: () => undefined,
    versione: '0.82.0',
    apk: () => Promise.resolve(undefined),
    ...over
  } as DipendenzeRotte
}

describe('«N di M chat» in /api/stato (0.82.0)', () => {
  it('con i testi del PC', async () => {
    const r = await rotteClient(deps({ postiChat: () => Promise.resolve(POSTI) }))({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    const p = (r.corpo as { postiChat?: Record<string, unknown> }).postiChat
    expect(p).toMatchObject({ attive: 3, posti: 3, inFila: 2, riga: rigaPosti(POSTI), spiega: spiegaPosti(POSTI) })
    expect(p?.riga).toBe('3 di 3 chat · 2 in fila')
  })

  it('il servizio non risponde: niente campo, e lo stato arriva lo stesso', async () => {
    const r = await rotteClient(deps({ postiChat: () => Promise.reject(new Error('giù')) }))({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect(r.stato).toBe(200)
    expect((r.corpo as Record<string, unknown>).postiChat).toBeUndefined()
  })
})

describe('«N di M chat» sulla pagina (0.82.0)', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') profondita++
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error('non si chiude')
  }
  const riga = (inizio: string): string => script.split('\n').find((r) => r.startsWith(inizio)) ?? ''
  const postiChatHtml = new Function(`${riga('const esc =')}\nvar aiutiAperti = { 'posti-chat': true }\n${estrai('aiuto')}\n${estrai('postiChatHtml')}\nreturn postiChatHtml`)() as (s: unknown) => string

  it('sta in cima alla scheda Autopiloti', () => {
    expect(script).toContain('autopiloti: postiChatHtml(s) +')
  })

  it('la riga e il «?» con il perché, ambra quando è pieno', () => {
    const fuori = postiChatHtml({ postiChat: { ...POSTI, riga: rigaPosti(POSTI), spiega: spiegaPosti(POSTI) } })
    expect(fuori).toContain('3 di 3 chat · 2 in fila')
    expect(fuori).toContain('posti-chat--pieno')
    expect(fuori).toContain('data-aiuto="posti-chat"')
    expect(fuori).toContain('sotto sforzo')
    expect(fuori).toContain('<br>')
  })

  it('da un computer più vecchio non c è niente', () => {
    expect(postiChatHtml({})).toBe('')
    expect(postiChatHtml({ postiChat: { attive: 1, posti: 2 } })).toBe('')
  })
})
