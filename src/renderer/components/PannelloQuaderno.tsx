import { useEffect, useState } from 'react'
import { cerca, type Scheda } from '@shared/quaderno'

type Props = {
  /** La cartella di lavoro di cui si guarda il quaderno. */
  cwd: string
  onChiudi: () => void
}

/**
 * Il quaderno della cartella che hai davanti.
 *
 * Una scheda per argomento, la più recente in cima, e la si può modificare qui
 * dentro: sono appunti, e gli appunti si correggono mentre si lavora. Il file
 * resta Markdown in `.sierradeck/quaderno` — se domani preferisci un altro
 * editor, le tue schede sono già lì e si aprono lo stesso.
 */
export function PannelloQuaderno({ cwd, onChiudi }: Props): React.JSX.Element {
  const [schede, setSchede] = useState<Scheda[]>([])
  const [aperta, setAperta] = useState<Scheda | undefined>(undefined)
  const [domanda, setDomanda] = useState('')
  const [bozza, setBozza] = useState('')
  const [salvata, setSalvata] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)

  const ricarica = (): void => {
    window.gestore.quaderno
      .elenca(cwd)
      .then(setSchede)
      .catch((e: unknown) => setErrore(String(e)))
  }
  useEffect(ricarica, [cwd])

  const apri = (s: Scheda): void => {
    setAperta(s)
    setBozza(s.corpo)
    setSalvata(false)
  }

  const salva = (): void => {
    if (aperta === undefined) return
    window.gestore.quaderno
      .scrivi(cwd, { titolo: aperta.titolo, corpo: bozza, tag: aperta.tag, file: aperta.file })
      .then(() => { setSalvata(true); ricarica() })
      .catch((e: unknown) => setErrore(String(e)))
  }

  const nuova = (): void => {
    const titolo = `Nota del ${new Date().toLocaleDateString('it-IT')}`
    window.gestore.quaderno
      .scrivi(cwd, { titolo, corpo: '' })
      .then((s) => { ricarica(); apri(s) })
      .catch((e: unknown) => setErrore(String(e)))
  }

  const visibili = cerca(schede, domanda)

  return (
    <div className="pannello pannello--quaderno">
      <div className="pannello__testa">
        <strong>Quaderno</strong>
        <span className="misura" title={cwd}>{cwd}</span>
        <input
          className="quaderno__cerca"
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          placeholder="cerca fra le schede"
          aria-label="cerca fra le schede"
        />
        <span className="sezione--vuota" style={{ flex: 1 }} />
        <button className="tasto" onClick={nuova}>+ Scheda</button>
        <button className="tasto" onClick={() => void window.gestore.quaderno.apri(cwd)}>
          Apri cartella
        </button>
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      {errore !== undefined ? <div className="riga__stato">{errore}</div> : null}

      <div className="quaderno">
        <div className="quaderno__elenco">
          {visibili.length === 0 ? (
            <div className="riga__stato">
              {schede.length === 0
                ? 'Ancora nessuna scheda. Ne nasce una ogni volta che un autopilota finisce, e puoi scriverne tu.'
                : 'Nessuna scheda per questa ricerca.'}
            </div>
          ) : (
            visibili.map((s) => (
              <button
                key={s.file}
                className={s.file === aperta?.file ? 'riga riga--attiva' : 'riga'}
                onClick={() => apri(s)}
              >
                <span>{s.titolo}</span>
                <span className="riga__stato">
                  {s.quando.slice(0, 10)}{s.tag.length > 0 ? ` · ${s.tag.join(', ')}` : ''}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="quaderno__scheda">
          {aperta === undefined ? (
            <div className="riga__stato">Scegli una scheda per leggerla.</div>
          ) : (
            <>
              <textarea
                className="quaderno__corpo"
                value={bozza}
                onChange={(e) => { setBozza(e.target.value); setSalvata(false) }}
                aria-label={`contenuto di ${aperta.titolo}`}
              />
              <div className="quaderno__tasti">
                <span className="misura">{aperta.file}</span>
                {salvata ? <span className="riga__stato">salvata</span> : null}
                <button className="tasto tasto--primario" onClick={salva} disabled={bozza === aperta.corpo}>
                  Salva
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
