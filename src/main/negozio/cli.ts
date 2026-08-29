import { execFile } from 'node:child_process'
import { resolveClaudeCommand } from '../config'

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
 * Tutto **asincrono** e con un tetto di tempo: un'installazione tira giù roba
 * dalla rete, e questo è il processo principale — non deve mai bloccare la
 * finestra come è già successo altrove. Niente shell: `execFile` passa gli
 * argomenti come array, così un nome di plugin non può diventare un comando.
 */

export type Plugin = {
  /** `nome@marketplace`: l'identificatore per installare/abilitare/disabilitare. */
  id: string
  nome: string
  descrizione: string
  marketplace: string
  installato: boolean
  abilitato: boolean
  installazioni?: number
}

export type Esito = { ok: boolean; messaggio?: string }

const TIMEOUT_LETTURA = 30_000
const TIMEOUT_INSTALLA = 120_000
const MAX_BUFFER = 8 * 1024 * 1024

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

function esegui(args: string[], timeout: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      claude(),
      args,
      { timeout, maxBuffer: MAX_BUFFER, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: err === null, stdout: stdout ?? '', stderr: stderr ?? '' })
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
 * L'esito di un comando che *stampa* ✔/✘ ma esce **sempre con 0**, anche quando
 * fallisce (è così che si comporta `claude plugin install/uninstall`): il glifo
 * è più affidabile del codice d'uscita. Con ✘ è un fallimento e si riporta cosa
 * ha detto; con ✔ è fatto; senza né l'uno né l'altro si ripiega sul codice.
 */
export function interpreta(r: { ok: boolean; stdout: string; stderr: string }, azioneFallita: string): Esito {
  const out = `${r.stdout}\n${r.stderr}`
  if (/✔/.test(out) && !/✘/.test(out)) return { ok: true }
  const fallito = /✘/.test(out) || !r.ok
  if (!fallito) return { ok: true }
  // Il messaggio buono è la riga che spiega il perché («Failed to…», «Error…»),
  // non tutto l'output col rumore tipo «Installing plugin…».
  const righe = out.split('\n').map((x) => x.replace(/[✔✘]/g, '').trim()).filter((x) => x !== '')
  const rilevante = righe.find((x) => /fail|error|not found|impossibile|non /i.test(x)) ?? righe[righe.length - 1]
  return { ok: false, messaggio: (rilevante ?? azioneFallita).slice(0, 400) }
}

function normalizza(v: VoceCli, installato: boolean, abilitato: boolean): Plugin | undefined {
  const id = idDi(v)
  if (id === undefined) return undefined
  const nome = v.name ?? id.split('@')[0] ?? id
  const marketplace = v.marketplaceName ?? id.split('@')[1] ?? ''
  return {
    id,
    nome,
    descrizione: typeof v.description === 'string' ? v.description : '',
    marketplace,
    installato,
    abilitato,
    ...(typeof v.installCount === 'number' ? { installazioni: v.installCount } : {})
  }
}

/** Se un plugin installato è abilitato: il CLI lo dice in un campo o nell'altro
 * a seconda della versione, quindi si guarda tutto ciò che potrebbe negarlo. */
function abilitatoDa(v: VoceCli): boolean {
  if (v.disabled === true) return false
  if (v.enabled === false) return false
  if (typeof v.status === 'string' && /disab/i.test(v.status)) return false
  return true
}

/**
 * Tutti i plugin: quelli offerti dai marketplace, marcati con installato/abilitato.
 * Un fallimento del CLI non è un vuoto silenzioso — si restituisce il perché,
 * così l'interfaccia può dire «il negozio non risponde» invece di «nessun plugin».
 */
export async function elencoPlugin(): Promise<{ plugin: Plugin[]; errore?: string }> {
  const r = await esegui(['plugin', 'list', '--available', '--json'], TIMEOUT_LETTURA)
  if (!r.ok) return { plugin: [], errore: (r.stderr || r.stdout || 'elenco plugin fallito').trim().slice(0, 400) }
  let dati: { installed?: VoceCli[]; available?: VoceCli[] }
  try {
    dati = JSON.parse(r.stdout) as { installed?: VoceCli[]; available?: VoceCli[] }
  } catch {
    return { plugin: [], errore: 'risposta del CLI non leggibile' }
  }
  const statoInstallati = new Map<string, boolean>()
  for (const v of dati.installed ?? []) {
    const id = idDi(v)
    if (id !== undefined) statoInstallati.set(id, abilitatoDa(v))
  }
  const plugin: Plugin[] = []
  for (const v of dati.available ?? []) {
    const id = idDi(v) ?? ''
    const installato = statoInstallati.has(id)
    const p = normalizza(v, installato, installato ? statoInstallati.get(id) === true : false)
    if (p !== undefined) plugin.push(p)
  }
  // Un installato che non è più nel catalogo (marketplace rimosso) va mostrato
  // lo stesso: è roba dell'utente, non deve sparire perché la vetrina è cambiata.
  for (const v of dati.installed ?? []) {
    const id = idDi(v) ?? ''
    if (id !== '' && !plugin.some((p) => p.id === id)) {
      const p = normalizza(v, true, abilitatoDa(v))
      if (p !== undefined) plugin.push(p)
    }
  }
  return { plugin }
}

export async function installaPlugin(id: string): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  return interpreta(await esegui(['plugin', 'install', id, '--yes'], TIMEOUT_INSTALLA), 'installazione fallita')
}

export async function disinstallaPlugin(id: string): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  return interpreta(await esegui(['plugin', 'uninstall', id], TIMEOUT_INSTALLA), 'disinstallazione fallita')
}

export async function commutaPlugin(id: string, abilita: boolean): Promise<Esito> {
  if (!idPluginValido(id)) return rifiuta(id)
  return interpreta(await esegui(['plugin', abilita ? 'enable' : 'disable', id], TIMEOUT_LETTURA), 'operazione fallita')
}

export type Marketplace = {
  nome: string
  /** Che tipo di sorgente: github, url, path… — per farlo capire a colpo d'occhio. */
  tipo: string
  /** Il riferimento vero: il repo, l'indirizzo, o il percorso. */
  riferimento: string
  /** Quello ufficiale non si toglie: farne a meno vorrebbe dire un negozio vuoto. */
  ufficiale: boolean
}

const MARKETPLACE_UFFICIALE = 'claude-plugins-official'

/** I marketplace configurati (lo store ufficiale più quelli aggiunti a mano). */
export async function elencoMarketplace(): Promise<{ marketplace: Marketplace[]; errore?: string }> {
  const r = await esegui(['plugin', 'marketplace', 'list', '--json'], TIMEOUT_LETTURA)
  if (!r.ok) return { marketplace: [], errore: (r.stderr || r.stdout || 'elenco marketplace fallito').trim().slice(0, 400) }
  try {
    const arr = JSON.parse(r.stdout) as Array<{ name?: string; source?: string; repo?: string; url?: string; path?: string }>
    const marketplace = (Array.isArray(arr) ? arr : [])
      .filter((m): m is { name: string } & typeof m => typeof m.name === 'string' && m.name !== '')
      .map((m) => ({
        nome: m.name,
        tipo: typeof m.source === 'string' ? m.source : '?',
        riferimento: m.repo ?? m.url ?? m.path ?? '',
        ufficiale: m.name === MARKETPLACE_UFFICIALE
      }))
    return { marketplace }
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
  return interpreta(await esegui(['plugin', 'marketplace', 'add', sorgente], TIMEOUT_INSTALLA), 'aggiunta fallita')
}

export async function rimuoviMarketplace(nome: string): Promise<Esito> {
  if (!idPluginValido(nome)) return rifiuta(nome)
  return interpreta(await esegui(['plugin', 'marketplace', 'remove', nome], TIMEOUT_LETTURA), 'rimozione fallita')
}

export async function aggiornaMarketplace(nome?: string): Promise<Esito> {
  if (nome !== undefined && nome !== '' && !idPluginValido(nome)) return rifiuta(nome)
  const args = nome !== undefined && nome !== '' ? ['plugin', 'marketplace', 'update', nome] : ['plugin', 'marketplace', 'update']
  return interpreta(await esegui(args, TIMEOUT_INSTALLA), 'aggiornamento fallito')
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
  if (!r.ok) return { testo: '', errore: (r.stderr || testo || 'dettagli non disponibili').trim().slice(0, 400) }
  return { testo }
}
