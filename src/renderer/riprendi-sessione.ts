/**
 * «Riprendi» del PC (0.56.0): cosa fare quando si sceglie una conversazione.
 *
 * Il difetto, provato dal vero sulla copia di prova il 09/10: per una
 * conversazione di questo PC si apriva il riquadro **senza** il suo
 * identificativo (`addPane(cwd, titolo)`). Nasceva una sessione nuova con
 * `--session-id`: una chat vuota nella stessa cartella, non quella scelta.
 */
export type SceltaRipresa =
  /** Già a schermo: si sveglia se dorme, e basta. Un secondo riquadro sarebbe la stessa conversazione due volte. */
  | { tipo: 'gia'; paneId: string; sveglia: boolean }
  /** Di un altro PC acceso: si apre dal vivo là. */
  | { tipo: 'remota'; cwd: string; sessionUuid: string; remoto: { pcId: string; pcNome: string; cwd: string; sessione: string } }
  /** Di qui: si apre con il suo identificativo, e Claude Code la riprende con `--resume`. */
  | { tipo: 'locale'; cwd: string; sessionUuid: string }

export function comeRiprendere(
  s: { uuid: string; cwd?: string; projectPath: string },
  altrove: { id: string; nome: string; vivo: boolean } | undefined,
  aperti: readonly { id: string; sessionUuid?: string; ibernata?: boolean; remoto?: unknown }[]
): SceltaRipresa {
  const cwd = s.cwd ?? s.projectPath
  const gia = aperti.find((p) => p.sessionUuid === s.uuid)
  if (gia !== undefined) return { tipo: 'gia', paneId: gia.id, sveglia: gia.ibernata === true }
  if (altrove !== undefined && altrove.id !== '' && altrove.vivo) {
    return { tipo: 'remota', cwd, sessionUuid: s.uuid, remoto: { pcId: altrove.id, pcNome: altrove.nome, cwd, sessione: s.uuid } }
  }
  return { tipo: 'locale', cwd, sessionUuid: s.uuid }
}
