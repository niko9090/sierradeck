import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import type { Archivio } from '@shared/workspace'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { leggiVoci, mettiNelRecupero, ripristina, vociPerElenco, vociValide, type EsitoRipristino, type VoceRecupero, type WorkspaceInRecupero } from '@shared/workspace-recupero'

/**
 * Il recupero dei workspace eliminati sul disco (0.81.0), accanto a
 * `workspaces.json`. Le regole sono in `@shared/workspace-recupero`.
 */
export const FILE_RECUPERO_WORKSPACE = 'workspaces-recupero.json'
/** Dove aspettano le cartelle vuote dei workspace eliminati, una sottocartella per eliminazione. */
export const CARTELLE_RECUPERO_WORKSPACE = 'workspaces-recupero-cartelle'

/** Una cartella che c'è, è una cartella e non contiene niente. */
export function cartellaVuota(p: string): boolean {
  try { return statSync(p).isDirectory() && readdirSync(p).length === 0 } catch { return false }
}

/**
 * Sposta la cartella vuota nel recupero, sempre attraverso `cancellaSicura`
 * (la guardia del 14/10): dentro la radice che la contiene, mai la radice
 * stessa. `undefined` se non si è spostata: il workspace si elimina lo stesso,
 * la cartella resta dov'è.
 */
function spostaCartella(dati: string, cartella: string, adesso: string): WorkspaceInRecupero['cartella'] {
  if (!cartellaVuota(cartella)) return undefined
  let qui: string | undefined
  try {
    // Una sottocartella tutta sua, anche per due eliminazioni nello stesso istante (la revisione).
    mkdirSync(join(dati, CARTELLE_RECUPERO_WORKSPACE), { recursive: true })
    qui = mkdtempSync(join(dati, CARTELLE_RECUPERO_WORKSPACE, `${adesso.replace(/[:.]/g, '-')}-`))
    if (cancellaSicura(cartella, { dentro: [dirname(cartella)], come: { modo: 'recupero', cartella: qui } }) === 'spostata') {
      const dentro = readdirSync(qui)
      if (dentro.length === 1) return { originale: cartella, spostataIn: join(qui, dentro[0]!) }
    }
  } catch (err) {
    console.error(`[workspace] la cartella ${cartella} resta dov'è:`, err)
  }
  // Non spostata: la sottocartella vuota non resta (rmdir toglie solo una cartella vuota).
  if (qui !== undefined) try { rmdirSync(qui) } catch { /* non vuota: resta, con dentro quello che c'è */ }
  return undefined
}

/** Le cartelle delle voci scadute escono con loro, sempre dalla guardia e solo dal recupero. */
function togliCartelleScadute(dati: string, voci: readonly WorkspaceInRecupero[], valide: readonly WorkspaceInRecupero[]): void {
  const radice = join(dati, CARTELLE_RECUPERO_WORKSPACE)
  for (const v of voci) {
    if (valide.includes(v) || v.cartella === undefined) continue
    try { cancellaSicura(dirname(v.cartella.spostataIn), { dentro: [radice] }) } catch (err) { console.error('[workspace] cartella scaduta del recupero non tolta:', err) }
  }
}

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
export function mettiWorkspaceNelRecupero(dati: string, prima: Archivio, nome: string, da?: string, adesso = new Date().toISOString(), cartella?: string): boolean {
  const voci = leggi(dati)
  if (voci === undefined) return false
  let spostata: WorkspaceInRecupero['cartella']
  try {
    const nuove = mettiNelRecupero(voci, prima, nome, adesso, da)
    spostata = cartella !== undefined && nuove[0]?.eliminatoIl === adesso ? spostaCartella(dati, cartella, adesso) : undefined
    const scritte = spostata !== undefined ? [{ ...nuove[0]!, cartella: spostata }, ...nuove.slice(1)] : nuove
    scriviJsonAtomico(join(dati, FILE_RECUPERO_WORKSPACE), scritte, 'workspace')
    togliCartelleScadute(dati, voci, vociValide(voci, adesso))
    return true
  } catch (err) {
    // Senza la voce la cartella non si ritroverebbe: torna dov'era.
    if (spostata !== undefined) try { renameSync(spostata.spostataIn, spostata.originale) } catch { /* resta in spostataIn, scritto nel registro qui sotto */ }
    console.error(`[workspace] «${nome}» non messo nel recupero${spostata !== undefined ? ` (cartella in ${spostata.spostataIn})` : ''}:`, err)
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
  // La cartella vuota torna dov'era, se nel frattempo non ne è nata un'altra.
  const v = voci.find((x) => x.workspace.nome === scelta.nome && x.eliminatoIl === scelta.eliminatoIl)
  if (v?.cartella !== undefined && !existsSync(v.cartella.originale) && existsSync(v.cartella.spostataIn)) {
    try { renameSync(v.cartella.spostataIn, v.cartella.originale) } catch (err) { console.error(`[workspace] la cartella di «${e.nome}» resta nel recupero (${v.cartella.spostataIn}):`, err) }
  }
  // Al suo posto ne è nata un'altra: quella del recupero era vuota, esce adesso invece di restare senza voce.
  else if (v?.cartella !== undefined && existsSync(v.cartella.originale) && cartellaVuota(v.cartella.spostataIn)) {
    try { cancellaSicura(dirname(v.cartella.spostataIn), { dentro: [join(dati, CARTELLE_RECUPERO_WORKSPACE)] }) } catch (err) { console.error('[workspace] cartella vuota del recupero non tolta:', err) }
  }
  try { scriviJsonAtomico(join(dati, FILE_RECUPERO_WORKSPACE), e.voci, 'workspace') } catch (err) {
    // Il workspace è tornato; la voce resta anche nel recupero, e un secondo
    // «Ripristina» darebbe «Nome (recuperato)». Meglio dirlo che perderlo.
    console.error(`[workspace] «${e.nome}» ripristinato, ma la voce resta nel recupero:`, err)
  }
  return e
}
