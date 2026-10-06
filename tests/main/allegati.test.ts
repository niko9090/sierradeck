import { describe, it, expect, afterEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
import { giornoCartella, PEZZO_BYTE } from '@shared/allegati'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.50.0: i file dal telefono a una chat o a un autopilota, nel progetto.
 * Il disco (pezzi, ripresa, nome unico, .gitignore, impronta), le rotte
 * (PIN, limiti, rifiuti), il muro del server (dispositivo estraneo) e il
 * ponte verso un altro PC con le firme di casa.
 */
const oggi = giornoCartella(new Date())
const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
const b64 = (b: Buffer): string => b.toString('base64')
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

describe('il disco: pezzi, ripresa, posto nel progetto', () => {
  it('un file a pezzi, con un pezzo ripetuto e uno fuori posto, arriva intero nel progetto e fuori da git', async () => {
    const lavoro = tmp('sd-al-lav-')
    const progetto = tmp('sd-al-prog-')
    const al = apriAllegati({ cartella: lavoro, segnaInternet: false })
    const file = randomBytes(PEZZO_BYTE * 2 + 1234)
    const i = { id: 'invio-0001', chi: 'tel:t1', nome: 'foto.jpg', byte: file.length, sha256: sha(file), tipo: 'chat' as const, a: 'p-1', titolo: 'Clienti', cwd: progetto }
    expect(al.inizia(i)).toEqual({ ok: true, ricevuti: 0 })
    expect(al.pezzo('invio-0001', 'tel:t1', 0, file.subarray(0, PEZZO_BYTE))).toEqual({ ok: true, ricevuti: PEZZO_BYTE })
    // La risposta si era persa: il telefono rimanda lo stesso pezzo.
    expect(al.pezzo('invio-0001', 'tel:t1', 0, file.subarray(0, PEZZO_BYTE))).toEqual({ ok: true, ricevuti: PEZZO_BYTE })
    // Fuori posto: 409, con dove riprendere.
    expect(al.pezzo('invio-0001', 'tel:t1', PEZZO_BYTE * 2, file.subarray(PEZZO_BYTE * 2))).toMatchObject({ ok: false, stato: 409, ricevuti: PEZZO_BYTE })
    // Finché non è intero, nel progetto non c'è niente.
    expect(existsSync(join(progetto, '.sierradeck'))).toBe(false)
    expect((await al.finisci('invio-0001', 'tel:t1'))).toMatchObject({ ok: false, stato: 409 })
    // La rete cade, il telefono ricomincia lo stesso invio: riparte da dove era.
    expect(al.inizia(i)).toEqual({ ok: true, ricevuti: PEZZO_BYTE })
    expect(al.stato('invio-0001', 'tel:t1')).toEqual({ ok: true, ricevuti: PEZZO_BYTE, byte: file.length })
    al.pezzo('invio-0001', 'tel:t1', PEZZO_BYTE, file.subarray(PEZZO_BYTE, PEZZO_BYTE * 2))
    al.pezzo('invio-0001', 'tel:t1', PEZZO_BYTE * 2, file.subarray(PEZZO_BYTE * 2))
    const e = await al.finisci('invio-0001', 'tel:t1')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.arrivato.relativo).toBe(`.sierradeck/allegati/${oggi}/foto.jpg`)
    expect(readFileSync(join(progetto, '.sierradeck', 'allegati', oggi, 'foto.jpg')).equals(file)).toBe(true)
    expect(readFileSync(join(progetto, '.sierradeck', 'allegati', '.gitignore'), 'utf8')).toMatch(/^\*$/m)
    // Della cartella di lavoro non resta niente.
    expect(readdirSync(lavoro)).toEqual([])
  })
  it('un secondo file con lo stesso nome non schiaccia il primo; il .gitignore del progetto non si riscrive', async () => {
    const progetto = tmp('sd-al-prog-')
    mkdirSync(join(progetto, '.sierradeck', 'allegati'), { recursive: true })
    writeFileSync(join(progetto, '.sierradeck', 'allegati', '.gitignore'), '# il progetto li vuole in git\n')
    const al = apriAllegati({ cartella: tmp('sd-al-lav-'), segnaInternet: false })
    for (const id of ['invio-000a', 'invio-000b']) {
      al.inizia({ id, chi: 'tel:t1', nome: 'nota.txt', byte: 2, tipo: 'chat', a: 'p-1', titolo: 'x', cwd: progetto })
      al.pezzo(id, 'tel:t1', 0, Buffer.from(id.slice(-2)))
    }
    const a = await al.finisci('invio-000a', 'tel:t1')
    const b = await al.finisci('invio-000b', 'tel:t1')
    expect(a.ok && a.arrivato.nome).toBe('nota.txt')
    expect(b.ok && b.arrivato.nome).toBe('nota (2).txt')
    expect(readFileSync(join(progetto, '.sierradeck', 'allegati', '.gitignore'), 'utf8')).toBe('# il progetto li vuole in git\n')
  })
  it('un altro dispositivo non continua l’invio di un altro; l’impronta sbagliata butta il file', async () => {
    const progetto = tmp('sd-al-prog-')
    const al = apriAllegati({ cartella: tmp('sd-al-lav-'), segnaInternet: false })
    al.inizia({ id: 'invio-0002', chi: 'tel:t1', nome: 'a.txt', byte: 3, sha256: sha(Buffer.from('abc')), tipo: 'chat', a: 'p-1', titolo: 'x', cwd: progetto })
    expect(al.pezzo('invio-0002', 'tel:intruso', 0, Buffer.from('abc'))).toMatchObject({ ok: false, stato: 403 })
    expect(al.pezzo('invio-0002', 'tel:t1', 0, Buffer.from('abd'))).toMatchObject({ ok: true })
    expect(await al.finisci('invio-0002', 'tel:t1')).toMatchObject({ ok: false, stato: 422 })
    expect(existsSync(join(progetto, '.sierradeck'))).toBe(false)
    expect(al.stato('invio-0002', 'tel:t1')).toMatchObject({ ok: false, stato: 404 })
  })
})

/* ------------------------------------------------------------------ */

const CWD = (): string => tmp('sd-al-cwd-')

type PcFinto = { porta: number; scritti: string[]; dialogo: string[]; chiaveTelefono: string; cwd: string; cwdAp: string }

const K = 'chiave-di-casa-del-portatile'
const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

/** Il PC di casa della chat («lap»): una chat libera, una protetta dal PIN, un autopilota. */
async function portatile(): Promise<PcFinto> {
  const cwd = CWD()
  const cwdAp = CWD()
  const chat: Chat[] = [
    { id: 'p-1', titolo: 'Clienti', cwd, sessione: 's-clienti' },
    { id: 'p-2', titolo: 'Segreta', cwd, sessione: 's-segreta' }
  ]
  const g = creaGuardianoPin({ leggi: () => undefined, scrivi: () => {}, passphraseGiusta: async () => false })
  await g.impostaPin('4821')
  g.proteggiChat('s-segreta', true)
  const scritti: string[] = []
  const dialogo: string[] = []
  const dispositivi = apriDispositivi(tmp('sd-al-disp-'))
  const rotte = rotteClient({
    dispositivi,
    chat: () => chat,
    autopiloti: async () => [{ id: 'a-1', nome: 'Rilascio', obiettivo: 'rilascia', cwd: cwdAp }],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: (id: string, t: string) => { scritti.push(`${id}:${t}`) },
    dialogaAutopilota: async (id: string, t: string) => { dialogo.push(`${id}:${t}`); return { ricevuto: true } },
    aggiornamento: () => ({ fase: 'fermo' }),
    pin: g,
    allegati: apriAllegati({ cartella: tmp('sd-al-lav-'), segnaInternet: false })
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => K, rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')
  return { porta: (s.address() as AddressInfo).port, scritti, dialogo, chiaveTelefono: t?.chiave ?? '', cwd, cwdAp }
}

async function post(porta: number, percorso: string, corpo: unknown, chiave: string): Promise<{ stato: number; corpo: Record<string, unknown> }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: 'POST', headers: { 'x-sierradeck-chiave': chiave, 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  return { stato: r.status, corpo: await r.json() as Record<string, unknown> }
}

/** Il telefono: inizia, pezzi, fine. `chiama` è la strada (diretta o il ponte). */
async function manda(chiama: (p: string, c: Record<string, unknown>) => Promise<{ stato: number; corpo: Record<string, unknown> }>, file: Buffer, dest: Record<string, string>, nome = 'fattura.pdf', nota?: string): Promise<{ stato: number; corpo: Record<string, unknown> }> {
  const id = `inv-${randomBytes(6).toString('hex')}`
  const i = await chiama('/api/allegati/inizia', { id, nome, byte: file.length, sha256: sha(file), ...dest, ...(nota !== undefined ? { nota } : {}) })
  if (i.stato !== 200) return i
  let da = i.corpo.ricevuti as number
  while (da < file.length) {
    const p = await chiama('/api/allegati/pezzo', { id, da, dati: b64(file.subarray(da, da + PEZZO_BYTE)) })
    if (p.stato !== 200) return p
    da = p.corpo.ricevuti as number
  }
  return chiama('/api/allegati/fine', { id })
}

describe('le rotte, dal telefono accoppiato', () => {
  it('a una chat: il file nel suo progetto e la riga corta nella chat', async () => {
    const pc = await portatile()
    const file = randomBytes(PEZZO_BYTE + 10)
    const e = await manda((p, c) => post(pc.porta, p, c, pc.chiaveTelefono), file, { chat: 'p-1' }, 'fattura.pdf', 'quella di Rossi\nurgente')
    expect(e.stato).toBe(200)
    expect(e.corpo).toMatchObject({ arrivato: true, avvisata: 'chat', percorso: `.sierradeck/allegati/${oggi}/fattura.pdf` })
    expect(readFileSync(join(pc.cwd, '.sierradeck', 'allegati', oggi, 'fattura.pdf')).equals(file)).toBe(true)
    expect(pc.scritti).toEqual([`p-1:Nicholas ti ha mandato il file fattura.pdf (.sierradeck/allegati/${oggi}/fattura.pdf). Nota: quella di Rossi urgente. Guardalo.`])
  })
  it('a un autopilota: il file nella sua cartella e il messaggio nel suo dialogo', async () => {
    const pc = await portatile()
    const e = await manda((p, c) => post(pc.porta, p, c, pc.chiaveTelefono), Buffer.from('schema'), { autopilota: 'a-1' }, 'schema.png', 'il flusso nuovo')
    expect(e.corpo).toMatchObject({ arrivato: true, avvisata: 'autopilota' })
    expect(existsSync(join(pc.cwdAp, '.sierradeck', 'allegati', oggi, 'schema.png'))).toBe(true)
    expect(pc.dialogo[0]).toContain('schema.png')
    expect(pc.dialogo[0]).toContain(join(pc.cwdAp, '.sierradeck', 'allegati', oggi, 'schema.png'))
    expect(pc.dialogo[0]).toContain('Nota: il flusso nuovo.')
    expect(pc.scritti).toEqual([])
  })
  it('rifiuti: traversal nel nome, file troppo grande, programma, chat che non c’è — niente scritto da nessuna parte', async () => {
    const pc = await portatile()
    const chiedi = (c: Record<string, unknown>): Promise<{ stato: number; corpo: Record<string, unknown> }> => post(pc.porta, '/api/allegati/inizia', { id: 'invio-rif1', ...c }, pc.chiaveTelefono)
    expect((await chiedi({ nome: '..\\..\\Windows\\win.ini', byte: 5, chat: 'p-1' })).stato).toBe(400)
    expect((await chiedi({ nome: '../../.ssh/authorized_keys', byte: 5, chat: 'p-1' })).stato).toBe(400)
    const grande = await chiedi({ nome: 'video.mp4', byte: 100 * 1024 * 1024 + 1, chat: 'p-1' })
    expect(grande.stato).toBe(413)
    expect(String(grande.corpo.errore)).toContain('100 MB')
    expect((await chiedi({ nome: 'setup.exe', byte: 5, chat: 'p-1' })).stato).toBe(415)
    expect((await chiedi({ nome: 'a.txt', byte: 5, chat: 'p-9' })).stato).toBe(404)
    expect(existsSync(join(pc.cwd, '.sierradeck'))).toBe(false)
    expect(pc.scritti).toEqual([])
  })
  it('una chat protetta e chiusa per questo telefono: 423 «Chat protetta: inserisci il PIN», niente file né riga; con il PIN arriva', async () => {
    const pc = await portatile()
    const telefono = (p: string, c: Record<string, unknown>): Promise<{ stato: number; corpo: Record<string, unknown> }> => post(pc.porta, p, c, pc.chiaveTelefono)
    const e = await manda(telefono, Buffer.from('ciao'), { chat: 'p-2' })
    expect(e.stato).toBe(423)
    expect(String(e.corpo.errore)).toMatch(/^Chat protetta: inserisci il PIN/)
    expect(existsSync(join(pc.cwd, '.sierradeck'))).toBe(false)
    expect(pc.scritti).toEqual([])
    expect((await telefono('/api/pin/sblocca', { chat: 'p-2', pin: '4821' })).stato).toBe(200)
    expect((await manda(telefono, Buffer.from('ciao'), { chat: 'p-2' })).corpo).toMatchObject({ arrivato: true, avvisata: 'chat' })
  })
  it('più di venti file in un minuto dallo stesso telefono: il ventunesimo aspetta (429)', async () => {
    const pc = await portatile()
    for (let i = 0; i < 20; i++) {
      expect((await post(pc.porta, '/api/allegati/inizia', { id: `invio-lim${String(i).padStart(2, '0')}`, nome: 'a.txt', byte: 1, chat: 'p-1' }, pc.chiaveTelefono)).stato).toBe(200)
    }
    expect((await post(pc.porta, '/api/allegati/inizia', { id: 'invio-lim99', nome: 'a.txt', byte: 1, chat: 'p-1' }, pc.chiaveTelefono)).stato).toBe(429)
    // Riprendere uno già cominciato non conta.
    expect((await post(pc.porta, '/api/allegati/inizia', { id: 'invio-lim00', nome: 'a.txt', byte: 1, chat: 'p-1' }, pc.chiaveTelefono)).stato).toBe(200)
  })
  it('un dispositivo estraneo (chiave sbagliata, o la chiave di casa di un’altra cassaforte): 401 su ogni rotta dei file', async () => {
    const pc = await portatile()
    for (const percorso of ['/api/allegati/inizia', '/api/allegati/pezzo', '/api/allegati/stato', '/api/allegati/fine']) {
      expect((await post(pc.porta, percorso, { id: 'invio-estr', nome: 'a.txt', byte: 1, chat: 'p-1', da: 0, dati: 'YQ==' }, 'chiave-inventata')).stato).toBe(401)
      expect((await post(pc.porta, percorso, { id: 'invio-estr', nome: 'a.txt', byte: 1, chat: 'p-1', da: 0, dati: 'YQ==' }, 'chiave-di-casa-di-un-altra-cassaforte')).stato).toBe(401)
    }
    const r = await fetch(`http://127.0.0.1:${pc.porta}/api/allegati/inizia`, { method: 'POST', body: JSON.stringify({ id: 'invio-estr', nome: 'a.txt', byte: 1, chat: 'p-1' }) })
    expect(r.status).toBe(401)
    expect(existsSync(join(pc.cwd, '.sierradeck'))).toBe(false)
  })
})

/* ------------------------------------------------------------------ */

/** Il PC accoppiato al telefono («fisso»), che fa da ponte verso «lap» con la firma di casa. */
async function fisso(portaLap: number): Promise<{ porta: number; chiaveTelefono: string }> {
  const b: BattitoPc = { pcId: 'lap', nome: 'LAPTOP', versione: '0.50.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta: portaLap }
  const remoto = creaClientPcRemoto({ battiti: () => [b], chiavePer: () => K, mioNome: () => 'FISSO', mioId: () => 'fisso' })
  const dispositivi = apriDispositivi(tmp('sd-al-fisso-'))
  const rotte = rotteClient({
    dispositivi,
    chat: () => [],
    autopiloti: async () => [],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: () => {},
    aggiornamento: () => ({ fase: 'fermo' }),
    ponte: async (pc: string, percorso: string, corpo?: Record<string, unknown>, dispositivo?: string) => {
      try {
        return { stato: 200, corpo: await remoto.chiama(pc, percorso, corpo, `tel:${dispositivo ?? ''}@fisso`) }
      } catch (err) {
        return { stato: err instanceof ErroreRemoto ? err.stato ?? 502 : 502, corpo: { errore: err instanceof Error ? err.message : String(err) } }
      }
    }
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => 'chiave-di-casa-del-fisso', rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')
  return { porta: (s.address() as AddressInfo).port, chiaveTelefono: t?.chiave ?? '' }
}

describe('verso una chat di un altro PC, attraverso il ponte', () => {
  it('il file viaggia a pezzi fino al PC della chat, con le firme di casa, e si salva là', async () => {
    const lap = await portatile()
    const f = await fisso(lap.porta)
    const viaPonte = (percorso: string, corpo: Record<string, unknown>): Promise<{ stato: number; corpo: Record<string, unknown> }> =>
      post(f.porta, '/api/ponte', { pc: 'lap', percorso, corpo }, f.chiaveTelefono)
    const file = randomBytes(PEZZO_BYTE * 2 + 7)
    const e = await manda(viaPonte, file, { chat: 'p-1' }, 'disegno.png')
    expect(e.stato).toBe(200)
    expect(e.corpo).toMatchObject({ arrivato: true, avvisata: 'chat' })
    expect(readFileSync(join(lap.cwd, '.sierradeck', 'allegati', oggi, 'disegno.png')).equals(file)).toBe(true)
    expect(lap.scritti[0]).toContain('disegno.png')
  })
  it('il PIN là vale per il telefono: chiusa per lui = 423 attraverso il ponte, niente file', async () => {
    const lap = await portatile()
    const f = await fisso(lap.porta)
    const viaPonte = (percorso: string, corpo: Record<string, unknown>): Promise<{ stato: number; corpo: Record<string, unknown> }> =>
      post(f.porta, '/api/ponte', { pc: 'lap', percorso, corpo }, f.chiaveTelefono)
    const e = await manda(viaPonte, Buffer.from('x'), { chat: 'p-2' })
    expect(e.stato).toBe(423)
    expect(existsSync(join(lap.cwd, '.sierradeck'))).toBe(false)
    expect(lap.scritti).toEqual([])
  })
})
