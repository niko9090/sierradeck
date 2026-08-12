import { useEffect, useState } from 'react'
import { nomeDaCartella, validaNuovaChat, type PropostaChat } from '../nuova-chat'

type Props = {
  proposta: PropostaChat
  onApri: (cartella: string, nome: string) => void
  onAnnulla: () => void
}

/**
 * Dove lavorare e come chiamarla, prima di aprire la chat.
 *
 * Prima la chat nasceva nella cartella indovinata e si chiamava «Nuova chat»:
 * con sei riquadri aperti diventavano sei etichette identiche in sei cartelle
 * che nessuno aveva scelto, e ci si accorgeva del posto sbagliato solo dopo,
 * quando Claude Code cominciava a leggere i file di un altro progetto.
 *
 * La domanda è gratuita per chi lavora sempre nello stesso posto: i campi
 * arrivano già compilati con la proposta di prima, e Invio apre. Serve a chi
 * sta cambiando progetto, che è esattamente chi ne ha bisogno.
 *
 * La cartella si controlla mentre si scrive, e il tasto resta spento finché non
 * esiste: l'alternativa è un riquadro che si apre e un errore di node-pty in un
 * terminale nero, che non aiuta nessuno.
 */
export function ModaleNuovaChat({ proposta, onApri, onAnnulla }: Props): React.JSX.Element {
  const [cartella, setCartella] = useState(proposta.cartella)
  const [nome, setNome] = useState(proposta.nome)
  const [esiste, setEsiste] = useState<boolean | undefined>(undefined)

  const esito = validaNuovaChat({ cartella, nome })
  const daControllare = esito.ok ? esito.cartella : undefined

  // Il controllo segue quello che si scrive, con l'ultima risposta che vince:
  // digitando in fretta le risposte tornano fuori ordine, e senza questa
  // guardia il messaggio finirebbe per raccontare una cartella di due lettere fa.
  useEffect(() => {
    if (daControllare === undefined) {
      setEsiste(undefined)
      return
    }
    let annullato = false
    window.gestore.sistema
      .cartellaEsiste(daControllare)
      .then((c) => { if (!annullato) setEsiste(c) })
      .catch(() => { if (!annullato) setEsiste(undefined) })
    return () => { annullato = true }
  }, [daControllare])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onAnnulla() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onAnnulla])

  const pronta = esito.ok && esiste === true

  const apri = (): void => {
    if (!esito.ok || !pronta) return
    onApri(esito.cartella, esito.nome)
  }

  const sfoglia = (): void => {
    void window.gestore.sistema
      .scegliCartella()
      .then((scelta) => {
        if (scelta === undefined) return
        // Il nome segue la cartella solo finché è quello che le avevamo
        // proposto noi: chi ha scritto un titolo suo non deve vederselo
        // sostituire perché ha premuto «Sfoglia».
        const suo = nome.trim() !== '' && nome !== nomeDaCartella(cartella)
        setCartella(scelta)
        if (!suo) setNome(nomeDaCartella(scelta))
      })
      .catch(() => undefined)
  }

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnnulla() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Nuova chat</span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onAnnulla}>Annulla</button>
        </div>

        <label className="serigrafia" htmlFor="nuova-chat-cartella">Dove lavora</label>
        <div style={{ display: 'flex', gap: 6, margin: '4px 0 2px' }}>
          <input
            id="nuova-chat-cartella"
            className="campo"
            style={{ flex: 1 }}
            value={cartella}
            spellCheck={false}
            placeholder="C:\Progetti\il-mio-progetto"
            onChange={(e) => setCartella(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') apri() }}
          />
          <button className="tasto" onClick={sfoglia}>Sfoglia…</button>
        </div>
        <div className="misura" style={{ minHeight: 18, marginBottom: 10 }}>
          {!esito.ok
            ? <span style={{ color: 'var(--ambra)' }}>{esito.motivo}</span>
            : esiste === false
              ? <span style={{ color: 'var(--ambra)' }}>Questa cartella non esiste.</span>
              : esiste === true
                ? <span>La chat vivrà qui, e ci resterà legata.</span>
                : <span>Controllo…</span>}
        </div>

        <label className="serigrafia" htmlFor="nuova-chat-nome">Come si chiama</label>
        <input
          id="nuova-chat-nome"
          className="campo"
          style={{ width: '100%', margin: '4px 0 2px' }}
          value={nome}
          autoFocus
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apri() }}
        />
        <div className="misura" style={{ minHeight: 18, marginBottom: 12 }}>
          Lasciandolo vuoto prende il nome della cartella.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="tasto tasto--primario" onClick={apri} disabled={!pronta}>
            Apri la chat
          </button>
        </div>
      </div>
    </div>
  )
}
