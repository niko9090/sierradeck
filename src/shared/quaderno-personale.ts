/**
 * Il «Quaderno personale» (0.57.0): i dati riservati di Nicholas — un'email
 * di contatto, un indirizzo, una partita IVA — che una chat a volte deve
 * scrivere (una pagina legale, un modulo) ma che non devono stare nel codice,
 * nel repository o nel quaderno del progetto.
 *
 * Stanno solo su questo PC, cifrati. Le chat non li leggono da sole: li
 * chiedono con lo strumento `chiedi_dato_personale(voce, motivo)`, e ogni
 * volta Nicholas sceglie nelle Domande (sul PC, sul telefono o nella pagina):
 * una volta, sempre per quella chat, o no. Senza risposta vale no. Ogni
 * richiesta resta nell'elenco degli usi; i «sempre» si revocano.
 *
 * Qui le regole e i testi, uguali per il PC, la pagina e l'app.
 */

export type VocePersonale = {
  id: string
  /** Come la chiama Nicholas, e come la chiede la chat: «Email di contatto», «Partita IVA». */
  nome: string
  valore: string
  /** Facoltativa: a cosa serve, per chi la legge fra un mese. */
  nota?: string
  modificata: string
}

/** Com'è finita una richiesta di una chat. */
export type EsitoUso = 'una-volta' | 'sempre' | 'gia-consentita' | 'negato' | 'nessuna-risposta' | 'voce-assente'

export type UsoPersonale = {
  id: string
  quando: string
  /** Il titolo della chat, come si vede nel mosaico. */
  chat: string
  sessione: string
  /** Il nome della voce chiesta, anche se non c'era. */
  voce: string
  motivo: string
  esito: EsitoUso
}

/** «Sempre per questa chat»: la sessione di Claude Code e la voce. */
export type ConsensoSempre = { sessione: string; chat: string; voceId: string; voce: string; dal: string }

/** Una richiesta che aspetta la scelta di Nicholas. */
export type RichiestaPersonale = { id: string; sessione: string; chat: string; voceId: string; voce: string; motivo: string; creata: string }

export type StatoQuadernoPersonale = {
  /** Falso se il portachiavi di Windows non c'è: senza, il quaderno non si può cifrare e resta spento. */
  disponibile: boolean
  perche?: string
  voci: VocePersonale[]
  consensi: ConsensoSempre[]
  usi: UsoPersonale[]
  richieste: RichiestaPersonale[]
}

export const OPZIONI_CONSENSO = ['Consenti una volta', 'Sempre per questa chat', 'No'] as const

/** L'id di una domanda di consenso nelle Domande: si riconosce dal prefisso. */
export const PREFISSO_DOMANDA_PERSONALE = 'dato-personale:'
export function idDomandaPersonale(id: string): string { return `${PREFISSO_DOMANDA_PERSONALE}${id}` }
export function leggiIdDomandaPersonale(id: string): string | undefined {
  return id.startsWith(PREFISSO_DOMANDA_PERSONALE) ? id.slice(PREFISSO_DOMANDA_PERSONALE.length) : undefined
}

/**
 * La scelta dalla risposta nelle Domande. Prudente: «sempre» e «una volta»
 * solo se lo dice chiaramente, tutto il resto è no.
 */
export function sceltaDaRisposta(r: string): 'una-volta' | 'sempre' | 'no' {
  const t = r.trim().toLowerCase()
  if (t === '' || t.startsWith('no')) return 'no'
  if (t.startsWith('sempre')) return 'sempre'
  if (t.startsWith('consenti') || t.startsWith('una volta') || /^(s[iì]|ok|va bene)\b/.test(t)) return 'una-volta'
  return 'no'
}

/** Il nome di una voce come si confronta: senza maiuscole, spazi doppi, punti e accenti di troppo. */
export function normalizzaNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.\s_-]+/g, ' ').trim()
}

/** La voce chiesta da una chat: per nome esatto (normalizzato), o per id. */
export function trovaVoce(voci: VocePersonale[], chiesta: string): VocePersonale | undefined {
  const n = normalizzaNome(chiesta)
  if (n === '') return undefined
  return voci.find((v) => v.id === chiesta) ?? voci.find((v) => normalizzaNome(v.nome) === n)
}

export const MAX_NOME = 80
export const MAX_VALORE = 2000
export const MAX_NOTA = 300
export const MAX_VOCI = 200

/** Un errore da mostrare, o niente se la voce va bene. */
export function controllaVoce(nome: string, valore: string, nota: string | undefined, altre: VocePersonale[], id?: string): string | undefined {
  const n = nome.trim()
  if (n === '') return 'Scrivi il nome della voce: è quello che la chat chiede, per esempio «Email di contatto».'
  if (n.length > MAX_NOME) return `Il nome è troppo lungo: al massimo ${MAX_NOME} caratteri.`
  if (valore.trim() === '') return 'Scrivi il valore: senza, la voce non serve.'
  if (valore.length > MAX_VALORE) return `Il valore è troppo lungo: al massimo ${MAX_VALORE} caratteri.`
  if (nota !== undefined && nota.length > MAX_NOTA) return `La nota è troppo lunga: al massimo ${MAX_NOTA} caratteri.`
  if (altre.some((v) => v.id !== id && normalizzaNome(v.nome) === normalizzaNome(n))) return `C’è già una voce che si chiama «${n}»: cambiale nome, oppure modifica quella.`
  if (id === undefined && altre.length >= MAX_VOCI) return `Il quaderno personale ha già ${MAX_VOCI} voci: togline qualcuna prima di aggiungerne.`
  return undefined
}

/** Il testo della domanda di consenso, per esteso: quale chat, quale dato, perché, e cosa vuol dire ogni scelta. */
export function testoDomandaConsenso(r: { chat: string; voce: string; motivo: string }): string {
  return `La chat «${r.chat}» chiede il dato «${r.voce}» del tuo quaderno personale.\n\n` +
    `Perché, con le sue parole: «${r.motivo}».\n\n` +
    '«Consenti una volta» glielo dà adesso e basta. «Sempre per questa chat» glielo dà anche le prossime volte, senza chiedere, finché non lo revochi (Impostazioni → Quaderno personale). ' +
    '«No» non glielo dà. Se non rispondi entro due minuti vale no, e la chat lo sa.'
}

/** L'esito come lo legge chi guarda l'elenco degli usi. */
export function testoEsito(e: EsitoUso): string {
  switch (e) {
    case 'una-volta': return 'dato, una volta'
    case 'sempre': return 'dato, e consentito sempre per questa chat'
    case 'gia-consentita': return 'dato senza chiedere (consentito sempre)'
    case 'negato': return 'negato'
    case 'nessuna-risposta': return 'nessuna risposta in due minuti: negato'
    case 'voce-assente': return 'voce non presente nel quaderno'
  }
}

/** Il valore nascosto, per gli elenchi: si vede solo toccando «Mostra». */
export function valoreNascosto(v: string): string {
  if (v.length <= 4) return '••••'
  return `${v.slice(0, 2)}${'•'.repeat(Math.min(12, v.length - 4))}${v.slice(-2)}`
}
