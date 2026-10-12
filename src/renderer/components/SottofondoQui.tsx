import { useEffect, useState } from 'react'
import type { StatoSottofondo } from '@shared/sottofondo'
import { Aiuto } from './Aiuto'
import { durata, etichettaSottofondo, SENZA_SEGNI_MS } from '@shared/stato-dal-vivo'

/**
 * **Chat usate da altri PC** (0.58.4, decisione di Nicholas).
 *
 * Le chat di questo PC che un altro PC (o il telefono) sta usando in
 * sottofondo: girano qui senza riquadro, così chi è a questo PC può fare
 * altro. Il tasto compare solo quando ce n'è almeno una; dall'elenco «Mostra
 * qui» la porta in un riquadro di questa finestra **senza riavviarla**, e
 * «Chiudi» ferma il processo (la conversazione resta su disco).
 */
const FASI: Record<string, string> = {
  avvio: 'sta partendo',
  pronta: 'pronta, aspetta un messaggio',
  consegna: 'sta ricevendo un messaggio',
  lavora: 'lavora',
  aspetta: 'ha finito e aspetta',
  scelta: 'aspetta una scelta',
  lenta: 'lenta a partire',
  chiusa: 'chiusa'
}

function quando(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function SottofondoQui({ vuoto }: { vuoto?: React.ReactNode } = {}): React.JSX.Element | null {
  const [elenco, setElenco] = useState<StatoSottofondo[]>([])
  const [aperto, setAperto] = useState(false)
  const [esito, setEsito] = useState<string | undefined>(undefined)
  /** «Guarda» (0.68.1): lo schermo dal vivo di una chat, riletto ogni due secondi. */
  const [guardo, setGuardo] = useState<string | undefined>(undefined)
  const [schermo, setSchermo] = useState<string[]>([])
  useEffect(() => {
    if (guardo === undefined) return
    let vivo = true
    const leggi = (): void => { void window.gestore.sottofondo.schermo(guardo).then((r) => { if (vivo) setSchermo(r ?? ['(la chat non è più in sottofondo)']) }).catch(() => undefined) }
    leggi()
    const t = setInterval(leggi, 2000)
    return () => { vivo = false; clearInterval(t) }
  }, [guardo])
  useEffect(() => {
    let vivo = true
    const leggi = (): void => { void window.gestore.sottofondo.elenco().then((e) => { if (vivo) setElenco(e) }).catch(() => undefined) }
    leggi()
    const via = window.gestore.sottofondo.suCambiato(leggi)
    // Anche a tempo: lo stato (lavora, aspetta) cambia senza che l'elenco cambi.
    const t = setInterval(leggi, 5000)
    return () => { vivo = false; via(); clearInterval(t) }
  }, [])
  // Nessuna: niente tasto nella barra; nel pannello «Chat e workspace» (0.61.0) si dice.
  if (elenco.length === 0) return vuoto === undefined ? null : <>{vuoto}</>
  return (
    <span className="sottofondo-qui">
      <button
        className="tasto"
        onClick={() => setAperto((a) => !a)}
        aria-expanded={aperto}
        title="Le chat che lavorano qui senza riquadro sullo schermo: autopiloti e chat usate da altri PC o dal telefono"
      >
        ⇄ Al lavoro in sottofondo ({elenco.length})
      </button>
      {aperto ? (
        <div className="sottofondo-qui__elenco" role="dialog" aria-label="Chat usate da altri PC">
          <div className="sottofondo-qui__titolo con-aiuto">Al lavoro in sottofondo
            <Aiuto di="Al lavoro in sottofondo">
              Si vede sempre chi lavora (anche senza riquadro): le chat degli autopiloti il cui workspace non è sullo schermo, e quelle usate da un altro PC o dal telefono. «Guarda» mostra lo schermo dal vivo senza cambiare workspace.{' '}
              Queste chat sono di questo PC e girano qui in sottofondo, senza riquadro: le sta usando un altro PC o il telefono, che ne vede lo schermo e le scrive. Restano vive anche se nessuna finestra le mostra, e ripartono da sole se questo PC si riavvia. «Mostra qui» la porta in un riquadro di questa finestra senza riavviarla (chi la usa da lontano continua a vederla). «Chiudi» ferma il processo: la conversazione resta su disco e si riprende quando si vuole.
            </Aiuto>
          </div>
          {elenco.map((c) => (
            <div key={c.sessione} className="sottofondo-qui__voce">
              <div className="sottofondo-qui__nome" title={c.cwd}>{c.titolo}</div>
              <div className="sottofondo-qui__dettagli">
                <b>{etichettaSottofondo(c.fase)}</b> · {FASI[c.fase] ?? c.fase} · {c.autopilota !== undefined ? 'autopilota' : `usata da ${c.perChi.nome}`}{c.inCoda > 0 ? ` · ${c.inCoda} messaggi in attesa` : ''}{quando(c.dal) !== '' ? ` · dalle ${quando(c.dal)}` : ''}
                {(() => {
                  const t = Date.parse(c.ultimoDatoIl ?? '')
                  return etichettaSottofondo(c.fase) === 'al lavoro' && !Number.isNaN(t) && Date.now() - t >= SENZA_SEGNI_MS
                    ? <span style={{ color: 'var(--ambra)' }}> · ⚠ nessun segno da {durata(Date.now() - t)}</span>
                    : null
                })()}
              </div>
              <div className="sottofondo-qui__dettagli">{c.cwd}</div>
              <div className="remoto__azioni">
                <button className="tasto tasto--primario" onClick={() => setGuardo(guardo === c.sessione ? undefined : c.sessione)}>{guardo === c.sessione ? 'Smetti di guardare' : 'Guarda'}</button>
                <button className="tasto" onClick={() => {
                  void window.gestore.sottofondo.mostra(c.sessione).then((r) => {
                    setEsito(r.ok ? `«${c.titolo}» è in un riquadro di questa finestra.` : r.messaggio)
                    if (r.ok) setAperto(false)
                  })
                }}>Mostra qui</button>
                <button className="tasto" onClick={() => {
                  void window.gestore.sottofondo.chiudi(c.sessione).then((ok) => setEsito(ok ? `«${c.titolo}» chiusa: la conversazione resta su disco.` : 'Era già chiusa.'))
                }}>Chiudi</button>
              </div>
            </div>
          ))}
          {guardo !== undefined ? (
            <pre className="sottofondo-qui__schermo" style={{ maxHeight: 320, overflow: 'auto', fontSize: 11, background: 'var(--sfondo-terminale, #0d1117)', padding: 6, margin: '6px 0' }}>{schermo.join(String.fromCharCode(10))}</pre>
          ) : null}
          {esito !== undefined ? <div className="sottofondo-qui__nota">{esito}</div> : null}
        </div>
      ) : null}
    </span>
  )
}
