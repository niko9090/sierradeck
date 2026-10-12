import { useState } from 'react'
import { Aiuto } from './Aiuto'
import { byteLeggibili, ETICHETTA_SPAZIO, TIPI_SPAZIO, inRecupero, type StatoSpazio, type TipoProposta } from '@shared/spazio-drive'

const data = (iso: string): string => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

/**
 * Lo spazio sul Drive in «Progetti» (0.65.0): quanto usa SierraDeck, per
 * tipo, e le pulizie. Ogni pulizia chiede la conferma, va nel recupero per
 * 30 giorni e si annulla.
 */
export function SpazioDrive({ spazio, occupato, onAzione }: {
  spazio: StatoSpazio | undefined
  occupato: boolean
  onAzione: (corpo: { azione: string; tipo?: TipoProposta; id?: string }) => void
}): React.JSX.Element {
  const [conferma, setConferma] = useState<{ tipo: 'pulisci'; proposta: TipoProposta } | { tipo: 'svuota'; id: string } | undefined>(undefined)
  const m = spazio?.misura
  const q = m?.quota
  const massimo = Math.max(1, ...TIPI_SPAZIO.map((t) => m?.perTipo[t].byte ?? 0))
  const inCorso = (spazio?.pulizie ?? []).filter(inRecupero)

  return (
    <div className="riordina__gruppo" style={{ marginBottom: 8 }}>
      <span className="con-aiuto"><span className="serigrafia">Spazio sul Drive</span><Aiuto di="spazio sul Drive">
        Quanto occupa SierraDeck nella sua cartella privata del tuo Drive, misurato file per file, diviso per tipo; e lo spazio
        del tuo account Google. Le pulizie proposte non cancellano subito niente: tolgono i file dall’indice e li tengono
        30 giorni nel recupero. «Annulla» li rimette; alla scadenza si cancellano da soli. «Svuota adesso» li cancella prima, con la tua conferma.
        Una chat tolta che riprende a lavorare su un PC risale da sola.
      </Aiuto></span>
      {spazio === undefined ? <div className="account__nota">Misuro il Drive…</div> : null}
      {spazio?.errore !== undefined ? <div className="account__nota" style={{ color: 'var(--ambra)' }}>{spazio.errore}</div> : null}
      {m !== undefined ? (
        <>
          <div className="account__nota" style={{ marginTop: 4 }}>
            SierraDeck usa <b>{byteLeggibili(m.totale.byte)}</b> in {m.totale.file} file
            {q !== undefined ? <> · account: {byteLeggibili(q.usato)}{q.limite !== undefined ? ` di ${byteLeggibili(q.limite)}` : ''}</> : null}
            {m.inRecupero.byte > 0 ? <> · nel recupero {byteLeggibili(m.inRecupero.byte)}</> : null}
            {' '}· misurato {new Date(m.misuratoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '2px 8px', alignItems: 'center', marginTop: 4 }}>
            {TIPI_SPAZIO.filter((t) => m.perTipo[t].file > 0).map((t) => (
              <div key={t} style={{ display: 'contents' }}>
                <span className="account__nota">{ETICHETTA_SPAZIO[t]}</span>
                <span style={{ height: 6, background: 'var(--bordo, #333)', borderRadius: 3, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.max(1, (m.perTipo[t].byte / massimo) * 100)}%`, background: 'var(--verde)' }} />
                </span>
                <span className="account__nota" style={{ textAlign: 'right' }}>{byteLeggibili(m.perTipo[t].byte)} · {m.perTipo[t].file}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {(spazio?.proposte ?? []).map((p) => (
        <div key={p.tipo} className="dove__riga">
          <span className="riordina__testo" style={{ flex: 1 }}>
            <b>{p.titolo}</b> <span className="account__nota">· {p.breve} · libera {byteLeggibili(p.byte)}</span>
          </span>
          <Aiuto di={p.titolo}>{p.spiega}</Aiuto>
          {conferma?.tipo === 'pulisci' && conferma.proposta === p.tipo ? (
            <>
              <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => { setConferma(undefined); onAzione({ azione: 'spazio-pulisci', tipo: p.tipo }) }}>Conferma: nel recupero</button>
              <button className="tasto tasto--mini" onClick={() => setConferma(undefined)}>No</button>
            </>
          ) : (
            <button className="tasto tasto--mini" disabled={occupato} onClick={() => setConferma({ tipo: 'pulisci', proposta: p.tipo })}>Pulisci…</button>
          )}
        </div>
      ))}
      {m !== undefined && (spazio?.proposte ?? []).length === 0 ? <div className="account__nota">Niente da pulire.</div> : null}
      {inCorso.map((x) => (
        <div key={x.id} className="dove__riga">
          <span className="riordina__testo" style={{ flex: 1 }}>
            <b>{x.titolo}</b> <span className="account__nota">· {x.voci.length} file, {byteLeggibili(x.byte)} · nel recupero fino al {data(x.scadeIl)} · da {x.chi}</span>
          </span>
          <button className="tasto tasto--mini" disabled={occupato} onClick={() => onAzione({ azione: 'spazio-annulla', id: x.id })}>Annulla</button>
          {conferma?.tipo === 'svuota' && conferma.id === x.id ? (
            <>
              <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => { setConferma(undefined); onAzione({ azione: 'spazio-svuota', id: x.id }) }}>Cancella per sempre</button>
              <button className="tasto tasto--mini" onClick={() => setConferma(undefined)}>No</button>
            </>
          ) : (
            <button className="tasto tasto--mini" disabled={occupato} onClick={() => setConferma({ tipo: 'svuota', id: x.id })} title="Cancella adesso questi file dal Drive, senza aspettare i 30 giorni: dopo non si annulla più">Svuota adesso…</button>
          )}
        </div>
      ))}
      <div style={{ marginTop: 4 }}>
        <button className="tasto tasto--mini" disabled={occupato} onClick={() => onAzione({ azione: 'spazio-misura' })}>Misura adesso</button>
      </div>
    </div>
  )
}
