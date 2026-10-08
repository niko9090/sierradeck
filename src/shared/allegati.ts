/**
 * I file dal telefono a una chat o a un autopilota (0.50.0).
 *
 * Nicholas (06/10): condividere un file DAL TELEFONO a una chat o a un
 * autopilota, **dentro il progetto di quella chat**, non in una cartella
 * generica del PC. Il file arriva a pezzi (il corpo di una richiesta del
 * Client è al massimo 256 KB, e una rete del telefono cade), si salva in
 * `<cartella della chat>/.sierradeck/allegati/AAAA-MM-GG/<nome ripulito>`,
 * fuori da git, e la chat riceve una riga corta che glielo dice.
 *
 * Qui le regole pure: il nome ripulito, i tipi che non si accettano, il
 * percorso con il nome unico, i pezzi e la ripresa, la destinazione, i
 * limiti per minuto, le righe di avviso. Chi scrive su disco sta nel main
 * (`src/main/allegati.ts`), chi chiama nelle rotte del Client.
 */

/** Il limite iniziale, scritto anche nei testi: un PDF, delle foto, un archivio piccolo. */
export const ALLEGATO_MAX_BYTE = 100 * 1024 * 1024
/**
 * Un pezzo: 96 KB di file, 128 KB in base64. Sta sotto il tetto del corpo
 * JSON (256 KB) anche impacchettato dal ponte, e sotto quello di un
 * messaggio WebRTC cifrato verso un altro PC.
 */
export const PEZZO_BYTE = 96 * 1024
/** Dove finiscono, relativo alla cartella della chat. Escluso da git con un `.gitignore` suo. */
export const CARTELLA_ALLEGATI = '.sierradeck/allegati'
/** Quanti file nuovi per minuto da uno stesso telefono o PC. */
export const ALLEGATI_PER_MINUTO = 20
/** La nota che accompagna il file: una riga, non una lettera. */
export const NOTA_MAX = 500
/** Un invio lasciato a metà si butta dopo un giorno. */
export const INVIO_SCADE_MS = 24 * 60 * 60_000

/**
 * I tipi che non si accettano: quelli che Windows **esegue** con un doppio
 * clic. Il file non viene mai aperto da SierraDeck, ma resta nel progetto, e
 * un `.exe` arrivato dal telefono a un doppio clic di distanza è un rischio
 * che non serve correre. Chi ne ha bisogno lo mette in uno .zip.
 */
export const ESTENSIONI_VIETATE: readonly string[] = [
  'exe', 'com', 'scr', 'pif', 'msi', 'msp', 'msix', 'msixbundle', 'appx', 'appxbundle',
  'bat', 'cmd', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'hta', 'cpl', 'lnk', 'url', 'scf',
  'reg', 'dll', 'sys', 'drv', 'ocx', 'inf', 'application', 'gadget', 'msc', 'jar', 'ps1xml', 'settingcontent-ms'
]

const RISERVATI = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i
const NOME_MAX = 120

export type EsitoNome = { ok: true; nome: string } | { ok: false; errore: string }

/**
 * Il nome come arriva dal telefono, reso un nome di file sicuro su Windows.
 *
 * Un nome con dentro un percorso (`../`, `\`, `C:/…`) si **rifiuta**: nessun
 * telefono lo manda per sbaglio, e tenerne l'ultima parte vorrebbe dire
 * accettare in silenzio un tentativo di uscire dalla cartella. Il resto si
 * ripulisce: i caratteri che Windows non vuole diventano `_`, i nomi riservati
 * (`CON`, `NUL`…) prendono un `_` davanti, i punti e gli spazi in fondo
 * spariscono, e un nome troppo lungo si accorcia tenendo l'estensione.
 */
export function ripulisciNome(grezzo: string): EsitoNome {
  const testo = String(grezzo ?? '').normalize('NFC').trim()
  if (testo === '') return { ok: false, errore: 'Il file non ha un nome.' }
  if (testo.includes('/') || testo.includes('\\') || testo === '.' || testo === '..' || /^[a-z]:/i.test(testo)) {
    return { ok: false, errore: `Il nome «${testo.slice(0, 80)}» contiene un percorso: si accetta solo il nome del file.` }
  }
  let nome = testo
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
  if (nome === '' || /^\.+$/.test(nome)) return { ok: false, errore: 'Il nome del file è vuoto dopo averlo ripulito.' }
  const punto = nome.lastIndexOf('.')
  const base = punto > 0 ? nome.slice(0, punto) : nome
  const est = punto > 0 ? nome.slice(punto) : ''
  if (RISERVATI.test(base.split('.')[0] ?? '')) nome = `_${nome}`
  if (nome.length > NOME_MAX) {
    const estTenuta = est.length <= 16 ? est : ''
    nome = nome.slice(0, NOME_MAX - estTenuta.length).replace(/[. ]+$/g, '') + estTenuta
  }
  return { ok: true, nome }
}

/** L'estensione in minuscolo, senza punto ('' se non c'è). */
export function estensione(nome: string): string {
  const p = nome.lastIndexOf('.')
  return p > 0 ? nome.slice(p + 1).toLowerCase() : ''
}

export function tipoVietato(nome: string): boolean {
  return ESTENSIONI_VIETATE.includes(estensione(nome))
}

export type EsitoControllo = { ok: true; nome: string } | { ok: false; stato: number; errore: string }

/** In MB, per i testi. */
export function inMb(byte: number): string {
  const mb = byte / (1024 * 1024)
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1).replace('.', ',')} MB`
}

/**
 * Nome, tipo e grandezza di un file, prima di accettarne il primo byte.
 * 400 = nome, 415 = tipo, 413 = grandezza.
 */
export function controllaAllegato(p: { nome: unknown; byte: unknown }): EsitoControllo {
  const n = ripulisciNome(typeof p.nome === 'string' ? p.nome : '')
  if (!n.ok) return { ok: false, stato: 400, errore: n.errore }
  if (tipoVietato(n.nome)) {
    return { ok: false, stato: 415, errore: `I file .${estensione(n.nome)} non si mandano: sono programmi che Windows esegue con un doppio clic. Se ti serve davvero, mettilo in uno .zip.` }
  }
  const byte = typeof p.byte === 'number' && Number.isInteger(p.byte) ? p.byte : -1
  if (byte < 0) return { ok: false, stato: 400, errore: 'Manca la grandezza del file.' }
  if (byte > ALLEGATO_MAX_BYTE) {
    return { ok: false, stato: 413, errore: `Il file è di ${inMb(byte)}: il limite è ${inMb(ALLEGATO_MAX_BYTE)}. Per i file più grandi usa il Drive o una chiavetta.` }
  }
  return { ok: true, nome: n.nome }
}

/** Il giorno della cartella, `AAAA-MM-GG`, nell'ora di questo PC. */
export function giornoCartella(d: Date): string {
  const due = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
}

/**
 * Il percorso relativo alla cartella della chat, con un nome che non
 * schiaccia niente: `foto.jpg`, poi `foto (2).jpg`, `foto (3).jpg`…
 * `esiste` riceve il percorso relativo (con `/`).
 */
export function percorsoAllegato(nome: string, giorno: string, esiste: (relativo: string) => boolean): string {
  return percorsoInCartella(`${CARTELLA_ALLEGATI}/${giorno}`, nome, esiste)
}

/**
 * Lo stesso, in una cartella qualunque del progetto (0.54.0: «Carica» dalla
 * sezione File del telefono). `cartella` è relativa, con `/`; `''` è il progetto.
 */
export function percorsoInCartella(cartella: string, nome: string, esiste: (relativo: string) => boolean): string {
  const pre = cartella === '' ? '' : `${cartella}/`
  const p = nome.lastIndexOf('.')
  const base = p > 0 ? nome.slice(0, p) : nome
  const est = p > 0 ? nome.slice(p) : ''
  for (let i = 1; i < 1000; i++) {
    const candidato = `${pre}${i === 1 ? nome : `${base} (${i})${est}`}`
    if (!esiste(candidato)) return candidato
  }
  return `${pre}${base} (${Date.now()})${est}`
}

/* ------------------------------------------------------------------ */
/* I pezzi e la ripresa.                                               */
/* ------------------------------------------------------------------ */

/** L'id di un invio lo sceglie chi manda: così, se la rete cade, ritrova il suo. */
export function idInvioValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)
}

export function quantiPezzi(byte: number, pezzo: number = PEZZO_BYTE): number {
  return Math.max(1, Math.ceil(byte / pezzo))
}

/** Il prossimo pezzo da mandare, da dove il PC è arrivato; `undefined` = finito. */
export function prossimoPezzo(ricevuti: number, byte: number, pezzo: number = PEZZO_BYTE): { da: number; lunghezza: number } | undefined {
  if (ricevuti >= byte) return undefined
  return { da: ricevuti, lunghezza: Math.min(pezzo, byte - ricevuti) }
}

export type EsitoPezzo =
  | { ok: true; ricevuti: number; doppio?: true }
  | { ok: false; stato: number; ricevuti: number; errore: string }

/**
 * Un pezzo che arriva: si accetta solo quello che attacca esattamente dove
 * il file è arrivato. Un pezzo già ricevuto (la risposta era andata persa e
 * il telefono lo rimanda) si conferma senza riscriverlo; uno fuori posto
 * risponde 409 con `ricevuti`, e chi manda riparte da lì.
 */
export function accettaPezzo(s: { ricevuti: number; byte: number }, da: number, lunghezza: number, pezzo: number = PEZZO_BYTE): EsitoPezzo {
  if (!Number.isInteger(da) || da < 0 || !Number.isInteger(lunghezza) || lunghezza <= 0) {
    return { ok: false, stato: 400, ricevuti: s.ricevuti, errore: 'Pezzo non valido.' }
  }
  if (lunghezza > pezzo || da + lunghezza > s.byte) {
    return { ok: false, stato: 413, ricevuti: s.ricevuti, errore: 'Il pezzo va oltre la grandezza dichiarata del file.' }
  }
  if (da + lunghezza <= s.ricevuti) return { ok: true, ricevuti: s.ricevuti, doppio: true }
  if (da !== s.ricevuti) return { ok: false, stato: 409, ricevuti: s.ricevuti, errore: `Pezzo fuori posto: il computer ha ${s.ricevuti} byte, riparti da lì.` }
  return { ok: true, ricevuti: s.ricevuti + lunghezza }
}

/** Il base64 di un pezzo: solo i caratteri del base64, e non più lungo di un pezzo. */
export function pezzoBase64Valido(dati: unknown, pezzo: number = PEZZO_BYTE): dati is string {
  return typeof dati === 'string' && dati.length > 0 && dati.length <= Math.ceil(pezzo / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(dati)
}

export function percento(ricevuti: number, byte: number): number {
  return byte <= 0 ? 100 : Math.min(100, Math.floor((ricevuti * 100) / byte))
}

/* ------------------------------------------------------------------ */
/* La destinazione.                                                    */
/* ------------------------------------------------------------------ */

export type Destinazione = { tipo: 'chat'; chat: string } | { tipo: 'autopilota'; autopilota: string }

/**
 * Una cartella di un progetto (0.54.0): «Carica» dalla sezione File. Il
 * progetto e la cartella li controlla chi sfoglia (`file-progetti.ts`): qui
 * solo la forma.
 */
export function leggiCartellaDestinazione(corpo: unknown): { progetto: string; cartella: string } | undefined {
  const o = typeof corpo === 'object' && corpo !== null ? corpo as Record<string, unknown> : {}
  if (typeof o.progetto !== 'string' || o.progetto.trim() === '') return undefined
  return { progetto: o.progetto.trim(), cartella: typeof o.cartella === 'string' ? o.cartella : '' }
}

export function leggiDestinazione(corpo: unknown): Destinazione | undefined {
  const o = typeof corpo === 'object' && corpo !== null ? corpo as Record<string, unknown> : {}
  const chat = typeof o.chat === 'string' ? o.chat.trim() : ''
  const ap = typeof o.autopilota === 'string' ? o.autopilota.trim() : ''
  if (chat !== '' && ap === '') return { tipo: 'chat', chat }
  if (ap !== '' && chat === '') return { tipo: 'autopilota', autopilota: ap }
  return undefined
}

export type DestinazioneDecisa =
  | { ok: true; tipo: 'chat'; id: string; titolo: string; cwd: string }
  | { ok: true; tipo: 'autopilota'; id: string; titolo: string; cwd: string }
  | { ok: false; stato: number; errore: string }

/**
 * Dove va il file: la cartella della chat (o dell'autopilota) **su questo
 * PC**. Una chat di un altro PC non si decide qui: il telefono la raggiunge
 * con il ponte (0.48.0), e là è una chat di quel PC, che decide lui.
 */
export function decidiDestinazione(
  d: Destinazione | undefined,
  p: { chat: { id: string; titolo: string; cwd: string }[]; autopiloti: { id: string; nome: string; cwd: string }[]; altroPc?: (id: string) => boolean }
): DestinazioneDecisa {
  if (d === undefined) return { ok: false, stato: 400, errore: 'Manca a chi mandarlo: una chat o un autopilota.' }
  if (d.tipo === 'chat') {
    if (p.altroPc?.(d.chat) === true) return { ok: false, stato: 400, errore: 'È una chat di un altro PC: il file va mandato a quel PC, attraverso il ponte del telefono.' }
    const c = p.chat.find((x) => x.id === d.chat)
    if (c === undefined) return { ok: false, stato: 404, errore: 'Quella chat non è aperta su questo computer.' }
    if (c.cwd === '') return { ok: false, stato: 409, errore: 'Quella chat non ha ancora una cartella: il file non avrebbe un progetto dove stare.' }
    return { ok: true, tipo: 'chat', id: c.id, titolo: c.titolo, cwd: c.cwd }
  }
  const a = p.autopiloti.find((x) => x.id === d.autopilota)
  if (a === undefined) return { ok: false, stato: 404, errore: 'Quell’autopilota non c’è su questo computer.' }
  if (a.cwd === '') return { ok: false, stato: 409, errore: 'Quell’autopilota non ha una cartella di lavoro.' }
  return { ok: true, tipo: 'autopilota', id: a.id, titolo: a.nome, cwd: a.cwd }
}

/* ------------------------------------------------------------------ */
/* Quanti per minuto.                                                  */
/* ------------------------------------------------------------------ */

/**
 * Quanti file nuovi per minuto da uno stesso mittente (telefono o PC). Un
 * telefono che ne manda trenta in un minuto è un telefono impazzito, o non
 * è il tuo: il ventunesimo aspetta.
 */
export function creaLimitatore(max: number = ALLEGATI_PER_MINUTO, finestraMs = 60_000): (chi: string, adesso: number) => boolean {
  const visti = new Map<string, number[]>()
  return (chi, adesso) => {
    const tenuti = (visti.get(chi) ?? []).filter((t) => adesso - t < finestraMs)
    if (tenuti.length >= max) { visti.set(chi, tenuti); return false }
    tenuti.push(adesso)
    visti.set(chi, tenuti)
    return true
  }
}

/* ------------------------------------------------------------------ */
/* Le righe di avviso.                                                 */
/* ------------------------------------------------------------------ */

/** La nota in una riga sola: un a capo nel terminale manderebbe il messaggio a metà. */
export function notaPulita(nota: unknown): string {
  if (typeof nota !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return nota.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTA_MAX)
}

const conPunto = (t: string): string => (/[.!?…]$/.test(t) ? t : `${t}.`)

/**
 * La riga per la chat: corta, come la vuole Nicholas. `percorso` è relativo
 * alla cartella della chat, che è dove lavora Claude Code.
 */
export function rigaPerChat(p: { chi?: string; nome: string; percorso: string; nota?: string }): string {
  const nota = notaPulita(p.nota)
  return `${p.chi ?? 'Nicholas'} ti ha mandato il file ${p.nome} (${p.percorso}).${nota !== '' ? ` Nota: ${conPunto(nota)}` : ''} Guardalo.`
}

/** Il messaggio per il dialogo dell'autopilota: con il percorso intero, perché lui governa più cartelle. */
export function rigaPerAutopilota(p: { chi?: string; nome: string; percorso: string; nota?: string }): string {
  const nota = notaPulita(p.nota)
  return `${p.chi ?? 'Nicholas'} ti ha mandato il file ${p.nome} (allegato: ${p.percorso}).${nota !== '' ? ` Nota: ${conPunto(nota)}` : ''} Guardalo e usalo nel lavoro: se serve a una delle tue chat, diglielo nella prossima istruzione.`
}

/** Il contenuto del `.gitignore` della cartella degli allegati. */
export const GITIGNORE_ALLEGATI = '# I file mandati dal telefono con SierraDeck: non vanno in git.\n# Se il progetto li vuole in git, cambia o togli questo file: SierraDeck non lo riscrive.\n*\n'
