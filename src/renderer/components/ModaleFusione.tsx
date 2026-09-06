import { useEffect, useMemo, useState } from 'react'
import type { PianoFusione, VoceFusione, Azione, ModoWorkspace } from '../../main/cassaforte/fusione'

type Props = {
  cassaforteDiversa: boolean
  onChiudi: (fatto: boolean) => void
}

const ETICHETTA_AZIONE: Record<Azione, string> = {
  carica: 'PC → Drive',
  scarica: 'Drive → PC',
  copia: 'tutte e due (copia accanto)',
  salta: 'lascia com’è'
}

/** Le azioni che hanno senso per una voce, a seconda di dove sta. */
function azioniPossibili(v: VoceFusione, conCopia: boolean): Azione[] {
  if (v.dove === 'pc') return ['carica', 'salta']
  if (v.dove === 'drive') return ['scarica', 'salta']
  if (!v.diverse) return ['salta']
  return conCopia ? ['carica', 'scarica', 'copia', 'salta'] : ['carica', 'scarica', 'salta']
}

function descriviDove(v: VoceFusione): string {
  if (v.dove === 'pc') return 'solo su questo PC'
  if (v.dove === 'drive') return 'solo sul Drive'
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
                <strong>{v.etichetta}</strong>{v.sotto !== undefined ? <span style={{ opacity: 0.6 }}> · {v.sotto}</span> : null}
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
      <button className="tasto tasto--mini" onClick={() => onTutte('predefinite')}>unione (predefinito)</button>
      {haPc ? <button className="tasto tasto--mini" onClick={() => onTutte('carica')}>solo PC → Drive</button> : null}
      {haDrive ? <button className="tasto tasto--mini" onClick={() => onTutte('scarica')}>solo Drive → PC</button> : null}
      {conCopia ? <button className="tasto tasto--mini" onClick={() => onTutte('copia')}>le diverse: tutte e due</button> : null}
      <button className="tasto tasto--mini" onClick={() => onTutte('salta')}>lascia tutto</button>
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
  const [escludiWs, setEscludiWs] = useState<Set<string>>(new Set())
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
    void window.gestore.sync.eseguiFusione({ voci: scelte, workspace: { modo: modoWs, escludi: [...escludiWs] } }, cassaforteDiversa ? passphrase : undefined)
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

  return (
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
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {/* Chat */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button className="account__link" onClick={() => commuta('chat')}>{aperti.has('chat') ? '▾' : '▸'} Chat ({piano.chat.length})</button>
                  <TastiGruppo voci={piano.chat} conCopia={false} onTutte={(a) => impostaTutte(piano.chat, false, a)} />
                </div>
                {aperti.has('chat') ? (piano.chat.length === 0 ? <p className="account__nota">Nessuna chat da fondere.</p> : <Elenco voci={piano.chat} scelte={scelte} conCopia={false} onScelta={imposta} />) : null}
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
                    <option value="unione">unione: i workspace di qua e di là, chat per chat</option>
                    <option value="pc">tieni quelli di questo PC</option>
                    <option value="drive">prendi quelli del Drive</option>
                  </select>
                </div>
                {modoWs === 'unione' ? (
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {piano.workspace.map((w) => (
                      <li key={w.nome} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input type="checkbox" checked={!escludiWs.has(w.nome)} onChange={() => setEscludiWs((s) => { const n = new Set(s); if (n.has(w.nome)) n.delete(w.nome); else n.add(w.nome); return n })} />
                          <strong>{w.nome}</strong>
                        </label>
                        <span style={{ opacity: 0.6 }}>
                          {w.dove === 'entrambi' ? `di qua ${w.chatPc} chat, di là ${w.chatDrive}` : w.dove === 'pc' ? `solo su questo PC (${w.chatPc} chat)` : `solo sul Drive (${w.chatDrive} chat)`}
                          {escludiWs.has(w.nome) ? ' · escluso: resta com’è qui' : ''}
                        </span>
                      </li>
                    ))}
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
  )
}
