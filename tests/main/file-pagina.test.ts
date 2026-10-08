import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paginaClient } from '../../src/main/client-pagina'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { apriFileProgetti } from '../../src/main/file-progetti'
import { creaGuardianoPin } from '../../src/main/pin-guardiano'
import { FILE_PEZZO_BYTE } from '@shared/file-telefono'

/**
 * 0.54.0: la sezione File della pagina, contro le rotte vere. Il file si
 * legge a pezzi (con la rete che cade a metà), la cartella si disegna con
 * Guarda e Scarica, e un progetto protetto dal PIN chiede il PIN.
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

type Pagina = {
  leggi: (percorso: string, massimo: number) => Promise<{ parti: Uint8Array[]; byte: number; mime: string; tagliato: boolean }>
  vai: (progetto: string, percorso: string) => Promise<void>
  html: () => string
  note: string[]
  stato: () => { filePin: { chat?: string } | null; fileElenco: unknown }
}

function pagina(fetch: (p: string, o: { body?: string }) => Promise<unknown>, progetti: unknown[]): Pagina {
  const corpo = `
    var chiave = 'k', rifiuti401 = 0, RIFIUTI_PER_ARRENDERSI = 5, ultimoStato = {}
    const note = []
    var fileProgetti = ${JSON.stringify(progetti)}, fileErrore = '', fileDove = null, fileElenco = null, fileVista = null, fileNota = '', filePin = null
    function pannello() { note.push(fileNota) }
    var localStorage = { removeItem() {} }
    function ingresso() {}
    const aspetta = () => Promise.resolve()
    ${estrai('async function chiedi(')}
    ${estrai('function inMb(')}
    ${script.split('\n').find((r) => r.startsWith('const esc = ')) ?? ''}
    ${estrai('function fileMotivo(')}
    ${estrai('async function fileVai(')}
    ${estrai('async function fileLeggiTutto(')}
    ${estrai('function fileHtml(')}
    return {
      leggi: async (p, m) => { fileDove = fileDove || { progetto: ${JSON.stringify('')}, percorso: '' }; return fileLeggiTutto(p, m) },
      vai: fileVai, html: fileHtml, note, stato: () => ({ filePin, fileElenco })
    }
  `
  return new Function('fetch', 'URL', corpo)(fetch, { revokeObjectURL() {} }) as Pagina
}

function pc(): { rotte: ReturnType<typeof rotteClient>; cwd: string; segreto: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'sd-fp-'))
  const segreto = mkdtempSync(join(tmpdir(), 'sd-fp-s-'))
  mkdirSync(join(cwd, 'src'))
  writeFileSync(join(cwd, 'src', 'index.ts'), 'export const x = 1\n')
  const g = creaGuardianoPin({ leggi: () => undefined, scrivi: () => {}, passphraseGiusta: async () => false })
  void g.impostaPin('4821').then(() => g.proteggiChat('s-riservata', true))
  const rotte = rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-fp-d-'))),
    chat: () => [{ id: 'p-2', titolo: 'Riservata', cwd: segreto, sessione: 's-riservata' }],
    autopiloti: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    pin: g,
    fileProgetti: apriFileProgetti({ candidati: async () => [cwd, segreto], home: 'C:\\Users\\Esempio' })
  } as unknown as DipendenzeRotte)
  return { rotte, cwd, segreto }
}

describe('la sezione File della pagina', () => {
  it('legge un file a pezzi; la rete cade a metà e riprende', async () => {
    const p = pc()
    const dati = randomBytes(FILE_PEZZO_BYTE * 2 + 5)
    writeFileSync(join(p.cwd, 'foto.png'), dati)
    let chiamate = 0
    const fetch = async (percorso: string, o: { body?: string }): Promise<unknown> => {
      const corpo = o.body !== undefined ? JSON.parse(o.body) as Record<string, unknown> : undefined
      if (percorso === '/api/file/leggi' && ++chiamate === 2) throw new TypeError('Failed to fetch')
      const e = await p.rotte({ metodo: 'POST', percorso, corpo: { ...corpo, progetto: p.cwd }, dispositivo: 't1' })
      return { status: e.stato, ok: e.stato >= 200 && e.stato < 300, json: async () => e.corpo }
    }
    const pag = pagina(fetch, [])
    const t = await pag.leggi('foto.png', Infinity)
    expect(Buffer.concat(t.parti.map((u) => Buffer.from(u))).equals(dati)).toBe(true)
    expect(t.mime).toBe('image/png')
    expect(pag.note.some((n) => n.includes('la rete è caduta'))).toBe(true)
  })
  it('una cartella si disegna con Guarda e Scarica; il progetto protetto chiede il PIN', async () => {
    const p = pc()
    await new Promise((r) => setTimeout(r, 50))
    const fetch = async (percorso: string, o: { body?: string }): Promise<unknown> => {
      const e = await p.rotte({ metodo: 'POST', percorso, corpo: o.body !== undefined ? JSON.parse(o.body) : undefined, dispositivo: 't1' })
      return { status: e.stato, ok: e.stato >= 200 && e.stato < 300, json: async () => e.corpo }
    }
    const pag = pagina(fetch, [{ nome: 'progetto', percorso: p.cwd }, { nome: 'riservato', percorso: p.segreto, chiuso: true }])
    await pag.vai(p.cwd, 'src')
    const h = pag.html()
    expect(h).toContain('index.ts')
    expect(h).toContain('onclick="fileGuarda(this)"')
    expect(h).toContain('onclick="fileScarica(this)"')
    expect(h).toContain('Carica qui')
    await pag.vai(p.segreto, '')
    expect(pag.stato().filePin?.chat).toBe('p-2')
    expect(pag.html()).toContain('id="file-pin"')
    expect(pag.html()).toContain('Progetto protetto')
  })
  it('il tasto File sta in Computer, e lo script si legge', () => {
    expect(script).toContain('apriPannello(\\\'file\\\')')
    expect(() => new Function(script)).not.toThrow()
  })
})
