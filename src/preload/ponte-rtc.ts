import { ipcRenderer } from 'electron'

/**
 * Il WebRTC di Chromium, per il Core (0.40.0).
 *
 * Gira in una finestra nascosta, senza pagina (`ponte-rtc.ts` nel main): è il
 * modo di usare l'`RTCPeerConnection` che Electron ha già dentro, senza
 * moduli nativi da compilare. Qui solo il minimo: aprire un collegamento,
 * passare stringhe, dire quando si apre o si chiude. La regia (Drive, chiave
 * di casa, cifratura, richieste) sta nel main, in `collegamento-rtc.ts`.
 *
 * I messaggi lunghi (uno schermo con i colori) si spezzano in pezzi: un
 * canale dati non porta oltre qualche centinaio di KB per messaggio.
 */

type Comando = {
  n: number
  cmd: 'offri' | 'rispondi' | 'completa' | 'manda' | 'chiudi'
  id: string
  sdp?: string
  stun?: string[]
  testo?: string
}

const PEZZO = 60_000
const ATTESA_CANDIDATI_MS = 6000

type Capo = { pc: RTCPeerConnection; dc?: RTCDataChannel; pezzi: string[]; chiuso: boolean }
const capi = new Map<string, Capo>()

const evento = (e: { id: string; tipo: 'aperto' | 'chiuso' | 'messaggio'; testo?: string; via?: string }): void => {
  ipcRenderer.send('ponte-rtc:evento', e)
}

function attendiCandidati(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((ok) => {
    const fine = (): void => { pc.removeEventListener('icegatheringstatechange', guarda); clearTimeout(t); ok() }
    const guarda = (): void => { if (pc.iceGatheringState === 'complete') fine() }
    const t = setTimeout(fine, ATTESA_CANDIDATI_MS)
    pc.addEventListener('icegatheringstatechange', guarda)
  })
}

/** Il tipo di candidato usato: `host` (stessa rete), `srflx`/`prflx` (attraverso Internet), `relay` (mai: niente TURN). */
async function tipoCandidato(pc: RTCPeerConnection): Promise<string | undefined> {
  try {
    const stats = await pc.getStats()
    let locale: string | undefined
    stats.forEach((s: { type?: string; state?: string; nominated?: boolean; localCandidateId?: string }) => {
      if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated === true && s.localCandidateId !== undefined) locale = s.localCandidateId
    })
    if (locale === undefined) return undefined
    const c = stats.get(locale) as { candidateType?: string } | undefined
    return c?.candidateType
  } catch {
    return undefined
  }
}

function chiudi(id: string): void {
  const c = capi.get(id)
  if (c === undefined) return
  capi.delete(id)
  try { c.dc?.close() } catch { /* gia' chiuso */ }
  try { c.pc.close() } catch { /* gia' chiuso */ }
  if (!c.chiuso) { c.chiuso = true; evento({ id, tipo: 'chiuso' }) }
}

function collega(id: string, c: Capo, dc: RTCDataChannel): void {
  c.dc = dc
  dc.onopen = (): void => { void tipoCandidato(c.pc).then((via) => evento({ id, tipo: 'aperto', ...(via !== undefined ? { via } : {}) })) }
  dc.onclose = (): void => chiudi(id)
  dc.onmessage = (e: MessageEvent): void => {
    const s = String(e.data)
    if (s.startsWith('m')) { evento({ id, tipo: 'messaggio', testo: s.slice(1) }); return }
    // `c<indice>,<totale>,<pezzo>`: il canale è ordinato, i pezzi arrivano in fila.
    const m = /^c(\d+),(\d+),/.exec(s)
    if (m === null) return
    const i = Number(m[1])
    const tot = Number(m[2])
    if (i === 0) c.pezzi = []
    c.pezzi.push(s.slice(m[0].length))
    if (i === tot - 1) { const tutto = c.pezzi.join(''); c.pezzi = []; evento({ id, tipo: 'messaggio', testo: tutto }) }
  }
}

function nuovo(id: string, stun: string[]): Capo {
  chiudi(id)
  const pc = new RTCPeerConnection({ iceServers: stun.length > 0 ? [{ urls: stun }] : [] })
  const c: Capo = { pc, pezzi: [], chiuso: false }
  capi.set(id, c)
  pc.onconnectionstatechange = (): void => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') chiudi(id)
  }
  return c
}

async function esegui(k: Comando): Promise<unknown> {
  if (k.cmd === 'offri') {
    const c = nuovo(k.id, k.stun ?? [])
    collega(k.id, c, c.pc.createDataChannel('sierradeck', { ordered: true }))
    await c.pc.setLocalDescription(await c.pc.createOffer())
    await attendiCandidati(c.pc)
    return c.pc.localDescription?.sdp ?? ''
  }
  if (k.cmd === 'rispondi') {
    const c = nuovo(k.id, k.stun ?? [])
    c.pc.ondatachannel = (e: RTCDataChannelEvent): void => collega(k.id, c, e.channel)
    await c.pc.setRemoteDescription({ type: 'offer', sdp: k.sdp ?? '' })
    await c.pc.setLocalDescription(await c.pc.createAnswer())
    await attendiCandidati(c.pc)
    return c.pc.localDescription?.sdp ?? ''
  }
  if (k.cmd === 'completa') {
    const c = capi.get(k.id)
    if (c === undefined) throw new Error('collegamento sconosciuto')
    await c.pc.setRemoteDescription({ type: 'answer', sdp: k.sdp ?? '' })
    return true
  }
  if (k.cmd === 'manda') {
    const dc = capi.get(k.id)?.dc
    if (dc === undefined || dc.readyState !== 'open') throw new Error('canale non aperto')
    const t = k.testo ?? ''
    if (t.length <= PEZZO) dc.send(`m${t}`)
    else {
      const tot = Math.ceil(t.length / PEZZO)
      for (let i = 0; i < tot; i += 1) dc.send(`c${i},${tot},${t.slice(i * PEZZO, (i + 1) * PEZZO)}`)
    }
    return true
  }
  chiudi(k.id)
  return true
}

ipcRenderer.on('ponte-rtc:comando', (_e, k: Comando) => {
  void esegui(k).then(
    (valore) => ipcRenderer.send('ponte-rtc:esito', { n: k.n, ok: true, valore }),
    (err: unknown) => ipcRenderer.send('ponte-rtc:esito', { n: k.n, ok: false, errore: err instanceof Error ? err.message : String(err) })
  )
})
ipcRenderer.send('ponte-rtc:pronto')
