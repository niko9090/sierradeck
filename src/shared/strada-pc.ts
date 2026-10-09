/**
 * Per quale strada si raggiunge un altro PC (0.40.0).
 *
 * Nicholas (02/10): le chat degli altri PC vanno raggiunte anche quando i due
 * PC sono su reti diverse e senza Tailscale. Quattro strade, provate in
 * quest'ordine:
 *
 * 1. **rete di casa**: l'indirizzo locale di quel PC risponde (la più veloce);
 * 2. **Tailscale**: un indirizzo 100.64/10 risponde;
 * 3. **WebRTC**: un collegamento diretto via Internet fra i due PC, aperto con
 *    l'RTCPeerConnection di Electron (niente moduli nativi da compilare). Per
 *    aprirlo i due PC si scambiano l'offerta e la risposta con file cifrati
 *    sul Drive, accanto ai battiti; i server STUN pubblici dicono a ognuno il
 *    suo indirizzo visto da fuori. Niente TURN: dietro due NAT «simmetrici»
 *    (alcune reti aziendali o mobili) non si apre, e si passa alla quarta;
 * 4. **cassetta via Drive**: lenta (mezzo minuto e più), e solo per leggere
 *    lo schermo e mandare un messaggio. Lo si dice chiaro nel riquadro.
 *
 * Qui le regole pure: quale indirizzo preferire fra quelli che rispondono,
 * cosa fare a ogni chiamata, come raccontare la strada, i nomi e le scadenze
 * dei file di segnalazione, le rotte che passano per il canale e per il
 * Drive, e lo schermo che viaggia nella cassetta.
 */

import { eIndirizzoTailscale } from './pc-remoto'

export type Strada = 'lan' | 'tailscale' | 'webrtc' | 'drive'

/** L'ordine dei tentativi, deciso da Nicholas: dalla più veloce alla più lenta. */
export const ORDINE_STRADE: readonly Strada[] = ['lan', 'tailscale', 'webrtc', 'drive']

/** Com'è il collegamento WebRTC verso un PC. */
export type StatoRtc = 'spento' | 'collegando' | 'aperto' | 'fallito'

/** La strada in uso verso un PC, come la mostra il riquadro. */
export type InfoStrada = {
  strada: Strada
  /** L'indirizzo, per la rete di casa e Tailscale. */
  indirizzo?: string
  /** Da quando si usa questa strada, ISO. */
  dal?: string
}

/** La strada diretta di un indirizzo: Tailscale (100.64/10) o rete di casa. */
export function stradaDiIndirizzo(indirizzo: string): 'lan' | 'tailscale' {
  return eIndirizzoTailscale(indirizzo) ? 'tailscale' : 'lan'
}

/**
 * Fra gli indirizzi che hanno risposto al bussare, quello da usare: prima la
 * rete di casa, poi Tailscale, rispettando l'ordine in cui sono arrivati
 * dentro lo stesso tipo. Il bussare va su tutti insieme, e Tailscale a volte
 * risponde prima della rete di casa: senza questa scelta si userebbe la
 * strada più lenta.
 */
export function indirizzoPreferito(rispondono: string[]): string | undefined {
  return rispondono.find((i) => stradaDiIndirizzo(i) === 'lan') ?? rispondono.find((i) => stradaDiIndirizzo(i) === 'tailscale')
}

/** Dopo un WebRTC fallito, quanto si aspetta prima di riprovarlo (intanto vale il Drive). */
export const RIPROVA_RTC_DOPO_MS = 2 * 60_000
/** Usando WebRTC o il Drive, ogni quanto si ribussa direttamente: se quel PC torna in rete di casa, si torna alla strada veloce. */
export const RIBUSSA_OGNI_MS = 30_000

/**
 * Cosa fare a una chiamata verso un altro PC, dopo il bussare diretto.
 *
 * `mossa`:
 * - `http`: un indirizzo diretto (rete di casa o Tailscale) risponde;
 * - `rtc`: il canale WebRTC è aperto;
 * - `aspetta-rtc`: il WebRTC si sta aprendo (il riquadro dice «mi collego»);
 * - `drive`: il WebRTC non si apre (o non c'è), resta la cassetta sul Drive;
 * - `errore`: nessuna strada; il motivo lo dice il bussare.
 *
 * `avviaRtc`: aprire adesso il WebRTC, in sottofondo. Dopo un WebRTC fallito
 * lo si riprova ogni due minuti, e intanto si usa il Drive: chi guarda non
 * resta senza schermo mentre si ritenta.
 */
export type Mossa = 'http' | 'rtc' | 'aspetta-rtc' | 'drive' | 'errore'

export function prossimaMossa(p: {
  /** Un indirizzo diretto ha risposto (adesso o l'ultima volta). */
  diretta: boolean
  /** Il bussare ha trovato quel PC, ma lui non riconosce la chiave (401): nessuna strada aiuta. */
  chiaveRifiutata?: boolean
  /** C'è un modo di aprire il WebRTC (il ponte, il Drive per la segnalazione, la cassaforte). */
  rtcPossibile: boolean
  rtc: StatoRtc
  /** Quando è fallito l'ultimo WebRTC, ms. */
  rtcFallitoIl?: number
  /** La cassetta è usabile: Drive collegato e cassaforte aperta. */
  drivePossibile: boolean
  adesso: number
}): { mossa: Mossa; avviaRtc: boolean } {
  if (p.diretta) return { mossa: 'http', avviaRtc: false }
  if (p.chiaveRifiutata === true) return { mossa: 'errore', avviaRtc: false }
  const riserva: Mossa = p.drivePossibile ? 'drive' : 'errore'
  if (!p.rtcPossibile) return { mossa: riserva, avviaRtc: false }
  if (p.rtc === 'aperto') return { mossa: 'rtc', avviaRtc: false }
  const giaFallito = p.rtcFallitoIl !== undefined
  if (p.rtc === 'collegando') return { mossa: giaFallito && p.drivePossibile ? 'drive' : 'aspetta-rtc', avviaRtc: false }
  if (p.rtc === 'spento') return { mossa: giaFallito && p.drivePossibile ? 'drive' : 'aspetta-rtc', avviaRtc: true }
  // Fallito: si riprova dopo un po'; nel frattempo, il Drive.
  const riprova = p.rtcFallitoIl === undefined || p.adesso - p.rtcFallitoIl >= RIPROVA_RTC_DOPO_MS
  return { mossa: riprova && !p.drivePossibile ? 'aspetta-rtc' : riserva, avviaRtc: riprova }
}

/** La strada in due parole, per il telefono e la pagina («SU LAPTOP · Tailscale»). */
export function stradaBreve(s: Strada): string {
  return s === 'lan' ? 'rete di casa' : s === 'tailscale' ? 'Tailscale' : s === 'webrtc' ? 'WebRTC' : 'Drive, lento'
}

/**
 * Come si racconta la strada nel riquadro: una parola breve per la testata,
 * una frase per chi passa sopra con il mouse, e se è lenta.
 */
export function etichettaStrada(s: InfoStrada | undefined, nomePc: string): { breve: string; testo: string; lento: boolean } | undefined {
  if (s === undefined) return undefined
  if (s.strada === 'lan') {
    return {
      breve: `rete di casa${s.indirizzo !== undefined ? ` · ${s.indirizzo}` : ''}`,
      testo: `Collegato a ${nomePc} sulla rete di casa${s.indirizzo !== undefined ? ` (${s.indirizzo})` : ''}: la strada più veloce.`,
      lento: false
    }
  }
  if (s.strada === 'tailscale') {
    return {
      breve: `Tailscale${s.indirizzo !== undefined ? ` · ${s.indirizzo}` : ''}`,
      testo: `Collegato a ${nomePc} via Tailscale${s.indirizzo !== undefined ? ` (${s.indirizzo})` : ''}: la rete di casa non risponde, la rete privata di Tailscale sì.`,
      lento: false
    }
  }
  if (s.strada === 'webrtc') {
    return {
      breve: 'diretto via Internet (WebRTC)',
      testo: `Collegato a ${nomePc} direttamente via Internet (WebRTC): né la rete di casa né Tailscale rispondono, e i due PC si sono trovati attraverso Internet. Il collegamento è cifrato due volte: dal WebRTC stesso e con la chiave di casa.`,
      lento: false
    }
  }
  return {
    breve: 'collegamento lento via Drive',
    testo: `Collegamento lento via Drive: ${nomePc} non si raggiunge né in rete di casa, né con Tailscale, né direttamente via Internet. Lo schermo arriva attraverso il Drive e si aggiorna ogni mezzo minuto circa; si può solo leggere e mandare un messaggio, che ${nomePc} consegna al suo prossimo giro.`,
    lento: true
  }
}

/* ------------------------------------------------------------------ */
/* La segnalazione via Drive: offerta e risposta.                      */
/* ------------------------------------------------------------------ */

/**
 * I file della segnalazione, nella stessa scatola cifrata dei battiti.
 * L'offerta la scrive chi chiama, per chi risponde; la risposta il contrario.
 * Un file per coppia e per verso: due PC che chiamano insieme non si pestano.
 */
export function nomeOffertaRtc(verso: string, da: string): string { return `rtc-offerta-${verso}-${da}` }
export function nomeRispostaRtc(verso: string, da: string): string { return `rtc-risposta-${verso}-${da}` }

/** Un'offerta più vecchia di così non si accetta: chi l'ha scritta ha già smesso di aspettare. */
export const OFFERTA_RTC_SCADE_MS = 90_000
/** Chi chiama aspetta la risposta sul Drive al massimo tanto. */
export const ATTESA_RISPOSTA_RTC_MS = 75_000
/** Ogni quanto chi chiama rilegge il Drive cercando la risposta. */
export const RILEGGI_RISPOSTA_RTC_MS = 3000
/** Ogni quanto ogni PC guarda se qualcuno gli ha lasciato un'offerta. */
export const CERCA_OFFERTE_OGNI_MS = 10_000
/** Dopo la risposta, quanto si aspetta che il canale si apra davvero. */
export const APERTURA_CANALE_MS = 20_000
/** Un canale senza richieste per tanto si chiude: il prossimo uso lo riapre. */
export const CANALE_INATTIVO_MS = 10 * 60_000
/** Quanto si aspetta la risposta a una richiesta sul canale. */
export const RICHIESTA_RTC_MS = 15_000

/**
 * I server STUN pubblici: dicono a ogni PC il suo indirizzo visto da
 * Internet. Non passa niente da loro, solo la domanda «come mi vedi?».
 */
export const SERVER_STUN: readonly string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478'
]

/** Il file di segnalazione, com'è sul Drive: la descrizione SDP è cifrata con la chiave di casa. */
export type SegnaleRtc = {
  /** Il giro di collegamento: offerta e risposta lo ripetono uguale. */
  giro: string
  da: string
  daNome: string
  verso: string
  creatoIl: string
  /** La descrizione SDP (con i candidati), cifrata con la chiave di casa. */
  sdp: string
}

/** Un segnale letto dal Drive: buono solo se ha la forma giusta, è per me ed è fresco. */
export function segnaleValido(x: unknown, p: { io: string; da?: string; giro?: string; adesso: number; scadeMs?: number }): SegnaleRtc | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const s = x as Partial<Record<keyof SegnaleRtc, unknown>>
  if (typeof s.giro !== 'string' || typeof s.da !== 'string' || typeof s.verso !== 'string' || typeof s.sdp !== 'string' || typeof s.creatoIl !== 'string') return undefined
  if (s.verso !== p.io) return undefined
  if (p.da !== undefined && s.da !== p.da) return undefined
  if (p.giro !== undefined && s.giro !== p.giro) return undefined
  const t = Date.parse(s.creatoIl)
  if (Number.isNaN(t) || p.adesso - t > (p.scadeMs ?? OFFERTA_RTC_SCADE_MS)) return undefined
  return { giro: s.giro, da: s.da, daNome: typeof s.daNome === 'string' ? s.daNome : '', verso: s.verso, creatoIl: s.creatoIl, sdp: s.sdp }
}

/* ------------------------------------------------------------------ */
/* Le rotte.                                                           */
/* ------------------------------------------------------------------ */

/**
 * Le rotte che un altro PC può chiamare sul canale WebRTC: le stesse del
 * riquadro remoto, e nient'altro. Sulla rete di casa la chiave di casa apre
 * tutte le rotte del Client; da Internet si tiene la porta più stretta.
 */
export const ROTTE_VIA_CANALE: readonly string[] = [
  '/api/pc', '/api/stato', '/api/storia', '/api/scrivi', '/api/scegli', '/api/sessioni/riprendi', '/api/apri',
  // «Sposta progetto» (0.42.0): anche fra due PC su reti diverse.
  '/api/sposta/pronto', '/api/sposta/ricevi', '/api/sposta/verifica',
  // Il PIN delle chat (0.49.0): lo verifica il PC di casa della chat.
  '/api/pin/sblocca',
  // I file dal telefono attraverso il ponte (0.50.0): a pezzi da 96 KB, che stanno in un messaggio.
  '/api/allegati/inizia', '/api/allegati/pezzo', '/api/allegati/stato', '/api/allegati/fine', '/api/allegati/annulla',
  // Le case delle chat (0.52.0, «Ospitata da»): la scelta arriva subito agli altri PC.
  '/api/case',
  // La sezione File del telefono attraverso il ponte (0.54.0): pezzi da 96 KB, come gli allegati.
  '/api/file/progetti', '/api/file/elenco', '/api/file/leggi',
  '/api/consegne', '/api/consegne/pezzo', '/api/consegne/ricevuta',
  // Gestire quel PC dal telefono attraverso il ponte (0.55.0): le stesse di ROTTE_PONTE.
  '/api/workspace', '/api/workspace/crea', '/api/workspace/elimina', '/api/workspace/rinomina',
  '/api/chat/chiudi', '/api/chat/dormi', '/api/chat/sveglia', '/api/chat/sposta', '/api/chat/nome',
  '/api/autopilota/archivia', '/api/pin/proteggi', '/api/chat/ospite', '/api/modelli',
  '/api/sfoglia', '/api/cartelle', '/api/sessioni',
  '/api/autopilota', '/api/autopilota/crea', '/api/autopilota/ferma', '/api/autopilota/riprendi', '/api/autopilota/vai',
  '/api/autopilota/elimina', '/api/autopilota/riavvio', '/api/autopilota/dialogo', '/api/autopilota/file', '/api/autopilota/diff',
  '/api/autopilota/istruzioni', '/api/autopilota/correggi', '/api/quaderno', '/api/quaderno/scheda'
]

export function rottaPermessaSulCanale(percorso: string): boolean {
  return ROTTE_VIA_CANALE.includes(percorso.split('?')[0] ?? '')
}

/** Le rotte che la cassetta via Drive sa imitare: leggere lo schermo e mandare un messaggio. */
export const ROTTE_VIA_DRIVE: readonly string[] = ['/api/pc', '/api/stato', '/api/storia', '/api/scrivi']

/** Cosa si dice quando si chiede alla cassetta una cosa che non sa fare. */
export function nonViaDrive(percorso: string, nomePc: string): string {
  const cosa = percorso === '/api/scegli' ? 'premere un’opzione'
    : percorso === '/api/sessioni/riprendi' ? 'riaprire una chat'
    : percorso === '/api/apri' ? 'aprire una chat nuova'
    : percorso.startsWith('/api/allegati/') ? 'mandare un file'
    : percorso.startsWith('/api/file/') ? 'sfogliare i file dei progetti'
    : percorso.startsWith('/api/consegne') ? 'ricevere i file mandati al telefono'
    : 'fare questa operazione'
  return `Con il collegamento lento via Drive non si può ${cosa} su ${nomePc}: si può solo leggere lo schermo e mandare un messaggio. Per il resto serve una strada diretta (rete di casa, Tailscale o WebRTC), oppure lascia un’azione nella cassetta.`
}

/* ------------------------------------------------------------------ */
/* Il canale: i messaggi.                                              */
/* ------------------------------------------------------------------ */

/** Un messaggio sul canale, prima della cifratura. `n` cresce sempre: un messaggio ripetuto si scarta. */
export type MessaggioCanale =
  | { n: number; tipo: 'ciao'; pc: string; nome: string }
  | { n: number; tipo: 'chiedi'; id: string; percorso: string; corpo?: unknown; visore?: string }
  | { n: number; tipo: 'risposta'; id: string; stato: number; corpo: unknown }

export function leggiMessaggioCanale(x: unknown): MessaggioCanale | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const m = x as Record<string, unknown>
  if (typeof m.n !== 'number' || !Number.isInteger(m.n) || m.n < 0) return undefined
  if (m.tipo === 'ciao' && typeof m.pc === 'string') return { n: m.n, tipo: 'ciao', pc: m.pc, nome: typeof m.nome === 'string' ? m.nome : '' }
  if (m.tipo === 'chiedi' && typeof m.id === 'string' && typeof m.percorso === 'string') {
    return {
      n: m.n, tipo: 'chiedi', id: m.id, percorso: m.percorso,
      ...(m.corpo !== undefined ? { corpo: m.corpo } : {}),
      // Chi guarda (0.49.1), per il PIN delle chat: dentro il messaggio sigillato.
      ...(typeof m.visore === 'string' && /^[\w:@.-]{1,160}$/.test(m.visore) ? { visore: m.visore } : {})
    }
  }
  if (m.tipo === 'risposta' && typeof m.id === 'string' && typeof m.stato === 'number') return { n: m.n, tipo: 'risposta', id: m.id, stato: m.stato, corpo: m.corpo }
  return undefined
}

/* ------------------------------------------------------------------ */
/* La cassetta via Drive: lo schermo che viaggia.                      */
/* ------------------------------------------------------------------ */

/** Chi vuole lo schermo di un PC via Drive lo chiede qui; quel PC lo scrive in `schermo-<id>`. */
export function nomeRichiestaSchermo(pcId: string): string { return `schermo-chiesto-${pcId}` }
export function nomeSchermo(pcId: string): string { return `schermo-${pcId}` }

/** Una richiesta di schermo vale tanto: poi quel PC smette di scriverlo. */
export const RICHIESTA_SCHERMO_VALE_MS = 3 * 60_000
/** Chi guarda rinnova la richiesta al massimo ogni tanto: ogni scrittura sul Drive costa. */
export const RINNOVA_RICHIESTA_OGNI_MS = 60_000
/** Uno schermo più vecchio di così non si mostra come «adesso». */
export const SCHERMO_VECCHIO_MS = 3 * 60_000
/** Quante chat e quante righe per chat viaggiano: lo schermo, non tutta la storia. */
export const SCHERMO_CHAT_MAX = 8
export const SCHERMO_RIGHE = 80

export type RichiestaSchermo = { da: string; daNome: string; il: string }

export type ChatNelloSchermo = {
  id: string
  sessione?: string
  titolo: string
  cwd: string
  aspetta?: boolean
  viva?: boolean
  righe: string[]
  grezze: string[]
  totale: number
}

export type SchermoPc = { scritto: string; nome: string; chat: ChatNelloSchermo[] }

export function richiestaSchermoViva(x: unknown, adesso: number): RichiestaSchermo | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const r = x as Partial<Record<keyof RichiestaSchermo, unknown>>
  if (typeof r.da !== 'string' || typeof r.il !== 'string') return undefined
  const t = Date.parse(r.il)
  if (Number.isNaN(t) || adesso - t > RICHIESTA_SCHERMO_VALE_MS) return undefined
  return { da: r.da, daNome: typeof r.daNome === 'string' ? r.daNome : '', il: r.il }
}

/** Lo schermo come si scrive sul Drive: poche chat, poche righe. */
export function schermoDaScrivere(p: { nome: string; adesso: number; chat: ChatNelloSchermo[] }): SchermoPc {
  return {
    scritto: new Date(p.adesso).toISOString(),
    nome: p.nome,
    chat: p.chat.slice(0, SCHERMO_CHAT_MAX).map((c) => ({
      ...c,
      righe: c.righe.slice(-SCHERMO_RIGHE),
      grezze: c.grezze.slice(-SCHERMO_RIGHE)
    }))
  }
}

export function leggiSchermo(x: unknown): SchermoPc | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const s = x as { scritto?: unknown; nome?: unknown; chat?: unknown }
  if (typeof s.scritto !== 'string' || !Array.isArray(s.chat)) return undefined
  const chat: ChatNelloSchermo[] = []
  for (const c of s.chat as unknown[]) {
    if (typeof c !== 'object' || c === null) continue
    const q = c as Record<string, unknown>
    if (typeof q.id !== 'string' || typeof q.cwd !== 'string') continue
    const righe = Array.isArray(q.righe) ? q.righe.filter((r): r is string => typeof r === 'string') : []
    const grezze = Array.isArray(q.grezze) ? q.grezze.filter((r): r is string => typeof r === 'string') : righe
    chat.push({
      id: q.id, cwd: q.cwd, titolo: typeof q.titolo === 'string' ? q.titolo : q.cwd,
      ...(typeof q.sessione === 'string' ? { sessione: q.sessione } : {}),
      ...(typeof q.aspetta === 'boolean' ? { aspetta: q.aspetta } : {}),
      ...(typeof q.viva === 'boolean' ? { viva: q.viva } : {}),
      righe, grezze, totale: typeof q.totale === 'number' ? q.totale : righe.length
    })
  }
  return { scritto: s.scritto, nome: typeof s.nome === 'string' ? s.nome : '', chat }
}

/** Le chat dello schermo come le darebbe `/api/stato` di quel PC. */
export function statoDaSchermo(s: SchermoPc): { chat: { id: string; sessione?: string; titolo: string; cwd: string; aspetta?: boolean; viva?: boolean }[]; computer: { nome: string } } {
  return {
    chat: s.chat.map(({ righe: _r, grezze: _g, totale: _t, ...c }) => c),
    computer: { nome: s.nome }
  }
}

/**
 * Lo schermo di una chat come lo darebbe `/api/storia` di quel PC, più quando
 * è stato scritto (il riquadro dice «schermo delle 10:31»). `undefined` se
 * quella chat non c'è.
 */
export function storiaDaSchermo(s: SchermoPc, chat: string): { chat: string; totale: number; da: number; righe: string[]; grezze: string[]; scritto: string } | undefined {
  const c = s.chat.find((x) => x.id === chat)
  if (c === undefined) return undefined
  return { chat: c.id, totale: c.totale, da: Math.max(0, c.totale - c.righe.length), righe: c.righe, grezze: c.grezze, scritto: s.scritto }
}
