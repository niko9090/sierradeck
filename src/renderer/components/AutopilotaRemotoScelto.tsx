import { chiaveWorkspace } from '@shared/coda-richieste'
import { ChatAutopilotaRemota, ColonnaSpecialistiRemoti, useAutopilotaRemoto } from './ChatAutopilotaRemota'

/**
 * Un autopilota di un altro PC scelto nella pagina Autopiloti: la sua chat
 * (scheda Chat) o i suoi specialisti (scheda Specialisti), letti da là con la
 * stessa lettura di sempre (`useAutopilotaRemoto`).
 */
export function AutopilotaRemotoScelto({ pcId, pcNome, workspace, scheda }: { pcId: string; pcNome: string; workspace: string; scheda: 'chat' | 'specialisti' }): React.JSX.Element {
  const { stato, rileggi } = useAutopilotaRemoto(pcId, workspace)
  if (scheda === 'chat') return <ChatAutopilotaRemota pcId={pcId} pcNome={pcNome} stato={stato} rileggi={rileggi} />
  const a = stato.autopilota
  const riferimenti = a === undefined ? [workspace] : [chiaveWorkspace(a), a.cwd, a.workspace ?? workspace]
  return <ColonnaSpecialistiRemoti pcId={pcId} pcNome={pcNome} riferimenti={riferimenti} />
}
