import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { registroSuPcValido, remotiDaMigrare, rinominaInRegistro, togliDaRegistro, type RegistroSuPc } from '@shared/workspace-remoti'

/**
 * `workspace-su-pc.json` (0.102.0): i workspace aperti da un altro PC, per
 * nome → quel PC. Accanto a `workspaces.json`, ma a parte: è di questo PC.
 * Dalla sezione «Altri PC» segue anche rinomina ed eliminazione.
 */
export const FILE_SU_PC = 'workspace-su-pc.json'
/** Il segno che le linguette remote di prima sono già passate in «Altri PC». */
export const FILE_MIGRAZIONE_ALTRI_PC = 'altri-pc-migrazione.json'
/** La copia del registro prima della migrazione: per tornare com'era. */
export const COPIA_PRIMA_DI_ALTRI_PC = 'workspace-su-pc.prima-di-altri-pc.json'

export function leggiSuPc(dati: string): RegistroSuPc {
  try { return registroSuPcValido(JSON.parse(readFileSync(join(dati, FILE_SU_PC), 'utf8'))) } catch { return {} }
}

export function scriviSuPc(dati: string, r: RegistroSuPc): void {
  scriviJsonAtomico(join(dati, FILE_SU_PC), r, 'workspace-su-pc')
}

/** Rinomina: il workspace resta dello stesso PC. Un file che non si scrive non ferma la rinomina. */
export function rinominaSuPc(dati: string, vecchio: string, nuovo: string): void {
  const prima = leggiSuPc(dati)
  const dopo = rinominaInRegistro(prima, vecchio, nuovo)
  if (dopo !== prima) { try { scriviSuPc(dati, dopo) } catch (e) { console.error('[workspace-su-pc] rinomina non scritta:', e) } }
}

/** Eliminato: esce dal registro (il recupero dei 30 giorni tiene il workspace). */
export function togliSuPc(dati: string, nome: string): void {
  const prima = leggiSuPc(dati)
  const dopo = togliDaRegistro(prima, nome)
  if (dopo !== prima) { try { scriviSuPc(dati, dopo) } catch (e) { console.error('[workspace-su-pc] eliminazione non scritta:', e) } }
}

type ArchivioPerMigrare = { workspace: readonly { nome: string; perSlot: Readonly<Record<string, { panes: readonly { remoto?: { pcId: string; pcNome: string } | undefined }[] }>> }[] }

/**
 * Una volta sola: le linguette remote di prima (workspace con tutte le chat su
 * uno stesso altro PC) entrano nel registro, quindi nella sezione «Altri PC».
 * Non tocca `workspaces.json` né le chat; il registro di prima resta copiato
 * accanto. Torna i nomi spostati.
 */
export function migraLinguetteRemote(dati: string, a: ArchivioPerMigrare, ioId: string, log: (r: string) => void): string[] {
  const segno = join(dati, FILE_MIGRAZIONE_ALTRI_PC)
  if (existsSync(segno)) return []
  const prima = leggiSuPc(dati)
  const nuove = remotiDaMigrare(a.workspace.map((w) => ({ nome: w.nome, panes: Object.values(w.perSlot).flatMap((l) => l.panes) })), prima, ioId)
  const nomi = Object.keys(nuove)
  if (nomi.length > 0) {
    const file = join(dati, FILE_SU_PC)
    if (existsSync(file)) copyFileSync(file, join(dati, COPIA_PRIMA_DI_ALTRI_PC))
    scriviSuPc(dati, { ...prima, ...nuove })
    log(`[altri-pc] ${nomi.length} workspace con tutte le chat su un altro PC passano in «Altri PC»: ${nomi.join(', ')} (workspaces.json non cambia)`)
  }
  scriviJsonAtomico(segno, { fatta: new Date().toISOString(), spostati: nomi }, 'migrazione altri PC')
  return nomi
}
