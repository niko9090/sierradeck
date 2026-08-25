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
  name?: string
  description?: string
  marketplaceName?: string
  installCount?: number
  enabled?: boolean
  disabled?: boolean
  status?: string
}

function normalizza(v: VoceCli, installato: boolean, abilitato: boolean): Plugin | undefined {
  const id = v.pluginId ?? (typeof v.name === 'string' && typeof v.marketplaceName === 'string'
    ? `${v.name}@${v.marketplaceName}`
    : undefined)
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
    const id = v.pluginId ?? (v.name !== undefined && v.marketplaceName !== undefined ? `${v.name}@${v.marketplaceName}` : undefined)
    if (id !== undefined) statoInstallati.set(id, abilitatoDa(v))
  }
  const plugin: Plugin[] = []
  for (const v of dati.available ?? []) {
    const id = v.pluginId ?? (v.name !== undefined && v.marketplaceName !== undefined ? `${v.name}@${v.marketplaceName}` : '')
    const installato = statoInstallati.has(id)
    const p = normalizza(v, installato, installato ? statoInstallati.get(id) === true : false)
    if (p !== undefined) plugin.push(p)
  }
  // Un installato che non è più nel catalogo (marketplace rimosso) va mostrato
  // lo stesso: è roba dell'utente, non deve sparire perché la vetrina è cambiata.
  for (const v of dati.installed ?? []) {
    const id = v.pluginId ?? ''
    if (id !== '' && !plugin.some((p) => p.id === id)) {
      const p = normalizza(v, true, abilitatoDa(v))
      if (p !== undefined) plugin.push(p)
    }
  }
  return { plugin }
}

export async function installaPlugin(id: string): Promise<Esito> {
  const r = await esegui(['plugin', 'install', id, '--yes'], TIMEOUT_INSTALLA)
  return r.ok ? { ok: true } : { ok: false, messaggio: (r.stderr || r.stdout || 'installazione fallita').trim().slice(0, 400) }
}

export async function disinstallaPlugin(id: string): Promise<Esito> {
  const r = await esegui(['plugin', 'uninstall', id], TIMEOUT_INSTALLA)
  return r.ok ? { ok: true } : { ok: false, messaggio: (r.stderr || r.stdout || 'disinstallazione fallita').trim().slice(0, 400) }
}

export async function commutaPlugin(id: string, abilita: boolean): Promise<Esito> {
  const r = await esegui(['plugin', abilita ? 'enable' : 'disable', id], TIMEOUT_LETTURA)
  return r.ok ? { ok: true } : { ok: false, messaggio: (r.stderr || r.stdout || 'operazione fallita').trim().slice(0, 400) }
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
  const r = await esegui(['plugin', 'marketplace', 'add', sorgente], TIMEOUT_INSTALLA)
  return r.ok ? { ok: true } : { ok: false, messaggio: (r.stderr || r.stdout || 'aggiunta fallita').trim().slice(0, 400) }
}

export async function rimuoviMarketplace(nome: string): Promise<Esito> {
  const r = await esegui(['plugin', 'marketplace', 'remove', nome], TIMEOUT_LETTURA)
  return r.ok ? { ok: true } : { ok: false, messaggio: (r.stderr || r.stdout || 'rimozione fallita').trim().slice(0, 400) }
}

export async function aggiornaMarketplace(nome?: string): Promise<Esito> {
  const args = nome !== undefined && nome !== '' ? ['plugin', 'marketplace', 'update', nome] : ['plugin', 'marketplace', 'update']
  const r = await esegui(args, TIMEOUT_INSTALLA)
  return r.ok ? { ok: true } : { ok: false, messaggio: (r.stderr || r.stdout || 'aggiornamento fallito').trim().slice(0, 400) }
}

/**
 * Cosa contiene un plugin e quanti token pesa: l'inventario che `claude plugin
 * details` sa dare — ma solo per un plugin **installato** (per gli altri non c'è
 * ancora niente su disco da ispezionare). Testo grezzo del CLI: è già scritto
 * per essere letto, e riscriverlo vorrebbe dire inseguirne il formato.
 */
export async function dettagliPlugin(id: string): Promise<{ testo: string; errore?: string }> {
  const r = await esegui(['plugin', 'details', id], TIMEOUT_LETTURA)
  const testo = (r.stdout || '').trim()
  if (!r.ok) return { testo: '', errore: (r.stderr || testo || 'dettagli non disponibili').trim().slice(0, 400) }
  return { testo }
}
