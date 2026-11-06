import { describe, it, expect } from 'vitest'
import { creaSpazioDrive } from '../../src/main/spazio-drive'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
import type { Archivio } from '../../src/main/cassaforte/archivio'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'
import { NOME_PULIZIE, leggiPulizie, doppioniPerNome, revisioniDaCancellare, versioniDaTenere, type RevisioneDrive } from '@shared/spazio-drive'

const GIORNO = 86_400_000
const ADESSO = Date.parse('2026-11-05T12:00:00.000Z')

const rev = (id: string, giorni: number, byte = 100, extra: Partial<RevisioneDrive> = {}): RevisioneDrive =>
  ({ id, modificato: new Date(ADESSO - giorni * GIORNO).toISOString(), byte, ...extra })

describe('revisioni: quali si tolgono', () => {
  it('tiene l’ultima e le N prima, anche se l’elenco non e in ordine', () => {
    const r = [rev('r3', 1), rev('r1', 5), rev('r5', 0), rev('r2', 3), rev('r4', 2)]
    expect(revisioniDaCancellare(r, 2).map((x) => x.id).sort()).toEqual(['r1', 'r2'])
    expect(revisioniDaCancellare(r, 3).map((x) => x.id)).toEqual(['r1'])
    expect(revisioniDaCancellare(r, 0).map((x) => x.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4'])
  })
  it('con poche revisioni non toglie niente, e non tocca quelle fissate', () => {
    expect(revisioniDaCancellare([rev('a', 1), rev('b', 0)], 2)).toEqual([])
    expect(revisioniDaCancellare([rev('a', 9, 1, { tenutaPerSempre: true }), rev('b', 5), rev('c', 4), rev('d', 3), rev('e', 0)], 1).map((x) => x.id)).toEqual(['b', 'c'])
  })
  it('chat 2, indice 3, battiti nessuna in piu; il resto non si tocca mai', () => {
    expect(versioniDaTenere('f_x', 'chat')).toBe(2)
    expect(versioniDaTenere('sierradeck.manifesto', 'sistema')).toBe(3)
    expect(versioniDaTenere('pc-x', 'battiti')).toBe(0)
    for (const n of ['sierradeck.lapidi', 'pulizie-drive', 'f_workspaces', 'sierradeck.cassaforte']) expect(versioniDaTenere(n, 'sistema')).toBeUndefined()
    expect(versioniDaTenere('f_p', 'progetti')).toBeUndefined()
    expect(versioniDaTenere('sierradeck.manifesto.prima-0.1', 'recupero')).toBeUndefined()
  })
})

describe('doppioni per nome: solo chat, progetti e battiti', () => {
  const indice = {
    'chat/s/a.jsonl': { nome: 'f_chat', size: 1, mtime: 1 },
    'sierradeck/workspaces.json': { nome: 'f_ws', size: 1, mtime: 1 }
  }
  it('tiene il piu recente non vuoto; non guarda indice, lapidi, workspace, senza voce', () => {
    const file = [
      { nome: 'f_chat', byte: 10, id: 'v', modificato: '2026-11-01T10:00:00Z' },
      { nome: 'f_chat', byte: 10, id: 'n', modificato: '2026-11-03T10:00:00Z' },
      { nome: 'f_chat', byte: 0, id: 'vuoto', modificato: '2026-11-04T10:00:00Z' },
      { nome: 'f_ws', byte: 5, id: 'w1' }, { nome: 'f_ws', byte: 5, id: 'w2' },
      { nome: 'sierradeck.manifesto', byte: 5, id: 'm1' }, { nome: 'sierradeck.manifesto', byte: 5, id: 'm2' },
      { nome: 'pulizie-drive', byte: 5, id: 'p1' }, { nome: 'pulizie-drive', byte: 5, id: 'p2' },
      { nome: 'f_orfano', byte: 5, id: 'o1' }, { nome: 'f_orfano', byte: 5, id: 'o2' },
      { nome: 'pc-esempio', byte: 5, id: 'b1', modificato: '2026-11-01T10:00:00Z' }, { nome: 'pc-esempio', byte: 5, id: 'b2', modificato: '2026-11-02T10:00:00Z' }
    ]
    const d = doppioniPerNome(file, indice)
    expect(d.map((x) => x.id).sort()).toEqual(['b1', 'v', 'vuoto'])
  })
})

/** Un archivio a mano: doppioni per nome e revisioni, con un rifiuto programmato. */
function banco(opz: { rifiuta?: string[] } = {}) {
  const file = [
    { nome: 'f_chat', byte: 1000, id: 'id-nuovo', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'f_chat', byte: 900, id: 'id-vecchio', modificato: '2026-11-01T10:00:00Z' },
    { nome: 'f_altra', byte: 500, id: 'id-altra', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'f_prog', byte: 500, id: 'id-prog', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'sierradeck.manifesto', byte: 300, id: 'id-man', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'sierradeck.lapidi', byte: 30, id: 'id-lap', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'pulizie-drive', byte: 30, id: 'id-pul', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'f_ws', byte: 30, id: 'id-ws', modificato: '2026-11-04T10:00:00Z' },
    { nome: 'pc-esempio', byte: 20, id: 'id-pc', modificato: '2026-11-04T10:00:00Z' }
  ]
  const n = (k: number, p: string): RevisioneDrive[] => Array.from({ length: k }, (_, i) => rev(`${p}${i}`, k - i, 100))
  const revisioni = new Map<string, RevisioneDrive[]>([
    ['id-nuovo', n(6, 'n')], ['id-vecchio', n(1, 'v')], ['id-altra', n(2, 'a')], ['id-prog', n(9, 'p')], ['id-man', n(8, 'm')],
    ['id-lap', n(9, 'l')], ['id-pul', n(9, 'u')], ['id-ws', n(9, 'w')], ['id-pc', n(5, 'c')]
  ])
  const cancellateRev: string[] = []
  const cancellateId: string[] = []
  const chiamateElenco: string[] = []
  const a = {
    elenca: async () => new Map(), scarica: async () => undefined, carica: async () => undefined, cancella: async () => undefined,
    elencaConDimensioni: async () => file,
    cancellaId: async (id: string) => { cancellateId.push(id) },
    elencaRevisioni: async (id: string) => { chiamateElenco.push(id); return revisioni.get(id) ?? [] },
    cancellaRevisione: async (id: string, r: string) => {
      if (opz.rifiuta?.includes(r) === true) return 'rifiutata' as const
      cancellateRev.push(`${id}/${r}`)
      return 'ok' as const
    }
  } as unknown as Archivio
  const manifesto: Manifesto = {
    versione: 1, creatoIl: '',
    file: {
      'chat/slug/aaaa.jsonl': { nome: 'f_chat', size: 900, mtime: ADESSO - GIORNO },
      'chat/slug/bbbb.jsonl': { nome: 'f_altra', size: 400, mtime: ADESSO - GIORNO },
      'progetto-p1/a.ts': { nome: 'f_prog', size: 400, mtime: ADESSO - GIORNO },
      'sierradeck/workspaces.json': { nome: 'f_ws', size: 30, mtime: ADESSO }
    }
  }
  const oggetti = new Map<string, unknown>()
  const righe: string[] = []
  let ora = ADESSO
  const spazio = creaSpazioDrive({
    archivio: () => a,
    scatola: () => ({ leggi: async <T>(x: string) => oggetti.get(x) as T | undefined, scrivi: async (x: string, o: unknown) => { oggetti.set(x, JSON.parse(JSON.stringify(o))) } }) as never,
    manifestoDrive: async () => manifesto,
    modificaManifesto: async () => ({ ok: true }),
    copieSuiPc: () => new Map(),
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    log: (m) => { righe.push(m) },
    adesso: () => ora
  })
  return { spazio, cancellateRev, cancellateId, chiamateElenco, oggetti, righe, avanti: (ms: number) => { ora += ms } }
}

describe('versioni vecchie nello spazio del Drive', () => {
  it('senza conferma non cancella niente: nemmeno misurando', async () => {
    const b = banco()
    const st = await b.spazio.stato(true)
    expect(st.proposte.some((p) => p.tipo === 'versioni')).toBe(false)
    await b.spazio.giro()
    b.avanti(2 * GIORNO)
    await b.spazio.giro()
    expect(b.cancellateRev).toEqual([])
    expect(b.chiamateElenco).toEqual([])
  })

  it('conta, propone con numeri e byte, e solo la conferma cancella', async () => {
    const b = banco()
    const c = await b.spazio.contaVersioni()
    expect(c.ok).toBe(true)
    // chat id-nuovo: 6 -> 3 da togliere; id-altra: 2 -> 0; manifesto: 8 -> 4; battiti: 5 -> 4; id-vecchio: 1 -> 0.
    const st = await b.spazio.stato(true)
    const p = st.proposte.find((x) => x.tipo === 'versioni')!
    expect(p.versioni).toBe(3 + 4 + 4)
    expect(p.byte).toBe(11 * 100)
    expect(p.breve).toContain('11 versioni')
    expect(b.cancellateRev).toEqual([])
    // Mai lapidi, pulizie, workspace, progetti: non si sono nemmeno lette.
    expect(b.chiamateElenco.sort()).toEqual(['id-altra', 'id-man', 'id-nuovo', 'id-pc', 'id-vecchio'])
    expect(await b.spazio.pulisci('versioni')).toMatchObject({ ok: false })
    expect(b.cancellateRev).toEqual([])

    const e = await b.spazio.liberaVersioni()
    expect(e.ok).toBe(true)
    expect(b.cancellateRev).toHaveLength(11)
    // L'ultima di ogni file resta sempre.
    expect(b.cancellateRev.some((x) => x.endsWith('/n5') || x.endsWith('/m7') || x.endsWith('/c4'))).toBe(false)
    expect(b.cancellateRev.every((x) => /^id-(nuovo|man|pc)\//.test(x))).toBe(true)
    expect((await b.spazio.stato(true)).proposte.some((x) => x.tipo === 'versioni')).toBe(false)
  })

  it('una cancellazione rifiutata dall’API si salta e si registra, senza errore', async () => {
    const b = banco({ rifiuta: ['n0', 'm1'] })
    const e = await b.spazio.liberaVersioni()
    expect(e.ok).toBe(true)
    expect(b.cancellateRev).toHaveLength(9)
    expect(e.messaggio).toContain('2 saltate')
    expect(b.righe.join('\n')).toContain('versione n0 di f_chat: il Drive non la cancella')
  })

  it('i doppioni per nome passano dal recupero e si cancellano per id, mai per nome', async () => {
    const b = banco()
    const st = await b.spazio.stato(true)
    const p = st.proposte.find((x) => x.tipo === 'doppioni-nome')!
    expect(p.voci).toEqual([{ nome: 'f_chat', byte: 900, id: 'id-vecchio' }])
    // Il file che resta non risulta «in recupero».
    const e = await b.spazio.pulisci('doppioni-nome')
    expect(e.ok).toBe(true)
    expect(b.cancellateId).toEqual([])
    const st2 = await b.spazio.stato(true)
    expect(st2.proposte.some((x) => x.tipo === 'doppioni-nome')).toBe(false)
    expect(st2.misura?.inRecupero).toEqual({ file: 1, byte: 900 })
    expect(st2.misura?.perTipo.chat.file).toBe(2)
    expect(leggiPulizie(b.oggetti.get(NOME_PULIZIE)).pulizie).toHaveLength(1)
    b.avanti(31 * GIORNO)
    await b.spazio.giro()
    expect(b.cancellateId).toEqual(['id-vecchio'])
  })
})

describe('google-drive: elenco e cancellazione delle revisioni', () => {
  function finto(risposte: { stato: number; corpo?: unknown }[]) {
    const richieste: { url: string; metodo: string }[] = []
    const fetch = (async (url: string | URL, init?: RequestInit) => {
      richieste.push({ url: decodeURIComponent(String(url)), metodo: init?.method ?? 'GET' })
      const r = risposte.shift() ?? { stato: 500 }
      return new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), { status: r.stato })
    }) as typeof globalThis.fetch
    return { richieste, archivio: creaArchivioDrive({ token: async () => 'TK', fetch }) }
  }

  it('elenca con paginazione, byte e «tenuta per sempre»', async () => {
    const d = finto([
      { stato: 200, corpo: { nextPageToken: 'p2', revisions: [{ id: '1', modifiedTime: '2026-11-01T00:00:00Z', size: '10' }] } },
      { stato: 200, corpo: { revisions: [{ id: '2', modifiedTime: '2026-11-02T00:00:00Z', size: '20', keepForever: true }] } }
    ])
    expect(await d.archivio.elencaRevisioni!('id-1')).toEqual([
      { id: '1', modificato: '2026-11-01T00:00:00Z', byte: 10 },
      { id: '2', modificato: '2026-11-02T00:00:00Z', byte: 20, tenutaPerSempre: true }
    ])
    expect(d.richieste[0]!.url).toContain('/files/id-1/revisions?')
    expect(d.richieste[1]!.url).toContain('pageToken=p2')
  })

  it('cancella una revisione; 404 vale fatta, 403/400 rifiutata, il resto risale', async () => {
    const d = finto([{ stato: 204 }, { stato: 404 }, { stato: 403, corpo: { error: { message: 'cannotDeleteRevision' } } }, { stato: 400 }])
    expect(await d.archivio.cancellaRevisione!('id-1', 'r1')).toBe('ok')
    expect(d.richieste[0]).toMatchObject({ metodo: 'DELETE' })
    expect(d.richieste[0]!.url).toContain('/files/id-1/revisions/r1')
    expect(await d.archivio.cancellaRevisione!('id-1', 'r2')).toBe('ok')
    expect(await d.archivio.cancellaRevisione!('id-1', 'r3')).toBe('rifiutata')
    expect(await d.archivio.cancellaRevisione!('id-1', 'r4')).toBe('rifiutata')
  })

  it('l’elenco con dimensioni porta l’id, anche di due file con lo stesso nome', async () => {
    const d = finto([{ stato: 200, corpo: { files: [{ id: 'a', name: 'f_x', size: '5' }, { id: 'b', name: 'f_x', size: '7' }] } }])
    expect((await d.archivio.elencaConDimensioni!()).map((f) => f.id)).toEqual(['a', 'b'])
    expect(d.richieste[0]!.url).toContain('spaces=appDataFolder')
  })
})
