import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { postoTendina, type PostoTendina } from '@shared/menu-workspace'
import { ALTRI_PC_CON_RICERCA, filtraAltriPc, riassuntoAltriPc, statoPcBreve, type GruppoAltroPc, type VoceAltroPc } from '@shared/workspace-remoti'
import { quantoFa } from '@shared/salute'
import { EVENTO_REMOTI } from '../workspace-remoti'
import { Aiuto } from './Aiuto'
import { apriMenuContestuale } from '../menu-contestuale'
import { vociAltroPc, vociWorkspaceRemoto } from '@shared/menu-contestuale'

const RILEGGI_MS = 30_000
const LARGHEZZA = 420
/** I PC aperti nella tendina, ricordati fra un avvio e l'altro. */
const CHIAVE_APERTI = 'sierradeck.altriPcAperti'

function leggiAperti(): Set<string> {
  try {
    const x = JSON.parse(localStorage.getItem(CHIAVE_APERTI) ?? '[]') as unknown
    return new Set(Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])
  } catch { return new Set() }
}

/**
 * **La sezione «Altri PC»** (13/11). Nicholas: «voglio che le sessioni remote
 * abbiano una sezione dedicata del programma, separata e ben visibile».
 *
 * Rifatta lo stesso giorno («non elencare gli Aiutanti, e sistemali in modo
 * che stiano bene anche quando sono tanti: così è caotico»): nella fascia un
 * tasto solo, «Altri PC · N», con quanti sono accesi e un punto se qualcosa
 * chiede di guardare. Si apre una tendina ordinata: prima gli accesi, poi gli
 * spenti, per nome; ogni PC con stato, versione e numero di workspace, e si
 * apre per vedere i suoi workspace (quelli aperti qui segnati). Con più di
 * sei PC c'è la casella per cercare. Frecce, Invio ed Esc funzionano; i PC
 * aperti si ricordano. Gli Aiutanti non hanno workspace: stanno in «Altri
 * computer» della Salute.
 */
export function SezioneAltriPc({ attivo, nomi, onCambia }: {
  /** Il workspace davanti in questa finestra. */
  attivo: string
  /** Tutti i nomi dell'archivio: quando cambiano si rilegge. */
  nomi: readonly string[]
  /** Passa a un workspace già aperto qui (come un clic sulla fascia). */
  onCambia: (nome: string) => void
}): React.JSX.Element | null {
  const [gruppi, setGruppi] = useState<GruppoAltroPc[]>([])
  const [aperta, setAperta] = useState(false)
  const [espansi, setEspansi] = useState<Set<string>>(leggiAperti)
  const [cerca, setCerca] = useState('')
  const [porto, setPorto] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [posto, setPosto] = useState<PostoTendina | undefined>(undefined)
  /** «Rileggi» dal tasto destro: cambia e si rilegge subito. */
  const [giro, setGiro] = useState(0)
  const tasto = useRef<HTMLButtonElement | null>(null)
  const lista = useRef<HTMLDivElement | null>(null)
  const casella = useRef<HTMLInputElement | null>(null)
  const chiave = nomi.join('\n')

  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      const p = window.gestore.workspace.sezioneAltriPc?.()
      if (p === undefined) return
      void p.then((g) => { if (vivo) setGruppi(g) }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, RILEGGI_MS)
    window.addEventListener(EVENTO_REMOTI, leggi)
    return () => { vivo = false; clearInterval(t); window.removeEventListener(EVENTO_REMOTI, leggi) }
  }, [chiave, aperta, giro])
  useEffect(() => {
    if (!aperta) return
    setErrore(undefined)
    const su = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      // Con qualcosa scritto nella casella, Esc prima la svuota.
      if (casella.current !== null && casella.current.value !== '' && document.activeElement === casella.current) { e.preventDefault(); setCerca(''); return }
      setAperta(false)
      setCerca('')
      tasto.current?.focus()
    }
    window.addEventListener('keydown', su, true)
    return () => window.removeEventListener('keydown', su, true)
  }, [aperta])
  useLayoutEffect(() => {
    if (!aperta) return
    const r = tasto.current?.getBoundingClientRect()
    if (r === undefined) return
    setPosto(postoTendina({ ancora: r, finestra: { larghezza: window.innerWidth, altezza: window.innerHeight }, larghezza: LARGHEZZA, aDestra: r.left + LARGHEZZA > window.innerWidth - 8 }))
  }, [aperta])
  // All'apertura il fuoco va nella casella (se c'è) o sul primo PC: si comincia dalla tastiera.
  useEffect(() => {
    if (!aperta || posto === undefined) return
    const el = casella.current ?? lista.current?.querySelector<HTMLElement>('[data-nav]')
    el?.focus()
  }, [aperta, posto === undefined])
  useEffect(() => {
    try { localStorage.setItem(CHIAVE_APERTI, JSON.stringify([...espansi])) } catch { /* resta così fino al riavvio */ }
  }, [espansi])
  const filtrati = useMemo(() => filtraAltriPc(gruppi, cerca), [gruppi, cerca])

  if (gruppi.length === 0) return null
  const r = riassuntoAltriPc(gruppi, attivo)
  const conRicerca = gruppi.length > ALTRI_PC_CON_RICERCA
  const fa = (iso: string): string => quantoFa(iso, Date.now())
  const chiudi = (): void => { setAperta(false); setCerca('') }
  const espanso = (pcId: string): boolean => espansi.has(pcId) || filtrati.trovatiDentro.has(pcId)
  const commuta = (pcId: string, si?: boolean): void => setEspansi((prima) => {
    const dopo = new Set(prima)
    const vuole = si ?? !dopo.has(pcId)
    if (vuole) dopo.add(pcId); else dopo.delete(pcId)
    return dopo
  })
  const apri = (g: GruppoAltroPc, nome: string, giaQui: boolean): void => {
    if (giaQui) { chiudi(); if (nome !== attivo) onCambia(nome); return }
    setPorto(nome)
    setErrore(undefined)
    void window.gestore.workspace.apriDaAltroPc(g.pcId, nome)
      .then((esito) => {
        if (!esito.ok) { setErrore(esito.messaggio); return }
        chiudi()
        window.dispatchEvent(new Event(EVENTO_REMOTI))
      })
      .catch((err: unknown) => setErrore(String(err)))
      .finally(() => setPorto(undefined))
  }
  /** Su e giù fra le righe (PC e workspace), destra apre un PC, sinistra lo chiude o torna al suo PC. */
  const tastiera = (e: React.KeyboardEvent): void => {
    const righe = [...(lista.current?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])]
    const qui = righe.indexOf(document.activeElement as HTMLElement)
    const vai = (i: number): void => { const el = righe[Math.max(0, Math.min(righe.length - 1, i))]; el?.focus(); el?.scrollIntoView({ block: 'nearest' }) }
    const el = righe[qui]
    const pc = el?.dataset.pc
    if (e.key === 'ArrowDown') { e.preventDefault(); vai(qui + 1) }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (qui <= 0 && casella.current !== null) casella.current.focus(); else vai(qui - 1)
    } else if (e.key === 'Home') { e.preventDefault(); vai(0) }
    else if (e.key === 'End') { e.preventDefault(); vai(righe.length - 1) }
    else if (e.key === 'ArrowRight' && pc !== undefined && el?.dataset.nav === 'pc') { e.preventDefault(); commuta(pc, true) }
    else if (e.key === 'ArrowLeft' && pc !== undefined) {
      e.preventDefault()
      if (el?.dataset.nav === 'pc') commuta(pc, false)
      else righe.find((x) => x.dataset.nav === 'pc' && x.dataset.pc === pc)?.focus()
    }
  }
  const accesi = filtrati.gruppi.filter((g) => g.vivo)
  const spenti = filtrati.gruppi.filter((g) => !g.vivo)

  const rigaWs = (g: GruppoAltroPc, v: VoceAltroPc): React.JSX.Element => {
    const davanti = v.aperto && v.nome === attivo
    const segno = v.sparito === true ? 'non c’è più là' : davanti ? 'davanti' : v.aperto ? 'aperto qui' : porto === v.nome ? '…' : 'Apri'
    return (
      <button key={v.nome} type="button" data-nav="ws" data-pc={g.pcId}
        className={`altri-pc__ws${v.aperto ? ' altri-pc__ws--aperto' : ''}${davanti ? ' altri-pc__ws--davanti' : ''}`}
        disabled={porto !== undefined || davanti}
        onClick={() => apri(g, v.nome, v.aperto)}
        onContextMenu={(e) => apriMenuContestuale(e, vociWorkspaceRemoto({ nome: v.nome, pc: g.nome, aperto: v.aperto, davanti, occupato: porto !== undefined }), {
          apri: () => apri(g, v.nome, v.aperto),
          // «Porta qui» (0.88.0): un progetto cambia PC solo da Progetti, con i suoi controlli.
          'porta-qui': () => { chiudi(); window.dispatchEvent(new CustomEvent('sierradeck:pannello-drive')) }
        })}
        title={v.aperto ? `Passa a «${v.nome}», con l’autopilota di ${g.nome}` : `Apre qui «${v.nome}» con l’autopilota di ${g.nome}. Su ${g.nome} non cambia niente.`}>
        <span className="altri-pc__ws-segno" aria-hidden="true">{v.aperto ? '●' : ''}</span>
        <span className="altri-pc__ws-nome">{v.nome}</span>
        <span className={`altri-pc__ws-azione${!v.aperto && v.sparito !== true ? ' altri-pc__ws-azione--apri' : ''}`}>{segno}</span>
      </button>
    )
  }
  const rigaPc = (g: GruppoAltroPc): React.JSX.Element => {
    const su = espanso(g.pcId)
    const aperti = g.voci.filter((v) => v.aperto).length
    return (
      <div key={g.pcId} className={`altri-pc__pc${su ? ' altri-pc__pc--su' : ''}${g.vivo ? '' : ' altri-pc__pc--spento'}`}>
        <button type="button" data-nav="pc" data-pc={g.pcId} className="altri-pc__riga" aria-expanded={su}
          onClick={() => commuta(g.pcId)}
          onContextMenu={(e) => apriMenuContestuale(e, vociAltroPc({ nome: g.nome, aperto: su }), {
            mostra: () => commuta(g.pcId),
            rileggi: () => setGiro((x) => x + 1)
          })}
          title={`${g.nome}: ${su ? 'chiudi' : 'mostra'} i suoi workspace`}>
          <span className="altri-pc__freccia" aria-hidden="true">{su ? '▾' : '▸'}</span>
          <span className={`led ${g.vivo ? 'led--lavoro' : 'led--finito'}`} aria-hidden="true" />
          <span className="altri-pc__nome">{g.nome}</span>
          <span className="altri-pc__stato">{statoPcBreve(g, fa)}</span>
          <span className="altri-pc__quanti" title={`${g.voci.length} workspace${aperti > 0 ? `, ${aperti} aperti qui` : ''}`}>
            {aperti > 0 ? <b>{aperti}/</b> : null}{g.voci.length}
          </span>
        </button>
        {su ? (
          <div className="altri-pc__dentro" role="group" aria-label={`Workspace su ${g.nome}`}>
            {g.voci.length === 0 ? <div className="altri-pc__vuoto">Nessun workspace.</div> : g.voci.map((v) => rigaWs(g, v))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="sezione altri-pc" aria-label="Altri PC">
      <button
        ref={tasto}
        type="button"
        className={`ws__voce altri-pc__tasto${r.davanti !== undefined ? ' ws__voce--attivo' : ''}`}
        aria-expanded={aperta}
        aria-haspopup="dialog"
        onClick={() => (aperta ? chiudi() : setAperta(true))}
        title={[`${r.totale} altri PC, ${r.accesi} accesi`, r.davanti !== undefined ? `davanti: «${r.davanti.nome}» su ${r.davanti.pc}` : '', r.attenzione ?? ''].filter((x) => x !== '').join('\n')}
      >
        <span className="altri-pc__titolo">Altri PC</span>
        <span className="altri-pc__accesi" aria-label={`${r.accesi} accesi su ${r.totale}`}>
          <span className={`led ${r.accesi > 0 ? 'led--lavoro' : 'led--finito'}`} aria-hidden="true" />{r.accesi}<span className="altri-pc__su">/{r.totale}</span>
        </span>
        {r.davanti !== undefined ? <span className="altri-pc__davanti">{r.davanti.nome}</span> : null}
        {r.attenzione !== undefined ? <span className="altri-pc__attenzione" aria-label="da guardare" /> : null}
        <span className="altri-pc__giu" aria-hidden="true">▾</span>
      </button>
      {aperta && posto !== undefined ? createPortal(
        <>
          <div className="ws-menu__velo" onMouseDown={chiudi} />
          <div className="ws-menu__tendina altri-pc__tendina" role="dialog" aria-label="Altri PC"
            style={{ top: posto.top, left: posto.left, width: posto.larghezza, maxHeight: posto.altezzaMax }}>
            <div className="altri-pc__testa">
              <b>Altri PC</b>
              <span className="altri-pc__conta">{r.accesi} accesi su {r.totale}</span>
              <Aiuto di="la sezione Altri PC">I workspace che vivono sugli altri PC. Si aprono qui come là: con il loro autopilota, che lavora su quel PC. Le chat si guardano e non si scrivono: si parla con l’autopilota. Quelli già aperti qui hanno il punto. I workspace di questo PC stanno nella fascia «Workspace»; gli Aiutanti, che non hanno workspace, in Salute → «Altri computer». Frecce per muoversi, → e ← per aprire e chiudere un PC, Esc per chiudere.</Aiuto>
            </div>
            {r.attenzione !== undefined ? <div className="altri-pc__avviso">{r.attenzione}</div> : null}
            {conRicerca ? (
              <input ref={casella} className="campo campo--compatto ws-menu__ricerca altri-pc__cerca" type="search" placeholder="Cerca un PC o un workspace" value={cerca}
                aria-label="Cerca un PC o un workspace"
                onChange={(e) => setCerca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); lista.current?.querySelector<HTMLElement>('[data-nav]')?.focus() }
                }} />
            ) : null}
            <div ref={lista} className="ws-menu__lista altri-pc__lista" onKeyDown={tastiera}>
              {filtrati.gruppi.length === 0 ? <div className="altri-pc__vuoto">Nessun PC o workspace con «{cerca}».</div> : null}
              {[{ titolo: 'Accesi', g: accesi }, { titolo: 'Spenti', g: spenti }].map((b) => b.g.length === 0 ? null : (
                <Fragment key={b.titolo}>
                  <div className="ws-menu__titolo altri-pc__gruppo">{b.titolo} · {b.g.length}</div>
                  {b.g.map(rigaPc)}
                </Fragment>
              ))}
            </div>
            {errore !== undefined ? <div className="altri-pc__avviso">{errore}</div> : null}
          </div>
        </>, document.body) : null}
    </div>
  )
}
