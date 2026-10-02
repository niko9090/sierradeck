import { useEffect } from 'react'
import { analizzaRiga, type Blocco, type NotaResa, type Pezzo } from '@shared/note-aggiornamento'

/**
 * Un pezzo di testo con il suo stile. Mai HTML: React scrive testo, e un link
 * esiste solo se `linkAmmesso` l'ha lasciato passare (https://github.com/…).
 * Si apre nel browser, non dentro il programma.
 */
function PezzoVisto({ p }: { p: Pezzo }): React.JSX.Element {
  let dentro: React.ReactNode = p.testo
  if (p.codice === true) dentro = <code style={{ fontSize: '0.92em', padding: '0 3px', borderRadius: 3, background: 'rgba(127,127,127,0.18)' }}>{dentro}</code>
  if (p.corsivo === true) dentro = <em>{dentro}</em>
  if (p.grassetto === true) dentro = <strong>{dentro}</strong>
  if (p.link !== undefined) {
    const url = p.link
    return (
      <a
        href={url}
        title={url}
        onClick={(e) => { e.preventDefault(); void window.gestore.sistema.apriEsterno(url) }}
        style={{ color: 'var(--accento, #4aa3ff)' }}
      >
        {dentro}
      </a>
    )
  }
  return <>{dentro}</>
}

function Pezzi({ pezzi }: { pezzi: Pezzo[] }): React.JSX.Element {
  return <>{pezzi.map((p, i) => <PezzoVisto key={i} p={p} />)}</>
}

function BloccoVisto({ b }: { b: Blocco }): React.JSX.Element {
  if (b.tipo === 'titolo') return <div style={{ fontWeight: 600, fontSize: 13.5, margin: '8px 0 4px' }}><Pezzi pezzi={b.pezzi} /></div>
  if (b.tipo === 'paragrafo') return <p style={{ margin: '4px 0 8px', fontSize: 13, lineHeight: 1.55 }}><Pezzi pezzi={b.pezzi} /></p>
  if (b.tipo === 'codice') return <pre style={{ margin: '4px 0 8px', fontSize: 12, whiteSpace: 'pre-wrap', opacity: 0.85 }}>{b.testo}</pre>
  return (
    <ul style={{ margin: '2px 0 8px', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {b.voci.map((v, i) => (
        <li key={i} style={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 8, fontSize: 13, lineHeight: 1.55 }}>
          <span aria-hidden style={{ marginTop: 8, width: 6, height: 6, borderRadius: 3, background: 'var(--accento, #4aa3ff)' }} />
          <span><Pezzi pezzi={v} /></span>
        </li>
      ))}
    </ul>
  )
}

/** Una versione: l'intestazione e le sue note, per esteso. */
function Versione({ n, etichetta }: { n: NotaResa; etichetta: string }): React.JSX.Element {
  return (
    <section style={{ marginBottom: 14 }}>
      <div className="serigrafia" style={{ marginBottom: 6 }}>{etichetta}</div>
      {n.blocchi.map((b, i) => <BloccoVisto key={i} b={b} />)}
    </section>
  )
}

type Props = {
  titolo: string
  /** La riga piccola accanto al titolo: quali versioni, quante. */
  sotto?: string
  /** `undefined` mentre si leggono. */
  note: NotaResa[] | undefined
  /** Come chiamare ogni versione: «La 0.39.0 (questa)», «Saltata: 0.38.2»… */
  etichetta: (n: NotaResa, i: number) => string
  /** Detto per esteso sopra le note, quando qualcosa manca. */
  avviso?: string
  /** Una spiegazione sotto le note, sopra i tasti. */
  spiegazione?: React.ReactNode
  /** I tasti in fondo a destra. */
  tasti: React.ReactNode
  onChiudi: () => void
}

/**
 * La finestra delle note (0.39.0): una sola, per due usi.
 *
 * - Da «Installa» nella striscia dell'aggiornamento: cosa cambia con la
 *   versione nuova e con quelle saltate, prima di decidere.
 * - Da «Novità» nel menu: cosa c'e' nella versione installata.
 *
 * All'avvio non si apre piu' da sola (Nicholas: «eliminiamo la finestra di
 * change log all'apertura che è fastidiosa»).
 */
export function ModaleNote({ titolo, sotto, note, etichetta, avviso, spiegazione, tasti, onChiudi }: Props): React.JSX.Element {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialogo__testa" style={{ alignItems: 'baseline', gap: 10 }}>
          <span className="led led--lavoro" />
          <span className="serigrafia">{titolo}</span>
          {sotto !== undefined ? <span style={{ fontSize: 12, opacity: 0.65 }}>{sotto}</span> : null}
        </div>

        <div style={{ overflowY: 'auto', paddingRight: 6, margin: '4px 0 8px' }}>
          {note === undefined ? <p style={{ fontSize: 13, opacity: 0.75 }}>Leggo le note dalle versioni pubblicate…</p> : null}
          {avviso !== undefined ? (
            <p style={{ fontSize: 13, lineHeight: 1.55, margin: '4px 0 12px' }}>
              {/* Anche l'avviso passa dalla stessa strada: la pagina delle versioni ci si apre. */}
              <b><Pezzi pezzi={analizzaRiga(avviso)} /></b>
            </p>
          ) : null}
          {(note ?? []).map((n, i) => <Versione key={n.versione} n={n} etichetta={etichetta(n, i)} />)}
        </div>

        {spiegazione !== undefined ? <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.8, marginBottom: 10 }}>{spiegazione}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button
            className="account__link"
            onClick={() => { void window.gestore.sistema.apriEsterno('https://github.com/niko9090/sierradeck/releases') }}
            title="La pagina di tutte le versioni su GitHub, con le note e gli installer"
          >
            Tutte le versioni ▸
          </button>
          <div style={{ display: 'flex', gap: 8 }}>{tasti}</div>
        </div>
      </div>
    </div>
  )
}
