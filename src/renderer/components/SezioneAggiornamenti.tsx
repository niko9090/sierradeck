import type { Preferenze } from '@shared/preferenze'
import type { VistaNovita } from '@shared/finestra-novita'
import { Aiuto } from './Aiuto'

/** Apre la finestra degli aggiornamenti su quella vista, presa da chi ha premuto. */
export function apriFinestraAggiornamenti(vista: VistaNovita = { tipo: 'aggiornamento' }): void {
  void window.gestore.finestraNovita?.apri(vista).catch(() => undefined)
}

/**
 * «Aggiornamenti», in cima alle impostazioni (0.56.0). Dal 13/11 tutto
 * l'aggiornamento passa dalla sua finestra in basso a destra: qui solo la
 * versione, i due tasti che la aprono (lo stato, le novità) e la scelta dello
 * scaricamento da solo. Niente stato, tasti o «ultimo tentativo» doppi.
 */
export function SezioneAggiornamenti({ p, cambia, versione }: { p: Preferenze; cambia: (x: Partial<Preferenze>) => void; versione: string }): React.JSX.Element {
  return (
    <>
      <div className="impostazioni__riga">
        <span>Versione</span>
        <span style={{ flex: 1 }}>SierraDeck {versione}</span>
        <button className="tasto" onClick={() => apriFinestraAggiornamenti({ tipo: 'novita' })}>Novità di questa versione</button>
        <button className="tasto tasto--primario" onClick={() => apriFinestraAggiornamenti()} title="Stato, scaricamento, «Installa e riavvia»: nella finestra in basso a destra">Aggiornamenti…</button>
      </div>
      <label className="impostazioni__riga impostazioni__riga--spunta">
        <input type="checkbox" checked={p.scaricaAggiornamentiAutomatico} onChange={(e) => cambia({ scaricaAggiornamentiAutomatico: e.target.checked })} />
        <span className="con-aiuto">Scarica gli aggiornamenti da solo
          {/* Dentro la <label>: senza preventDefault un clic sulla spiegazione cambierebbe la spunta. */}
          <span onClick={(e) => e.preventDefault()}><Aiuto di="Scarica gli aggiornamenti da solo">
            Acceso: il computer scarica la versione nuova appena la trova, e ti chiede solo il tocco per installarla. Spento: la trova, te lo dice, e scarica quando premi «Scarica». In tutti e due i casi non installa mai da solo, e prima di installare aspetta che le chat finiscano il turno.
          </Aiuto></span>
        </span>
      </label>
    </>
  )
}
