import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server, utils } from 'ssh2'
import type { AddressInfo } from 'node:net'
import {
  apriSessione,
  ImprontaSconosciuta,
  improntaDi,
  permessiDi,
  suRemoto,
  unisciRemoto
} from '../../src/main/trasferimenti/sftp'
import type { Destinazione } from '../../src/main/trasferimenti/destinazioni'

/**
 * Un server SSH vero, in memoria, per la durata dei test.
 *
 * Si poteva far finta con dei mock, e non avrebbe provato niente: il pezzo che
 * si sbaglia in un client SFTP non è la logica, è **il protocollo** — i tempi in
 * secondi invece che in millisecondi, i bit di `mode`, l'ordine in cui arrivano
 * gli eventi. Contro un finto benevolo tornano tutti verdi.
 *
 * Il server implementa il minimo che serve ai test: autenticazione a password,
 * `REALPATH`, `OPENDIR`/`READDIR`, `STAT`, e lettura/scrittura di un file.
 */

let server: Server
let porta = 0
let cartella: string
let improntaVera = ''
const FINTI: Record<string, string> = {}

const CHIAVE_HOST = utils.generateKeyPairSync('ed25519')

beforeAll(async () => {
  cartella = mkdtempSync(join(tmpdir(), 'sftp-'))
  FINTI['/casa/uno.txt'] = 'contenuto del primo'
  FINTI['/casa/due.txt'] = 'il secondo, piu lungo'

  server = new Server({ hostKeys: [CHIAVE_HOST.private] }, (cliente) => {
    cliente.on('authentication', (tentativo) => {
      if (tentativo.method === 'password' && tentativo.password === 'segreta') tentativo.accept()
      else if (tentativo.method === 'none') tentativo.reject(['password'])
      else tentativo.reject()
    })
    cliente.on('ready', () => {
      cliente.on('session', (accetta) => {
        const sessione = accetta()
        sessione.on('sftp', (accettaSftp) => {
          const sftp = accettaSftp()
          const STATUS = 0
          const aperti = new Map<string, { percorso: string; letto: boolean }>()
          let contatore = 0

          const maniglia = (percorso: string): Buffer => {
            contatore += 1
            const id = String(contatore)
            aperti.set(id, { percorso, letto: false })
            return Buffer.from(id)
          }
          const quale = (h: Buffer): { percorso: string; letto: boolean } | undefined =>
            aperti.get(h.toString())

          sftp.on('REALPATH', (reqid) => {
            sftp.name(reqid, [{ filename: '/casa', longname: '/casa', attrs: {} as never }])
          })

          sftp.on('OPENDIR', (reqid, percorso) => {
            sftp.handle(reqid, maniglia(percorso))
          })

          sftp.on('READDIR', (reqid, h) => {
            const stato = quale(h)
            if (stato === undefined || stato.letto) { sftp.status(reqid, 1); return }
            stato.letto = true
            sftp.name(reqid, [
              {
                filename: 'uno.txt',
                longname: '-rw-r--r-- 1 u u 19 uno.txt',
                attrs: { mode: 0o100644, size: 19, mtime: 1_700_000_000, atime: 0, uid: 0, gid: 0 } as never
              },
              {
                filename: 'sotto',
                longname: 'drwxr-xr-x 1 u u 0 sotto',
                attrs: { mode: 0o040755, size: 0, mtime: 1_700_000_000, atime: 0, uid: 0, gid: 0 } as never
              }
            ])
          })

          sftp.on('CLOSE', (reqid, h) => {
            const stato = quale(h)
            if (stato !== undefined && FINTI[stato.percorso] === undefined && stato.letto) {
              // Una scrittura chiusa: il contenuto e' gia' stato accumulato.
            }
            aperti.delete(h.toString())
            sftp.status(reqid, STATUS)
          })

          sftp.on('STAT', (reqid, percorso) => {
            const dato = FINTI[percorso]
            if (dato === undefined) { sftp.status(reqid, 2); return }
            sftp.attrs(reqid, {
              mode: 0o100644, size: Buffer.byteLength(dato), mtime: 1_700_000_000, atime: 0, uid: 0, gid: 0
            } as never)
          })

          sftp.on('OPEN', (reqid, percorso) => {
            sftp.handle(reqid, maniglia(percorso))
          })

          sftp.on('READ', (reqid, h, offset, lunghezza) => {
            const stato = quale(h)
            const dato = stato === undefined ? undefined : FINTI[stato.percorso]
            if (dato === undefined) { sftp.status(reqid, 2); return }
            const buffer = Buffer.from(dato, 'utf8')
            if (offset >= buffer.length) { sftp.status(reqid, 1); return }
            sftp.data(reqid, buffer.subarray(offset, Math.min(buffer.length, offset + lunghezza)))
          })

          sftp.on('WRITE', (reqid, h, offset, dati) => {
            const stato = quale(h)
            if (stato === undefined) { sftp.status(reqid, 4); return }
            const prima = FINTI[stato.percorso] ?? ''
            FINTI[stato.percorso] = prima + dati.toString('utf8')
            sftp.status(reqid, STATUS)
          })
        })
      })
    })
  })

  await new Promise<void>((risolvi) => {
    server.listen(0, '127.0.0.1', () => {
      porta = (server.address() as AddressInfo).port
      risolvi()
    })
  })

  const pubblica = utils.parseKey(CHIAVE_HOST.public)
  improntaVera = improntaDi((Array.isArray(pubblica) ? pubblica[0] : pubblica).getPublicSSH() as Buffer)
})

afterAll(() => {
  server.close()
})

const dove = (over: Partial<Destinazione> = {}): Destinazione => ({
  id: 'x',
  nome: 'prova',
  cwd: 'C:/p',
  host: '127.0.0.1',
  porta,
  utente: 'chiunque',
  metodo: 'password',
  ...over
})

describe('i percorsi remoti', () => {
  it('usano sempre le barre in avanti, anche partendo da niente', () => {
    expect(unisciRemoto('', 'casa')).toBe('/casa')
    expect(unisciRemoto('/casa', 'uno.txt')).toBe('/casa/uno.txt')
    // La barra doppia e' il modo piu' rapido di far fallire una `stat` remota.
    expect(unisciRemoto('/casa/', 'uno.txt')).toBe('/casa/uno.txt')
  })

  it('salire dalla radice resta la radice', () => {
    expect(suRemoto('/casa/sotto')).toBe('/casa')
    expect(suRemoto('/casa')).toBe('/')
    expect(suRemoto('/')).toBe('/')
  })

  it('i permessi si leggono come li scrive ls', () => {
    expect(permessiDi(0o100644)).toBe('644')
    expect(permessiDi(0o040755)).toBe('755')
  })
})

describe('la prima connessione a un server', () => {
  it('non riesce, e dice l impronta', async () => {
    // Di proposito: la cifratura da sola dice «nessuno legge», non «stai
    // parlando con chi credi». Senza questo controllo, chi si mette in mezzo
    // riceverebbe la password.
    await expect(apriSessione(dove(), { password: 'segreta' })).rejects.toThrow(ImprontaSconosciuta)
    const errore = await apriSessione(dove(), { password: 'segreta' }).catch((e: unknown) => e)
    expect((errore as ImprontaSconosciuta).impronta).toBe(improntaVera)
    expect((errore as ImprontaSconosciuta).cambiata).toBe(false)
  })

  it('con l impronta giusta entra', async () => {
    const s = await apriSessione(dove({ improntaServer: improntaVera }), { password: 'segreta' })
    expect(await s.casa()).toBe('/casa')
    s.chiudi()
  })

  it('un impronta diversa e un allarme, non un dettaglio', async () => {
    const errore = await apriSessione(
      dove({ improntaServer: 'SHA256:qualcosaltro' }),
      { password: 'segreta' }
    ).catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ImprontaSconosciuta)
    expect((errore as ImprontaSconosciuta).cambiata).toBe(true)
  })

  it('una password sbagliata non entra', async () => {
    await expect(
      apriSessione(dove({ improntaServer: improntaVera }), { password: 'sbagliata' })
    ).rejects.toThrow()
  })
})

describe('sfogliare e copiare', () => {
  it('elenca mettendo le cartelle per prime', async () => {
    const s = await apriSessione(dove({ improntaServer: improntaVera }), { password: 'segreta' })
    const elenco = await s.elenca('/casa')
    expect(elenco.voci.map((v) => v.nome)).toEqual(['sotto', 'uno.txt'])
    expect(elenco.voci[0]?.cartella).toBe(true)
    expect(elenco.voci[1]?.cartella).toBe(false)
    expect(elenco.voci[1]?.percorso).toBe('/casa/uno.txt')
    s.chiudi()
  })

  it('le date sono in millisecondi, non nel 1970', async () => {
    // I tempi SFTP arrivano in secondi: senza moltiplicare, ogni file del 2026
    // si mostrerebbe come del gennaio 1970.
    const s = await apriSessione(dove({ improntaServer: improntaVera }), { password: 'segreta' })
    const elenco = await s.elenca('/casa')
    expect(elenco.voci[1]?.quando).toBe(1_700_000_000 * 1000)
    expect(new Date(elenco.voci[1]?.quando ?? 0).getFullYear()).toBeGreaterThan(2020)
    s.chiudi()
  })

  it('scarica un file e lo mette dove gli dici', async () => {
    const s = await apriSessione(dove({ improntaServer: improntaVera }), { password: 'segreta' })
    const destinazione = join(cartella, 'giu', 'uno.txt')
    const visti: number[] = []
    // La cartella di arrivo non esiste: deve crearla, o la copia fallisce sul
    // piu' banale dei casi — la prima volta che si scarica da qualche parte.
    await s.scarica('/casa/uno.txt', destinazione, (p) => visti.push(p.fatti))
    expect(readFileSync(destinazione, 'utf8')).toBe('contenuto del primo')
    expect(visti.length).toBeGreaterThan(0)
    s.chiudi()
  })

  it('carica un file sul server', async () => {
    const s = await apriSessione(dove({ improntaServer: improntaVera }), { password: 'segreta' })
    const locale = join(cartella, 'su.txt')
    writeFileSync(locale, 'roba che sale', 'utf8')
    await s.carica(locale, '/casa/salito.txt')
    expect(FINTI['/casa/salito.txt']).toBe('roba che sale')
    s.chiudi()
  })
})
