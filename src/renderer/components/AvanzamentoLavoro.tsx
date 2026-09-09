import type { LavoroInCorso } from '../../main/cassaforte/lavoro-in-corso'
import { descriviLavoro, durataBreve, passiDelLavoro, stimaResidua } from '../progresso-sync'

type Props = {
  lavoro: LavoroInCorso
  /** Adesso, per il tempo trascorso: lo passa chi disegna, cosi' si ridisegna ogni secondo. */
  adesso: number
  onAnnulla?: () => void
  /** Solo barra e riga: per la striscia in alto. */
  compatto?: boolean
  onDettagli?: () => void
}

/**
 * Lo stato generale di un lavoro con il Drive, tutto in una schermata.
 *
 * Nicholas (2026-09-09): «voglio vedere lo stato generale dell'operazione con
 * una barra di caricamento, tutto ben fatto e comprensibile». Prima c'era
 * una riga con fase e conteggio; qui c'e' il quadro: quanto e' fatto e quanto
 * manca, da quanto va e quanto resta, cosa sta facendo adesso e in che verso,
 * i passi dell'operazione con lo stato di ciascuno, i conti di cio' che e'
 * salito e sceso, e cosa succede alla fine.
 */
export function AvanzamentoLavoro({ lavoro, adesso, onAnnulla, compatto, onDettagli }: Props): React.JSX.Element {
  const d = descriviLavoro(lavoro)
  const avviatoMs = new Date(lavoro.avviato).getTime()
  const trascorso = Number.isNaN(avviatoMs) ? undefined : Math.max(0, adesso - avviatoMs)
  const residuo = trascorso === undefined ? undefined : stimaResidua(lavoro, trascorso)
  const perc = d.perc ?? 0
  const haTotale = lavoro.totale !== undefined && lavoro.totale > 0
  const mancano = haTotale ? Math.max(0, (lavoro.totale as number) - (lavoro.fatto ?? 0)) : undefined
  const passi = passiDelLavoro(lavoro)

  const adessoFa = ((): string => {
    if (lavoro.annullamento) return 'Mi fermo: finisco il file in corso e non ne comincio altri.'
    if (lavoro.fase === 'preparo') return 'Leggo l’indice del Drive e l’elenco dei file, e confronto con quello che c’è qui.'
    if (lavoro.dettaglio !== undefined) {
      const verso = lavoro.verso === 'su' ? '↑ porto sul Drive' : lavoro.verso === 'giu' ? '↓ porto qui' : '→'
      return `${verso} «${lavoro.dettaglio}»`
    }
    return d.testo
  })()

  if (compatto === true) {
    return (
      <>
        <span className="led led--lavoro" />
        <span>
          <b>{d.titolo}</b>
          {haTotale ? ` — ${lavoro.fatto ?? 0} di ${lavoro.totale} file (${perc}%)` : ` — ${d.testo}`}
          {residuo !== undefined && residuo > 0 ? <span style={{ opacity: 0.7 }}> · circa {durataBreve(residuo)} ancora</span> : null}
          {lavoro.annullamento ? <span style={{ opacity: 0.7 }}> · mi fermo…</span> : null}
        </span>
        <span className="barra-agg">
          <span className="barra-agg__pieno" style={{ width: `${perc}%` }} />
        </span>
        <span style={{ flex: 1 }} />
        {onDettagli !== undefined ? <button className="tasto" onClick={onDettagli} title="Il quadro completo dell’operazione">Dettagli</button> : null}
        {onAnnulla !== undefined ? (
          <button className="tasto" disabled={lavoro.annullamento} onClick={onAnnulla} title="Si ferma fra un file e l’altro: quello fatto resta fatto">
            {lavoro.annullamento ? 'Mi fermo…' : 'Annulla'}
          </button>
        ) : null}
      </>
    )
  }

  return (
    <div className="avanzamento">
      <div className="avanzamento__testa">
        <span className="led led--lavoro" />
        <strong className="avanzamento__titolo">{d.titolo}</strong>
        <span className="avanzamento__tempo">
          {trascorso !== undefined ? `in corso da ${durataBreve(trascorso)}` : ''}
          {residuo !== undefined && residuo > 0 ? ` · ne mancano circa ${durataBreve(residuo)}` : ''}
        </span>
      </div>

      <div className="avanzamento__barra" role="progressbar" aria-valuenow={perc} aria-valuemin={0} aria-valuemax={100}>
        <span className="avanzamento__pieno" style={{ width: `${perc}%` }} />
        <span className="avanzamento__perc">{haTotale ? `${perc}%` : '…'}</span>
      </div>
      <div className="avanzamento__conti">
        {haTotale
          ? <>Fatti <strong>{lavoro.fatto ?? 0}</strong> file su <strong>{lavoro.totale}</strong>{mancano !== undefined ? <> · ne mancano <strong>{mancano}</strong></> : null}</>
          : <>Sto preparando: il conto dei file arriva fra un attimo.</>}
        {lavoro.caricati !== undefined || lavoro.scaricati !== undefined || lavoro.saltati !== undefined ? (
          <> · saliti sul Drive <strong>{lavoro.caricati ?? 0}</strong> · scesi qui <strong>{lavoro.scaricati ?? 0}</strong>{(lavoro.saltati ?? 0) > 0 ? <> · saltati <strong>{lavoro.saltati}</strong></> : null}</>
        ) : null}
      </div>

      <div className="avanzamento__adesso">
        <span className="serigrafia">adesso</span> {adessoFa}
      </div>

      <ol className="avanzamento__passi">
        {passi.map((p) => (
          <li key={p.nome} className={`avanzamento__passo avanzamento__passo--${p.stato}`}>
            <span className="avanzamento__segno">{p.stato === 'fatto' ? '✓' : p.stato === 'corso' ? '▶' : '○'}</span>
            <span>
              <span className="avanzamento__passo-nome">{p.nome}</span>
              <span className="avanzamento__passo-sotto">{p.spiegazione}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="account__nota" style={{ fontSize: 12, margin: '8px 0 0' }}>
        Puoi chiudere questa finestra: il lavoro continua lo stesso e lo ritrovi nella striscia in alto. «Annulla» si ferma fra un file e l’altro, mai a metà di uno: quello già fatto resta fatto e l’indice del Drive resta coerente; il resto lo rifai al prossimo giro con le stesse scelte.
      </p>
      {onAnnulla !== undefined ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="tasto" disabled={lavoro.annullamento} onClick={onAnnulla}>
            {lavoro.annullamento ? 'Mi fermo…' : 'Annulla'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
