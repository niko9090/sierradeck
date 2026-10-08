/**
 * I file fra il PC e il telefono (0.54.0): le regole pure.
 *
 * Nicholas (08/10): «Permetti anche di inviare dal pc al cellulare i file e
 * che se lo chiedo in chat direttamente sierradeck me lo dà fare, anche perché
 * tutta la parte file qui sul cellulare non c'è come nel pc».
 *
 * Tre pezzi, che qui hanno le loro regole e nel main il disco:
 * 1. **Sfogliare** i progetti di un PC dal telefono (e dalla pagina): solo
 *    dentro le cartelle dei progetti noti, mai fuori, con i percorsi
 *    relativi controllati prima di toccare il disco.
 * 2. **La coda verso il telefono**: il PC mette da parte una copia del file
 *    per **quel** telefono; il telefono la ritira a pezzi quando si collega,
 *    riprende da dove era, e conferma con l'impronta.
 * 3. **Dalla chat**: lo strumento `manda_al_telefono` di ogni chat aperta da
 *    SierraDeck. Senza chiedere solo i file sotto la cartella della chat; per
 *    gli altri una domanda a Nicholas nelle Domande.
 */

import { ALLEGATO_MAX_BYTE, PEZZO_BYTE, inMb } from './allegati'

/** Un pezzo di file letto dal telefono: lo stesso degli allegati (96 KB, 128 KB in base64). */
export const FILE_PEZZO_BYTE = PEZZO_BYTE
/** Quanto testo si legge per l'anteprima: oltre, si scarica. */
export const ANTEPRIMA_TESTO_BYTE = 512 * 1024
/** Un'immagine o un PDF si mostrano fino a qui; oltre, si scaricano e si aprono con un'altra app. */
export const ANTEPRIMA_MAX_BYTE = 20 * 1024 * 1024
/** Le voci di una cartella che si mandano al telefono: una cartella di 50 000 file non si sfoglia. */
export const VOCI_MAX = 2000

/** Al telefono: lo stesso limite dei file dal telefono, scritto anche nei testi. */
export const AL_TELEFONO_MAX_BYTE = ALLEGATO_MAX_BYTE
/** Quanti file possono aspettare un telefono. Oltre, si annulla qualcosa o si aspetta che arrivi. */
export const AL_TELEFONO_MAX_IN_CODA = 30
/** E quanti byte in tutto: le copie stanno nei dati del programma, sul disco del PC. */
export const AL_TELEFONO_MAX_TOTALE = 1024 * 1024 * 1024
/** Un file che il telefono non ritira in due settimane si toglie dalla coda (e si dice). */
export const AL_TELEFONO_SCADE_MS = 14 * 24 * 60 * 60_000
/** Le consegne finite restano nell'elenco del PC per una settimana: per vedere com'è andata. */
export const AL_TELEFONO_STORIA_MS = 7 * 24 * 60 * 60_000
/** Una domanda di conferma senza risposta dopo un giorno: il file non parte. */
export const CONFERMA_SCADE_MS = 24 * 60 * 60_000

/* ------------------------------------------------------------------ */
/* Percorsi.                                                           */
/* ------------------------------------------------------------------ */

const RISERVATI = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i

/**
 * Un percorso relativo a un progetto, come arriva dal telefono: `''` è la
 * cartella del progetto, poi `src/main/index.ts`. Si **rifiuta** (non si
 * ripulisce) tutto quello che potrebbe uscire o ingannare Windows:
 * - risalite (`..`), percorsi assoluti (`C:`, `\\server`, `/`);
 * - i due punti (`file.txt:segreto` è un flusso nascosto di NTFS);
 * - i nomi riservati (`CON`, `NUL`…: leggerli aspetta per sempre);
 * - caratteri di controllo, e pezzi finiti con un punto o uno spazio
 *   (Windows li toglie da solo, e `cartella.` diventerebbe un'altra cosa).
 */
export function relativoSicuro(p: unknown): p is string {
  if (typeof p !== 'string') return false
  if (p === '') return true
  if (p.length > 1000) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f:*?"<>|]/.test(p)) return false
  if (/^[\\/]/.test(p)) return false
  const pezzi = p.split(/[\\/]/)
  return pezzi.every((x) => x !== '' && x !== '.' && x !== '..' && !/[. ]$/.test(x) && !RISERVATI.test(x))
}

/** Il percorso relativo con le barre `/`, come lo mostrano telefono e pagina. */
export function conBarre(p: string): string {
  return p.split(/[\\/]+/).filter((x) => x !== '').join('/')
}

/** La cartella che contiene `p` (`''` è il progetto); `undefined` se `p` è già il progetto. */
export function cartellaSopra(p: string): string | undefined {
  const b = conBarre(p)
  if (b === '') return undefined
  const i = b.lastIndexOf('/')
  return i < 0 ? '' : b.slice(0, i)
}

/** Le briciole: il progetto, poi ogni cartella fino a quella aperta. */
export function briciole(nomeProgetto: string, p: string): { nome: string; percorso: string }[] {
  const fuori = [{ nome: nomeProgetto, percorso: '' }]
  let fin = ''
  for (const x of conBarre(p).split('/').filter((s) => s !== '')) {
    fin = fin === '' ? x : `${fin}/${x}`
    fuori.push({ nome: x, percorso: fin })
  }
  return fuori
}

/** Le cartelle che non si mostrano: il magazzino di git, che dal telefono non serve a niente. */
export function nascosta(nome: string): boolean {
  return nome === '.git'
}

/**
 * Un progetto con una chat protetta dal PIN, chiusa per chi guarda: i suoi
 * file non si vedono. `chat` è la chat aperta da sbloccare (`/api/pin/sblocca`),
 * se ce n'è una aperta; altrimenti il PIN si mette aprendo la chat.
 */
export function rifiutoProgettoChiuso(titolo?: string, chat?: string): { errore: string; pin: 'chiusa'; chat?: string } {
  const quale = titolo !== undefined && titolo !== '' ? `la chat «${titolo}»` : 'una chat'
  return {
    errore: `Progetto protetto: ${quale} di questo progetto ha il PIN, e i suoi file si vedono solo dopo averlo messo. ${chat !== undefined ? 'Mettilo qui.' : 'Apri la chat e mettilo lì, poi torna qui.'}`,
    pin: 'chiusa',
    ...(chat !== undefined ? { chat } : {})
  }
}

/** Normalizzato per confrontare due cartelle: barre e maiuscole come le vede Windows. */
export function chiaveCartella(p: string, windows = true): string {
  const s = p.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  return windows ? s.toLowerCase() : s
}

/**
 * Una cartella si può mostrare come progetto? Non la radice di un disco, non
 * la cartella dell'utente né una che la contiene: se qualcuno ha aperto una
 * chat lì, da «progetto» diventerebbe tutto il PC (le chiavi di `.ssh`, le
 * credenziali di Claude Code…).
 */
export function radiceAmmessa(p: string, home: string, windows = true): boolean {
  const c = chiaveCartella(p, windows)
  // La radice di una condivisione di rete (`\\server\cartella`) vale come un disco.
  if (/^[\\/]{2}[^\\/]+([\\/]+[^\\/]+)?[\\/]*$/.test(p.trim())) return false
  if (c === '' || /^[a-z]:$/i.test(c) || c === '/') return false
  const h = chiaveCartella(home, windows)
  if (h !== '' && (c === h || h.startsWith(`${c}/`))) return false
  return true
}

/** L'ultima parte di un percorso: il nome del progetto. */
export function nomeCartella(p: string): string {
  const pezzi = p.split(/[\\/]+/).filter((x) => x !== '')
  return pezzi[pezzi.length - 1] ?? p
}

/** I progetti da mostrare: ammessi, una volta sola, in ordine di nome. */
export function progettiDaMostrare(candidati: string[], home: string, windows = true): { nome: string; percorso: string }[] {
  const visti = new Set<string>()
  const fuori: { nome: string; percorso: string }[] = []
  for (const p of candidati) {
    if (typeof p !== 'string' || p.trim() === '') continue
    const c = chiaveCartella(p, windows)
    if (visti.has(c) || !radiceAmmessa(p, home, windows)) continue
    visti.add(c)
    fuori.push({ nome: nomeCartella(p), percorso: p })
  }
  const nomi = new Intl.Collator('it', { numeric: true, sensitivity: 'base' })
  return fuori.sort((a, b) => nomi.compare(a.nome, b.nome) || nomi.compare(a.percorso, b.percorso))
}

/** Due progetti con lo stesso nome (in due dischi, o due copie): si distinguono dal percorso. */
export function nomiDistinti(progetti: { nome: string; percorso: string }[]): { nome: string; percorso: string; doppio: boolean }[] {
  const quanti = new Map<string, number>()
  for (const p of progetti) quanti.set(p.nome.toLowerCase(), (quanti.get(p.nome.toLowerCase()) ?? 0) + 1)
  return progetti.map((p) => ({ ...p, doppio: (quanti.get(p.nome.toLowerCase()) ?? 0) > 1 }))
}

/* ------------------------------------------------------------------ */
/* Anteprima.                                                          */
/* ------------------------------------------------------------------ */

export type TipoAnteprima = 'testo' | 'immagine' | 'pdf' | 'altro'

const TESTO = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv', 'tsv',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'kt', 'kts', 'java', 'py', 'rb', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'swift', 'php', 'html', 'htm', 'css', 'scss', 'less', 'xml', 'svg', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd',
  'gradle', 'properties', 'gitignore', 'gitattributes', 'editorconfig', 'dockerfile', 'makefile', 'lock', 'vue', 'svelte',
  'r', 'lua', 'pl', 'dart', 'scala', 'tex', 'rst', 'adoc', 'srt', 'vtt'
])
const IMMAGINE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }
/** I file senza estensione che sono testo lo stesso. */
const TESTO_PER_NOME = new Set(['dockerfile', 'makefile', 'license', 'readme', 'changelog', 'procfile', '.gitignore', '.env', '.npmrc', '.editorconfig'])

function estensioneDi(nome: string): string {
  const p = nome.lastIndexOf('.')
  return p >= 0 ? nome.slice(p + 1).toLowerCase() : ''
}

/** Come si guarda un file, dal nome: lo stesso giudizio nella pagina e nell'app (`FileVista.tipo`). */
export function tipoAnteprima(nome: string): TipoAnteprima {
  const e = estensioneDi(nome)
  if (e in IMMAGINE) return 'immagine'
  if (e === 'pdf') return 'pdf'
  if (TESTO.has(e) || TESTO_PER_NOME.has(nome.toLowerCase())) return 'testo'
  return 'altro'
}

/** Il tipo MIME per scaricare e condividere: quello vero per i noti, generico per il resto. */
export function mimeDi(nome: string): string {
  const e = estensioneDi(nome)
  if (e in IMMAGINE) return IMMAGINE[e] as string
  if (e === 'pdf') return 'application/pdf'
  if (e === 'json') return 'application/json'
  if (e === 'html' || e === 'htm') return 'text/plain'
  if (e === 'csv') return 'text/csv'
  if (e === 'zip') return 'application/zip'
  if (e === 'mp4') return 'video/mp4'
  if (e === 'mp3') return 'audio/mpeg'
  if (tipoAnteprima(nome) === 'testo') return 'text/plain'
  return 'application/octet-stream'
}

/** Un buffer è testo? Niente byte zero nei primi 8 KB: la stessa prova di git. */
export function sembraTesto(b: Uint8Array): boolean {
  const n = Math.min(b.length, 8192)
  for (let i = 0; i < n; i++) if (b[i] === 0) return false
  return true
}

/* ------------------------------------------------------------------ */
/* La coda verso il telefono.                                          */
/* ------------------------------------------------------------------ */

/**
 * - `conferma`: chiesto da una chat per un file fuori dalla sua cartella;
 *   aspetta il sì di Nicholas nelle Domande, la copia non c'è ancora.
 * - `attesa`: la copia è pronta, il telefono non l'ha ancora ritirata.
 * - `viaggio`: il telefono ha cominciato a scaricarla.
 * - `consegnata`: il telefono l'ha tutta e l'impronta torna.
 * - `annullata`, `rifiutata` (no nelle Domande), `scaduta`: non arriverà.
 */
export type StatoConsegna = 'conferma' | 'attesa' | 'viaggio' | 'consegnata' | 'annullata' | 'rifiutata' | 'scaduta'

export type Consegna = {
  id: string
  /** Per chi: la chiave del telefono (`tel:<dispositivo>`, o `pc:tel:<dispositivo>@<PC>` se passa dal ponte). */
  a: string
  /** Il nome del telefono, per chi guarda l'elenco. */
  aNome: string
  nome: string
  byte: number
  sha256?: string
  /** Il file com'era sul PC: si mostra, non si riapre (la copia è a parte). */
  origine: string
  /** Chi l'ha mandato: dal pannello del PC, o dalla chat (con il suo titolo). */
  da: 'pc' | 'chat'
  daChat?: string
  /** La sessione della chat che l'ha chiesto: solo lei ne chiede lo stato. */
  daSessione?: string
  /** Il nome di questo PC, scritto nella notifica del telefono. */
  daPc: string
  nota?: string
  creata: string
  stato: StatoConsegna
  /** Fin dove il telefono ha scaricato (lo dice lui, chiedendo i pezzi). */
  ricevuti?: number
  finitaIl?: string
  /** Perché non arriverà, per esteso. */
  motivo?: string
}

/**
 * La grandezza da leggere: «40 byte», «12 KB», «3,4 MB». Provato dal vero
 * (08/10): un file di 40 byte detto «0,0 MB» alla chat sembrava vuoto.
 */
export function misura(byte: number): string {
  if (byte < 1024) return `${byte} byte`
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`
  return inMb(byte)
}

/** Ancora viva: aspetta qualcosa (una conferma, il telefono). */
export function inCorso(c: Consegna): boolean {
  return c.stato === 'conferma' || c.stato === 'attesa' || c.stato === 'viaggio'
}

/** Quelle che il telefono deve ritirare. */
export function daRitirare(coda: Consegna[], a: string): Consegna[] {
  return coda.filter((c) => c.a === a && (c.stato === 'attesa' || c.stato === 'viaggio'))
    .sort((x, y) => x.creata.localeCompare(y.creata))
}

/** Il file si può mettere in coda per quel telefono? Se no, perché (per esteso). */
export function controllaConsegna(
  f: { nome: string; byte: number; cartella?: boolean },
  coda: Consegna[],
  a: string
): { ok: true } | { ok: false; stato: number; errore: string } {
  if (f.cartella === true) return { ok: false, stato: 400, errore: 'Una cartella intera non si manda: scegli i file uno per uno, oppure mettila in uno .zip e manda quello.' }
  if (f.byte > AL_TELEFONO_MAX_BYTE) return { ok: false, stato: 413, errore: `«${f.nome}» è di ${inMb(f.byte)}: il limite è ${inMb(AL_TELEFONO_MAX_BYTE)}. Per i file più grandi usa il Drive o un cavo.` }
  const sue = coda.filter((c) => c.a === a && inCorso(c))
  if (sue.length >= AL_TELEFONO_MAX_IN_CODA) return { ok: false, stato: 429, errore: `Ci sono già ${sue.length} file che aspettano questo telefono: è il massimo. Aspetta che li ritiri (apri l’app), o annullane qualcuno dal PC.` }
  const totale = sue.reduce((s, c) => s + c.byte, 0)
  if (totale + f.byte > AL_TELEFONO_MAX_TOTALE) return { ok: false, stato: 413, errore: `I file che aspettano questo telefono sono già ${inMb(totale)}: con questo si passerebbe ${inMb(AL_TELEFONO_MAX_TOTALE)}, il massimo. Aspetta che li ritiri, o annullane qualcuno.` }
  return { ok: true }
}

/** Le consegne vecchie: quelle mai ritirate scadono, quelle finite escono dall'elenco. */
export function potaCoda(coda: Consegna[], adesso: number): { coda: Consegna[]; scadute: Consegna[]; tolte: Consegna[] } {
  const scadute: Consegna[] = []
  const tolte: Consegna[] = []
  const fuori: Consegna[] = []
  for (const c of coda) {
    const eta = adesso - Date.parse(c.creata)
    if (c.stato === 'conferma' && eta > CONFERMA_SCADE_MS) {
      const s: Consegna = { ...c, stato: 'scaduta', finitaIl: new Date(adesso).toISOString(), motivo: 'Nessuno ha risposto alla domanda di conferma entro un giorno: il file non è partito.' }
      scadute.push(s); fuori.push(s); continue
    }
    if ((c.stato === 'attesa' || c.stato === 'viaggio') && eta > AL_TELEFONO_SCADE_MS) {
      const s: Consegna = { ...c, stato: 'scaduta', finitaIl: new Date(adesso).toISOString(), motivo: 'Il telefono non l’ha ritirato in due settimane: la copia è stata tolta dal PC.' }
      scadute.push(s); fuori.push(s); continue
    }
    if (!inCorso(c) && adesso - Date.parse(c.finitaIl ?? c.creata) > AL_TELEFONO_STORIA_MS) { tolte.push(c); continue }
    fuori.push(c)
  }
  return { coda: fuori, scadute, tolte }
}

function ora(iso: string | undefined): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const due = (x: number): string => String(x).padStart(2, '0')
  return `${due(d.getDate())}/${due(d.getMonth() + 1)} alle ${due(d.getHours())}:${due(d.getMinutes())}`
}

/** Lo stato in parole, per l'elenco del PC: cosa vuol dire e cosa succede dopo. */
export function testoStato(c: Consegna): string {
  switch (c.stato) {
    case 'conferma': return 'Aspetta il tuo sì nelle Domande: l’ha chiesto una chat per un file fuori dalla sua cartella.'
    case 'attesa': return `In coda per ${c.aNome}: arriva quando l’app si collega a questo PC (aperta, o al controllo in sottofondo).`
    case 'viaggio': return `In viaggio verso ${c.aNome}: ${c.ricevuti !== undefined && c.byte > 0 ? `${Math.min(100, Math.floor(c.ricevuti * 100 / c.byte))}%` : 'cominciato'}. Se la rete cade, riprende da lì.`
    case 'consegnata': return `Consegnato a ${c.aNome} il ${ora(c.finitaIl)}.`
    case 'annullata': return `Annullato${c.finitaIl !== undefined ? ` il ${ora(c.finitaIl)}` : ''}: non arriverà.`
    case 'rifiutata': return c.motivo ?? 'Rifiutato nelle Domande: non è partito.'
    case 'scaduta': return c.motivo ?? 'Scaduto: non arriverà.'
  }
}

/** L'esito come lo legge una chat che ha usato lo strumento. */
export function esitoPerLaChat(c: Consegna): string {
  const chi = `«${c.nome}» (${misura(c.byte)})`
  switch (c.stato) {
    case 'conferma': return `In attesa di conferma: ${chi} è fuori dalla cartella della chat, quindi Nicholas deve dire sì nelle Domande di SierraDeck. Id dell’invio: ${c.id} (controlla con stato_invio_al_telefono).`
    case 'attesa': return `In coda: ${chi} aspetta ${c.aNome}, che lo riceve quando l’app si collega a questo PC. Id dell’invio: ${c.id}.`
    case 'viaggio': return `In viaggio: ${c.aNome} sta scaricando ${chi}${c.ricevuti !== undefined && c.byte > 0 ? ` (${Math.min(100, Math.floor(c.ricevuti * 100 / c.byte))}%)` : ''}. Id dell’invio: ${c.id}.`
    case 'consegnata': return `Consegnato: ${chi} è sul telefono ${c.aNome} (${ora(c.finitaIl)}).`
    case 'annullata': return `Annullato dal PC: ${chi} non arriverà sul telefono.`
    case 'rifiutata': return `Rifiutato: ${c.motivo ?? 'Nicholas ha detto no nelle Domande.'}`
    case 'scaduta': return `Scaduto: ${c.motivo ?? 'non è arrivato in tempo.'}`
  }
}

/** La domanda di conferma, per esteso: chi chiede, cosa, dove sta, a chi va. */
export function testoConferma(c: Consegna): string {
  return `La chat «${c.daChat ?? 'senza titolo'}» vuole mandare al telefono ${c.aNome} il file «${c.nome}» (${misura(c.byte)}), che sta FUORI dalla sua cartella: ${c.origine}.${c.nota !== undefined ? ` Nota della chat: ${c.nota}` : ''} Lo mando? Rispondi «Sì, mandalo» oppure «No».`
}

export const OPZIONI_CONFERMA = ['Sì, mandalo', 'No, non mandarlo'] as const

/** La risposta nelle Domande: sì solo se lo dice chiaramente. */
export function confermaDaRisposta(r: string): boolean {
  const t = r.trim().toLowerCase()
  if (t.startsWith('no')) return false
  return /^(s[iì]|ok|va bene|manda|yes|certo)/.test(t)
}

/** L'id di una domanda di conferma nelle Domande: si riconosce dal prefisso. */
export const PREFISSO_DOMANDA = 'al-telefono:'
export function idDomandaConferma(id: string): string { return `${PREFISSO_DOMANDA}${id}` }
export function leggiIdDomandaConferma(id: string): string | undefined {
  return id.startsWith(PREFISSO_DOMANDA) ? id.slice(PREFISSO_DOMANDA.length) : undefined
}

/** L'id di una consegna: lo sceglie il PC. */
export function idConsegnaValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)
}

/* ------------------------------------------------------------------ */
/* I telefoni a cui si può mandare.                                    */
/* ------------------------------------------------------------------ */

export type TelefonoNoto = {
  /** La chiave della coda: `tel:<id>` (accoppiato qui) o `pc:tel:<id>@<PC>` (dal ponte). */
  chiave: string
  nome: string
  /** Accoppiato a questo PC, o visto passare dal ponte di un altro PC. */
  via: 'accoppiato' | 'ponte'
  /** Il nome del PC a cui è accoppiato, se è un telefono del ponte. */
  tramite?: string
  ultimoAccesso?: string
}

/** Un telefono che passa dal ponte: `pc:tel:<dispositivo>@<PC>`. */
export function leggiTelefonoDelPonte(visore: string): { dispositivo: string; pc: string } | undefined {
  const m = /^pc:tel:([^@]+)@(.+)$/.exec(visore)
  return m === null ? undefined : { dispositivo: m[1] as string, pc: m[2] as string }
}

/** Il visore è un telefono (accoppiato qui o dal ponte)? Un altro PC o lo schermo di qui no. */
export function eTelefono(visore: string): boolean {
  return visore.startsWith('tel:') || leggiTelefonoDelPonte(visore) !== undefined
}

/** Il telefono a cui manda una chat se non dice quale: quello che si è fatto vivo per ultimo. */
export function telefonoPredefinito(telefoni: TelefonoNoto[]): TelefonoNoto | undefined {
  return [...telefoni].sort((a, b) => (b.ultimoAccesso ?? '').localeCompare(a.ultimoAccesso ?? ''))[0]
}

/** Quello che il pannello del PC chiede: i telefoni e la coda, con lo stato già scritto in parole. */
export type StatoAlTelefono = { telefoni: TelefonoNoto[]; elenco: (Consegna & { testo: string })[] }
export type EsitoMandaAlTelefono = { ok: true } | { ok: false; errore: string }
