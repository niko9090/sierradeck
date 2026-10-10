import { describe, it, expect, afterEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { apriAllegati } from '../../src/main/allegati'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte, type Chat } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaGuardianoPin } from '../../src/main/pin-guardiano'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { apriFileProgetti } from '../../src/main/file-progetti'
import { apriAlTelefono, type AlTelefono } from '../../src/main/al-telefono'
import { apriGettoni, configMcp, rispondiMcp, type DipendenzeMcp } from '../../src/main/mcp-telefono'
import { buildClaudeArgs } from '../../src/main/config'
import {
  AL_TELEFONO_MAX_IN_CODA, FILE_PEZZO_BYTE, briciole, cartellaSopra, confermaDaRisposta, controllaConsegna, esitoPerLaChat,
  leggiIdDomandaConferma, idDomandaConferma, potaCoda, progettiDaMostrare, radiceAmmessa, relativoSicuro, testoConferma,
  tipoAnteprima, mimeDi, type Consegna
} from '@shared/file-telefono'
import { raccogliDomande } from '@shared/domande-telefono'
import { conversazioniDomande } from '@shared/domande-conversazioni'
import { ROTTE_PONTE } from '@shared/ponte-telefono'
import { ROTTE_VIA_CANALE } from '@shared/strada-pc'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.54.0: i file fra il PC e il telefono. Sfogliare i progetti (solo dentro,
 * niente traversal, PIN), la coda verso il telefono (persistente, a pezzi,
 * ripresa dopo una caduta, impronta, annulla), il ponte verso un altro PC, e
 * lo strumento `manda_al_telefono` delle chat (gettone, dentro/fuori dalla
 * cartella, rifiuti). Solo dati di esempio, in cartelle temporanee.
 */
const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

describe('le regole pure', () => {
  it('percorsi relativi: si rifiuta tutto quello che esce o inganna Windows', () => {
    for (const ok of ['', 'src', 'src/main/index.ts', 'docs\\note.md', '.sierradeck/quaderno']) expect(relativoSicuro(ok)).toBe(true)
    for (const no of ['..', '../x', 'a/../../b', 'C:\\Windows', 'C:', '/etc/passwd', '\\\\server\\share', 'a.txt:segreto', 'NUL', 'src/con.txt', 'cartella./x', 'a//b', 'a\u0000b', 'x*', 42])
      expect(relativoSicuro(no), String(no)).toBe(false)
  })
  it('un progetto non è mai la radice di un disco, la cartella dell’utente o una che la contiene', () => {
    const home = 'C:\\Users\\Esempio'
    expect(radiceAmmessa('C:\\Progetti\\Esempio', home)).toBe(true)
    expect(radiceAmmessa('C:\\Users\\Esempio\\Documenti\\Sito', home)).toBe(true)
    for (const no of ['C:\\', 'C:', 'D:/', home, 'C:\\Users', 'c:/users/esempio/', '\\\\server\\share']) expect(radiceAmmessa(no, home), no).toBe(false)
    expect(progettiDaMostrare(['C:\\Progetti\\Beta', 'C:\\Users\\Esempio', 'c:/progetti/beta', 'C:\\Progetti\\Alfa', ''], home).map((p) => p.nome)).toEqual(['Alfa', 'Beta'])
  })
  it('briciole, cartella sopra, tipo di anteprima e MIME', () => {
    expect(briciole('Sito', 'src/main')).toEqual([{ nome: 'Sito', percorso: '' }, { nome: 'src', percorso: 'src' }, { nome: 'main', percorso: 'src/main' }])
    expect(cartellaSopra('src/main')).toBe('src')
    expect(cartellaSopra('src')).toBe('')
    expect(cartellaSopra('')).toBeUndefined()
    expect(tipoAnteprima('index.ts')).toBe('testo')
    expect(tipoAnteprima('Dockerfile')).toBe('testo')
    expect(tipoAnteprima('foto.JPG')).toBe('immagine')
    expect(tipoAnteprima('fattura.pdf')).toBe('pdf')
    expect(tipoAnteprima('archivio.zip')).toBe('altro')
    expect(mimeDi('pagina.html')).toBe('text/plain')
    expect(mimeDi('foto.png')).toBe('image/png')
  })
  it('la coda: cartelle, oltre 100 MB, troppi file in attesa — rifiutati con il motivo', () => {
    expect(controllaConsegna({ nome: 'x', byte: 0, cartella: true }, [], 'tel:t1')).toMatchObject({ ok: false, stato: 400 })
    const grande = controllaConsegna({ nome: 'video.mp4', byte: 100 * 1024 * 1024 + 1 }, [], 'tel:t1')
    expect(grande).toMatchObject({ ok: false, stato: 413 })
    expect(!grande.ok && grande.errore).toContain('100 MB')
    const piena: Consegna[] = Array.from({ length: AL_TELEFONO_MAX_IN_CODA }, (_, i) => ({ id: `consegna-${i}aa`, a: 'tel:t1', aNome: 'Telefono', nome: 'a', byte: 1, origine: 'x', da: 'pc', daPc: 'PC-ESEMPIO', creata: new Date().toISOString(), stato: 'attesa' }))
    expect(controllaConsegna({ nome: 'b', byte: 1 }, piena, 'tel:t1')).toMatchObject({ ok: false, stato: 429 })
    // Un altro telefono ha la sua coda.
    expect(controllaConsegna({ nome: 'b', byte: 1 }, piena, 'tel:t2')).toEqual({ ok: true })
  })
  it('scadenze: mai ritirata in due settimane → scaduta; conferma senza risposta in un giorno → scaduta; finite tolte dopo una settimana', () => {
    const giorno = 24 * 60 * 60_000
    const ora = Date.parse('2026-10-20T10:00:00Z')
    const base = { a: 'tel:t1', aNome: 'Telefono', nome: 'a', byte: 1, origine: 'x', da: 'pc' as const, daPc: 'PC-ESEMPIO' }
    const p = potaCoda([
      { ...base, id: 'vecchia-attesa', creata: new Date(ora - 15 * giorno).toISOString(), stato: 'attesa' },
      { ...base, id: 'vecchia-conferma', creata: new Date(ora - 2 * giorno).toISOString(), stato: 'conferma' },
      { ...base, id: 'finita-vecchia', creata: new Date(ora - 9 * giorno).toISOString(), stato: 'consegnata', finitaIl: new Date(ora - 8 * giorno).toISOString() },
      { ...base, id: 'fresca-attesa', creata: new Date(ora - giorno).toISOString(), stato: 'attesa' }
    ], ora)
    expect(p.scadute.map((c) => c.id)).toEqual(['vecchia-attesa', 'vecchia-conferma'])
    expect(p.tolte.map((c) => c.id)).toEqual(['finita-vecchia'])
    expect(p.coda.map((c) => c.id)).toEqual(['vecchia-attesa', 'vecchia-conferma', 'fresca-attesa'])
  })
  it('la risposta alla conferma: sì solo se detto chiaramente', () => {
    for (const si of ['Sì, mandalo', 'si', 'ok', 'Manda pure', 'yes']) expect(confermaDaRisposta(si), si).toBe(true)
    for (const no of ['No, non mandarlo', 'no', 'boh', '', 'aspetta']) expect(confermaDaRisposta(no), no).toBe(false)
    expect(leggiIdDomandaConferma(idDomandaConferma('abc123def'))).toBe('abc123def')
    expect(leggiIdDomandaConferma('d-autopilota')).toBeUndefined()
  })
  it('le rotte nuove passano dal ponte e dal canale WebRTC', () => {
    for (const r of ['/api/file/progetti', '/api/file/elenco', '/api/file/leggi', '/api/consegne', '/api/consegne/pezzo', '/api/consegne/ricevuta']) {
      expect(ROTTE_PONTE).toContain(r)
      expect(ROTTE_VIA_CANALE).toContain(r)
    }
  })
})

describe('sfogliare un progetto (il disco)', () => {
  /** Un progetto d'esempio, con `.git`, una sottocartella e un collegamento che porta fuori. */
  function progetto(): { radice: string; fuori: string } {
    const radice = tmp('sd-ft-prog-')
    const fuori = tmp('sd-ft-fuori-')
    writeFileSync(join(fuori, 'segreto.txt'), 'non si vede')
    mkdirSync(join(radice, '.git'))
    mkdirSync(join(radice, 'src'))
    writeFileSync(join(radice, 'src', 'index.ts'), 'export const x = 1\n')
    writeFileSync(join(radice, 'LEGGIMI.md'), '# Esempio\n')
    // Una giunzione (senza privilegi su Windows) che porta fuori dal progetto.
    symlinkSync(fuori, join(radice, 'scorciatoia'), 'junction')
    return { radice, fuori }
  }

  it('elenca dentro il progetto, cartelle prima, senza .git e senza collegamenti', async () => {
    const { radice } = progetto()
    const fp = apriFileProgetti({ candidati: async () => [radice], home: 'C:\\Users\\Esempio' })
    const e = await fp.elenco(radice, '')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.voci.map((v) => v.nome)).toEqual(['src', 'LEGGIMI.md'])
    expect(e.su).toBeUndefined()
    const sotto = await fp.elenco(radice, 'src')
    expect(sotto.ok && sotto.voci).toMatchObject([{ nome: 'index.ts', percorso: 'src/index.ts', cartella: false, tipo: 'testo' }])
    expect(sotto.ok && sotto.su).toBe('')
  })
  it('rifiuti: risalite, assoluti, progetti non noti, collegamenti che escono', async () => {
    const { radice, fuori } = progetto()
    const fp = apriFileProgetti({ candidati: async () => [radice], home: 'C:\\Users\\Esempio' })
    expect(await fp.elenco(radice, '..')).toMatchObject({ ok: false, stato: 400 })
    expect(await fp.leggi(radice, '../' + 'x', 0)).toMatchObject({ ok: false, stato: 400 })
    expect(await fp.leggi(radice, 'C:\\Windows\\win.ini', 0)).toMatchObject({ ok: false, stato: 400 })
    expect(await fp.elenco(fuori, '')).toMatchObject({ ok: false, stato: 403 })
    // Per nome, il collegamento che esce si rifiuta.
    expect(await fp.leggi(radice, 'scorciatoia/segreto.txt', 0)).toMatchObject({ ok: false, stato: 403 })
    expect(await fp.elenco(radice, 'scorciatoia')).toMatchObject({ ok: false, stato: 403 })
    expect(await fp.leggi(radice, 'non-ce.txt', 0)).toMatchObject({ ok: false, stato: 404 })
    expect(await fp.leggi(radice, 'src', 0)).toMatchObject({ ok: false, stato: 400 })
  })
  it('la cartella dell’utente non è un progetto, anche se Claude Code ci ha lavorato', async () => {
    const home = tmp('sd-ft-home-')
    const fp = apriFileProgetti({ candidati: async () => [home], home })
    expect(await fp.progetti()).toEqual([])
    expect(await fp.elenco(home, '')).toMatchObject({ ok: false, stato: 403 })
  })
  it('legge a pezzi: il file rimesso insieme è uguale', async () => {
    const { radice } = progetto()
    const dati = randomBytes(FILE_PEZZO_BYTE * 2 + 99)
    writeFileSync(join(radice, 'foto.png'), dati)
    const fp = apriFileProgetti({ candidati: async () => [radice], home: 'C:\\Users\\Esempio' })
    const pezzi: Buffer[] = []
    let da = 0
    for (;;) {
      const e = await fp.leggi(radice, 'foto.png', da)
      if (!e.ok) throw new Error(e.errore)
      expect(e).toMatchObject({ byte: dati.length, tipo: 'immagine', mime: 'image/png' })
      pezzi.push(e.dati)
      da += e.dati.length
      if (da >= e.byte) break
    }
    expect(Buffer.concat(pezzi).equals(dati)).toBe(true)
    expect(await fp.leggi(radice, 'foto.png', dati.length + 1)).toMatchObject({ ok: false, stato: 416 })
  })
})

/* ------------------------------------------------------------------ */

const K = 'chiave-di-casa-del-portatile'
type PcFinto = { porta: number; chiaveTelefono: string; idTelefono: string; cwd: string; segreto: string; coda: AlTelefono; scritti: string[] }

async function post(porta: number, percorso: string, corpo: unknown, chiave: string): Promise<{ stato: number; corpo: Record<string, unknown> }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: 'POST', headers: { 'x-sierradeck-chiave': chiave, 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  return { stato: r.status, corpo: await r.json() as Record<string, unknown> }
}

/** Un PC d'esempio («lap»): due progetti, uno con una chat protetta dal PIN; un telefono accoppiato. */
async function portatile(cartellaCoda?: string): Promise<PcFinto> {
  const cwd = tmp('sd-ft-cwd-')
  const segreto = tmp('sd-ft-seg-')
  writeFileSync(join(cwd, 'nota.md'), '# Nota d’esempio\n')
  mkdirSync(join(cwd, 'docs'))
  writeFileSync(join(segreto, 'piano.md'), 'riservato')
  const chat: Chat[] = [
    { id: 'p-1', titolo: 'Clienti', cwd, sessione: 's-clienti' },
    { id: 'p-2', titolo: 'Riservata', cwd: segreto, sessione: 's-riservata' }
  ]
  const g = creaGuardianoPin({ leggi: () => undefined, scrivi: () => {}, passphraseGiusta: async () => false })
  await g.impostaPin('4821')
  g.proteggiChat('s-riservata', true)
  const dispositivi = apriDispositivi(tmp('sd-ft-disp-'))
  const coda = apriAlTelefono({ cartella: cartellaCoda ?? tmp('sd-ft-coda-'), dispositivi: () => dispositivi.elenca(), nomePc: () => 'PC-ESEMPIO' })
  const scritti: string[] = []
  const rotte = rotteClient({
    dispositivi,
    chat: () => chat,
    autopiloti: async () => [],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: (id: string, t: string) => { scritti.push(`${id}:${t}`) },
    aggiornamento: () => ({ fase: 'fermo' }),
    pin: g,
    allegati: apriAllegati({ cartella: tmp('sd-ft-lav-'), segnaInternet: false }),
    fileProgetti: apriFileProgetti({ candidati: async () => [cwd, segreto], home: 'C:\\Users\\Esempio' }),
    alTelefono: coda
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => K, rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'Telefono di prova')
  return { porta: (s.address() as AddressInfo).port, chiaveTelefono: t?.chiave ?? '', idTelefono: t?.id ?? '', cwd, segreto, coda, scritti }
}

describe('le rotte della sezione File, dal telefono', () => {
  it('progetti, elenco e lettura; il progetto con la chat protetta si segna chiuso e risponde 423 finché non c’è il PIN', async () => {
    const pc = await portatile()
    const tel = (p: string, c: Record<string, unknown>): ReturnType<typeof post> => post(pc.porta, p, c, pc.chiaveTelefono)
    const progetti = (await tel('/api/file/progetti', {})).corpo.progetti as { percorso: string; chiuso?: boolean }[]
    expect(progetti).toHaveLength(2)
    expect(progetti.find((p) => p.percorso === pc.segreto)?.chiuso).toBe(true)
    expect(progetti.find((p) => p.percorso === pc.cwd)?.chiuso).toBeUndefined()
    const el = await tel('/api/file/elenco', { progetto: pc.cwd, percorso: '' })
    expect(el.stato).toBe(200)
    expect((el.corpo.voci as { nome: string }[]).map((v) => v.nome)).toEqual(['docs', 'nota.md'])
    const l = await tel('/api/file/leggi', { progetto: pc.cwd, percorso: 'nota.md', da: 0 })
    expect(Buffer.from(String(l.corpo.dati), 'base64').toString('utf8')).toBe('# Nota d’esempio\n')
    expect(l.corpo).toMatchObject({ tipo: 'testo', byte: Buffer.byteLength('# Nota d’esempio\n') })
    // Il PIN: chiuso per questo telefono.
    const chiuso = await tel('/api/file/elenco', { progetto: pc.segreto, percorso: '' })
    expect(chiuso.stato).toBe(423)
    expect(chiuso.corpo).toMatchObject({ pin: 'chiusa', chat: 'p-2' })
    expect(String(chiuso.corpo.errore)).toMatch(/^Progetto protetto/)
    expect((await tel('/api/file/leggi', { progetto: pc.segreto, percorso: 'piano.md', da: 0 })).stato).toBe(423)
    expect((await tel('/api/pin/sblocca', { chat: 'p-2', pin: '0000' })).stato).toBe(403)
    expect((await tel('/api/pin/sblocca', { chat: 'p-2', pin: '4821' })).stato).toBe(200)
    expect((await tel('/api/file/elenco', { progetto: pc.segreto, percorso: '' })).stato).toBe(200)
  })
  it('traversal e cartelle estranee: 400 e 403, mai il contenuto', async () => {
    const pc = await portatile()
    const tel = (p: string, c: Record<string, unknown>): ReturnType<typeof post> => post(pc.porta, p, c, pc.chiaveTelefono)
    expect((await tel('/api/file/elenco', { progetto: pc.cwd, percorso: '..' })).stato).toBe(400)
    expect((await tel('/api/file/leggi', { progetto: pc.cwd, percorso: '..\\..\\Windows\\win.ini', da: 0 })).stato).toBe(400)
    expect((await tel('/api/file/elenco', { progetto: 'C:\\Windows', percorso: '' })).stato).toBe(403)
    expect((await tel('/api/file/leggi', { progetto: pc.cwd, percorso: 'nota.md:flusso', da: 0 })).stato).toBe(400)
    // Senza chiave, o con una chiave inventata: 401.
    expect((await post(pc.porta, '/api/file/progetti', {}, 'chiave-inventata')).stato).toBe(401)
  })
  it('carica in una cartella del progetto (gli allegati della 0.50): il file arriva lì, nessuna chat è avvisata; il PIN e il traversal valgono', async () => {
    const pc = await portatile()
    const tel = (p: string, c: Record<string, unknown>): ReturnType<typeof post> => post(pc.porta, p, c, pc.chiaveTelefono)
    const file = randomBytes(FILE_PEZZO_BYTE + 5)
    const i = await tel('/api/allegati/inizia', { id: 'carica-0001', nome: 'schema.png', byte: file.length, sha256: sha(file), progetto: pc.cwd, cartella: 'docs' })
    expect(i.stato).toBe(200)
    await tel('/api/allegati/pezzo', { id: 'carica-0001', da: 0, dati: file.subarray(0, FILE_PEZZO_BYTE).toString('base64') })
    await tel('/api/allegati/pezzo', { id: 'carica-0001', da: FILE_PEZZO_BYTE, dati: file.subarray(FILE_PEZZO_BYTE).toString('base64') })
    const f = await tel('/api/allegati/fine', { id: 'carica-0001' })
    expect(f.corpo).toMatchObject({ arrivato: true, percorso: 'docs/schema.png' })
    expect(f.corpo.avvisata).toBeUndefined()
    expect(readFileSync(join(pc.cwd, 'docs', 'schema.png')).equals(file)).toBe(true)
    expect(pc.scritti).toEqual([])
    expect((await tel('/api/allegati/inizia', { id: 'carica-0002', nome: 'x.txt', byte: 1, progetto: pc.cwd, cartella: '../fuori' })).stato).toBe(400)
    expect((await tel('/api/allegati/inizia', { id: 'carica-0003', nome: 'x.txt', byte: 1, progetto: pc.segreto, cartella: '' })).stato).toBe(423)
    expect(existsSync(join(pc.segreto, 'x.txt'))).toBe(false)
  })
})

/** Il telefono che ritira la sua coda: a pezzi, si ferma dopo `fermaDopo` pezzi (la rete cade). */
async function ritira(chiama: (p: string, c: Record<string, unknown>) => ReturnType<typeof post>, salvati: Map<string, Buffer>, fermaDopo = Infinity): Promise<string[]> {
  const fatte: string[] = []
  const elenco = (await chiama('/api/consegne', { nome: 'Telefono di prova' })).corpo.consegne as { id: string; byte: number; sha256: string }[]
  let pezzi = 0
  for (const c of elenco) {
    let parte = salvati.get(c.id) ?? Buffer.alloc(0)
    while (parte.length < c.byte) {
      if (pezzi >= fermaDopo) return fatte
      const p = await chiama('/api/consegne/pezzo', { id: c.id, da: parte.length })
      if (p.stato !== 200) throw new Error(String(p.corpo.errore))
      parte = Buffer.concat([parte, Buffer.from(String(p.corpo.dati), 'base64')])
      salvati.set(c.id, parte)
      pezzi += 1
    }
    const r = await chiama('/api/consegne/ricevuta', { id: c.id, sha256: sha(parte) })
    if (r.stato === 200) fatte.push(c.id)
  }
  return fatte
}

describe('dal PC al telefono: la coda', () => {
  it('in coda, la rete cade a metà, il PC si riavvia: al ritorno il telefono riprende da dov’era e la consegna si chiude con l’impronta', async () => {
    const cartella = tmp('sd-ft-coda-')
    const pc = await portatile(cartella)
    const dati = randomBytes(FILE_PEZZO_BYTE * 3 + 17)
    writeFileSync(join(pc.cwd, 'rapporto.pdf'), dati)
    const e = await pc.coda.metti({ file: join(pc.cwd, 'rapporto.pdf'), a: `tel:${pc.idTelefono}`, da: 'pc', nota: 'quello di ottobre' })
    expect(e.ok).toBe(true)
    // Il file sul PC può cambiare: arriva la copia di quando si è mandato.
    writeFileSync(join(pc.cwd, 'rapporto.pdf'), 'cambiato dopo')
    const tel = (p: string, c: Record<string, unknown>): ReturnType<typeof post> => post(pc.porta, p, c, pc.chiaveTelefono)
    expect((await tel('/api/stato', {})).corpo.consegne).toBe(1)
    const salvati = new Map<string, Buffer>()
    expect(await ritira(tel, salvati, 2)).toEqual([])
    const id = e.ok ? e.c.id : ''
    expect(salvati.get(id)?.length).toBe(FILE_PEZZO_BYTE * 2)
    expect(pc.coda.leggi(id)?.stato).toBe('viaggio')
    // Il PC si riavvia: la coda si rilegge dal disco.
    const dopo = apriAlTelefono({ cartella, dispositivi: () => [{ id: pc.idTelefono, nome: 'Telefono di prova' }], nomePc: () => 'PC-ESEMPIO' })
    expect(dopo.perTelefono(`tel:${pc.idTelefono}`).map((c) => c.id)).toEqual([id])
    // Il telefono torna in rete e finisce.
    expect(await ritira(tel, salvati)).toEqual([id])
    expect(salvati.get(id)?.equals(dati)).toBe(true)
    expect(pc.coda.leggi(id)?.stato).toBe('consegnata')
    expect(readdirSync(cartella).filter((n) => n.endsWith('.bin'))).toEqual([])
    expect((await tel('/api/stato', {})).corpo.consegne).toBe(0)
  })
  it('impronta sbagliata: 422 e si ricomincia; annullata dal PC: 410 al pezzo dopo; un altro telefono non la vede; un altro PC non ha consegne', async () => {
    const pc = await portatile()
    writeFileSync(join(pc.cwd, 'a.txt'), 'contenuto d’esempio')
    const e = await pc.coda.metti({ file: join(pc.cwd, 'a.txt'), a: `tel:${pc.idTelefono}`, da: 'pc' })
    const id = e.ok ? e.c.id : ''
    const tel = (p: string, c: Record<string, unknown>): ReturnType<typeof post> => post(pc.porta, p, c, pc.chiaveTelefono)
    await tel('/api/consegne/pezzo', { id, da: 0 })
    const sbagliata = await tel('/api/consegne/ricevuta', { id, sha256: 'a'.repeat(64) })
    expect(sbagliata.stato).toBe(422)
    expect(pc.coda.leggi(id)).toMatchObject({ stato: 'attesa', ricevuti: 0 })
    pc.coda.annulla(id)
    expect((await tel('/api/consegne/pezzo', { id, da: 0 })).stato).toBe(410)
    expect((await tel('/api/consegne', {})).corpo.consegne).toEqual([])
    // Un secondo telefono accoppiato non vede né scarica quelle del primo.
    writeFileSync(join(pc.cwd, 'b.txt'), 'b')
    const e2 = await pc.coda.metti({ file: join(pc.cwd, 'b.txt'), a: `tel:${pc.idTelefono}`, da: 'pc' })
    const d = apriDispositivi(tmp('sd-ft-x-'))
    void d
    const altroPc = await post(pc.porta, '/api/consegne', {}, K)
    expect(altroPc.stato).toBe(403)
    expect((await post(pc.porta, '/api/consegne/pezzo', { id: e2.ok ? e2.c.id : '', da: 0 }, 'chiave-inventata')).stato).toBe(401)
  })
  it('una cartella intera, un file oltre 100 MB, un telefono non accoppiato: rifiutati con il motivo', async () => {
    const pc = await portatile()
    expect(await pc.coda.metti({ file: pc.cwd, a: `tel:${pc.idTelefono}`, da: 'pc' })).toMatchObject({ ok: false, stato: 400 })
    const grande = join(pc.cwd, 'grande.bin')
    writeFileSync(grande, '')
    truncateSync(grande, 100 * 1024 * 1024 + 1)
    expect(await pc.coda.metti({ file: grande, a: `tel:${pc.idTelefono}`, da: 'pc' })).toMatchObject({ ok: false, stato: 413 })
    expect(await pc.coda.metti({ file: join(pc.cwd, 'nota.md'), a: 'tel:sconosciuto', da: 'pc' })).toMatchObject({ ok: false, stato: 404 })
  })
})

/** Il PC accoppiato al telefono («fisso»), che fa da ponte verso «lap». */
async function fisso(portaLap: number): Promise<{ porta: number; chiaveTelefono: string; idTelefono: string }> {
  const b: BattitoPc = { pcId: 'lap', nome: 'PC-ESEMPIO', versione: '0.54.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta: portaLap }
  const remoto = creaClientPcRemoto({ battiti: () => [b], chiavePer: () => K, mioNome: () => 'FISSO', mioId: () => 'fisso' })
  const dispositivi = apriDispositivi(tmp('sd-ft-fisso-'))
  const rotte = rotteClient({
    dispositivi, chat: () => [], autopiloti: async () => [], domande: async () => [], workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: () => {}, aggiornamento: () => ({ fase: 'fermo' }),
    ponte: async (pc: string, percorso: string, corpo?: Record<string, unknown>, dispositivo?: string) => {
      try { return { stato: 200, corpo: await remoto.chiama(pc, percorso, corpo, `tel:${dispositivo ?? ''}@fisso`) } } catch (err) {
        return { stato: err instanceof ErroreRemoto ? err.stato ?? 502 : 502, corpo: { errore: err instanceof Error ? err.message : String(err) } }
      }
    }
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => 'chiave-di-casa-del-fisso', rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'Telefono di prova')
  return { porta: (s.address() as AddressInfo).port, chiaveTelefono: t?.chiave ?? '', idTelefono: t?.id ?? '' }
}

describe('un altro PC, attraverso il ponte', () => {
  it('si sfoglia e si legge un progetto di là; il PIN di là vale per il telefono', async () => {
    const lap = await portatile()
    const f = await fisso(lap.porta)
    const via = (percorso: string, corpo: Record<string, unknown>): ReturnType<typeof post> => post(f.porta, '/api/ponte', { pc: 'lap', percorso, corpo }, f.chiaveTelefono)
    const el = await via('/api/file/elenco', { progetto: lap.cwd, percorso: '' })
    expect(el.stato).toBe(200)
    expect((el.corpo.voci as { nome: string }[]).map((v) => v.nome)).toContain('nota.md')
    const l = await via('/api/file/leggi', { progetto: lap.cwd, percorso: 'nota.md', da: 0 })
    expect(Buffer.from(String(l.corpo.dati), 'base64').toString('utf8')).toContain('Nota d’esempio')
    expect((await via('/api/file/elenco', { progetto: lap.segreto, percorso: '' })).stato).toBe(423)
    expect((await via('/api/file/elenco', { progetto: lap.cwd, percorso: '..' })).stato).toBe(400)
  })
  it('il telefono del ponte si presenta, il PC di là gli mette un file in coda, e lui lo ritira passando dal ponte', async () => {
    const lap = await portatile()
    const f = await fisso(lap.porta)
    const via = (percorso: string, corpo: Record<string, unknown>): ReturnType<typeof post> => post(f.porta, '/api/ponte', { pc: 'lap', percorso, corpo }, f.chiaveTelefono)
    // Prima di presentarsi, il PC di là non lo conosce.
    expect(lap.coda.telefoni().some((t) => t.via === 'ponte')).toBe(false)
    expect((await via('/api/consegne', { nome: 'Telefono di prova' })).stato).toBe(200)
    const delPonte = lap.coda.telefoni().find((t) => t.via === 'ponte')
    expect(delPonte).toMatchObject({ chiave: `pc:tel:${f.idTelefono}@fisso`, nome: 'Telefono di prova' })
    const dati = randomBytes(FILE_PEZZO_BYTE + 3)
    writeFileSync(join(lap.cwd, 'foto.jpg'), dati)
    const e = await lap.coda.metti({ file: join(lap.cwd, 'foto.jpg'), a: delPonte?.chiave ?? '', da: 'pc' })
    expect(e.ok).toBe(true)
    // Il telefono accoppiato a «lap» non la vede: non è sua.
    expect(((await post(lap.porta, '/api/consegne', {}, lap.chiaveTelefono)).corpo.consegne as unknown[]).length).toBe(0)
    const salvati = new Map<string, Buffer>()
    const fatte = await ritira(via, salvati)
    expect(fatte).toHaveLength(1)
    expect(salvati.get(fatte[0] as string)?.equals(dati)).toBe(true)
    expect(lap.coda.leggi(fatte[0] as string)?.stato).toBe('consegnata')
  })
})

/* ------------------------------------------------------------------ */

describe('lo strumento manda_al_telefono delle chat', () => {
  async function ambiente(): Promise<{ deps: DipendenzeMcp; gettone: string; cwd: string; fuori: string; coda: AlTelefono; mcp: (corpo: unknown, aut?: string) => Promise<{ stato: number; corpo?: unknown }> }> {
    const cwd = tmp('sd-ft-chat-')
    const fuori = tmp('sd-ft-altrove-')
    writeFileSync(join(cwd, 'relazione.md'), '# Relazione d’esempio\n')
    mkdirSync(join(cwd, 'immagini'))
    writeFileSync(join(fuori, 'altro.txt'), 'fuori dalla cartella')
    const coda = apriAlTelefono({ cartella: tmp('sd-ft-coda-'), dispositivi: () => [{ id: 'tel-esempio', nome: 'Telefono di prova', ultimoAccesso: new Date().toISOString() }], nomePc: () => 'PC-ESEMPIO' })
    const gettoni = apriGettoni(join(tmp('sd-ft-g-'), 'gettoni.json'))
    const gettone = gettoni.nuovo({ sessione: 's-chat-esempio', cwd, pty: 'pty-1' })
    const deps: DipendenzeMcp = { gettoni, alTelefono: coda, titoloChat: () => 'Relazioni', versione: '0.54.0', attesaConfermaMs: 0, attesaConsegnaMs: 0 }
    return { deps, gettone, cwd, fuori, coda, mcp: (corpo, aut = `Bearer ${gettone}`) => rispondiMcp(deps, 'POST', aut, corpo) }
  }
  const chiama = (nome: string, arg: Record<string, unknown>): Record<string, unknown> => ({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: nome, arguments: arg } })
  const testo = (r: { corpo?: unknown }): string => ((r.corpo as { result: { content: { text: string }[] } }).result.content[0]?.text ?? '')
  const errore = (r: { corpo?: unknown }): boolean => (r.corpo as { result: { isError: boolean } }).result.isError

  it('senza gettone, o con uno sbagliato: 401 e niente strumenti', async () => {
    const a = await ambiente()
    expect((await a.mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, '')).stato).toBe(401)
    expect((await a.mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer gettone-inventato-di-prova-123456')).stato).toBe(401)
    expect(a.coda.elenco()).toEqual([])
  })
  it('initialize, tools/list e una notifica (202)', async () => {
    const a = await ambiente()
    const i = await a.mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prova', version: '1' } } })
    expect(i.corpo).toMatchObject({ result: { protocolVersion: '2025-06-18', serverInfo: { name: 'sierradeck' }, capabilities: { tools: {} } } })
    expect((await a.mcp({ jsonrpc: '2.0', method: 'notifications/initialized' })).stato).toBe(202)
    const l = await a.mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect((l.corpo as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)).toEqual(['manda_al_telefono', 'stato_invio_al_telefono', 'chiedi_dato_personale'])
  })
  it('un file sotto la cartella della chat parte senza chiedere: «in coda», e lo stato si legge dopo', async () => {
    const a = await ambiente()
    const r = await a.mcp(chiama('manda_al_telefono', { percorso: 'relazione.md', nota: 'la versione finale' }))
    expect(errore(r)).toBe(false)
    expect(testo(r)).toMatch(/^In coda: «relazione\.md»/)
    const c = a.coda.elenco()[0]
    expect(c).toMatchObject({ stato: 'attesa', da: 'chat', daChat: 'Relazioni', nota: 'la versione finale', a: 'tel:tel-esempio' })
    expect(testo(await a.mcp(chiama('stato_invio_al_telefono', { id: c?.id })))).toMatch(/^In coda/)
    a.coda.ricevuta(c?.id ?? '', 'tel:tel-esempio', c?.sha256 ?? '')
    expect(testo(await a.mcp(chiama('stato_invio_al_telefono', { id: c?.id })))).toMatch(/^Consegnato/)
  })
  it('un file fuori dalla cartella: niente copia, una domanda nelle Domande; con il sì va in coda, con il no è rifiutato', async () => {
    const a = await ambiente()
    const r = await a.mcp(chiama('manda_al_telefono', { percorso: join(a.fuori, 'altro.txt') }))
    expect(testo(r)).toMatch(/^In attesa di conferma/)
    const c = a.coda.elenco()[0] as Consegna
    expect(c.stato).toBe('conferma')
    expect(c.sha256).toBeUndefined()
    // La domanda come la vedono PC, pagina e app.
    const voci = raccogliDomande({
      domande: [{ id: idDomandaConferma(c.id), autopilotaId: 'sierradeck:al-telefono', testo: testoConferma(c), opzioni: ['Sì, mandalo', 'No, non mandarlo'], da: 'Manda al telefono · Relazioni', sotto: 'x → Telefono di prova' }],
      autopiloti: [], chat: [], scelteDi: () => undefined
    })
    expect(voci[0]).toMatchObject({ tipo: 'autopilota', autopilota: 'Manda al telefono · Relazioni', sotto: 'x → Telefono di prova' })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(conv[0]).toMatchObject({ titolo: 'Manda al telefono · Relazioni', sotto: 'x → Telefono di prova', risposta: { via: 'rispondi', domanda: idDomandaConferma(c.id) } })
    expect(testoConferma(c)).toContain('FUORI dalla sua cartella')
    expect((await a.coda.conferma(c.id, true))).toMatchObject({ ok: true, c: { stato: 'attesa' } })
    expect(a.coda.leggi(c.id)?.sha256).toBe(sha(Buffer.from('fuori dalla cartella')))
    // Il secondo: no.
    await a.mcp(chiama('manda_al_telefono', { percorso: join(a.fuori, 'altro.txt') }))
    const d = a.coda.elenco().find((x) => x.stato === 'conferma') as Consegna
    await a.coda.conferma(d.id, false)
    expect(esitoPerLaChat(a.coda.leggi(d.id) as Consegna)).toMatch(/^Rifiutato: Nicholas ha risposto no/)
  })
  it('una risalita che esce dalla cartella vale come «fuori»: chiede conferma, non parte da sola', async () => {
    const a = await ambiente()
    const rel = join('..', a.fuori.split(/[\\/]/).pop() as string, 'altro.txt')
    const r = await a.mcp(chiama('manda_al_telefono', { percorso: rel }))
    expect(testo(r)).toMatch(/^In attesa di conferma/)
    expect(a.coda.elenco()[0]?.stato).toBe('conferma')
  })
  it('rifiuti: cartella intera, file che non c’è, oltre 100 MB, nessun telefono — con il motivo, niente in coda', async () => {
    const a = await ambiente()
    const cartella = await a.mcp(chiama('manda_al_telefono', { percorso: 'immagini' }))
    expect(errore(cartella)).toBe(true)
    expect(testo(cartella)).toMatch(/^Rifiutato: è una cartella/)
    expect(testo(await a.mcp(chiama('manda_al_telefono', { percorso: 'non-ce.pdf' })))).toMatch(/^Rifiutato: il file «non-ce\.pdf» non c’è/)
    const grande = join(a.cwd, 'grande.bin')
    writeFileSync(grande, '')
    truncateSync(grande, 100 * 1024 * 1024 + 1)
    expect(testo(await a.mcp(chiama('manda_al_telefono', { percorso: 'grande.bin' })))).toMatch(/^Rifiutato: .*100 MB/)
    expect(testo(await a.mcp(chiama('manda_al_telefono', {})))).toMatch(/^Rifiutato: manca il file/)
    const senza = { ...a.deps, alTelefono: apriAlTelefono({ cartella: tmp('sd-ft-c2-'), dispositivi: () => [], nomePc: () => 'PC-ESEMPIO' }) }
    const r = await rispondiMcp(senza, 'POST', `Bearer ${a.gettone}`, chiama('manda_al_telefono', { percorso: 'relazione.md' }))
    expect(testo(r)).toMatch(/^Rifiutato: a questo PC non è accoppiato nessun telefono/)
    expect(a.coda.elenco()).toEqual([])
  })
  it('una chat non vede gli invii di un’altra chat', async () => {
    const a = await ambiente()
    await a.mcp(chiama('manda_al_telefono', { percorso: 'relazione.md' }))
    const id = a.coda.elenco()[0]?.id
    const altro = a.deps.gettoni.nuovo({ sessione: 's-altra-chat', cwd: a.cwd, pty: 'pty-2' })
    const r = await rispondiMcp(a.deps, 'POST', `Bearer ${altro}`, chiama('stato_invio_al_telefono', { id }))
    expect(testo(r)).toBe('Nessun invio con questo id.')
  })
  it('un gettone nuovo per la stessa sessione toglie valore al vecchio', async () => {
    const a = await ambiente()
    a.deps.gettoni.nuovo({ sessione: 's-chat-esempio', cwd: a.cwd, pty: 'pty-9' })
    expect((await a.mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).stato).toBe(401)
  })
  it('passa dal server del Client solo da 127.0.0.1 con il gettone, e la chat lo riceve con --mcp-config (mai nella config globale)', async () => {
    const a = await ambiente()
    const dispositivi = apriDispositivi(tmp('sd-ft-dm-'))
    const s = creaServerClient({ dispositivi, rotta: async () => ({ stato: 404, corpo: {} }), mcp: (m, aut, corpo) => rispondiMcp(a.deps, m, aut, corpo) })
    server.push(s)
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
    const porta = (s.address() as AddressInfo).port
    const cfg = JSON.parse(configMcp(porta, a.gettone)) as { mcpServers: { sierradeck: { type: string; url: string; headers: { Authorization: string } } } }
    expect(cfg.mcpServers.sierradeck).toEqual({ type: 'http', url: `http://127.0.0.1:${porta}/api/mcp`, headers: { Authorization: `Bearer ${a.gettone}` } })
    const r = await fetch(cfg.mcpServers.sierradeck.url, { method: 'POST', headers: { ...cfg.mcpServers.sierradeck.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(chiama('manda_al_telefono', { percorso: 'relazione.md' })) })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]?.text).toMatch(/^In coda/)
    expect((await fetch(cfg.mcpServers.sierradeck.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
    expect((await fetch(cfg.mcpServers.sierradeck.url, { method: 'GET', headers: cfg.mcpServers.sierradeck.headers })).status).toBe(405)
    const args = buildClaudeArgs('00000000-0000-4000-8000-000000000000', 'Relazioni', false, undefined, undefined, configMcp(porta, a.gettone))
    const i = args.indexOf('--mcp-config')
    expect(i).toBeGreaterThan(0)
    // Dopo il valore viene un'opzione: `--mcp-config` prende più valori e non deve mangiarsi altro.
    expect(args[i + 2]?.startsWith('--')).toBe(true)
  })
})
