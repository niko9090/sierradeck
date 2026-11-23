import { chiaveWorkspace } from '@shared/coda-richieste'
import { ChatAutopilotaRemota, useAutopilotaRemoto } from './ChatAutopilotaRemota'
import { PannelloAgenti } from './PannelloAgenti'
import { FornisciSorgente, sorgenteRemota } from '../sorgente-autopilota'

/**
 * Un autopilota di un altro PC scelto nella pagina Autopiloti: la sua chat
 * (scheda Chat) o i suoi agenti (scheda Specialisti), letti da là con la
 * stessa lettura di sempre (`useAutopilotaRemoto`). Gli agenti sono lo stesso
 * pannello di questo PC (23/11), in sola lettura.
 */
export function AutopilotaRemotoScelto({ pcId, pcNome, workspace, scheda }: { pcId: string; pcNome: string; workspace: string; scheda: 'chat' | 'specialisti' }): React.JSX.Element {
  const { stato, rileggi } = useAutopilotaRemoto(pcId, workspace)
  if (scheda === 'chat') return <ChatAutopilotaRemota pcId={pcId} pcNome={pcNome} stato={stato} rileggi={rileggi} />
  const a = stato.autopilota
  const riferimenti = a === undefined ? [workspace] : [chiaveWorkspace(a), a.cwd ?? '', a.workspace ?? workspace]
  return (
    <FornisciSorgente value={sorgenteRemota(pcId, pcNome)}>
      <PannelloAgenti riferimenti={riferimenti} />
    </FornisciSorgente>
  )
}
