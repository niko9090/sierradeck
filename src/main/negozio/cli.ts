import { execFile } from 'node:child_process'
import { resolveClaudeCommand } from '../config'
import {
  esitoCli, statoPlugin, aggiornamentoDisponibile, cosaCambia, motivoLeggibile,
  type EsitoCli, type PluginVoce, type AzioneNegozio
} from '@shared/negozio'
import { versioniCatalogo } from './lettura'

/**
 * Il negozio, lato plugin: parla con `claude plugin …`, non coi file.
 *
 * I plugin di Claude Code stanno in cartelle «opache» gestite da lui, e lo stato
 * abilitato/disabilitato vive nelle impostazioni con regole di precedenza sue.
 * Rifarle a mano vorrebbe dire inseguire un formato che non è nostro. Il CLI è la
 * fonte di verità: `claude plugin list --available --json` dà in un colpo solo
 * ciò che è installato e ciò che si può installare, con l'`id` canonico
 * (`nome@marketplace`) che serve per installare, abilitare, disabilitare.
 *
 * Dalla 0.53.0 ogni azione passa `--json` (Claude Code 2.1.x): una riga con
 * `outcome` e `failureCode` invece dei glifi ✔/✘ da indovinare. E l'install non
 * passa più `--yes` al buio: quel flag accetta il comando che un marketplace
 * dichiara di voler eseguire, e un comando di un marketplace di terze parti
 * si mostra a chi installa, non si accetta per lui.
 *
 * Tutto **asincrono** e con un tetto di tempo: un'installazione tira giù roba
 * dalla rete, e questo è il processo principale — non deve mai bloccare la
 * finestra come è già successo altrove. Niente shell: `execFile` passa gli
 * argomenti come array, così un nome di plugin non può diventare un comando.
 */

export type Plugin = PluginVoce

/** L'esito di un'azione, con la frase che dice cosa cambia quando è riuscita. */
export type Esito = EsitoCli & { fatto?: string }

const TIMEOUT_LETTURA = 30_000
const TIMEOUT_INSTALLA = 180_000
/** Il catalogo di oggi è sui 4 MB (3500 plugin): spazio largo per domani. */
const MAX_BUFFER = 32 * 1024 * 1024

function claude(): string {
  return resolveClaudeCommand(process.env)
}

/**
 * Un nome che il CLI puo' ricevere come **valore**, e mai come opzione.
 *
 * `execFile` passa gli argomenti in un array, quindi una virgoletta o un `&&`
 * non diventano un comando: quella strada era gia' chiusa. Restava l'altra —
 * un valore che comincia per `-` non viene letto come nome ma come **flag**, e
 * l'id arriva qui da fuori: dal telefono, che e' sulla rete di casa. `--help`
 * non fa danni; il punto e' che non tocca a noi sapere quali flag esistono nel
 * CLI di qualcun altro, oggi e fra sei mesi.
 *
 * La forma buona e' quella che il CLI stesso produce: `nome@marketplace`,
 * oppure il solo nome. Tutto il resto non e' un identificatore.
 */
const ID_PLUGIN = /^[A-Za-z0-9][A-Za-z0-9._-]*(@[A-Za-z0-9][A-Za-z0-9._-]*)?$/

export function idPluginValido(id: string): boolean {
  return ID_PLUGIN.test(id)
}

/** La risposta a un id che non e' un id: non si prova nemmeno a eseguirlo. */
function rifiuta(id: string): Esito {
  return { ok: false, messaggio: `identificatore non valido: ${JSON.stringify(id).slice(0, 80)}` }
}

/**
 * Perche' il CLI non ha risposto, detto per chi deve rimediare.
 *
 * `execFile` scartava `err`: «claude.exe non trovato» e «scaduto» finivano
 * entrambi in «Il negozio non risponde: elenco plugin fallito», che non dice
 * cosa fare.
 */
function motivoDi(err: { code?: unknown; killed?: boolean } | null, timeout: number): string | undefined {
  if (err === null) return undefined
  if (err.code === 'ENOENT') return 'claude.exe non trovato: installa Claude Code dalla Preparazione (Impostazioni) o mettilo nel PATH'
  if (err.killed === true) return `il CLI di Claude Code non ha risposto entro ${Math.round(timeout / 1000)} secondi`
  return undefined
}

export type Uscita = { ok: boolean; stdout: string; stderr: string; motivo?: string }

/** Esegue `claude …`. `cwd` conta per gli MCP: quelli «locali» e di progetto sono della cartella. */
export function esegui(args: string[], timeout: number, cwd?: string): Promise<Uscita> {
  return new Promise((resolve) => {
    execFile(
      claude(),
      args,
      { timeout, maxBuffer: MAX_BUFFER, windowsHide: true, ...(cwd !== undefined ? { cwd } : {}) },
      (err, stdout, stderr) => {
        const motivo = motivoDi(err, timeout)
        resolve({ ok: err === null, stdout: stdout ?? '', stderr: stderr ?? '', ...(motivo !== undefined ? { motivo } : {}) })
      }
    )
  })
}

type VoceCli = {
  pluginId?: string
  /** Gli elementi *installati* usano `id`, non `pluginId`. */
  id?: string
  name?: string
  description?: string
  marketplaceName?: string
  installCount?: number
  enabled?: boolean
  disabled?: boolean
  status?: string
  version?: string
  folderVersion?: string
  scope?: string
  installPath?: string
  source?: unknown
}

/** L'identificatore `nome@marketplace` di una voce, da qualunque campo arrivi:
 * gli elementi del catalogo hanno `pluginId`, quelli installati `id`. */
export function idDi(v: { pluginId?: string; id?: string; name?: string; marketplaceName?: string }): string | undefined {
  if (typeof v.pluginId === 'string' && v.pluginId !== '') return v.pluginId
  if (typeof v.id === 'string' && v.id !== '') return v.id
  if (typeof v.name === 'string' && typeof v.marketplaceName === 'string') return `${v.name}@${v.marketplaceName}`
  return undefined
}

/**
 * L'esito di un comando del CLI. Dalla 0.53.0 la strada buona è la riga
 * `--json` (vedi `esitoCli`); i glifi ✔/✘ restano il ripiego per un CLI che
 * non la stampa.
 */
export function interpreta(r: { ok: boolean; stdout: string; stderr: string }, azioneFallita: string): Esito {
  const e = esitoCli(r)
  if (!e.ok && (e.messaggio === undefined || e.messaggio === '')) return { ...e, messaggio: azioneFallita }
  return e
}

/** Se un plugin installato è abilitato: il CLI lo dice in un campo o nell'altro
 * a seconda della versione, quindi si guarda tutto ciò che potrebbe negarlo. */
function abilitatoDa(v: VoceCli): boolean {
  if (v.disabled === true) return false
  if (v.enabled === false) return false
  if (typeof v.status === 'string' && /disab/i.test(v.status)) return false
  return true
}

/** Lo `sha` di una sorgente git del catalogo, se c'è. */
function shaDi(source: unknown): string | undefined {
  if (source === null || typeof source !== 'object') return undefined
  const sha = (source as Record<string, unknown>).sha
  return typeof sha === 'string' && sha !== '' ? sha : undefined
}

/**
 * Dalla risposta vera di `plugin list --available --json` all'elenco del negozio.
 *
 * Il CLI 2.1.294 **toglie** dal catalogo i plugin già installati: la versione
 * che c'è nel catalogo per loro si legge dai marketplace scaricati
 * (`catalogo`), e per quelli presi da una cartella dal `folderVersion`.
 */
export function pluginDaCli(
  dati: { installed?: VoceCli[]; available?: VoceCli[] },
  catalogo: Map<string, { version?: string; sha?: string; description?: string }> = new Map()
): PluginVoce[] {
  const fuori: PluginVoce[] = []
  const visti = new Set<string>()
  for (const v of dati.installed ?? []) {
    const id = idDi(v)
    if (id === undefined || visti.has(id)) continue
    visti.add(id)
    const disponibile = (dati.available ?? []).find((a) => idDi(a) === id)
    const nelCatalogo = catalogo.get(id) ?? (disponibile !== undefined
      ? { ...(typeof disponibile.version === 'string' ? { version: disponibile.version } : {}), ...(shaDi(disponibile.source) !== undefined ? { sha: shaDi(disponibile.source) } : {}) }
      : undefined)
    const agg = aggiornamentoDisponibile(
      { ...(typeof v.version === 'string' ? { version: v.version } : {}), ...(typeof v.folderVersion === 'string' ? { folderVersion: v.folderVersion } : {}) },
      nelCatalogo
    )
    // Gli installati non portano la descrizione: la si prende dal catalogo.
    const descrizione = typeof v.description === 'string' ? v.description
      : typeof disponibile?.description === 'string' ? disponibile.description
        : catalogo.get(id)?.description ?? ''
    const installazioni = typeof disponibile?.installCount === 'number' ? disponibile.installCount : v.installCount
    const p: PluginVoce = {
      id,
      nome: v.name ?? disponibile?.name ?? id.split('@')[0] ?? id,
      descrizione,
      marketplace: v.marketplaceName ?? id.split('@')[1] ?? '',
      installato: true,
      abilitato: abilitatoDa(v),
      ...(typeof installazioni === 'number' ? { installazioni } : {}),
      ...(typeof v.version === 'string' ? { versione: v.version } : {}),
      ...(agg.aggiornamento ? { aggiornamento: true, ...(agg.nuova !== undefined ? { versioneNuova: agg.nuova } : {}) } : {}),
      ...(typeof v.scope === 'string' ? { ambito: v.scope } : {}),
      ...(typeof v.installPath === 'string' ? { percorso: v.installPath } : {})
    }
    fuori.push({ ...p, stato: statoPlugin(p) })
  }
  for (const v of dati.available ?? []) {
    const id = idDi(v)
    if (id === undefined || visti.has(id)) continue
    visti.add(id)
    const p: PluginVoce = {
      id,
      nome: v.name ?? id.split('@')[0] ?? id,
      descrizione: typeof v.description === 'string' ? v.description : '',
      marketplace: v.marketplaceName ?? id.split('@')[1] ?? '',
      installato: false,
      abilitato: false,
      ...(typeof v.installCount === 'number' ? { installazioni: v.installCount } : {})
    }
    fuori.push({ ...p, stato: statoPlugin(p) })
  }
  return fuori
}

/**
 * Il catalogo si legge in 3-5 secondi (3500 plugin): lo si tiene un minuto, e
 * lo si butta dopo ogni azione che lo cambia. Il telefono e il pannello lo
 * chiedono spesso; il CLI non deve ripartire ogni volta.
 */
const VALIDITA_CATALOGO_MS = 60_000
let catalogoInMemoria: { quando: number; valore: Promise<{ plugin: Plugin[]; errore?: string }> } | undefined

export function dimenticaCatalogo(): void {
  catalogoInMemoria = undefined
}

/**
 * Tutti i plugin: quelli offerti dai marketplace, marcati con installato/abilitato.
 * Un fallimento del CLI non è un vuoto silenzioso — si restituisce il perché,
 * così l'interfaccia può dire «il negozio non risponde» invece di «nessun plugin».
 */
export function elencoPlugin(radiceClaude?: string, fresco = false): Promise<{ plugin: Plugin[]; errore?: string }> {
  const adesso = Date.now()
  if (!fresco && catalogoInMemoria !== undefined && adesso - catalogoInMemoria.quando < VALIDITA_CATALOGO_MS) return catalogoInMemoria.valore
  const valore = leggiPlugin(radiceClaude)
  catalogoInMemoria = { quando: adesso, valore }
  // Un errore non si tiene: la prossima richiesta riprova.
  void valore.then((r) => { if (r.errore !== undefined && catalogoInMemoria?.valore === valore) catalogoInMemoria = undefined })
  return valore
}

async function leggiPlugin(radiceClaude?: string): Promise<{ plugin: Plugin[]; errore?: string }> {
  const r = await esegui(['plugin', 'list', '--available', '--json'], TIMEOUT_LETTURA)
  if (!r.ok) return { plugin: [], errore: r.motivo ?? (r.stderr || r.stdout || 'elenco plugin fallito').trim().slice(0, 400) }
  let dati: { installed?: VoceCli[]; available?: VoceCli[] }
  try {
    dati = JSON.parse(r.stdout) as { installed?: VoceCli[]; available?: VoceCli[] }
  } catch {
    return { plugin: [], errore: 'risposta del CLI non leggibile' }
  }
  return { plugin: pluginDaCli(dati, radiceClaude !== undefined ? versioniCatalogo(radiceClaude) : new Map()) }
}

/** Esegue un'azione che cambia i plugin: `--json`, esito letto, catalogo da rileggere. */
async function azione(args: string[], timeout: number, cosa: AzioneNegozio, cwd?: string): Promise<Esito> {
  const r = await esegui([...args, '--json'], timeout, cwd)
  dimenticaCatalogo()
  if (r.motivo !== undefined && r.stdout.trim() === '') return { ok: false, messaggio: r.motivo }
  const e = esitoCli(r)
  return e.ok ? { ...e, fatto: cosaCambia(cosa) } : e
}

/**
 * Installa un plugin. `accetta` è l'impronta del comando del marketplace che
 * la persona ha letto e confermato: senza, un plugin che ne chiede uno torna
 * con `conferma` e non si installa.
 */
export async function installaPlugin(id: string, accetta?: string): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  if (accetta !== undefined && !/^[0-9a-f]{64}$/i.test(accetta)) return { ok: false, messaggio: 'impronta del comando non valida' }
  return azione(['plugin', 'install', id, ...(accetta !== undefined ? ['--accept-command', accetta] : [])], TIMEOUT_INSTALLA, 'installa')
}

export async function aggiornaPlugin(id: string, accetta?: string): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  if (accetta !== undefined && !/^[0-9a-f]{64}$/i.test(accetta)) return { ok: false, messaggio: 'impronta del comando non valida' }
  const e = await azione(['plugin', 'update', id, ...(accetta !== undefined ? ['--accept-command', accetta] : [])], TIMEOUT_INSTALLA, 'aggiorna')
  if (e.ok && e.aggiornato?.giaUltima === true) {
    return { ...e, fatto: `Era già all’ultima versione${e.aggiornato.a !== undefined ? ` (${e.aggiornato.a})` : ''}: niente da cambiare.` }
  }
  if (e.ok && e.aggiornato?.a !== undefined) {
    return { ...e, fatto: `Aggiornato${e.aggiornato.da !== undefined ? ` dalla ${e.aggiornato.da}` : ''} alla ${e.aggiornato.a}. ${cosaCambia('aggiorna').replace(/^Aggiornato\. /, '')}` }
  }
  return e
}

export async function disinstallaPlugin(id: string): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  return azione(['plugin', 'uninstall', id], TIMEOUT_INSTALLA, 'rimuovi-plugin')
}

export async function commutaPlugin(id: string, abilita: boolean): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  return azione(['plugin', abilita ? 'enable' : 'disable', id], TIMEOUT_LETTURA, abilita ? 'attiva-plugin' : 'disattiva-plugin')
}

export type Marketplace = {
  nome: string
  /** Che tipo di sorgente: github, url, directory… — per farlo capire a colpo d'occhio. */
  tipo: string
  /** Il riferimento vero: il repo, l'indirizzo, o il percorso. */
  riferimento: string
  /** Quello ufficiale non si toglie: farne a meno vorrebbe dire un negozio vuoto. */
  ufficiale: boolean
  /** Quando è stato riletto l'ultima volta dalla sua sorgente, se si sa. */
  aggiornato?: string
}

const MARKETPLACE_UFFICIALE = 'claude-plugins-official'

/** Dalla risposta vera di `plugin marketplace list --json` all'elenco delle fonti. */
export function marketplaceDaCli(
  arr: unknown,
  aggiornati: Record<string, string> = {}
): Marketplace[] {
  return (Array.isArray(arr) ? arr as Array<{ name?: string; source?: string; repo?: string; url?: string; path?: string }> : [])
    .filter((m): m is { name: string } & typeof m => typeof m?.name === 'string' && m.name !== '')
    .map((m) => ({
      nome: m.name,
      tipo: typeof m.source === 'string' ? m.source : '?',
      riferimento: m.repo ?? m.url ?? m.path ?? '',
      ufficiale: m.name === MARKETPLACE_UFFICIALE,
      ...(aggiornati[m.name] !== undefined ? { aggiornato: aggiornati[m.name] } : {})
    }))
}

/** I marketplace configurati (lo store ufficiale più quelli aggiunti a mano). */
export async function elencoMarketplace(aggiornati: Record<string, string> = {}): Promise<{ marketplace: Marketplace[]; errore?: string }> {
  const r = await esegui(['plugin', 'marketplace', 'list', '--json'], TIMEOUT_LETTURA)
  if (!r.ok) return { marketplace: [], errore: r.motivo ?? (r.stderr || r.stdout || 'elenco marketplace fallito').trim().slice(0, 400) }
  try {
    return { marketplace: marketplaceDaCli(JSON.parse(r.stdout), aggiornati) }
  } catch {
    return { marketplace: [], errore: 'risposta del CLI non leggibile' }
  }
}

export async function aggiungiMarketplace(sorgente: string): Promise<Esito> {
  // Qui non si puo' chiedere la forma `nome@marketplace`: una sorgente e' un
  // repo, un indirizzo o un percorso, e vietarne la forma vorrebbe dire
  // vietarne meta'. Ma il trattino davanti resta fuori: e' l'unica cosa che
  // trasforma un valore in un'opzione.
  if (sorgente.trim() === '' || sorgente.trimStart().startsWith('-')) return rifiuta(sorgente)
  return azione(['plugin', 'marketplace', 'add', sorgente.trim()], TIMEOUT_INSTALLA, 'aggiungi-marketplace')
}

export async function rimuoviMarketplace(nome: string): Promise<Esito> {
  if (!idPluginValido(nome)) return rifiuta(nome)
  return azione(['plugin', 'marketplace', 'remove', nome], TIMEOUT_LETTURA, 'togli-marketplace')
}

export async function aggiornaMarketplace(nome?: string): Promise<Esito> {
  if (nome !== undefined && nome !== '' && !idPluginValido(nome)) return rifiuta(nome)
  if (nome === undefined || nome === '') {
    // Senza nome il CLI non stampa la riga --json: si legge come prima.
    const r = await esegui(['plugin', 'marketplace', 'update'], TIMEOUT_INSTALLA)
    dimenticaCatalogo()
    const e = interpreta(r, 'aggiornamento non riuscito')
    return e.ok ? { ...e, fatto: cosaCambia('aggiorna-marketplace') } : (r.motivo !== undefined ? { ok: false, messaggio: r.motivo } : e)
  }
  return azione(['plugin', 'marketplace', 'update', nome], TIMEOUT_INSTALLA, 'aggiorna-marketplace')
}

/**
 * Cosa contiene un plugin e quanti token pesa: l'inventario che `claude plugin
 * details` sa dare — ma solo per un plugin **installato** (per gli altri non c'è
 * ancora niente su disco da ispezionare). Testo grezzo del CLI: è già scritto
 * per essere letto, e riscriverlo vorrebbe dire inseguirne il formato.
 */
export async function dettagliPlugin(id: string): Promise<{ testo: string; errore?: string }> {
  if (!idPluginValido(id)) return { testo: '', errore: 'identificatore non valido' }
  const r = await esegui(['plugin', 'details', id], TIMEOUT_LETTURA)
  const testo = (r.stdout || '').trim()
  if (!r.ok) return { testo: '', errore: r.motivo ?? motivoLeggibile((r.stderr || testo || 'dettagli non disponibili').trim()) }
  return { testo }
}
