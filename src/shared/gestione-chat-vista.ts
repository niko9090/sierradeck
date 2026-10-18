/**
 * **Come si mostra la gestione delle chat** (0.79.0): le regole pure delle
 * finestre, uguali per il PC, la pagina del telefono e l'app (che le rifà in
 * `GestioneChat.kt` e le controlla sui casi scritti da
 * `tests/shared/gestione-chat-vista.test.ts`).
 *
 * Il motore (`./gestione-chat`) decide cosa si può fare e perché no; qui si
 * decide solo cosa leggere: l'ordine, la selezione, le conferme, i rifiuti.
 * Testi corti, la spiegazione dietro il «?» (regola del 12/10).
 *
 * Le conferme prendono il nome e lo spazio **già scritti** (`§N`, `§B` nella
 * pagina): così la pagina usa gli stessi testi senza rifare i calcoli.
 */
import { FRASE_SVUOTA, motivoNonChiude, RECUPERO_CHAT_GIORNI, type ChatArchiviata, type ChatInRecupero, type EsitoAzioni, type VistaSpazio, type VoceSpazio } from './gestione-chat'
import { byteLeggibili } from './spazio-drive'

export type Conferma = { titolo: string; testo: string; azione: string }

/** Come si ordina la vista «Spazio delle chat»: dalla più grande, o dalla meno usata. */
export type OrdineSpazio = 'spazio' | 'uso'

export const ORDINI_SPAZIO: readonly { id: OrdineSpazio; nome: string }[] = [
  { id: 'spazio', nome: 'Le più grandi' },
  { id: 'uso', nome: 'Le meno usate' }
]

const GIORNO_MS = 86_400_000

/** Le chat nell'ordine scelto. A parità, la più grande prima e poi l'id: l'ordine non salta fra un giro e l'altro. */
export function ordinaVoci(voci: readonly VoceSpazio[], ordine: OrdineSpazio): VoceSpazio[] {
  if (ordine === 'spazio') return [...voci].sort((a, b) => b.byte - a.byte || (a.ultimaAttivita ?? '').localeCompare(b.ultimaAttivita ?? '') || a.sessione.localeCompare(b.sessione))
  // Le mai usate (senza data) prima: sono le più vecchie che si conoscano.
  return [...voci].sort((a, b) => (a.ultimaAttivita ?? '').localeCompare(b.ultimaAttivita ?? '') || b.byte - a.byte || a.sessione.localeCompare(b.sessione))
}

/** Aggiunge o toglie una chat dalla scelta, mantenendo l'ordine in cui le hai scelte. */
export function commutaScelta(scelte: readonly string[], sessione: string): string[] {
  return scelte.includes(sessione) ? scelte.filter((s) => s !== sessione) : [...scelte, sessione]
}

/** «Scegli tutte»: solo quelle che si possono eliminare, le altre non servono a niente. */
export function scegliTutte(voci: readonly VoceSpazio[]): string[] {
  return voci.filter((v) => v.nonEliminabile === undefined).map((v) => v.sessione)
}

/** Le scelte che ci sono ancora (una chat eliminata o archiviata altrove esce da sola). */
export function scelteValide(scelte: readonly string[], voci: readonly VoceSpazio[]): string[] {
  const ci = new Set(voci.map((v) => v.sessione))
  return scelte.filter((s) => ci.has(s))
}

/** Da quanto non si usa: «oggi», «ieri», «3 giorni fa», «2 mesi fa», «mai». */
export function quandoUsata(iso: string | undefined, adesso: number): string {
  if (iso === undefined) return 'mai usata'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'mai usata'
  const giorni = Math.floor((adesso - t) / GIORNO_MS)
  if (giorni <= 0) return 'usata oggi'
  if (giorni === 1) return 'usata ieri'
  if (giorni < 60) return `usata ${giorni} giorni fa`
  if (giorni < 730) return `usata ${Math.floor(giorni / 30)} mesi fa`
  return `usata ${Math.floor(giorni / 365)} anni fa`
}

/**
 * La riga sotto il nome: lo spazio, da quanto, e una parola se è archiviata o
 * aperta. Senza lo spazio dove sta già in una colonna sua (il PC).
 */
export function rigaVoce(v: VoceSpazio, adesso: number, conSpazio = true): string {
  return [...(conSpazio ? [byteLeggibili(v.byte)] : []), quandoUsata(v.ultimaAttivita, adesso), ...(v.archiviata ? ['archiviata'] : []), ...(v.aperta ? ['aperta'] : [])].join(' · ')
}

/** La riga in cima alla vista. */
export function riepilogoSpazio(v: VistaSpazio): string {
  const quante = v.chat.length === 1 ? '1 chat' : `${v.chat.length} chat`
  return `${quante} · ${byteLeggibili(v.totale)} · si possono liberare ${byteLeggibili(v.eliminabili)}` +
    (v.recupero.chat > 0 ? ` · nel recupero ${v.recupero.chat === 1 ? '1 chat' : `${v.recupero.chat} chat`} (${byteLeggibili(v.recupero.byte)})` : '')
}

export type Selezione = { chat: number; byte: number; eliminabili: number; byteEliminabili: number; escluse: { sessione: string; motivo: string }[] }

/** La riga della scelta: quante, quanto spazio, quante non si possono eliminare. */
export function riepilogoSelezione(s: Selezione): string {
  if (s.chat === 0) return 'Nessuna chat scelta.'
  const quante = s.chat === 1 ? '1 chat scelta' : `${s.chat} chat scelte`
  const no = s.escluse.length === 0 ? '' : ` · ${s.escluse.length === 1 ? '1 non si può eliminare' : `${s.escluse.length} non si possono eliminare`}`
  return `${quante} · ${byteLeggibili(s.byte)}${no} · eliminandole liberi ${byteLeggibili(s.byteEliminabili)}`
}

/**
 * «Chiudi» spento con il motivo del PC: la chat non è aperta qui (la selezione
 * del PC 0.79.0 la mette in `chiuse`). Senza `chiuse` (un PC più vecchio) resta acceso.
 */
export function motivoNonChiudeScelta(s: { chiuse?: readonly string[] } | undefined, sessione: string, titolo: string): string | undefined {
  return s?.chiuse?.includes(sessione) === true ? motivoNonChiude({ sessione, titolo }) : undefined
}

/**
 * Le chat scelte che la conferma nomina: per Elimina solo quelle che si
 * possono eliminare (dal vero, c-75: «Eliminare 3 chat dal PC? Libera 643 KB»
 * con una delle tre governata, che restava dov'era). Le altre hanno già il
 * motivo nella loro riga.
 */
export function scelteDaConfermare(azione: 'archivia' | 'elimina', scelte: readonly string[], voci: readonly Pick<VoceSpazio, 'sessione' | 'nonEliminabile'>[]): string[] {
  if (azione !== 'elimina') return [...scelte]
  const no = new Set(voci.filter((v) => v.nonEliminabile !== undefined).map((v) => v.sessione))
  return scelte.filter((s) => !no.has(s))
}

/** Il nome di una o più chat nelle conferme: «x» oppure «3 chat». */
export function nomeScelte(titoli: readonly string[]): string {
  if (titoli.length === 1) return `«${titoli[0] ?? ''}»`
  return `${titoli.length} chat`
}

/* ------------------------------------------------------------------ */
/* Le conferme.                                                        */
/* ------------------------------------------------------------------ */

export function confermaChiudiChat(nome: string): Conferma {
  return { titolo: `Chiudere ${nome}?`, testo: 'Si ferma. La conversazione resta e la riprendi quando vuoi.', azione: 'Chiudi' }
}

/** `quante` > 1: i verbi al plurale (giro dal vero del 17/10: «2 chat … resta nel recupero»). */
export function confermaArchiviaChat(nome: string, quante = 1): Conferma {
  return {
    titolo: `Archiviare ${nome}?`,
    testo: quante > 1 ? 'Escono dagli elenchi, ma non si cancella niente: le ritrovi in «Archiviate».' : 'Esce dagli elenchi, ma non si cancella niente: la ritrovi in «Archiviate».',
    azione: 'Archivia'
  }
}

/** Elimina dal PC: lo spazio che libera e, se scelto, anche il Drive. */
export function confermaEliminaChat(nome: string, spazio: string, ancheDalDrive: boolean, quante = 1): Conferma {
  const piu = quante > 1
  return {
    titolo: `Eliminare ${nome} dal PC?`,
    testo: `Libera ${spazio}. Per ${RECUPERO_CHAT_GIORNI} giorni ${piu ? 'restano nel recupero e le rimetti' : 'resta nel recupero e la rimetti'} con «Ripristina».` +
      (ancheDalDrive
        ? piu ? ' Anche le copie sul Drive vanno nel recupero del Drive.' : ' Anche la copia sul Drive va nel recupero del Drive.'
        : piu ? ' Le copie sul Drive restano.' : ' La copia sul Drive resta.'),
    azione: 'Elimina dal PC'
  }
}

/** Il primo passo di «Svuota il recupero adesso», detto da chi mostra prima di chiedere al PC. */
export function confermaChiediSvuota(ancheDalDrive: boolean): Conferma {
  return {
    titolo: 'Svuotare il recupero adesso?',
    testo: 'Le chat nel recupero si cancellano per sempre' + (ancheDalDrive ? ', anche le loro copie nel recupero del Drive.' : '.') + ' Poi ti chiedo di scrivere ' + FRASE_SVUOTA + '.',
    azione: 'Continua'
  }
}

/** Il «?» accanto ad «anche dal Drive» in Elimina dal PC: lo stesso su PC, pagina e app. */
export const SPIEGA_ELIMINA_DRIVE = 'Toglie anche la copia che questa chat ha sul Drive. Non sparisce subito: va nel recupero del Drive per 30 giorni, e torna con «Ripristina». Senza la spunta la copia sul Drive resta, e gli altri PC la vedono ancora.'

/** Il «?» accanto ad «anche dal Drive» in «Svuota il recupero adesso». */
export const SPIEGA_SVUOTA_DRIVE = 'Cancella per sempre anche le copie di queste chat che sono nel recupero del Drive. Senza la spunta lì restano, e si cancellano da sole alla loro scadenza.'

/** La parola scritta basta per il secondo passo? (il PC la ricontrolla comunque). */
export function fraseSvuotaGiusta(scritta: string): boolean {
  return scritta.trim().toUpperCase() === FRASE_SVUOTA
}

/* ------------------------------------------------------------------ */
/* Le righe del recupero e delle archiviate.                           */
/* ------------------------------------------------------------------ */

function data(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** «12 MB · eliminata il 17/10 · si svuota fra 30 giorni». */
export function rigaRecupero(c: ChatInRecupero, adesso: number): string {
  const giorni = Math.max(0, Math.ceil((Date.parse(c.scadeIl) - adesso) / GIORNO_MS))
  return `${byteLeggibili(c.byte)} · eliminata il ${data(c.quando)} · ${giorni === 0 ? 'si svuota oggi' : giorni === 1 ? 'si svuota domani' : `si svuota fra ${giorni} giorni`}` +
    (c.drive !== undefined ? ' · anche dal Drive' : '')
}

export function rigaArchiviata(a: ChatArchiviata): string {
  return `archiviata il ${data(a.il)}`
}

/* ------------------------------------------------------------------ */
/* I rifiuti.                                                          */
/* ------------------------------------------------------------------ */

export type Rifiuto = { sessione: string; titolo: string; motivo: string }

/**
 * Le chat che il PC non ha toccato, con il motivo e il loro nome. Il motivo
 * del motore nomina già la chat; il titolo serve a chi la mostra in grassetto
 * o a trovarla nell'elenco.
 */
export function rifiutiDi(e: Pick<EsitoAzioni, 'esiti'>, titoloDi: (sessione: string) => string | undefined): Rifiuto[] {
  return e.esiti.filter((x) => !x.ok).map((x) => ({
    sessione: x.sessione,
    titolo: titoloDi(x.sessione) ?? x.sessione.slice(0, 8),
    motivo: x.motivo ?? 'Non si è potuta toccare.'
  }))
}
