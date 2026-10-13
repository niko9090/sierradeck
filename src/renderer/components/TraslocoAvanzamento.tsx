import { useState } from 'react'
import { Aiuto } from './Aiuto'
import { PASSI_TRASLOCO, annullabile, avanzamento, type Trasloco } from '@shared/trasloco'

const ICONA: Record<string, string> = { fatto: '✓', 'in-corso': '…', fermo: '!', 'da-fare': '·' }

/**
 * Il trasloco di un progetto passo per passo (0.65.0): la barra, il passo di
 * adesso descritto, i passi fatti e quelli che mancano; se è fermo il motivo
 * e «Riprendi»; alla fine il riassunto con «Annulla tutto» per 30 giorni.
 */
export function TraslocoAvanzamento({ t, occupato, onAzione }: {
  t: Trasloco
  occupato: boolean
  onAzione: (azione: 'trasloco-riprendi' | 'trasloco-annulla' | 'trasloco-senza', id: string, pc?: string) => void
}): React.JSX.Element {
  const [conferma, setConferma] = useState(false)
  // «Aspetta quel PC» (0.71.1): non c'è niente da fare, riparte da solo; si dice e basta.
  const [aspetto, setAspetto] = useState(false)
  const [senza, setSenza] = useState(false)
  const chiaro = t.fermoChiaro
  const a = avanzamento(t)
  const finito = t.finitoIl !== undefined
  const titolo = t.annullatoIl !== undefined ? 'annullato' : finito ? 'fatto' : t.fermo !== undefined ? 'fermo' : 'in corso'
  return (
    <div className="riordina__gruppo" style={{ marginBottom: 8 }}>
      <span className="con-aiuto">
        <span className="serigrafia">Trasloco di «{t.nome}» su {t.verso.nome} · {titolo}</span>
        <Aiuto di="trasloco">
          «Sposta progetto» e «Rendi residente» sono lo stesso passaggio: raccolgo le copie dagli altri PC, le confronto file per file,
          unisco qui quello che serve (le versioni diverse vanno nei recuperati, mai perse), e solo alla fine metto le copie vecchie
          nel recupero dei loro PC. Se un PC non risponde mi fermo con il motivo e riprendo da dove ero quando torna.
          «Annulla tutto» rimette com’era per 30 giorni.
        </Aiuto>
      </span>
      <div style={{ height: 8, background: 'var(--bordo, #333)', borderRadius: 4, overflow: 'hidden', margin: '6px 0' }}>
        <div style={{ height: '100%', width: `${a.percento}%`, background: t.fermo !== undefined ? 'var(--ambra)' : 'var(--verde)' }} />
      </div>
      {a.attuale !== undefined && !finito ? (
        <div className="account__nota"><b>{a.attuale.titolo}</b>{a.attuale.dettaglio !== undefined ? `: ${a.attuale.dettaglio}` : '…'}</div>
      ) : null}
      {t.fermo !== undefined && chiaro?.pc !== undefined ? (
        // Un PC spento (0.71.1): il motivo in chiaro e le due scelte.
        <div className="account__nota" style={{ color: 'var(--ambra)' }}>
          Fermo: {chiaro.testo}
          {chiaro.scelte ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <button className={`tasto tasto--mini${aspetto ? ' tasto--acceso' : ''}`} disabled={occupato} onClick={() => { setAspetto(true); setSenza(false) }}>Aspetta {chiaro.pc.nome}</button>
              {senza ? (
                <>
                  <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => { setSenza(false); onAzione('trasloco-senza', t.id, chiaro.pc?.pc) }}>Conferma: vai avanti senza</button>
                  <button className="tasto tasto--mini" onClick={() => setSenza(false)}>No</button>
                </>
              ) : (
                <button className="tasto tasto--mini" disabled={occupato} onClick={() => { setSenza(true); setAspetto(false) }}>Vai avanti senza…</button>
              )}
              <Aiuto di="PC spento">
                «Aspetta»: non devi fare niente, il trasloco riparte da solo quando {chiaro.pc.nome} si riaccende. «Vai avanti senza»: uso la
                copia di {chiaro.pc.nome} che è già sul Drive; la sua copia sul PC resta dov’è e, quando torna, quello che ha solo lui entra qui
                nei recuperati e la sua copia va nel recupero di quel PC per 30 giorni. Niente si cancella.
              </Aiuto>
            </div>
          ) : null}
          {aspetto ? <div>Aspetto {chiaro.pc.nome}: riparto da solo quando si riaccende.</div> : null}
        </div>
      ) : t.fermo !== undefined ? (
        <div className="account__nota" style={{ color: 'var(--ambra)' }}>
          Fermo: {chiaro?.testo ?? t.fermo.motivo}{t.fermo.riprovaDaSolo ? ' Riprendo da solo quando passa.' : ''}
        </div>
      ) : null}
      {t.altrove.some((a) => a.esito === 'dopo') ? (
        <div className="account__nota">
          {t.altrove.filter((a) => a.esito === 'dopo').map((a) => `${a.nome} era spento: la sua copia la sistemo quando torna.`).join(' ')}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
        {PASSI_TRASLOCO.map((p) => {
          const s = t.passi[p.id]
          return (
            <span key={p.id} className="account__nota" title={p.spiega} style={{ opacity: s.stato === 'da-fare' ? 0.6 : 1, color: s.stato === 'fermo' ? 'var(--ambra)' : undefined }}>
              {ICONA[s.stato]} {p.titolo}{s.stato !== 'da-fare' && s.dettaglio !== undefined && s.stato !== 'in-corso' ? ` — ${s.dettaglio}` : ''}
            </span>
          )
        })}
      </div>
      {finito && (t.riassunto ?? []).length > 0 ? (
        <div style={{ marginTop: 4 }}>
          {(t.riassunto ?? []).map((r, i) => <div key={i} className="account__nota">• {r}</div>)}
        </div>
      ) : null}
      {t.annullatoIl !== undefined ? (t.annullamento ?? []).map((r, i) => <div key={i} className="account__nota">• {r}</div>) : null}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {t.fermo !== undefined ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => onAzione('trasloco-riprendi', t.id)}>Riprendi</button> : null}
        {annullabile(t, Date.now()) && (finito || t.fermo !== undefined) ? (
          conferma ? (
            <>
              <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => { setConferma(false); onAzione('trasloco-annulla', t.id) }}>Conferma: annulla tutto</button>
              <button className="tasto tasto--mini" onClick={() => setConferma(false)}>No</button>
            </>
          ) : (
            <button className="tasto tasto--mini" disabled={occupato} onClick={() => setConferma(true)} title={t.scadeIl !== undefined ? `Fino al ${new Date(t.scadeIl).toLocaleDateString('it-IT')}` : undefined}>Annulla tutto…</button>
          )
        ) : null}
      </div>
    </div>
  )
}
