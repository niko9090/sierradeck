import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, utimesSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
import {
  salvaIncrementale, ripristinaIncrementale, manifestoVuoto, leggiManifesto, scriviManifesto, togliPrefisso,
  leggiLapidi, type Manifesto
} from '../../src/main/cassaforte/incrementale'
import { driveFinto } from './drive-finto-0-86'

/**
 * 0.86.2, C1: il manifesto del Drive (l'indice dei file) era «ultimo che
 * scrive vince». Ogni PC lo leggeva all'inizio del salvataggio e lo
 * riscriveva intero alla fine: un PC partito prima rimetteva su le voci
 * vecchie, e un file dei progetti sparito dall'indice ma uguale sul disco
 * veniva **cancellato** dagli altri PC. Qui due (e tre) PC finti salvano
 * insieme sullo stesso Drive, e nessun file si perde.
 */
const maestra = randomBytes(32)
const T = (s: number): number => Date.parse('2026-10-30T10:00:00.000Z') + s * 1000

function cartella(): string {
  return mkdtempSync(join(tmpdir(), 'sd-indice-'))
}
function scrivi(dir: string, rel: string, testo: string, mtime: number): void {
  const p = join(dir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, testo)
  utimesSync(p, mtime / 1000, mtime / 1000)
}
const leggi = (dir: string, rel: string): string => readFileSync(join(dir, rel), 'utf8')

type Pc = { id: string; dir: string; archivio: Archivio; prec: Manifesto }
function pc(id: string, archivio: Archivio): Pc {
  return { id, dir: cartella(), archivio, prec: manifestoVuoto() }
}
async function salva(p: Pc, extra: Partial<Parameters<typeof salvaIncrementale>[0]> = {}): Promise<Awaited<ReturnType<typeof salvaIncrementale>>> {
  const esito = await salvaIncrementale({
    radici: [{ prefisso: 'progetto-p', cartella: p.dir }], maestra, archivio: p.archivio,
    manifestoPrec: p.prec, adesso: new Date(T(100)).toISOString(), pcNome: p.id, proprietario: p.id, ...extra
  })
  // Come `scriviManifestoLocale` della sincronia: il manifesto di qui dice solo cio' che sta su questo disco.
  p.prec = soloSuDisco(esito.manifestoLocale, p.dir)
  return esito
}
function soloSuDisco(m: Manifesto, dir: string): Manifesto {
  const file: Manifesto['file'] = {}
  for (const [k, v] of Object.entries(m.file)) if (existsSync(join(dir, k.slice('progetto-p/'.length)))) file[k] = v
  return { ...m, file }
}
async function sulDrive(a: Archivio): Promise<string[]> {
  const e = await leggiManifesto(a, maestra)
  return e.stato === 'ok' ? Object.keys(e.manifesto.file).sort() : []
}

describe('due PC salvano nello stesso momento', () => {
  it('archivio in memoria: le voci di tutti e due restano nell indice', async () => {
    const archivio = archivioInMemoria()
    const a = pc('torre', archivio)
    const b = pc('portatile', archivio)
    scrivi(a.dir, 'src/a.ts', 'di A', T(1))
    scrivi(b.dir, 'src/b.ts', 'di B', T(2))
    await Promise.all([salva(a), salva(b)])
    expect(await sulDrive(archivio)).toEqual(['progetto-p/src/a.ts', 'progetto-p/src/b.ts'])
  })

  it('Drive finto, controllo e scrittura separati: nessuna voce persa, nessun file cancellato', async () => {
    const drive = driveFinto({ pausaMs: 2 })
    // Due PC = due archivi, ognuno con la sua memoria degli id, come nella realta'.
    const a = pc('torre', creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch, finestraConflittoMs: 40 }))
    const b = pc('portatile', creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch, finestraConflittoMs: 40 }))
    scrivi(a.dir, 'src/a1.ts', 'A1', T(1))
    scrivi(a.dir, 'src/a2.ts', 'A2', T(1))
    scrivi(b.dir, 'src/b1.ts', 'B1', T(2))
    scrivi(b.dir, 'src/b2.ts', 'B2', T(2))
    await Promise.all([salva(a), salva(b)])
    const tutti = ['progetto-p/src/a1.ts', 'progetto-p/src/a2.ts', 'progetto-p/src/b1.ts', 'progetto-p/src/b2.ts']
    expect(await sulDrive(a.archivio)).toEqual(tutti)
    // Un solo manifesto sul Drive, mai un doppione.
    expect(drive.files.filter((f) => f.name === 'sierradeck.manifesto')).toHaveLength(1)

    // Secondo giro, di nuovo insieme, con un file nuovo per parte.
    scrivi(a.dir, 'src/a3.ts', 'A3', T(3))
    scrivi(b.dir, 'src/b3.ts', 'B3', T(4))
    await Promise.all([salva(a), salva(b)])
    expect(await sulDrive(a.archivio)).toEqual([...tutti, 'progetto-p/src/a3.ts', 'progetto-p/src/b3.ts'].sort())
    // Nessuno ha perso niente su disco.
    for (const f of ['a1', 'a2', 'a3']) expect(existsSync(join(a.dir, 'src', `${f}.ts`))).toBe(true)
    for (const f of ['b1', 'b2', 'b3']) expect(existsSync(join(b.dir, 'src', `${f}.ts`))).toBe(true)

    // Un terzo PC ripristina tutto e trova tutto.
    const c = cartella()
    const r = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: c }], maestra, archivio: a.archivio })
    expect(r.scritti).toBe(6)
    expect(leggi(c, 'src/b3.ts')).toBe('B3')
  })
})

describe('chi entra nella finestra fra controllo e scrittura', () => {
  it('un altro PC riscrive l indice subito dopo di me: me ne accorgo rileggendo e rimetto le mie voci', async () => {
    const vero = archivioInMemoria()
    let primaDiMe: Buffer | undefined
    let colpi = 0
    // Come Drive: la scrittura condizionale non e' atomica. Qui, appena scrivo,
    // un altro PC (che aveva controllato prima di me) scrive sopra la sua copia.
    const archivio: Archivio = {
      ...vero,
      finestraConflittoMs: 5,
      caricaSe: async (nome, blocco, attesa) => {
        if (nome === 'sierradeck.manifesto') primaDiMe = await vero.scarica(nome)
        const info = await vero.caricaSe!(nome, blocco, attesa)
        if (nome === 'sierradeck.manifesto' && primaDiMe !== undefined && colpi === 0) {
          colpi += 1
          await vero.carica(nome, primaDiMe)
        }
        return info
      }
    }
    const a = pc('torre', archivio)
    const b = pc('portatile', archivio)
    scrivi(b.dir, 'src/b.ts', 'B', T(1))
    await salva(b)
    scrivi(a.dir, 'src/a.ts', 'A', T(2))
    await salva(a)
    expect(colpi).toBe(1)
    expect(await sulDrive(archivio)).toEqual(['progetto-p/src/a.ts', 'progetto-p/src/b.ts'])
  })
})

describe('una voce che manca non cancella niente (lapidi)', () => {
  it('un client vecchio riscrive l indice senza una voce: il file resta, e chi l ha caricato lo rimette', async () => {
    const archivio = archivioInMemoria()
    const a = pc('torre', archivio)
    const b = pc('portatile', archivio)
    scrivi(a.dir, 'src/x.ts', 'X', T(1))
    await salva(a)
    scrivi(b.dir, 'src/y.ts', 'Y', T(2))
    await salva(b)
    // A prende y.ts dal Drive.
    const ra = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a.dir }], maestra, archivio, manifestoPrec: a.prec })
    a.prec = ra.manifesto as Manifesto
    expect(leggi(a.dir, 'src/y.ts')).toBe('Y')

    // Un client 0.79 con l'indice vecchio lo riscrive intero: y.ts sparisce dall'indice.
    const vecchio = await leggiManifesto(archivio, maestra)
    if (vecchio.stato !== 'ok') throw new Error('manca')
    delete vecchio.manifesto.file['progetto-p/src/y.ts']
    await scriviManifesto(archivio, maestra, vecchio.manifesto)

    // A salva: y.ts non e' suo e non c'e' lapide. Prima si cancellava dal disco; ora resta.
    const ea = await salva(a)
    expect(existsSync(join(a.dir, 'src', 'y.ts'))).toBe(true)
    expect(ea.sospesi).toBe(1)
    expect(ea.toltiQui).toEqual([])
    // E il manifesto di qui lo ricorda com'era: non lo crede «nuovo».
    expect(a.prec.file['progetto-p/src/y.ts']).toBeDefined()

    // B, che l'aveva caricato, lo rimette nell'indice.
    const eb = await salva(b)
    expect(eb.caricati).toBe(1)
    expect(await sulDrive(archivio)).toEqual(['progetto-p/src/x.ts', 'progetto-p/src/y.ts'])

    // E un ripristino con «elimina» (il passaggio di testimone) non lo toglie senza lapide.
    const vecchio2 = await leggiManifesto(archivio, maestra)
    if (vecchio2.stato !== 'ok') throw new Error('manca')
    delete vecchio2.manifesto.file['progetto-p/src/y.ts']
    await scriviManifesto(archivio, maestra, vecchio2.manifesto)
    const rp = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a.dir }], maestra, archivio, manifestoPrec: a.prec, elimina: true })
    expect(rp.eliminati).toBe(0)
    expect(Object.keys(rp.inSospeso ?? {})).toEqual(['progetto-p/src/y.ts'])
    expect(existsSync(join(a.dir, 'src', 'y.ts'))).toBe(true)
  })

  it('una cancellazione vera porta la lapide e arriva agli altri PC (salvataggio e ripristino)', async () => {
    const archivio = archivioInMemoria()
    const a = pc('torre', archivio)
    scrivi(a.dir, 'src/x.ts', 'X', T(1))
    scrivi(a.dir, 'src/z.ts', 'Z', T(1))
    await salva(a)
    const b = pc('portatile', archivio)
    const c = pc('terzo', archivio)
    for (const q of [b, c]) {
      const r = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: q.dir }], maestra, archivio })
      q.prec = r.manifesto as Manifesto
    }
    unlinkSync(join(a.dir, 'src', 'x.ts'))
    const ea = await salva(a)
    expect(ea.cancellati).toBe(1)
    expect(Object.keys((await leggiLapidi(archivio, maestra)).lapidi)).toEqual(['progetto-p/src/x.ts'])
    // B salva: la lapide toglie x.ts anche qui.
    const eb = await salva(b)
    expect(eb.toltiQui).toEqual(['progetto-p/src/x.ts'])
    expect(existsSync(join(b.dir, 'src', 'x.ts'))).toBe(false)
    expect(existsSync(join(b.dir, 'src', 'z.ts'))).toBe(true)
    // C ripristina con «elimina»: idem.
    const rc = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: c.dir }], maestra, archivio, manifestoPrec: c.prec, elimina: true })
    expect(rc.eliminati).toBe(1)
    expect(existsSync(join(c.dir, 'src', 'x.ts'))).toBe(false)
  })

  it('una lapide vecchia non toglie un file rifatto dopo', async () => {
    const archivio = archivioInMemoria()
    const a = pc('torre', archivio)
    const b = pc('portatile', archivio)
    scrivi(a.dir, 'src/x.ts', 'X', T(1))
    await salva(a)
    unlinkSync(join(a.dir, 'src', 'x.ts'))
    await salva(a)
    // B rifa x.ts piu' tardi e lo salva; poi la sua voce sparisce dall'indice.
    scrivi(b.dir, 'src/x.ts', 'X nuovo', T(50))
    await salva(b)
    const m = await leggiManifesto(archivio, maestra)
    if (m.stato !== 'ok') throw new Error('manca')
    delete m.manifesto.file['progetto-p/src/x.ts']
    await scriviManifesto(archivio, maestra, m.manifesto)
    const eb = await salva(b)
    expect(eb.toltiQui).toEqual([])
    expect(leggi(b.dir, 'src/x.ts')).toBe('X nuovo')
    // Era sua: la rimette.
    expect(await sulDrive(archivio)).toEqual(['progetto-p/src/x.ts'])
  })

  it('«Togli» un progetto: i file restano sui PC e chi li aveva caricati non li rimette', async () => {
    const archivio = archivioInMemoria()
    const a = pc('torre', archivio)
    scrivi(a.dir, 'src/x.ts', 'X', T(1))
    await salva(a)
    await togliPrefisso({ maestra, archivio, prefisso: 'progetto-p', adesso: new Date(T(200)).toISOString() })
    const ea = await salva(a)
    expect(ea.caricati).toBe(0)
    expect(existsSync(join(a.dir, 'src', 'x.ts'))).toBe(true)
    expect(await sulDrive(archivio)).toEqual([])
  })
})

describe('l indice si scarica solo quando cambia (I6)', () => {
  it('stessa versione: niente download e niente decifratura; cambiata: si riscarica', async () => {
    const vero = archivioInMemoria()
    let scaricati = 0
    const archivio: Archivio = { ...vero, scarica: (nome, p) => { if (nome === 'sierradeck.manifesto') scaricati += 1; return vero.scarica(nome, p) } }
    const a = pc('torre', archivio)
    scrivi(a.dir, 'src/x.ts', 'X', T(1))
    await salva(a)
    scaricati = 0
    const uno = await leggiManifesto(archivio, maestra)
    const due = await leggiManifesto(archivio, maestra)
    expect(scaricati).toBe(0) // chi l'ha scritto lo conosce gia'
    expect(uno).toEqual(due)
    // Una copia: chi la cambia non cambia quella degli altri.
    if (uno.stato === 'ok') uno.manifesto.file['finto'] = { nome: 'f', size: 1, mtime: 1 }
    const tre = await leggiManifesto(archivio, maestra)
    expect(tre.stato === 'ok' ? tre.manifesto.file['finto'] : 'manca').toBeUndefined()
    // Un altro PC (o un client vecchio) lo riscrive: si riscarica.
    await vero.carica('sierradeck.manifesto', await vero.scarica('sierradeck.manifesto') as Buffer)
    await leggiManifesto(archivio, maestra)
    expect(scaricati).toBe(1)
  })
})

describe('i conti del salvataggio (M1) e il conflitto che resta (M2)', () => {
  const chatT = (s: number): number => Date.now() - 3_600_000 + s * 1000

  it('caricati conta solo i file saliti: saltati e rimandati a parte', async () => {
    const archivio = archivioInMemoria()
    const dir = cartella()
    scrivi(dir, 'p/vecchia.jsonl', 'riga\n', chatT(1))
    // Una chat appena scritta: il giro automatico la rimanda.
    const viva = join(dir, 'p', 'viva.jsonl')
    writeFileSync(viva, 'riga\n')
    const esito = await salvaIncrementale({
      radici: [{ prefisso: 'chat', cartella: dir }], maestra, archivio, manifestoPrec: manifestoVuoto(),
      adesso: new Date().toISOString(), rimandaVive: { quieteMs: 10 * 60_000 }
    })
    expect(esito.caricati).toBe(1)
    expect(esito.rimandati).toBe(1)
    expect(esito.saltati).toBe(0)
  })

  it('una chat che il Drive ha piu lunga: vince il Drive, e al giro dopo non viene sovrascritta', async () => {
    const archivio = archivioInMemoria()
    const dirA = cartella()
    const dirB = cartella()
    const radici = (dir: string) => [{ prefisso: 'chat', cartella: dir }]
    // B la scrive per primo e la salva.
    scrivi(dirB, 'p/s.jsonl', 'l1\n', chatT(1))
    const b1 = await salvaIncrementale({ radici: radici(dirB), maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'b1' })
    // A la prende, la continua e la salva: sul Drive c'e' la piu' lunga.
    const ra = await ripristinaIncrementale({ radici: radici(dirA), maestra, archivio })
    scrivi(dirA, 'p/s.jsonl', 'l1\nl2\nl3\n', chatT(5))
    await salvaIncrementale({ radici: radici(dirA), maestra, archivio, manifestoPrec: ra.manifesto as Manifesto, adesso: 'a1' })
    // B intanto ci aggiunge una riga sua, piu' tardi ma piu' corta.
    scrivi(dirB, 'p/s.jsonl', 'l1\nx\n', chatT(9))
    const b2 = await salvaIncrementale({ radici: radici(dirB), maestra, archivio, manifestoPrec: b1.manifestoLocale, adesso: 'b2' })
    expect(b2.conflitti).toEqual([{ percorso: 'chat/p/s.jsonl', vinto: 'drive' }])
    expect(b2.caricati).toBe(0)
    expect(b2.saltati).toBe(1)
    // Il secondo giro decide uguale: prima qui la copia di B saliva sopra quella di A.
    const b3 = await salvaIncrementale({ radici: radici(dirB), maestra, archivio, manifestoPrec: b2.manifestoLocale, adesso: 'b3' })
    expect(b3.conflitti).toEqual([{ percorso: 'chat/p/s.jsonl', vinto: 'drive' }])
    expect(b3.caricati).toBe(0)
    const c = cartella()
    await ripristinaIncrementale({ radici: radici(c), maestra, archivio })
    expect(leggi(c, 'p/s.jsonl')).toBe('l1\nl2\nl3\n')
    // L'arrivo porta giu' la piu' lunga, e la riga scritta solo su B resta accanto.
    const arrivo = await ripristinaIncrementale({ radici: radici(dirB), maestra, archivio, manifestoPrec: b3.manifestoLocale, adesso: '2026-10-30T11:00:00.000Z' })
    expect(arrivo.conflitti).toEqual([{ percorso: 'chat/p/s.jsonl', vinto: 'drive' }])
    expect(leggi(dirB, 'p/s.jsonl')).toBe('l1\nl2\nl3\n')
    const accanto = readdirSync(join(dirB, 'p')).filter((n) => n.includes('prima-del-drive'))
    expect(accanto).toHaveLength(1)
    expect(accanto[0]?.endsWith('.jsonl')).toBe(false)
    expect(leggi(dirB, `p/${accanto[0] as string}`)).toBe('l1\nx\n')
  })
})
