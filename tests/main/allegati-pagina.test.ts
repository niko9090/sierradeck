import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paginaClient } from '../../src/main/client-pagina'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriAllegati } from '../../src/main/allegati'
import { apriDispositivi } from '../../src/main/dispositivi'
import { giornoCartella, PEZZO_BYTE } from '@shared/allegati'

/**
 * 0.50.0: «Scegli file» nella pagina del telefono. Lo stesso invio a pezzi
 * dell'app, contro le rotte vere: con la rete che cade a metà, si chiede al
 * computer dove era arrivato e si riparte da lì.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (inizio: string): string => {
  const i = script.indexOf(inizio)
  if (i < 0) throw new Error(`manca ${inizio}`)
  let profondita = 0
  for (let j = script.indexOf('{', i); j < script.length; j++) {
    if (script[j] === '{') profondita++
    else if (script[j] === '}' && --profondita === 0) return script.slice(i, j + 1)
  }
  throw new Error('non si chiude')
}

type Manda = (file: Blob & { name: string }, dest: Record<string, string>, nota: string) => Promise<Record<string, unknown>>

function pagina(fetch: (p: string, o: { body?: string }) => Promise<unknown>): { manda: Manda; note: string[] } {
  const corpo = `
    var chiave = 'k', rifiuti401 = 0, RIFIUTI_PER_ARRENDERSI = 5, ultimoStato = {}
    const note = []
    var allegatoNota = ''
    function pannello() { note.push(allegatoNota) }
    var localStorage = { removeItem() {} }
    function ingresso() {}
    const aspetta = () => Promise.resolve()
    ${estrai('async function chiedi(')}
    ${estrai('function inMb(')}
    ${estrai('function nuovoIdInvio(')}
    ${estrai('function inBase64(')}
    ${estrai('async function mandaUnFile(')}
    return { manda: mandaUnFile, note }
  `
  return new Function('fetch', corpo)(fetch) as { manda: Manda; note: string[] }
}

describe('«Scegli file» nella pagina', () => {
  it('manda a pezzi con l’avanzamento; la rete cade a metà e riparte da dove era', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sd-alp-'))
    const scritti: string[] = []
    const rotte = rotteClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-alp-d-'))),
      chat: () => [{ id: 'p-1', titolo: 'Clienti', cwd }],
      autopiloti: async () => [],
      scriviAChat: (id: string, t: string) => { scritti.push(`${id}:${t}`) },
      allegati: apriAllegati({ cartella: mkdtempSync(join(tmpdir(), 'sd-alp-l-')), segnaInternet: false })
    } as unknown as DipendenzeRotte)
    let pezzi = 0
    let caduta = false
    const fetch = async (percorso: string, o: { body?: string }): Promise<unknown> => {
      const corpo = o.body !== undefined ? JSON.parse(o.body) as unknown : undefined
      if (percorso === '/api/allegati/pezzo' && ++pezzi === 2 && !caduta) {
        // Il pezzo arriva al computer, ma la risposta si perde: la rete cade.
        caduta = true
        await rotte({ metodo: 'POST', percorso, corpo, dispositivo: 't1' })
        throw new TypeError('Failed to fetch')
      }
      const e = await rotte({ metodo: 'POST', percorso, corpo, dispositivo: 't1' })
      return { status: e.stato, ok: e.stato >= 200 && e.stato < 300, json: async () => e.corpo }
    }
    const p = pagina(fetch)
    const dati = randomBytes(PEZZO_BYTE * 3 + 99)
    const file = Object.assign(new Blob([dati]), { name: 'rapporto.pdf' })
    const r = await p.manda(file, { chat: 'p-1' }, 'da leggere')
    expect(r).toMatchObject({ arrivato: true, avvisata: 'chat' })
    expect(readFileSync(join(cwd, '.sierradeck', 'allegati', giornoCartella(new Date()), 'rapporto.pdf')).equals(dati)).toBe(true)
    expect(p.note.some((n) => n.includes('la rete è caduta'))).toBe(true)
    expect(p.note.some((n) => /rapporto\.pdf: \d+% \(/.test(n))).toBe(true)
    expect(scritti[0]).toContain('Nota: da leggere.')
  })
  it('un rifiuto vero (chat protetta, 423) non si riprova: arriva con lo stato', async () => {
    const fetch = async (): Promise<unknown> => ({ status: 423, ok: false, json: async () => ({ errore: 'Chat protetta: inserisci il PIN. «Clienti» è protetta dal PIN', pin: 'chiusa' }) })
    const p = pagina(fetch)
    const e = await p.manda(Object.assign(new Blob([Buffer.from('x')]), { name: 'a.txt' }), { chat: 'p-1' }, '').catch((x: unknown) => x) as { stato?: number; message?: string }
    expect(e.stato).toBe(423)
    expect(e.message).toMatch(/^Chat protetta: inserisci il PIN/)
  })
  it('la chat e l’autopilota hanno «Scegli file», e lo script si legge', () => {
    expect(script).toContain('onclick="scegliFileChat(this.dataset.chat)"')
    expect(script).toContain('scegliFileAp(this.dataset.ap)')
    expect(script).toContain('100 MB')
    expect(() => new Function(script)).not.toThrow()
  })
})
