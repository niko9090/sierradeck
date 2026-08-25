import { useEffect, useMemo, useState } from 'react'

/**
 * Il **negozio**: plugin, skill e MCP di Claude Code, gestiti a clic.
 *
 * Quello che si farebbe da terminale — `claude plugin install`, spegnere una
 * skill, disattivare un MCP — qui è una vetrina. I plugin passano dal CLI di
 * Claude Code (la sua verità, non un file che potremmo leggere male); skill e
 * MCP si leggono dai file e si accendono/spengono con un tocco. Le skill e gli
 * MCP sono legati alla **cartella** della chat che hai davanti: è lì che valgono.
 */

type Plugin = {
  id: string; nome: string; descrizione: string; marketplace: string
  installato: boolean; abilitato: boolean; installazioni?: number
}
type Skill = {
  nome: string; descrizione: string; origine: 'utente' | 'progetto' | 'plugin'
  percorso: string; abilitata: boolean
}
type Mcp = { nome: string; come: string; abilitato: boolean }

type Scheda = 'plugin' | 'skill' | 'mcp'

/** Quanti plugin mostrare senza una ricerca: 287 righe tutte insieme sono un
 * muro. Con una parola nella casella il tetto sparisce. */
const TETTO = 40

function formattaInstallazioni(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

export function PannelloNegozio({ cwd, onChiudi }: { cwd?: string; onChiudi: () => void }): React.JSX.Element {
  const [scheda, setScheda] = useState<Scheda>('plugin')
  const [plugin, setPlugin] = useState<Plugin[] | undefined>(undefined)
  const [errorePlugin, setErrorePlugin] = useState<string | undefined>(undefined)
  const [skill, setSkill] = useState<Skill[] | undefined>(undefined)
  const [mcp, setMcp] = useState<Mcp[] | undefined>(undefined)
  const [cerca, setCerca] = useState('')
  const [inCorso, setInCorso] = useState<Set<string>>(new Set())
  const [avviso, setAvviso] = useState<string | undefined>(undefined)

  const caricaPlugin = (): void => {
    setPlugin(undefined); setErrorePlugin(undefined)
    window.gestore.negozio.plugin().then((r) => {
      setPlugin(r.plugin); setErrorePlugin(r.errore)
    }).catch((e: unknown) => { setPlugin([]); setErrorePlugin(String(e)) })
  }
  const caricaSkill = (): void => {
    window.gestore.negozio.skill(cwd).then(setSkill).catch(() => setSkill([]))
  }
  const caricaMcp = (): void => {
    if (cwd === undefined) { setMcp([]); return }
    window.gestore.negozio.mcp(cwd).then(setMcp).catch(() => setMcp([]))
  }

  useEffect(() => { caricaPlugin(); caricaSkill(); caricaMcp() }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const pluginVisibili = useMemo(() => {
    if (plugin === undefined) return []
    const q = cerca.trim().toLowerCase()
    const filtrati = q === ''
      ? plugin
      : plugin.filter((p) => p.nome.toLowerCase().includes(q) || p.descrizione.toLowerCase().includes(q))
    // Installati in cima: sono «i tuoi», e la vetrina viene dopo.
    const ordinati = [...filtrati].sort((a, b) => {
      if (a.installato !== b.installato) return a.installato ? -1 : 1
      return (b.installazioni ?? 0) - (a.installazioni ?? 0)
    })
    return q === '' ? ordinati.slice(0, TETTO) : ordinati
  }, [plugin, cerca])

  const totaleFiltrati = useMemo(() => {
    if (plugin === undefined) return 0
    const q = cerca.trim().toLowerCase()
    return q === '' ? plugin.length : plugin.filter((p) => p.nome.toLowerCase().includes(q) || p.descrizione.toLowerCase().includes(q)).length
  }, [plugin, cerca])

  const installati = plugin?.filter((p) => p.installato).length ?? 0

  const tasto = (s: Scheda, testo: string, conteggio?: number): React.JSX.Element => (
    <button
      className={`negozio__tab${scheda === s ? ' negozio__tab--attiva' : ''}`}
      onClick={() => setScheda(s)}
      aria-pressed={scheda === s}
    >
      {testo}{conteggio !== undefined && conteggio > 0 ? <span className="negozio__conta">{conteggio}</span> : null}
    </button>
  )

  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">Negozio</span>
        <span className="misura">plugin, skill e MCP di Claude Code — a clic</span>
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      <div className="negozio__tabs">
        {tasto('plugin', 'Plugin', installati)}
        {tasto('skill', 'Skill', skill?.filter((s) => s.abilitata).length)}
        {tasto('mcp', 'MCP', mcp?.filter((m) => m.abilitato).length)}
      </div>

      {avviso !== undefined ? <div className="avviso">⚠ {avviso}</div> : null}

      {scheda === 'plugin' ? (
        <>
          <div className="negozio__cerca">
            <input
              className="campo"
              placeholder="Cerca fra i plugin…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
            />
            <button className="tasto tasto--icona" onClick={caricaPlugin} title="Ricarica">↻</button>
          </div>
          {errorePlugin !== undefined ? (
            <div className="avviso">⚠ Il negozio non risponde: {errorePlugin}</div>
          ) : null}
          {plugin === undefined ? (
            <p className="misura negozio__vuoto">Carico il catalogo…</p>
          ) : pluginVisibili.length === 0 ? (
            <p className="misura negozio__vuoto">
              {cerca.trim() === '' ? 'Nessun plugin nel catalogo.' : 'Nessun plugin trovato.'}
            </p>
          ) : (
            <div className="negozio__lista">
              {pluginVisibili.map((p) => {
                const occupato = inCorso.has(p.id)
                return (
                  <div key={p.id} className="negozio__voce">
                    <div className="negozio__info">
                      <div className="negozio__nome">
                        {p.nome}
                        {p.installato ? (
                          <span className={`negozio__stato${p.abilitato ? ' negozio__stato--on' : ''}`}>
                            {p.abilitato ? 'attivo' : 'spento'}
                          </span>
                        ) : null}
                        <span className="negozio__mkt">{p.marketplace}</span>
                        {p.installazioni !== undefined ? (
                          <span className="misura">↧ {formattaInstallazioni(p.installazioni)}</span>
                        ) : null}
                      </div>
                      {p.descrizione !== '' ? <div className="negozio__desc">{p.descrizione}</div> : null}
                    </div>
                    <div className="negozio__azioni">
                      {p.installato ? (
                        <>
                          <button
                            className="tasto"
                            disabled={occupato}
                            onClick={() => void conEsito(p.id,
                              () => window.gestore.negozio.commutaPlugin(p.id, !p.abilitato), caricaPlugin)}
                          >
                            {p.abilitato ? 'Disattiva' : 'Attiva'}
                          </button>
                          <button
                            className="tasto tasto--fantasma"
                            disabled={occupato}
                            onClick={() => void conEsito(p.id,
                              () => window.gestore.negozio.disinstallaPlugin(p.id), caricaPlugin)}
                          >
                            Rimuovi
                          </button>
                        </>
                      ) : (
                        <button
                          className="tasto tasto--primario"
                          disabled={occupato}
                          onClick={() => void conEsito(p.id,
                            () => window.gestore.negozio.installaPlugin(p.id), caricaPlugin)}
                        >
                          {occupato ? 'Installo…' : 'Installa'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {cerca.trim() === '' && totaleFiltrati > TETTO ? (
                <p className="misura negozio__vuoto">
                  …e altri {totaleFiltrati - TETTO}. Cerca per nome per trovarli.
                </p>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {scheda === 'skill' ? (
        skill === undefined ? (
          <p className="misura negozio__vuoto">Carico…</p>
        ) : skill.length === 0 ? (
          <p className="misura negozio__vuoto">
            Nessuna skill installata. Le skill sono cartelle con dentro un <code>SKILL.md</code>,
            in <code>~/.claude/skills</code> o in <code>.claude/skills</code> del progetto.
          </p>
        ) : (
          <div className="negozio__lista">
            {skill.map((s) => {
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
                    <button
                      className="tasto"
                      disabled={occupato}
                      onClick={() => void conEsito(`skill:${s.nome}`,
                        () => window.gestore.negozio.commutaSkill(s.nome, !s.abilitata), caricaSkill)}
                    >
                      {s.abilitata ? 'Disattiva' : 'Attiva'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : null}

      {scheda === 'mcp' ? (
        cwd === undefined ? (
          <p className="misura negozio__vuoto">Apri una chat per vedere i suoi MCP.</p>
        ) : mcp === undefined ? (
          <p className="misura negozio__vuoto">Carico…</p>
        ) : mcp.length === 0 ? (
          <p className="misura negozio__vuoto">
            Nessun MCP configurato per questa cartella. Gli MCP di progetto stanno in
            <code> .claude.json</code>, sotto il progetto.
          </p>
        ) : (
          <div className="negozio__lista">
            {mcp.map((m) => {
              const occupato = inCorso.has(`mcp:${m.nome}`)
              return (
                <div key={m.nome} className="negozio__voce">
                  <div className="negozio__info">
                    <div className="negozio__nome">
                      {m.nome}
                      {!m.abilitato ? <span className="negozio__stato">spento</span> : null}
                    </div>
                    <div className="negozio__desc negozio__desc--mono">{m.come}</div>
                  </div>
                  <div className="negozio__azioni">
                    <button
                      className="tasto"
                      disabled={occupato || cwd === undefined}
                      onClick={() => void conEsito(`mcp:${m.nome}`,
                        () => window.gestore.negozio.commutaMcp(cwd, m.nome, !m.abilitato), caricaMcp)}
                    >
                      {m.abilitato ? 'Disattiva' : 'Attiva'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : null}

      <p className="misura negozio__pie">
        I plugin valgono per tutte le chat; le skill e gli MCP mostrati sono quelli della cartella
        che hai davanti. Le modifiche hanno effetto sulle chat aperte dal prossimo avvio.
      </p>
    </div>
  )
}
