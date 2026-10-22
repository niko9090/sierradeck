import type { ApriChatAltroPc } from '@shared/domande-telefono'
import { useLayoutStore } from './state/layout'

/**
 * «Apri la chat su <PC>» (0.84.1): una domanda a scelta arrivata da un altro PC
 * senza il suo testo si legge là. Come l'azione `apriRemota` della finestra
 * (App.tsx): già a schermo non si apre due volte, se no il riquadro dal vivo
 * verso quel PC.
 */
export function apriChatAltroPc(a: ApriChatAltroPc): void {
  const store = useLayoutStore.getState()
  if (Object.values(store.panes).some((x) => x.sessionUuid === a.sessione)) return
  const titolo = a.titolo !== '' ? a.titolo : (a.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? a.sessione.slice(0, 8))
  store.addPane(a.cwd, titolo, undefined, { sessionUuid: a.sessione, remoto: { pcId: a.pc, pcNome: a.pcNome, cwd: a.cwd, sessione: a.sessione } })
}
