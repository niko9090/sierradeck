import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Autopilota } from '@shared/autopilota'
import {
  cartelleDaGuardare, leggiNameStatus, leggiNumstat, leggiStatusPorcelain, percorsoSicuro, unisciFile,
  type GruppoChat
} from '@shared/file-autopilota'

/**
 * La linguetta «File» dal lato di git (0.38.0): per ogni cartella
 * dell'autopilota (la sua e i worktree delle sue chat) cosa e' cambiato
 * rispetto al punto di partenza, e il diff di un file. Solo lettura: nessun
 * comando che scrive.
 *
 * Le cartelle e la base vengono dall'autopilota com'e' scritto nel servizio,
 * non dal renderer; il percorso di un file per il diff deve stare nell'elenco
 * appena calcolato per quella chat.
 */

type Git = (args: string[], cwd: string) => Promise<{ codice: number; uscita: string }>

/** Asincrono: la linguetta rilegge ogni pochi secondi, e il main non deve fermarsi. */
const gitSoloLettura: Git = (args, cwd) => new Promise((ok) => {
  execFile('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    const codice = err === null ? 0 : typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1
    ok({ codice, uscita: stdout ?? '' })
  })
})

/** Le righe di un file nuovo non ancora in git: si contano, fino a un mega. */
function righeDi(file: string): number {
  try {
    if (!existsSync(file) || statSync(file).size > 1024 * 1024) return 0
    const t = readFileSync(file, 'utf8')
    return t === '' ? 0 : t.split(/\r?\n/).length - (t.endsWith('\n') ? 1 : 0)
  } catch { return 0 }
}

export async function fileDellAutopilota(a: Autopilota, git: Git = gitSoloLettura): Promise<GruppoChat[]> {
  return Promise.all(cartelleDaGuardare(a).map(async (c): Promise<GruppoChat> => {
    if (!existsSync(c.cartella)) return { chiave: c.chiave, nome: c.nome, cartella: c.cartella, ...(c.ramo !== undefined ? { ramo: c.ramo } : {}), base: c.spiegaBase, file: [], errore: 'la cartella non c’è più' }
    const radice = await git(['rev-parse', '--show-toplevel'], c.cartella)
    if (radice.codice !== 0) return { chiave: c.chiave, nome: c.nome, cartella: c.cartella, base: c.spiegaBase, file: [], errore: 'non è un repository git: i file cambiati non si possono confrontare' }
    // Tutto dalla radice del repository: `status --porcelain` e `diff` danno i
    // percorsi da li', e cosi' tornano fra loro.
    const dove = radice.uscita.trim() !== '' ? radice.uscita.trim() : c.cartella
    const salvati = c.base === 'HEAD' ? '' : (await git(['diff', '--name-status', '-M', c.base, 'HEAD', '--', '.'], dove)).uscita
    const righeSalvati = c.base === 'HEAD' ? '' : (await git(['diff', '--numstat', '-M', c.base, 'HEAD', '--', '.'], dove)).uscita
    const stato = (await git(['status', '--porcelain=v1', '-uall', '--', '.'], dove)).uscita
    const righeOra = (await git(['diff', '--numstat', '-M', 'HEAD', '--', '.'], dove)).uscita
    const daSalvare = leggiStatusPorcelain(stato)
    const numOra = leggiNumstat(righeOra)
    // I file nuovi non tracciati non stanno nel numstat: si contano le righe.
    for (const [p, s] of daSalvare) {
      if (s.stato === 'nuovo' && !numOra.has(p)) numOra.set(p, { piu: righeDi(join(dove, p)), meno: 0, binario: false })
    }
    return {
      chiave: c.chiave, nome: c.nome, cartella: c.cartella, ...(c.ramo !== undefined ? { ramo: c.ramo } : {}), base: c.spiegaBase,
      file: unisciFile({ salvati: leggiNameStatus(salvati), righeSalvati: leggiNumstat(righeSalvati), daSalvare, righeDaSalvare: numOra })
    }
  }))
}

/** Il diff di un file di quella chat, contro la base: committato e non. */
export async function diffDellAutopilota(a: Autopilota, chiave: string, percorso: string, git: Git = gitSoloLettura): Promise<string> {
  if (!percorsoSicuro(percorso)) throw new Error('percorso non valido')
  const gruppo = (await fileDellAutopilota(a, git)).find((g) => g.chiave === chiave)
  const f = gruppo?.file.find((x) => x.percorso === percorso)
  if (gruppo === undefined || f === undefined) throw new Error('quel file non è fra quelli cambiati da questo autopilota')
  const c = cartelleDaGuardare(a).find((x) => x.chiave === chiave)!
  const radice = (await git(['rev-parse', '--show-toplevel'], c.cartella)).uscita.trim()
  const dove = radice !== '' ? radice : c.cartella
  // Un file nuovo non ancora in git: si mostra tutto come aggiunto.
  const tracciato = (await git(['ls-files', '--error-unmatch', '--', percorso], dove)).codice === 0
  if (!tracciato && f.stato === 'nuovo') {
    const testo = existsSync(join(dove, percorso)) && statSync(join(dove, percorso)).size <= 1024 * 1024
      ? readFileSync(join(dove, percorso), 'utf8') : ''
    return `--- /dev/null\n+++ b/${percorso}\n@@ nuovo, non ancora salvato @@\n${testo.split(/\r?\n/).map((r) => `+${r}`).join('\n')}`
  }
  const argomenti = c.base === 'HEAD' ? ['diff', '-M', 'HEAD', '--', percorso] : ['diff', '-M', c.base, '--', percorso]
  return (await git(argomenti, dove)).uscita.slice(0, 400_000)
}
