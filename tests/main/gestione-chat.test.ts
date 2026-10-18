import { describe, it, expect, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { byteDi, creaGestioneChat, fileDiSessione, type DipendenzeGestioneChat, type InfoSessione } from '../../src/main/gestione-chat'
import type { StatoPerAzione } from '@shared/gestione-chat'

// Un disco che rifiuta la scrittura (pieno, file tenuto da un antivirus): per etichetta.
const nonSiScrive = vi.hoisted(() => new Set<string>())
vi.mock('@shared/scrittura-atomica', async (originale) => {
  const m = await originale<typeof import('@shared/scrittura-atomica')>()
  return { ...m, scriviJsonAtomico: (...a: Parameters<typeof m.scriviJsonAtomico>) => (nonSiScrive.has(a[2]) ? false : m.scriviJsonAtomico(...a)) }
})

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

function scena(o: { drive?: boolean; chiudiFallisce?: boolean; ritocca?: (d: DipendenzeGestioneChat) => void } = {}): Scena {
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
        annulla: async (id: string) => { drive.annullate.push(id); return { ok: true, messaggio: 'Annullata: 2 file di nuovo al loro posto.' } },
        svuota: async (id: string) => { drive.svuotate.push(id); return { ok: true, messaggio: 'ok' } }
      }
    } : {}),
    togliDaiWorkspaceNascosti: (s) => { tolteDaiWs.push(s); return s === S2 ? ['Notte'] : [] },
    log: (m) => log.push(m),
    adesso: () => orologio.ora
  }
  o.ritocca?.(deps)
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

  it('una sola richiesta con chat di tutti i tipi (come la scelta multipla del collaudo c-7): solo quella libera va nel recupero, le altre col motivo giusto', async () => {
    const x = scena()
    const S3 = '33333333-3333-4333-8333-333333333333'
    const S4 = '44444444-4444-4444-8444-444444444444'
    const S5 = '55555555-5555-4555-8555-555555555555'
    x.stati.set(S1, { aperta: { lavora: true, chiede: false } })
    x.stati.set(S3, { aperta: { lavora: false, chiede: true } })
    x.stati.set(S4, { governata: { autopilota: 'Notte', attivo: true } })
    x.stati.set(S5, { altroPc: 'PC-ESEMPIO' })
    const prima = fileDi(x.radice, S1)
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1, S3, S4, S5, S2] })
    expect(e.fatte).toBe(1)
    expect(e.rifiutate).toBe(4)
    const motivo = (s: string): string => e.esiti.find((r) => r.sessione === s)?.motivo ?? ''
    expect(motivo(S1)).toMatch(/«Il lettore di CSV» sta lavorando/)
    expect(motivo(S3)).toMatch(/aspetta una tua risposta/)
    expect(motivo(S4)).toMatch(/la guida l’autopilota «Notte», che è attivo/)
    expect(motivo(S5)).toMatch(/vive su «PC-ESEMPIO»: si elimina da lì/)
    expect(e.esiti.find((r) => r.sessione === S2)?.ok).toBe(true)
    // Della chat al lavoro non si è mosso niente; nel recupero c'è solo quella libera.
    expect(fileDi(x.radice, S1)).toEqual(prima)
    expect(x.g.recupero().chat.map((c) => c.sessione)).toEqual([S2])
    expect(e.messaggio).toMatch(/^1 chat eliminata dal PC: .* 4 chat no: guarda il motivo\.$/)
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

  it('«anche dal Drive» con il Drive che dice di no: una riga sola, senza punti doppi (prova dal vero c-75)', async () => {
    // Dal vero: «Dal Drive no: Il Drive non è collegato, o la cassaforte è chiusa.. Le copie lassù restano.»
    const x = scena({ ritocca: (d) => { d.drive = { togliChat: async () => ({ ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }), annulla: async () => ({ ok: true, messaggio: '' }), svuota: async () => ({ ok: true, messaggio: '' }) } } })
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1], ancheDalDrive: true })
    expect(e.fatte).toBe(1)
    expect(e.messaggio).toContain(' Dal Drive no: il Drive non è collegato, o la cassaforte è chiusa. Le copie lassù restano.')
    expect(e.messaggio).not.toMatch(/\.\./)
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
    expect(e2.messaggio).toMatch(/La copia sul Drive: 2 file di nuovo al loro posto./)
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
    nonSiScrive.clear()
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

// La revisione con gli agenti di ECC (17/10): i casi in cui la chat si sarebbe
// tolta lo stesso, o il PC avrebbe detto «fatto» senza averlo fatto.
describe('nel dubbio non si tocca, e non si dice «fatto» se non è vero', () => {
  it('se lo stato di una chat non si legge, non si elimina né si archivia, e lo Spazio lo dice', async () => {
    const x = scena({ ritocca: (d) => { d.statoDi = async () => { throw new Error('guardiano del PIN rotto') } } })
    const prima = fileDi(x.radice, S1)
    for (const azione of ['elimina', 'archivia'] as const) {
      const e = await x.g.azione({ azione, sessioni: [S1] })
      expect(e.fatte).toBe(0)
      expect(e.esiti[0]?.motivo).toMatch(/«Il lettore di CSV»: non riesco a sapere se è in uso/)
    }
    expect(fileDi(x.radice, S1)).toEqual(prima)
    expect(x.g.archiviate()).toEqual([])
    expect((await x.g.spazio()).chat.find((c) => c.sessione === S1)?.nonEliminabile).toMatch(/non riesco a sapere/)
    expect(x.log.some((l) => l.includes('guardiano del PIN rotto'))).toBe(true)
  })

  it('se mentre si misura la chat si riapre e lavora, non si sposta', async () => {
    let letture = 0
    const x = scena({ ritocca: (d) => { d.statoDi = async ({ sessione }) => (++letture === 1 ? { sessione } : { sessione, aperta: { lavora: true, chiede: false } }) } })
    const prima = fileDi(x.radice, S1)
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(e.fatte).toBe(0)
    expect(e.esiti[0]?.motivo).toMatch(/sta lavorando/)
    expect(fileDi(x.radice, S1)).toEqual(prima)
    expect(x.g.recupero().chat).toEqual([])
  })

  it('lo stesso id in maiuscolo è la stessa chat: una sola voce', async () => {
    const x = scena()
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1, S1.toUpperCase()] })
    expect(e.esiti).toHaveLength(1)
    expect(e.fatte).toBe(1)
    expect(x.g.recupero().chat).toHaveLength(1)
    const a = await x.g.azione({ azione: 'archivia', sessioni: [S2.toUpperCase()] })
    expect(a.fatte).toBe(1)
    expect(x.g.eArchiviata(S2)).toBe(true)
  })

  it('due «Elimina» insieme (doppio tocco, PC e telefono): una sola entra nel recupero', async () => {
    const x = scena()
    const [a, b] = await Promise.all([x.g.azione({ azione: 'elimina', sessioni: [S1] }), x.g.azione({ azione: 'elimina', sessioni: [S1] })])
    expect(a.fatte + b.fatte).toBe(1)
    expect([a, b].find((e) => e.fatte === 0)?.esiti[0]?.motivo).toBe('«Il lettore di CSV» è già nel recupero.')
    expect(x.g.recupero().chat).toHaveLength(1)
  })

  it('se il registro del recupero non si scrive, i file tornano al loro posto e la chat resta', async () => {
    const x = scena()
    nonSiScrive.add('recupero-chat')
    const prima = fileDi(x.radice, S1)
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(e.fatte).toBe(0)
    expect(e.esiti[0]?.motivo).toMatch(/non riesco a salvare l’elenco sul disco.*Niente è cambiato\./)
    expect(fileDi(x.radice, S1)).toEqual(prima)
    expect(x.indice.has(S1)).toBe(true)
    expect(x.etichette[S1]).toBe('Il lettore di CSV')
    nonSiScrive.clear()
  })

  it('una chat che l’indice conosce ma senza più file: non diventa una voce vuota nel recupero', async () => {
    const x = scena()
    for (const f of fileDiSessione(x.radice, SLUG, S1)) renameSync(f.percorso, join(x.dati, `via-${f.parte}-${Math.random()}`))
    const e = await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    expect(e.fatte).toBe(0)
    expect(e.esiti[0]?.motivo).toMatch(/non ha file su questo PC/)
    expect(x.g.recupero().chat).toEqual([])
    expect(x.indice.has(S1)).toBe(true)
  })

  it('se le archiviate non si scrivono, Archivia non dice «fatto»', async () => {
    const x = scena()
    nonSiScrive.add('chat-archiviate')
    const e = await x.g.azione({ azione: 'archivia', sessioni: [S1] })
    expect(e.fatte).toBe(0)
    expect(e.esiti[0]?.motivo).toMatch(/non riesco a salvare/)
    expect(x.g.eArchiviata(S1)).toBe(false)
  })

  it('un registro illeggibile si mette da parte, non si copre', async () => {
    const x = scena()
    writeFileSync(join(x.dati, 'recupero-chat.json'), '{"versione":1,"chat":[{"id":')
    expect(x.g.recupero().chat).toEqual([])
    expect(readdirSync(x.dati).some((n) => n.startsWith('recupero-chat.json.illeggibile-'))).toBe(true)
    expect(x.log.some((l) => l.includes('illeggibile'))).toBe(true)
  })

  it('«Ripristina» non segue percorsi fuori posto nel registro', async () => {
    const x = scena()
    await x.g.azione({ azione: 'elimina', sessioni: [S1] })
    const f = join(x.dati, 'recupero-chat.json')
    const reg = JSON.parse(readFileSync(f, 'utf8')) as { chat: { file: { relativo: string[]; dove: string }[] }[] }
    reg.chat[0]!.file[0]!.relativo = ['..', '..', 'fuori.txt']
    writeFileSync(f, JSON.stringify(reg))
    const e = await x.g.ripristinaDalRecupero(x.g.recupero().chat[0]?.id as string)
    expect(e.ok).toBe(false)
    expect(e.messaggio).toMatch(/percorsi fuori posto/)
    expect(x.g.recupero().chat).toHaveLength(1)
  })

  it('Svuota con il Drive che non risponde: il PC si svuota, ma non dice «tutto fatto»', async () => {
    const x = scena({ drive: true, ritocca: (d) => { d.drive!.svuota = async () => ({ ok: false, messaggio: '1 file cancellati, 1 no: riprova più tardi' }) } })
    await x.g.azione({ azione: 'elimina', sessioni: [S1], ancheDalDrive: true })
    const c = x.g.chiediSvuota(true)
    const e = await x.g.svuota({ gettone: c.gettone, frase: c.frase, ancheDalDrive: true })
    expect(e.ok).toBe(false)
    expect(e.byte).toBeGreaterThan(0)
    expect(e.messaggio).toMatch(/Dal recupero del Drive: 0 di 1 svuotati \(1 file cancellati, 1 no/)
    expect(x.g.recupero().chat).toEqual([])
  })
})
