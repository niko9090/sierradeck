import { useEffect, useState } from 'react'
import { contaChat, contaWorkspace, type Istantanea } from '@shared/istantanea'
import { useLayoutStore } from '../state/layout'

/** Il nome sotto cui finisce il salvataggio automatico alla chiusura. */
export const NOME_AUTOMATICO = 'Ultima chiusura'

function quando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

function descrivi(i: Istantanea): string {
  // Le chat di **tutti** i workspace: contare i riquadri delle finestre diceva
  // quante se ne avevano davanti, e chi ne aveva sei divise in tre workspace
  // leggeva «2 chat» e pensava che le altre fossero perse.
  const chat = contaChat(i)
  const workspace = contaWorkspace(i)
  const parti = [chat === 1 ? '1 chat' : `${chat} chat`]
  if (workspace > 1) parti.push(`${workspace} workspace`)
  // Le finestre si nominano solo quando sono piu' d'una: «1 finestra» su ogni
  // riga sarebbe rumore, ma sapere che un salvataggio ne riaprira' due cambia
  // cosa ci si aspetta premendo «Riprendi».
  if (i.finestre.length > 1) parti.push(`${i.finestre.length} finestre`)
  if (i.autopiloti.length > 0) parti.push(`${i.autopiloti.length} autopiloti`)
  return parti.join(' · ')
}

type Props = {
  /** All'avvio la finestra si apre da sé, e allora l'accento va sul riprendere. */
  allAvvio?: boolean
  /** Quante chat sono già tornate da sole: cambia cosa ha senso dire. */
  chatGiaAperte?: number
  onChiudi: () => void
}

/**
 * Le istantanee: salvare tutto com'è adesso, e ritrovarlo con un clic.
 *
 * Un'istantanea porta le chat di ogni monitor e, se lo si chiede, gli
 * autopiloti. Al ricarico gli autopiloti **ripartono da capo** sul loro
 * obiettivo: le chat che governavano sono morte con la sessione precedente, e
 * far finta che continuino sarebbe una bugia che si scopre al primo turno.
 */
export function ModaleIstantanee({
  allAvvio = false,
  chatGiaAperte = 0,
  onChiudi
}: Props): React.JSX.Element {
  const [elenco, setElenco] = useState<Istantanea[]>([])
  const [nome, setNome] = useState('')
  const [conAutopiloti, setConAutopiloti] = useState(true)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    window.gestore.istantanee
      .elenca()
      .then(setElenco)
      .catch((e: unknown) => setErrore(String(e)))
  }, [])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const esegui = (op: () => Promise<unknown>): void => {
    if (inCorso) return
    setInCorso(true)
    setErrore(undefined)
    void op()
      .catch((e: unknown) => setErrore(String(e)))
      .finally(() => setInCorso(false))
  }

  /**
   * Salva sopra un salvataggio che esiste già.
   *
   * Era la cosa che mancava: chi aveva «desk_1» e aggiungeva una chat poteva
   * solo riprenderlo o buttarlo. Aggiornare il proprio salvataggio è il gesto
   * più naturale che ci sia, e non c'era.
   */
  const sovrascrivi = (i: Istantanea): void =>
    esegui(async () => {
      setElenco(await window.gestore.istantanee.salva(
        i.nome,
        useLayoutStore.getState().esporta(),
        conAutopiloti
      ))
    })

  const salva = (): void => {
    const scelto = nome.trim()
    if (scelto === '') return
    esegui(async () => {
      const tutte = await window.gestore.istantanee.salva(
        scelto,
        useLayoutStore.getState().esporta(),
        conAutopiloti
      )
      setElenco(tutte)
      setNome('')
    })
  }

  const carica = (i: Istantanea): void =>
    esegui(async () => {
      const layout = await window.gestore.istantanee.carica(i.nome)
      useLayoutStore.getState().carica(layout)
      onChiudi()
    })

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">
            {allAvvio ? 'Riprendi da dove avevi chiuso' : 'Salvataggi del gestore'}
          </span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>
            {allAvvio ? (chatGiaAperte > 0 ? 'Va bene così' : 'Comincia da zero') : 'Chiudi'}
          </button>
        </div>

        {allAvvio ? (
          <p style={{ margin: '0 0 12px', color: 'var(--testo-quieto)', fontSize: 12, lineHeight: 1.5 }}>
            {chatGiaAperte > 0
              ? `Le ${chatGiaAperte} chat dell’ultima volta sono già tornate. Puoi tenerle così, oppure caricare uno di questi salvataggi al loro posto.`
              : 'Ritrovi le chat con la disposizione che avevano.'}
            {' '}Gli autopiloti salvati ripartono dal loro obiettivo, con una chat nuova.
          </p>
        ) : null}

        {elenco.length === 0 ? (
          <div className="vuoto">
            Nessun salvataggio. Salvane uno qui sotto: al prossimo avvio lo ritrovi con un clic.
          </div>
        ) : (
          <div className="elenco-chat" style={{ maxHeight: '40vh' }}>
            {elenco.map((i) => (
              <div key={i.nome} className="riga">
                <span className="riga__nome">{i.nome}</span>
                <span className="riga__stato">{descrivi(i)}</span>
                <span className="misura">{quando(i.salvataIl)}</span>
                <button
                  className="tasto tasto--primario"
                  onClick={() => carica(i)}
                  disabled={inCorso}
                >
                  Riprendi
                </button>
                <button
                  className="tasto"
                  onClick={() => sovrascrivi(i)}
                  disabled={inCorso}
                  title={`Salva le chat di adesso dentro «${i.nome}», al posto di quelle salvate`}
                >
                  Aggiorna
                </button>
                <button
                  className="tasto"
                  onClick={() =>
                    esegui(async () => setElenco(await window.gestore.istantanee.elimina(i.nome)))
                  }
                  disabled={inCorso}
                  aria-label={`Elimina il salvataggio ${i.nome}`}
                  title="Elimina questo salvataggio"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--incisione)',
            boxShadow: '0 -1px 0 var(--luce-incisione) inset'
          }}
        >
          <span className="serigrafia">Salva adesso</span>
          <input
            className="campo"
            value={nome}
            placeholder="Nome del salvataggio"
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') salva() }}
            style={{ flex: '1 1 200px' }}
          />
          <label
            className="serigrafia"
            style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
            title="Salva anche obiettivo, cartella e criteri degli autopiloti attivi"
          >
            <input
              type="checkbox"
              checked={conAutopiloti}
              onChange={(e) => setConAutopiloti(e.target.checked)}
            />
            con gli autopiloti
          </label>
          <button
            className="tasto tasto--primario"
            onClick={salva}
            disabled={inCorso || nome.trim() === ''}
          >
            Salva
          </button>
        </div>

        {errore !== undefined ? (
          <div className="avviso" style={{ marginTop: 8, whiteSpace: 'normal' }}>⚠ {errore}</div>
        ) : null}
      </div>
    </div>
  )
}
