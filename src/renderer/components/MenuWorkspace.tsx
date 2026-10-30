import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { contaChatPerWorkspace } from '../menu-workspace'
import { azioniDiFinestra } from '../azioni-finestra'
import type { StatoWorkspace } from '../../main/ipc'
import { azioniMenuWorkspace, gruppiMenuWorkspace, postoTendina, vociInFila, type PostoTendina, type VoceAzioneWs, type VoceMenuWs } from '@shared/menu-workspace'
import { confermaEliminaWorkspace, controllaNomeWorkspace, NOME_WORKSPACE_MAX } from '@shared/azioni-telefono'
import { ModaleConferma } from './ModaleConferma'

type Props = {
  nomi: string[]
  attivo: string
  chiamano?: ReadonlySet<string> | undefined
  /** Aperto o chiuso lo decide chi lo monta: così anche una scorciatoia lo apre. */
  aperto: boolean
  onAperto: (aperto: boolean) => void
  onCambia: (nome: string) => void
  /** «Crea, rinomina o elimina…»: apre il pannello dei workspace. */
  onGestisci: () => void
  /** Dopo un'azione dal «⋯» (rinomina, elimina): lo stato nuovo dei workspace. */
  onStato?: (s: StatoWorkspace) => void
  /** «Apri cartella» dal «⋯»: la cartella del progetto di quel workspace. */
  onApriCartella?: (nome: string) => void
}

/** La larghezza voluta della tendina e del «⋯»: si stringono se la finestra è più stretta. */
const LARGHEZZA = 440
const LARGHEZZA_AZIONI = 240

/**
 * Il menu a tendina dei workspace, per quando sono tanti (0.82.0 rifatto).
 *
 * Il tasto mostra il nome **intero** di dove sei e quanti workspace ci sono.
 * La tendina: in cima la ricerca per nome, sotto l'elenco intero in gruppi —
 * «Recenti», «Questo PC», e uno per ogni altro PC — con quante chat ha
 * ciascuno e il pallino di chi aspetta una risposta. Il clic su una riga ci
 * va; le altre azioni (rinomina, Apri cartella, Sposta, Elimina; per gli altri
 * PC Apri e Porta qui) stanno dietro «⋯». Le regole sono in
 * `@shared/menu-workspace`, le stesse della pagina e dell'app.
 *
 * La ricerca è una casella **sopra** l'elenco, che resta sempre in vista
 * (Nicholas, 16/09: «mi fa vedere solo il cerca e non mi serve, voglio
 * l'elenco»).
 *
 * Sta sempre dentro la finestra: posizione e altezza massima da `postoTendina`,
 * ricalcolate a ogni apertura e se la finestra cambia; dentro, l'elenco scorre.
 * È in un portale attaccato al `body`: la fascia dei workspace scorre in
 * orizzontale e taglierebbe tutto quello che le esce dal rettangolo.
 */
export function MenuWorkspace({ nomi, attivo, chiamano, aperto, onAperto, onCambia, onGestisci, onStato, onApriCartella }: Props): React.JSX.Element {
  const [filtro, setFiltro] = useState('')
  const [evidenziato, setEvidenziato] = useState(0)
  const [conti, setConti] = useState<Map<string, number>>(new Map())
  /** Quante chat di altri PC per workspace (0.39.3). */
  const [remote, setRemote] = useState<Record<string, number>>({})
  /** I workspace degli altri PC che qui non ci sono (0.65.1): un gruppo per PC. */
  const [altrove, setAltrove] = useState<{ pc: string; nome: string; workspace: string[] }[]>([])
  const [recenti, setRecenti] = useState<string[]>([])
  const [nomePc, setNomePc] = useState<string | undefined>(undefined)
  const [porto, setPorto] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [posto, setPosto] = useState<PostoTendina | undefined>(undefined)
  /** Il «⋯» aperto: di quale riga e dove. */
  const [azioniDi, setAzioniDi] = useState<{ voce: VoceMenuWs; posto: PostoTendina } | undefined>(undefined)
  const [rinomina, setRinomina] = useState<{ vecchio: string; testo: string } | undefined>(undefined)
  const [daEliminare, setDaEliminare] = useState<string | undefined>(undefined)
  /** «Sposta su un altro PC…»: la cartella del progetto ('' = da scegliere). */
  const tasto = useRef<HTMLButtonElement>(null)
  const cerca = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const menuAzioni = useRef<HTMLDivElement>(null)
  const azioni = useRef<ReturnType<typeof azioniDiFinestra> | undefined>(undefined)
  /** Il motivo di un'eliminazione rifiutata: il menu si riapre e lo mostra. */
  const erroreDaMostrare = useRef<string | undefined>(undefined)
  const quantiChiamano = nomi.filter((n) => chiamano?.has(n) === true && n !== attivo).length

  const gruppi = gruppiMenuWorkspace({ nomi, attivo, recenti, filtro, nomePc, altrove })
  const fila = vociInFila(gruppi)
  const chiudi = (): void => { setAzioniDi(undefined); setRinomina(undefined); onAperto(false) }
  const scegli = (v: VoceMenuWs): void => {
    if (!v.qui) { apriDaAltroPc(v); return }
    chiudi()
    if (v.nome !== attivo) onCambia(v.nome)
  }

  // Dove mettere la tendina: sotto il tasto (o sopra, se sotto non c'è
  // posto), mai fuori dalla finestra. Si ricalcola a ogni apertura e se la
  // finestra cambia; aprendo, il «⋯» di prima si chiude.
  useLayoutEffect(() => {
    if (!aperto) return
    const misura = (): void => {
      const r = tasto.current?.getBoundingClientRect()
      if (r === undefined) return
      setPosto(postoTendina({ ancora: r, finestra: { larghezza: window.innerWidth, altezza: window.innerHeight }, larghezza: LARGHEZZA }))
      setAzioniDi(undefined)
    }
    misura()
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [aperto])

  useEffect(() => {
    if (!aperto) return
    setFiltro('')
    setErrore(erroreDaMostrare.current)
    erroreDaMostrare.current = undefined
    // Invio subito dopo l'apertura resta dove sei, come prima.
    setEvidenziato(Math.max(0, vociInFila(gruppiMenuWorkspace({ nomi, attivo, recenti, filtro: '', nomePc, altrove })).findIndex((v) => v.qui && v.nome === attivo)))
    void window.gestore.workspace.dove().then((d) => setConti(contaChatPerWorkspace(d))).catch(() => undefined)
    void window.gestore.workspace.remote().then(setRemote).catch(() => undefined)
    void window.gestore.workspace.altriPc().then(setAltrove).catch(() => undefined)
    void window.gestore.workspace.recenti?.()?.then(setRecenti).catch(() => undefined)
    void window.gestore.posta?.identita?.()?.then((i) => setNomePc(i.nome)).catch(() => undefined)
    // La ricerca ha il fuoco: la tastiera arriva a lei e non al terminale sotto.
    setTimeout(() => cerca.current?.focus(), 0)
  }, [aperto])

  useEffect(() => {
    if (evidenziato >= fila.length) setEvidenziato(Math.max(0, fila.length - 1))
  }, [fila.length, evidenziato])

  useEffect(() => {
    if (!aperto) return
    const voce = lista.current?.querySelectorAll<HTMLElement>('.ws-menu__voce')[evidenziato]
    voce?.scrollIntoView?.({ block: 'nearest' })
  }, [aperto, evidenziato])

  // Il workspace che si rinominava è sparito (rinominato o eliminato altrove): la casella non vale più.
  useEffect(() => {
    if (rinomina !== undefined && !nomi.includes(rinomina.vecchio)) setRinomina(undefined)
  }, [nomi, rinomina])

  // Il «⋯» aperto ha il fuoco sulla prima voce attiva: la tastiera arriva lì.
  useEffect(() => {
    if (azioniDi !== undefined) menuAzioni.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [azioniDi])

  const apriAzioni = (v: VoceMenuWs, el: HTMLElement): void => {
    const quante = azioniMenuWorkspace(v, { attivo, quanti: nomi.length, cartella: onApriCartella !== undefined }).length
    setAzioniDi({
      voce: v,
      posto: postoTendina({ ancora: el.getBoundingClientRect(), finestra: { larghezza: window.innerWidth, altezza: window.innerHeight }, larghezza: LARGHEZZA_AZIONI, altezza: quante * 34 + 12, aDestra: true })
    })
  }

  const apriDaAltroPc = (v: VoceMenuWs): void => {
    if (v.pc === undefined) return
    setPorto(v.nome)
    setAzioniDi(undefined)
    void window.gestore.workspace.apriDaAltroPc(v.pc.id, v.nome)
      .then((r) => { if (r.ok) chiudi(); else setErrore(r.messaggio) })
      .catch((err: unknown) => setErrore(String(err)))
      .finally(() => setPorto(undefined))
  }

  const confermaRinomina = (): void => {
    if (rinomina === undefined) return
    const { vecchio, testo } = rinomina
    if (testo.trim() === vecchio) { setRinomina(undefined); cerca.current?.focus(); return }
    const c = controllaNomeWorkspace(testo, nomi.filter((n) => n !== vecchio))
    if (!c.ok) { setErrore(c.errore); return }
    setRinomina(undefined)
    cerca.current?.focus()
    void window.gestore.workspace.rinomina(vecchio, c.nome)
      .then((s) => { setErrore(undefined); onStato?.(s) })
      .catch((err: unknown) => setErrore(senzaPrefisso(err)))
  }

  const fai = (a: VoceAzioneWs, v: VoceMenuWs): void => {
    if (a.spenta !== undefined) return
    setAzioniDi(undefined)
    setErrore(undefined)
    cerca.current?.focus()
    switch (a.azione) {
      case 'apri': scegli(v); return
      case 'rinomina': setRinomina({ vecchio: v.nome, testo: v.nome }); return
      case 'cartella': chiudi(); onApriCartella?.(v.nome); return
      case 'sposta': return
      case 'elimina': chiudi(); setDaEliminare(v.nome); return
      // «Porta qui» (0.88.0): un progetto cambia PC solo con «Sposta su
      // questo PC», in Progetti, con i suoi controlli. Si apre lì.
      case 'portaQui':
        chiudi()
        window.dispatchEvent(new CustomEvent('sierradeck:pannello-drive'))
    }
  }

  // Nel «⋯»: frecce fra le voci, Esc torna all'elenco, Invio lo fa il pulsante.
  const suTastoAzioni = (e: React.KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); setAzioniDi(undefined); cerca.current?.focus(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const voci = [...(menuAzioni.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (voci.length === 0) return
    const qui = voci.indexOf(document.activeElement as HTMLButtonElement)
    voci[(qui + (e.key === 'ArrowDown' ? 1 : voci.length - 1)) % voci.length]?.focus()
  }

  const suTasto = (e: React.KeyboardEvent): void => {
    if (rinomina !== undefined) return
    if (e.key === 'Escape') { e.preventDefault(); if (azioniDi !== undefined) setAzioniDi(undefined); else chiudi(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAzioniDi(undefined); setEvidenziato((i) => (fila.length === 0 ? 0 : (i + 1) % fila.length)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAzioniDi(undefined); setEvidenziato((i) => (fila.length === 0 ? 0 : (i - 1 + fila.length) % fila.length)); return }
    if (e.key === 'Enter') {
      // Invio su un pulsante lo preme lui; dalla ricerca sceglie la riga evidenziata.
      if (e.target !== cerca.current) return
      e.preventDefault()
      const v = fila[evidenziato] ?? fila[0]
      if (v !== undefined) scegli(v)
      return
    }
    // Il tasto «menu» (o Maiusc+F10) apre il «⋯» della riga evidenziata.
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const v = fila[evidenziato]
      const el = lista.current?.querySelectorAll<HTMLElement>('.ws-menu__altro')[evidenziato]
      if (v !== undefined && el !== undefined) apriAzioni(v, el)
    }
  }

  let indice = -1
  const riga = (v: VoceMenuWs): React.JSX.Element => {
    indice += 1
    const i = indice
    const chiama = v.qui && chiamano?.has(v.nome) === true
    const quante = conti.get(v.nome)
    const chiave = v.qui ? v.nome : `${v.pc?.id ?? ''}:${v.nome}`
    const aperteLe = azioniDi !== undefined && azioniDi.voce.nome === v.nome && azioniDi.voce.qui === v.qui
    if (rinomina !== undefined && v.qui && rinomina.vecchio === v.nome) {
      return (
        <div key={chiave} className="ws-menu__voce ws-menu__voce--rinomina">
          <input
            autoFocus
            className="campo campo--compatto"
            aria-label={`Nome nuovo per «${v.nome}»`}
            value={rinomina.testo}
            maxLength={NOME_WORKSPACE_MAX}
            onChange={(e) => setRinomina({ vecchio: v.nome, testo: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); confermaRinomina() }
              else if (e.key === 'Escape') { e.preventDefault(); setRinomina(undefined); cerca.current?.focus() }
            }}
          />
          <button className="tasto tasto--mini tasto--primario" onClick={confermaRinomina}>Rinomina</button>
          <button className="tasto tasto--mini" onClick={() => { setRinomina(undefined); cerca.current?.focus() }}>Annulla</button>
        </div>
      )
    }
    return (
      <div
        key={chiave}
        id={`ws-menu-voce-${i}`}
        role="option"
        aria-selected={v.qui && v.nome === attivo}
        className={[
          'ws-menu__voce',
          v.qui && v.nome === attivo ? 'ws-menu__voce--attiva' : '',
          chiama ? 'ws-menu__voce--chiama' : '',
          !v.qui ? 'ws-menu__voce--altrove' : '',
          i === evidenziato ? 'ws-menu__voce--evidenziata' : ''
        ].filter((c) => c !== '').join(' ')}
        onMouseEnter={() => setEvidenziato(i)}
      >
        <button
          className="ws-menu__voce-va"
          tabIndex={-1}
          disabled={porto !== undefined}
          onClick={() => scegli(v)}
          title={!v.qui ? `Apre qui «${v.nome}»: le sue chat dal vivo su ${v.pc?.nome ?? 'l’altro PC'}` : chiama ? `In «${v.nome}» qualcuno aspetta una tua risposta` : v.nome === attivo ? `Sei in «${v.nome}»` : `Passa a «${v.nome}»`}
        >
          <span className="ws-menu__spunta" aria-hidden>{v.qui && v.nome === attivo ? '✓' : ''}</span>
          <span className="ws-menu__voce-nome">{v.nome}</span>
          {chiama ? <span className="ws__chiama" aria-label="richiede il tuo intervento">●</span> : null}
          {v.qui && (remote[v.nome] ?? 0) > 0 ? (
            <span className="segno-remoto" title={`In «${v.nome}» ${remote[v.nome]} chat lavorano su un altro PC: si guardano e si comandano a distanza`}>
              {remote[v.nome]} su altri PC
            </span>
          ) : null}
          <span className="ws-menu__conta">{porto === v.nome ? '…' : !v.qui ? '' : quante === undefined ? '' : quante === 1 ? '1 chat' : `${quante} chat`}</span>
        </button>
        <button
          className="ws-menu__altro"
          tabIndex={-1}
          aria-label={`Altre azioni per «${v.nome}»`}
          aria-haspopup="menu"
          aria-expanded={aperteLe}
          title={v.qui ? 'Altre azioni: rinomina, Apri cartella, Sposta, Elimina' : 'Altre azioni: Apri, Porta qui'}
          onClick={(e) => { e.stopPropagation(); if (aperteLe) setAzioniDi(undefined); else apriAzioni(v, e.currentTarget) }}
        >⋯</button>
      </div>
    )
  }

  const tendina = aperto && posto !== undefined ? (
    <>
      <div className="ws-menu__velo" onMouseDown={chiudi} />
      <div
        className="ws-menu__tendina"
        style={{ top: posto.top, left: posto.left, width: posto.larghezza, maxHeight: posto.altezzaMax }}
        onKeyDown={suTasto}
      >
        <input
          ref={cerca}
          className="campo campo--compatto ws-menu__ricerca"
          type="search"
          placeholder={`Cerca fra ${nomi.length} workspace`}
          aria-label="Cerca un workspace per nome"
          aria-controls="ws-menu-lista"
          aria-activedescendant={fila[evidenziato] !== undefined ? `ws-menu-voce-${evidenziato}` : undefined}
          value={filtro}
          onChange={(e) => { setFiltro(e.target.value); setEvidenziato(0); setAzioniDi(undefined) }}
        />
        <div ref={lista} id="ws-menu-lista" className="ws-menu__lista" role="listbox" aria-label="Workspace" onScroll={() => setAzioniDi(undefined)}>
          {fila.length === 0 ? <div className="ws-menu__vuoto">Nessun workspace con «{filtro}».</div> : null}
          {gruppi.map((g) => (
            <div key={g.chiave} className="ws-menu__gruppo" role="group" aria-label={g.titolo}>
              <div className="ws-menu__titolo">{g.titolo}</div>
              {g.voci.map(riga)}
            </div>
          ))}
        </div>
        {errore !== undefined ? <div className="ws-menu__vuoto" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}
        <div className="ws-menu__piede">
          <span className="ws-menu__aiuto">↑↓ e Invio · «⋯» per le azioni</span>
          <button className="tasto" tabIndex={-1} onClick={() => { chiudi(); onGestisci() }}>Crea, rinomina o elimina…</button>
        </div>
      </div>
      {azioniDi !== undefined ? (
        <div
          className="ws-menu__azioni"
          role="menu"
          aria-label={`Azioni per «${azioniDi.voce.nome}»`}
          ref={menuAzioni}
          style={{ top: azioniDi.posto.top, left: azioniDi.posto.left, width: azioniDi.posto.larghezza, maxHeight: azioniDi.posto.altezzaMax }}
          onKeyDown={suTastoAzioni}
        >
          {azioniMenuWorkspace(azioniDi.voce, { attivo, quanti: nomi.length, cartella: onApriCartella !== undefined }).map((a) => (
            <button
              key={a.azione}
              role="menuitem"
              className={`ws-menu__azione${a.pericolo === true ? ' ws-menu__azione--pericolo' : ''}`}
              disabled={a.spenta !== undefined || porto !== undefined}
              title={a.spenta ?? a.spiega}
              onClick={() => fai(a, azioniDi.voce)}
            >{a.etichetta}</button>
          ))}
        </div>
      ) : null}
    </>
  ) : null

  return (
    <div className="ws-menu">
      <button
        ref={tasto}
        className={`ws-menu__tasto${quantiChiamano > 0 ? ' ws-menu__tasto--chiama' : ''}`}
        onClick={() => (aperto ? chiudi() : onAperto(true))}
        aria-haspopup="listbox"
        aria-expanded={aperto}
        title={`Sei in «${attivo}». ${nomi.length} workspace: premi per vederli tutti`}
      >
        <span className="ws-menu__nome">{attivo}</span>
        <span className="ws-menu__quanti">{nomi.length}</span>
        {quantiChiamano > 0 ? <span className="ws__chiama" aria-label="in altri workspace qualcuno aspetta una tua risposta">●</span> : null}
        <span className="ws-menu__freccia" aria-hidden>▾</span>
      </button>
      {tendina !== null ? createPortal(tendina, document.body) : null}
      {daEliminare !== undefined ? (
        <ModaleConferma
          titolo={confermaEliminaWorkspace(daEliminare).titolo}
          testo={confermaEliminaWorkspace(daEliminare).testo}
          etichettaAzione={confermaEliminaWorkspace(daEliminare).azione}
          onConferma={() => {
            const nome = daEliminare
            setDaEliminare(undefined)
            azioni.current ??= azioniDiFinestra()
            void azioni.current.elimina(nome)
              .then((s) => onStato?.(s))
              // Il motivo resta in vista: si riapre il menu con la riga d'errore.
              .catch((err: unknown) => { erroreDaMostrare.current = senzaPrefisso(err); onAperto(true) })
          }}
          onAnnulla={() => setDaEliminare(undefined)}
        />
      ) : null}
    </div>
  )
}

/** Il motivo e basta, senza il prefisso dell'IPC (come il pannello dei workspace). */
function senzaPrefisso(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}
