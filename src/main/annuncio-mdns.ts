import { createSocket, type Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { annunciabile, eTailscale } from './rete-telefono'

/**
 * L'annuncio in rete locale (mDNS / DNS-SD, `_sierradeck._tcp`), k-50.
 *
 * Il telefono sulla stessa WiFi chiede «chi è _sierradeck._tcp?» e questo PC
 * risponde con porta e indirizzi: così lo trova anche se non conosce ancora
 * l'indirizzo. Non apre niente di nuovo: è multicast sulla rete locale (mai
 * oltre il router), e chi si presenta deve comunque avere il gettone.
 * L'annuncio porta solo nome del servizio, porta, indirizzi e l'impronta.
 * Se la porta 5353 è occupata o il multicast non va, si tace: il resto
 * funziona lo stesso con gli indirizzi raccontati dopo l'abbinamento.
 */

export const SERVIZIO = '_sierradeck._tcp.local'
const GRUPPO = '224.0.0.251'
const PORTA_MDNS = 5353
const TTL = 120

function nomeDns(nome: string): Buffer {
  const parti = nome.split('.').filter((p) => p !== '')
  const bufs: Buffer[] = []
  for (const p of parti) {
    const b = Buffer.from(p, 'utf8').subarray(0, 63)
    bufs.push(Buffer.from([b.length]), b)
  }
  bufs.push(Buffer.from([0]))
  return Buffer.concat(bufs)
}

function record(nome: string, tipo: number, dati: Buffer, svuotaCache = true): Buffer {
  const testa = Buffer.alloc(10)
  testa.writeUInt16BE(tipo, 0)
  testa.writeUInt16BE(svuotaCache ? 0x8001 : 1, 2)
  testa.writeUInt32BE(TTL, 4)
  testa.writeUInt16BE(dati.length, 8)
  return Buffer.concat([nomeDns(nome), testa, dati])
}

export type DatiAnnuncio = {
  impronta: string
  porta: number
  /** Solo gli IPv4 (senza schema): quelli non annunciabili vengono scartati. */
  ip: string[]
  versione: string
}

/** I nomi usati dall'annuncio, tutti derivati dall'impronta. */
export function nomiAnnuncio(impronta: string): { istanza: string; host: string } {
  const corta = impronta.slice(0, 8)
  return { istanza: `SierraDeck-${corta}.${SERVIZIO}`, host: `sierradeck-${corta}.local` }
}

/** Il pacchetto di risposta mDNS: PTR + SRV + TXT + un A per indirizzo. */
export function pacchettoAnnuncio(d: DatiAnnuncio): Buffer {
  const { istanza, host } = nomiAnnuncio(d.impronta)
  const ip = [...new Set(d.ip.filter(annunciabile))]
  const risposte: Buffer[] = []
  risposte.push(record(SERVIZIO, 12, nomeDns(istanza), false))
  const srv = Buffer.alloc(6)
  srv.writeUInt16BE(0, 0)
  srv.writeUInt16BE(0, 2)
  srv.writeUInt16BE(d.porta, 4)
  risposte.push(record(istanza, 33, Buffer.concat([srv, nomeDns(host)])))
  const txt = [`id=${d.impronta}`, `v=${d.versione}`].map((t) => {
    const b = Buffer.from(t, 'utf8')
    return Buffer.concat([Buffer.from([b.length]), b])
  })
  risposte.push(record(istanza, 16, Buffer.concat(txt)))
  for (const i of ip) risposte.push(record(host, 1, Buffer.from(i.split('.').map(Number))))
  const testa = Buffer.alloc(12)
  testa.writeUInt16BE(0x8400, 2) // risposta, autorevole
  testa.writeUInt16BE(risposte.length, 6)
  return Buffer.concat([testa, ...risposte])
}

/** La domanda cerca il nostro servizio? Legge solo la sezione domande. */
export function chiedeIlServizio(msg: Buffer): boolean {
  if (msg.length < 12) return false
  if ((msg.readUInt16BE(2) & 0x8000) !== 0) return false // è una risposta
  const n = msg.readUInt16BE(4)
  let p = 12
  for (let q = 0; q < n; q++) {
    const parti: string[] = []
    for (;;) {
      if (p >= msg.length) return false
      const l = msg[p]!
      if (l === 0) { p++; break }
      if ((l & 0xc0) !== 0) return false // compressione nelle domande: non la gestiamo
      parti.push(msg.subarray(p + 1, p + 1 + l).toString('utf8').toLowerCase())
      p += 1 + l
    }
    if (p + 4 > msg.length) return false
    const tipo = msg.readUInt16BE(p)
    p += 4
    if (parti.join('.') === SERVIZIO && (tipo === 12 || tipo === 255)) return true
  }
  return false
}

export type AnnuncioAttivo = { ferma: () => void }

/**
 * Avvia l'annuncio: risponde alle domande e si ripresenta ogni 2 minuti
 * (gli indirizzi cambiano con la rete). Mai un'eccezione verso chi chiama.
 */
export function avviaAnnuncio(opz: {
  dati: () => DatiAnnuncio | undefined
  log?: (m: string) => void
}): AnnuncioAttivo {
  let socket: Socket | undefined
  let timer: NodeJS.Timeout | undefined
  let fermo = false
  const log = opz.log ?? (() => undefined)

  const manda = (): void => {
    const d = opz.dati()
    if (d === undefined || socket === undefined) return
    const pacchetto = pacchettoAnnuncio(d)
    for (const i of d.ip) {
      if (!annunciabile(i) || eTailscale(i)) continue // il multicast esce solo dalla rete di casa
      try { socket.setMulticastInterface(i); socket.send(pacchetto, PORTA_MDNS, GRUPPO, () => undefined) } catch { /* una scheda che non va non ferma le altre */ }
    }
  }

  try {
    const s = createSocket({ type: 'udp4', reuseAddr: true })
    socket = s
    s.on('error', (e) => { log(`[mdns] annuncio non attivo: ${e.message}`) })
    s.on('message', (msg) => { if (chiedeIlServizio(msg)) manda() })
    s.bind(PORTA_MDNS, () => {
      if (fermo) return
      try {
        s.setMulticastTTL(255)
        for (const schede of Object.values(networkInterfaces())) {
          for (const sc of schede ?? []) {
            const fam = sc.family as string | number
            if ((fam === 'IPv4' || fam === 4) && !sc.internal && annunciabile(sc.address) && !eTailscale(sc.address)) {
              try { s.addMembership(GRUPPO, sc.address) } catch { /* scheda senza multicast */ }
            }
          }
        }
      } catch (e) { log(`[mdns] multicast non disponibile: ${(e as Error).message}`) }
      manda()
      timer = setInterval(manda, 120_000)
      timer.unref?.()
    })
  } catch (e) {
    log(`[mdns] annuncio non avviato: ${(e as Error).message}`)
  }
  return {
    ferma: () => {
      fermo = true
      if (timer !== undefined) clearInterval(timer)
      try { socket?.close() } catch { /* già chiuso */ }
    }
  }
}
