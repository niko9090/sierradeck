/**
 * L'autopilota come «harness» dell'agente (0.36.0): le regole pure, condivise
 * fra il servizio, il programma, la pagina del telefono e i test.
 *
 * Proposta e decisioni di Nicholas in `.sierradeck/quaderno/2026-09-30-autopilota-harness.md`:
 * - il numero di chat lo decide il modello in base all'utilita' del lavoro; il
 *   consumo lo governa il **freno** sui limiti del piano, e resta solo un tetto
 *   tecnico di sicurezza (`TETTO_CHAT_MAX`);
 * - la **pubblicazione** si sceglie per progetto alla creazione (beta / stabile /
 *   versione unica); con il cloud (dichiarato o riconosciuto) l'autopilota fa
 *   tutto da solo — commit, merge dei suoi rami, push, pubblicazione.
 */

import { TETTO_CHAT_MAX, type Autopilota } from './autopilota'

// ─── Il freno sui limiti del piano ────────────────────────────────────────

/** Una finestra del piano come la legge il programma dalla riga di stato (`polso-chat.ts`). */
export type FinestraPiano = { percento: number; resettaIl?: number }

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
  const finestre: { nome: string; f: FinestraPiano }[] = []
  // Una finestra gia' azzerata non frena piu': conta come vuota.
  const viva = (f: FinestraPiano | undefined): FinestraPiano | undefined =>
    f === undefined ? undefined : (f.resettaIl !== undefined && f.resettaIl <= adesso ? { percento: 0 } : f)
  const cinque = viva(limiti?.cinqueOre)
  const sett = viva(limiti?.settimana)
  if (cinque !== undefined) finestre.push({ nome: 'finestra di 5 ore', f: cinque })
  if (sett !== undefined) finestre.push({ nome: 'settimana', f: sett })
  if (finestre.length === 0) {
    return {
      livello: 'ignoto', tetto: 1, apriNuove: false,
      motivo: 'limiti del piano non ancora letti: lavoro con una chat sola finché non so quanto resta'
    }
  }
  const peggiore = finestre.reduce((a, b) => (b.f.percento > a.f.percento ? b : a))
  const p = Math.round(peggiore.f.percento)
  const quando = peggiore.f.resettaIl
  if (p >= SOGLIE_FRENO.fermo) {
    return {
      livello: 'fermo', tetto: 0, apriNuove: false,
      motivo: `${peggiore.nome} al ${p}%: mi fermo per non consumare quello che resta` +
        (quando !== undefined ? `, riparto alle ${ora(quando)}` : ''),
      ...(quando !== undefined ? { riparteIl: quando } : {})
    }
  }
  if (p >= SOGLIE_FRENO.una) {
    return { livello: 'una', tetto: 1, apriNuove: false, motivo: `${peggiore.nome} al ${p}%: scendo a una chat sola` }
  }
  if (p >= SOGLIE_FRENO.nienteNuove) {
    return {
      livello: 'niente-nuove', tetto: TETTO_CHAT_MAX, apriNuove: false,
      motivo: `${peggiore.nome} al ${p}%: non apro chat nuove, quelle al lavoro continuano`
    }
  }
  return { livello: 'pieno', tetto: TETTO_CHAT_MAX, apriNuove: true, motivo: `${peggiore.nome} al ${p}%: via libera` }
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
    spiega: 'Fa commit, unisce i suoi rami e manda su, ma prima di pubblicare ti chiede il sì nella scheda Domande, con il riassunto di cosa esce.'
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

/** Quello che il servizio riesce a sapere di un progetto guardando i suoi file. */
export type FattiCloud = {
  /** I remoti git (`git remote -v`, o letti da `.git/config`): nome e indirizzo. */
  remoti: string[]
  /** Gli script di `package.json`, nome → comando. */
  script: Record<string, string>
  /** I file presenti nella radice e in `.github/workflows` (solo i nomi). */
  file: string[]
}

export type Cloud = { attivo: boolean; segni: string[] }

const FILE_DEPLOY = [
  'vercel.json', 'netlify.toml', 'firebase.json', 'fly.toml', 'render.yaml', 'app.yaml',
  'Procfile', 'Dockerfile', 'docker-compose.yml', 'electron-builder.yml', 'electron-builder.json',
  'wrangler.toml', 'serverless.yml', 'amplify.yml'
]
const SCRIPT_PUBBLICA = /^(deploy|publish|pubblica|release|rilascia)(:|$)/i
const COMANDI_PUBBLICA = /(electron-builder[^|&]*--publish|vercel\b|netlify deploy|firebase deploy|fly deploy|wrangler (deploy|publish)|gh release create|npm publish|docker push|gcloud (app|run) deploy)/i

/**
 * Il progetto «va sul cloud»? Sì se ha un remoto git, uno script di
 * pubblicazione o di deploy, o un file di un servizio di deploy riconoscibile.
 * Pura: i fatti li raccoglie chi legge il disco (`cloudDelProgetto` nel servizio).
 */
export function rilevaCloud(f: FattiCloud): Cloud {
  const segni: string[] = []
  for (const r of f.remoti) if (r.trim() !== '') segni.push(`remoto git ${r.trim()}`)
  for (const [nome, comando] of Object.entries(f.script)) {
    if (SCRIPT_PUBBLICA.test(nome)) segni.push(`script «${nome}»`)
    else if (COMANDI_PUBBLICA.test(comando)) segni.push(`script «${nome}» (${comando.slice(0, 60)})`)
  }
  for (const nome of f.file) {
    const base = nome.split(/[\\/]/).pop() ?? nome
    if (FILE_DEPLOY.includes(base)) segni.push(`file ${base}`)
    else if (/workflows[\\/].*(deploy|release|publish|pubblica)/i.test(nome)) segni.push(`workflow ${base}`)
  }
  return { attivo: segni.length > 0, segni }
}

export type PianoPubblicazione = {
  /** Commit dei suoi cambi sui suoi rami. */
  commit: boolean
  /** Unire i suoi rami nel ramo principale del progetto. */
  unisci: boolean
  /** Mandare su il ramo principale. */
  push: boolean
  /** Pubblicare: da solo, dopo averti chiesto, secondo le regole del progetto, o no. */
  pubblica: 'sempre' | 'chiedi' | 'progetto' | 'no'
  /** Le istruzioni per la chat, scritte per esteso. */
  istruzioni: string
}

/**
 * Cosa l'autopilota fa da solo a lavoro finito.
 *
 * Senza cloud (ne' dichiarato ne' riconosciuto): commit sui suoi rami e unione
 * in locale, niente push e niente pubblicazione — non c'e' dove mandarli.
 * Con il cloud: commit, unione, push, e la pubblicazione secondo la regola.
 * Senza una regola scelta si comporta come «stabile»: chiede prima.
 */
export function pianoPubblicazione(p: { regola?: RegolaPubblicazione; vaSulCloud?: boolean; cloud?: Cloud }): PianoPubblicazione {
  const cloud = p.vaSulCloud === true || p.cloud?.attivo === true
  if (!cloud) {
    return {
      commit: true, unisci: true, push: false, pubblica: 'no',
      istruzioni: 'Il progetto non va sul cloud: fai commit del tuo lavoro sul tuo ramo. Niente push, niente pubblicazione.'
    }
  }
  const regola = p.regola ?? 'stabile'
  const pubblica = regola === 'beta' ? 'sempre' : regola === 'stabile' ? 'chiedi' : 'progetto'
  const come = regola === 'beta'
    ? 'A lavoro finito e verificato pubblica da solo con la procedura del progetto, senza chiedere.'
    : regola === 'stabile'
      ? 'Prima di pubblicare chiedi il sì: la domanda arriva a chi ti ha affidato il lavoro. Commit, unione e push li fai da solo.'
      : 'Pubblica seguendo la regola scritta nel progetto (CLAUDE.md, quaderno, script di pubblicazione). Se il progetto non dice niente, chiedi prima.'
  return {
    commit: true, unisci: true, push: true, pubblica,
    istruzioni: `Il progetto va sul cloud${p.cloud?.segni.length ? ` (${p.cloud.segni.slice(0, 3).join(', ')})` : ''}: fai commit, e il push dopo l'unione. ${come}`
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
