/**
 * «Installa là» (0.46.0): aggiornare un altro PC dal pannello «Salute», con
 * le stesse strade delle chat dal vivo (rete di casa, Tailscale, WebRTC) e la
 * chiave di casa. Su quel PC le rotte ci sono gia' dalla 0.20 circa — sono le
 * stesse del telefono: `/api/aggiornamento` (lo stato), `/cerca`, `/scarica`,
 * `/note`, `/installa` — e l'installazione la' aspetta da sola la quiete
 * (le chat che finiscono il turno, il lavoro con il Drive). Qui c'e' solo chi
 * dirige: cosa chiedere, quando, e come dire com'e' andata.
 *
 * Un passo alla volta, ripetuto ogni pochi secondi: si guarda quel PC (la sua
 * versione e lo stato del suo aggiornamento, oppure «non risponde») e
 * `passoInstallaLa` dice cosa fare e cosa mostrare. Pura, per i test.
 */

/** Lo stato dell'aggiornamento di quel PC, come lo dà `/api/aggiornamento`. */
export type StatoAggiornamentoRemoto = {
  fase: string
  versione?: string
  percento?: number
  errore?: string
  chatOccupate?: number
  attesa?: string
  tentativoFallito?: { titolo: string; motivo: string; strade: string[]; pagina: string; versione?: string }
}

export type FaseInstallaLa =
  | 'cerco'      // si e' chiesto a quel PC di cercare la versione nuova
  | 'scarico'    // la sta scaricando
  | 'attendo'    // «Installa» chiesto: quel PC aspetta la quiete (chat, Drive)
  | 'installo'   // quel PC si e' chiuso per installare
  | 'riparte'    // non risponde: sta installando o ripartendo
  | 'fatto'      // e' tornato con la versione nuova
  | 'fallito'    // e' tornato con la versione di prima
  | 'errore'     // qualcosa si e' fermato prima di installare

export type AvanzamentoInstallaLa = {
  pcId: string
  nome: string
  fase: FaseInstallaLa
  /** La versione che aveva quando si e' premuto. */
  da: string
  /** Quella che si installa, quando la si sa. */
  a?: string
  /** Cosa sta succedendo, per esteso: la riga sotto la voce di quel PC. */
  messaggio: string
  /** Cosa fare, quando e' andata male. */
  cosaFare?: string
  /** La pagina della release, per l'installer a mano. */
  pagina?: string
  iniziato: string
  aggiornato: string
}

/** Cosa ha risposto quel PC a questo giro: `undefined` = non risponde. */
export type Osservazione = { versione?: string; stato?: StatoAggiornamentoRemoto } | undefined

export type Memoria = {
  /** «Cerca» gia' chiesto. */
  cercato: boolean
  /** «Scarica» gia' chiesto. */
  scaricato: boolean
  /** «Installa» gia' chiesto. */
  installato: boolean
  /** Da quando non risponde, dopo «Installa». */
  mutoDal?: number
  /** Da quando si e' premuto. */
  iniziato: number
}

export type Passo = {
  fase: FaseInstallaLa
  messaggio: string
  /** Cosa chiedere a quel PC adesso. */
  chiedi?: 'cerca' | 'scarica' | 'installa'
  /** Finito (bene o male): si smette di guardare. */
  finito?: true
  a?: string
  cosaFare?: string
  pagina?: string
}

/** Quanto si aspetta un PC che non torna dopo «Installa»: l'installer ci mette un minuto o due, la quiete puo' durare di piu' ma il PC risponde. */
export const RITORNO_ENTRO_MS = 12 * 60_000
/** Quanto si aspetta la ricerca e lo scaricamento, in tutto. */
export const PREPARAZIONE_ENTRO_MS = 20 * 60_000

function confronta(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Il passo di adesso. `da` e' la versione di quel PC quando si e' premuto,
 * `nome` il suo nome per i messaggi.
 */
export function passoInstallaLa(nome: string, da: string, o: Osservazione, m: Memoria, adesso: number): Passo {
  // ── Non risponde ──
  if (o === undefined) {
    if (!m.installato) {
      return adesso - m.iniziato > PREPARAZIONE_ENTRO_MS
        ? { fase: 'errore', finito: true, messaggio: `${nome} non risponde più e l’installazione non era ancora partita.`, cosaFare: `Guarda se ${nome} è acceso e ha SierraDeck aperto, poi riprova «Installa là».` }
        : { fase: 'riparte', messaggio: `${nome} non risponde in questo momento: riprovo fra pochi secondi.` }
    }
    const muto = m.mutoDal ?? adesso
    if (adesso - muto > RITORNO_ENTRO_MS) {
      return {
        fase: 'fallito', finito: true,
        messaggio: `${nome} si è chiuso per installare e dopo ${Math.round(RITORNO_ENTRO_MS / 60_000)} minuti non risponde ancora.`,
        cosaFare: `Guarda lo schermo di ${nome}: se SierraDeck non è ripartito, aprilo a mano. Al riavvio dirà da solo se l’installazione non è riuscita, e qui comparirà nella sua voce.`
      }
    }
    return { fase: 'riparte', messaggio: `${nome} si è chiuso per installare: aspetto che riparta (di solito uno o due minuti).` }
  }

  const ver = o.versione ?? da
  const s = o.stato

  // ── Tornato con una versione piu' nuova: fatto ──
  if (confronta(ver, da) > 0) {
    return { fase: 'fatto', finito: true, a: ver, messaggio: `${nome} è ripartito con la ${ver}. Fatto.` }
  }

  // ── Dopo «Installa» ──
  if (m.installato) {
    if (s?.fase === 'attendo') {
      const perche = s.attesa ?? (s.chatOccupate !== undefined && s.chatOccupate > 0 ? `${s.chatOccupate} chat stanno finendo il turno` : 'il lavoro in corso')
      return { fase: 'attendo', messaggio: `${nome} aspetta la quiete prima di chiudersi: ${perche}. Le chat là riprendono da sole dopo l’installazione.` }
    }
    if (s?.fase === 'installo') return { fase: 'installo', messaggio: `${nome} si sta chiudendo per installare.` }
    if (m.mutoDal !== undefined || s?.tentativoFallito !== undefined) {
      // E' tornato, con la versione di prima.
      const t = s?.tentativoFallito
      return {
        fase: 'fallito', finito: true,
        messaggio: t !== undefined ? `${t.titolo} ${t.motivo}` : `${nome} è ripartito, ma ha ancora la ${ver}: l’installazione non è riuscita.`,
        cosaFare: t !== undefined && t.strade.length > 0 ? t.strade.join(' ') : `Su ${nome} scarica l’installer a mano dalla pagina della versione e aprilo con un doppio clic.`,
        ...(t !== undefined ? { pagina: t.pagina } : {})
      }
    }
    if (s?.fase === 'errore') return { fase: 'errore', finito: true, messaggio: `${nome} non ha installato: ${s.errore ?? 'errore senza motivo'}.`, cosaFare: `Riprova fra qualche minuto; se si ripete, guarda il registro di ${nome}.` }
    if (s?.fase === 'pronto' && s.errore !== undefined) return { fase: 'errore', finito: true, messaggio: `${nome}: ${s.errore}`, cosaFare: `Chiudi e riapri SierraDeck su ${nome}, poi riprova «Installa là».` }
    return { fase: 'attendo', messaggio: `«Installa» chiesto a ${nome}: aspetto che si chiuda.` }
  }

  // ── Prima di «Installa»: cerca, scarica, poi installa ──
  if (adesso - m.iniziato > PREPARAZIONE_ENTRO_MS) {
    return { fase: 'errore', finito: true, messaggio: `Dopo ${Math.round(PREPARAZIONE_ENTRO_MS / 60_000)} minuti ${nome} non ha ancora l’aggiornamento pronto (è a «${s?.fase ?? '?'}»).`, cosaFare: `Riprova «Installa là»; se si ripete, su ${nome} premi «Cerca aggiornamenti» dal suo schermo.` }
  }
  switch (s?.fase) {
    case 'pronto':
      return { fase: 'attendo', chiedi: 'installa', ...(s.versione !== undefined ? { a: s.versione } : {}), messaggio: `La ${s.versione ?? 'nuova versione'} è pronta su ${nome}: chiedo di installarla. Prima aspetta che le chat là finiscano il turno.` }
    case 'disponibile':
      return m.scaricato
        ? { fase: 'scarico', ...(s.versione !== undefined ? { a: s.versione } : {}), messaggio: `${nome} comincia a scaricare la ${s.versione ?? 'nuova versione'}…` }
        : { fase: 'scarico', chiedi: 'scarica', ...(s.versione !== undefined ? { a: s.versione } : {}), messaggio: `${nome} ha trovato la ${s.versione ?? 'nuova versione'}: chiedo di scaricarla.` }
    case 'scarico':
      return { fase: 'scarico', ...(s.versione !== undefined ? { a: s.versione } : {}), messaggio: `${nome} scarica la ${s.versione ?? 'nuova versione'}${s.percento !== undefined ? `: ${Math.round(s.percento)}%` : '…'}` }
    case 'cerco':
      return { fase: 'cerco', messaggio: `${nome} cerca la versione nuova…` }
    case 'errore':
      if (m.cercato) return { fase: 'errore', finito: true, messaggio: `${nome} non è riuscito a preparare l’aggiornamento: ${s.errore ?? 'errore senza motivo'}.`, cosaFare: `Controlla che ${nome} sia collegato a Internet e riprova; se si ripete, scarica l’installer a mano dalla pagina delle versioni.` }
      return { fase: 'cerco', chiedi: 'cerca', messaggio: `Chiedo a ${nome} di cercare la versione nuova.` }
    case 'aggiornato':
      if (m.cercato) return { fase: 'errore', finito: true, messaggio: `${nome} dice di avere già l’ultima versione (${ver}).`, cosaFare: 'Se questo PC ha una versione più nuova, forse non è ancora uscita per tutti: riprova fra qualche minuto.' }
      return { fase: 'cerco', chiedi: 'cerca', messaggio: `Chiedo a ${nome} di cercare la versione nuova.` }
    case 'attendo':
    case 'installo':
      // Qualcuno l'ha gia' chiesto (lo schermo di quel PC, un telefono): si segue.
      return { fase: s.fase, messaggio: `${nome} sta già installando (chiesto da lì o da un telefono): seguo.` }
    default:
      return m.cercato
        ? { fase: 'cerco', messaggio: `${nome} cerca la versione nuova…` }
        : { fase: 'cerco', chiedi: 'cerca', messaggio: `Chiedo a ${nome} di cercare la versione nuova.` }
  }
}

/** Le fasi in cui si e' ancora al lavoro: il tasto non si ripropone. */
export function inCorso(a: AvanzamentoInstallaLa | undefined): boolean {
  return a !== undefined && a.fase !== 'fatto' && a.fase !== 'fallito' && a.fase !== 'errore'
}
