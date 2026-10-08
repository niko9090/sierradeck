import { useCallback, useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { leggiDiff, type GruppoChat } from '@shared/file-autopilota'
import { ModaleAlTelefono } from './ModaleAlTelefono'

/** Ogni quanto si rilegge mentre la linguetta è aperta: git in sola lettura, leggero. */
const OGNI_MS = 4000

const PAROLA: Record<string, string> = { nuovo: 'nuovo', modificato: 'modificato', cancellato: 'cancellato', rinominato: 'rinominato' }

/**
 * La linguetta «File» della scheda dell'autopilota (0.38.0).
 *
 * Nicholas (01/10): serve a controllare i file che l'autopilota cambia. Per
 * ogni cartella in cui lavora — la cartella del progetto e i worktree delle sue
 * chat — l'elenco dei file cambiati con lo stato, le righe aggiunte e tolte, e
 * se sono gia' salvati in un commit sul ramo della chat o ancora da salvare.
 * Toccando un file si vede il diff, in sola lettura.
 */
export function FileAutopilota({ autopilota }: { autopilota: Autopilota }): React.JSX.Element {
  const [gruppi, setGruppi] = useState<GruppoChat[] | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [scelto, setScelto] = useState<{ chiave: string; percorso: string } | undefined>(undefined)
  const [diff, setDiff] = useState<string | undefined>(undefined)
  /** «📱 Manda al telefono» (0.54.0) del file scelto. */
  const [alTel, setAlTel] = useState(false)

  const leggi = useCallback((): void => {
    window.gestore.autopilota.file(autopilota.id)
      .then((g) => { setGruppi(g); setErrore(undefined) })
      .catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
  }, [autopilota.id])
  useEffect(() => {
    leggi()
    const h = setInterval(leggi, OGNI_MS)
    return () => clearInterval(h)
  }, [leggi])

  useEffect(() => {
    if (scelto === undefined) { setDiff(undefined); return }
    let vivo = true
    setDiff(undefined)
    window.gestore.autopilota.diff(autopilota.id, scelto.chiave, scelto.percorso)
      .then((d) => { if (vivo) setDiff(d) })
      .catch((e: unknown) => { if (vivo) setDiff(`⚠ ${e instanceof Error ? e.message : String(e)}`) })
    return () => { vivo = false }
  }, [autopilota.id, scelto?.chiave, scelto?.percorso])

  const righe = diff !== undefined && !diff.startsWith('⚠') ? leggiDiff(diff) : undefined

  return (
    <div className="file-ap">
      <p className="misura file-ap__cosa">
        I file che questo autopilota ha cambiato, per ogni cartella in cui lavora: la cartella del progetto e, se divide il lavoro, il worktree di ogni sua chat.
        Accanto a ogni file: com’è cambiato, le righe aggiunte (+) e tolte (−), e se è già salvato in un commit sul ramo della chat o ancora da salvare.
        Si rilegge da solo ogni {OGNI_MS / 1000} secondi mentre questa linguetta è aperta. Toccando un file vedi le righe tolte e aggiunte.
        Qui si guarda soltanto: non si salva, non si annulla e non si cambia niente. Un file scelto si può mandare al telefono con «📱 Manda al telefono»: arriva quando l’app si collega.
      </p>
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      {gruppi === undefined ? <p className="diario__vuoto">Leggo i file da git…</p> : null}
      {gruppi?.map((g) => (
        <section key={g.chiave} className="file-ap__gruppo">
          <div className="file-ap__testa">
            <b>{g.nome}</b>
            {g.ramo !== undefined ? <span className="misura"> · ramo {g.ramo}</span> : null}
          </div>
          <div className="misura file-ap__base">Confronto {g.base}. Cartella: {g.cartella}</div>
          {g.errore !== undefined ? <p className="misura">⚠ {g.errore}</p> : null}
          {g.errore === undefined && g.file.length === 0 ? <p className="misura">Nessun file cambiato.</p> : null}
          <ul className="file-ap__elenco">
            {g.file.map((f) => (
              <li key={f.percorso}>
                <button
                  className={`file-ap__file${scelto?.chiave === g.chiave && scelto.percorso === f.percorso ? ' file-ap__file--scelto' : ''}`}
                  onClick={() => setScelto(scelto?.percorso === f.percorso && scelto.chiave === g.chiave ? undefined : { chiave: g.chiave, percorso: f.percorso })}
                  title={f.vecchio !== undefined ? `prima si chiamava ${f.vecchio}` : f.percorso}
                >
                  <span className={`file-ap__stato file-ap__stato--${f.stato}`}>{PAROLA[f.stato]}</span>
                  <span className="file-ap__nome">{f.percorso}</span>
                  <span className="file-ap__righe">
                    {f.binario === true ? 'binario' : <><span className="file-ap__piu">+{f.piu}</span> <span className="file-ap__meno">−{f.meno}</span></>}
                  </span>
                  <span className={`file-ap__salvato${f.salvato ? '' : ' file-ap__salvato--no'}`}>{f.salvato ? 'in commit' : 'da salvare'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {scelto !== undefined ? (
        <section className="file-ap__diff" aria-label={`Differenze di ${scelto.percorso}`}>
          <div className="file-ap__testa">
            <b>{scelto.percorso}</b>
            <span style={{ flex: 1 }} />
            {gruppi?.find((g) => g.chiave === scelto.chiave)?.file.find((f) => f.percorso === scelto.percorso)?.stato !== 'cancellato' ? (
              <button className="tasto tasto--mini" onClick={() => setAlTel(true)} title="Manda questo file al telefono">📱 Manda al telefono</button>
            ) : null}
            <button className="tasto tasto--mini" onClick={() => setScelto(undefined)} aria-label="Chiudi il diff">×</button>
          </div>
          {diff === undefined ? <p className="misura">Leggo il diff…</p> : null}
          {diff !== undefined && diff.startsWith('⚠') ? <p className="misura">{diff}</p> : null}
          {righe !== undefined ? (
            <pre className="file-ap__codice">
              {righe.righe.map((r, i) => (
                <div key={i} className={`file-ap__riga file-ap__riga--${r.tipo}`}>
                  {r.tipo === 'piu' ? '+ ' : r.tipo === 'meno' ? '− ' : r.tipo === 'contesto' ? '  ' : ''}{r.testo}
                </div>
              ))}
              {righe.tagliato ? <div className="file-ap__riga file-ap__riga--testa">… diff troppo lungo: mostrate le prime righe</div> : null}
            </pre>
          ) : null}
        </section>
      ) : null}
      {alTel && scelto !== undefined ? (
        <ModaleAlTelefono
          nome={scelto.percorso.split('/').pop() ?? scelto.percorso}
          manda={(telefono, nota) => window.gestore.alTelefono.mandaDaAutopilota(autopilota.id, scelto.chiave, scelto.percorso, telefono, nota)}
          onChiudi={() => setAlTel(false)}
        />
      ) : null}
    </div>
  )
}
