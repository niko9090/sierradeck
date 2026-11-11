import { describe, it, expect, afterEach } from 'vitest'
import { createSocket } from 'node:dgram'
import type { AddressInfo } from 'node:net'
import {
  avviaAnnuncio, cambiSchede, chiedeIlServizio, DOMANDA_UDP, domandaPerNoi, leggiNome, nomiAnnuncio, ordinaIndirizzi,
  pacchettoAnnuncio, rispostaUdp, schedaVicina, schedeMulticast, SERVIZIO, type AnnuncioAttivo
} from '../../src/main/annuncio-mdns'

/**
 * L'annuncio in rete locale reso robusto (m-collegamento): nomi compressi,
 * domande SRV/TXT/A, risposta diretta, cambi di rete, risponditore UDP.
 * Indirizzi inventati delle reti private; impronte finte.
 */

const IMPRONTA = 'abcdef0123456789'
const DATI = { impronta: IMPRONTA, porta: 47640, ip: ['10.1.2.3', '100.64.0.5', '192.168.10.5'], versione: '1.0.0' }

/** Una domanda mDNS; `comprimi` scrive il nome dopo il primo come puntatore al primo. */
function domanda(voci: { nome: string; tipo: number; qu?: boolean }[], opz: { id?: number; comprimi?: boolean } = {}): Buffer {
  const testa = Buffer.alloc(12)
  testa.writeUInt16BE(opz.id ?? 0, 0)
  testa.writeUInt16BE(voci.length, 4)
  const pezzi: Buffer[] = [testa]
  let lunghezza = 12
  const visti = new Map<string, number>()
  for (const v of voci) {
    const parti = v.nome.split('.')
    const nome: Buffer[] = []
    for (let i = 0; i < parti.length; i++) {
      const resto = parti.slice(i).join('.')
      const gia = visti.get(resto)
      if (opz.comprimi === true && gia !== undefined) { nome.push(Buffer.from([0xc0 | (gia >> 8), gia & 0xff])); break }
      visti.set(resto, lunghezza + nome.reduce((s, b) => s + b.length, 0))
      nome.push(Buffer.from([parti[i]!.length]), Buffer.from(parti[i]!))
      if (i === parti.length - 1) nome.push(Buffer.from([0]))
    }
    const coda = Buffer.alloc(4)
    coda.writeUInt16BE(v.tipo, 0)
    coda.writeUInt16BE(v.qu === true ? 0x8001 : 1, 2)
    const b = Buffer.concat([...nome, coda])
    pezzi.push(b)
    lunghezza += b.length
  }
  return Buffer.concat(pezzi)
}

describe('il pacchetto', () => {
  it('PTR, SRV, TXT e un A per indirizzo: la scheda di uscita prima, Tailscale in fondo', () => {
    expect(ordinaIndirizzi(DATI.ip)).toEqual(['10.1.2.3', '192.168.10.5', '100.64.0.5'])
    expect(ordinaIndirizzi(DATI.ip, '192.168.10.5')).toEqual(['192.168.10.5', '10.1.2.3', '100.64.0.5'])
    const p = pacchettoAnnuncio(DATI, { primo: '192.168.10.5' })
    expect(p.readUInt16BE(6)).toBe(6)
    expect(p.indexOf(Buffer.from([192, 168, 10, 5]))).toBeLessThan(p.indexOf(Buffer.from([10, 1, 2, 3])))
  })

  it('il congedo ha scadenza zero', () => {
    const p = pacchettoAnnuncio(DATI, { ttl: 0 })
    // Il primo record (PTR) comincia dopo la testa e il nome del servizio.
    const dopoNome = 12 + SERVIZIO.length + 2
    expect(p.readUInt32BE(dopoNome + 4)).toBe(0)
  })

  it('niente nome del PC: solo l’impronta', () => {
    const p = pacchettoAnnuncio(DATI).toString('latin1')
    expect(p).toContain(`id=${IMPRONTA}`)
    expect(nomiAnnuncio(IMPRONTA).host).toBe('sierradeck-abcdef01.local')
  })
})

describe('le domande', () => {
  const { istanza, host } = nomiAnnuncio(IMPRONTA)

  it('legge i nomi compressi', () => {
    const q = domanda([{ nome: '_altro._tcp.local', tipo: 12 }, { nome: SERVIZIO, tipo: 12 }], { comprimi: true })
    expect(domandaPerNoi(q)).toBeDefined()
    expect(leggiNome(q, 12)?.nome).toBe('_altro._tcp.local')
  })

  it('risponde a SRV e TXT sull’istanza e ad A sul nome, solo se sa l’impronta', () => {
    expect(domandaPerNoi(domanda([{ nome: istanza, tipo: 33 }]), IMPRONTA)).toBeDefined()
    expect(domandaPerNoi(domanda([{ nome: istanza.toUpperCase(), tipo: 16 }]), IMPRONTA)).toBeDefined()
    expect(domandaPerNoi(domanda([{ nome: host, tipo: 1 }]), IMPRONTA)).toBeDefined()
    expect(domandaPerNoi(domanda([{ nome: host, tipo: 1 }]))).toBeUndefined()
    expect(domandaPerNoi(domanda([{ nome: 'sierradeck-00000000.local', tipo: 1 }]), IMPRONTA)).toBeUndefined()
    expect(domandaPerNoi(domanda([{ nome: SERVIZIO, tipo: 28 }]), IMPRONTA)).toBeUndefined()
  })

  it('il bit QU chiede la risposta diretta; id e domande tornano per la risposta «legacy»', () => {
    const q = domandaPerNoi(domanda([{ nome: SERVIZIO, tipo: 12, qu: true }], { id: 0x1234 }))
    expect(q?.diretta).toBe(true)
    expect(q?.id).toBe(0x1234)
    expect(q?.domande).toHaveLength(1)
    const r = pacchettoAnnuncio(DATI, { id: q!.id, domande: q!.domande })
    expect(r.readUInt16BE(0)).toBe(0x1234)
    expect(r.readUInt16BE(4)).toBe(1)
  })

  it('pacchetti rotti o puntatori in tondo non fanno danni', () => {
    const giro = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), Buffer.from([0xc0, 12, 0, 12, 0, 1])])
    expect(domandaPerNoi(giro)).toBeUndefined()
    expect(domandaPerNoi(Buffer.from([1, 2, 3]))).toBeUndefined()
    expect(chiedeIlServizio(pacchettoAnnuncio(DATI))).toBe(false)
  })
})

describe('le schede di rete', () => {
  it('solo IPv4 private non interne, senza Tailscale', () => {
    const schede = schedeMulticast({
      'Wi-Fi': [{ address: '192.168.10.5', family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:01', cidr: null }],
      Tailscale: [{ address: '100.64.0.5', family: 'IPv4', internal: false, netmask: '255.192.0.0', mac: '00:00:00:00:00:02', cidr: null }],
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '255.0.0.0', mac: '00:00:00:00:00:00', cidr: null }]
    } as never)
    expect(schede).toEqual(['192.168.10.5'])
  })

  it('cambi: in quali entrare e quali lasciare', () => {
    expect(cambiSchede(['10.1.2.3'], ['192.168.10.5'])).toEqual({ entra: ['192.168.10.5'], esci: ['10.1.2.3'] })
    expect(cambiSchede(['10.1.2.3'], ['10.1.2.3'])).toEqual({ entra: [], esci: [] })
  })

  it('la scheda sulla stessa rete di chi chiede', () => {
    expect(schedaVicina(['10.1.2.3', '192.168.10.5'], '192.168.10.77')).toBe('192.168.10.5')
    expect(schedaVicina(['10.1.2.3'], '::ffff:10.1.2.9')).toBe('10.1.2.3')
    expect(schedaVicina(['10.1.2.3'], '172.16.0.2')).toBeUndefined()
  })
})

describe('il risponditore UDP', () => {
  let annuncio: AnnuncioAttivo | undefined
  afterEach(() => { annuncio?.ferma(); annuncio = undefined })

  it('alla domanda risponde con impronta, porta e versione; al resto niente', () => {
    expect(JSON.parse(rispostaUdp(Buffer.from(DOMANDA_UDP), DATI)!.toString('utf8'))).toEqual({ programma: 'SierraDeck', impronta: IMPRONTA, porta: 47640, versione: '1.0.0' })
    expect(rispostaUdp(Buffer.from(`${DOMANDA_UDP} 1`), DATI)).toBeDefined()
    expect(rispostaUdp(Buffer.from('ciao'), DATI)).toBeUndefined()
    expect(rispostaUdp(Buffer.from(DOMANDA_UDP), undefined)).toBeUndefined()
    expect(rispostaUdp(Buffer.alloc(200, 0x41), DATI)).toBeUndefined()
  })

  it('davvero, su una porta di prova', async () => {
    // Una porta libera, presa e lasciata subito.
    const porta = await new Promise<number>((ok) => { const s = createSocket('udp4'); s.bind(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => ok(p)) }) })
    annuncio = avviaAnnuncio({ dati: () => DATI, portaUdp: porta, indirizzoUdp: '127.0.0.1', senzaMdns: true })
    await new Promise((r) => setTimeout(r, 100))
    const telefono = createSocket('udp4')
    const risposta = await new Promise<string>((ok, ko) => {
      const t = setTimeout(() => ko(new Error('nessuna risposta')), 3000)
      telefono.on('message', (m) => { clearTimeout(t); ok(m.toString('utf8')) })
      telefono.bind(0, '127.0.0.1', () => telefono.send(Buffer.from(DOMANDA_UDP), porta, '127.0.0.1'))
    })
    telefono.close()
    expect(JSON.parse(risposta).impronta).toBe(IMPRONTA)
  })
})
