/**
 * **Il workspace giusto di una chat che si apre a schermo** (0.59.0).
 *
 * Nicholas, 10/10: «mi apre la chat in un workspace sbagliato invece del suo
 * workspace, dove risiede la chat o l'autopilota». Sul portatile «Riapri là»
 * cercava il workspace solo fra quelli salvati **di quel PC**: la chat stava
 * nel workspace «MT5» del PC che chiedeva, sul portatile non era salvata da
 * nessuna parte, e finiva nel workspace che la finestra aveva davanti.
 *
 * Regola: mai il workspace attivo in quel momento. In quest'ordine:
 * 1. il workspace dell'autopilota che la governa;
 * 2. il workspace in cui il suo riquadro è salvato su questo PC;
 * 3. il workspace del riquadro sul PC (o telefono) che chiede di aprirla;
 * 4. il workspace del suo progetto: quello dove stanno le altre chat (o un
 *    autopilota) della stessa cartella;
 * 5. il nome della sua cartella.
 * Se quel workspace qui non c'è, si crea con quel nome (`creare: true`).
 */
export type FonteWorkspace = 'autopilota' | 'riquadro' | 'richiesta' | 'progetto' | 'cartella'

export type SceltaWorkspace = { nome: string; fonte: FonteWorkspace; perche: string; creare: boolean }

type ArchivioMinimo = { workspace: { nome: string; perSlot: Record<string, { panes: { sessionUuid?: string; cwd?: string }[] }> }[] }

/** La chiave di una cartella: senza maiuscole, barre unificate, senza barra finale. */
function chiave(cwd: string): string {
  return cwd.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
}

export function workspaceDiApertura(p: {
  sessione: string
  cwd: string
  autopiloti: { nome?: string; workspace?: string; sessionId?: string; cwd: string }[]
  archivio: ArchivioMinimo
  /** Il workspace del riquadro di chi chiede (un altro PC, il telefono). */
  chiesto?: string
}): SceltaWorkspace {
  const esiste = (n: string): boolean => p.archivio.workspace.some((w) => w.nome === n)
  const scelta = (nome: string, fonte: FonteWorkspace, perche: string): SceltaWorkspace => ({ nome, fonte, perche, creare: !esiste(nome) })
  const pieno = (x: string | undefined): x is string => x !== undefined && x.trim() !== ''

  const governa = p.autopiloti.find((a) => a.sessionId === p.sessione && pieno(a.workspace))
  if (governa !== undefined && pieno(governa.workspace)) return scelta(governa.workspace, 'autopilota', `è il workspace dell’autopilota «${governa.nome ?? ''}» che la governa`)

  for (const w of p.archivio.workspace) {
    if (Object.values(w.perSlot).some((l) => l.panes.some((x) => x.sessionUuid === p.sessione))) return scelta(w.nome, 'riquadro', 'il suo riquadro è salvato lì su questo PC')
  }

  if (pieno(p.chiesto)) return scelta(p.chiesto.trim(), 'richiesta', 'è il workspace del suo riquadro sul PC che chiede di aprirla')

  const k = chiave(p.cwd)
  for (const w of p.archivio.workspace) {
    if (Object.values(w.perSlot).some((l) => l.panes.some((x) => x.cwd !== undefined && chiave(x.cwd) === k))) return scelta(w.nome, 'progetto', 'ci sono le altre chat della sua cartella')
  }
  const ap = p.autopiloti.find((a) => chiave(a.cwd) === k && pieno(a.workspace))
  if (ap !== undefined && pieno(ap.workspace)) return scelta(ap.workspace, 'progetto', `c’è l’autopilota «${ap.nome ?? ''}» della sua cartella`)

  const nome = p.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? 'Chat'
  return scelta(nome, 'cartella', 'nessun workspace la conosce: prende il nome della sua cartella')
}
