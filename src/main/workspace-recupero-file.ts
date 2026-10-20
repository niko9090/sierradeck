import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Archivio } from '@shared/workspace'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { leggiVoci, mettiNelRecupero, ripristina, vociPerElenco, type EsitoRipristino, type VoceRecupero, type WorkspaceInRecupero } from '@shared/workspace-recupero'

/**
 * Il recupero dei workspace eliminati sul disco (0.81.0), accanto a
 * `workspaces.json`. Le regole sono in `@shared/workspace-recupero`.
 */
export const FILE_RECUPERO_WORKSPACE = 'workspaces-recupero.json'

/**
 * `undefined` se il file c'è ma non si legge: allora non si riscrive, o le
 * voci di prima si perderebbero (lo stesso guasto corretto per
 * `workspaces.json` nella 0.80.0). Un file che non c'è vale vuoto.
 */
function leggi(dati: string): WorkspaceInRecupero[] | undefined {
  const f = join(dati, FILE_RECUPERO_WORKSPACE)
  if (!existsSync(f)) return []
  for (let i = 0; i < 2; i += 1) {
    try { return leggiVoci(JSON.parse(readFileSync(f, 'utf8'))) } catch { /* si riprova una volta */ }
  }
  console.error(`[workspace] ${FILE_RECUPERO_WORKSPACE} c’è ma non si legge: il recupero dei workspace non si tocca`)
  return undefined
}

/**
 * Prima di eliminare (la revisione): se il recupero non si legge, non si
 * elimina, perché il workspace sparirebbe senza «Eliminati».
 */
export function recuperoLeggibile(dati: string): boolean {
  return leggi(dati) !== undefined
}

/** Dopo aver tolto `nome` dall'archivio: il workspace com'era va nel recupero. Falso se non è riuscito. */
export function mettiWorkspaceNelRecupero(dati: string, prima: Archivio, nome: string, da?: string, adesso = new Date().toISOString()): boolean {
  const voci = leggi(dati)
  if (voci === undefined) return false
  try {
    scriviJsonAtomico(join(dati, FILE_RECUPERO_WORKSPACE), mettiNelRecupero(voci, prima, nome, adesso, da), 'workspace')
    return true
  } catch (err) {
    console.error(`[workspace] «${nome}» non messo nel recupero:`, err)
    return false
  }
}

export function elencoRecuperoWorkspace(dati: string, adesso = new Date().toISOString()): VoceRecupero[] {
  return vociPerElenco(leggi(dati) ?? [], adesso)
}

/**
 * Rimette un workspace dal recupero. `scrivi` salva l'archivio nuovo (lo
 * store dei workspace) e dice se c'è riuscito: il recupero si aggiorna solo
 * dopo, così una scrittura mancata non perde la voce.
 */
export function ripristinaWorkspace(
  dati: string,
  archivio: Archivio,
  scelta: { nome: string; eliminatoIl: string },
  scrivi: (a: Archivio) => boolean,
  adesso = new Date().toISOString()
): EsitoRipristino {
  const voci = leggi(dati)
  if (voci === undefined) return { ok: false, errore: 'Il recupero dei workspace non si legge in questo momento: riprova fra poco.' }
  const e = ripristina(voci, archivio, scelta, adesso)
  if (!e.ok) return e
  if (!scrivi(e.archivio)) return { ok: false, errore: 'workspaces.json non si è potuto scrivere (disco pieno o file bloccato): il workspace resta nel recupero.' }
  try { scriviJsonAtomico(join(dati, FILE_RECUPERO_WORKSPACE), e.voci, 'workspace') } catch (err) {
    // Il workspace è tornato; la voce resta anche nel recupero, e un secondo
    // «Ripristina» darebbe «Nome (recuperato)». Meglio dirlo che perderlo.
    console.error(`[workspace] «${e.nome}» ripristinato, ma la voce resta nel recupero:`, err)
  }
  return e
}
