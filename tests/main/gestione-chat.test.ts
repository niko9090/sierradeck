import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { byteDi, creaGestioneChat, fileDiSessione, type DipendenzeGestioneChat, type InfoSessione } from '../../src/main/gestione-chat'
import type { StatoPerAzione } from '@shared/gestione-chat'

// 0.79.0: Chiudi, Archivia, Elimina dal PC, recupero e «Svuota adesso», su
// cartelle temporanee che imitano `~/.claude`. Mai le cartelle vere.

const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const SLUG = 'E--progetti-esempio'
const GIORNO = 86_400_000

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
const scrivi = (radice: string, rel: string, testo: string): void => {
  const p = join(radice, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, testo)
}

/** Una radice di Claude Code con due chat dello stesso progetto, e le cose condivise. */
function radiceDiProva(): string {
  const r = tmp('sd-claude-')
  for (const s of [S1, S2]) {
    scrivi(r, `projects/${SLUG}/${s}.jsonl`, `{"sessione":"${s}"}\n`.repeat(10))
    scrivi(r, `projects/${SLUG}/${s}/subagents/agent-1.jsonl`, 'sotto-agente\n')
    scrivi(r, `projects/${SLUG}/${s}/tool-results/r.txt`, 'risultato')
    scrivi(r, `file-history/${s}/abc@v1`, 'versione di un file')
    scrivi(r, `session-env/${s}/env`, 'x')
    scrivi(r, `todos/${s}-agent-${s}.json`, '[]')
  }
  scrivi(r, 'history.jsonl', 'condivisa')
  scrivi(r, 'settings.json', '{}')
  return r
}

type Scena = {
  g: ReturnType<typeof creaGestioneChat>
  radice: string
  dati: string
  log: string[]
  indice: Set<string>
  etichette: Record<string, string>
  stati: Map<string, Partial<StatoPerAzione>>
  chiuse: string[]
  drive: { tolte: string[][]; annullate: string[]; svuotate: string[] }
  orologio: { ora: number }
  tolteDaiWs: string[]
}

function scena(o: { drive?: boolean; chiudiFallisce?: boolean } = {}): Scena {
  const radice = radiceDiProva()
  const dati = tmp('sd-dati-')
  const log: string[] = []
  const indice = new Set([S1, S2])
  const etichette: Record<string, string> = { [S1]: 'Il lettore di CSV' }
  const stati = new Map<string, Partial<StatoPerAzione>>()
  const chiuse: string[] = []
  const drive = { tolte: [] as string[][], annullate: [] as string[], svuotate: [] as string[] }
  const orologio = { ora: Date.parse('2026-10-17T10:00:00Z') }
  const tolteDaiWs: string[] = []
  const info: Record<string, InfoSessione> = {
    [S1]: { sessione: S1, slug: SLUG, titolo: 'Il lettore di CSV', cwd: 'E:\\progetti\\esempio', ultimaAttivita: '2026-10-10T10:00:00Z' },
    [S2]: { sessione: S2, slug: SLUG, titolo: 'Bozza', cwd: 'E:\\progetti\\esempio', ultimaAttivita: '2026-10-11T10:00:00Z' }
  }
  const deps: DipendenzeGestioneChat = {
    radiceClaude: () => radice,
    dati,
    sessioni: () => [...indice].map((s) => info[s] as InfoSessione),
    togliDallIndice: (l) => { for (const s of l) indice.delete(s) },
    rileggiIndice: () => { for (const s of [S1, S2]) if (existsSync(join(radice, 'projects', SLUG, `${s}.jsonl`))) indice.add(s) },
    statoDi: async ({ sessione }) => ({ sessione, ...(stati.get(sessione) ?? {}) }),
    chiudi: async (s) => {
      if (o.chiudiFallisce === true) return { ok: false, errore: 'nessuna finestra' }
      chiuse.push(s); stati.delete(s); return { ok: true }
    },
    etichette: {
      leggi: () => ({ ...etichette }),
      imposta: (s, t) => { if (t === '') delete etichette[s]; else etichette[s] = t }
    },
    ...(o.drive === true ? {
      drive: {
        togliChat: async (s: string[]) => { drive.tolte.push(s); return { ok: true, messaggio: 'ok', pulizia: { id: `pulizia-${drive.tolte.length}`, voci: [1, 2], byte: 999 } } },
        annulla: async (id: string) => { drive.annullate.push(id); return { ok: true, messaggio: 'ok' } },
        svuota: async (id: string) => { drive.svuotate.push(id); return { ok: true, messaggio: 'ok' } }
      }
    } : {}),
    togliDaiWorkspaceNascosti: (s) => { tolteDaiWs.push(s); return s === S2 ? ['Notte'] : [] },
    log: (m) => log.push(m),
    adesso: () => orologio.ora
  }
  return { g: creaGestioneChat(deps), radice, dati, log, indice, etichette, stati, chiuse, drive, orologio, tolteDaiWs }
}

const fileDi = (radice: string, s: string): string[] => fileDiSessione(radice, SLUG, s).map((f) => f.relativo.join('/')).sort()

describe('Elimina dal PC', () => {
  it('toglie solo i file di quella sessione, li mette nel recupero e misura lo spazio', async () => {
    const x = scena()
    const prima = fileDi(x.radice, S2)
    const byteS1 = (await x.g.spazio()).chat.find((c) => c.sessione === S1)?.byte ?? 0
    expect(byteS1).toBeGreaterThan(0)

    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(e.fatte).toBe(1)
    expect(e.byte).toBe(byteS1)
    expect(e.messaggio).toMatch(/1 chat eliminata dal PC: .* tolti dalle chat/)
    // Di S1 non resta niente nelle cartelle di Claude Code.
    expect(fileDi(x.radice, S1)).toEqual([])
    // S2 e le cose condivise sono intatte.
    expect(fileDi(x.radice, S2)).toEqual(prima)
    expect(readFileSync(join(x.radice, 'history.jsonl'), 'utf8')).toBe('condivisa')
    expect(existsSync(join(x.radice, 'projects', SLUG))).toBe(true)
    // Le sue voci: indice e nome.
    expect(x.indice.has(S1)).toBe(false)
    expect(x.etichette[S1]).toBeUndefined()
    // Nel recupero, per 30 giorni, con tutti i suoi byte.
    const rec = x.g.recupero()
    expect(rec.chat).toHaveLength(1)
    expect(rec.chat[0]?.scadeIl).toBe('2026-11-16T10:00:00.000Z')
    expect(rec.byte).toBe(byteS1)
    expect(rec.chat[0]?.file.map((f) => f.parte).sort()).toEqual(['ambiente', 'sotto-agenti', 'storia-file', 'todo', 'trascrizione'])
    expect(rec.chat[0]?.file.reduce((t, f) => t + f.byte, 0)).toBe(byteS1)
    expect(await byteDi(join(x.dati, 'recupero-chat'))).toBe(byteS1)
  })

  it('si rifiuta per una chat che lavora, aspetta, è governata, è di un altro PC: e non tocca niente', async () => {
    const x = scena()
    const prima = fileDi(x.radice, S1)
    for (const st of [
      { aperta: { lavora: true, chiede: false } },
      { aperta: { lavora: false, chiede: true } },
      { aperta: { lavora: false, chiede: false } },
      { governata: { autopilota: 'Notte', attivo: true } },
      { altroPc: 'PC-ESEMPIO' }
    ] satisfies Partial<StatoPerAzione>[]) {
      x.stati.set(S1, st)
      const e = await x.g.azione({ azione: 'elimina', sessioni: [S1] })
      expect(e.fatte).toBe(0)
      expect(e.esiti[0]?.motivo).toMatch(/«Il lettore di CSV»/)
      expect(fileDi(x.radice, S1)).toEqual(prima)
      expect(x.indice.has(S1)).toBe(true)
    }
    expect(x.g.recupero().chat).toEqual([])
  })

  it('più chat insieme: le possibili sì, le altre col motivo; lo spazio è la somma', async () => {
    const x = scena()
    x.stati.set(S2, { aperta: { lavora: true, chiede: false } })
    const v = await x.g.spazio()
    const sel = totale(v.chat, [S1, S2])
    expect(sel.eliminabili).toBe(1)
    expect(sel.escluse[0]?.motivo).toMatch(/sta lavorando/)
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1, S2, S1, 'non-valida'] })
    expect(e.fatte).toBe(1)
    expect(e.rifiutate).toBe(1)
    expect(e.byte).toBe(sel.byteEliminabili)
  })

  it('una chat senza file qui: niente da eliminare', async () => {
    const x = scena()
    const e = await x.g.azione({ azione: 'elimina', sessioni: ['33333333-3333-4333-8333-333333333333'] })
    expect(e.esiti[0]?.motivo).toMatch(/non ha file su questo PC/)
  })

  it('«anche dal Drive»: le copie lassù vanno nel recupero del Drive, una pulizia per volta', async () => {
    const x = scena({ drive: true })
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1, S2], ancheDalDrive: true })
    expect(e.fatte).toBe(2)
    expect(x.drive.tolte).toEqual([[S1, S2]])
    expect(e.messaggio).toMatch(/Anche dal Drive/)
    expect(x.g.recupero().chat.every((c) => c.drive?.pulizia === 'pulizia-1')).toBe(true)
  })

  it('senza «anche dal Drive» il Drive non si tocca', async () => {
    const x = scena({ drive: true })
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(x.drive.tolte).toEqual([])
  })

  it('una chat eliminata non scende di nuovo dal Drive; rimessa, sì', async () => {
    const x = scena()
    expect(x.g.tolteDaQui(`chat/${SLUG}/${S1}.jsonl`)).toBe(false)
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(x.g.tolteDaQui(`chat/${SLUG}/${S1}.jsonl`)).toBe(true)
    expect(x.g.tolteDaQui(`chat/${SLUG}/${S1}/subagents/agent-1.jsonl`)).toBe(true)
    expect(x.g.tolteDaQui(`chat/${SLUG}/${S2}.jsonl`)).toBe(false)
    expect(x.g.tolteDaQui('progetti/x/y.txt')).toBe(false)
    const id = x.g.recupero().chat[0]?.id as string
    await x.g.ripristinaDalRecupero(id)
    expect(x.g.tolteDaQui(`chat/${SLUG}/${S1}.jsonl`)).toBe(false)
  })
})

function totale(voci: Awaited<ReturnType<ReturnType<typeof creaGestioneChat>['spazio']>>['chat'], scelte: string[]) {
  const set = new Set(scelte)
  const sel = voci.filter((v) => set.has(v.sessione))
  const ok = sel.filter((v) => v.nonEliminabile === undefined)
  return { eliminabili: ok.length, byteEliminabili: ok.reduce((t, v) => t + v.byte, 0), escluse: sel.filter((v) => v.nonEliminabile !== undefined).map((v) => ({ motivo: v.nonEliminabile })) }
}

describe('il recupero', () => {
  it('«Ripristina» rimette i file al loro posto, con il nome', async () => {
    const x = scena()
    const prima = fileDi(x.radice, S1)
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    const id = x.g.recupero().chat[0]?.id as string
    const e = await x.g.ripristinaDalRecupero(id)
    expect(e.ok).toBe(true)
    expect(fileDi(x.radice, S1)).toEqual(prima)
    expect(x.etichette[S1]).toBe('Il lettore di CSV')
    expect(x.indice.has(S1)).toBe(true)
    expect(x.g.recupero().chat).toEqual([])
    // Nel recupero non resta niente, neanche le cartelle vuote.
    expect(readdirSync(join(x.dati, 'recupero-chat'))).toEqual([])
    // Due volte no.
    expect((await x.g.ripristinaDalRecupero(id)).ok).toBe(false)
  })

  it('non sovrascrive una chat con lo stesso id tornata nel frattempo', async () => {
    const x = scena()
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    scrivi(x.radice, `projects/${SLUG}/${S1}.jsonl`, 'nuova')
    const e = await x.g.ripristinaDalRecupero(x.g.recupero().chat[0]?.id as string)
    expect(e.ok).toBe(false)
    expect(e.messaggio).toMatch(/non la sovrascrivo/)
    expect(readFileSync(join(x.radice, 'projects', SLUG, `${S1}.jsonl`), 'utf8')).toBe('nuova')
    expect(x.g.recupero().chat).toHaveLength(1)
  })

  it('rimessa una chat sola di una pulizia del Drive: la pulizia si annulla; con altre no', async () => {
    const x = scena({ drive: true })
    await x.g.azione({ azione: 'elimina', sessioni: [S1, S2], ancheDalDrive: true })
    const [a, b] = x.g.recupero().chat
    const e1 = await x.g.ripristinaDalRecupero(a?.id as string)
    expect(e1.messaggio).toMatch(/con altre chat/)
    expect(x.drive.annullate).toEqual([])
    const e2 = await x.g.ripristinaDalRecupero(b?.id as string)
    expect(e2.messaggio).toMatch(/copia sul Drive è tornata/)
    expect(x.drive.annullate).toEqual(['pulizia-1'])
  })

  it('dopo 30 giorni si svuota da solo, dentro la cartella del recupero', async () => {
    const x = scena()
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    x.orologio.ora += 29 * GIORNO
    await x.g.giro()
    expect(x.g.recupero().chat).toHaveLength(1)
    x.orologio.ora += 2 * GIORNO
    await x.g.giro()
    expect(x.g.recupero().chat).toEqual([])
    expect(readdirSync(join(x.dati, 'recupero-chat'))).toEqual([])
    expect(existsSync(x.dati)).toBe(true)
    // L'arrivo dal Drive lo sa ancora.
    expect(x.g.tolteDaQui(`chat/${SLUG}/${S1}.jsonl`)).toBe(true)
    expect(fileDi(x.radice, S2).length).toBeGreaterThan(0)
  })
})

describe('«Svuota il recupero adesso»', () => {
  it('due passi: il gettone e la parola; poi lo spazio è libero davvero', async () => {
    const x = scena({ drive: true })
    await x.g.azione({ azione: 'elimina', sessioni: [S1, S2], ancheDalDrive: true })
    const byte = x.g.recupero().byte
    const c = x.g.chiediSvuota(true)
    expect(c.ok).toBe(true)
    expect(c.chat).toBe(2)
    expect(c.messaggio).toMatch(/Non si torna indietro/)
    const e = await x.g.svuota({ gettone: c.gettone, frase: c.frase, ancheDalDrive: true })
    expect(e.ok).toBe(true)
    expect(e.byte).toBe(byte)
    expect(await byteDi(join(x.dati, 'recupero-chat'))).toBe(0)
    expect(x.drive.svuotate).toEqual(['pulizia-1'])
    expect(x.g.recupero().chat).toEqual([])
  })

  it('senza la parola, con un gettone vecchio, o dopo due minuti: niente', async () => {
    const x = scena()
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect((await x.g.svuota({ gettone: 'inventato', frase: 'SVUOTA', ancheDalDrive: false })).ok).toBe(false)
    const c = x.g.chiediSvuota(false)
    expect((await x.g.svuota({ gettone: c.gettone, frase: 'ok', ancheDalDrive: false })).ok).toBe(false)
    expect((await x.g.svuota({ gettone: c.gettone, frase: 'SVUOTA', ancheDalDrive: true })).messaggio).toMatch(/cambiato/)
    x.orologio.ora += 3 * 60_000
    expect((await x.g.svuota({ gettone: c.gettone, frase: 'SVUOTA', ancheDalDrive: false })).messaggio).toMatch(/scaduta/)
    expect(x.g.recupero().chat).toHaveLength(1)
    // Un gettone si usa una volta sola.
    const d = x.g.chiediSvuota(false)
    expect((await x.g.svuota({ gettone: d.gettone, frase: 'SVUOTA', ancheDalDrive: false })).ok).toBe(true)
    expect((await x.g.svuota({ gettone: d.gettone, frase: 'SVUOTA', ancheDalDrive: false })).ok).toBe(false)
  })

  it('se nel frattempo entra un’altra chat nel recupero, la conferma va rifatta', async () => {
    const x = scena()
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    const c = x.g.chiediSvuota(false)
    await x.g.azione({ azione: 'elimina', sessioni: [S2] })
    expect((await x.g.svuota({ gettone: c.gettone, frase: 'SVUOTA', ancheDalDrive: false })).messaggio).toMatch(/cambiato/)
  })

  it('recupero vuoto: niente da chiedere', () => {
    expect(scena().g.chiediSvuota(false)).toEqual({ ok: false, messaggio: 'Il recupero è vuoto.' })
  })
})

describe('Chiudi, Archivia, Ripristina, Rinomina', () => {
  it('Chiudi ferma la chat aperta e la lascia dov’è', async () => {
    const x = scena()
    x.stati.set(S1, { aperta: { lavora: true, chiede: false } })
    const e = await x.g.azione({ azione: 'chiudi', sessioni: [S1, S2] })
    expect(x.chiuse).toEqual([S1])
    expect(e.fatte).toBe(1)
    expect(e.esiti.find((r) => r.sessione === S2)?.motivo).toMatch(/già chiusa/)
    expect(fileDi(x.radice, S1).length).toBeGreaterThan(0)
  })

  it('Archivia: chiude se aperta e ferma, la toglie dagli elenchi, Ripristina la rimette', async () => {
    const x = scena()
    x.stati.set(S1, { aperta: { lavora: false, chiede: false } })
    const e = await x.g.azione({ azione: 'archivia', sessioni: [S1] })
    expect(e.fatte).toBe(1)
    expect(x.chiuse).toEqual([S1])
    expect(x.g.eArchiviata(S1)).toBe(true)
    expect(x.g.archiviate()[0]?.titolo).toBe('Il lettore di CSV')
    expect(fileDi(x.radice, S1).length).toBeGreaterThan(0)
    expect((await x.g.spazio()).chat.find((c) => c.sessione === S1)?.archiviata).toBe(true)
    await x.g.azione({ azione: 'ripristina', sessioni: [S1] })
    expect(x.g.eArchiviata(S1)).toBe(false)
    expect((await x.g.azione({ azione: 'ripristina', sessioni: [S1] })).esiti[0]?.motivo).toMatch(/non è fra le archiviate/)
  })

  it('Archivia non tocca una chat che lavora, né una che non si chiude', async () => {
    const x = scena({ chiudiFallisce: true })
    x.stati.set(S1, { aperta: { lavora: true, chiede: false } })
    expect((await x.g.azione({ azione: 'archivia', sessioni: [S1] })).fatte).toBe(0)
    x.stati.set(S1, { aperta: { lavora: false, chiede: false } })
    const e = await x.g.azione({ azione: 'archivia', sessioni: [S1] })
    expect(e.esiti[0]?.motivo).toMatch(/non si è chiusa/)
    expect(x.g.eArchiviata(S1)).toBe(false)
  })

  it('le archiviate restano dopo un riavvio', async () => {
    const x = scena()
    await x.g.azione({ azione: 'archivia', sessioni: [S2] })
    const di = JSON.parse(readFileSync(join(x.dati, 'chat-archiviate.json'), 'utf8')) as { archiviate: { sessione: string }[] }
    expect(di.archiviate.map((a) => a.sessione)).toEqual([S2])
  })

  it('eliminare un’archiviata la toglie anche da Archiviate; rimessa, torna archiviata', async () => {
    const x = scena()
    await x.g.azione({ azione: 'archivia', sessioni: [S2] })
    await x.g.azione({ azione: 'elimina', sessioni: [S2] })
    expect(x.g.eArchiviata(S2)).toBe(false)
    await x.g.ripristinaDalRecupero(x.g.recupero().chat[0]?.id as string)
    expect(x.g.eArchiviata(S2)).toBe(true)
  })

  it('Rinomina cambia il nome, vuoto torna a quello di Claude', async () => {
    const x = scena()
    await x.g.azione({ azione: 'rinomina', sessioni: [S2], nome: '  Casa   nuova ' })
    expect(x.etichette[S2]).toBe('Casa nuova')
    await x.g.azione({ azione: 'rinomina', sessioni: [S2], nome: '' })
    expect(x.etichette[S2]).toBeUndefined()
  })
})

describe('i riquadri nei workspace nascosti', () => {
  it('eliminata o archiviata: il suo riquadro esce dai workspace nascosti; al ripristino lo si dice', async () => {
    const x = scena()
    await x.g.azione({ azione: 'archivia', sessioni: [S1] })
    await x.g.azione({ azione: 'elimina', sessioni: [S2] })
    expect(x.tolteDaiWs).toEqual([S1, S2])
    expect(x.g.recupero().chat[0]?.workspace).toEqual(['Notte'])
    const e = await x.g.ripristinaDalRecupero(x.g.recupero().chat[0]?.id as string)
    expect(e.messaggio).toMatch(/Era nel workspace «Notte»: si riapre da «Riprendi una conversazione»/)
  })

  it('una chat rifiutata non tocca i workspace', async () => {
    const x = scena()
    x.stati.set(S1, { riquadroIn: 'Lavoro' })
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(e.esiti[0]?.motivo).toMatch(/workspace «Lavoro»/)
    expect(x.tolteDaiWs).toEqual([])
  })
})

describe('lo spazio delle chat e le voci orfane', () => {
  it('dalla più grande, con le parti', async () => {
    const x = scena()
    scrivi(x.radice, `file-history/${S2}/grande`, 'x'.repeat(5000))
    const v = await x.g.spazio()
    expect(v.chat.map((c) => c.sessione)).toEqual([S2, S1])
    expect(v.chat[0]?.parti['storia-file']).toBeGreaterThan(5000)
    expect(v.totale).toBe(v.chat.reduce((t, c) => t + c.byte, 0))
  })

  it('orfane: i nomi di chat che non ci sono più; si tolgono solo quelli di chat svuotate da noi', async () => {
    const x = scena()
    x.etichette['33333333-3333-4333-8333-333333333333'] = 'Chat di un altro PC'
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    // Nel recupero il nome è messo da parte con la chat: non è orfano.
    expect(x.g.orfane().etichette).toEqual(['33333333-3333-4333-8333-333333333333'])
    x.etichette[S1] = 'rimesso a mano'
    expect(x.g.orfane().etichette).toEqual(['33333333-3333-4333-8333-333333333333'])
    const c = x.g.chiediSvuota(false)
    await x.g.svuota({ gettone: c.gettone, frase: 'SVUOTA', ancheDalDrive: false })
    expect(x.g.orfane().etichette.sort()).toEqual([S1, '33333333-3333-4333-8333-333333333333'].sort())
    expect(x.g.pulisciOrfane()).toEqual({ etichette: 1, archiviate: 0 })
    expect(x.etichette['33333333-3333-4333-8333-333333333333']).toBe('Chat di un altro PC')
    expect(x.etichette[S1]).toBeUndefined()
  })
})
