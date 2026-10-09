import { useEffect, useState } from 'react'
import type { StatoAggiornamento } from '../../main/aggiornamenti'
import type { Preferenze } from '@shared/preferenze'

/**
 * «Aggiornamenti», in cima alle impostazioni (0.56.0). Nicholas (09/10):
 * «Nelle impostazioni l'aggiornamento lo puoi mettere in alto all'inizio?».
 * La versione installata, se ce n'è una nuova, le note, il tasto per
 * installarla (con la stessa finestra delle note del resto del programma),
 * com'è andato l'ultimo tentativo — anche quello non riuscito — e lo
 * scaricamento da solo.
 */
export function SezioneAggiornamenti({ p, cambia, versione }: { p: Preferenze; cambia: (x: Partial<Preferenze>) => void; versione: string }): React.JSX.Element {
  const [s, setS] = useState<StatoAggiornamento | undefined>(undefined)
  useEffect(() => {
    void window.gestore.aggiornamenti.stato().then(setS).catch(() => undefined)
    return window.gestore.aggiornamenti.suStato(setS)
  }, [])
  const fase = s?.fase ?? 'fermo'
  const testo = fase === 'cerco' ? 'Sto guardando se c’è una versione nuova…'
    : fase === 'aggiornato' ? `È all’ultima versione (${versione}).`
    : fase === 'disponibile' ? `C’è la ${s?.versione ?? 'versione nuova'}: si può scaricare.`
    : fase === 'scarico' ? `Scarico la ${s?.versione ?? 'versione nuova'}… ${s?.percento ?? 0}%`
    : fase === 'pronto' ? `La ${s?.versione ?? 'versione nuova'} è pronta da installare.`
    : fase === 'attendo' ? `Installo appena ${s?.chatOccupate !== undefined && s.chatOccupate > 0 ? `${s.chatOccupate === 1 ? 'la chat finisce' : `le ${s.chatOccupate} chat finiscono`} il turno` : (s?.attesa ?? 'c’è quiete')}: niente si perde.`
    : fase === 'installo' ? 'Sto installando: il programma si chiude e si riapre da solo.'
    : fase === 'errore' ? `Qualcosa non è andato: ${s?.errore ?? 'motivo non detto'}.`
    : 'Controlla da sé ogni sei ore. «Cerca ora» lo fa subito.'
  return (
    <>
      <div className="impostazioni__riga">
        <span>Versione</span>
        <span>SierraDeck {versione}</span>
        <button className="tasto" onClick={() => window.dispatchEvent(new Event('sierradeck:apri-novita'))}>Novità di questa versione</button>
      </div>
      <div className="impostazioni__riga">
        <span>Aggiornamento</span>
        <span style={{ flex: 1 }}>{testo}</span>
        {fase === 'disponibile' ? <button className="tasto" onClick={() => void window.gestore.aggiornamenti.scarica()}>Scarica</button> : null}
        {fase === 'pronto' ? (
          <button className="tasto tasto--primario" onClick={() => window.dispatchEvent(new CustomEvent('sierradeck:apri-installa', { detail: s?.versione ?? '' }))}>
            Cosa cambia e installa
          </button>
        ) : null}
        {['fermo', 'aggiornato', 'errore', 'disponibile'].includes(fase) ? <button className="tasto" onClick={() => void window.gestore.aggiornamenti.cerca()}>Cerca ora</button> : null}
      </div>
      {s?.tentativoFallito !== undefined ? (
        <div className="impostazioni__nota" style={{ color: 'var(--ambra)' }}>
          Ultimo tentativo: <b>{s.tentativoFallito.titolo}</b> {s.tentativoFallito.motivo}{' '}
          {s.tentativoFallito.strade.length > 0 ? <>Cosa puoi fare: {s.tentativoFallito.strade.map((x, i) => <span key={i}>{i + 1}. {x} </span>)}</> : null}
        </div>
      ) : (
        <div className="impostazioni__nota">Ultimo tentativo: nessuna installazione non riuscita da ricordare.</div>
      )}
      <label className="impostazioni__riga impostazioni__riga--spunta">
        <input type="checkbox" checked={p.scaricaAggiornamentiAutomatico} onChange={(e) => cambia({ scaricaAggiornamentiAutomatico: e.target.checked })} />
        <span>Scarica gli aggiornamenti da solo</span>
      </label>
      <div className="impostazioni__nota">
        Acceso: il computer scarica la versione nuova appena la trova, e ti chiede solo il tocco per installarla. Spento: la trova, te lo dice, e scarica quando premi «Scarica». In tutti e due i casi non installa mai da solo, e prima di installare aspetta che le chat finiscano il turno.
      </div>
    </>
  )
}
