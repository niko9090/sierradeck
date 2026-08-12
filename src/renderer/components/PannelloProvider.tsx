import { useEffect, useState } from 'react'

type Stato = { attivo: boolean; baseUrl: string; modello: string; haToken: boolean }

/**
 * Dove si dice al Gestore con quale API parlare.
 *
 * Claude Code sa parlare con qualunque servizio che ne rispetti il protocollo:
 * gli si dice dove andare, con quale chiave e — se quel servizio ha nomi suoi —
 * quale modello. Qui si scrive, e vale per le chat aperte da qui in avanti:
 * quelle già in corso hanno il loro processo avviato.
 *
 * La chiave si scrive e non si rilegge: il campo resta vuoto anche quando ce
 * n'è una salvata, e lasciarlo vuoto non la cancella. Toglierla è un gesto a
 * parte, perché è irreversibile.
 */
export function PannelloProvider({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [stato, setStato] = useState<Stato | undefined>(undefined)
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [modello, setModello] = useState('')
  const [salvato, setSalvato] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)

  useEffect(() => {
    window.gestore.provider
      .leggi()
      .then((s) => {
        setStato(s)
        setBaseUrl(s.baseUrl)
        setModello(s.modello)
      })
      .catch((err: unknown) => setErrore(String(err)))
  }, [])

  const salva = (attivo: boolean, togliToken = false): void => {
    setErrore(undefined)
    window.gestore.provider
      .imposta({ attivo, baseUrl, token, modello, ...(togliToken ? { togliToken: true } : {}) })
      .then((s) => {
        setStato(s)
        setToken('')
        setSalvato(true)
      })
      .catch((err: unknown) => setErrore(String(err)))
  }

  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">Con quale AI parlano le chat</span>
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      <p style={{ margin: '0 0 10px', color: 'var(--testo-quieto)', fontSize: 12, lineHeight: 1.5 }}>
        Vuoto vuol dire <strong>Claude</strong>, con l’accesso che hai già fatto. Indicando un
        indirizzo, le chat nuove parleranno con quel servizio — deve capire il protocollo di
        Anthropic. Le chat già aperte non cambiano: hanno il loro processo avviato.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label className="etichetta" style={{ flex: '2 1 300px' }}>
          <span className="serigrafia">Indirizzo dell’API</span>
          <input
            className="campo"
            value={baseUrl}
            placeholder="https://…"
            onChange={(e) => { setBaseUrl(e.target.value); setSalvato(false) }}
          />
        </label>
        <label className="etichetta" style={{ flex: '2 1 240px' }}>
          <span className="serigrafia">
            Chiave {stato?.haToken === true ? '— ce n’è una salvata' : ''}
          </span>
          <input
            className="campo"
            type="password"
            value={token}
            placeholder={stato?.haToken === true ? 'lascia vuoto per non cambiarla' : 'la chiave del servizio'}
            onChange={(e) => { setToken(e.target.value); setSalvato(false) }}
          />
        </label>
        <label className="etichetta" style={{ flex: '1 1 160px' }}>
          <span className="serigrafia">Modello (facoltativo)</span>
          <input
            className="campo"
            value={modello}
            placeholder="il nome che usa quel servizio"
            onChange={(e) => { setModello(e.target.value); setSalvato(false) }}
          />
        </label>

        <button className="tasto tasto--primario" onClick={() => salva(true)}>
          Usa questo servizio
        </button>
        <button className="tasto" onClick={() => salva(false)} title="Le chat tornano a Claude, la configurazione resta scritta">
          Torna a Claude
        </button>
        {stato?.haToken === true ? (
          <button className="tasto" onClick={() => salva(stato.attivo, true)} title="Cancella la chiave salvata">
            Togli la chiave
          </button>
        ) : null}
      </div>

      <p style={{ margin: '10px 0 0', color: 'var(--testo-quieto)', fontSize: 11 }}>
        {errore !== undefined ? <span style={{ color: 'var(--rosso)' }}>⚠ {errore}</span>
          : salvato ? 'Salvato. Vale per le prossime chat.'
          : stato === undefined ? 'Leggo la configurazione…'
          : stato.attivo && stato.baseUrl !== '' ? `Adesso le chat parlano con ${stato.baseUrl}`
          : 'Adesso le chat parlano con Claude.'}
        {' '}La chiave resta su questo computer, nei dati di SierraDeck.
      </p>
    </div>
  )
}
