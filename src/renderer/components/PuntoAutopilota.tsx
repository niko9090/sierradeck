import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import type { SegniDalVivo } from '@shared/adesso'
import { AIUTO_PUNTO, altri, puntoDi } from '@shared/punto-autopilota'
import { Aiuto } from './Aiuto'

/**
 * **Il Punto** (0.84.3) in cima alla conversazione dell'autopilota: passo in
 * corso, ogni chat con il suo segnale, cosa è finito, cosa viene dopo, cosa
 * serve da te, i limiti del piano come informazione, la velocità dalla
 * richiesta alla versione (0.85.0). Le righe le calcola
 * `puntoDi`, la stessa della pagina e dell'app.
 */
const TINTA: Record<string, string> = {
  verde: 'var(--verde, #3fb950)',
  ambra: 'var(--ambra, #d29922)',
  rosso: 'var(--rosso, #dc5f5f)',
  blu: 'var(--blu, #4aa3ff)',
  quieto: 'var(--testo-quieto, #8b949e)'
}

/** Ogni quanto si rileggono domande e limiti: cambiano a ogni risposta di una chat. */
const RILETTURA_MS = 30_000

export function PuntoAutopilota({ autopilota: a, senzaChat = false }: {
  autopilota: Autopilota
  /** Nella Panoramica le chat stanno già nella sua sezione «Adesso»: qui non due volte. */
  senzaChat?: boolean
}): React.JSX.Element {
  const [ora, setOra] = useState(() => Date.now())
  const [domande, setDomande] = useState(0)
  const [limiti, setLimiti] = useState<{ cinqueOre?: number; settimana?: number } | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      setOra(Date.now())
      window.gestore.autopilota.domande()
        .then((d) => { if (vivo) setDomande(d.filter((x) => x.autopilotaId === a.id).length) })
        .catch(() => undefined)
      window.gestore.sessions.consumi()
        .then((c) => {
          if (!vivo) return
          const l = c.limiti
          setLimiti(l === undefined ? undefined : {
            ...(l.cinqueOre !== undefined ? { cinqueOre: l.cinqueOre.percento } : {}),
            ...(l.settimana !== undefined ? { settimana: l.settimana.percento } : {})
          })
        })
        .catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, RILETTURA_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [a.id])

  const p = puntoDi(a as Autopilota & SegniDalVivo, ora, { domandeAperte: domande, ...(limiti !== undefined ? { limiti } : {}) })
  const ind = p.indicatore
  return (
    <div className="punto-ap" aria-label="Il punto">
      <div className="punto-ap__indicatore" aria-label="A colpo d’occhio">
        <div className="punto-ap__riga">{ind.versione}</div>
        <div className="punto-ap__riga">{ind.fine.testo}</div>
        <div className="punto-ap__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ind.fine.percento} aria-label="Criteri soddisfatti">
          <span style={{ width: `${ind.fine.percento}%` }} />
        </div>
        <div className="punto-ap__riga con-aiuto" style={{ color: TINTA[ind.andamento.colore] }}>
          <b>{ind.andamento.simbolo}</b> {ind.andamento.testo}
          <Aiuto di="l’indicatore">
            {ind.aiuto}
            {ind.dettaglio.length > 0 ? <><br /><br /><b>Chat per chat:</b>{ind.dettaglio.map((r, i) => <span key={i}><br />{r}</span>)}</> : null}
          </Aiuto>
        </div>
        {(ind.promesse ?? []).map((r, i) => <div key={i} className="punto-ap__riga punto-ap__promessa">{r}</div>)}
      </div>
      <div className="punto-ap__testa">
        <span className="serigrafia con-aiuto">Punto<Aiuto di="il Punto">{AIUTO_PUNTO}</Aiuto></span>
        <span className="punto-ap__passo">{p.passo}</span>
      </div>
      {p.richieste.length > 0 ? (
        <div className="punto-ap__richieste" aria-label="Le tue richieste">
          <div className="punto-ap__riga"><b>Le tue richieste:</b></div>
          {p.richieste.map((r) => (
            <div key={r.id} className="punto-ap__chat">
              <span className="punto-ap__compito">{r.giorno} · {r.titolo}</span>
              <span className="punto-ap__testo" style={{ color: TINTA[r.colore] }}> — {r.parola}</span>
            </div>
          ))}
          {altri(p.richiesteTotale, p.richieste.length) !== '' ? <div className="punto-ap__riga">{altri(p.richiesteTotale, p.richieste.length)}</div> : null}
        </div>
      ) : null}
      {!senzaChat && p.chat.map((r) => (
        <div key={r.id} className={`punto-ap__chat punto-ap__chat--${r.tono}`}>
          <b style={{ color: TINTA[r.colore] }}>{r.chi}</b>
          <span className="punto-ap__compito" title={r.compito}>{r.compito}</span>
          <span className="punto-ap__testo" style={{ color: r.tono === 'lavoro' ? undefined : TINTA[r.colore] }}>{r.testo}</span>
          {r.segnale !== undefined ? (
            <span className="punto-ap__segnale" style={{ color: TINTA[r.segnale.colore] }} title="L’ultimo segnale della chat all’autopilota">
              {r.segnale.simbolo} {r.segnale.parola}
            </span>
          ) : null}
        </div>
      ))}
      {!senzaChat && p.finite > 0 ? <div className="punto-ap__riga">{p.finite === 1 ? '1 chat finita' : `${p.finite} chat finite`}</div> : null}
      {p.fatto.length > 0 ? <div className="punto-ap__riga"><b>Finito:</b> {p.fatto.join(' · ')} {altri(p.fattoTotale, p.fatto.length)}</div> : null}
      {p.dopo.length > 0 ? <div className="punto-ap__riga"><b>Dopo:</b> {p.dopo.join(' · ')} {altri(p.dopoTotale, p.dopo.length)}</div> : null}
      <div className="punto-ap__riga" style={p.daTe.length > 0 ? { color: TINTA.ambra } : undefined}>
        <b>Da te:</b> {p.daTe.length > 0 ? p.daTe.join(' ') : 'niente, va avanti da solo.'}
      </div>
      {p.limiti !== undefined ? <div className="punto-ap__riga punto-ap__limiti">{p.limiti}</div> : null}
      {p.velocita !== undefined ? (
        <div className="punto-ap__riga punto-ap__velocita con-aiuto">
          <b>Velocità:</b> {p.velocita.testo}<Aiuto di="la velocità">{p.velocita.aiuto}</Aiuto>
        </div>
      ) : null}
    </div>
  )
}
