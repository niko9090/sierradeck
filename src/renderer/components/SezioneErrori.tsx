import { useEffect, useState } from 'react'
import { oraBreve, type VoceErrore } from '@shared/storico-errori'
import { nomeDaMostrare } from '@shared/nome-pc'
import { Aiuto } from './Aiuto'

/** Quante voci si vedono prima di «Mostra tutti». */
const PRIME = 5

type PcScelta = { id: string; nome: string }

/**
 * La voce «Errori» delle Impostazioni (0.81.0): lo storico degli errori di
 * questo PC, programma e servizio insieme, «Copia» per incollarlo a una chat e
 * «Manda al PC di sviluppo», scelto qui fra i PC conosciuti. Testi corti, il
 * resto dietro i «?».
 */
export function SezioneErrori({ pcSviluppo, scegliPc }: { pcSviluppo?: string; scegliPc?: (id: string | undefined) => void }): React.JSX.Element {
  const [storico, setStorico] = useState<{ voci: VoceErrore[]; testo: string; arrivi?: string } | undefined>(undefined)
  const [tutti, setTutti] = useState(false)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const [pc, setPc] = useState<PcScelta[]>([])
  const [manda, setManda] = useState(false)
  const rileggi = (): void => { void window.gestore.errori.storico().then(setStorico).catch(() => setNota('Lo storico non si legge adesso: riprova tra poco.')) }
  useEffect(rileggi, [])
  useEffect(() => {
    // Questo PC e gli altri della stessa cassaforte: il PC di sviluppo può essere anche questo.
    void Promise.all([window.gestore.posta.identita(), window.gestore.posta.pc()])
      .then(([io, altri]) => setPc([
        { id: io.id, nome: `${nomeDaMostrare(io) || 'Questo PC'} (questo)` },
        ...altri.filter((b) => b.pcId !== io.id).map((b) => ({ id: b.pcId, nome: nomeDaMostrare(b) || b.pcId }))
      ]))
      .catch(() => undefined)
  }, [])
  const copia = (): void => {
    if (storico === undefined) return
    void navigator.clipboard.writeText(storico.testo)
      .then(() => setNota('Copiato: incollalo nella chat che deve correggerli.'))
      .catch(() => setNota('Non riesco a copiare: riprova.'))
  }
  const mandaOra = (): void => {
    setManda(true)
    setNota(undefined)
    void window.gestore.errori.manda()
      .then((e) => setNota(e.messaggio))
      .catch(() => setNota('Non mandati: il programma non ha risposto.'))
      .finally(() => setManda(false))
  }
  const voci = storico?.voci ?? []
  const volte = voci.reduce((s, v) => s + v.volte, 0)
  const mostrate = tutti ? voci : voci.slice(0, PRIME)
  // Il PC scelto può non essere più fra quelli conosciuti: si vede lo stesso, con il suo id.
  const scelte = pcSviluppo !== undefined && !pc.some((x) => x.id === pcSviluppo) ? [...pc, { id: pcSviluppo, nome: 'PC scelto prima (non si vede adesso)' }] : pc
  return (
    <div className="errori">
      <div className="impostazioni__riga">
        <span className="con-aiuto">
          {storico === undefined ? 'Errori…' : voci.length === 0 ? 'Nessun errore registrato' : `${voci.length} ${voci.length === 1 ? 'errore' : 'errori diversi'}, ${volte} ${volte === 1 ? 'volta' : 'volte'}`}
          <Aiuto di="Errori">Gli errori del programma e del servizio degli autopiloti su questo PC: quando, dove, cosa si stava facendo, il messaggio e il punto del codice. Gli stessi errori ripetuti sono una riga sola con il conteggio. Password, chiavi, gettoni e il nome del PC sono tolti prima di salvare.</Aiuto>
        </span>
        <button className="tasto" onClick={rileggi}>Aggiorna</button>
        <button className="tasto" onClick={copia} disabled={voci.length === 0}>Copia</button>
        <Aiuto di="Copia">Copia tutto lo storico in un testo pronto da incollare in una chat: chi lo legge sa cosa è successo e dove guardare.</Aiuto>
      </div>
      {mostrate.length > 0 ? (
        <ul className="errori__elenco">
          {mostrate.map((v) => (
            <li key={`${v.dove}|${v.quando}|${v.messaggio}`} className="errori__voce" title={[v.cosa !== undefined ? `Cosa si faceva: ${v.cosa}` : '', v.punto !== undefined ? `Punto: ${v.punto}` : ''].filter(Boolean).join('\n')}>
              <span className="errori__quando">{oraBreve(v.ultima)}{v.volte > 1 ? ` · ${v.volte} volte` : ''}</span>
              <span className="errori__messaggio">{v.messaggio}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {voci.length > PRIME ? <button className="tasto" onClick={() => setTutti(!tutti)}>{tutti ? 'Mostra meno' : `Mostra tutti (${voci.length})`}</button> : null}
      <div className="impostazioni__riga">
        <label className="con-aiuto">PC di sviluppo
          <select value={pcSviluppo ?? ''} onChange={(e) => scegliPc?.(e.target.value === '' ? undefined : e.target.value)}>
            <option value="">— scegli il PC —</option>
            {scelte.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        <button className="tasto" onClick={mandaOra} disabled={manda || pcSviluppo === undefined || voci.length === 0}>{manda ? 'Mando…' : 'Manda al PC di sviluppo'}</button>
        <Aiuto di="Manda al PC di sviluppo">Manda lo storico al PC scelto, firmato con la chiave di casa. Là arriva nella cartella di SierraDeck, in .sierradeck/errori-arrivati, che non va mai su GitHub: chi corregge il programma lo trova lì.</Aiuto>
      </div>
      {storico?.arrivi !== undefined ? (
        <div className="impostazioni__nota con-aiuto">{storico.arrivi}
          <Aiuto di="Errori arrivati">Su questo PC di sviluppo gli errori arrivati diventano da soli un lavoro dell’autopilota «Errori arrivati» nel workspace di SierraDeck. Prima di toccare il codice ti manda un riepilogo, con una notifica sola. Poi corregge, con test e Revisione, e pubblica una release che non installa. Gli arrivi vicini vanno nello stesso lavoro. Se la settimana del piano è oltre l’80%, o se un altro autopilota lavora già su SierraDeck, aspetta e riparte da solo. A lavoro finito i file vanno nel recupero per 30 giorni.</Aiuto>
        </div>
      ) : null}
      {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
    </div>
  )
}
