import { Component, type ReactNode, type ErrorInfo } from 'react'

/**
 * Il confine che impedisce a un singolo errore di render di portarsi via **tutta**
 * l'interfaccia.
 *
 * Senza di lui, un `throw` in un qualunque componente — una modale, il mosaico,
 * un pannello — fa smontare a React l'intero albero: la finestra resta un
 * rettangolo vuoto e nulla è più cliccabile, la barra dei workspace compresa. Da
 * fuori sembra «il programma si è chiuso», e non ne resta traccia da nessuna
 * parte perché l'errore muore nella console del renderer, non nel file di log.
 *
 * Qui invece l'errore si ferma: si mostra una schermata di recupero con il
 * **messaggio vero**, lo si scrive nel registro di sessione (così chi non ha la
 * console aperta può comunque allegarlo), e si offre un «Ricarica» che rimonta
 * l'app senza chiudere il programma — le chat tornano dal salvataggio automatico.
 */

type Stato = { errore?: Error }

export class ConfineErrori extends Component<{ children: ReactNode }, Stato> {
  state: Stato = {}

  static getDerivedStateFromError(errore: Error): Stato {
    return { errore }
  }

  componentDidCatch(errore: Error, info: ErrorInfo): void {
    // Nel registro di sessione: è l'unico posto che sopravvive alla chiusura e
    // che l'utente può allegare senza aprire la console.
    const dettaglio = `${errore.name}: ${errore.message}\n${errore.stack ?? ''}\n${info.componentStack ?? ''}`
    try {
      void window.gestore?.log?.errore?.(`[renderer] errore di render — ${dettaglio}`)
    } catch {
      // Se persino il ponte è rotto, resta la console: meglio di niente.
    }
    console.error('[ConfineErrori] errore di render:', errore, info)
  }

  render(): ReactNode {
    const { errore } = this.state
    if (errore === undefined) return this.props.children

    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        background: 'var(--fondo, #14161a)', color: 'var(--testo, #e6e6e6)',
        fontFamily: 'system-ui, sans-serif', textAlign: 'center'
      }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Qualcosa si è rotto nell’interfaccia</div>
        <div style={{ fontSize: 13, maxWidth: 560, opacity: 0.85, lineHeight: 1.5 }}>
          Il programma <b>non</b> si è chiuso e le chat aperte sono al sicuro. Premi
          «Ricarica» per rimettere in piedi la plancia; se ricapita, il dettaglio qui sotto
          dice cosa è andato storto ed è già scritto nel registro.
        </div>
        <pre style={{
          maxWidth: 640, maxHeight: 220, overflow: 'auto', textAlign: 'left',
          fontSize: 11, background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap'
        }}>
          {errore.name}: {errore.message}
          {errore.stack !== undefined ? `\n\n${errore.stack}` : ''}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              borderRadius: 8, border: 'none', background: '#57d38c', color: '#0a0f0c'
            }}
          >
            Ricarica
          </button>
          <button
            onClick={() => { void window.gestore?.log?.apri?.() }}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              borderRadius: 8, border: '1px solid rgba(255,255,255,.2)',
              background: 'transparent', color: 'inherit'
            }}
          >
            Apri il registro
          </button>
        </div>
      </div>
    )
  }
}
