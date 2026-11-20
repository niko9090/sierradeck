import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PERCORSO, nomiVociBarra, titoliSezioniImpostazioni } from '../../src/shared/percorsi-menu'

/**
 * k-166m3: dopo il menu unico (7 voci) i testi per l'utente non devono citare
 * voci che non esistono più («Impostazioni → Client», «Account → Drive»…), e
 * ogni tasto del PC deve chiamare un canale che il main registra.
 */
const elenca = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? elenca(p) : /\.tsx?$/.test(p) ? [p] : []
  })
const leggi = (p: string): string => readFileSync(p, 'utf8')
const eCommento = (riga: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(riga)

// Le novità sono la storia (parlano delle versioni di allora); l'inventario dice «prima».
const ESCLUSI = ['novita.ts', 'menu-principale.ts', 'percorsi-menu.ts']
const righeUtente = (): { file: string; n: number; riga: string }[] =>
  elenca('src')
    .filter((f) => !ESCLUSI.some((e) => f.endsWith(e)))
    .flatMap((file) => leggi(file).split(/\r?\n/).map((riga, i) => ({ file, n: i + 1, riga })).filter((r) => !eCommento(r.riga)))

describe('testi che citano il menu', () => {
  it('«Impostazioni → X» cita solo sezioni che esistono', () => {
    const titoli = titoliSezioniImpostazioni()
    const cattivi: string[] = []
    for (const { file, n, riga } of righeUtente()) {
      for (const m of riga.matchAll(/Impostazioni(?: → | › )([^→›«»"'`.,;:)<{}\n]*)/g)) {
        const dopo = (m[1] ?? '').trim()
        if (dopo.startsWith('Windows Update')) continue // le impostazioni di Windows, non le nostre
        if (!titoli.some((t) => dopo.startsWith(t))) cattivi.push(`${file}:${n} «${m[0].trim()}»`)
      }
    }
    expect(cattivi).toEqual([])
  })

  it('niente «Account → …», «Salute → Consumi», «Altri computer» come percorso', () => {
    const cattivi = righeUtente()
      .filter(({ riga }) => /(^|[^\w])Account → |Salute → Consumi|Computer → «Altri computer»|Impostazioni → (Client|Registro|Errori|Altri)/.test(riga))
      .map(({ file, n }) => `${file}:${n}`)
    expect(cattivi).toEqual([])
  })

  it('i percorsi condivisi partono da una sezione o da una voce della barra', () => {
    const titoli = titoliSezioniImpostazioni()
    const barra = nomiVociBarra()
    for (const [chiave, v] of Object.entries(PERCORSO)) {
      const ok = v.startsWith('Impostazioni → ') ? titoli.some((t) => v.startsWith(`Impostazioni → ${t}`)) : barra.some((b) => v.startsWith(b))
      expect(ok, `${chiave}: ${v}`).toBe(true)
    }
  })
})

describe('le azioni chiamano canali che esistono', () => {
  const main = elenca('src/main').map(leggi).join('\n')
  const preload = leggi('src/preload/index.ts')

  it('ogni canale del preload ha un gestore nel main', () => {
    const registrati = new Set([...main.matchAll(/\b(?:ipcMain|ipc)\.(?:handle|on|once)\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]))
    const usati = [...preload.matchAll(/ipcRenderer\.(?:invoke|send|sendSync)\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1] as string)
    expect(usati.length).toBeGreaterThan(200)
    expect([...new Set(usati.filter((c) => !registrati.has(c)))]).toEqual([])
  })

  it('ogni evento che il preload ascolta ha chi lo manda', () => {
    const eventi = [...preload.matchAll(/ipcRenderer\.(?:on|once)\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1] as string)
    expect([...new Set(eventi.filter((e) => !main.includes(`'${e}'`) && !main.includes(`\`${e}\``)))]).toEqual([])
  })

  it('ogni evento della finestra emesso da un tasto ha chi lo ascolta', () => {
    const rend = elenca('src/renderer').map(leggi).join('\n')
    const emessi = [...rend.matchAll(/dispatchEvent\(\s*new (?:Custom)?Event\(\s*['"`](sierradeck:[^'"`]+)/g)].map((m) => m[1] as string)
    const ascoltati = new Set([...rend.matchAll(/addEventListener\(\s*['"`](sierradeck:[^'"`]+)/g)].map((m) => m[1]))
    expect([...new Set(emessi.filter((e) => !ascoltati.has(e)))]).toEqual([])
  })

  it('ogni indirizzo /api/ che la pagina chiama è servito dal PC', () => {
    const pagina = leggi('src/main/client-pagina.ts')
    const chiamati = new Set([...pagina.matchAll(/['"`](\/api\/[a-zA-Z0-9\-_/]+)/g)].map((m) => (m[1] as string).replace(/\/$/, '')))
    const mancanti = [...chiamati].filter((c) => {
      const padre = c.slice(0, c.lastIndexOf('/') + 1)
      return !main.includes(`'${c}'`) && !main.includes(`\`${c}\``) && !main.includes(`'${padre}'`) && !main.includes(`'${c}/`)
    })
    expect(mancanti).toEqual([])
  })
})
