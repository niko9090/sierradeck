import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { aggiornaManifesto, leggiManifesto, type Manifesto } from '../../src/main/cassaforte/incrementale'
import { creaQuadroPannello, FILE_REGISTRO_PANNELLO, QUADRO_VECCHIO_FINO_MS } from '../../src/main/cassaforte/quadro-pannello'

/**
 * 25/11: ogni 10 minuti il registro diceva «[pannello] pronto in 3.5–10.5 s
 * (manifesto del Drive 3.0–10.0 s)». Il giro dei workspace dei progetti
 * chiedeva il pannello fresco, e in 10 minuti il manifesto (2 MB) era sempre
 * cambiato: gli altri PC salvano ogni 5 minuti. Adesso il pannello risponde
 * subito con l'ultimo quadro e lo rilegge in sottofondo; il Drive si scarica
 * solo quando il manifesto è cambiato davvero.
 *
 * Il finto Drive conta le chiamate, e ogni scaricamento del manifesto resta
 * appeso finché il test non lo lascia andare: un pannello che lo aspetta si
 * vede.
 */
const NOME_MANIFESTO = 'sierradeck.manifesto'

function finto(): {
  archivio: Archivio
  altroPc: Archivio
  conti: { info: number; scaricati: number; registro: number }
  appesi: () => number
  lascia: () => void
} {
  const vero = archivioInMemoria()
  const conti = { info: 0, scaricati: 0, registro: 0 }
  const attese: (() => void)[] = []
  const archivio: Archivio = {
    ...vero,
    info: (nome) => { conti.info += 1; return (vero.info as NonNullable<Archivio['info']>)(nome) },
    scarica: async (nome, p) => {
      if (nome === NOME_MANIFESTO) {
        conti.scaricati += 1
        await new Promise<void>((r) => { attese.push(r) })
      }
      return vero.scarica(nome, p)
    }
  }
  // Un altro PC: stesso Drive, la sua memoria del manifesto.
  const altroPc: Archivio = { ...vero }
  return {
    archivio, altroPc, conti,
    appesi: () => attese.length,
    lascia: () => { for (const r of attese.splice(0)) r() }
  }
}

const voce = (sha: string): Manifesto['file'][string] => ({ nome: `f_${sha}`, size: 10, mtime: 1, sha })

/** Un salvataggio di un PC: aggiunge una chat al manifesto, rileggendolo fresco prima di scrivere. */
async function salva(a: Archivio, maestra: Buffer, chat: string): Promise<void> {
  await aggiornaManifesto(a, maestra, (m) => ({ ...m, creatoIl: new Date(0).toISOString(), file: { ...m.file, [`claude/projects/x/${chat}.jsonl`]: voce(chat) } }))
}

/** Aspetta (poco) che `cond` diventi vera: la decifratura gira fuori dal thread. */
async function finche(cond: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('non è successo')
}

/** Risponde senza aspettare il Drive? (le promesse già risolte passano prima del timer). */
async function subito<T>(p: Promise<T>): Promise<T | 'aspetta'> {
  return Promise.race([p, new Promise<'aspetta'>((r) => setTimeout(() => r('aspetta'), 20))])
}

describe('il pannello non aspetta il manifesto del Drive (25/11)', () => {
  const prepara = async (): Promise<{ f: ReturnType<typeof finto>; maestra: Buffer; q: ReturnType<typeof creaQuadroPannello>; ora: { t: number } }> => {
    const f = finto()
    const maestra = randomBytes(32)
    await aggiornaManifesto(f.altroPc, maestra, () => ({
      versione: 1, creatoIl: new Date(0).toISOString(),
      file: { [FILE_REGISTRO_PANNELLO]: voce('registro1'), 'claude/projects/x/prima.jsonl': voce('prima') }
    }))
    const ora = { t: 0 }
    const q = creaQuadroPannello({
      manifestoDrive: async () => { const e = await leggiManifesto(f.archivio, maestra); return e.stato === 'ok' ? e.manifesto : undefined },
      leggiFileDrive: async () => { f.conti.registro += 1; return Buffer.from(JSON.stringify({ versione: 1, progetti: [] })) },
      adesso: () => ora.t
    })
    return { f, maestra, q, ora }
  }

  it('una giornata di giri ogni 10 minuti: aspetta solo la prima volta, e vede i salvataggi degli altri PC', async () => {
    const { f, maestra, q, ora } = await prepara()
    // La prima volta non c'è niente da mostrare: si aspetta.
    const primo = q(true)
    expect(await subito(primo)).toBe('aspetta')
    f.lascia()
    expect(Object.keys((await primo)?.manifesto.file ?? {})).toContain('claude/projects/x/prima.jsonl')

    let attese = 0
    for (let giro = 1; giro <= 12; giro += 1) {
      // Gli altri PC salvano due volte fra un giro e l'altro.
      await salva(f.altroPc, maestra, `chat-${giro}-a`)
      await salva(f.altroPc, maestra, `chat-${giro}-b`)
      ora.t += 10 * 60_000
      const r = await subito(q(true))
      if (r === 'aspetta') { attese += 1; f.lascia(); continue }
      // Risponde subito, con il quadro del giro prima…
      expect(Object.keys(r?.manifesto.file ?? {})).toContain(giro === 1 ? 'claude/projects/x/prima.jsonl' : `claude/projects/x/chat-${giro - 1}-b.jsonl`)
      // …e intanto rilegge: il manifesto è cambiato, si scarica in sottofondo.
      await finche(() => f.appesi() === 1)
      f.lascia()
      // Il pannello dopo la rilettura ha i salvataggi nuovi, senza mai aspettare.
      await finche(async () => {
        const dopo = await subito(q(true))
        expect(dopo).not.toBe('aspetta')
        return Object.keys(dopo === 'aspetta' ? {} : dopo?.manifesto.file ?? {}).includes(`claude/projects/x/chat-${giro}-b.jsonl`)
      })
    }
    expect(attese).toBe(0)
    // Uno scaricamento per giro (era cambiato davvero), più il primo.
    expect(f.conti.scaricati).toBe(13)
    // Il registro dei progetti non è cambiato: scaricato una volta sola.
    expect(f.conti.registro).toBe(1)
  })

  it('se nessuno ha salvato, la rilettura chiede solo «è cambiato?» e non scarica niente', async () => {
    const { f, q, ora } = await prepara()
    const primo = q(true)
    await finche(() => f.appesi() === 1)
    f.lascia()
    await primo
    const prima = { ...f.conti }
    for (let giro = 0; giro < 6; giro += 1) {
      ora.t += 10 * 60_000
      expect(await subito(q(true))).not.toBe('aspetta')
      await finche(() => f.conti.info - prima.info === giro + 1)
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(f.conti.scaricati - prima.scaricati).toBe(0)
    expect(f.conti.info - prima.info).toBe(6)
    expect(f.conti.registro - prima.registro).toBe(0)
  })

  it('il pannello vecchio di oltre un’ora (PC che dormiva) e chi chiede fresco aspettano la lettura vera', async () => {
    const { f, maestra, q, ora } = await prepara()
    const primo = q(true)
    await finche(() => f.appesi() === 1)
    f.lascia()
    await primo
    await salva(f.altroPc, maestra, 'dopo-il-sonno')
    ora.t += QUADRO_VECCHIO_FINO_MS + 1
    const r = q(true)
    expect(await subito(r)).toBe('aspetta')
    f.lascia()
    expect(Object.keys((await r)?.manifesto.file ?? {})).toContain('claude/projects/x/dopo-il-sonno.jsonl')
    // Chi decide (senza `ancheVecchio`) non riceve mai un quadro scaduto.
    await salva(f.altroPc, maestra, 'ancora')
    ora.t += 2 * 60_000
    const fresco = q()
    expect(await subito(fresco)).toBe('aspetta')
    f.lascia()
    expect(Object.keys((await fresco)?.manifesto.file ?? {})).toContain('claude/projects/x/ancora.jsonl')
  })
})

describe('chi scrive il manifesto lo rilegge fresco, mai dalla copia del pannello', () => {
  it('un salvataggio di qui fatto dopo quello di un altro PC tiene le voci di entrambi', async () => {
    const f = finto()
    const maestra = randomBytes(32)
    await salva(f.altroPc, maestra, 'base')
    const q = creaQuadroPannello({
      manifestoDrive: async () => { const e = await leggiManifesto(f.archivio, maestra); return e.stato === 'ok' ? e.manifesto : undefined },
      leggiFileDrive: () => Promise.resolve(undefined)
    })
    const primo = q(true)
    await finche(() => f.appesi() === 1)
    f.lascia()
    await primo
    // L'altro PC salva; il pannello di qui ha ancora la copia vecchia.
    await salva(f.altroPc, maestra, 'suo')
    expect(Object.keys((await q(true))?.manifesto.file ?? {})).not.toContain('claude/projects/x/suo.jsonl')
    // Il salvataggio di qui rilegge il Drive (chiede la versione, la trova cambiata, scarica).
    const mio = salva(f.archivio, maestra, 'mio')
    await finche(() => f.appesi() === 1)
    f.lascia()
    await mio
    const e = await leggiManifesto(f.altroPc, maestra)
    expect(e.stato).toBe('ok')
    const chiavi = Object.keys(e.stato === 'ok' ? e.manifesto.file : {})
    expect(chiavi).toEqual(expect.arrayContaining(['claude/projects/x/base.jsonl', 'claude/projects/x/suo.jsonl', 'claude/projects/x/mio.jsonl']))
  })
})
