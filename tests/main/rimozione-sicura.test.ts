import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaLatoResidente, creaRimozione } from '../../src/main/rimozione-sicura'
import { classifica, destinazioneRecupero, riassunto, scadute } from '../../src/shared/rimozione-sicura'

// 0.58.0, tappa 3: togliere un progetto da un PC non residente senza perdere
// niente. Solo cartelle temporanee e dati d'esempio, mai progetti veri.

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
const scrivi = (radice: string, rel: string, testo: string, quando?: number): void => {
  const p = join(radice, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, testo)
  if (quando !== undefined) utimesSync(p, quando / 1000, quando / 1000)
}

/** Due PC: il residente (A) e chi toglie (B), collegati senza rete. */
function scena(o: { inUso?: () => string | undefined; irraggiungibile?: boolean } = {}) {
  const A = tmp('sd-res-')
  const B = tmp('sd-tog-')
  const dati = tmp('sd-dati-')
  const chatB = tmp('sd-chatB-')
  scrivi(A, 'uguale.txt', 'stesso')
  scrivi(B, 'uguale.txt', 'stesso')
  scrivi(A, 'vecchio.txt', 'nuovo di A', Date.parse('2026-10-09T10:00:00Z'))
  scrivi(B, 'vecchio.txt', 'vecchio di B', Date.parse('2026-10-01T10:00:00Z'))
  scrivi(A, 'nuovo.txt', 'vecchio di A', Date.parse('2026-10-01T10:00:00Z'))
  scrivi(B, 'nuovo.txt', 'nuovo di B', Date.parse('2026-10-09T10:00:00Z'))
  scrivi(B, 'note/solo-qui.md', 'idea solo sul PC B')
  scrivi(B, 'node_modules/pkg/index.js', 'si rifà')
  scrivi(chatB, 's-1.jsonl', '{"x":1}\n{"x":2}\n')
  const residente = creaLatoResidente({ io: () => ({ id: 'pc-a' }), cartellaDi: () => A, chatQui: () => undefined, cartellaChat: () => join(A, '..', 'chat-di-A') })
  const log: string[] = []
  const rimozione = creaRimozione({
    dati, io: () => ({ id: 'pc-b', nome: 'PORTATILE-ESEMPIO' }),
    progetto: () => ({ id: 'prog-1', nome: 'Gestionale', cartella: B, residente: { pc: 'pc-a', nome: 'PC-ESEMPIO' } }),
    chatDi: () => [{ sessione: 's-1', jsonl: join(chatB, 's-1.jsonl') }],
    inUso: o.inUso ?? (() => undefined),
    chiama: async (_pc, percorso, corpo) => {
      if (o.irraggiungibile === true) throw new Error('PC-ESEMPIO non risponde (nessuna strada)')
      if (percorso === '/api/rimozione/analisi') return residente.analizza(corpo)
      if (percorso === '/api/rimozione/stato') return residente.stato(corpo)
      return residente.pezzo(corpo)
    },
    log: (m) => { log.push(m) }
  })
  return { A, B, dati, residente, rimozione, log }
}

describe('la classificazione', () => {
  it('uguale, doppione più vecchio, utile (manca, più nuovo, chat più lunga); node_modules non conta', () => {
    const v = classifica(
      { file: [
        { percorso: 'a', size: 1, mtime: 5, sha: 'x' }, { percorso: 'b', size: 1, mtime: 1, sha: 'y' }, { percorso: 'c', size: 1, mtime: 9, sha: 'z' },
        { percorso: 'd', size: 1, mtime: 1, sha: 'w' }, { percorso: 'spostato.txt', size: 1, mtime: 1, sha: 'k' }, { percorso: 'node_modules/p/x.js', size: 1, mtime: 1, sha: 'n' }
      ], chat: [{ sessione: 's1', size: 10, mtime: 1 }, { sessione: 's2', size: 5, mtime: 1 }, { sessione: 's3', size: 5, mtime: 1 }] },
      { file: [{ percorso: 'A', size: 1, mtime: 5, sha: 'x' }, { percorso: 'b', size: 1, mtime: 3, sha: 'q' }, { percorso: 'c', size: 1, mtime: 3, sha: 'r' }, { percorso: 'altrove/k', size: 1, mtime: 1, sha: 'k' }],
        chat: [{ sessione: 's1', size: 5, mtime: 1 }, { sessione: 's2', size: 5, mtime: 1 }] }
    )
    expect(v.map((x) => `${x.tipo === 'file' ? x.voce.percorso : x.voce.sessione}:${x.classe}${x.motivo !== undefined ? `/${x.motivo}` : ''}`)).toEqual([
      'a:uguale', 'b:doppione', 'c:utile/piu-recente', 'd:utile/manca', 'spostato.txt:uguale', 's1:utile/chat-piu-lunga', 's2:uguale', 's3:utile/manca'
    ])
  })
  it('la conferma automatica solo con zero utili e zero errori', () => {
    const uguale = classifica({ file: [{ percorso: 'a', size: 1, mtime: 1, sha: 'x' }], chat: [] }, { file: [{ percorso: 'a', size: 1, mtime: 1, sha: 'x' }], chat: [] })
    expect(riassunto('P', 'PC-ESEMPIO', uguale, []).automatica).toBe(true)
    const utile = classifica({ file: [{ percorso: 'b', size: 1, mtime: 1, sha: 'y' }], chat: [] }, { file: [], chat: [] })
    expect(riassunto('P', 'PC-ESEMPIO', utile, [{ percorso: 'b', tipo: 'file', dove: '.sierradeck/recuperati/X/b' }]).automatica).toBe(false)
    expect(riassunto('P', 'PC-ESEMPIO', utile, []).nonRecuperati).toHaveLength(1)
  })
  it('il recupero va solo nella cartella dei recuperati, mai fuori', () => {
    expect(destinazioneRecupero('.sierradeck/recuperati/PC-2026', 'src/a.ts')).toBe('.sierradeck/recuperati/PC-2026/src/a.ts')
    expect(destinazioneRecupero('.sierradeck/recuperati/PC-2026', '../../src/a.ts')).toBeUndefined()
    expect(destinazioneRecupero('.sierradeck/recuperati/PC-2026', 'C:/Windows/x')).toBeUndefined()
    expect(destinazioneRecupero('src', 'a.ts')).toBeUndefined()
  })
})

describe('il giro intero, su cartelle temporanee', () => {
  it('confronto, recupero sul residente MAI sopra i suoi file, riassunto, conferma, spostamento e ripristino', async () => {
    const s = scena()
    const st = await s.rimozione.avvia('prog-1')
    expect(st.fase).toBe('attesa-conferma')
    expect(st.riassunto).toMatchObject({ uguali: 1, doppioni: 1, utili: 3 })
    expect(st.riassunto?.nonRecuperati).toEqual([])
    // I file del residente sono intatti.
    expect(readFileSync(join(s.A, 'nuovo.txt'), 'utf8')).toBe('vecchio di A')
    expect(readFileSync(join(s.A, 'vecchio.txt'), 'utf8')).toBe('nuovo di A')
    // Gli utili sono nei recuperati.
    const rec = join(s.A, '.sierradeck', 'recuperati')
    const giro = readdirSync(rec)[0] as string
    expect(giro).toMatch(/^PORTATILE-ESEMPIO-2026/)
    expect(readFileSync(join(rec, giro, 'nuovo.txt'), 'utf8')).toBe('nuovo di B')
    expect(readFileSync(join(rec, giro, 'note', 'solo-qui.md'), 'utf8')).toBe('idea solo sul PC B')
    expect(readFileSync(join(rec, giro, 'chat', 's-1.jsonl'), 'utf8')).toContain('"x":2')
    // La chat che il residente non aveva entra anche fra le sue chat (file nuovo).
    expect(existsSync(join(s.A, '..', 'chat-di-A', 's-1.jsonl'))).toBe(true)
    expect(s.rimozione.domande()).toHaveLength(1)
    // B è ancora al suo posto finché Nicholas non conferma.
    expect(existsSync(join(s.B, 'uguale.txt'))).toBe(true)
    const dopo = s.rimozione.conferma('prog-1')
    expect(dopo.fase).toBe('spostata')
    expect(existsSync(s.B)).toBe(false)
    const [c] = s.rimozione.inRecupero()
    expect(existsSync(join(c!.dove, 'note', 'solo-qui.md'))).toBe(true)
    expect(Date.parse(c!.scadeIl) - Date.parse(c!.quando)).toBe(30 * 86_400_000)
    // Ripristina.
    expect(s.rimozione.ripristina(c!.id).ok).toBe(true)
    expect(readFileSync(join(s.B, 'note', 'solo-qui.md'), 'utf8')).toBe('idea solo sul PC B')
  })

  it('un secondo giro non sovrascrive i recuperati del primo', async () => {
    const s = scena()
    await s.rimozione.avvia('prog-1')
    const r = await s.residente.pezzo({ progetto: 'prog-1', cartella: '.sierradeck/recuperati/X', relativo: 'nuovo.txt', da: 0, dati: Buffer.from('uno').toString('base64'), fine: true })
    const r2 = await s.residente.pezzo({ progetto: 'prog-1', cartella: '.sierradeck/recuperati/X', relativo: 'nuovo.txt', da: 0, dati: Buffer.from('due').toString('base64'), fine: true })
    expect(r.ok && r2.ok).toBe(true)
    expect(readFileSync(join(s.A, '.sierradeck/recuperati/X/nuovo.txt'), 'utf8')).toBe('uno')
    expect(readFileSync(join(s.A, '.sierradeck/recuperati/X/nuovo (2).txt'), 'utf8')).toBe('due')
    const fuori = await s.residente.pezzo({ progetto: 'prog-1', cartella: '.sierradeck/recuperati/X', relativo: '../../../fuori.txt', da: 0, dati: 'eA==', fine: true })
    expect(fuori.ok).toBe(false)
  })

  it('senza differenze: si toglie da solo, ed è ripristinabile', async () => {
    const s = scena()
    // B uguale ad A: tolgo le differenze.
    writeFileSync(join(s.B, 'vecchio.txt'), readFileSync(join(s.A, 'vecchio.txt')))
    writeFileSync(join(s.B, 'nuovo.txt'), readFileSync(join(s.A, 'nuovo.txt')))
    const s2 = creaRimozione({
      dati: s.dati, io: () => ({ id: 'pc-b', nome: 'PORTATILE-ESEMPIO' }),
      progetto: () => ({ id: 'prog-1', nome: 'Gestionale', cartella: s.B, residente: { pc: 'pc-a', nome: 'PC-ESEMPIO' } }),
      chatDi: () => [], inUso: () => undefined,
      chiama: async (_pc, percorso, corpo) => (percorso === '/api/rimozione/analisi' ? s.residente.analizza(corpo) : s.residente.stato(corpo))
    })
    // note/solo-qui.md è ancora solo su B: lo porto anche su A, così non c'è niente di utile.
    writeFileSync(join(s.A, 'note-solo-qui.md'), 'idea solo sul PC B')
    const st = await s2.avvia('prog-1')
    expect(st.riassunto?.utili).toBe(0)
    expect(st.fase).toBe('spostata')
    expect(existsSync(s.B)).toBe(false)
  })

  it('residente irraggiungibile: niente analisi, niente rimozione, e il perché', async () => {
    const s = scena({ irraggiungibile: true })
    const st = await s.rimozione.avvia('prog-1')
    expect(st.fase).toBe('errore')
    expect(st.messaggio).toContain('non si raggiunge')
    expect(st.messaggio).toContain('non tolgo niente')
    expect(existsSync(join(s.B, 'note', 'solo-qui.md'))).toBe(true)
  })

  it('cartella in uso: aspetta e lo dice, non sposta', async () => {
    let uso: string | undefined = 'la chat «Gestionale» è aperta su questa cartella'
    const s = scena({ inUso: () => uso })
    expect((await s.rimozione.avvia('prog-1')).fase).toBe('in-uso')
    uso = undefined
    expect((await s.rimozione.avvia('prog-1')).fase).toBe('attesa-conferma')
    uso = 'un autopilota lavora qui'
    const st = s.rimozione.conferma('prog-1')
    expect(st.fase).toBe('in-uso')
    expect(st.messaggio).toContain('un autopilota lavora qui')
    expect(existsSync(s.B)).toBe(true)
  })

  it('le cartelle scadute: una domanda a Nicholas, e il Cestino solo dopo la scadenza', async () => {
    const s = scena()
    await s.rimozione.avvia('prog-1')
    s.rimozione.conferma('prog-1')
    const [c] = s.rimozione.inRecupero()
    expect(scadute(s.rimozione.inRecupero(), Date.now())).toHaveLength(0)
    expect((await s.rimozione.cestina(c!.id)).ok).toBe(false)
    expect(scadute(s.rimozione.inRecupero(), Date.now() + 31 * 86_400_000)).toHaveLength(1)
  })
})

// Monta le rotte vere del client: con la macchina carica da altre chat sta sui 20 s di regola (19/10).
describe('le rotte del residente: solo fra PC della stessa cassaforte', { timeout: 90_000 }, () => {
  it('un altro PC firmato sì; un telefono, il ponte e questo schermo no', async () => {
    const { rotteClient } = await import('../../src/main/client-rotte')
    const s = scena()
    const rotte = rotteClient({ rimozione: s.residente, chat: () => [] } as unknown as Parameters<typeof rotteClient>[0])
    const chiama = (dispositivo: string) => rotte({ metodo: 'POST', percorso: '/api/rimozione/stato', corpo: { progetto: 'prog-1', cartella: '.sierradeck/recuperati/X', relativo: 'a.txt' }, dispositivo })
    expect((await chiama('pc:pc-b')).stato).toBe(200)
    expect((await chiama('tel-esempio')).stato).toBe(403)
    expect((await chiama('pc:tel:tel-esempio@PC-ESEMPIO')).stato).toBe(403)
    expect((await chiama('locale')).stato).toBe(403)
  })
})
