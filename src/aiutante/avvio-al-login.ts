/**
 * **L'avvio con Windows solo per l'Aiutante installato** (25/11).
 *
 * Una prova della pubblicazione aveva lanciato l'Aiutante appena costruito
 * (`dist-aiutante/win-unpacked`, dentro la copia di lavoro di un agente): lui
 * si era scritto nell'avvio di Windows con quel percorso, che poi è sparito.
 * Una copia costruita al volo non deve mai toccare l'avvio del PC.
 */
export function avvioAlLoginAmmesso(exe: string): boolean {
  const p = exe.replace(/\\/gu, '/').toLowerCase()
  if (p.includes('/win-unpacked/')) return false
  if (p.includes('/dist-aiutante/')) return false
  if (p.includes('/.claude/worktrees/')) return false
  return true
}
