import { useEffect, useState } from 'react'
import { Aiuto } from './Aiuto'
import { BOZZA_VUOTA, NOME_TIPO, aggiungi, carica, tipiCredenziale, togli, type ApiCredenziali, type Bozza, type Vista } from '../credenziali-rete'
import type { VoceCredenziale } from '@shared/aiuto-credenziali'

/** L'elenco, senza valori: solo nome, tipo e a cosa serve. Si disegna anche senza finestra (test). */
export function ElencoCredenziali({ voci, onTogli }: { voci: readonly VoceCredenziale[]; onTogli?: (nome: string) => void }): React.JSX.Element {
  if (voci.length === 0) return <p className="impostazioni__nota">Nessuna credenziale salvata.</p>
  return (
    <ul className="impostazioni__elenco">
      {voci.map((v) => (
        <li key={v.nome} className="impostazioni__riga">
          <span><strong>{v.nome}</strong> · {NOME_TIPO[v.tipo]}{v.serveA.length > 0 ? ` · serve a ${v.serveA.join(', ')}` : ''}</span>
          {onTogli !== undefined ? <button className="tasto" onClick={() => onTogli(v.nome)}>Togli</button> : null}
        </li>
      ))}
    </ul>
  )
}

export function SezioneCredenzialiRete({ api }: { api?: ApiCredenziali }): React.JSX.Element {
  const a = api ?? window.gestore.credenziali
  const [vista, setVista] = useState<Vista | undefined>(undefined)
  const [bozza, setBozza] = useState<Bozza>(BOZZA_VUOTA)
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)

  useEffect(() => { void carica(a).then(setVista).catch(() => setMessaggio('Non riesco a leggere l’elenco.')) }, [a])

  const salva = async (): Promise<void> => {
    const r = await aggiungi(a, bozza)
    if (!r.ok) { setMessaggio(r.messaggio); return }
    setBozza(BOZZA_VUOTA) // il valore sparisce dal campo appena salvato
    setMessaggio('Salvata.')
    if (r.vista !== undefined) setVista(r.vista)
  }
  const rimuovi = async (nome: string): Promise<void> => {
    if (!window.confirm(`Togliere «${nome}»? I lavori che la chiedono non la riceveranno più. Non si può annullare.`)) return
    const r = await togli(a, nome)
    setMessaggio(r.ok ? 'Tolta.' : 'Non l’ho trovata.')
    setVista(r.vista)
  }

  return (
    <div className="impostazioni__gruppo-interno">
      <h5 className="con-aiuto">Credenziali di rete
        <Aiuto di="Credenziali di rete">
          Chiavi e password che un lavoro mandato a un altro PC può ricevere. Il lavoro le chiede <b>per nome</b>, scrivendo «credenziale:nome».
          Il valore sta nella cassaforte cifrata e viaggia cifrato fino al PC che aiuta; <b>non si rivede mai</b> dopo averlo salvato, non finisce
          nei registri né nei riepiloghi. Per cambiarlo, salva di nuovo con lo stesso nome. Con la cassaforte chiusa non si può né leggere né salvare.
        </Aiuto>
      </h5>
      {vista !== undefined && !vista.aperta ? <p className="impostazioni__nota">La cassaforte è chiusa: sbloccala con la passphrase.</p> : null}
      <ElencoCredenziali voci={vista?.voci ?? []} onTogli={(n) => { void rimuovi(n) }} />
      <label className="impostazioni__riga"><span>Nome</span>
        <input className="campo" value={bozza.nome} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} /></label>
      <label className="impostazioni__riga"><span>Tipo</span>
        <select className="campo" value={bozza.tipo} onChange={(e) => setBozza({ ...bozza, tipo: e.target.value as Bozza['tipo'] })}>
          {tipiCredenziale().map((t) => <option key={t} value={t}>{NOME_TIPO[t]}</option>)}
        </select></label>
      <label className="impostazioni__riga"><span>Serve a (facoltativo)</span>
        <input className="campo" value={bozza.serveA} onChange={(e) => setBozza({ ...bozza, serveA: e.target.value })} /></label>
      <label className="impostazioni__riga"><span>Valore</span>
        <input className="campo" type="password" autoComplete="off" value={bozza.valore} onChange={(e) => setBozza({ ...bozza, valore: e.target.value })} /></label>
      <div className="impostazioni__riga">
        <button className="tasto" onClick={() => { void salva() }}>Aggiungi</button>
        {messaggio !== undefined ? <span role="status">{messaggio}</span> : null}
      </div>
    </div>
  )
}
