import { useEffect, useState } from 'react'
import type { Preferenze } from '@shared/preferenze'
import {
  combinazioneDi, DESCRIZIONE_AZIONE, doppioni, GRUPPI_AZIONI, SCORCIATOIE_PREDEFINITE, type Azione
} from '@shared/scorciatoie'
import { sospendiScorciatoie } from '../scorciatoie-vive'

type Props = {
  p: Preferenze
  cambia: (parziale: Partial<Preferenze>) => void
}

/**
 * La sezione «Scorciatoie da tastiera» delle Impostazioni.
 *
 * Ogni azione ha la sua riga: cosa fa, i tasti di adesso, «Cambia» e
 * «Togli». Premuto «Cambia» la riga si mette in ascolto: la prossima
 * combinazione premuta diventa la scorciatoia, Esc annulla. Mentre si
 * ascolta, le scorciatoie vive sono sospese, altrimenti premere Ctrl+Tab per
 * assegnarlo cambierebbe workspace invece di scriversi nella casella.
 * Due azioni con gli stessi tasti si segnano in ambra: vale la prima
 * dell'elenco, e la seconda non risponde finche' non la si cambia.
 */
export function SezioneScorciatoie({ p, cambia }: Props): React.JSX.Element {
  const [inAscolto, setInAscolto] = useState<Azione | undefined>(undefined)
  const s = p.scorciatoie
  const dop = doppioni(s)

  useEffect(() => {
    sospendiScorciatoie(inAscolto !== undefined)
    if (inAscolto === undefined) return
    const suTasto = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setInAscolto(undefined); return }
      const c = combinazioneDi(e)
      if (c === undefined) return
      cambia({ scorciatoie: { ...s, [inAscolto]: c } })
      setInAscolto(undefined)
    }
    window.addEventListener('keydown', suTasto, true)
    return () => {
      window.removeEventListener('keydown', suTasto, true)
      sospendiScorciatoie(false)
    }
  }, [inAscolto, s, cambia])

  const quanteCambiate = (Object.keys(s) as Azione[]).filter((a) => s[a] !== SCORCIATOIE_PREDEFINITE[a]).length

  return (
    <section className="impostazioni__gruppo">
      <h4>Scorciatoie da tastiera</h4>
      <div className="impostazioni__nota">
        Valgono in tutta la finestra, anche con il cursore dentro una chat: la combinazione non arriva a Claude
        Code. Per cambiarne una premi «Cambia» e poi i tasti che vuoi (Esc per lasciar stare); «Togli» la spegne.
        Servono Ctrl o Alt, oppure un tasto funzione: una lettera da sola è scrittura, non un comando. I tasti si
        leggono per posizione, quindi Alt+1 è il tasto «1» anche sulla tastiera italiana con Maiusc. Di fabbrica
        non c’è nessun Ctrl+lettera, perché li usa quasi tutti Claude Code, e nessun Ctrl+Alt, perché sulla
        tastiera italiana è AltGr («€», «@»). Ctrl+Shift+C e Ctrl+Shift+V restano copia e incolla.
        {dop.size > 0 ? ' Le righe in ambra hanno gli stessi tasti di un’altra: risponde la prima dell’elenco.' : ''}
      </div>
      {GRUPPI_AZIONI.map((g) => (
        <div key={g.titolo} className="scorciatoie__gruppo">
          <div className="scorciatoie__titolo">{g.titolo}</div>
          {g.azioni.map((a) => {
            const c = s[a]
            const doppia = c !== '' && dop.has(c)
            const ascolta = inAscolto === a
            return (
              <div key={a} className={`scorciatoie__riga${doppia ? ' scorciatoie__riga--doppia' : ''}`}>
                <span className="scorciatoie__cosa">{DESCRIZIONE_AZIONE[a]}</span>
                <span className={`scorciatoie__tasti${ascolta ? ' scorciatoie__tasti--ascolto' : ''}`} aria-live="polite">
                  {ascolta ? 'premi i tasti…' : c === '' ? <i>nessuno</i> : <kbd>{c}</kbd>}
                </span>
                <span className="scorciatoie__azioni">
                  <button className="tasto tasto--mini" onClick={() => setInAscolto(ascolta ? undefined : a)}>
                    {ascolta ? 'Annulla' : 'Cambia'}
                  </button>
                  <button className="tasto tasto--mini" disabled={c === ''} onClick={() => cambia({ scorciatoie: { ...s, [a]: '' } })}>
                    Togli
                  </button>
                  {c !== SCORCIATOIE_PREDEFINITE[a] ? (
                    <button
                      className="tasto tasto--mini"
                      title={`Di fabbrica: ${SCORCIATOIE_PREDEFINITE[a] === '' ? 'nessuno' : SCORCIATOIE_PREDEFINITE[a]}`}
                      onClick={() => cambia({ scorciatoie: { ...s, [a]: SCORCIATOIE_PREDEFINITE[a] } })}
                    >
                      Di fabbrica
                    </button>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      ))}
      <div className="impostazioni__riga">
        <span className="impostazioni__nota">
          {quanteCambiate === 0
            ? 'Sono tutte quelle di fabbrica.'
            : quanteCambiate === 1 ? 'Una scorciatoia è diversa da quella di fabbrica.' : `${quanteCambiate} scorciatoie sono diverse da quelle di fabbrica.`}
        </span>
        <button
          className="tasto"
          disabled={quanteCambiate === 0}
          onClick={() => cambia({ scorciatoie: { ...SCORCIATOIE_PREDEFINITE } })}
        >
          Tutte di fabbrica
        </button>
      </div>
    </section>
  )
}
