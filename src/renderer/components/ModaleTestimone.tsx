import { useState } from 'react'

export type AvvisoProgetto =
  | { tipo: 'occupato'; progettoId: string; nome: string; pcNome: string; da: string }
  | { tipo: 'ceduto'; progettoId: string; nome: string; aNome: string; sessioni: string[] }

type Props = {
  avviso: AvvisoProgetto
  onChiudi: () => void
}

function oraDi(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Il passaggio di testimone fra due PC sullo stesso progetto.
 *
 * Compare quando si apre una chat in un progetto che un altro PC ha in mano.
 * Non e' un avviso da chiudere e dimenticare: finche' il testimone e' di la',
 * quello che si fa qui non sale sul Drive, e lo si dice.
 */
export function ModaleTestimone({ avviso, onChiudi }: Props): React.JSX.Element {
  const [fase, setFase] = useState<'chiedi' | 'inCorso' | 'nonRisponde' | 'errore' | 'fatto'>('chiedi')
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)

  const prendi = (forza: boolean): void => {
    if (avviso.tipo !== 'occupato') return
    setFase('inCorso')
    void window.gestore.progetti.prendiTestimone(avviso.progettoId, forza).then((r) => {
      if (r.ok) { setFase('fatto'); return }
      if ('nonRisponde' in r && r.nonRisponde) { setFase('nonRisponde'); return }
      setMessaggio('messaggio' in r ? r.messaggio : 'non riuscito')
      setFase('errore')
    }).catch((err: unknown) => { setMessaggio(String(err)); setFase('errore') })
  }

  if (avviso.tipo === 'ceduto') {
    return (
      <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
        <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
          <div className="dialogo__testa"><span className="serigrafia">Hai passato «{avviso.nome}» a {avviso.aNome}</span></div>
          <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
            Il PC {avviso.aNome} ha chiesto il testimone di questo progetto: ho salvato sul Drive e messo a dormire
            {avviso.sessioni.length === 1 ? ' la chat' : ` le ${avviso.sessioni.length} chat`} che ci lavoravano qui.
            Riaprendone una ti chiedero' se riprenderlo.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tasto tasto--primario" onClick={onChiudi}>Ho capito</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && fase !== 'inCorso') onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa"><span className="serigrafia">«{avviso.nome}» e' in lavoro sul PC {avviso.pcNome}</span></div>
        {fase === 'chiedi' ? (
          <>
            <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
              Da la' {oraDi(avviso.da) !== '' ? `dalle ${oraDi(avviso.da)}` : ''}. Per lavorarci qui prendo il testimone: chiedo a
              quel PC di salvare, scarico l’ultimo stato del progetto, e da quel momento e' tuo.
            </p>
            <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
              Se continui senza, quello che fai qui <strong>non sale sul Drive</strong> finche' non prendi il testimone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" onClick={onChiudi}>Continua senza</button>
              <button className="tasto tasto--primario" onClick={() => prendi(false)}>Prendi il testimone</button>
            </div>
          </>
        ) : fase === 'inCorso' ? (
          <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>Un attimo: chiedo al PC {avviso.pcNome} di salvare e scarico l’ultimo stato…</p>
        ) : fase === 'nonRisponde' ? (
          <>
            <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
              Il PC {avviso.pcNome} non risponde: e' spento, o senza rete. Posso prendere il testimone lo stesso, con
              quello che c'e' sul Drive — se la' c'era lavoro non ancora salvato, non lo vedrai qui.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" onClick={onChiudi}>Lascia stare</button>
              <button className="tasto tasto--primario" onClick={() => prendi(true)}>Prendilo lo stesso</button>
            </div>
          </>
        ) : fase === 'errore' ? (
          <>
            <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>Non ci sono riuscito: {messaggio ?? 'errore'}.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" onClick={onChiudi}>Chiudi</button>
              <button className="tasto tasto--primario" onClick={() => prendi(false)}>Riprova</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>Fatto: «{avviso.nome}» adesso e' su questo PC, con l’ultimo stato salvato.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto tasto--primario" onClick={onChiudi}>Al lavoro</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
