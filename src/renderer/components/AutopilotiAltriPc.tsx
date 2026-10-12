import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { descriviAutopilota, ledDi } from '@shared/autopilota-vista'
import type { Battuta } from '@shared/chat-autopilota'
import type { DomandaScheda } from '@shared/domande-autopilota'
import { giraSu, type AutopilotiDiPc } from '@shared/autopiloti-altri'
import { Aiuto } from './Aiuto'

/**
 * **Gli autopiloti degli altri PC** (0.59.0, la richiesta più importante di
 * Nicholas): nel pannello «Autopiloti», sotto quelli di qui, ci sono quelli
 * che girano sugli altri PC della stessa chiave di casa, ognuno con «gira su
 * <PC>». La scheda mostra stato, criteri, ultime mosse, domande in attesa e
 * dialogo. Ogni azione va al PC dove gira, con le sue rotte di sempre: se quel
 * PC non risponde, il perché con le strade provate.
 */
const OGNI_MS = 15_000

type Dettaglio = Autopilota & { chat?: Battuta[]; domandeScheda?: DomandaScheda[]; domandaId?: string }

export function AutopilotiAltriPc(): React.JSX.Element | null {
  const [pc, setPc] = useState<AutopilotiDiPc[] | undefined>(undefined)
  const [aperto, setAperto] = useState<{ pcId: string; nomePc: string; id: string } | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    const leggi = (): void => { void window.gestore.autopilotiAltri.elenco().then((p) => { if (vivo) setPc(p) }).catch(() => undefined) }
    leggi()
    const t = setInterval(leggi, OGNI_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  if (pc === undefined) return <div className="misura" style={{ marginTop: 12 }}>Chiedo agli altri PC i loro autopiloti…</div>
  if (pc.length === 0) return null
  return (
    <div className="autopiloti-altri">
      <div className="con-aiuto" style={{ marginTop: 14, marginBottom: 6 }}>
        <span className="serigrafia">Su altri PC</span>
        <Aiuto di="Su altri PC">
        Gli autopiloti che girano sugli altri PC della tua stessa chiave di casa. Lavorano là, con i file di là: da qui li guardi e li governi (scrivergli, rispondere alle domande, fermarli, farli riprendere) e ogni azione va al PC dove girano. L’elenco si aggiorna da solo ogni 15 secondi.
        </Aiuto>
      </div>
      {pc.map((p) => (
        <div key={p.pcId}>
          {p.errore !== undefined ? <div className="avviso">⚠ {p.errore}</div> : null}
          {p.errore === undefined && p.autopiloti.length === 0 ? <div className="misura">{p.nome}: nessun autopilota.</div> : null}
          {p.autopiloti.map((a) => {
            const d = descriviAutopilota(a as unknown as Autopilota)
            const led = ledDi(a as unknown as Autopilota)
            return (
              <div key={`${p.pcId}-${a.id}`} className="riga">
                <span className={`led ${led.classe}`} title={led.titolo} />
                <span className="riga__nome">{d.titolo}</span>
                <span className="riga__stato">{d.sottotitolo} · <strong>{giraSu(p.nome)}</strong></span>
                <button className="tasto" onClick={() => setAperto({ pcId: p.pcId, nomePc: p.nome, id: a.id })}>Apri la scheda</button>
              </div>
            )
          })}
        </div>
      ))}
      {aperto !== undefined ? <SchedaAutopilotaRemoto {...aperto} onChiudi={() => setAperto(undefined)} /> : null}
    </div>
  )
}

function SchedaAutopilotaRemoto({ pcId, nomePc, id, onChiudi }: { pcId: string; nomePc: string; id: string; onChiudi: () => void }): React.JSX.Element {
  const [a, setA] = useState<Dettaglio | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const [testo, setTesto] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const azione = (percorso: string, corpo: Record<string, unknown>) => window.gestore.autopilotiAltri.azione(pcId, percorso, corpo)
  const leggi = (): void => {
    void azione('/api/autopilota', { autopilota: id }).then((r) => {
      if (r.ok) { setA(r.dati as Dettaglio); setErrore(undefined) } else setErrore(r.messaggio)
    })
  }
  useEffect(() => {
    leggi()
    const t = setInterval(leggi, 4000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcId, id])
  const esegui = (percorso: string, corpo: Record<string, unknown>, fatto: string): void => {
    if (inCorso) return
    setInCorso(true)
    setEsito(undefined)
    void azione(percorso, corpo).then((r) => {
      setEsito(r.ok ? fatto : `Non riuscito: ${r.messaggio}`)
      if (r.ok) leggi()
    }).finally(() => setInCorso(false))
  }
  const d = a === undefined ? undefined : descriviAutopilota(a)
  const chat = (a?.chat ?? []).slice(-12)
  const domande = a?.domandeScheda ?? []
  return (
    <div className="scheda-remota-sfondo" onClick={onChiudi}>
      <div className="scheda-remota" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Scheda dell’autopilota su un altro PC">
        <div className="scheda-remota__testa">
          <strong>{d?.titolo ?? 'Autopilota'}</strong> <span className="misura">· {giraSu(nomePc)}</span>
          <Aiuto di="autopilota su un altro PC">Questo autopilota lavora su {nomePc}, con i file di là. Quello che vedi arriva da {nomePc} ogni quattro secondi; quello che fai qui (scrivergli, rispondere, fermarlo, farlo riprendere) lo esegue {nomePc}.</Aiuto>
          <button className="tasto" style={{ marginLeft: 'auto' }} onClick={onChiudi}>Chiudi</button>
        </div>
        {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
        {a === undefined && errore === undefined ? <div className="misura">Leggo la scheda da {nomePc}…</div> : null}
        {a !== undefined && d !== undefined ? (
          <>
            <div className="riga"><span className={`led ${ledDi(a).classe}`} /> <span>{d.sottotitolo}</span> <span className="misura">{d.avanzamento}</span></div>
            <div className="serigrafia">Obiettivo</div>
            <p style={{ margin: '2px 0 8px' }}>{a.obiettivo}</p>
            <div className="serigrafia">Criteri di fine</div>
            {(a.criteri ?? []).length === 0 ? <div className="misura">Non ancora scritti: se li ricava lui.</div> : (
              <ul className="scheda-remota__criteri">
                {a.criteri.map((c, i) => <li key={i}>{c.soddisfatto ? '✓' : '○'} {c.descrizione}</li>)}
              </ul>
            )}
            {domande.length > 0 ? (
              <>
                <div className="serigrafia">Domande in attesa</div>
                {domande.map((q) => (
                  <div key={q.chiave} className="scheda-remota__domanda">
                    <div>{q.testo}</div>
                    <div className="remoto__azioni">
                      {q.opzioni.map((o) => (
                        <button key={o} className="tasto" disabled={inCorso} onClick={() => {
                          if (q.tipo === 'via') esegui('/api/autopilota/vai', { autopilota: id }, `Via dato: ${nomePc} lo fa partire.`)
                          else if (q.idDomanda !== undefined) esegui('/api/rispondi', { domanda: q.idDomanda, risposta: o }, `Risposta «${o}» mandata a ${nomePc}.`)
                        }}>{o}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : null}
            <div className="serigrafia">Ultime mosse e dialogo</div>
            <div className="scheda-remota__chat">
              {chat.length === 0 ? <div className="misura">Ancora niente.</div> : chat.map((b, i) => (
                <div key={i} className={`scheda-remota__battuta scheda-remota__battuta--${b.da}`}>
                  <span className="misura">{b.da === 'tu' ? 'tu' : b.da === 'lui' ? 'lui' : 'nota'} · {b.quando.slice(11, 16)}</span> {b.testo}{b.dettaglio !== undefined ? <span className="misura"> — {b.dettaglio}</span> : null}
                </div>
              ))}
            </div>
            <textarea className="campo" rows={3} value={testo} placeholder={`Scrivi all’autopilota: lo riceve su ${nomePc}. Puoi cambiargli obiettivo e vincoli, rispondere a una domanda con parole tue, chiedergli com’è messo.`} onChange={(e) => setTesto(e.target.value)} />
            <div className="remoto__azioni">
              <button className="tasto tasto--primario" disabled={inCorso || testo.trim() === ''} onClick={() => { const t = testo.trim(); setTesto(''); esegui(domande.find((q) => q.tipo === 'domanda' && q.idDomanda !== undefined) !== undefined && a.domandaId !== undefined ? '/api/rispondi' : '/api/autopilota/dialogo', a.domandaId !== undefined ? { domanda: a.domandaId, risposta: t } : { autopilota: id, testo: t }, `Messaggio mandato all’autopilota su ${nomePc}.`) }}>Manda</button>
              {a.stato === 'lavoro' || a.stato === 'attesa' || a.stato === 'intervista' ? (
                <button className="tasto" disabled={inCorso} onClick={() => esegui('/api/autopilota/ferma', { autopilota: id }, `Fermato su ${nomePc}: finisce il passo che sta facendo e si ferma.`)}>Ferma</button>
              ) : (
                <button className="tasto" disabled={inCorso} onClick={() => esegui('/api/autopilota/riprendi', { autopilota: id }, `Ripreso su ${nomePc}.`)}>Riprendi</button>
              )}
            </div>
            {esito !== undefined ? <div className="remoto__esito">{esito}</div> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
