import { useEffect, useMemo, useRef, useState } from 'react'
import { cerca, type Scheda } from '@shared/quaderno'
import { analizzaMarkdown, type NodoBlocco, type NodoInline } from '@shared/markdown'

type Props = {
  /** La cartella di lavoro proposta all'apertura: quella del riquadro davanti. */
  cwd: string
  /** Le chat aperte, per poter guardare il quaderno di un'altra senza chiuderla. */
  cartelle: { cwd: string; titolo: string }[]
  onChiudi: () => void
}

/** Il testo in riga, reso in elementi React: mai HTML, così non c'è niente da iniettare. */
function ResaInline({ nodi }: { nodi: NodoInline[] }): React.JSX.Element {
  return (
    <>
      {nodi.map((n, i) => {
        if (n.tipo === 'testo') return <span key={i}>{n.testo}</span>
        if (n.tipo === 'codice') return <code key={i} className="md__codice">{n.testo}</code>
        if (n.tipo === 'forte') return <strong key={i}><ResaInline nodi={n.figli} /></strong>
        if (n.tipo === 'enfasi') return <em key={i}><ResaInline nodi={n.figli} /></em>
        // Il link si apre nel browser di sistema, non dentro l'app: un href
        // seguito qui dentro porterebbe via la finestra dal programma.
        return (
          <a
            key={i}
            href={n.url}
            className="md__link"
            onClick={(e) => { e.preventDefault(); void window.gestore.sistema.apriEsterno(n.url) }}
          >
            {n.testo}
          </a>
        )
      })}
    </>
  )
}

/** I blocchi di una scheda, resi in elementi React. */
function ResaMarkdown({ testo }: { testo: string }): React.JSX.Element {
  // Analizzare a ogni battito sarebbe sprecato: il corpo cambia solo quando cambia.
  const blocchi = useMemo(() => analizzaMarkdown(testo), [testo])
  if (blocchi.length === 0) {
    return <p className="riga__stato">Scheda vuota. Passa a «Modifica» per scriverla.</p>
  }
  return (
    <div className="md">
      {blocchi.map((b, i) => <Blocco key={i} nodo={b} />)}
    </div>
  )
}

function Blocco({ nodo }: { nodo: NodoBlocco }): React.JSX.Element {
  switch (nodo.tipo) {
    case 'titolo': {
      const props = { className: `md__titolo md__titolo--${nodo.livello}` }
      const figli = <ResaInline nodi={nodo.figli} />
      if (nodo.livello <= 1) return <h1 {...props}>{figli}</h1>
      if (nodo.livello === 2) return <h2 {...props}>{figli}</h2>
      if (nodo.livello === 3) return <h3 {...props}>{figli}</h3>
      if (nodo.livello === 4) return <h4 {...props}>{figli}</h4>
      if (nodo.livello === 5) return <h5 {...props}>{figli}</h5>
      return <h6 {...props}>{figli}</h6>
    }
    case 'paragrafo':
      return <p className="md__paragrafo"><ResaInline nodi={nodo.figli} /></p>
    case 'codice':
      return <pre className="md__blocco"><code>{nodo.testo}</code></pre>
    case 'citazione':
      return (
        <blockquote className="md__citazione">
          {nodo.figli.map((b, i) => <Blocco key={i} nodo={b} />)}
        </blockquote>
      )
    case 'elenco':
      return nodo.ordinato ? (
        <ol className="md__elenco">
          {nodo.voci.map((v, i) => <li key={i}><ResaInline nodi={v} /></li>)}
        </ol>
      ) : (
        <ul className="md__elenco">
          {nodo.voci.map((v, i) => <li key={i}><ResaInline nodi={v} /></li>)}
        </ul>
      )
    case 'riga':
      return <hr className="md__riga" />
  }
}

/** Da «uno, due» all'elenco di tag, senza vuoti né doppioni. */
function leggiTag(grezzo: string): string[] {
  const visti = new Set<string>()
  const tag: string[] = []
  for (const t of grezzo.split(',').map((x) => x.trim()).filter((x) => x !== '')) {
    if (!visti.has(t)) { visti.add(t); tag.push(t) }
  }
  return tag
}

function tagUguali(grezzo: string, tag: string[]): boolean {
  const a = leggiTag(grezzo)
  return a.length === tag.length && a.every((t, i) => t === tag[i])
}

/** La prima riga con del testo del corpo: un assaggio nell'elenco, per riconoscerla a colpo d'occhio. */
function assaggio(corpo: string): string {
  for (const riga of corpo.split('\n')) {
    const pulita = riga.replace(/^#+\s*/, '').replace(/[*_`>-]/g, '').trim()
    if (pulita !== '') return pulita.slice(0, 90)
  }
  return ''
}

/**
 * Il quaderno della cartella che hai davanti.
 *
 * Una scheda per argomento, la più recente in cima. Si legge con il Markdown
 * reso — titoli, elenchi, codice — e si modifica con un interruttore, titolo e
 * tag compresi; si salva da sola mentre scrivi. Il file resta Markdown in
 * `.sierradeck/quaderno`, così se domani preferisci un altro editor le tue
 * schede sono già lì e si aprono lo stesso.
 */
export function PannelloQuaderno({ cwd, cartelle, onChiudi }: Props): React.JSX.Element {
  const [quale, setQuale] = useState(cwd)
  useEffect(() => setQuale(cwd), [cwd])
  const [schede, setSchede] = useState<Scheda[]>([])
  const [aperta, setAperta] = useState<Scheda | undefined>(undefined)
  const [modalita, setModalita] = useState<'leggi' | 'modifica'>('leggi')
  const [titolo, setTitolo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [tag, setTag] = useState('')
  const [domanda, setDomanda] = useState('')
  const [stato, setStato] = useState<'fermo' | 'salvo' | 'salvato'>('fermo')
  const [conferma, setConferma] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)

  const ricarica = (): void => {
    window.gestore.quaderno
      .elenca(quale)
      .then(setSchede)
      .catch((e: unknown) => setErrore(String(e)))
  }
  useEffect(ricarica, [quale])
  // Cambiando quaderno si chiude la scheda aperta: era di un'altra cartella.
  useEffect(() => { setAperta(undefined); setConferma(false) }, [quale])

  const apri = (s: Scheda, come: 'leggi' | 'modifica' = 'leggi'): void => {
    setAperta(s)
    setTitolo(s.titolo)
    setCorpo(s.corpo)
    setTag(s.tag.join(', '))
    setModalita(come)
    setStato('fermo')
    setConferma(false)
    setErrore(undefined)
  }

  // Il riferimento serve all'autosalvataggio, che nasce dentro un timeout e
  // altrimenti leggerebbe i valori del primo render.
  const salvaOra = useRef<() => void>(() => {})
  salvaOra.current = (): void => {
    if (aperta === undefined) return
    const t = titolo.trim() === '' ? aperta.titolo : titolo.trim()
    setStato('salvo')
    window.gestore.quaderno
      .scrivi(quale, { titolo: t, corpo, tag: leggiTag(tag), file: aperta.file })
      .then((salvata) => { setAperta(salvata); setStato('salvato'); ricarica() })
      .catch((e: unknown) => { setErrore(String(e)); setStato('fermo') })
  }

  // Si salva da sola, poco dopo l'ultima modifica: come una nota vera, senza il
  // tasto da ricordarsi di premere e senza perdere ciò che si è scritto.
  useEffect(() => {
    if (aperta === undefined || modalita !== 'modifica') return
    const invariato =
      (titolo.trim() === aperta.titolo || (titolo.trim() === '' )) &&
      corpo === aperta.corpo &&
      tagUguali(tag, aperta.tag)
    if (invariato) return
    const orologio = setTimeout(() => salvaOra.current(), 700)
    return () => clearTimeout(orologio)
  }, [titolo, corpo, tag, aperta, modalita])

  const nuova = (): void => {
    const titoloNuovo = `Nota del ${new Date().toLocaleDateString('it-IT')}`
    window.gestore.quaderno
      .scrivi(quale, { titolo: titoloNuovo, corpo: '' })
      .then((s) => { ricarica(); apri(s, 'modifica') })
      .catch((e: unknown) => setErrore(String(e)))
  }

  const elimina = (): void => {
    if (aperta === undefined) return
    const file = aperta.file
    window.gestore.quaderno
      .elimina(quale, file)
      .then(() => { setAperta(undefined); setConferma(false); ricarica() })
      .catch((e: unknown) => setErrore(String(e)))
  }

  const visibili = cerca(schede, domanda)

  return (
    <div className="pannello pannello--quaderno">
      <div className="pannello__testa">
        <strong>Quaderno</strong>
        {cartelle.length > 0 ? (
          <select
            className="quaderno__cerca"
            value={quale}
            onChange={(e) => setQuale(e.target.value)}
            title="Di quale chat guardare il quaderno"
          >
            {cartelle.map((c, i) => (
              <option key={`${c.cwd}-${i}`} value={c.cwd}>{c.titolo}</option>
            ))}
          </select>
        ) : (
          <span className="misura" title={quale}>{quale}</span>
        )}
        <input
          className="quaderno__cerca"
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          placeholder="cerca fra le schede"
          aria-label="cerca fra le schede"
        />
        <span className="sezione--vuota" style={{ flex: 1 }} />
        <button className="tasto" onClick={nuova}>+ Scheda</button>
        <button className="tasto" onClick={() => void window.gestore.quaderno.apri(quale)}>
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
                className={s.file === aperta?.file ? 'scheda-voce scheda-voce--attiva' : 'scheda-voce'}
                onClick={() => apri(s)}
              >
                <span className="scheda-voce__titolo">{s.titolo}</span>
                {assaggio(s.corpo) !== '' ? (
                  <span className="scheda-voce__assaggio">{assaggio(s.corpo)}</span>
                ) : null}
                <span className="scheda-voce__riga">
                  <span className="scheda-voce__data">{s.quando.slice(0, 10)}</span>
                  {s.tag.map((t) => <span key={t} className="tag">{t}</span>)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="quaderno__scheda">
          {aperta === undefined ? (
            <div className="riga__stato">Scegli una scheda per leggerla, o creane una nuova.</div>
          ) : (
            <>
              <div className="scheda__testa">
                {modalita === 'modifica' ? (
                  <input
                    className="scheda__titolo-modifica"
                    value={titolo}
                    onChange={(e) => setTitolo(e.target.value)}
                    placeholder="titolo della scheda"
                    aria-label="titolo della scheda"
                  />
                ) : (
                  <h2 className="scheda__titolo">{aperta.titolo}</h2>
                )}
                <span className="sezione--vuota" style={{ flex: 1 }} />
                {stato === 'salvo' ? <span className="riga__stato">salvo…</span> : null}
                {stato === 'salvato' ? <span className="riga__stato">salvato</span> : null}
                <button
                  className={modalita === 'modifica' ? 'tasto tasto--primario' : 'tasto'}
                  onClick={() => {
                    if (modalita === 'modifica') salvaOra.current()
                    setModalita((m) => (m === 'leggi' ? 'modifica' : 'leggi'))
                  }}
                >
                  {modalita === 'leggi' ? 'Modifica' : 'Fatto'}
                </button>
                {conferma ? (
                  <button className="tasto tasto--pericolo" onClick={elimina}>Sicuro? Elimina</button>
                ) : (
                  <button className="tasto" onClick={() => setConferma(true)}>Elimina</button>
                )}
              </div>

              {modalita === 'modifica' ? (
                <>
                  <input
                    className="scheda__tag-modifica"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="tag separati da virgola"
                    aria-label="tag della scheda"
                  />
                  <textarea
                    className="quaderno__corpo"
                    value={corpo}
                    onChange={(e) => setCorpo(e.target.value)}
                    placeholder="Scrivi in Markdown: # titoli, **grassetto**, - elenchi, `codice`…"
                    aria-label={`contenuto di ${aperta.titolo}`}
                  />
                </>
              ) : (
                <div className="scheda__lettura">
                  {aperta.tag.length > 0 ? (
                    <div className="scheda__tag">
                      {aperta.tag.map((t) => <span key={t} className="tag">{t}</span>)}
                    </div>
                  ) : null}
                  <ResaMarkdown testo={aperta.corpo} />
                </div>
              )}
              <div className="quaderno__tasti">
                <span className="misura">{aperta.file}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
