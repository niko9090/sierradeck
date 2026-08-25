import { useEffect, useMemo, useState } from 'react'

/**
 * Il **Negozio**: plugin, skill, agenti e MCP di Claude Code, gestiti a clic.
 *
 * Quello che si farebbe da terminale — installare un plugin, aggiungere uno
 * store di terze parti, accendere una skill, guardare cosa pesa — qui è una
 * vetrina con la testa fissa e il corpo che scorre da solo (una lista, non
 * l'intera finestra). I plugin e i marketplace passano dal CLI di Claude Code
 * (la sua verità); skill, agenti e MCP si leggono dai file. Skill, agenti e MCP
 * sono legati alla **cartella** della chat che hai davanti: è lì che valgono.
 */

type Plugin = {
  id: string; nome: string; descrizione: string; marketplace: string
  installato: boolean; abilitato: boolean; installazioni?: number
}
type Skill = {
  nome: string; descrizione: string; origine: 'utente' | 'progetto' | 'plugin'
  percorso: string; abilitata: boolean
}
type Agente = {
  nome: string; descrizione: string; origine: 'utente' | 'progetto'
  percorso: string; strumenti?: string; modello?: string
}
type Mcp = { nome: string; come: string; abilitato: boolean }
type Marketplace = { nome: string; tipo: string; riferimento: string; ufficiale: boolean }

type Scheda = 'uso' | 'plugin' | 'skill' | 'agenti' | 'mcp' | 'store'

/** Senza una ricerca il catalogo plugin è un muro di centinaia di righe: si
 * mostra a blocchi, e una parola nella casella toglie il tetto. */
const TETTO = 30

function formattaInstallazioni(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function contiene(testo: string, q: string): boolean {
  return testo.toLowerCase().includes(q)
}

export function PannelloNegozio({ cwd, onChiudi }: { cwd?: string; onChiudi: () => void }): React.JSX.Element {
  const [scheda, setScheda] = useState<Scheda>('uso')
  const [plugin, setPlugin] = useState<Plugin[] | undefined>(undefined)
  const [errorePlugin, setErrorePlugin] = useState<string | undefined>(undefined)
  const [skill, setSkill] = useState<Skill[] | undefined>(undefined)
  const [agenti, setAgenti] = useState<Agente[] | undefined>(undefined)
  const [mcp, setMcp] = useState<Mcp[] | undefined>(undefined)
  const [store, setStore] = useState<Marketplace[] | undefined>(undefined)
  const [erroreStore, setErroreStore] = useState<string | undefined>(undefined)
  const [cerca, setCerca] = useState('')
  const [filtroMkt, setFiltroMkt] = useState<string>('tutti')
  const [inCorso, setInCorso] = useState<Set<string>>(new Set())
  const [avviso, setAvviso] = useState<string | undefined>(undefined)
  const [dettagli, setDettagli] = useState<Record<string, { aperto: boolean; caricando?: boolean; testo?: string; errore?: string }>>({})
  const [nuovoStore, setNuovoStore] = useState('')

  const caricaPlugin = (): void => {
    setPlugin(undefined); setErrorePlugin(undefined)
    window.gestore.negozio.plugin().then((r) => { setPlugin(r.plugin); setErrorePlugin(r.errore) })
      .catch((e: unknown) => { setPlugin([]); setErrorePlugin(String(e)) })
  }
  const caricaSkill = (): void => { window.gestore.negozio.skill(cwd).then(setSkill).catch(() => setSkill([])) }
  const caricaAgenti = (): void => { window.gestore.negozio.agenti(cwd).then(setAgenti).catch(() => setAgenti([])) }
  const caricaMcp = (): void => {
    if (cwd === undefined) { setMcp([]); return }
    window.gestore.negozio.mcp(cwd).then(setMcp).catch(() => setMcp([]))
  }
  const caricaStore = (): void => {
    setStore(undefined); setErroreStore(undefined)
    window.gestore.negozio.marketplace().then((r) => { setStore(r.marketplace); setErroreStore(r.errore) })
      .catch((e: unknown) => { setStore([]); setErroreStore(String(e)) })
  }

  useEffect(() => { caricaPlugin(); caricaSkill(); caricaAgenti(); caricaMcp(); caricaStore() }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const segna = (chiave: string, attivo: boolean): void => {
    setInCorso((prec) => {
      const p = new Set(prec)
      if (attivo) p.add(chiave); else p.delete(chiave)
      return p
    })
  }

  const conEsito = async (
    chiave: string,
    azione: () => Promise<{ ok: boolean; messaggio?: string }>,
    dopo: () => void
  ): Promise<void> => {
    segna(chiave, true); setAvviso(undefined)
    try {
      const r = await azione()
      if (!r.ok) setAvviso(r.messaggio ?? 'operazione non riuscita')
      else dopo()
    } catch (e) {
      setAvviso(String(e))
    } finally {
      segna(chiave, false)
    }
  }

  const apriDettagli = (id: string): void => {
    setDettagli((prec) => {
      const attuale = prec[id]
      if (attuale?.aperto === true) return { ...prec, [id]: { ...attuale, aperto: false } }
      // Prima apertura: si va a chiedere l'inventario e il peso.
      if (attuale?.testo === undefined && attuale?.errore === undefined) {
        window.gestore.negozio.dettagliPlugin(id).then((r) => {
          setDettagli((p2) => ({ ...p2, [id]: { aperto: true, testo: r.testo, errore: r.errore } }))
        }).catch((e: unknown) => {
          setDettagli((p2) => ({ ...p2, [id]: { aperto: true, errore: String(e) } }))
        })
        return { ...prec, [id]: { aperto: true, caricando: true } }
      }
      return { ...prec, [id]: { ...attuale, aperto: true } }
    })
  }

  const q = cerca.trim().toLowerCase()

  // ─── conteggi per le etichette delle schede ───
  const installati = plugin?.filter((p) => p.installato).length ?? 0
  const skillAttive = skill?.filter((s) => s.abilitata).length ?? 0
  const mcpAttivi = mcp?.filter((m) => m.abilitato).length ?? 0

  // ─── plugin filtrati (ricerca + marketplace), installati in cima ───
  const marketplaceDisponibili = useMemo(() => {
    const nomi = new Set<string>()
    for (const p of plugin ?? []) if (p.marketplace !== '') nomi.add(p.marketplace)
    return [...nomi].sort()
  }, [plugin])

  const pluginFiltrati = useMemo(() => {
    if (plugin === undefined) return []
    let f = plugin
    if (filtroMkt !== 'tutti') f = f.filter((p) => p.marketplace === filtroMkt)
    if (q !== '') f = f.filter((p) => contiene(p.nome, q) || contiene(p.descrizione, q))
    return [...f].sort((a, b) => {
      if (a.installato !== b.installato) return a.installato ? -1 : 1
      return (b.installazioni ?? 0) - (a.installazioni ?? 0)
    })
  }, [plugin, filtroMkt, q])

  const pluginVisibili = q === '' && filtroMkt === 'tutti' ? pluginFiltrati.slice(0, TETTO) : pluginFiltrati

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
    const occupato = inCorso.has(p.id)
    const d = dettagli[p.id]
    return (
      <div key={p.id} className="negozio__voce negozio__voce--colonna">
        <div className="negozio__riga">
          <div className="negozio__info">
            <div className="negozio__nome">
              {p.nome}
              {p.installato ? (
                <span className={`negozio__stato${p.abilitato ? ' negozio__stato--on' : ''}`}>
                  {p.abilitato ? 'attivo' : 'spento'}
                </span>
              ) : null}
              <span className="negozio__mkt">{p.marketplace}</span>
              {p.installazioni !== undefined ? <span className="misura">↧ {formattaInstallazioni(p.installazioni)}</span> : null}
            </div>
            {p.descrizione !== '' ? <div className="negozio__desc">{p.descrizione}</div> : null}
          </div>
          <div className="negozio__azioni">
            {p.installato ? (
              <>
                <button className="tasto" disabled={occupato}
                  onClick={() => void conEsito(p.id, () => window.gestore.negozio.commutaPlugin(p.id, !p.abilitato), caricaPlugin)}>
                  {p.abilitato ? 'Disattiva' : 'Attiva'}
                </button>
                <button className="tasto tasto--fantasma" disabled={occupato}
                  onClick={() => apriDettagli(p.id)}>
                  {d?.aperto === true ? 'Nascondi' : 'Dettagli'}
                </button>
                <button className="tasto tasto--fantasma" disabled={occupato}
                  onClick={() => void conEsito(p.id, () => window.gestore.negozio.disinstallaPlugin(p.id), caricaPlugin)}>
                  Rimuovi
                </button>
              </>
            ) : (
              <button className="tasto tasto--primario" disabled={occupato}
                onClick={() => void conEsito(p.id, () => window.gestore.negozio.installaPlugin(p.id), caricaPlugin)}>
                {occupato ? 'Installo…' : 'Installa'}
              </button>
            )}
          </div>
        </div>
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
    const occupato = inCorso.has(`skill:${s.nome}`)
    return (
      <div key={s.percorso} className="negozio__voce">
        <div className="negozio__info">
          <div className="negozio__nome">
            {s.nome}
            <span className="negozio__mkt">{s.origine}</span>
            {!s.abilitata ? <span className="negozio__stato">spenta</span> : null}
          </div>
          {s.descrizione !== '' ? <div className="negozio__desc">{s.descrizione}</div> : null}
        </div>
        <div className="negozio__azioni">
          <button className="tasto tasto--fantasma" onClick={() => void window.gestore.negozio.rivela(s.percorso)}>Apri cartella</button>
          <button className="tasto" disabled={occupato}
            onClick={() => void conEsito(`skill:${s.nome}`, () => window.gestore.negozio.commutaSkill(s.nome, !s.abilitata), caricaSkill)}>
            {s.abilitata ? 'Disattiva' : 'Attiva'}
          </button>
        </div>
      </div>
    )
  }

  const rigaAgente = (a: Agente): React.JSX.Element => (
    <div key={a.percorso} className="negozio__voce">
      <div className="negozio__info">
        <div className="negozio__nome">
          {a.nome}
          <span className="negozio__mkt">{a.origine}</span>
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

  const rigaMcp = (m: Mcp): React.JSX.Element => {
    const occupato = inCorso.has(`mcp:${m.nome}`)
    return (
      <div key={m.nome} className="negozio__voce">
        <div className="negozio__info">
          <div className="negozio__nome">{m.nome}{!m.abilitato ? <span className="negozio__stato">spento</span> : null}</div>
          <div className="negozio__desc negozio__desc--mono">{m.come}</div>
        </div>
        <div className="negozio__azioni">
          <button className="tasto" disabled={occupato || cwd === undefined}
            onClick={() => cwd !== undefined && void conEsito(`mcp:${m.nome}`, () => window.gestore.negozio.commutaMcp(cwd, m.nome, !m.abilitato), caricaMcp)}>
            {m.abilitato ? 'Disattiva' : 'Attiva'}
          </button>
        </div>
      </div>
    )
  }

  const vuoto = (testo: string): React.JSX.Element => <p className="misura negozio__vuoto">{testo}</p>

  const tasto = (s: Scheda, testo: string, conteggio?: number): React.JSX.Element => (
    <button className={`negozio__tab${scheda === s ? ' negozio__tab--attiva' : ''}`}
      onClick={() => setScheda(s)} aria-pressed={scheda === s}>
      {testo}{conteggio !== undefined && conteggio > 0 ? <span className="negozio__conta">{conteggio}</span> : null}
    </button>
  )

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
          value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <div className="negozio__tabs">
          {tasto('uso', 'In uso')}
          {tasto('plugin', 'Plugin', installati)}
          {tasto('skill', 'Skill', skillAttive)}
          {tasto('agenti', 'Agenti', agenti?.length)}
          {tasto('mcp', 'MCP', mcpAttivi)}
          {tasto('store', 'Store', store?.length)}
        </div>
        {avviso !== undefined ? <div className="avviso">⚠ {avviso}</div> : null}
      </div>

      <div className="negozio__corpo">
        {scheda === 'uso' ? (
          <div className="negozio__lista">
            <div className="negozio__sommario">
              <span><b>{installati}</b> plugin</span>
              <span><b>{skillAttive}</b> skill attive</span>
              <span><b>{agenti?.length ?? 0}</b> agenti</span>
              <span><b>{mcpAttivi}</b> MCP attivi</span>
            </div>
            <div className="negozio__titsez">Plugin installati</div>
            {plugin === undefined ? vuoto('Carico…')
              : plugin.filter((p) => p.installato).length === 0
                ? vuoto('Nessun plugin installato. Vai su «Plugin» per sfogliarne centinaia.')
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

        {scheda === 'plugin' ? (
          <>
            {marketplaceDisponibili.length > 1 ? (
              <div className="negozio__filtri">
                <button className={`negozio__chip${filtroMkt === 'tutti' ? ' negozio__chip--on' : ''}`} onClick={() => setFiltroMkt('tutti')}>Tutti</button>
                {marketplaceDisponibili.map((m) => (
                  <button key={m} className={`negozio__chip${filtroMkt === m ? ' negozio__chip--on' : ''}`} onClick={() => setFiltroMkt(m)}>{m}</button>
                ))}
              </div>
            ) : null}
            {errorePlugin !== undefined ? <div className="avviso">⚠ Il negozio non risponde: {errorePlugin}</div> : null}
            {plugin === undefined ? vuoto('Carico il catalogo…')
              : pluginVisibili.length === 0 ? vuoto(q === '' ? 'Nessun plugin.' : 'Nessun plugin trovato.')
                : (
                  <div className="negozio__lista">
                    {pluginVisibili.map(rigaPlugin)}
                    {q === '' && filtroMkt === 'tutti' && pluginFiltrati.length > TETTO
                      ? vuoto(`…e altri ${pluginFiltrati.length - TETTO}. Cerca per nome, o filtra per store.`)
                      : null}
                  </div>
                )}
          </>
        ) : null}

        {scheda === 'skill' ? (
          skill === undefined ? vuoto('Carico…')
            : skillFiltrate.length === 0
              ? vuoto(q === '' ? 'Nessuna skill installata. Sono cartelle con un SKILL.md in ~/.claude/skills o in .claude/skills del progetto.' : 'Nessuna skill trovata.')
              : <div className="negozio__lista">{skillFiltrate.map(rigaSkill)}</div>
        ) : null}

        {scheda === 'agenti' ? (
          agenti === undefined ? vuoto('Carico…')
            : agentiFiltrati.length === 0
              ? vuoto(q === '' ? 'Nessun agente. Gli agenti (subagent) sono file .md in ~/.claude/agents o in .claude/agents del progetto.' : 'Nessun agente trovato.')
              : <div className="negozio__lista">{agentiFiltrati.map(rigaAgente)}</div>
        ) : null}

        {scheda === 'mcp' ? (
          cwd === undefined ? vuoto('Apri una chat per vedere i suoi MCP.')
            : mcp === undefined ? vuoto('Carico…')
              : mcpFiltrati.length === 0
                ? vuoto(q === '' ? 'Nessun MCP per questa cartella. Stanno in .claude.json, sotto il progetto.' : 'Nessun MCP trovato.')
                : <div className="negozio__lista">{mcpFiltrati.map(rigaMcp)}</div>
        ) : null}

        {scheda === 'store' ? (
          <div className="negozio__lista">
            <p className="misura negozio__vuoto">
              Gli store (marketplace) sono le vetrine da cui arrivano i plugin. Aggiungine uno di terze parti
              con un repo GitHub (<code>utente/repo</code>), un indirizzo, o una cartella.
            </p>
            <div className="negozio__aggiungi">
              <input className="campo" placeholder="utente/repo · https://… · C:\percorso"
                value={nuovoStore} onChange={(e) => setNuovoStore(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nuovoStore.trim() !== '') {
                    void conEsito('mkt:add', () => window.gestore.negozio.aggiungiMarketplace(nuovoStore.trim()), () => { setNuovoStore(''); caricaStore(); caricaPlugin() })
                  }
                }} />
              <button className="tasto tasto--primario" disabled={nuovoStore.trim() === '' || inCorso.has('mkt:add')}
                onClick={() => void conEsito('mkt:add', () => window.gestore.negozio.aggiungiMarketplace(nuovoStore.trim()), () => { setNuovoStore(''); caricaStore(); caricaPlugin() })}>
                {inCorso.has('mkt:add') ? 'Aggiungo…' : 'Aggiungi store'}
              </button>
              <button className="tasto tasto--fantasma" disabled={inCorso.has('mkt:upd')}
                onClick={() => void conEsito('mkt:upd', () => window.gestore.negozio.aggiornaMarketplace(), () => { caricaStore(); caricaPlugin() })}
                title="Riscarica gli store dalle loro sorgenti">
                {inCorso.has('mkt:upd') ? 'Aggiorno…' : 'Aggiorna tutti'}
              </button>
            </div>
            {erroreStore !== undefined ? <div className="avviso">⚠ {erroreStore}</div> : null}
            {store === undefined ? vuoto('Carico…')
              : store.length === 0 ? vuoto('Nessuno store configurato.')
                : store.map((m) => {
                  const occupato = inCorso.has(`mkt:${m.nome}`)
                  return (
                    <div key={m.nome} className="negozio__voce">
                      <div className="negozio__info">
                        <div className="negozio__nome">
                          {m.nome}
                          {m.ufficiale ? <span className="negozio__stato negozio__stato--on">ufficiale</span> : <span className="negozio__mkt">{m.tipo}</span>}
                        </div>
                        {m.riferimento !== '' ? <div className="negozio__desc negozio__desc--mono">{m.riferimento}</div> : null}
                      </div>
                      <div className="negozio__azioni">
                        {m.ufficiale ? <span className="misura">non rimovibile</span> : (
                          <button className="tasto tasto--fantasma" disabled={occupato}
                            onClick={() => void conEsito(`mkt:${m.nome}`, () => window.gestore.negozio.rimuoviMarketplace(m.nome), () => { caricaStore(); caricaPlugin() })}>
                            Rimuovi
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
          </div>
        ) : null}
      </div>

      <div className="negozio__pie-fisso misura">
        I plugin valgono per tutte le chat; skill, agenti e MCP mostrati sono della cartella che hai davanti.
        Le modifiche valgono per le chat aperte dal prossimo avvio.
      </div>
    </div>
  )
}
