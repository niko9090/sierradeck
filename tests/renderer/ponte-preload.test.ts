import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Il ponte fra renderer e preload ha due meta' che TypeScript non confronta:
 * `env.d.ts` dichiara che cosa il renderer si aspetta in `window.gestore`, il
 * preload costruisce l'oggetto vero. Se una funzione finisce nel gruppo
 * sbagliato, il typecheck passa e l'app si apre sulla schermata di errore:
 * nella 0.27.0 `suIberna` era dichiarata in `progetti` ma esposta in `posta`,
 * e la prima cosa che vedeva chi aggiornava era «suIberna is not a function».
 *
 * Qui il preload viene eseguito con un `electron` finto, si prende l'oggetto
 * passato a `exposeInMainWorld` e si verifica che ogni foglia dichiarata in
 * `env.d.ts` esista davvero allo stesso percorso.
 */

const esposti: Record<string, unknown> = {}
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (nome: string, api: unknown) => { esposti[nome] = api } },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn(), removeListener: vi.fn() },
  clipboard: { readText: vi.fn(), writeText: vi.fn() },
  webUtils: { getPathForFile: vi.fn() }
}))

/**
 * I percorsi (`progetti.suIberna`) di tutte le foglie dichiarate sotto
 * `Window.gestore`. TypeScript 7 non porta piu' il compilatore in JavaScript,
 * quindi si legge il file per righe: `env.d.ts` e' indentato a due spazi, i
 * gruppi stanno a sei (`      progetti: {`) e le loro voci a otto. Le righe
 * piu' rientrate sono continuazioni di un tipo lungo e non contano. Le voci
 * facoltative (`nome?:`) possono mancare e si saltano.
 */
function fogliaDichiarate(): string[] {
  const righe = readFileSync(resolve('src/renderer/env.d.ts'), 'utf8').split(/\r?\n/)
  const foglie: string[] = []
  let dentroGestore = false
  let gruppo: string | undefined
  for (const riga of righe) {
    if (!dentroGestore) { if (riga === '    gestore: {') dentroGestore = true; continue }
    if (riga === '    }') break
    const apreGruppo = /^ {6}([A-Za-z_]\w*): \{$/.exec(riga)
    if (apreGruppo !== null) { gruppo = apreGruppo[1]; continue }
    if (riga === '      }') { gruppo = undefined; continue }
    const foglia = /^ {8}([A-Za-z_]\w*)(\??): /.exec(riga)
    if (foglia !== null && gruppo !== undefined && foglia[2] === '') foglie.push(`${gruppo}.${foglia[1]}`)
  }
  return foglie
}

describe('il ponte window.gestore', () => {
  it('espone ogni funzione che env.d.ts dichiara, allo stesso percorso', async () => {
    await import('../../src/preload/index')
    const gestore = esposti['gestore'] as Record<string, unknown> | undefined
    expect(gestore).toBeDefined()

    const dichiarate = fogliaDichiarate()
    expect(dichiarate.length).toBeGreaterThan(100)

    const mancanti = dichiarate.filter((p) => {
      let cur: unknown = gestore
      for (const pezzo of p.split('.')) {
        if (cur === null || typeof cur !== 'object' || !(pezzo in (cur as object))) return true
        cur = (cur as Record<string, unknown>)[pezzo]
      }
      return cur === undefined
    })
    // Il messaggio elenca i percorsi: chi legge il rosso sa subito dove guardare.
    expect(mancanti, `dichiarate in env.d.ts ma non esposte dal preload: ${mancanti.join(', ')}`).toEqual([])
  })
})
