/**
 * L'autopilota come «harness» dell'agente (0.36.0): le regole pure, condivise
 * fra il servizio, il programma, la pagina del telefono e i test.
 *
 * Proposta e decisioni di Nicholas in `.sierradeck/quaderno/2026-09-30-autopilota-harness.md`:
 * - il numero di chat lo decide il modello in base all'utilita' del lavoro; il
 *   consumo lo governa il **freno** sui limiti del piano, e resta solo un tetto
 *   tecnico di sicurezza (`TETTO_CHAT_MAX`);
 * - la **pubblicazione** si sceglie per progetto alla creazione (beta / stabile /
 *   versione unica); con il cloud — le chat del progetto sul Drive di
 *   SierraDeck, o «va sul cloud» spuntato — l'autopilota lavora in autonomia
 *   completa: commit, merge dei suoi rami, push (se c'e' un remoto git) e
 *   pubblicazione secondo la regola.
 */

import { TETTO_CHAT_MAX, type Autopilota } from './autopilota'
import { daQuanto, statoFinestra } from './limiti-piano'

// ─── Il freno sui limiti del piano ────────────────────────────────────────

/**
 * Una finestra del piano come la legge il programma dalla riga di stato
 * (`polso-chat.ts`, aggregata da `limiti-piano.ts`). `lettoIl` (0.37.0) dice
 * quando e' stata letta: il freno la giudica con la stessa `statoFinestra`
 * della console, della pagina e dell'app.
 */
export type FinestraPiano = { percento: number; resettaIl?: number; lettoIl?: number }

export type LimitiPiano = {
  cinqueOre?: FinestraPiano
  settimana?: FinestraPiano
}

export type LivelloFreno = 'pieno' | 'niente-nuove' | 'una' | 'fermo' | 'ignoto'

export type Freno = {
  livello: LivelloFreno
  /** Quante chat possono lavorare insieme adesso (al massimo il tetto tecnico). */
  tetto: number
  /** Si possono aprire chat nuove? */
  apriNuove: boolean
  /** La frase per chi guarda: perche' si e' frenato. */
  motivo: string
  /** Quando si potra' ripartire (ms), se il freno e' «fermo». */
  riparteIl?: number
}

/** Le soglie decise da Nicholas il 30/09: 60 / 80 / 95 % della finestra di 5 ore. */
export const SOGLIE_FRENO = { nienteNuove: 60, una: 80, fermo: 95 } as const

const ora = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Quanto lavoro in parallelo concede il piano, adesso.
 *
 * | uso della finestra di 5 ore | cosa si fa |
 * |---|---|
 * | sotto il 60% | tutte le chat utili (fino al tetto tecnico) |
 * | 60–80% | niente chat nuove, le attive continuano |
 * | 80–95% | una chat sola |
 * | oltre il 95% | ci si ferma, e si riparte all'azzeramento |
 *
 * La settimana pesa con le stesse soglie: e' il tetto che si rimpiange di piu',
 * e fra le due finestre vince la piu' severa. Senza limiti letti (chiave API a
 * consumo, o nessuna risposta ancora) si lavora con **una** chat: non si sa
 * quanto costa, e il piano e' lo stesso delle chat di Nicholas.
 */
export function frenoDaiLimiti(limiti: LimitiPiano | undefined, adesso: number): Freno {
  const finestre: { nome: string; f: FinestraPiano; nota: string }[] = []
  // La stessa lettura della console (0.37.0): una finestra azzerata non frena
  // piu' (conta come vuota, in attesa della lettura nuova); una lettura vecchia
  // vale ancora — e' l'ultima cosa che si sa — ma il motivo lo dice.
  const giudica = (f: FinestraPiano | undefined): { f: FinestraPiano; nota: string } | undefined => {
    if (f === undefined) return undefined
    const s = statoFinestra({ ...f, lettoIl: f.lettoIl ?? adesso }, adesso)
    if (s.stato === 'azzerata') return { f: { percento: 0 }, nota: ' (appena azzerata, aspetto la lettura nuova)' }
    return { f, nota: s.stato === 'vecchia' ? ` (lettura di ${daQuanto(s.etaMs)})` : '' }
  }
  const cinque = giudica(limiti?.cinqueOre)
  const sett = giudica(limiti?.settimana)
  if (cinque !== undefined) finestre.push({ nome: 'finestra di 5 ore', ...cinque })
  if (sett !== undefined) finestre.push({ nome: 'settimana', ...sett })
  if (finestre.length === 0) {
    return {
      livello: 'ignoto', tetto: 1, apriNuove: false,
      motivo: 'limiti del piano non ancora letti: lavoro con una chat sola finché non so quanto resta'
    }
  }
  const peggiore = finestre.reduce((a, b) => (b.f.percento > a.f.percento ? b : a))
  const p = Math.round(peggiore.f.percento)
  const nota = peggiore.nota
  const quando = peggiore.f.resettaIl
  if (p >= SOGLIE_FRENO.fermo) {
    return {
      livello: 'fermo', tetto: 0, apriNuove: false,
      motivo: `${peggiore.nome} al ${p}%${nota}: mi fermo per non consumare quello che resta` +
        (quando !== undefined ? `, riparto alle ${ora(quando)}` : ''),
      ...(quando !== undefined ? { riparteIl: quando } : {})
    }
  }
  if (p >= SOGLIE_FRENO.una) {
    return { livello: 'una', tetto: 1, apriNuove: false, motivo: `${peggiore.nome} al ${p}%${nota}: scendo a una chat sola` }
  }
  if (p >= SOGLIE_FRENO.nienteNuove) {
    return {
      livello: 'niente-nuove', tetto: TETTO_CHAT_MAX, apriNuove: false,
      motivo: `${peggiore.nome} al ${p}%${nota}: non apro chat nuove, quelle al lavoro continuano`
    }
  }
  return { livello: 'pieno', tetto: TETTO_CHAT_MAX, apriNuove: true, motivo: `${peggiore.nome} al ${p}%${nota}: via libera` }
}

/**
 * Il freno detto per esteso (0.37.0): il titolo e cosa vuol dire, uguale nella
 * colonna «Consumi e limiti» del PC, nella pagina e nell'app.
 */
export function testoFreno(f: Freno): { titolo: string; spiegazione: string } {
  switch (f.livello) {
    case 'pieno':
      return { titolo: 'Via libera', spiegazione: `Gli autopiloti possono aprire tutte le chat utili, fino a ${TETTO_CHAT_MAX} insieme. Motivo: ${f.motivo}.` }
    case 'niente-nuove':
      return { titolo: 'Niente chat nuove', spiegazione: `Le chat degli autopiloti già al lavoro continuano, ma non ne aprono altre finché la finestra non scende o si azzera. Motivo: ${f.motivo}.` }
    case 'una':
      return { titolo: 'Una chat sola', spiegazione: `Ogni autopilota lavora con una chat sola: le altre si mettono in pausa a fine turno e ripartono da sole quando il piano lo permette. Motivo: ${f.motivo}.` }
    case 'fermo':
      return { titolo: 'Fermo', spiegazione: `Gli autopiloti si fermano a fine turno per non consumare quello che resta, e ripartono da soli all’azzeramento. Motivo: ${f.motivo}.` }
    default:
      return { titolo: 'Limiti non letti', spiegazione: 'Senza i limiti del piano gli autopiloti lavorano con una chat sola, per prudenza: i limiti arrivano alla prima risposta di una chat aperta dal computer (solo con abbonamento Pro o Max).' }
  }
}

/**
 * Quante chat lavorano insieme: quelle utili (le decide il modello) dentro il
 * freno e il tetto tecnico. Senza git le chat condividerebbero i file: una sola.
 */
export function quanteChat(p: { utili: number; freno: Freno; attive: number; git: boolean }): number {
  if (!p.git) return Math.min(1, Math.max(0, p.freno.tetto))
  const utili = Math.max(1, Math.min(p.utili, TETTO_CHAT_MAX))
  const tetto = Math.min(utili, p.freno.tetto)
  // Senza il permesso di aprirne di nuove si resta a quelle che ci sono.
  return p.freno.apriNuove ? tetto : Math.min(tetto, Math.max(p.attive, 0))
}

// ─── La pubblicazione, per progetto ───────────────────────────────────────

export type RegolaPubblicazione = 'beta' | 'stabile' | 'unica'

export const REGOLE_PUBBLICAZIONE: { valore: RegolaPubblicazione; etichetta: string; spiega: string }[] = [
  {
    valore: 'beta',
    etichetta: 'beta: pubblica sempre',
    spiega: 'A lavoro finito e verificato pubblica da solo, senza chiedere: va bene per un progetto in prova, dove un difetto costa poco.'
  },
  {
    valore: 'stabile',
    etichetta: 'stabile: chiede prima',
    spiega: 'Fa commit, unisce i suoi rami e (con le chat sul Drive) manda su, ma prima di pubblicare ti chiede il sì nella scheda Domande, con il riassunto di cosa esce.'
  },
  {
    valore: 'unica',
    etichetta: 'versione unica: decide il progetto',
    spiega: 'Segue la regola di pubblicazione scritta nel progetto (CLAUDE.md, quaderno, script). Se il progetto non ne ha una, chiede.'
  }
]

export function regolaPubblicazione(raw: unknown): RegolaPubblicazione | undefined {
  return raw === 'beta' || raw === 'stabile' || raw === 'unica' ? raw : undefined
}

/**
 * Quello che il servizio riesce a sapere di un progetto guardando i suoi file:
 * dove mandare su il lavoro e con quale comando pubblicare. **Non** dice se
 * l'autopilota lavora in autonomia: quello lo dice il Drive (vedi `rilevaCloud`).
 */
export type FattiPubblicazione = {
  /** I remoti git (`git remote -v`): nome e indirizzo. */
  remoti: string[]
  /** Gli script di `package.json`, nome → comando. */
  script: Record<string, string>
  /** I file presenti nella radice e in `.github/workflows` (solo i nomi). */
  file: string[]
}

/**
 * Il «cloud» di SierraDeck: le chat del progetto salvate sul **Drive di
 * SierraDeck**. Correzione di Nicholas (30/09): non il remoto git, non gli
 * script, non il deploy — quelli dicono solo *come* consegnare.
 */
export type Cloud = { attivo: boolean; segni: string[] }

/**
 * Il cloud e' attivo quando la sincronizzazione Drive del progetto e' accesa
 * (Drive connesso, cassaforte aperta, salvataggio automatico acceso, progetto
 * sul Drive con la sua cartella su questo PC: lo legge il Gestore e lo manda
 * nello stato del programma), oppure quando nella creazione e' spuntato «va
 * sul cloud — le chat stanno sul Drive». Solo in questi due casi l'autopilota
 * lavora in autonomia completa.
 */
export function rilevaCloud(p: { vaSulCloud?: boolean; driveAttivo?: boolean }): Cloud {
  const segni: string[] = []
  if (p.vaSulCloud === true) segni.push('spuntato «va sul cloud» nella creazione')
  if (p.driveAttivo === true) segni.push('sincronizzazione Drive del progetto accesa')
  return { attivo: segni.length > 0, segni }
}

/** Come si consegna, quando la regola lo prevede: il remoto per il push, il comando per pubblicare. */
export type Consegna = {
  /** Il nome del remoto git su cui fare il push (di solito `origin`), se c'e'. */
  remoto?: string
  /** Lo script di pubblicazione, come si lancia (`npm run pubblica`). */
  comandoPubblica?: string
  segni: string[]
}

const FILE_DEPLOY = [
  'vercel.json', 'netlify.toml', 'firebase.json', 'fly.toml', 'render.yaml', 'app.yaml',
  'Procfile', 'Dockerfile', 'docker-compose.yml', 'electron-builder.yml', 'electron-builder.json',
  'wrangler.toml', 'serverless.yml', 'amplify.yml'
]
const SCRIPT_PUBBLICA = /^(pubblica|publish|release|rilascia|deploy)(:|$)/i
const COMANDI_PUBBLICA = /(electron-builder[^|&]*--publish|vercel\b|netlify deploy|firebase deploy|fly deploy|wrangler (deploy|publish)|gh release create|npm publish|docker push|gcloud (app|run) deploy)/i

/**
 * Dove e come consegnare, dai file del progetto. Pura: i fatti li raccoglie
 * chi legge il disco (`fattiPubblicazione` nel servizio). Il remoto preferito e'
 * `origin`; lo script preferito e' quello che si chiama «pubblica» o simile.
 */
export function comeConsegnare(f: FattiPubblicazione): Consegna {
  const segni: string[] = []
  const nomi = [...new Set(f.remoti.map((r) => r.trim().split(/\s+/)[0] ?? '').filter((n) => n !== ''))]
  const remoto = nomi.includes('origin') ? 'origin' : nomi[0]
  if (remoto !== undefined) segni.push(`remoto git ${remoto}`)
  let comandoPubblica: string | undefined
  for (const [nome, comando] of Object.entries(f.script)) {
    if (SCRIPT_PUBBLICA.test(nome) || COMANDI_PUBBLICA.test(comando)) {
      segni.push(`script «${nome}»`)
      comandoPubblica ??= `npm run ${nome}`
    }
  }
  for (const nome of f.file) {
    const base = nome.split(/[\\/]/).pop() ?? nome
    if (FILE_DEPLOY.includes(base)) segni.push(`file ${base}`)
    else if (/workflows[\\/].*(deploy|release|publish|pubblica)/i.test(nome)) segni.push(`workflow ${base}`)
  }
  return { ...(remoto !== undefined ? { remoto } : {}), ...(comandoPubblica !== undefined ? { comandoPubblica } : {}), segni }
}

export type PianoPubblicazione = {
  /** Lavora in autonomia completa: le chat stanno sul Drive, niente domande. */
  autonomia: boolean
  /** Commit dei suoi cambi sui suoi rami. */
  commit: boolean
  /** Unire i suoi rami nel ramo principale del progetto. */
  unisci: boolean
  /** Mandare su il ramo principale (solo in autonomia, e solo se c'e' un remoto). */
  push: boolean
  /** Pubblicare: da solo, dopo averti chiesto, secondo le regole del progetto, o no. */
  pubblica: 'sempre' | 'chiedi' | 'progetto' | 'no'
  /** Le istruzioni per la chat, scritte per esteso. */
  istruzioni: string
}

/**
 * Cosa l'autopilota fa da solo a lavoro finito.
 *
 * Senza cloud (Drive spento e «va sul cloud» non spuntato): commit sui suoi
 * rami e unione in locale, niente push e niente pubblicazione — anche se il
 * progetto ha un remoto o uno script, perche' non lavora in autonomia.
 * Con il cloud: autonomia completa, commit e unione, push se c'e' un remoto, e
 * la pubblicazione secondo la regola del progetto. Senza una regola scelta si
 * comporta come «stabile»: chiede prima di pubblicare.
 */
export function pianoPubblicazione(p: { regola?: RegolaPubblicazione; cloud: Cloud; consegna?: Consegna }): PianoPubblicazione {
  if (!p.cloud.attivo) {
    return {
      autonomia: false, commit: true, unisci: true, push: false, pubblica: 'no',
      istruzioni: 'Le chat di questo progetto non stanno sul Drive di SierraDeck: fai commit del tuo lavoro sul tuo ramo. Niente push, niente pubblicazione.'
    }
  }
  const regola = p.regola ?? 'stabile'
  const pubblica = regola === 'beta' ? 'sempre' : regola === 'stabile' ? 'chiedi' : 'progetto'
  const push = p.consegna?.remoto !== undefined
  const come = regola === 'beta'
    ? 'A lavoro finito e verificato pubblica da solo, senza chiedere.'
    : regola === 'stabile'
      ? 'Prima di pubblicare chiedi il sì: è la sola domanda prevista. Commit, unione e push li fai da solo.'
      : 'Pubblica seguendo la regola scritta nel progetto (CLAUDE.md, quaderno, script di pubblicazione).'
  return {
    autonomia: true, commit: true, unisci: true, push, pubblica,
    istruzioni: `Le chat di questo progetto stanno sul Drive di SierraDeck: lavori in autonomia completa. Fai commit` +
      (push ? `, e il push su ${p.consegna?.remoto} dopo l'unione` : ' (il progetto non ha un remoto git: niente push)') + '. ' + come +
      (p.consegna?.comandoPubblica !== undefined ? ` Per pubblicare: ${p.consegna.comandoPubblica}.` : '')
  }
}

// ─── L'albero delle chat (T7) ─────────────────────────────────────────────

export type NodoAlbero = {
  id: string
  /** `coordinatore` e' l'autopilota; `chat` una sua sotto-chat. */
  tipo: 'coordinatore' | 'chat'
  titolo: string
  stato: string
  /** La parola dello stato, come la si legge da lontano. */
  parola: string
  ramo?: string
  cartella?: string
  cicli: number
  figli: NodoAlbero[]
}

const PAROLE_CHAT: Record<string, string> = {
  lavoro: 'al lavoro',
  bloccata: 'aspetta una risposta',
  pausa: 'in pausa per i limiti del piano',
  finita: 'finita'
}

const PAROLE_AUTOPILOTA: Record<string, string> = {
  intervista: 'si prepara',
  pronto: 'aspetta il via',
  lavoro: 'coordina',
  attesa: 'aspetta te',
  sospeso: 'fermo',
  finito: 'finito',
  fallito: 'si è arreso'
}

/** Il coordinatore e le sue sotto-chat, per PC, pagina e app. */
export function alberoChat(a: Pick<Autopilota, 'id' | 'nome' | 'obiettivo' | 'stato' | 'cicli' | 'chats' | 'cwd'>): NodoAlbero {
  return {
    id: a.id,
    tipo: 'coordinatore',
    titolo: a.nome !== '' ? a.nome : a.obiettivo.slice(0, 60),
    stato: a.stato,
    parola: PAROLE_AUTOPILOTA[a.stato] ?? a.stato,
    cartella: a.cwd,
    cicli: a.cicli,
    figli: a.chats.map((c) => ({
      id: c.id,
      tipo: 'chat' as const,
      titolo: c.compito !== '' ? c.compito : 'chat ' + c.id,
      stato: c.stato,
      parola: PAROLE_CHAT[c.stato] ?? c.stato,
      ...(c.ramo !== undefined ? { ramo: c.ramo } : {}),
      ...(c.cartella !== undefined ? { cartella: c.cartella } : {}),
      cicli: c.cicli,
      figli: []
    }))
  }
}
