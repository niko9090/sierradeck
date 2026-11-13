/**
 * **Il riconoscimento della voce sul PC** per «Parlato» (13/11): Whisper,
 * nella versione whisper.cpp già compilata per Windows, più un modello
 * multilingue. Si scaricano una volta sola, col consenso di Nicholas, nella
 * cartella dei dati del programma; ogni file ha la sua impronta sha256 scritta
 * qui, e un file che non torna si butta. L'audio non esce mai dal PC.
 *
 * Qui i file e la macchina a stati dello scaricamento (pura); lo scaricamento
 * vero sta in `main/voce-locale.ts`.
 */

export type Pezzo = {
  id: 'programma' | IdModello
  /** Come lo si nomina a Nicholas. */
  nome: string
  url: string
  sha256: string
  byte: number
  /** Il nome del file scaricato, dentro la cartella della voce. */
  file: string
}

/**
 * whisper.cpp 1.9.2 (4 agosto 2026), la versione stabile con i binari per
 * Windows x64 (solo CPU, sceglie da solo le istruzioni del processore).
 * Impronta presa dal campo `digest` della release su GitHub e ricontrollata.
 */
export const PROGRAMMA: Pezzo = {
  id: 'programma',
  nome: 'whisper.cpp 1.9.2',
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip',
  sha256: '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a',
  byte: 8_194_445,
  file: 'whisper-bin-x64.zip'
}

/** I file del pacchetto che servono davvero (gli altri eseguibili restano nello zip, che poi si butta). */
export const FILE_DEL_PROGRAMMA = ['Release/whisper-cli.exe', 'Release/whisper.dll', 'Release/ggml*.dll'] as const
export const ESEGUIBILE = 'Release/whisper-cli.exe'

export type IdModello = 'preciso' | 'leggero'

/**
 * I modelli, dal repository ufficiale dei modelli di whisper.cpp; impronte
 * dall'oggetto LFS di Hugging Face. «Preciso» è small (quantizzato q5_1): lo
 * stesso modello da 488 MB in 190, quasi la stessa precisione in italiano.
 * «Leggero» è base q5_1: tre volte più veloce, sbaglia di più le parole rare.
 */
export const MODELLI: Record<IdModello, Pezzo & { titolo: string; spiega: string }> = {
  preciso: {
    id: 'preciso',
    titolo: 'Preciso',
    spiega: 'capisce bene l’italiano; sui PC vecchi impiega qualche secondo per frase',
    nome: 'Whisper small (q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    byte: 190_085_487,
    file: 'ggml-small-q5_1.bin'
  },
  leggero: {
    id: 'leggero',
    titolo: 'Leggero',
    spiega: 'più veloce e piccolo, sbaglia di più le parole rare',
    nome: 'Whisper base (q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
    byte: 59_707_625,
    file: 'ggml-base-q5_1.bin'
  }
}

export const MODELLO_PREDEFINITO: IdModello = 'preciso'

export function eIdModello(x: unknown): x is IdModello {
  return x === 'preciso' || x === 'leggero'
}

/** Megabyte arrotondati, come li dice Windows a una persona (milioni di byte). */
export function mb(byte: number): number {
  return Math.max(1, Math.round(byte / 1_000_000))
}

/** Quanto si scarica per un modello, programma compreso (se manca). */
export function byteDaScaricare(modello: IdModello, conProgramma = true): number {
  return MODELLI[modello].byte + (conProgramma ? PROGRAMMA.byte : 0)
}

/** Il consenso, corto: quanto pesa e che l'audio resta sul PC. Il resto dietro «?». */
export function testoConsenso(modello: IdModello): string {
  return `Per «Parlato» scarico il riconoscimento della voce (${mb(byteDaScaricare(modello))} MB, una volta sola). L’audio resta sul PC.`
}

export const SPIEGA_CONSENSO =
  'Il riconoscimento è Whisper (whisper.cpp 1.9.2, il programma ufficiale già compilato per Windows) con un modello multilingue. ' +
  'Si scaricano da GitHub e da Hugging Face nella cartella dei dati di SierraDeck; ogni file si controlla con la sua impronta sha256 e, se non torna, si butta. ' +
  'Gira tutto su questo PC: l’audio non esce mai, non costa niente e non serve un account. Usa il processore solo mentre capisce una frase. ' +
  'Si toglie quando vuoi dalle impostazioni della voce (▾).'

// ------------------------------------------------------------- la macchina a stati

/** Il modello che c'era prima di uno scaricamento: ci si torna se si annulla o fallisce. */
export type Installato = { modello: IdModello; byte: number }

export type StatoModello =
  | { fase: 'assente' }
  | { fase: 'scarica'; modello: IdModello; pezzo: Pezzo['id']; fatto: number; totale: number; prima?: Installato }
  | { fase: 'verifica'; modello: IdModello; pezzo: Pezzo['id']; fatto: number; totale: number; prima?: Installato }
  | { fase: 'estrai'; modello: IdModello; fatto: number; totale: number; prima?: Installato }
  | { fase: 'pronto'; modello: IdModello; byte: number }
  | { fase: 'errore'; messaggio: string; prima?: Installato }

export type EventoModello =
  | { tipo: 'inizia'; modello: IdModello; primo: Pezzo['id']; totale: number }
  /** `fatto`: i byte scaricati in tutto, non solo del pezzo. */
  | { tipo: 'progresso'; pezzo: Pezzo['id']; fatto: number }
  | { tipo: 'verifica'; pezzo: Pezzo['id'] }
  /** `atteso`: l'impronta scritta per quel file (di serie quella del catalogo qui sopra). */
  | { tipo: 'verificato'; pezzo: Pezzo['id']; sha256: string; atteso?: string }
  | { tipo: 'estrai' }
  | { tipo: 'fatto'; modello: IdModello; byte: number }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'annulla' }
  | { tipo: 'rimosso' }

export const IMPRONTA_SBAGLIATA = 'Il file scaricato non è integro (impronta diversa): l’ho buttato. Riprova.'

const pezzoDi = (id: Pezzo['id']): Pezzo => (id === 'programma' ? PROGRAMMA : MODELLI[id])

export function inCorso(s: StatoModello): s is Extract<StatoModello, { fase: 'scarica' | 'verifica' | 'estrai' }> {
  return s.fase === 'scarica' || s.fase === 'verifica' || s.fase === 'estrai'
}

/** Il modello installato che lo stato si porta dietro. */
function installato(s: StatoModello): Installato | undefined {
  if (s.fase === 'pronto') return { modello: s.modello, byte: s.byte }
  return s.fase === 'assente' ? undefined : s.prima
}

/** Percentuale intera dello scaricamento, 0–100. */
export function percentuale(s: StatoModello): number | undefined {
  if (!inCorso(s)) return undefined
  return s.totale <= 0 ? 0 : Math.min(100, Math.floor((s.fatto / s.totale) * 100))
}

/**
 * Un passo della macchina. Regole: uno scaricamento alla volta (un secondo
 * «inizia» mentre scarica non conta); il progresso conta solo scaricando;
 * un'impronta diversa da quella scritta qui è un errore; «annulla» e gli
 * errori lasciano il modello che c'era prima.
 */
export function avanzaModello(s: StatoModello, e: EventoModello): StatoModello {
  const prima = installato(s)
  const conPrima = prima !== undefined ? { prima } : {}
  switch (e.tipo) {
    case 'inizia':
      if (inCorso(s)) return s
      return { fase: 'scarica', modello: e.modello, pezzo: e.primo, fatto: 0, totale: Math.max(0, e.totale), ...conPrima }
    case 'progresso':
      if (!inCorso(s)) return s
      if (s.fase === 'verifica' && s.pezzo === e.pezzo) return s
      return { fase: 'scarica', modello: s.modello, pezzo: e.pezzo, fatto: Math.min(s.totale, Math.max(s.fatto, e.fatto)), totale: s.totale, ...conPrima }
    case 'verifica':
      return s.fase === 'scarica' && s.pezzo === e.pezzo ? { ...s, fase: 'verifica' } : s
    case 'verificato':
      if (s.fase !== 'verifica' || s.pezzo !== e.pezzo) return s
      return e.sha256.toLowerCase() === (e.atteso ?? pezzoDi(e.pezzo).sha256).toLowerCase() ? s : { fase: 'errore', messaggio: IMPRONTA_SBAGLIATA, ...conPrima }
    case 'estrai':
      return s.fase === 'verifica' ? { fase: 'estrai', modello: s.modello, fatto: s.fatto, totale: s.totale, ...conPrima } : s
    case 'fatto':
      return inCorso(s) ? { fase: 'pronto', modello: e.modello, byte: e.byte } : s
    case 'errore':
      return inCorso(s) ? { fase: 'errore', messaggio: e.messaggio, ...conPrima } : s
    case 'annulla':
      if (!inCorso(s)) return s
      return prima !== undefined ? { fase: 'pronto', ...prima } : { fase: 'assente' }
    case 'rimosso':
      return { fase: 'assente' }
  }
}

