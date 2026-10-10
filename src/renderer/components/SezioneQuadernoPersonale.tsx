import { useCallback, useEffect, useState } from 'react'
import { testoEsito, valoreNascosto, type StatoQuadernoPersonale, type VocePersonale } from '@shared/quaderno-personale'

/**
 * «Quaderno personale» nelle Impostazioni (0.57.0): i dati riservati di
 * Nicholas, che le chat chiedono con `chiedi_dato_personale` e lui concede
 * nelle Domande. Qui si aggiungono, si cambiano, si tolgono; si vede chi li ha
 * chiesti e si revocano i «sempre per questa chat».
 */

type Bozza = { id?: string; nome: string; valore: string; nota: string }
const VUOTA: Bozza = { nome: '', valore: '', nota: '' }

const quando = (iso: string): string => new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })

export function SezioneQuadernoPersonale(): React.JSX.Element {
  const [s, setS] = useState<StatoQuadernoPersonale | undefined>(undefined)
  const [bozza, setBozza] = useState<Bozza>(VUOTA)
  const [visti, setVisti] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState<{ ok: boolean; testo: string } | undefined>(undefined)
  const [tuttiGliUsi, setTuttiGliUsi] = useState(false)
  const leggi = useCallback((): void => { void window.gestore.quadernoPersonale.stato().then(setS).catch(() => undefined) }, [])
  useEffect(() => { leggi(); return window.gestore.quadernoPersonale.quandoCambia(leggi) }, [leggi])

  const salva = (): void => {
    void window.gestore.quadernoPersonale.salva({
      ...(bozza.id !== undefined ? { id: bozza.id } : {}), nome: bozza.nome, valore: bozza.valore, ...(bozza.nota.trim() !== '' ? { nota: bozza.nota } : {})
    }).then((e) => {
      if (e.ok) { setNota({ ok: true, testo: bozza.id === undefined ? `«${bozza.nome.trim()}» aggiunta.` : `«${bozza.nome.trim()}» cambiata.` }); setBozza(VUOTA) } else setNota({ ok: false, testo: e.errore })
    })
  }
  const modifica = (v: VocePersonale): void => { setBozza({ id: v.id, nome: v.nome, valore: v.valore, nota: v.nota ?? '' }); setNota(undefined) }
  const togli = (v: VocePersonale): void => {
    if (!window.confirm(`Togliere «${v.nome}» dal quaderno personale? Il valore si cancella da questo PC e i «sempre» dati per questa voce si revocano. Non si può annullare.`)) return
    void window.gestore.quadernoPersonale.togli(v.id).then((ok) => setNota(ok ? { ok: true, testo: `«${v.nome}» tolta.` } : { ok: false, testo: 'Questa voce non c’è più.' }))
  }
  const mostra = (id: string): void => setVisti((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const usi = s === undefined ? [] : tuttiGliUsi ? s.usi : s.usi.slice(0, 15)
  return (
    <section className="impostazioni__gruppo">
      <h4>Quaderno personale</h4>
      <div className="impostazioni__nota">
        I tuoi dati riservati che una chat a volte deve scrivere, per esempio in una pagina legale o in un modulo: l’email di contatto, la sede, la partita IVA. Non stanno nel codice, nei progetti o nel Drive: solo su questo PC, in un file cifrato (AES-256) la cui chiave è custodita dal portachiavi di Windows del tuo utente. Copiato su un altro computer, il file non si apre.
      </div>
      <div className="impostazioni__nota">
        <b>Come li usa una chat.</b> Nessuna chat li legge da sola. Una chat (o un autopilota) che ne ha bisogno usa lo strumento «chiedi_dato_personale» e dice quale voce vuole e perché. Nelle Domande, qui di lato, sul telefono e nella pagina, compare la richiesta con tre scelte: «Consenti una volta», «Sempre per questa chat» (vale per quella conversazione finché non lo revochi qui sotto), «No». Se non rispondi entro due minuti vale no, e la chat lo sa. Ogni richiesta, data o negata, resta nell’elenco degli usi.
      </div>
      {s === undefined ? <div className="impostazioni__nota">Leggo…</div> : !s.disponibile ? (
        <div className="impostazioni__nota" style={{ color: 'var(--ambra)' }}>{s.perche ?? 'Il quaderno personale non è disponibile su questo PC.'}</div>
      ) : (
        <>
          {s.voci.length === 0 ? (
            <div className="impostazioni__nota">Il quaderno è vuoto. Aggiungi qui sotto la prima voce: il nome è quello che la chat chiederà, quindi scegline uno chiaro («Email di contatto», «Sede legale», «Partita IVA»).</div>
          ) : s.voci.map((v) => (
            <div key={v.id} className="impostazioni__riga" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span title={v.nota}><b>{v.nome}</b>{v.nota !== undefined ? <span className="impostazioni__nota"> · {v.nota}</span> : null}</span>
              <code style={{ userSelect: visti.has(v.id) ? 'text' : 'none' }}>{visti.has(v.id) ? v.valore : valoreNascosto(v.valore)}</code>
              <button className="tasto" onClick={() => mostra(v.id)}>{visti.has(v.id) ? 'Nascondi' : 'Mostra'}</button>
              <button className="tasto" onClick={() => modifica(v)}>Modifica</button>
              <button className="tasto" onClick={() => togli(v)}>Togli</button>
            </div>
          ))}

          <div className="impostazioni__riga" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span>{bozza.id === undefined ? 'Nuova voce' : `Modifica «${s.voci.find((v) => v.id === bozza.id)?.nome ?? ''}»`}</span>
            <input className="campo" placeholder="nome, es. Email di contatto" value={bozza.nome} maxLength={80} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} style={{ width: 200 }} />
            <input className="campo" placeholder="valore" value={bozza.valore} maxLength={2000} onChange={(e) => setBozza({ ...bozza, valore: e.target.value })} style={{ width: 240 }} />
            <input className="campo" placeholder="nota facoltativa: a cosa serve" value={bozza.nota} maxLength={300} onChange={(e) => setBozza({ ...bozza, nota: e.target.value })} style={{ width: 220 }} />
            <button className="tasto" disabled={bozza.nome.trim() === '' || bozza.valore.trim() === ''} onClick={salva}>{bozza.id === undefined ? 'Aggiungi' : 'Salva'}</button>
            {bozza.id !== undefined ? <button className="tasto" onClick={() => setBozza(VUOTA)}>Annulla</button> : null}
          </div>

          <h5 style={{ margin: '12px 0 4px' }}>Consensi «sempre per questa chat»</h5>
          {s.consensi.length === 0 ? <div className="impostazioni__nota">Nessuno: ogni richiesta passa dalle Domande.</div> : s.consensi.map((k) => (
            <div key={`${k.sessione}:${k.voceId}`} className="impostazioni__riga">
              <span>«{k.chat}» può avere <b>{k.voce}</b> senza chiedere, dal {quando(k.dal)}</span>
              <button className="tasto" onClick={() => { void window.gestore.quadernoPersonale.revoca(k.sessione, k.voceId).then((ok) => setNota(ok ? { ok: true, testo: `Revocato: d’ora in poi «${k.chat}» deve chiedere «${k.voce}» ogni volta.` } : { ok: false, testo: 'Questo consenso non c’è più.' })) }}>Revoca</button>
            </div>
          ))}

          <h5 style={{ margin: '12px 0 4px' }}>Chi li ha chiesti</h5>
          {s.usi.length === 0 ? <div className="impostazioni__nota">Ancora nessuna richiesta.</div> : (
            <>
              {usi.map((u) => (
                <div key={u.id} className="impostazioni__nota">
                  {quando(u.quando)} · «{u.chat}» ha chiesto <b>{u.voce}</b> — {testoEsito(u.esito)}. Motivo: «{u.motivo}»
                </div>
              ))}
              {s.usi.length > 15 ? <button className="tasto" onClick={() => setTuttiGliUsi(!tuttiGliUsi)}>{tuttiGliUsi ? 'Mostra solo gli ultimi' : `Mostra tutti (${s.usi.length})`}</button> : null}
            </>
          )}
          <div className="impostazioni__nota">Si tengono le ultime 500 richieste. Il valore di una voce non compare mai in questo elenco.</div>
        </>
      )}
      {nota !== undefined ? <div className="riga__stato" style={{ color: nota.ok ? 'var(--verde)' : 'var(--ambra)' }}>{nota.testo}</div> : null}
    </section>
  )
}
