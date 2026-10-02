/**
 * Trovare gli altri PC **senza il Drive** (0.39.3).
 *
 * Nicholas (02/10): «con i PC tutti accesi, una chat aperta sull'altro PC dà
 * errori e non si può scrivere; e non si capisce quando una chat è remota».
 *
 * La causa, sui dati veri:
 * - su questo PC e sul portatile il Drive è scollegato dal 23/09: Google ha
 *   risposto `invalid_grant` al rinnovo e il token è stato scartato;
 * - i battiti passano solo dal Drive, e in `pc-altrui.json` quello del
 *   LAPTOP è fermo al 23/09 alle 03:34;
 * - il Core lo dava «spento» senza nemmeno bussare, ma il portatile era
 *   acceso e rispondeva subito: sulla rete locale (192.168.1.177) e su
 *   Tailscale, con un indirizzo **nuovo** (100.117.177.78, mentre il
 *   battito diceva ancora 100.72.165.79).
 *
 * Qui le regole pure:
 * - quali indirizzi provare: quello che ha risposto, quelli ricordati, quelli
 *   che Tailscale dà adesso per il nome del PC, quelli del battito;
 * - com'è il PC dopo il bussare, **mai «spento»** quando i dati sono vecchi:
 *   «non so se è acceso»;
 * - il motivo vero di un errore del riquadro remoto;
 * - la banda del Drive scollegato.
 */

/** Com'è andato un bussare breve a quel PC, su tutti i suoi indirizzi insieme. */
export type PingPc =
  | { esito: 'risponde'; indirizzo: string }
  /** Risponde, ma non riconosce la chiave di casa (401). */
  | { esito: 'chiave'; indirizzo: string }
  /** Risponde, ma rifiuta chi arriva da fuori la sua rete (403). */
  | { esito: 'rifiutato'; indirizzo: string }
  /** Nessun indirizzo ha risposto. */
  | { esito: 'muto'; provati: string[] }
  /** Non c'è nessun indirizzo da provare. */
  | { esito: 'senza-indirizzi' }

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/

/** Un indirizzo che vale la pena provare: IPv4, e non un link-local (169.254), che non porta da nessuna parte. */
export function indirizzoUtile(ind: string): boolean {
  const m = IPV4.exec(ind.trim())
  if (m === null) return false
  return !(m[1] === '169' && m[2] === '254') && m[1] !== '0'
}

/**
 * Gli indirizzi Tailscale di un PC, da `tailscale status --json`, cercato per
 * nome. Il nome del PC nel battito è il nome di Windows, lo stesso che
 * Tailscale chiama `HostName`. Le maiuscole non contano.
 */
export function indirizziTailscaleDi(status: unknown, nomePc: string): { indirizzi: string[]; online?: boolean } {
  if (typeof status !== 'object' || status === null || nomePc.trim() === '') return { indirizzi: [] }
  const peer = (status as { Peer?: unknown }).Peer
  if (typeof peer !== 'object' || peer === null) return { indirizzi: [] }
  const chi = nomePc.trim().toLowerCase()
  for (const p of Object.values(peer as Record<string, unknown>)) {
    if (typeof p !== 'object' || p === null) continue
    const q = p as { HostName?: unknown; TailscaleIPs?: unknown; Online?: unknown }
    if (typeof q.HostName !== 'string' || q.HostName.trim().toLowerCase() !== chi) continue
    const ips = Array.isArray(q.TailscaleIPs) ? q.TailscaleIPs.filter((x): x is string => typeof x === 'string' && indirizzoUtile(x)) : []
    return { indirizzi: ips, ...(typeof q.Online === 'boolean' ? { online: q.Online } : {}) }
  }
  return { indirizzi: [] }
}

/**
 * In che ordine bussare, senza doppioni e senza indirizzi inutili:
 * 1. quello che ha risposto l'ultima volta;
 * 2. quelli che hanno risposto in passato (ricordati su disco, valgono anche
 *    senza Drive);
 * 3. quelli che Tailscale dà **adesso** per quel nome (cambiano: il battito
 *    del 23/09 ne aveva uno superato);
 * 4. quelli del battito.
 * Il bussare li prova tutti insieme, quindi l'ordine conta solo per dire
 * quale ha risposto quando ne rispondono due.
 */
export function indirizziDaProvare(p: { buono?: string; ricordati?: string[]; tailscale?: string[]; battito?: string[] }): string[] {
  const fuori: string[] = []
  for (const ind of [p.buono ?? '', ...(p.ricordati ?? []), ...(p.tailscale ?? []), ...(p.battito ?? [])]) {
    const i = ind.trim()
    if (indirizzoUtile(i) && !fuori.includes(i)) fuori.push(i)
  }
  return fuori
}

/** Lo stato di quel PC come lo dicono il riquadro e il riquadro d'attesa. */
export type StatoPc = {
  stato: 'acceso' | 'non-so' | 'irraggiungibile' | 'chiave' | 'rifiutato' | 'senza-indirizzi'
  titolo: string
  cosaFare: string
}

function quando(iso: string | undefined): string {
  if (iso === undefined || iso === '') return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Com'e' quel PC, dopo il bussare. La regola di Nicholas: **mai «spento»**
 * quando non lo si sa. Se il battito e' vecchio e nessun indirizzo risponde,
 * il PC puo' essere spento, su un'altra rete, o con il firewall chiuso: si dice
 * «non so se e' acceso» e cosa fare.
 */
export function statoPc(p: {
  nome: string
  ping: PingPc | undefined
  /** Il battito sul Drive e' recente (meno di 5 minuti). */
  battitoVivo: boolean
  ultimoSegno?: string
  /** Il Drive di questo PC e' collegato: senza, i battiti non arrivano piu'. */
  driveCollegato: boolean
  porta: number
}): StatoPc {
  const n = p.nome
  const ping = p.ping
  if (ping?.esito === 'risponde') return { stato: 'acceso', titolo: `${n} è acceso e risponde`, cosaFare: '' }
  if (ping?.esito === 'chiave') {
    return {
      stato: 'chiave',
      titolo: `${n} risponde ma non riconosce la chiave`,
      cosaFare: `Su ${n} la cassaforte è chiusa (aprila là: Account → Cassaforte), oppure i due PC hanno due cassaforti diverse: la chiave si ricava dalla stessa passphrase, deve essere la stessa da tutte e due le parti.`
    }
  }
  if (ping?.esito === 'rifiutato') {
    return {
      stato: 'rifiutato',
      titolo: `${n} risponde ma rifiuta questo indirizzo`,
      cosaFare: `Per ${n} arriviamo da fuori la sua rete locale. Su quel PC, in Impostazioni → Client, accendi «accetta anche da fuori la rete locale», oppure usate la stessa rete o Tailscale su tutti e due.`
    }
  }
  const segno = quando(p.ultimoSegno)
  const perche = p.driveCollegato
    ? (segno !== '' ? `l’ultimo segno sul Drive è del ${segno}` : 'sul Drive non ha mai lasciato un segno')
    : `il Drive di questo PC è scollegato, quindi i segni di vita degli altri PC non arrivano più${segno !== '' ? ` (l’ultimo che ho è del ${segno})` : ''}`
  if (ping === undefined || ping.esito === 'senza-indirizzi') {
    return {
      stato: 'senza-indirizzi',
      titolo: p.battitoVivo ? `${n} è acceso, ma non so a che indirizzo bussare` : `Non so se ${n} è acceso, e non so a che indirizzo bussare`,
      cosaFare: `Non ho nessun indirizzo di ${n}: né dal suo battito, né da Tailscale (nessun PC con quel nome), né da una volta in cui ha risposto. Su ${n} apri SierraDeck con il Drive collegato (lascia il suo indirizzo nel battito), oppure accendi Tailscale su tutti e due i PC con lo stesso account.`
    }
  }
  const provati = ping.provati.join(', ')
  if (p.battitoVivo) {
    return {
      stato: 'irraggiungibile',
      titolo: `${n} è acceso ma non risponde`,
      cosaFare: `Secondo il Drive è acceso, ma nessuno dei suoi indirizzi risponde sulla porta ${p.porta} (${provati}). O è su un’altra rete (a casa uno e in ufficio l’altro: serve Tailscale acceso su tutti e due), o il firewall di Windows su quel PC blocca la porta ${p.porta}.`
    }
  }
  return {
    stato: 'non-so',
    titolo: `Non so se ${n} è acceso`,
    cosaFare: `Non ne ho notizie recenti: ${perche}. Ho bussato a tutti i suoi indirizzi (${provati}) e nessuno ha risposto: può essere spento, su un’altra rete, o con il firewall che chiude la porta ${p.porta}. Accendilo o controllalo; se è acceso, attiva Tailscale su tutti e due i PC. Questo riquadro riprova da solo.${p.driveCollegato ? '' : ' E ricollega il Drive (Account → Drive → Collega): senza, gli altri PC non si vedono.'}`
  }
}

/** Il motivo vero di una risposta di quel PC (`undefined` = andata bene). */
export function motivoDaStatoHttp(stato: number): 'chiave' | 'rifiutato' | 'chat' | 'pin' | 'http' | undefined {
  if (stato >= 200 && stato < 300) return undefined
  // 423 (0.49.0): la chat là è protetta dal PIN e non è aperta per questo PC.
  if (stato === 423) return 'pin'
  if (stato === 401) return 'chiave'
  if (stato === 403) return 'rifiutato'
  if (stato === 404) return 'chat'
  return 'http'
}

/**
 * Il messaggio di un errore del riquadro remoto, con il motivo vero (0.39.3):
 * prima ogni errore diventava «non risponde» o «è spento», anche quando quel
 * PC rispondeva e diceva un'altra cosa.
 */
export function messaggioErroreRemoto(motivo: string, nome: string, dettaglio?: string): string {
  switch (motivo) {
    case 'chat':
      return `${nome} risponde, ma questa chat là non è aperta (è stata chiusa, o non c’è più)${dettaglio !== undefined && dettaglio !== '' ? `: «${dettaglio}»` : ''}. Puoi chiedergli di riaprirla da qui.`
    case 'chiave':
      return statoPc({ nome, ping: { esito: 'chiave', indirizzo: '' }, battitoVivo: true, driveCollegato: true, porta: 0 }).cosaFare
    case 'rifiutato':
      return statoPc({ nome, ping: { esito: 'rifiutato', indirizzo: '' }, battitoVivo: true, driveCollegato: true, porta: 0 }).cosaFare
    case 'pin':
      return `Questa chat su ${nome} è protetta dal PIN: inseriscilo qui per vederla e scriverle. Lo controlla ${nome}, e si richiude dopo il tempo di inattività impostato là.`
    case 'cassaforte':
      return 'La cassaforte di questo PC è chiusa: la chiave per bussare a un altro PC si ricava da lì. Sbloccala (Account → Cassaforte) e riprova.'
    case 'http':
      return `${nome} risponde con un errore${dettaglio !== undefined && dettaglio !== '' ? `: «${dettaglio}»` : ''}.`
    default:
      return dettaglio ?? `${nome} non risponde.`
  }
}

// ─── il Drive scollegato ───

/** Quando e perche' il Drive di questo PC si e' scollegato (`drive-scollegato.json`). */
export type Scollegamento = {
  quando: string
  /** `revocata`: Google ha risposto `invalid_grant` al rinnovo; `a-mano`: «Scollega» dal pannello. */
  motivo: 'revocata' | 'a-mano' | 'sconosciuto'
}

export function leggiScollegamento(grezzo: unknown): Scollegamento | undefined {
  if (typeof grezzo !== 'object' || grezzo === null) return undefined
  const o = grezzo as Record<string, unknown>
  if (typeof o.quando !== 'string' || Number.isNaN(Date.parse(o.quando))) return undefined
  return { quando: o.quando, motivo: o.motivo === 'revocata' || o.motivo === 'a-mano' ? o.motivo : 'sconosciuto' }
}

/**
 * Per i PC che si sono scollegati **prima** della 0.39.3, quando il momento
 * non si scriveva: la prima riga del registro che lo dice.
 * - «Google non riconosce più l'autorizzazione» e' il rifiuto di Google
 *   (`invalid_grant`);
 * - «manca l'autorizzazione» vuol dire che il token non c'e' gia' piu'.
 * Si passano i file del registro dal piu' vecchio: vince la prima riga trovata.
 */
export function scollegamentoDalRegistro(testi: string[]): Scollegamento | undefined {
  for (const testo of testi) {
    for (const riga of testo.split(/\r?\n/)) {
      const revocata = riga.includes('Google non riconosce più l’autorizzazione')
      if (!revocata && !riga.includes('Google Drive non connesso: manca l’autorizzazione')) continue
      const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(riga)
      if (m === null) continue
      return { quando: m[1] as string, motivo: revocata ? 'revocata' : 'sconosciuto' }
    }
  }
  return undefined
}

/** La banda fissa del Drive scollegato, uguale su PC, pagina e app. */
export type AvvisoDrive = { titolo: string; testo: string; giorni?: number }

/**
 * La banda del Drive scollegato (0.39.3). C'e' finche' il Drive e' configurato
 * ma non collegato, e non si chiude: senza Drive gli altri PC non si vedono,
 * le chat non si salvano e le cassette non partono.
 */
export function avvisoDriveScollegato(p: { configurato: boolean; connesso: boolean; dal?: Scollegamento; adesso: number }): AvvisoDrive | undefined {
  if (!p.configurato || p.connesso) return undefined
  const t = p.dal !== undefined ? Date.parse(p.dal.quando) : Number.NaN
  const giorni = Number.isNaN(t) ? undefined : Math.max(0, Math.floor((p.adesso - t) / 86_400_000))
  const da = giorni === undefined ? '' : giorni === 0 ? ' da oggi' : giorni === 1 ? ' da 1 giorno' : ` da ${giorni} giorni`
  const data = Number.isNaN(t) ? '' : new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
  const perche = p.dal?.motivo === 'revocata'
    ? `Il ${data} Google ha rifiutato l’autorizzazione di SierraDeck al tuo Drive (risposta «invalid_grant» al rinnovo): non è un guasto di questo PC, è Google che non riconosce più il collegamento. Succede se l’accesso è stato revocato dall’account Google, se è cambiata la password, o se il collegamento era stato fatto mentre l’app era in prova.`
    : p.dal?.motivo === 'a-mano'
      ? `Il ${data} il Drive è stato scollegato da qui («Scollega» nel pannello Account).`
      : data !== ''
      ? `Dal ${data} il Drive di questo PC non ha più l’autorizzazione.`
      : 'Il Drive di questo PC non ha l’autorizzazione.'
  return {
    titolo: `Drive scollegato${da}: gli altri PC non si vedono`,
    testo: `${perche} Senza Drive: i segni di vita degli altri PC non arrivano (le loro chat possono sembrare spente anche se sono accese: SierraDeck prova lo stesso a bussare direttamente), le chat di qui non si salvano, la cassetta «Scrivile là» non parte. Ricollegalo: Account → Drive → Collega, su ogni PC dove compare questa banda.`,
    ...(giorni !== undefined ? { giorni } : {})
  }
}
