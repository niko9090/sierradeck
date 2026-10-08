import { useEffect, useMemo, useRef, useState } from 'react'
import {
  nomeAmbitoMcp,
  type AgenteVoce, type AmbitoMcp, type EsitoNegozio, type MarketplaceVoce, type McpVoce,
  type NuovoMcpModulo, type PluginVoce, type ScopeNegozio, type SkillVoce, type StatoVoce
} from '@shared/negozio'

/**
 * Il **Negozio**: plugin, skill, agenti e MCP di Claude Code, gestiti a clic.
 *
 * Quello che si farebbe da terminale — installare un plugin, aggiungere uno
 * store di terze parti, accendere una skill, aggiungere un server MCP con le
 * sue chiavi — qui è una vetrina con la testa fissa e il corpo che scorre da
 * solo. I plugin e i marketplace passano dal CLI di Claude Code (la sua
 * verità); skill e MCP si leggono dai file. Skill di progetto e MCP sono
 * legati alla **cartella** della chat che hai davanti: è lì che valgono.
 *
 * 0.53.0: ogni voce dice il suo stato con le parole del PC (le stesse del
 * telefono e della pagina: `@shared/negozio`), e sotto cosa vuol dire; ogni
 * azione mostra quanto ci sta mettendo, e se non riesce dice perché, accanto
 * alla voce, con «Riprova».
 */

type Plugin = PluginVoce
type Skill = SkillVoce
type Agente = AgenteVoce
type Mcp = McpVoce
type Marketplace = MarketplaceVoce
type Scope = ScopeNegozio

type Scheda = 'uso' | 'chat' | 'plugin' | 'skill' | 'agenti' | 'mcp' | 'store'

/** Senza una ricerca il catalogo plugin è un muro di migliaia di righe: si
 * mostra a blocchi, e una parola nella casella toglie il tetto. */
const TETTO = 30

/** Un guasto di una voce, con il modo di rifare la stessa cosa. */
type Guasto = { messaggio: string; riprova: () => void }
/** Un comando che un marketplace vuole eseguire: si mostra, e si conferma. */
type DaConfermare = { comando: string; conferma: () => void }

function formattaInstallazioni(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function contiene(testo: string, q: string): boolean {
  return testo.toLowerCase().includes(q)
}

function quando(iso?: string): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Righe «CHIAVE=valore» (o «Nome: valore») in una mappa; righe vuote ignorate. */
function coppie(testo: string, sep: '=' | ':'): Record<string, string> {
  const fuori: Record<string, string> = {}
  for (const riga of testo.split(/\r?\n/)) {
    const i = riga.indexOf(sep)
    if (riga.trim() === '' || i <= 0) continue
    fuori[riga.slice(0, i).trim()] = riga.slice(i + 1).trim()
  }
  return fuori
}

function Stato({ stato }: { stato?: StatoVoce }): React.JSX.Element | null {
  if (stato === undefined) return null
  return <span className={`negozio__stato negozio__stato--${stato.tono}`}>{stato.etichetta}</span>
}

export function PannelloNegozio({ cwd, onChiudi }: { cwd?: string; onChiudi: () => void }): React.JSX.Element {
  // Si apre sul catalogo (lo «store»): è un negozio, la prima cosa da vedere è
  // la merce. «In uso» è una scheda a parte per ciò che hai già.
  const [scheda, setScheda] = useState<Scheda>('plugin')
  const [plugin, setPlugin] = useState<Plugin[] | undefined>(undefined)
  const [errorePlugin, setErrorePlugin] = useState<string | undefined>(undefined)
  const [skill, setSkill] = useState<Skill[] | undefined>(undefined)
  const [agenti, setAgenti] = useState<Agente[] | undefined>(undefined)
  const [mcp, setMcp] = useState<Mcp[] | undefined>(undefined)
  const [erroreMcp, setErroreMcp] = useState<string | undefined>(undefined)
  const [verificoMcp, setVerificoMcp] = useState(false)
  const [store, setStore] = useState<Marketplace[] | undefined>(undefined)
  const [erroreStore, setErroreStore] = useState<string | undefined>(undefined)
  const [cerca, setCerca] = useState('')
  const [filtroMkt, setFiltroMkt] = useState<string>('tutti')
  const [solo, setSolo] = useState<'tutti' | 'installati' | 'aggiornare'>('tutti')
  const [nota, setNota] = useState<string | undefined>(undefined)
  const [dettagli, setDettagli] = useState<Record<string, { aperto: boolean; caricando?: boolean; testo?: string; errore?: string }>>({})
  const [nuovoStore, setNuovoStore] = useState('')
  const [scope, setScope] = useState<Scope>({ pluginSpenti: [], skillSpente: [], mcpSpenti: [] })
  const [mostraTutti, setMostraTutti] = useState(false)
  // Cosa sta facendo ogni voce occupata («Installazione…») e da quando: la
  // scritta accanto alla barra dice anche i secondi, perché un'installazione
  // da GitHub può prenderne trenta e un tasto fermo sembra un guasto.
  const [lavoro, setLavoro] = useState<Record<string, { testo: string; da: number }>>({})
  const [guasti, setGuasti] = useState<Record<string, Guasto>>({})
  const [conferme, setConferme] = useState<Record<string, DaConfermare>>({})
  /** Le azioni che cancellano qualcosa chiedono un secondo clic. */
  const [sicuro, setSicuro] = useState<string | undefined>(undefined)
  const [, setBattito] = useState(0)
  const [nuovaSkill, setNuovaSkill] = useState<{ dove: 'utente' | 'progetto'; nome: string; descrizione: string; istruzioni: string } | undefined>(undefined)
  const [nuovoMcp, setNuovoMcp] = useState<{ nome: string; ambito: 'locale' | 'utente' | 'progetto'; tipo: 'stdio' | 'http' | 'sse'; comando: string; argomenti: string; url: string; variabili: string; intestazioni: string } | undefined>(undefined)
  const [variabiliAperte, setVariabiliAperte] = useState<Record<string, { testo: string; togli: string[] }>>({})
  const montato = useRef(true)
  useEffect(() => () => { montato.current = false }, [])

  // Il contatore dei secondi gira solo mentre c'è qualcosa in corso.
  const occupato = Object.keys(lavoro).length > 0
  useEffect(() => {
    if (!occupato) return
    const h = setInterval(() => setBattito((b) => b + 1), 1000)
    return () => clearInterval(h)
  }, [occupato])

  // La conferma verde si toglie da sola: dice «riuscito» e cosa cambia, e va
  // letta, quindi resta qualche secondo in più di un semplice «fatto».
  useEffect(() => {
    if (nota === undefined) return
    const h = setTimeout(() => setNota(undefined), 9000)
    return () => clearTimeout(h)
  }, [nota])

  // `silenzioso`: dopo un'operazione si ricarica SENZA svuotare la lista, o la
  // vetrina lampeggia su «Carico…» e la voce appena toccata «sparisce».
  const caricaPlugin = (silenzioso = false, fresco = false): void => {
    if (!silenzioso) { setPlugin(undefined); setErrorePlugin(undefined) }
    window.gestore.negozio.plugin(fresco).then((r) => { if (!montato.current) return; setPlugin(r.plugin); setErrorePlugin(r.errore) })
      .catch((e: unknown) => { if (!silenzioso) setPlugin([]); setErrorePlugin(String(e)) })
  }
  // Un elenco che non si e' potuto leggere non e' un elenco vuoto.
  const caricaSkill = (): void => {
    window.gestore.negozio.skill(cwd).then((s) => { if (montato.current) setSkill(s) })
      .catch((e: unknown) => { setSkill([]); setGuasti((g) => ({ ...g, 'lista:skill': { messaggio: `Skill non lette: ${String(e)}`, riprova: caricaSkill } })) })
  }
  const caricaAgenti = (): void => {
    window.gestore.negozio.agenti(cwd).then((a) => { if (montato.current) setAgenti(a) })
      .catch((e: unknown) => { setAgenti([]); setGuasti((g) => ({ ...g, 'lista:agenti': { messaggio: `Agenti non letti: ${String(e)}`, riprova: caricaAgenti } })) })
  }
  /** Gli MCP dai file (subito), poi con lo stato del collegamento (qualche secondo). */
  const caricaMcp = (conSalute = true): void => {
    if (cwd === undefined) { setMcp([]); return }
    window.gestore.negozio.mcp(cwd).then((m) => { if (montato.current) setMcp((prima) => prima === undefined || !conSalute ? m : prima) })
      .catch((e: unknown) => { setMcp([]); setErroreMcp(String(e)) })
    if (!conSalute) return
    setVerificoMcp(true)
    window.gestore.negozio.saluteMcp(cwd)
      .then((r) => { if (!montato.current) return; setMcp(r.mcp); setErroreMcp(r.errore) })
      .catch((e: unknown) => setErroreMcp(`Non ho potuto provare i collegamenti: ${String(e)}`))
      .finally(() => { if (montato.current) setVerificoMcp(false) })
  }
  const caricaStore = (silenzioso = false): void => {
    if (!silenzioso) { setStore(undefined); setErroreStore(undefined) }
    window.gestore.negozio.marketplace().then((r) => { if (!montato.current) return; setStore(r.marketplace); setErroreStore(r.errore) })
      .catch((e: unknown) => { if (!silenzioso) setStore([]); setErroreStore(String(e)) })
  }
  const caricaScope = (): void => {
    if (cwd === undefined) { setScope({ pluginSpenti: [], skillSpente: [], mcpSpenti: [] }); return }
    window.gestore.negozio.scope(cwd).then(setScope).catch(() => setScope({ pluginSpenti: [], skillSpente: [], mcpSpenti: [] }))
  }

  useEffect(() => { caricaPlugin(); caricaSkill(); caricaAgenti(); caricaMcp(); caricaStore(); caricaScope() }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Accende o spegne una voce per QUESTA cartella (via --settings all'avvio). */
  const commutaScope = (campo: keyof Scope, valore: string, attivo: boolean): void => {
    if (cwd === undefined) return
    const set = new Set(scope[campo])
    if (attivo) set.delete(valore); else set.add(valore)
    const nuovo: Scope = { ...scope, [campo]: [...set] }
    setScope(nuovo)
    window.gestore.negozio.impostaScope(cwd, nuovo)
      .catch((e: unknown) => setGuasti((g) => ({ ...g, scope: { messaggio: String(e), riprova: () => commutaScope(campo, valore, attivo) } })))
  }

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  /**
   * Il giro di ogni azione: la voce si segna occupata con cosa sta facendo;
   * se riesce compare cosa cambia; se no il motivo resta accanto alla voce
   * con «Riprova», che rifà la stessa cosa. Un comando del marketplace da
   * confermare apre la sua conferma, sempre accanto alla voce.
   */
  const esegui = async (
    chiave: string,
    lavorando: string,
    azione: () => Promise<EsitoNegozio>,
    dopo: () => void,
    conConferma?: (sha: string) => Promise<EsitoNegozio>
  ): Promise<void> => {
    setSicuro(undefined)
    setGuasti((g) => { const n = { ...g }; delete n[chiave]; return n })
    setConferme((c) => { const n = { ...c }; delete n[chiave]; return n })
    setLavoro((l) => ({ ...l, [chiave]: { testo: lavorando, da: Date.now() } }))
    const riprova = (): void => { void esegui(chiave, lavorando, azione, dopo, conConferma) }
    try {
      const r = await azione()
      if (r.ok) {
        dopo()
        setNota(`✓ ${r.fatto ?? 'Fatto.'}`)
      } else if (r.conferma !== undefined && conConferma !== undefined) {
        const sha = r.conferma.sha256
        setConferme((c) => ({
          ...c,
          [chiave]: { comando: r.conferma?.comando ?? '', conferma: () => { void esegui(chiave, lavorando, () => conConferma(sha), dopo) } }
        }))
      } else {
        setGuasti((g) => ({ ...g, [chiave]: { messaggio: r.messaggio ?? 'Non è riuscito, e Claude Code non ha detto perché.', riprova } }))
      }
    } catch (e) {
      setGuasti((g) => ({ ...g, [chiave]: { messaggio: String(e), riprova } }))
    } finally {
      if (montato.current) setLavoro((l) => { const n = { ...l }; delete n[chiave]; return n })
    }
  }

  /** La barra, la scritta con i secondi, il guasto con «Riprova», la conferma. */
  const sottoVoce = (chiave: string): React.JSX.Element | null => {
    const l = lavoro[chiave]
    const g = guasti[chiave]
    const c = conferme[chiave]
    if (l === undefined && g === undefined && c === undefined) return null
    return (
      <>
        {l !== undefined ? (
          <div className="negozio__lavoro" role="status">
            <span className="negozio__spinner" aria-hidden="true" />
            <span className="misura">{l.testo} {Math.max(0, Math.round((Date.now() - l.da) / 1000))} s</span>
            <div className="negozio__prog" role="progressbar" aria-label={l.testo}><span className="negozio__prog-riemp" /></div>
          </div>
        ) : null}
        {g !== undefined && l === undefined ? (
          <div className="negozio__guasto">
            <span>⚠ {g.messaggio}</span>
            <button className="tasto" onClick={g.riprova}>Riprova</button>
          </div>
        ) : null}
        {c !== undefined && l === undefined ? (
          <div className="negozio__conferma">
            <div>
              Per installarlo, il marketplace chiede di eseguire questo comando sul computer. Fallo solo se ti fidi di
              chi lo pubblica: è un programma che gira con i tuoi permessi.
            </div>
            <pre className="negozio__pre">{c.comando === '' ? '(il CLI non ha mostrato il testo del comando)' : c.comando}</pre>
            <div className="negozio__azioni">
              <button className="tasto tasto--pericolo" onClick={c.conferma}>Mi fido: esegui e installa</button>
              <button className="tasto" onClick={() => setConferme((x) => { const n = { ...x }; delete n[chiave]; return n })}>Annulla</button>
            </div>
          </div>
        ) : null}
      </>
    )
  }

  /** Il secondo clic delle azioni che tolgono qualcosa. */
  const tastoSicuro = (chiave: string, testo: string, avviso: string, fai: () => void): React.JSX.Element => (
    sicuro === chiave ? (
      <span className="negozio__sicuro">
        <span className="misura">{avviso}</span>
        <button className="tasto tasto--pericolo" onClick={fai}>Sì, {testo.toLowerCase()}</button>
        <button className="tasto" onClick={() => setSicuro(undefined)}>No</button>
      </span>
    ) : <button className="tasto tasto--pericolo" onClick={() => setSicuro(chiave)}>{testo}</button>
  )

  /** Cambia SUBITO la riga in locale, prima che il ricarico canonico arrivi. */
  const aggiornaLocale = (id: string, patch: Partial<Plugin>): void => {
    setPlugin((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch, stato: undefined } : p)))
    setDettagli((prev) => { const n = { ...prev }; delete n[id]; return n })
  }

  const apriDettagli = (p: Plugin): void => {
    const id = p.id
    setDettagli((prec) => {
      const attuale = prec[id]
      if (attuale?.aperto === true) return { ...prec, [id]: { ...attuale, aperto: false } }
      if (attuale?.testo !== undefined || attuale?.errore !== undefined) {
        return { ...prec, [id]: { ...attuale, aperto: true } }
      }
      // L'inventario e il peso in token li sa solo `claude plugin details`, e
      // solo per un plugin INSTALLATO (per gli altri non c'è niente su disco).
      if (p.installato) {
        window.gestore.negozio.dettagliPlugin(id).then((r) => {
          setDettagli((p2) => ({ ...p2, [id]: { aperto: true, testo: r.testo, ...(r.errore !== undefined ? { errore: r.errore } : {}) } }))
        }).catch((e: unknown) => {
          setDettagli((p2) => ({ ...p2, [id]: { aperto: true, errore: String(e) } }))
        })
        return { ...prec, [id]: { aperto: true, caricando: true } }
      }
      return {
        ...prec,
        [id]: {
          aperto: true,
          testo: `${p.descrizione === '' ? 'Nessuna descrizione nel catalogo.' : p.descrizione}\n\nDal marketplace ${p.marketplace}.` +
            ' L’elenco di cosa contiene (skill, agenti, MCP) e quanto pesa in token si vede dopo averlo installato.'
        }
      }
    })
  }

  const q = cerca.trim().toLowerCase()

  // ─── conteggi per le etichette delle schede ───
  const installati = plugin?.filter((p) => p.installato).length ?? 0
  const daAggiornare = plugin?.filter((p) => p.aggiornamento === true).length ?? 0
  const skillAttive = skill?.filter((s) => s.abilitata).length ?? 0
  const mcpAttivi = mcp?.filter((m) => m.config === 'attivo').length ?? 0
  const mcpGuasti = mcp?.filter((m) => m.stato?.tono === 'errore' || m.config === 'da-approvare').length ?? 0

  const marketplaceDisponibili = useMemo(() => {
    const nomi = new Set<string>()
    for (const p of plugin ?? []) if (p.marketplace !== '') nomi.add(p.marketplace)
    return [...nomi].sort()
  }, [plugin])

  const pluginFiltrati = useMemo(() => {
    if (plugin === undefined) return []
    let f = plugin
    if (filtroMkt !== 'tutti') f = f.filter((p) => p.marketplace === filtroMkt)
    if (solo === 'installati') f = f.filter((p) => p.installato)
    if (solo === 'aggiornare') f = f.filter((p) => p.aggiornamento === true)
    if (q !== '') f = f.filter((p) => contiene(p.nome, q) || contiene(p.descrizione, q) || contiene(p.id, q))
    // Ordine STABILE per popolarità: se la riga saltasse di posto appena
    // installi o disinstalli, sembrerebbe sparita o bloccata.
    return [...f].sort((a, b) => (b.installazioni ?? 0) - (a.installazioni ?? 0) || a.nome.localeCompare(b.nome))
  }, [plugin, filtroMkt, solo, q])

  const limitato = q === '' && filtroMkt === 'tutti' && solo === 'tutti' && !mostraTutti
  const pluginVisibili = limitato ? pluginFiltrati.slice(0, TETTO) : pluginFiltrati

  const skillFiltrate = useMemo(
    () => (skill ?? []).filter((s) => q === '' || contiene(s.nome, q) || contiene(s.descrizione, q)),
    [skill, q]
  )
  const agentiFiltrati = useMemo(
    () => (agenti ?? []).filter((a) => q === '' || contiene(a.nome, q) || contiene(a.descrizione, q)),
    [agenti, q]
  )
  const mcpFiltrati = useMemo(
    () => (mcp ?? []).filter((m) => q === '' || contiene(m.nome, q) || contiene(m.come, q)),
    [mcp, q]
  )

  // ─── righe riusabili (stessa riga in «In uso» e nelle schede dedicate) ───
  const rigaPlugin = (p: Plugin): React.JSX.Element => {
    const fermo = lavoro[p.id] !== undefined
    const d = dettagli[p.id]
    return (
      <div key={p.id} className="negozio__voce negozio__voce--colonna">
        <div className="negozio__riga">
          <div className="negozio__info">
            <div className="negozio__nome">
              {p.nome}
              <Stato stato={p.stato} />
              <span className="negozio__mkt">{p.marketplace}</span>
              {p.versione !== undefined ? <span className="misura">v {p.versione}</span> : null}
              {p.installazioni !== undefined ? <span className="misura" title="installazioni">↧ {formattaInstallazioni(p.installazioni)}</span> : null}
            </div>
            {p.descrizione !== '' ? <div className="negozio__desc">{p.descrizione}</div> : null}
            {p.stato !== undefined ? <div className="negozio__spiega">{p.stato.spiegazione}</div> : null}
          </div>
          {fermo ? null : (
            <div className="negozio__azioni">
              <button className="tasto tasto--fantasma" onClick={() => apriDettagli(p)}>
                {d?.aperto === true ? 'Nascondi' : 'Dettagli'}
              </button>
              {p.installato ? (
                <>
                  <button className={`tasto${p.aggiornamento === true ? ' tasto--primario' : ''}`}
                    title="Scarica l’ultima versione dal marketplace"
                    onClick={() => void esegui(p.id, 'Aggiornamento…',
                      () => window.gestore.negozio.aggiornaPlugin(p.id),
                      () => caricaPlugin(true),
                      (sha) => window.gestore.negozio.aggiornaPlugin(p.id, sha))}>
                    Aggiorna
                  </button>
                  <button className="tasto"
                    onClick={() => void esegui(p.id, p.abilitato ? 'Disattivazione…' : 'Attivazione…',
                      () => window.gestore.negozio.commutaPlugin(p.id, !p.abilitato),
                      () => { aggiornaLocale(p.id, { abilitato: !p.abilitato }); caricaPlugin(true) })}>
                    {p.abilitato ? 'Disattiva' : 'Attiva'}
                  </button>
                  {tastoSicuro(`rimuovi:${p.id}`, 'Rimuovi', 'Toglie il plugin e i suoi dati.', () => void esegui(p.id, 'Rimozione…',
                    () => window.gestore.negozio.disinstallaPlugin(p.id),
                    () => { aggiornaLocale(p.id, { installato: false, abilitato: false }); caricaPlugin(true); caricaSkill() }))}
                </>
              ) : (
                <button className="tasto tasto--primario"
                  onClick={() => void esegui(p.id, 'Installazione…',
                    () => window.gestore.negozio.installaPlugin(p.id),
                    () => { aggiornaLocale(p.id, { installato: true, abilitato: true }); caricaPlugin(true); caricaSkill() },
                    (sha) => window.gestore.negozio.installaPlugin(p.id, sha))}>
                  Installa
                </button>
              )}
            </div>
          )}
        </div>
        {sottoVoce(p.id)}
        {d?.aperto === true ? (
          <div className="negozio__dettagli">
            {d.caricando === true ? <span className="misura">Leggo l’inventario…</span>
              : d.errore !== undefined ? <span className="misura">Dettagli non disponibili: {d.errore}</span>
                : <pre className="negozio__pre">{d.testo === '' ? 'Nessun dettaglio.' : d.testo}</pre>}
          </div>
        ) : null}
      </div>
    )
  }

  const rigaSkill = (s: Skill): React.JSX.Element => {
    const chiave = `skill:${s.percorso}`
    const fermo = lavoro[chiave] !== undefined
    return (
      <div key={s.percorso} className="negozio__voce negozio__voce--colonna">
        <div className="negozio__riga">
          <div className="negozio__info">
            <div className="negozio__nome">
              {s.nome}
              <Stato stato={s.stato} />
              <span className="negozio__mkt">{s.origine === 'utente' ? 'personale' : s.origine === 'progetto' ? 'del progetto' : `dal plugin ${s.plugin ?? ''}`}</span>
            </div>
            {s.descrizione !== '' ? <div className="negozio__desc">{s.descrizione}</div> : null}
            {s.stato !== undefined ? <div className="negozio__spiega">{s.stato.spiegazione}</div> : null}
          </div>
          {fermo ? null : (
            <div className="negozio__azioni">
              <button className="tasto tasto--fantasma" onClick={() => void window.gestore.negozio.rivela(s.percorso)}>Apri cartella</button>
              {s.origine === 'plugin' ? null : (
                <>
                  <button className="tasto"
                    onClick={() => void esegui(chiave, s.abilitata ? 'Spengo…' : 'Accendo…',
                      () => window.gestore.negozio.commutaSkill(s.nome, !s.abilitata),
                      caricaSkill)}>
                    {s.abilitata ? 'Disattiva' : 'Attiva'}
                  </button>
                  {tastoSicuro(`togli:${s.percorso}`, 'Togli', 'Va nel Cestino, da cui si recupera.', () => void esegui(chiave, 'Sposto nel Cestino…',
                    () => window.gestore.negozio.togliSkill(s.percorso, cwd),
                    caricaSkill))}
                </>
              )}
            </div>
          )}
        </div>
        {sottoVoce(chiave)}
      </div>
    )
  }

  const rigaAgente = (a: Agente): React.JSX.Element => (
    <div key={a.percorso} className="negozio__voce">
      <div className="negozio__info">
        <div className="negozio__nome">
          {a.nome}
          <span className="negozio__mkt">{a.origine === 'utente' ? 'personale' : 'del progetto'}</span>
          {a.modello !== undefined ? <span className="misura">{a.modello}</span> : null}
        </div>
        {a.descrizione !== '' ? <div className="negozio__desc">{a.descrizione}</div> : null}
        {a.strumenti !== undefined ? <div className="negozio__desc negozio__desc--mono">strumenti: {a.strumenti}</div> : null}
      </div>
      <div className="negozio__azioni">
        <button className="tasto tasto--fantasma" onClick={() => void window.gestore.negozio.rivela(a.percorso)}>Apri file</button>
      </div>
    </div>
  )

  const salvaVariabili = (m: Mcp): void => {
    if (cwd === undefined) return
    const v = variabiliAperte[m.nome]
    if (v === undefined) return
    const nuove = coppie(v.testo, m.tipo === 'stdio' ? '=' : ':')
    const modifiche: Record<string, string | null> = { ...nuove }
    for (const k of v.togli) modifiche[k] = null
    void esegui(`mcp:${m.nome}`, 'Salvo…',
      () => window.gestore.negozio.variabiliMcp(cwd, m.nome, m.ambito, m.tipo === 'stdio' ? { variabili: modifiche } : { intestazioni: modifiche }),
      () => { setVariabiliAperte((x) => { const n = { ...x }; delete n[m.nome]; return n }); caricaMcp() })
  }

  const rigaMcp = (m: Mcp): React.JSX.Element => {
    const chiave = `mcp:${m.nome}`
    const fermo = lavoro[chiave] !== undefined
    const chiavi = m.tipo === 'stdio' ? m.variabili : m.intestazioni
    const aperte = variabiliAperte[m.nome]
    const daApprovare = m.config === 'da-approvare' || m.config === 'rifiutato'
    return (
      <div key={`${m.ambito}:${m.nome}`} className="negozio__voce negozio__voce--colonna">
        <div className="negozio__riga">
          <div className="negozio__info">
            <div className="negozio__nome">
              {m.nome}
              <Stato stato={m.stato} />
              <span className="negozio__mkt">{nomeAmbitoMcp(m.ambito)} · {m.tipo}</span>
            </div>
            <div className="negozio__desc negozio__desc--mono">{m.come}</div>
            {chiavi.length > 0 ? (
              <div className="negozio__desc">{m.tipo === 'stdio' ? 'variabili' : 'intestazioni'}: {chiavi.join(', ')} <span className="misura">(i valori non si mostrano)</span></div>
            ) : null}
            {m.stato !== undefined ? <div className="negozio__spiega">{m.stato.spiegazione}</div> : null}
          </div>
          {fermo || cwd === undefined || m.ambito === 'altro' ? null : (
            <div className="negozio__azioni">
              {daApprovare ? (
                <>
                  <button className="tasto tasto--primario" onClick={() => void esegui(chiave, 'Approvo…', () => window.gestore.negozio.approvaMcp(cwd, m.nome, true), () => caricaMcp())}>Approva</button>
                  {m.config === 'da-approvare' ? <button className="tasto" onClick={() => void esegui(chiave, 'Rifiuto…', () => window.gestore.negozio.approvaMcp(cwd, m.nome, false), () => caricaMcp())}>Rifiuta</button> : null}
                </>
              ) : (
                <button className="tasto"
                  onClick={() => void esegui(chiave, m.config === 'attivo' ? 'Spengo…' : 'Accendo…',
                    () => window.gestore.negozio.commutaMcp(cwd, m.nome, m.config !== 'attivo'),
                    () => caricaMcp())}>
                  {m.config === 'attivo' ? 'Disattiva' : 'Attiva'}
                </button>
              )}
              <button className="tasto tasto--fantasma"
                onClick={() => setVariabiliAperte((x) => {
                  const n = { ...x }
                  if (n[m.nome] !== undefined) delete n[m.nome]
                  else n[m.nome] = { testo: '', togli: [] }
                  return n
                })}>
                {m.tipo === 'stdio' ? 'Variabili' : 'Intestazioni'}
              </button>
              {tastoSicuro(`togli-mcp:${m.nome}`, 'Togli', m.ambito === 'progetto' ? 'Lo toglie da .mcp.json, per tutto il progetto.' : 'Toglie la sua configurazione.', () => void esegui(chiave, 'Tolgo…',
                () => window.gestore.negozio.togliMcp(cwd, m.nome, m.ambito),
                () => caricaMcp()))}
            </div>
          )}
        </div>
        {aperte !== undefined ? (
          <div className="negozio__modulo">
            <div className="misura">
              {m.tipo === 'stdio'
                ? 'Una variabile per riga, come CHIAVE=valore. Scrivi solo quelle da aggiungere o cambiare: le altre restano come sono. I valori non si rileggono da qui, apposta.'
                : 'Un’intestazione per riga, come Authorization: Bearer … . Scrivi solo quelle da aggiungere o cambiare: le altre restano come sono.'}
              {m.ambito === 'progetto' ? ' Attenzione: questo server sta in .mcp.json, che si condivide con il progetto. Per un segreto scrivi ${NOME} e metti il valore vero nelle variabili d’ambiente di Windows.' : ''}
            </div>
            <textarea className="campo" rows={3} value={aperte.testo} placeholder={m.tipo === 'stdio' ? 'CHIAVE_API=…' : 'Authorization: Bearer …'}
              onChange={(e) => setVariabiliAperte((x) => ({ ...x, [m.nome]: { ...aperte, testo: e.target.value } }))} />
            {chiavi.length > 0 ? (
              <div className="negozio__chips">
                <span className="misura">Da togliere:</span>
                {chiavi.map((k) => {
                  const via = aperte.togli.includes(k)
                  return (
                    <button key={k} className={`negozio__chip${via ? ' negozio__chip--via' : ''}`}
                      onClick={() => setVariabiliAperte((x) => ({ ...x, [m.nome]: { ...aperte, togli: via ? aperte.togli.filter((t) => t !== k) : [...aperte.togli, k] } }))}>
                      {via ? '✕ ' : ''}{k}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div className="negozio__azioni">
              <button className="tasto tasto--primario" onClick={() => salvaVariabili(m)}>Salva</button>
              <button className="tasto" onClick={() => setVariabiliAperte((x) => { const n = { ...x }; delete n[m.nome]; return n })}>Annulla</button>
            </div>
          </div>
        ) : null}
        {sottoVoce(chiave)}
      </div>
    )
  }

  const moduloSkill = (): React.JSX.Element | null => {
    if (nuovaSkill === undefined) return null
    const n = nuovaSkill
    const crea = (): void => {
      void esegui('skill:nuova', 'Scrivo la skill…',
        () => window.gestore.negozio.creaSkill(n.dove, cwd, { nome: n.nome, descrizione: n.descrizione, istruzioni: n.istruzioni }),
        () => { setNuovaSkill(undefined); caricaSkill() })
    }
    return (
      <div className="negozio__modulo">
        <div className="negozio__titsez">Una skill nuova</div>
        <p className="misura">
          Una skill è un’istruzione che Claude usa da solo quando serve: la descrizione dice <b>quando</b>, le istruzioni dicono <b>cosa fare</b>.
          Finisce in una cartella con dentro il suo SKILL.md.
        </p>
        <div className="negozio__aggiungi">
          <select className="campo" value={n.dove} onChange={(e) => setNuovaSkill({ ...n, dove: e.target.value === 'progetto' ? 'progetto' : 'utente' })}>
            <option value="utente">Personale: vale in tutti i progetti</option>
            <option value="progetto" disabled={cwd === undefined}>Del progetto: solo questa cartella{cwd === undefined ? ' (apri una chat)' : ''}</option>
          </select>
          <input className="campo" placeholder="nome-della-skill (minuscole e trattini)" value={n.nome} onChange={(e) => setNuovaSkill({ ...n, nome: e.target.value })} />
        </div>
        <input className="campo negozio__largo" placeholder="Quando usarla: per esempio «Quando rivedi un testo in italiano»" value={n.descrizione} onChange={(e) => setNuovaSkill({ ...n, descrizione: e.target.value })} />
        <textarea className="campo negozio__largo" rows={5} placeholder="Cosa deve fare Claude, passo per passo" value={n.istruzioni} onChange={(e) => setNuovaSkill({ ...n, istruzioni: e.target.value })} />
        <div className="negozio__azioni">
          <button className="tasto tasto--primario" disabled={lavoro['skill:nuova'] !== undefined} onClick={crea}>Crea la skill</button>
          <button className="tasto" onClick={() => setNuovaSkill(undefined)}>Annulla</button>
        </div>
        {sottoVoce('skill:nuova')}
      </div>
    )
  }

  const moduloMcp = (): React.JSX.Element | null => {
    if (nuovoMcp === undefined || cwd === undefined) return null
    const n = nuovoMcp
    const aggiungi = (): void => {
      const dati: NuovoMcpModulo = {
        nome: n.nome.trim(),
        ambito: n.ambito,
        tipo: n.tipo,
        ...(n.tipo === 'stdio'
          ? { comando: n.comando.trim(), argomenti: n.argomenti.split(/\r?\n/).map((a) => a.trim()).filter((a) => a !== ''), variabili: coppie(n.variabili, '=') }
          : { url: n.url.trim(), intestazioni: coppie(n.intestazioni, ':') })
      }
      void esegui('mcp:nuovo', 'Aggiungo il server…',
        () => window.gestore.negozio.aggiungiMcp(cwd, dati),
        () => { setNuovoMcp(undefined); caricaMcp() })
    }
    return (
      <div className="negozio__modulo">
        <div className="negozio__titsez">Un server MCP nuovo</div>
        <p className="misura">
          Un server MCP dà alle chat strumenti in più (file, database, servizi web). Quelli «stdio» sono un programma che parte
          sul computer; quelli «http» sono un indirizzo in rete. Lo aggiunge Claude Code stesso (<code>claude mcp add-json</code>).
        </p>
        <div className="negozio__aggiungi">
          <input className="campo" placeholder="nome (per esempio files)" value={n.nome} onChange={(e) => setNuovoMcp({ ...n, nome: e.target.value })} />
          <select className="campo" value={n.ambito} onChange={(e) => setNuovoMcp({ ...n, ambito: e.target.value as 'locale' | 'utente' | 'progetto' })}>
            <option value="locale">Solo io, solo questa cartella</option>
            <option value="utente">Solo io, in tutti i progetti</option>
            <option value="progetto">Tutto il progetto (file .mcp.json, condiviso)</option>
          </select>
          <select className="campo" value={n.tipo} onChange={(e) => setNuovoMcp({ ...n, tipo: e.target.value as 'stdio' | 'http' | 'sse' })}>
            <option value="stdio">stdio: un programma sul computer</option>
            <option value="http">http: un indirizzo in rete</option>
            <option value="sse">sse: un indirizzo in rete (vecchio tipo)</option>
          </select>
        </div>
        {n.tipo === 'stdio' ? (
          <>
            <input className="campo negozio__largo" placeholder="comando: npx, node, uvx, oppure il percorso di un .exe" value={n.comando} onChange={(e) => setNuovoMcp({ ...n, comando: e.target.value })} />
            <textarea className="campo negozio__largo" rows={3} placeholder={'argomenti, uno per riga\n-y\n@esempio/server-mcp'} value={n.argomenti} onChange={(e) => setNuovoMcp({ ...n, argomenti: e.target.value })} />
            <textarea className="campo negozio__largo" rows={2} placeholder="variabili, una per riga: CHIAVE_API=valore" value={n.variabili} onChange={(e) => setNuovoMcp({ ...n, variabili: e.target.value })} />
          </>
        ) : (
          <>
            <input className="campo negozio__largo" placeholder="https://esempio.it/mcp" value={n.url} onChange={(e) => setNuovoMcp({ ...n, url: e.target.value })} />
            <textarea className="campo negozio__largo" rows={2} placeholder="intestazioni, una per riga: Authorization: Bearer …" value={n.intestazioni} onChange={(e) => setNuovoMcp({ ...n, intestazioni: e.target.value })} />
          </>
        )}
        <p className="misura">
          Le chiavi finiscono nella configurazione di Claude Code su questo computer
          {n.ambito === 'progetto' ? ': con «tutto il progetto» in .mcp.json, che si condivide. Lì per un segreto scrivi ${NOME} e metti il valore nelle variabili d’ambiente di Windows.' : ' (.claude.json), non nel progetto. Da qui in poi se ne vedono solo i nomi.'}
        </p>
        <div className="negozio__azioni">
          <button className="tasto tasto--primario" disabled={lavoro['mcp:nuovo'] !== undefined} onClick={aggiungi}>Aggiungi</button>
          <button className="tasto" onClick={() => setNuovoMcp(undefined)}>Annulla</button>
        </div>
        {sottoVoce('mcp:nuovo')}
      </div>
    )
  }

  const vuoto = (testo: string): React.JSX.Element => <p className="misura negozio__vuoto">{testo}</p>

  const tasto = (s: Scheda, testo: string, conteggio?: number, allarme?: number): React.JSX.Element => (
    <button className={`negozio__tab${scheda === s ? ' negozio__tab--attiva' : ''}`}
      onClick={() => setScheda(s)} aria-pressed={scheda === s}>
      {testo}{conteggio !== undefined && conteggio > 0 ? <span className="negozio__conta">{conteggio}</span> : null}
      {allarme !== undefined && allarme > 0 ? <span className="negozio__conta negozio__conta--attesa" title="da guardare">{allarme}</span> : null}
    </button>
  )

  const guastiDiLista = Object.entries(guasti).filter(([k]) => k.startsWith('lista:') || k === 'scope')

  return (
    <div className="pannello pannello--negozio">
      <div className="negozio__testa">
        <div className="negozio__testa-riga">
          <span className="serigrafia">Negozio</span>
          <span className="misura">plugin, skill, agenti e MCP di Claude Code — a clic</span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>
        <input className="campo negozio__cerca-globale" placeholder="Cerca in tutto il negozio…"
          value={cerca} onChange={(e) => setCerca(e.target.value)} autoFocus />
        <div className="negozio__tabs">
          {tasto('uso', 'In uso')}
          {tasto('chat', 'Questa chat', scope.pluginSpenti.length + scope.skillSpente.length + scope.mcpSpenti.length)}
          {tasto('plugin', 'Plugin', installati, daAggiornare)}
          {tasto('skill', 'Skill', skillAttive)}
          {tasto('agenti', 'Agenti', agenti?.length)}
          {tasto('mcp', 'MCP', mcpAttivi, mcpGuasti)}
          {tasto('store', 'Fonti', store?.length)}
        </div>
        {guastiDiLista.map(([k, g]) => (
          <div key={k} className="negozio__guasto"><span>⚠ {g.messaggio}</span><button className="tasto" onClick={() => { setGuasti((x) => { const n = { ...x }; delete n[k]; return n }); g.riprova() }}>Riprova</button></div>
        ))}
        {nota !== undefined ? <div className="negozio__ok" role="status">{nota}</div> : null}
      </div>

      <div className="negozio__corpo">
        {scheda === 'uso' ? (
          <div className="negozio__lista">
            <div className="negozio__sommario">
              <span><b>{installati}</b> plugin</span>
              {daAggiornare > 0 ? <span><b>{daAggiornare}</b> da aggiornare</span> : null}
              <span><b>{skillAttive}</b> skill attive</span>
              <span><b>{agenti?.length ?? 0}</b> agenti</span>
              <span><b>{mcpAttivi}</b> MCP attivi</span>
              {mcpGuasti > 0 ? <span><b>{mcpGuasti}</b> MCP da guardare</span> : null}
            </div>
            <div className="negozio__titsez">Plugin installati</div>
            {plugin === undefined ? vuoto('Carico…')
              : plugin.filter((p) => p.installato).length === 0
                ? vuoto('Nessun plugin installato. Vai su «Plugin» per sfogliarne migliaia.')
                : plugin.filter((p) => p.installato).map(rigaPlugin)}
            <div className="negozio__titsez">Skill</div>
            {skill === undefined ? vuoto('Carico…')
              : skill.length === 0 ? vuoto('Nessuna skill.')
                : skill.map(rigaSkill)}
            {(agenti?.length ?? 0) > 0 ? (
              <>
                <div className="negozio__titsez">Agenti</div>
                {(agenti ?? []).map(rigaAgente)}
              </>
            ) : null}
            {(mcp?.length ?? 0) > 0 ? (
              <>
                <div className="negozio__titsez">MCP di questa cartella</div>
                {(mcp ?? []).map(rigaMcp)}
              </>
            ) : null}
          </div>
        ) : null}

        {scheda === 'chat' ? (
          cwd === undefined ? vuoto('Apri una chat per scegliere cosa attivare solo per lei.')
            : (
              <div className="negozio__lista">
                <p className="misura negozio__vuoto">
                  Qui scegli cosa è attivo <b>solo per le chat di questa cartella</b>, senza toccare le altre né i file di
                  Claude Code: SierraDeck lo dice a ogni chat quando la apre (<code>--settings</code>). Togli la spunta per
                  spegnere una cosa qui: vale dalla prossima apertura della chat.
                </p>
                {(() => {
                  const pluginAttivi = (plugin ?? []).filter((p) => p.installato && p.abilitato)
                  const skillAttiveL = (skill ?? []).filter((s) => s.abilitata && s.origine !== 'plugin')
                  const mcpAttiviL = (mcp ?? []).filter((m) => m.config === 'attivo')
                  const spunta = (campo: keyof Scope, valore: string, nome: string, sotto?: string): React.JSX.Element => {
                    const attivo = !scope[campo].includes(valore)
                    return (
                      <label key={`${campo}:${valore}`} className="negozio__voce negozio__scope">
                        <div className="negozio__info">
                          <div className="negozio__nome">{nome}{!attivo ? <span className="negozio__stato negozio__stato--spento">spento qui</span> : null}</div>
                          {sotto !== undefined && sotto !== '' ? <div className="negozio__desc">{sotto}</div> : null}
                        </div>
                        <input type="checkbox" className="negozio__spunta" checked={attivo}
                          onChange={(e) => commutaScope(campo, valore, e.target.checked)} />
                      </label>
                    )
                  }
                  return (
                    <>
                      <div className="negozio__titsez">Plugin</div>
                      {pluginAttivi.length === 0 ? vuoto('Nessun plugin attivo da limitare.')
                        : pluginAttivi.map((p) => spunta('pluginSpenti', p.id, p.nome, p.marketplace))}
                      <div className="negozio__titsez">Skill</div>
                      {skillAttiveL.length === 0 ? vuoto('Nessuna skill attiva.')
                        : skillAttiveL.map((s) => spunta('skillSpente', s.nome, s.nome, s.origine === 'utente' ? 'personale' : 'del progetto'))}
                      <div className="negozio__titsez">MCP</div>
                      {mcpAttiviL.length === 0 ? vuoto('Nessun MCP attivo in questa cartella.')
                        : mcpAttiviL.map((m) => spunta('mcpSpenti', m.nome, m.nome, `${nomeAmbitoMcp(m.ambito)} · ${m.come}`))}
                    </>
                  )
                })()}
              </div>
            )
        ) : null}

        {scheda === 'plugin' ? (
          <>
            <div className="negozio__filtri">
              <button className={`negozio__chip${solo === 'tutti' ? ' negozio__chip--on' : ''}`} onClick={() => setSolo('tutti')}>Tutto il catalogo</button>
              <button className={`negozio__chip${solo === 'installati' ? ' negozio__chip--on' : ''}`} onClick={() => setSolo('installati')}>Installati ({installati})</button>
              {daAggiornare > 0 ? <button className={`negozio__chip${solo === 'aggiornare' ? ' negozio__chip--on' : ''}`} onClick={() => setSolo('aggiornare')}>Da aggiornare ({daAggiornare})</button> : null}
              <span style={{ flex: 1 }} />
              <button className="tasto tasto--fantasma" onClick={() => caricaPlugin(false, true)} title="Rilegge il catalogo dal CLI di Claude Code">Ricarica</button>
            </div>
            {marketplaceDisponibili.length > 1 ? (
              <div className="negozio__filtri">
                <button className={`negozio__chip${filtroMkt === 'tutti' ? ' negozio__chip--on' : ''}`} onClick={() => setFiltroMkt('tutti')}>Tutte le fonti</button>
                {marketplaceDisponibili.map((m) => (
                  <button key={m} className={`negozio__chip${filtroMkt === m ? ' negozio__chip--on' : ''}`} onClick={() => setFiltroMkt(m)}>{m}</button>
                ))}
              </div>
            ) : null}
            {errorePlugin !== undefined ? (
              <div className="negozio__guasto"><span>⚠ Il catalogo non risponde: {errorePlugin}</span><button className="tasto" onClick={() => caricaPlugin(false, true)}>Riprova</button></div>
            ) : null}
            {plugin !== undefined && plugin.length > 0 ? (
              <div className="misura negozio__conteggio">
                {pluginFiltrati.length} plugin{filtroMkt !== 'tutti' || q !== '' || solo !== 'tutti' ? ' trovati' : ' nel catalogo'} · {installati} installati
                {limitato && pluginFiltrati.length > TETTO ? ` · qui i ${TETTO} più installati: cerca una parola per trovare gli altri` : ''}
              </div>
            ) : null}
            {plugin === undefined ? vuoto('Leggo il catalogo da Claude Code… (qualche secondo: sono migliaia di plugin)')
              : pluginVisibili.length === 0 ? vuoto(q === '' ? 'Nessun plugin.' : 'Nessun plugin trovato con quella parola.')
                : (
                  <div className="negozio__lista">
                    {pluginVisibili.map(rigaPlugin)}
                    {limitato && pluginFiltrati.length > TETTO ? (
                      <button className="tasto negozio__mostra-tutti" onClick={() => setMostraTutti(true)}>
                        Mostra tutti ({pluginFiltrati.length})
                      </button>
                    ) : null}
                  </div>
                )}
          </>
        ) : null}

        {scheda === 'skill' ? (
          <>
            <div className="negozio__filtri">
              <button className="tasto tasto--primario" onClick={() => setNuovaSkill({ dove: cwd !== undefined ? 'progetto' : 'utente', nome: '', descrizione: '', istruzioni: '' })}>Nuova skill</button>
              <button className="tasto" title="Copia una cartella che contiene già un SKILL.md"
                onClick={() => void esegui('skill:importa', 'Copio la skill…', () => window.gestore.negozio.importaSkill('utente', cwd), caricaSkill)}>Importa da una cartella (personale)</button>
              {cwd !== undefined ? (
                <button className="tasto" onClick={() => void esegui('skill:importa', 'Copio la skill…', () => window.gestore.negozio.importaSkill('progetto', cwd), caricaSkill)}>Importa nel progetto</button>
              ) : null}
            </div>
            {sottoVoce('skill:importa')}
            {moduloSkill()}
            {skill === undefined ? vuoto('Carico…')
              : skillFiltrate.length === 0
                ? vuoto(q === '' ? 'Nessuna skill. Sono cartelle con un SKILL.md: personali in ~/.claude/skills, del progetto in .claude/skills. «Nuova skill» ne scrive una.' : 'Nessuna skill trovata.')
                : <div className="negozio__lista">{skillFiltrate.map(rigaSkill)}</div>}
          </>
        ) : null}

        {scheda === 'agenti' ? (
          agenti === undefined ? vuoto('Carico…')
            : agentiFiltrati.length === 0
              ? vuoto(q === '' ? 'Nessun agente. Gli agenti (subagent) sono file .md in ~/.claude/agents o in .claude/agents del progetto.' : 'Nessun agente trovato.')
              : <div className="negozio__lista">{agentiFiltrati.map(rigaAgente)}</div>
        ) : null}

        {scheda === 'mcp' ? (
          cwd === undefined ? vuoto('Apri una chat: gli MCP dipendono dalla cartella in cui lavora (quelli «solo questa cartella» e quelli del .mcp.json del progetto).')
            : (
              <>
                <div className="negozio__filtri">
                  <button className="tasto tasto--primario" onClick={() => setNuovoMcp({ nome: '', ambito: 'locale', tipo: 'stdio', comando: '', argomenti: '', url: '', variabili: '', intestazioni: '' })}>Aggiungi un MCP</button>
                  <button className="tasto" disabled={verificoMcp} onClick={() => caricaMcp()}>
                    {verificoMcp ? 'Provo i collegamenti…' : 'Verifica i collegamenti'}
                  </button>
                  <span className="misura">Ogni server si prova davvero (<code>claude mcp list</code>): ci vuole qualche secondo.</span>
                </div>
                {verificoMcp ? <div className="negozio__prog" role="progressbar" aria-label="prova dei collegamenti"><span className="negozio__prog-riemp" /></div> : null}
                {erroreMcp !== undefined ? <div className="negozio__guasto"><span>⚠ {erroreMcp}</span><button className="tasto" onClick={() => caricaMcp()}>Riprova</button></div> : null}
                {moduloMcp()}
                {mcp === undefined ? vuoto('Carico…')
                  : mcpFiltrati.length === 0
                    ? vuoto(q === '' ? 'Nessun MCP per questa cartella. «Aggiungi un MCP» ne aggiunge uno.' : 'Nessun MCP trovato.')
                    : <div className="negozio__lista">{mcpFiltrati.map(rigaMcp)}</div>}
              </>
            )
        ) : null}

        {scheda === 'store' ? (
          <div className="negozio__lista">
            <p className="misura negozio__vuoto">
              Le fonti (marketplace) sono le vetrine da cui arrivano i plugin. Aggiungine una con un repo GitHub
              (<code>utente/repo</code>), un indirizzo, o una cartella del computer. «Aggiorna» rilegge il catalogo dalla
              sua sorgente: è così che arrivano i plugin nuovi e le versioni nuove.
            </p>
            <div className="negozio__aggiungi">
              <input className="campo" placeholder="utente/repo · https://… · C:\percorso"
                value={nuovoStore} onChange={(e) => setNuovoStore(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nuovoStore.trim() !== '') {
                    void esegui('mkt:add', 'Aggiungo la fonte…', () => window.gestore.negozio.aggiungiMarketplace(nuovoStore.trim()), () => { setNuovoStore(''); caricaStore(true); caricaPlugin(true) })
                  }
                }} />
              <button className="tasto tasto--primario" disabled={nuovoStore.trim() === '' || lavoro['mkt:add'] !== undefined}
                onClick={() => void esegui('mkt:add', 'Aggiungo la fonte…', () => window.gestore.negozio.aggiungiMarketplace(nuovoStore.trim()), () => { setNuovoStore(''); caricaStore(true); caricaPlugin(true) })}>
                Aggiungi fonte
              </button>
              <button className="tasto tasto--fantasma" disabled={lavoro['mkt:upd'] !== undefined}
                onClick={() => void esegui('mkt:upd', 'Aggiorno tutte le fonti…', () => window.gestore.negozio.aggiornaMarketplace(), () => { caricaStore(true); caricaPlugin(true) })}
                title="Rilegge tutte le fonti dalle loro sorgenti">
                Aggiorna tutte
              </button>
            </div>
            {sottoVoce('mkt:add')}
            {sottoVoce('mkt:upd')}
            {erroreStore !== undefined ? <div className="negozio__guasto"><span>⚠ {erroreStore}</span><button className="tasto" onClick={() => caricaStore()}>Riprova</button></div> : null}
            {store === undefined ? vuoto('Carico…')
              : store.length === 0 ? vuoto('Nessuna fonte configurata a mano. Il catalogo di Anthropic c’è lo stesso, nella scheda Plugin.')
                : store.map((m) => {
                  const chiave = `mkt:${m.nome}`
                  const fermo = lavoro[chiave] !== undefined
                  return (
                    <div key={m.nome} className="negozio__voce negozio__voce--colonna">
                      <div className="negozio__riga">
                        <div className="negozio__info">
                          <div className="negozio__nome">
                            {m.nome}
                            {m.ufficiale ? <span className="negozio__stato negozio__stato--ok">ufficiale</span> : <span className="negozio__mkt">{m.tipo}</span>}
                            {m.aggiornato !== undefined ? <span className="misura">riletta il {quando(m.aggiornato)}</span> : null}
                          </div>
                          {m.riferimento !== '' ? <div className="negozio__desc negozio__desc--mono">{m.riferimento}</div> : null}
                        </div>
                        {fermo ? null : (
                          <div className="negozio__azioni">
                            <button className="tasto" onClick={() => void esegui(chiave, 'Aggiorno…', () => window.gestore.negozio.aggiornaMarketplace(m.nome), () => { caricaStore(true); caricaPlugin(true) })}>Aggiorna</button>
                            {m.ufficiale ? <span className="misura">non si toglie</span>
                              : tastoSicuro(`togli-mkt:${m.nome}`, 'Rimuovi', 'Toglie anche i plugin installati da qui, con i loro dati.', () => void esegui(chiave, 'Tolgo la fonte…',
                                () => window.gestore.negozio.rimuoviMarketplace(m.nome), () => { caricaStore(true); caricaPlugin(true); caricaSkill() }))}
                          </div>
                        )}
                      </div>
                      {sottoVoce(chiave)}
                    </div>
                  )
                })}
          </div>
        ) : null}
      </div>

      <div className="negozio__pie-fisso misura">
        Plugin e skill personali valgono per tutte le chat di questo computer; skill del progetto e MCP per la cartella che hai davanti.
        Le skill cambiano subito anche nelle chat aperte; plugin e MCP dalle chat che apri dopo la modifica.
      </div>
    </div>
  )
}
