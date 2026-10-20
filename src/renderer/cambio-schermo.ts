import { decidiCambioSchermo, type CausaCambio } from '@shared/cambio-schermo'
import { azioniDiFinestra } from './azioni-finestra'
import type { AzioniWorkspace } from './workspace-azioni'
import { workspaceCorrente } from './workspace-corrente'

/**
 * L'unico punto da cui questa finestra cambia il workspace sullo schermo
 * (0.80.0): la regola è in `@shared/cambio-schermo`, qui la si applica e la si
 * scrive nel registro. Vero se lo schermo è cambiato.
 */
export async function cambiaSchermo(
  nome: string,
  causa: CausaCambio,
  dettaglio?: string,
  azioni: Pick<AzioniWorkspace, 'cambia'> = azioniDiFinestra()
): Promise<boolean> {
  const d = decidiCambioSchermo({ davanti: workspaceCorrente(), voluto: nome, causa, ...(dettaglio !== undefined ? { dettaglio } : {}) })
  void window.gestore.log.info(d.riga).catch(() => undefined)
  if (!d.cambia) return false
  await azioni.cambia(nome, `${causa}${dettaglio !== undefined && dettaglio !== '' ? `: ${dettaglio}` : ''}`)
  // «Recenti» del menu (0.82.0): solo dove è andato Nicholas, non dove l'ha portato una consegna.
  if (causa === 'nicholas' || causa === 'telefono') void window.gestore.workspace.recente?.(nome)?.catch(() => undefined)
  return true
}
