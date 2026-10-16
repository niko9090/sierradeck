import { useState } from 'react'
import { richiestaRisposta, type Conversazione } from '@shared/domande-conversazioni'
import { SchedaDomandaVista } from './SchedaDomandaVista'
import { Aiuto } from './Aiuto'

/**
 * Le domande brevi a lato della chat (0.76.0). Nicholas, 16/10: se sei nella
 * chat (o nel suo workspace) e la domanda è breve — al massimo 200 caratteri e
 * 4 scelte — compare qui, con i tasti e «Scrivi tu»; le lunghe restano solo
 * nella sezione Domande. Quali vanno a lato lo decide `domandeALato`, la stessa
 * regola della pagina e dell'app.
 */
export function DomandeALato({ conversazioni, onRisposto }: { conversazioni: Conversazione[]; onRisposto: () => void }): React.JSX.Element | null {
  const [inCorso, setInCorso] = useState<string | undefined>(undefined)
  const [nota, setNota] = useState<Record<string, string>>({})
  if (conversazioni.length === 0) return null
  const manda = (c: Conversazione, percorso: string, corpo: Record<string, string>): void => {
    if (inCorso !== undefined) return
    setInCorso(c.chiave)
    setNota((n) => { const { [c.chiave]: _via, ...resto } = n; return resto })
    void window.gestore.domande
      .chiama(percorso, corpo)
      .then((r) => {
        const errore = (r.corpo as { errore?: string } | undefined)?.errore
        if (r.stato === 423) { setNota((n) => ({ ...n, [c.chiave]: 'Chat protetta dal PIN: rispondi dalla sezione Domande.' })); return }
        if (r.stato >= 400 || errore !== undefined) { setNota((n) => ({ ...n, [c.chiave]: `Non è andata: ${errore ?? `il computer ha risposto ${r.stato}`}` })); return }
        onRisposto()
      })
      .catch((e: unknown) => setNota((n) => ({ ...n, [c.chiave]: `Non è andata: ${String(e)}` })))
      .finally(() => setInCorso(undefined))
  }
  return (
    <aside className="domande-a-lato" aria-label="Domande brevi delle chat di questo workspace">
      <div className="serigrafia con-aiuto">
        Ti chiede
        <Aiuto di="le domande a lato">Le domande brevi delle chat di questo workspace (fino a 200 caratteri e 4 scelte) compaiono qui, accanto alla chat: tocchi una scelta o scrivi tu. Quelle lunghe restano nella sezione «Domande».</Aiuto>
      </div>
      {conversazioni.map((c) => c.scheda === undefined ? null : (
        <div key={c.chiave} className="domande-a-lato__voce">
          <div className="misura">{c.suPc !== undefined ? `SU ${c.suPc} · ` : ''}{c.titolo}</div>
          <SchedaDomandaVista
            scheda={c.scheda}
            inCorso={inCorso === c.chiave}
            etichettaManda={c.risposta.via === 'rispondi' ? 'Rispondi' : 'Manda'}
            onScelta={(o) => {
              if (o.libera === true) { setNota((n) => ({ ...n, [c.chiave]: 'Scrivi la risposta nel campo qui sotto e premi «Manda».' })); return }
              if (c.scelte !== undefined) manda(c, '/api/scegli', { chat: c.scelte.chat, opzione: o.testo })
              else { const r = richiestaRisposta(c.risposta, o.testo); manda(c, r.percorso, r.corpo) }
            }}
            onScrivi={(t) => { const r = richiestaRisposta(c.risposta, t); manda(c, r.percorso, r.corpo) }}
            sotto={nota[c.chiave] !== undefined ? <div className="avviso">⚠ {nota[c.chiave]}</div> : undefined}
          />
        </div>
      ))}
    </aside>
  )
}
