import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import type { PianoFusione, VoceFusione, Azione, ModoWorkspace } from '../../main/cassaforte/fusione'

type Props = {
  cassaforteDiversa: boolean
  onChiudi: (fatto: boolean) => void
}

const ETICHETTA_AZIONE: Record<Azione, string> = {
  carica: 'porta sul Drive',
  scarica: 'porta qui',
  copia: 'tieni tutte e due (l’altra accanto)',
  salta: 'lascia com’è'
}

function quandoBreve(iso: string | undefined): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/** Le chat raggruppate per cartella di progetto: e' cosi' che uno le riconosce. */
function perCartella(voci: VoceFusione[]): { cartella: string; voci: VoceFusione[] }[] {
  const gruppi = new Map<string, VoceFusione[]>()
  for (const v of voci) {
    const k = v.cartella ?? '(cartella sconosciuta)'
    const g = gruppi.get(k) ?? []
    g.push(v)
    gruppi.set(k, g)
  }
  return [...gruppi.entries()]
    .map(([cartella, voci]) => ({ cartella, voci: [...voci].sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? '')) }))
    .sort((a, b) => b.voci.length - a.voci.length)
}

/** Le azioni che hanno senso per una voce, a seconda di dove sta. */
function azioniPossibili(v: VoceFusione, conCopia: boolean): Azione[] {
  if (v.dove === 'pc') return ['carica', 'salta']
  if (v.dove === 'drive') return ['scarica', 'salta']
  if (!v.diverse) return ['salta']
  return conCopia ? ['carica', 'scarica', 'copia', 'salta'] : ['carica', 'scarica', 'salta']
}

function descriviDove(v: VoceFusione): string {
  if (v.dove === 'pc') return 'c’è solo su questo PC'
  if (v.dove === 'drive') return 'c’è solo sul Drive'
  if (!v.diverse) return 'uguale di qua e di là'
  const kb = (n: number | undefined): string => (n === undefined ? '?' : `${Math.max(1, Math.round(n / 1024))} KB`)
  const quando = (t: number | undefined): string => (t === undefined ? '' : new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))
  return `diverse · PC ${kb(v.pc?.size)} ${quando(v.pc?.mtime)} · Drive ${kb(v.drive?.size)} ${quando(v.drive?.mtime)}`
}

function Elenco({ voci, scelte, conCopia, onScelta }: {
  voci: VoceFusione[]
  scelte: Record<string, Azione>
  conCopia: boolean
  onScelta: (percorso: string, a: Azione) => void
}): React.JSX.Element {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {voci.map((v) => {
        const possibili = azioniPossibili(v, conCopia)
        const attuale = scelte[v.percorso] ?? 'salta'
        return (
          <li key={v.percorso} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 6px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.percorso}>
                <strong>{v.etichetta}</strong>
                {v.quando !== undefined ? <span style={{ opacity: 0.6 }}> · {quandoBreve(v.quando)}</span> : null}
                {v.sotto !== undefined ? <span style={{ opacity: 0.6 }}> · {v.sotto}</span> : null}
              </div>
              <div style={{ opacity: 0.6, fontSize: 11 }}>{descriviDove(v)}</div>
            </div>
            {possibili.length === 1 ? (
              <span style={{ fontSize: 11, opacity: 0.6 }}>{ETICHETTA_AZIONE[possibili[0] as Azione]}</span>
            ) : (
              <select className="account__campo" style={{ fontSize: 12, padding: '2px 6px' }} value={attuale} onChange={(e) => onScelta(v.percorso, e.target.value as Azione)}>
                {possibili.map((a) => <option key={a} value={a}>{ETICHETTA_AZIONE[a]}</option>)}
              </select>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TastiGruppo({ voci, conCopia, onTutte }: { voci: VoceFusione[]; conCopia: boolean; onTutte: (a: Azione | 'predefinite') => void }): React.JSX.Element {
  const haPc = voci.some((v) => v.dove !== 'drive')
  const haDrive = voci.some((v) => v.dove !== 'pc')
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, alignItems: 'center' }}>
      <span style={{ opacity: 0.6 }}>tutte:</span>
      <button className="tasto tasto--mini" onClick={() => onTutte('predefinite')}>unisci (consigliato)</button>
      {haPc ? <button className="tasto tasto--mini" onClick={() => onTutte('carica')}>solo dal PC al Drive</button> : null}
      {haDrive ? <button className="tasto tasto--mini" onClick={() => onTutte('scarica')}>solo dal Drive al PC</button> : null}
      {conCopia ? <button className="tasto tasto--mini" onClick={() => onTutte('copia')}>le diverse: tieni tutte e due</button> : null}
      <button className="tasto tasto--mini" onClick={() => onTutte('salta')}>lascia tutto com’è</button>
    </div>
  )
}

/**
 * Fondere questo PC con il Drive collegato, scegliendo tutto.
 *
 * Tre tempi: la passphrase del Drive se la sua cassaforte e' un'altra; il
 * piano, con le scelte voce per voce e per gruppo; l'esecuzione e il conto.
 */
export function ModaleFusione({ cassaforteDiversa, onChiudi }: Props): React.JSX.Element {
  const [fase, setFase] = useState<'passphrase' | 'carico' | 'piano' | 'eseguo' | 'fatto' | 'errore'>(cassaforteDiversa ? 'passphrase' : 'carico')
  const [passphrase, setPassphrase] = useState('')
  const [piano, setPiano] = useState<PianoFusione | undefined>(undefined)
  const [scelte, setScelte] = useState<Record<string, Azione>>({})
  const [modoWs, setModoWs] = useState<ModoWorkspace>('unione')
  // Per ogni workspace: 'unisci' (qui + Drive), 'qui' (resta com'e' su questo PC), 'porta' (dal Drive, se e' solo la'), 'no' (non portarlo).
  const [sceltaWs, setSceltaWs] = useState<Record<string, 'unisci' | 'qui' | 'porta' | 'no'>>({})
  const escludiWs = useMemo(() => {
    const fuori: string[] = []
    for (const [nome, s] of Object.entries(sceltaWs)) if (s === 'qui' || s === 'no') fuori.push(nome)
    return fuori
  }, [sceltaWs])
  const [aperti, setAperti] = useState<Set<string>>(new Set(['chat']))
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [esito, setEsito] = useState<{ caricati: number; scaricati: number; copie: number; saltati: number } | undefined>(undefined)

  const carica = (pw?: string): void => {
    setFase('carico'); setMessaggio(undefined)
    void window.gestore.sync.anteprimaFusione(pw).then((r) => {
      if (!r.ok) {
        setMessaggio(r.messaggio)
        setFase(r.servePassphrase === true ? 'passphrase' : 'errore')
        return
      }
      setPiano(r.piano)
      const iniziali: Record<string, Azione> = {}
      for (const v of [...r.piano.chat, ...r.piano.assetto, ...r.piano.progetti.flatMap((p) => p.voci)]) iniziali[v.percorso] = v.predefinita
      setScelte(iniziali)
      setFase('piano')
    }).catch((e: unknown) => { setMessaggio(String(e)); setFase('errore') })
  }
  useEffect(() => { if (!cassaforteDiversa) carica() }, [])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape' && fase !== 'eseguo') onChiudi(fase === 'fatto') }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [fase, onChiudi])

  const imposta = (percorso: string, a: Azione): void => setScelte((s) => ({ ...s, [percorso]: a }))
  const impostaTutte = (voci: VoceFusione[], conCopia: boolean, a: Azione | 'predefinite'): void => {
    setScelte((s) => {
      const n = { ...s }
      for (const v of voci) {
        const possibili = azioniPossibili(v, conCopia)
        if (a === 'predefinite') n[v.percorso] = v.predefinita
        else if (a === 'copia') { if (v.diverse && conCopia) n[v.percorso] = 'copia' }
        else if (possibili.includes(a)) n[v.percorso] = a
        else n[v.percorso] = 'salta'
      }
      return n
    })
  }
  const commuta = (chiave: string): void => setAperti((s) => { const n = new Set(s); if (n.has(chiave)) n.delete(chiave); else n.add(chiave); return n })

  const conto = useMemo(() => {
    let carica = 0; let scarica = 0; let copia = 0
    for (const a of Object.values(scelte)) { if (a === 'carica') carica += 1; else if (a === 'scarica') scarica += 1; else if (a === 'copia') copia += 1 }
    return { carica, scarica, copia }
  }, [scelte])

  const esegui = (): void => {
    setFase('eseguo'); setMessaggio(undefined)
    void window.gestore.sync.eseguiFusione({ voci: scelte, workspace: { modo: modoWs, escludi: escludiWs } }, cassaforteDiversa ? passphrase : undefined)
      .then((r) => {
        if (!r.ok) { setMessaggio(r.messaggio); setFase('errore'); return }
        setEsito(r.esito); setFase('fatto')
      })
      .catch((e: unknown) => { setMessaggio(String(e)); setFase('errore') })
  }

  const testa = (
    <div className="dialogo__testa">
      <span className="serigrafia">Fondi questo PC con il Drive</span>
    </div>
  )

  // Sul body, non dentro chi lo apre: un pannello con `transform` fa da
  // contenitore a `position: fixed`, e il modale restava dentro e tagliato.
  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && fase !== 'eseguo') onChiudi(fase === 'fatto') }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        {testa}
        {fase === 'passphrase' ? (
          <>
            <p className="account__nota">La cassaforte di questo Drive è un’altra. Per leggere cosa c’è dentro serve la <strong>sua</strong> passphrase; fondendo, questo PC passerà a usare quella, e la sua cassaforte di adesso resterà messa da parte.</p>
            {messaggio !== undefined ? <div className="riga__stato">{messaggio}</div> : null}
            <input className="account__campo" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && passphrase !== '') carica(passphrase) }} placeholder="passphrase del Drive" aria-label="passphrase del Drive" autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="tasto" onClick={() => onChiudi(false)}>Annulla</button>
              <button className="tasto tasto--primario" disabled={passphrase === ''} onClick={() => carica(passphrase)}>Leggi il Drive</button>
            </div>
          </>
        ) : fase === 'carico' ? (
          <p className="account__nota">Leggo cosa c’è di qua e di là…</p>
        ) : fase === 'errore' ? (
          <>
            <div className="riga__stato">{messaggio ?? 'non riuscito'}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="tasto" onClick={() => onChiudi(false)}>Chiudi</button>
              <button className="tasto tasto--primario" onClick={() => (cassaforteDiversa ? setFase('passphrase') : carica())}>Riprova</button>
            </div>
          </>
        ) : fase === 'eseguo' ? (
          <p className="account__nota">Fondo: {conto.carica} da portare sul Drive, {conto.scarica} da portare qui, {conto.copia} da tenere in due versioni…</p>
        ) : fase === 'fatto' && esito !== undefined ? (
          <>
            <p className="account__nota"><strong>Fatto.</strong> {esito.caricati} file portati sul Drive, {esito.scaricati} portati qui, {esito.copie} tenuti in due versioni, {esito.saltati} non riusciti. I workspace sono stati {modoWs === 'unione' ? 'uniti' : modoWs === 'pc' ? 'tenuti come su questo PC' : 'presi dal Drive'}. Riavvia SierraDeck per vedere tutto.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="tasto tasto--primario" onClick={() => onChiudi(true)}>Chiudi</button>
            </div>
          </>
        ) : piano !== undefined ? (
          <>
            <p className="account__nota" style={{ margin: '0 0 8px' }}>
              {piano.email !== undefined ? <><strong>{piano.email}</strong> · </> : null}
              solo su questo PC <strong>{piano.totali.soloPc}</strong> · solo sul Drive <strong>{piano.totali.soloDrive}</strong> · diverse <strong>{piano.totali.diverse}</strong> · uguali <strong>{piano.totali.uguali}</strong>.
              Il predefinito è l’unione: per le chat vince la copia più lunga, per i file di progetto la più recente. Cambia quello che vuoi.
            </p>
            <p className="account__nota" style={{ margin: '0 0 8px', fontSize: 12 }}>
              Due cose separate: le <strong>chat</strong> sono le conversazioni (qui sotto, per cartella di progetto); i <strong>workspace</strong> sono le fasce che le raggruppano a schermo, e si decidono in fondo.
            </p>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {/* Chat, per cartella di progetto */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="serigrafia">Chat ({piano.chat.length})</span>
                  <TastiGruppo voci={piano.chat} conCopia={false} onTutte={(a) => impostaTutte(piano.chat, false, a)} />
                </div>
                {piano.chat.length === 0 ? <p className="account__nota">Nessuna chat da fondere.</p> : null}
                {perCartella(piano.chat).map((g) => {
                  const chiave = `chat:${g.cartella}`
                  const soloPc = g.voci.filter((v) => v.dove === 'pc').length
                  const soloDrive = g.voci.filter((v) => v.dove === 'drive').length
                  const diverse = g.voci.filter((v) => v.diverse).length
                  return (
                    <div key={chiave} style={{ margin: '6px 0 0 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <button className="account__link" onClick={() => commuta(chiave)} title={g.cartella}>
                          {aperti.has(chiave) ? '▾' : '▸'} {g.cartella} · {g.voci.length} chat
                          <span style={{ opacity: 0.6 }}>{soloPc > 0 ? ` · ${soloPc} solo qui` : ''}{soloDrive > 0 ? ` · ${soloDrive} solo sul Drive` : ''}{diverse > 0 ? ` · ${diverse} diverse` : ''}</span>
                        </button>
                        <TastiGruppo voci={g.voci} conCopia={false} onTutte={(a) => impostaTutte(g.voci, false, a)} />
                      </div>
                      {aperti.has(chiave) ? <Elenco voci={g.voci} scelte={scelte} conCopia={false} onScelta={imposta} /> : null}
                    </div>
                  )
                })}
              </section>
              {/* Progetti */}
              {piano.progetti.map((p) => (
                <section key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="account__link" onClick={() => commuta(p.id)}>
                      {aperti.has(p.id) ? '▾' : '▸'} Progetto «{p.nome}» · solo PC {p.soloPc} · solo Drive {p.soloDrive} · diverse {p.diverse} · uguali {p.uguali}
                      {p.cartellaPc === undefined ? ' · non ancora su questo PC' : ''}
                    </button>
                    <TastiGruppo voci={p.voci} conCopia onTutte={(a) => impostaTutte(p.voci, true, a)} />
                  </div>
                  {aperti.has(p.id) ? <Elenco voci={p.voci} scelte={scelte} conCopia onScelta={imposta} /> : null}
                </section>
              ))}
              {/* Assetto */}
              {piano.assetto.length > 0 ? (
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="account__link" onClick={() => commuta('assetto')}>{aperti.has('assetto') ? '▾' : '▸'} Impostazioni e salvataggi ({piano.assetto.length})</button>
                  </div>
                  {aperti.has('assetto') ? <Elenco voci={piano.assetto} scelte={scelte} conCopia={false} onScelta={imposta} /> : null}
                </section>
              ) : null}
              {/* Workspace */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="serigrafia">Workspace</span>
                  <select className="account__campo" style={{ fontSize: 12, padding: '2px 6px' }} value={modoWs} onChange={(e) => setModoWs(e.target.value as ModoWorkspace)}>
                    <option value="unione">unisci: decido workspace per workspace (consigliato)</option>
                    <option value="pc">tieni tutti quelli di questo PC, ignora quelli del Drive</option>
                    <option value="drive">prendi tutti quelli del Drive, al posto di questi</option>
                  </select>
                </div>
                <p className="account__nota" style={{ fontSize: 12, margin: '6px 0' }}>
                  Un workspace è una fascia con dentro delle chat. «Unisci» vuol dire: le chat che stanno in quel workspace sul Drive entrano nello stesso workspace qui, accanto a quelle che ci sono già; niente si toglie. Un workspace che esiste solo sul Drive viene creato qui con le sue chat.
                </p>
                {modoWs === 'unione' ? (
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {piano.workspace.map((w) => {
                      const scelta = sceltaWs[w.nome] ?? (w.dove === 'drive' ? 'porta' : 'unisci')
                      return (
                        <li key={w.nome} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 6px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
                          <div>
                            <strong>{w.nome}</strong>
                            <span style={{ opacity: 0.6 }}>
                              {w.dove === 'entrambi' ? ` · qui ${w.chatPc} chat, sul Drive ${w.chatDrive}` : w.dove === 'pc' ? ` · solo qui, ${w.chatPc} chat` : ` · solo sul Drive, ${w.chatDrive} chat`}
                            </span>
                          </div>
                          {w.dove === 'pc' ? (
                            <span style={{ fontSize: 11, opacity: 0.6 }}>resta com’è</span>
                          ) : (
                            <select className="account__campo" style={{ fontSize: 12, padding: '2px 6px' }} value={scelta} onChange={(e) => setSceltaWs((s) => ({ ...s, [w.nome]: e.target.value as 'unisci' | 'qui' | 'porta' | 'no' }))}>
                              {w.dove === 'entrambi' ? (
                                <>
                                  <option value="unisci">unisci: qui + le chat del Drive</option>
                                  <option value="qui">tieni com’è qui, ignora il Drive</option>
                                </>
                              ) : (
                                <>
                                  <option value="porta">crealo qui con le sue chat</option>
                                  <option value="no">non portarlo</option>
                                </>
                              )}
                            </select>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </section>
              {piano.cassaforteDiversa ? (
                <p className="account__nota">🔒 Fondendo, questo PC passa alla cassaforte del Drive: le sue chat e i suoi file salgono cifrati con quella chiave. La cassaforte di adesso resta messa da parte, non cancellata.</p>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Sul Drive: {conto.carica} · qui: {conto.scarica} · in due versioni: {conto.copia}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="tasto" onClick={() => onChiudi(false)}>Annulla</button>
                <button className="tasto tasto--primario" onClick={esegui}>Fondi</button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  , document.body)
}
