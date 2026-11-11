import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { chiDellaChiave, provaCiaoValida } from '@shared/prova-telefono'
import { creaServerClient } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'
import { rotteClient, rotteLibere, type DipendenzeRotte } from '../../src/main/client-rotte'
import { conProva } from '../../src/main/client-prova'
import { indirizziPerApp, pcPerApp } from '../../src/main/rete-telefono'

/**
 * `/api/ciao` con la prova: il telefono manda la chiave solo a chi dimostra di
 * essere il PC con cui si è accoppiato. Indirizzi inventati (il codice vuole reti private: 10.1.2.3), nomi
 * inventati.
 */

const SFIDA = 'ab'.repeat(32)
let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

function ambiente(): { server: Server; dispositivi: ReturnType<typeof apriDispositivi>; registro: string[] } {
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-prova-')))
  const registro: string[] = []
  const rete = (): ReturnType<typeof indirizziPerApp> => indirizziPerApp(['10.1.2.3', '100.64.0.5'], 47640, 'pc-di-esempio')
  const deps = { dispositivi, versione: '9.9.9', reteApp: rete } as unknown as DipendenzeRotte
  return {
    server: creaServerClient({ dispositivi, rotta: () => ({ stato: 200, corpo: {} }), rottaLibera: rotteLibere(deps), log: (m) => registro.push(m) }),
    dispositivi,
    registro
  }
}

const ascolta = (s: Server): Promise<void> => new Promise((r) => s.listen(0, '127.0.0.1', () => r()))
async function chiedi(s: Server, percorso: string, opz: { metodo?: string; corpo?: unknown } = {}): Promise<{ stato: number; dati: Record<string, unknown> }> {
  const porta = (s.address() as AddressInfo).port
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: opz.metodo ?? 'GET', ...(opz.corpo !== undefined ? { body: JSON.stringify(opz.corpo) } : {}) })
  return { stato: r.status, dati: (await r.json()) as Record<string, unknown> }
}

describe('/api/ciao con la prova', () => {
  it('senza sfida risponde come prima, e dice che le prove le sa dare', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const { stato, dati } = await chiedi(server, '/api/ciao')
    expect(stato).toBe(200)
    expect(dati.programma).toBe('SierraDeck')
    expect(dati.versione).toBe('9.9.9')
    expect(dati.impronta).toMatch(/^[0-9a-f]{16}$/)
    expect(dati.saProvare).toBe(true)
    expect(dati.prova).toBeUndefined()
  })

  it('al telefono accoppiato dà la prova, che il telefono controlla con la sua chiave', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const tel = a.dispositivi.accoppia(a.dispositivi.apriAccoppiamento().codice, 'telefono di esempio')
    const chiave = tel?.chiave ?? ''
    const { dati } = await chiedi(server, `/api/ciao?sfida=${SFIDA}&chi=${chiDellaChiave(chiave)}`)
    expect(provaCiaoValida(chiave, SFIDA, dati.prova)).toBe(true)
    // Né la chiave né il segno escono dal PC.
    expect(JSON.stringify(dati)).not.toContain(chiave)
    expect(a.registro.join('\n')).not.toContain(chiave)
  })

  it('a un telefono che non conosce non dà prova, e lo scrive nel registro senza chiavi', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const altrove = 'chiave-finta-di-un-altro-pc'
    const { stato, dati } = await chiedi(server, `/api/ciao?sfida=${SFIDA}&chi=${chiDellaChiave(altrove)}`)
    expect(stato).toBe(200)
    expect(dati.saProvare).toBe(true)
    expect(dati.prova).toBeUndefined()
    expect(a.registro).toHaveLength(1)
    expect(a.registro[0]).toContain('[client]')
    expect(a.registro[0]).toContain('non è nel mio elenco')
    expect(a.registro[0]).not.toContain(altrove)
    expect(a.registro[0]).not.toContain(SFIDA)
    // Una riga per indirizzo ogni dieci minuti, non una per richiesta.
    await chiedi(server, `/api/ciao?sfida=${SFIDA}&chi=${chiDellaChiave(altrove)}`)
    expect(a.registro).toHaveLength(1)
  })

  it('un telefono tolto dall’elenco non riceve più la prova', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const tel = a.dispositivi.accoppia(a.dispositivi.apriAccoppiamento().codice, 'telefono di esempio')
    a.dispositivi.revoca(tel?.id ?? '')
    const { dati } = await chiedi(server, `/api/ciao?sfida=${SFIDA}&chi=${chiDellaChiave(tel?.chiave ?? '')}`)
    expect(dati.prova).toBeUndefined()
  })

  it('una sfida che non ha la forma giusta: niente prova, niente errore', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const tel = a.dispositivi.accoppia(a.dispositivi.apriAccoppiamento().codice, 'telefono di esempio')
    const chi = chiDellaChiave(tel?.chiave ?? '')
    for (const sfida of ['corta', SFIDA.toUpperCase(), `${SFIDA}00`]) {
      const { stato, dati } = await chiedi(server, `/api/ciao?sfida=${sfida}&chi=${chi}`)
      expect(stato).toBe(200)
      expect(dati.prova).toBeUndefined()
    }
    expect((await chiedi(server, `/api/ciao?sfida=${SFIDA}&chi=troppo-corto`)).dati.prova).toBeUndefined()
  })

  it('conProva non tocca una risposta che non è andata bene', () => {
    const d = { prova: () => 'x' }
    expect(conProva({ stato: 404, corpo: { errore: 'non trovato' } }, new URLSearchParams(`sfida=${SFIDA}&chi=${'a'.repeat(16)}`), d)).toEqual({ stato: 404, corpo: { errore: 'non trovato' } })
  })
})

describe('impronta e indirizzi all’accoppiamento e nello stato', () => {
  it('/api/accoppia risponde anche con chi è il PC e dove risponde', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const { codice } = a.dispositivi.apriAccoppiamento()
    const { stato, dati } = await chiedi(server, '/api/accoppia', { metodo: 'POST', corpo: { codice, nome: 'telefono di esempio' } })
    expect(stato).toBe(200)
    expect(typeof dati.chiave).toBe('string')
    expect(dati.impronta).toMatch(/^[0-9a-f]{16}$/)
    expect(dati.indirizzi).toEqual([
      { indirizzo: 'http://10.1.2.3:47640', tipo: 'casa' },
      { indirizzo: 'http://100.64.0.5:47640', tipo: 'tailscale' }
    ])
  })

  it('/api/stato li porta sotto `pc`, e solo lì', async () => {
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-prova-stato-')))
    const deps = {
      dispositivi, versione: '9.9.9',
      reteApp: () => indirizziPerApp(['10.1.2.3'], 47640, 'pc-di-esempio'),
      autopiloti: () => Promise.resolve([]), domande: () => Promise.resolve([]),
      workspace: () => Promise.resolve({ nomi: [], attivo: '' }), chat: () => [], aggiornamento: () => ({})
    } as unknown as DipendenzeRotte
    const r = await rotteClient(deps)({ metodo: 'GET', percorso: '/api/stato', corpo: undefined, dispositivo: 'tel-1' }) as { stato: number; corpo: Record<string, unknown> }
    expect(r.stato).toBe(200)
    expect(r.corpo.pc).toEqual({ impronta: indirizziPerApp([], 47640, 'pc-di-esempio').impronta, indirizzi: [{ indirizzo: 'http://10.1.2.3:47640', tipo: 'casa' }] })
  })

  it('senza identità (il programma sta partendo) niente impronta: non una uguale per tutti', () => {
    expect(indirizziPerApp(['10.1.2.3'], 47640, '').impronta).toBe('')
    expect(pcPerApp(indirizziPerApp(['10.1.2.3'], 47640, ''))).toBeUndefined()
    expect(pcPerApp(undefined)).toBeUndefined()
  })
})

describe('i casi condivisi con l’app', () => {
  it('il PC dà esattamente la prova scritta nei casi', () => {
    const file = JSON.parse(readFileSync(join(__dirname, '../fixtures/prova-telefono-casi.json'), 'utf8')) as { casi: { chi: string; sfida: string; prova: string; segno: string }[] }
    const cartella = mkdtempSync(join(tmpdir(), 'sd-prova-casi-'))
    // Un elenco scritto a mano con i segni dei casi: è quello che il PC tiene su disco.
    const dispositivi = apriDispositivi(cartella)
    writeFileSync(join(cartella, 'dispositivi.json'), JSON.stringify({ versione: 1, dispositivi: file.casi.map((c, i) => ({ id: `tel-${i}`, nome: `telefono ${i}`, segno: c.segno, collegatoIl: '2026-01-01T00:00:00.000Z' })) }))
    for (const c of file.casi) expect(dispositivi.prova(c.chi, c.sfida)).toBe(c.prova)
    expect(dispositivi.prova('0'.repeat(16), file.casi[0]!.sfida)).toBeUndefined()
  })
})
