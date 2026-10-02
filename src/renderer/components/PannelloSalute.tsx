import { useCallback, useEffect, useState } from 'react'
import type { AzioneSalute, Salute, VoceSalute } from '@shared/salute'

/**
 * «Salute del sistema» (0.44.0): com'è messo SierraDeck, in un posto solo.
 *
 * Il Drive (collegato o no, perché, da quando), gli altri PC (ultimo
 * battito, la strada con cui si raggiungono, la versione), l'aggiornamento
 * non riuscito, gli errori delle ultime ore dal registro, le istruzioni degli
 * autopiloti non partite. Ogni voce spiega cosa guarda e cosa fare, e ha il
 * tasto che lo fa quando si può. Le regole stanno in `src/shared/salute.ts`
 * (uguali per il telefono).
 */

type Props = {
  onChiudi: () => void
  onApriDrive: () => void
  onInstalla: () => void
  onApriAutopiloti: () => void
}

const GRUPPI: { id: VoceSalute['gruppo']; nome: string }[] = [
  { id: 'drive', nome: 'Drive' },
  { id: 'pc', nome: 'Gli altri PC' },
  { id: 'aggiornamento', nome: 'Aggiornamento' },
  { id: 'errori', nome: 'Errori delle ultime ore' },
  { id: 'consegne', nome: 'Istruzioni degli autopiloti non partite' }
]

export function PannelloSalute({ onChiudi, onApriDrive, onInstalla, onApriAutopiloti }: Props): React.JSX.Element {
  const [salute, setSalute] = useState<Salute | undefined>(undefined)
  const [leggo, setLeggo] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const leggi = useCallback((): void => {
    setLeggo(true)
    window.gestore.salute.leggi().then((s) => { setSalute(s); setErrore(undefined) })
      .catch((e: unknown) => setErrore(String(e))).finally(() => setLeggo(false))
  }, [])
  useEffect(() => {
    leggi()
    const t = setInterval(leggi, 60_000)
    return () => clearInterval(t)
  }, [leggi])

  const esegui = (a: AzioneSalute): void => {
    switch (a.id) {
      case 'apri-drive': onApriDrive(); break
      case 'apri-registro': void window.gestore.log.apri(); break
      case 'installa': onInstalla(); break
      case 'scarica-a-mano': void window.gestore.sistema.apriEsterno(a.url); break
      case 'apri-autopilota': onApriAutopiloti(); break
      case 'riprova-pc': leggi(); break
    }
  }

  return (
    <div className="pannello pannello--largo">
      <div className="pannello__testa">
        <span className="serigrafia">Salute del sistema</span>
        {salute !== undefined ? <span className={`salute__tono salute__tono--${salute.tono}`}>{salute.riassunto}</span> : null}
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={leggo}>{leggo ? 'Guardo…' : 'Aggiorna'}</button>
        <button className="tasto tasto--mini" onClick={onChiudi}>Chiudi</button>
      </div>
      <p className="account__nota">
        Com’è messo SierraDeck su questo PC, in un posto solo: il Drive (collegato o no, perché e da quando), gli altri PC (quando si sono fatti vivi l’ultima volta, con quale strada si raggiungono adesso, che versione hanno), un aggiornamento che non si è installato, gli errori delle ultime ore scritti nel registro, le istruzioni degli autopiloti che non sono partite. Ogni voce dice cosa vuol dire e cosa fare; dove si può, il tasto lo fa. Si rilegge da solo ogni minuto; «Aggiorna» bussa di nuovo agli altri PC adesso.
      </p>
      {errore !== undefined ? <div className="avviso">⚠ Non riesco a leggere lo stato: {errore}</div> : null}
      {salute === undefined && errore === undefined ? <p className="account__nota">Guardo il Drive, busso agli altri PC e leggo il registro…</p> : null}
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {GRUPPI.map((g) => {
          const voci = (salute?.voci ?? []).filter((v) => v.gruppo === g.id)
          if (voci.length === 0) return null
          return (
            <section key={g.id} className="salute__gruppo">
              <div className="serigrafia">{g.nome}</div>
              {voci.map((v) => (
                <div key={v.chiave} className={`salute__voce salute__voce--${v.tono}`}>
                  <div className="salute__titolo"><span className={`led ${v.tono === 'ok' ? 'led--lavoro' : v.tono === 'attenzione' ? 'led--attesa' : 'led--fermo'}`} /> {v.titolo}</div>
                  <div className="salute__testo">{v.spiegazione}</div>
                  {v.cosaFare !== undefined ? <div className="salute__testo"><b>Cosa fare:</b> {v.cosaFare}</div> : null}
                  {v.azioni.length > 0 ? (
                    <div className="salute__azioni">
                      {v.azioni.map((a) => <button key={a.id + a.testo} className="tasto tasto--mini" onClick={() => esegui(a)}>{a.testo}</button>)}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
