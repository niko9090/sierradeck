import { createSocket, type RemoteInfo, type Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { daReteLocale } from '@shared/rete-locale'
import { annunciabile, eTailscale } from './rete-telefono'

/**
 * L'annuncio in rete locale (mDNS / DNS-SD, `_sierradeck._tcp`), k-50, reso
 * robusto da m-collegamento.
 *
 * Il telefono sulla stessa WiFi chiede «chi è _sierradeck._tcp?» e questo PC
 * risponde con porta e indirizzi: così lo trova anche se non conosce ancora
 * l'indirizzo. Non apre niente di nuovo: è multicast sulla rete locale (mai
 * oltre il router), e chi si presenta deve comunque avere la chiave.
 * L'annuncio porta solo nome del servizio, porta, indirizzi e l'impronta: mai
 * il nome del PC (è un dato di chi lo usa).
 *
 * Cosa non andava nella prima versione, e cosa fa adesso:
 * - rispondeva solo alla domanda PTR sul servizio, e scartava i nomi compressi:
 *   ora risponde anche a SRV e TXT sull'istanza, ad A sul nome del PC, e legge
 *   i nomi compressi;
 * - entrava nel gruppo multicast una volta sola, all'avvio: dopo un cambio di
 *   rete (o il risveglio) non sentiva più le domande. Ora ricontrolla le schede
 *   ogni 30 s, entra nei gruppi nuovi e si ripresenta subito;
 * - si ripresentava ogni 120 s con scadenza 120 s (al limite): ora ogni 60 s;
 * - rispondeva solo in multicast: ora, se chi chiede vuole la risposta diretta
 *   (bit QU, o domanda da una porta diversa dalla 5353), gliela manda a lui;
 * - c'è anche un risponditore UDP sulla porta del servizio, per i router che
 *   filtrano il multicast: il telefono manda `SIERRADECK-CERCA` in broadcast e
 *   il PC risponde con un JSON di una riga.
 * Se la porta 5353 è occupata o il multicast non va, si tace: il resto
 * funziona lo stesso con gli indirizzi raccontati dopo l'accoppiamento.
 */

export const SERVIZIO = '_sierradeck._tcp.local'
const GRUPPO = '224.0.0.251'
const PORTA_MDNS = 5353
const TTL = 120
/** Ogni quanto ci si ripresenta: metà della scadenza, come vuole mDNS. */
export const RIPRESENTA_MS = 60_000
/** Ogni quanto si guardano le schede di rete (una rete nuova, il risveglio). */
export const GUARDA_SCHEDE_MS = 30_000
/** Il messaggio del risponditore UDP: il telefono lo manda in broadcast sulla porta del servizio. */
export const DOMANDA_UDP = 'SIERRADECK-CERCA'

const T_A = 1
const T_PTR = 12
const T_TXT = 16
const T_SRV = 33
const T_ANY = 255

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

function record(nome: string, tipo: number, dati: Buffer, ttl: number, svuotaCache = true): Buffer {
  const testa = Buffer.alloc(10)
  testa.writeUInt16BE(tipo, 0)
  testa.writeUInt16BE(svuotaCache ? 0x8001 : 1, 2)
  testa.writeUInt32BE(ttl, 4)
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

/**
 * Gli indirizzi nell'ordine giusto per chi li riceve: prima `primo` (quello
 * della scheda da cui esce l'annuncio, o della stessa rete di chi chiede), poi
 * la rete di casa, in fondo Tailscale. Android, con la vecchia `resolveService`,
 * tiene solo il primo.
 */
export function ordinaIndirizzi(ip: string[], primo?: string): string[] {
  const buoni = [...new Set(ip.filter(annunciabile))]
  const casa = buoni.filter((i) => !eTailscale(i))
  const vpn = buoni.filter(eTailscale)
  const tutti = [...casa, ...vpn]
  return primo !== undefined && tutti.includes(primo) ? [primo, ...tutti.filter((i) => i !== primo)] : tutti
}

/**
 * Il pacchetto di risposta mDNS: PTR + SRV + TXT + un A per indirizzo.
 * `ttl: 0` è il congedo (il programma si chiude: dimenticatemi).
 * `id` e `domande` servono alla risposta diretta a una domanda «legacy».
 */
export function pacchettoAnnuncio(d: DatiAnnuncio, opz: { ttl?: number; primo?: string; id?: number; domande?: Buffer[] } = {}): Buffer {
  const ttl = opz.ttl ?? TTL
  const { istanza, host } = nomiAnnuncio(d.impronta)
  const ip = ordinaIndirizzi(d.ip, opz.primo)
  const risposte: Buffer[] = []
  risposte.push(record(SERVIZIO, T_PTR, nomeDns(istanza), ttl, false))
  const srv = Buffer.alloc(6)
  srv.writeUInt16BE(0, 0)
  srv.writeUInt16BE(0, 2)
  srv.writeUInt16BE(d.porta, 4)
  risposte.push(record(istanza, T_SRV, Buffer.concat([srv, nomeDns(host)]), ttl))
  const txt = [`id=${d.impronta}`, `v=${d.versione}`].map((t) => {
    const b = Buffer.from(t, 'utf8')
    return Buffer.concat([Buffer.from([b.length]), b])
  })
  risposte.push(record(istanza, T_TXT, Buffer.concat(txt), ttl))
  for (const i of ip) risposte.push(record(host, T_A, Buffer.from(i.split('.').map(Number)), ttl))
  const domande = opz.domande ?? []
  const testa = Buffer.alloc(12)
  testa.writeUInt16BE(opz.id ?? 0, 0)
  testa.writeUInt16BE(0x8400, 2) // risposta, autorevole
  testa.writeUInt16BE(domande.length, 4)
  testa.writeUInt16BE(risposte.length, 6)
  return Buffer.concat([testa, ...domande, ...risposte])
}

/**
 * Un nome DNS dal pacchetto, anche compresso (i puntatori 0xC0 che rimandano
 * a un nome già scritto prima). `fine` è dove continua il pacchetto dopo il
 * nome. `undefined` se il pacchetto è rotto o i puntatori girano in tondo.
 */
export function leggiNome(msg: Buffer, inizio: number): { nome: string; fine: number } | undefined {
  const parti: string[] = []
  let p = inizio
  let fine: number | undefined
  for (let salti = 0; salti < 32; ) {
    if (p >= msg.length) return undefined
    const l = msg[p]!
    if (l === 0) return { nome: parti.join('.').toLowerCase(), fine: fine ?? p + 1 }
    if ((l & 0xc0) === 0xc0) {
      if (p + 1 >= msg.length) return undefined
      if (fine === undefined) fine = p + 2
      p = ((l & 0x3f) << 8) | msg[p + 1]!
      salti += 1
      continue
    }
    if ((l & 0xc0) !== 0) return undefined
    if (p + 1 + l > msg.length) return undefined
    parti.push(msg.subarray(p + 1, p + 1 + l).toString('utf8'))
    p += 1 + l
  }
  return undefined
}

export type DomandaPerNoi = {
  /** L'id della domanda: si ricopia nella risposta diretta. */
  id: number
  /** Chi chiede vuole la risposta a sé (bit QU), non a tutto il gruppo. */
  diretta: boolean
  /** Le domande che ci riguardano, così come sono scritte: tornano nella risposta «legacy». */
  domande: Buffer[]
}

/**
 * La domanda riguarda noi? PTR (o ANY) sul servizio, SRV/TXT/ANY sull'istanza,
 * A/ANY sul nome del PC. Senza `impronta` vale solo il PTR sul servizio.
 */
export function domandaPerNoi(msg: Buffer, impronta?: string): DomandaPerNoi | undefined {
  if (msg.length < 12) return undefined
  if ((msg.readUInt16BE(2) & 0x8000) !== 0) return undefined // è una risposta
  const n = msg.readUInt16BE(4)
  const nomi = impronta !== undefined && impronta !== '' ? nomiAnnuncio(impronta) : undefined
  const istanza = nomi?.istanza.toLowerCase()
  const host = nomi?.host.toLowerCase()
  let p = 12
  let diretta = false
  const domande: Buffer[] = []
  for (let q = 0; q < n && q < 64; q++) {
    const letto = leggiNome(msg, p)
    if (letto === undefined || letto.fine + 4 > msg.length) break
    const tipo = msg.readUInt16BE(letto.fine)
    const classe = msg.readUInt16BE(letto.fine + 2)
    const nostra =
      (letto.nome === SERVIZIO && (tipo === T_PTR || tipo === T_ANY)) ||
      (istanza !== undefined && letto.nome === istanza && (tipo === T_SRV || tipo === T_TXT || tipo === T_ANY)) ||
      (host !== undefined && letto.nome === host && (tipo === T_A || tipo === T_ANY))
    if (nostra) {
      if ((classe & 0x8000) !== 0) diretta = true
      // Riscritta senza compressione: fuori dal suo pacchetto i puntatori non valgono.
      const coda = Buffer.alloc(4)
      coda.writeUInt16BE(tipo, 0)
      coda.writeUInt16BE(classe & 0x7fff, 2)
      domande.push(Buffer.concat([nomeDns(letto.nome), coda]))
    }
    p = letto.fine + 4
  }
  return domande.length > 0 ? { id: msg.readUInt16BE(0), diretta, domande } : undefined
}

/** Compatibilità: la domanda cerca il nostro servizio (o, con l'impronta, la nostra istanza)? */
export function chiedeIlServizio(msg: Buffer, impronta?: string): boolean {
  return domandaPerNoi(msg, impronta) !== undefined
}

/** Le schede da cui si annuncia: IPv4, non interne, private, non Tailscale (il multicast non ci passa). */
export function schedeMulticast(interfacce: ReturnType<typeof networkInterfaces> = networkInterfaces()): string[] {
  const fuori: string[] = []
  for (const schede of Object.values(interfacce)) {
    for (const sc of schede ?? []) {
      const fam = sc.family as string | number
      if ((fam === 'IPv4' || fam === 4) && !sc.internal && annunciabile(sc.address) && !eTailscale(sc.address) && !fuori.includes(sc.address)) fuori.push(sc.address)
    }
  }
  return fuori.sort()
}

/** Cosa è cambiato fra due giri: le schede in cui entrare e quelle da lasciare. */
export function cambiSchede(prima: string[], adesso: string[]): { entra: string[]; esci: string[] } {
  return { entra: adesso.filter((a) => !prima.includes(a)), esci: prima.filter((a) => !adesso.includes(a)) }
}

/** La scheda di questo PC sulla stessa rete di chi chiede (stessi primi tre numeri), se c'è. */
export function schedaVicina(mie: string[], chi: string): string | undefined {
  const rete = chi.replace(/^::ffff:/, '').split('.').slice(0, 3).join('.')
  return mie.find((m) => m.split('.').slice(0, 3).join('.') === rete)
}

/** La risposta del risponditore UDP: `undefined` se il messaggio non è la nostra domanda. */
export function rispostaUdp(msg: Buffer, d: DatiAnnuncio | undefined): Buffer | undefined {
  if (d === undefined || msg.length > 64) return undefined
  if (!msg.toString('utf8').trim().startsWith(DOMANDA_UDP)) return undefined
  return Buffer.from(JSON.stringify({ programma: 'SierraDeck', impronta: d.impronta, porta: d.porta, versione: d.versione }), 'utf8')
}

export type AnnuncioAttivo = { ferma: () => void }

/**
 * Avvia l'annuncio: risponde alle domande, si ripresenta ogni 60 s, segue i
 * cambi di rete. Con `portaUdp` anche il risponditore UDP. Mai un'eccezione
 * verso chi chiama.
 */
export function avviaAnnuncio(opz: {
  dati: () => DatiAnnuncio | undefined
  log?: (m: string) => void
  /** La porta del servizio: lì il risponditore UDP (stessa porta del Client, ma UDP). */
  portaUdp?: number
  /** Solo per i test: un altro indirizzo per l'UDP. */
  indirizzoUdp?: string
  /** Solo per i test: niente mDNS vero (non si annuncia un PC finto sulla rete di chi prova). */
  senzaMdns?: boolean
}): AnnuncioAttivo {
  let socket: Socket | undefined
  let udp: Socket | undefined
  const timer: NodeJS.Timeout[] = []
  let fermo = false
  let schede: string[] = []
  let ultimoErrore = ''
  const log = opz.log ?? (() => undefined)

  const manda = (ttl?: number): void => {
    const d = opz.dati()
    if (d === undefined || socket === undefined) return
    for (const i of schede) {
      try {
        socket.setMulticastInterface(i)
        socket.send(pacchettoAnnuncio(d, { primo: i, ...(ttl !== undefined ? { ttl } : {}) }), PORTA_MDNS, GRUPPO, () => undefined)
      } catch { /* una scheda che non va non ferma le altre */ }
    }
  }

  const rispondi = (msg: Buffer, da: RemoteInfo): void => {
    const d = opz.dati()
    if (d === undefined || socket === undefined) return
    const q = domandaPerNoi(msg, d.impronta)
    if (q === undefined) return
    const primo = schedaVicina(schede, da.address)
    // Domanda «legacy» (da una porta che non è la 5353): risposta a lui, con id e domande.
    if (da.port !== PORTA_MDNS) {
      if (!daReteLocale(da.address)) return
      try { socket.send(pacchettoAnnuncio(d, { ttl: 10, ...(primo !== undefined ? { primo } : {}), id: q.id, domande: q.domande }), da.port, da.address, () => undefined) } catch { /* pazienza */ }
      return
    }
    if (q.diretta && daReteLocale(da.address)) {
      try { socket.send(pacchettoAnnuncio(d, primo !== undefined ? { primo } : {}), PORTA_MDNS, da.address, () => undefined) } catch { /* pazienza */ }
      return
    }
    manda()
  }

  const seguiSchede = (): void => {
    if (socket === undefined) return
    const adesso = schedeMulticast()
    const { entra, esci } = cambiSchede(schede, adesso)
    if (entra.length === 0 && esci.length === 0) return
    for (const a of esci) { try { socket.dropMembership(GRUPPO, a) } catch { /* la scheda non c'è più */ } }
    for (const a of entra) { try { socket.addMembership(GRUPPO, a) } catch { /* scheda senza multicast */ } }
    const primaVolta = schede.length === 0 && esci.length === 0
    schede = adesso
    if (!primaVolta) log(`[mdns] le schede di rete sono cambiate (${adesso.length} adesso): rientrato nel gruppo e ripresentato`)
    manda()
  }

  const apri = (): void => {
    if (fermo) return
    try {
      const s = createSocket({ type: 'udp4', reuseAddr: true })
      socket = s
      s.on('error', (e) => {
        // Una riga per motivo, non una ogni 30 s per sempre (la 5353 presa da un altro programma).
        if (e.message !== ultimoErrore) log(`[mdns] annuncio non attivo: ${e.message}. Riprovo ogni 30 secondi.`)
        ultimoErrore = e.message
        try { s.close() } catch { /* già chiuso */ }
        if (socket === s) { socket = undefined; schede = [] }
        const t = setTimeout(apri, GUARDA_SCHEDE_MS)
        t.unref?.()
      })
      s.on('message', (msg, da) => { try { rispondi(msg, da) } catch { /* un pacchetto strano non ferma l'annuncio */ } })
      s.bind(PORTA_MDNS, () => {
        if (fermo) return
        try { s.setMulticastTTL(255) } catch (e) { log(`[mdns] multicast non disponibile: ${(e as Error).message}`) }
        schede = []
        seguiSchede()
      })
    } catch (e) {
      log(`[mdns] annuncio non avviato: ${(e as Error).message}`)
    }
  }
  if (opz.senzaMdns !== true) {
    apri()
    timer.push(setInterval(() => manda(), RIPRESENTA_MS), setInterval(seguiSchede, GUARDA_SCHEDE_MS))
  }

  // Il risponditore UDP sulla porta del servizio, per i router che filtrano il multicast.
  if (opz.portaUdp !== undefined) {
    try {
      const u = createSocket({ type: 'udp4' })
      udp = u
      let risposte = 0
      timer.push(setInterval(() => { risposte = 0 }, 1000))
      u.on('error', (e) => { log(`[mdns] risponditore UDP non attivo: ${e.message}`); try { u.close() } catch { /* già chiuso */ } })
      u.on('message', (msg, da) => {
        // Solo dalla rete locale, e al più dieci risposte al secondo: non diventa un megafono.
        if (!daReteLocale(da.address) || risposte >= 10) return
        const r = rispostaUdp(msg, opz.dati())
        if (r === undefined) return
        risposte += 1
        try { u.send(r, da.port, da.address, () => undefined) } catch { /* pazienza */ }
      })
      u.bind({ port: opz.portaUdp, ...(opz.indirizzoUdp !== undefined ? { address: opz.indirizzoUdp } : {}) }, () => { try { u.setBroadcast(true) } catch { /* senza broadcast */ } })
    } catch (e) {
      log(`[mdns] risponditore UDP non avviato: ${(e as Error).message}`)
    }
  }
  for (const t of timer) t.unref?.()

  return {
    ferma: () => {
      if (fermo) return
      // Il congedo: chi ci aveva in memoria ci dimentica subito, non fra due minuti.
      try { manda(0) } catch { /* pazienza */ }
      fermo = true
      for (const t of timer) clearInterval(t)
      try { socket?.close() } catch { /* già chiuso */ }
      try { udp?.close() } catch { /* già chiuso */ }
    }
  }
}
