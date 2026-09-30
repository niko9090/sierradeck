import type { Autopilota } from '@shared/autopilota'
import { alberoChat, type NodoAlbero } from '@shared/harness'

/**
 * L'albero delle chat di un autopilota (T7, 0.36.0): il coordinatore in cima,
 * sotto le sue sotto-chat con il compito, la parola dello stato, il ramo del
 * suo worktree e i giri. La stessa funzione (`alberoChat`) disegna la pagina
 * del telefono e l'app, cosi' le tre viste dicono la stessa cosa.
 */
const LED: Record<string, string> = {
  lavoro: 'led--lavoro',
  bloccata: 'led--attesa',
  pausa: 'led--finito',
  finita: 'led--finito'
}

function Nodo({ n }: { n: NodoAlbero }): React.JSX.Element {
  return (
    <li>
      <div className="albero-ap__nodo" title={n.cartella}>
        <span className={`led ${LED[n.stato] ?? 'led--lavoro'}`} />
        <span>{n.titolo}</span>
        <span className="misura">· {n.parola} · {n.cicli} {n.cicli === 1 ? 'giro' : 'giri'}</span>
        {n.ramo !== undefined ? <span className="albero-ap__ramo">{n.ramo}</span> : null}
      </div>
    </li>
  )
}

export function AlberoChat({ autopilota }: { autopilota: Autopilota }): React.JSX.Element {
  const radice = alberoChat(autopilota)
  return (
    <ul className="albero-ap" aria-label="Il coordinatore e le sue chat">
      <li>
        <div className="albero-ap__nodo">
          <span className="serigrafia">coordinatore</span>
          <span>{radice.titolo}</span>
          <span className="misura">· {radice.parola}{autopilota.ramoBase !== undefined ? ` · ramo principale ${autopilota.ramoBase}` : ''}</span>
        </div>
        {radice.figli.length > 0 ? (
          <ul className="albero-ap__figli">
            {radice.figli.map((f) => <Nodo key={f.id} n={f} />)}
          </ul>
        ) : null}
      </li>
    </ul>
  )
}
