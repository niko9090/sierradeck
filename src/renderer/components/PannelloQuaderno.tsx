import { useEffect, useMemo, useRef, useState } from 'react'
import type { Scheda } from '@shared/quaderno'
import { assaggio, cartelleUniche, filtraSchede, nomeCartella, ordinaSchedeCome, quandoBreve, tuttiITag, type OrdineSchede } from '@shared/quaderno-vista'
import { SezioneQuadernoPersonale } from './SezioneQuadernoPersonale'
import { analizzaMarkdown, type NodoBlocco, type NodoInline } from '@shared/markdown'
import { Aiuto } from './Aiuto'

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
export function ResaMarkdown({ testo }: { testo: string }): React.JSX.Element {
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

/**
 * Il quaderno delle cartelle di lavoro, a tutta finestra (0.70.0).
 *
 * Tre colonne: a sinistra i progetti delle chat aperte con quante schede ha
 * ognuno, i tag del quaderno scelto e il quaderno personale; in mezzo l'elenco
 * con la ricerca e l'ordine; a destra la scheda, da leggere o modificare (si
 * salva da sola). Le azioni rare — apri la cartella, copia il percorso,
 * elimina — stanno in «Strumenti ▾». Il file resta Markdown in
 * `.sierradeck/quaderno`, così si apre con qualunque editor.
 */
export function PannelloQuaderno({ cwd, cartelle, onChiudi }: Props): React.JSX.Element {
  const [quale, setQuale] = useState(cwd)
  useEffect(() => setQuale(cwd), [cwd])
  const [schede, setSchede] = useState<Scheda[]>([])
  const [conti, setConti] = useState<Record<string, number>>({})
  const [aperta, setAperta] = useState<Scheda | undefined>(undefined)
  const [modalita, setModalita] = useState<'leggi' | 'modifica'>('leggi')
  const [titolo, setTitolo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [tag, setTag] = useState('')
  const [domanda, setDomanda] = useState('')
  const [tagScelto, setTagScelto] = useState<string | undefined>(undefined)
  const [ordine, setOrdine] = useState<OrdineSchede>('recenti')
  const [personale, setPersonale] = useState(false)
  const [menu, setMenu] = useState(false)
  const [stato, setStato] = useState<'fermo' | 'salvo' | 'salvato'>('fermo')
  const [conferma, setConferma] = useState(false)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)

  // Le cartelle delle chat aperte, una volta sola; quella davanti c'è sempre, anche senza chat.
  const progetti = useMemo(() => {
    const u = cartelleUniche(cartelle)
    return quale !== '' && !u.some((p) => p.cwd.toLowerCase() === quale.toLowerCase()) ? [{ cwd: quale, nome: nomeCartella(quale), chat: 0 }, ...u] : u
  }, [cartelle, quale])

  const ricarica = (): void => {
    if (quale === '') return
    window.gestore.quaderno
      .elenca(quale)
      .then((x) => { setSchede(x); setConti((c) => ({ ...c, [quale]: x.length })) })
      .catch((e: unknown) => setErrore(String(e)))
  }
  useEffect(ricarica, [quale])
  // Quante schede ha ogni progetto: si legge una volta all'apertura, poi si tiene aggiornato quello scelto.
  useEffect(() => {
    for (const p of progetti) {
      window.gestore.quaderno.elenca(p.cwd).then((x) => setConti((c) => ({ ...c, [p.cwd]: x.length }))).catch(() => undefined)
    }
  }, [progetti.map((p) => p.cwd).join('|')])
  // Cambiando quaderno si chiude la scheda aperta e si toglie il tag: erano di un'altra cartella.
  useEffect(() => { setAperta(undefined); setConferma(false); setTagScelto(undefined) }, [quale])

  const apri = (s: Scheda, come: 'leggi' | 'modifica' = 'leggi'): void => {
    setPersonale(false)
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
      .then(() => { setAperta(undefined); setConferma(false); setNota(`Scheda «${file}» eliminata.`); ricarica() })
      .catch((e: unknown) => setErrore(String(e)))
  }

  const copiaPercorso = (): void => {
    if (aperta === undefined) return
    const sep = quale.includes('\\') ? '\\' : '/'
    const percorso = [quale.replace(/[\\/]+$/, ''), '.sierradeck', 'quaderno', aperta.file].join(sep)
    void navigator.clipboard.writeText(percorso).then(() => setNota('Percorso copiato.')).catch(() => setNota(percorso))
  }

  const etichette = tuttiITag(schede)
  const visibili = ordinaSchedeCome(filtraSchede(schede, { domanda, ...(tagScelto !== undefined ? { tag: tagScelto } : {}) }), ordine)
  const ora = Date.now()
  // La colonna di destra non resta vuota: senza una scheda aperta si apre la prima dell'elenco.
  const prima = visibili[0]
  useEffect(() => { if (aperta === undefined && !personale && prima !== undefined) apri(prima) }, [aperta, personale, prima?.file])

  return (
    <div className="progetti quaderno-vista" role="dialog" aria-label="Quaderno">
      <div className="progetti__testa">
        <span className="progetti__titolo">Quaderno</span>
        <span className="progetti__quieto" title={quale}>{nomeCartella(quale)}</span>
        <input
          className="campo campo--mini progetti__cerca"
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          placeholder="Cerca fra le schede…"
          aria-label="cerca fra le schede"
          autoFocus
        />
        <div className="progetti__gruppi" role="group" aria-label="Ordine">
          <button className={`progetti__gruppo${ordine === 'recenti' ? ' progetti__gruppo--acceso' : ''}`} onClick={() => setOrdine('recenti')}>Recenti</button>
          <button className={`progetti__gruppo${ordine === 'titolo' ? ' progetti__gruppo--acceso' : ''}`} onClick={() => setOrdine('titolo')}>A–Z</button>
        </div>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini tasto--primario" onClick={nuova} disabled={quale === ''}>+ Scheda</button>
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini" aria-expanded={menu} onClick={() => setMenu(!menu)}>Strumenti ▾</button>
          {menu ? (
            <div className="progetti__menu" onMouseLeave={() => setMenu(false)}>
              <button className="progetti__voce" onClick={() => { setMenu(false); void window.gestore.quaderno.apri(quale) }}>Apri la cartella del quaderno</button>
              <button className="progetti__voce" disabled={aperta === undefined} onClick={() => { setMenu(false); copiaPercorso() }}>Copia il percorso della scheda</button>
              <button className="progetti__voce" disabled={aperta === undefined} onClick={() => { setMenu(false); setConferma(true) }}>Elimina la scheda…</button>
              <button className="progetti__voce" onClick={() => { setMenu(false); setPersonale(true) }}>🔒 Quaderno personale</button>
            </div>
          ) : null}
        </span>
        <Aiuto di="Quaderno">
          Le schede sono file Markdown in <code>.sierradeck/quaderno</code> dentro la cartella del progetto ({quale}); le
          scrivono le chat e gli autopiloti quando imparano qualcosa, e tu da «+ Scheda». Mentre scrivi, la scheda si
          salva da sola dopo un momento («salvo…» poi «salvato»). «Elimina la scheda» (in Strumenti) cancella il file dal
          disco, senza cestino. Il «🔒 Personale» a sinistra sono i tuoi dati riservati, cifrati su questo PC.
        </Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>

      {conferma && aperta !== undefined ? (
        <div className="progetti__striscia">
          <span>Eliminare «{aperta.titolo}»? Il file si cancella dal disco, senza cestino.</span>
          <button className="tasto tasto--mini tasto--pericolo" onClick={elimina}>Elimina</button>
          <button className="tasto tasto--mini" onClick={() => setConferma(false)}>Annulla</button>
        </div>
      ) : null}
      {errore !== undefined ? <div className="progetti__striscia">⚠ {errore}</div> : null}
      {nota !== undefined ? (
        <div className="progetti__striscia progetti__striscia--info" role="status">
          <span>{nota}</span><button className="tasto tasto--mini" onClick={() => setNota(undefined)}>OK</button>
        </div>
      ) : null}

      <div className="progetti__corpo quaderno-vista__corpo">
        <nav className="quaderno-vista__lato" aria-label="Progetti e tag">
          <div className="quaderno-vista__titsez">Progetti</div>
          {progetti.length === 0 ? <div className="progetti__quieto">Apri una chat: il quaderno è quello della sua cartella.</div> : null}
          {progetti.map((p) => (
            <button
              key={p.cwd}
              className={`quaderno-vista__voce${!personale && p.cwd === quale ? ' quaderno-vista__voce--scelta' : ''}`}
              title={p.cwd}
              onClick={() => { setPersonale(false); setQuale(p.cwd) }}
            >
              <span className="progetti__percorso">{p.nome}</span>
              <span className="progetti__conto">{conti[p.cwd] ?? '…'}</span>
            </button>
          ))}
          {etichette.length > 0 ? (
            <>
              <div className="quaderno-vista__titsez">Tag</div>
              <button className={`quaderno-vista__voce${tagScelto === undefined ? ' quaderno-vista__voce--scelta' : ''}`} onClick={() => setTagScelto(undefined)}>
                <span>Tutte</span><span className="progetti__conto">{schede.length}</span>
              </button>
              {etichette.map((t) => (
                <button key={t.tag} className={`quaderno-vista__voce${tagScelto === t.tag ? ' quaderno-vista__voce--scelta' : ''}`} onClick={() => setTagScelto(tagScelto === t.tag ? undefined : t.tag)}>
                  <span className="progetti__percorso">{t.tag}</span><span className="progetti__conto">{t.n}</span>
                </button>
              ))}
            </>
          ) : null}
          <div className="quaderno-vista__titsez">Tuo</div>
          <button className={`quaderno-vista__voce${personale ? ' quaderno-vista__voce--scelta' : ''}`} onClick={() => setPersonale(true)} title="I tuoi dati riservati, cifrati su questo PC">
            <span>🔒 Personale</span>
          </button>
        </nav>

        <div className="quaderno-vista__elenco">
          {visibili.length === 0 ? (
            <div className="progetti__vuoto">
              {schede.length === 0
                ? 'Ancora nessuna scheda. Ne nasce una quando una chat impara qualcosa, e puoi scriverne tu con «+ Scheda».'
                : 'Nessuna scheda per questa ricerca.'}
            </div>
          ) : (
            visibili.map((s) => (
              <button
                key={s.file}
                className={s.file === aperta?.file && !personale ? 'scheda-voce scheda-voce--attiva' : 'scheda-voce'}
                onClick={() => apri(s)}
              >
                <span className="scheda-voce__titolo">{s.titolo}</span>
                {assaggio(s.corpo) !== '' ? <span className="scheda-voce__assaggio">{assaggio(s.corpo)}</span> : null}
                <span className="scheda-voce__riga">
                  <span className="scheda-voce__data" title={s.quando}>{quandoBreve(s.quando, ora)}</span>
                  {s.tag.map((t) => <span key={t} className="tag">{t}</span>)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="quaderno-vista__scheda">
          {personale ? (
            <div className="quaderno-vista__personale"><SezioneQuadernoPersonale /></div>
          ) : aperta === undefined ? (
            <div className="progetti__vuoto">Scegli una scheda per leggerla, o creane una con «+ Scheda».</div>
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
                {stato === 'salvato' ? <span className="riga__stato" style={{ color: 'var(--verde)' }}>salvato</span> : null}
                <button
                  className={modalita === 'modifica' ? 'tasto tasto--primario' : 'tasto'}
                  onClick={() => {
                    if (modalita === 'modifica') salvaOra.current()
                    setModalita((m) => (m === 'leggi' ? 'modifica' : 'leggi'))
                  }}
                >
                  {modalita === 'leggi' ? 'Modifica' : 'Fatto'}
                </button>
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
                  <div className="scheda__tag">
                    <span className="progetti__quieto" title={aperta.quando}>{quandoBreve(aperta.quando, ora)}</span>
                    {aperta.tag.map((t) => <span key={t} className="tag">{t}</span>)}
                  </div>
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
