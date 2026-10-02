import { useCallback, useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { notaCorreggi, testoEsito, type Istruzione } from '@shared/istruzioni-autopilota'
import { ResaMarkdown } from './PannelloQuaderno'

/**
 * La linguetta «Istruzioni» (0.41.0): quello che l'autopilota ha scritto alle
 * sue chat, **intero**, dalla più recente.
 *
 * Nicholas (02/10): «quello che scrive l'autopilota in chat vorrei vederlo in
 * un tab qui sotto così da capire meglio come ragiona e vedere se ha scritto
 * cose sbagliate». Nella chat si vede solo «Leggi ed esegui le istruzioni in
 * .sierradeck/consegne/c-5.md»: qui c'è il contenuto di quel file, salvato dal
 * servizio quando l'ha deciso (i file si puliscono dopo sette giorni), con
 * l'ora, la chat, il perché e com'è andata. Il testo si seleziona e si copia;
 * il Markdown si disegna senza HTML (lo stesso del quaderno). «Correggi»
 * scrive all'autopilota una nota legata a quell'istruzione.
 */

function quando(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function Voce({ i, autopilota, aperta, onCorretto }: { i: Istruzione; autopilota: Autopilota; aperta: boolean; onCorretto: () => void }): React.JSX.Element {
  const [correggi, setCorreggi] = useState(false)
  const [nota, setNota] = useState('')
  const [invio, setInvio] = useState(false)
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const e = testoEsito(i.esito)
  const chat = autopilota.chats.length > 1
    ? `${i.chatTitolo} · ${i.chatId === autopilota.id ? 'chat principale' : `chat ${autopilota.chats.findIndex((c) => c.id === i.chatId) + 1}`}`
    : i.chatTitolo
  const prima = i.testo.split('\n').find((r) => r.trim() !== '')?.trim() ?? ''
  const manda = (): void => {
    if (nota.trim() === '' || invio) return
    setInvio(true)
    void window.gestore.autopilota.dialoga(autopilota.id, notaCorreggi(i, nota))
      .then(() => { setNota(''); setCorreggi(false); setEsito('Mandata: la trovi nella chat con lui, qui sopra, con la sua risposta.'); onCorretto() })
      .catch((err: unknown) => setEsito(`Non mandata: ${String(err)}`))
      .finally(() => setInvio(false))
  }
  return (
    <details className="istruzione" open={aperta}>
      <summary className="istruzione__testa">
        <span className="misura istruzione__quando">{quando(i.quando)}</span>
        <span className="istruzione__chat" title="La chat a cui è stata scritta">→ {chat}</span>
        <span className={`istruzione__esito istruzione__esito--${e.tono}`} title={e.titolo}>{e.breve}</span>
        {i.cosa === 'interrompi' ? <span className="istruzione__prima">ha interrotto la chat</span> : <span className="istruzione__prima">{prima}</span>}
      </summary>
      {i.perche !== undefined ? (
        <div className="istruzione__perche"><span className="serigrafia">perché</span> {i.perche}</div>
      ) : null}
      {i.cosa === 'interrompi' ? (
        <p className="diario__vuoto">Nessun testo: ha fermato la chat (Esc), per esempio perché l’hai fermato tu o ha cambiato strada.</p>
      ) : (
        <div className="istruzione__corpo">
          <ResaMarkdown testo={i.testo} />
        </div>
      )}
      <div className="istruzione__azioni">
        {i.cosa === 'scrivi' ? (
          <button className="tasto tasto--mini" title="Copia il testo intero dell’istruzione, così com’è" onClick={() => { void navigator.clipboard.writeText(i.testo).then(() => setEsito('Copiata.')).catch(() => setEsito('Non sono riuscito a copiarla: selezionala e usa Ctrl+C.')) }}>Copia</button>
        ) : null}
        <button className="tasto tasto--mini" title="Scrivi all’autopilota cosa c’è di sbagliato in questa istruzione: la nota va nella chat con lui, con l’ora e l’inizio dell’istruzione, così sa a quale ti riferisci" onClick={() => setCorreggi((v) => !v)}>Correggi</button>
        {esito !== undefined ? <span className="istruzione__nota">{esito}</span> : null}
      </div>
      {correggi ? (
        <div className="istruzione__correggi">
          <textarea
            className="campo"
            rows={3}
            value={nota}
            autoFocus
            placeholder="Cosa c’è di sbagliato, o cosa doveva scrivere invece. Ctrl+Invio manda."
            onChange={(ev) => setNota(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); manda() } }}
          />
          <button className="tasto tasto--primario" disabled={invio || nota.trim() === ''} onClick={manda}>Manda la correzione</button>
        </div>
      ) : null}
    </details>
  )
}

export function IstruzioniAutopilota({ autopilota, onCambiato }: { autopilota: Autopilota; onCambiato: () => void }): React.JSX.Element {
  const [lista, setLista] = useState<Istruzione[] | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const leggi = useCallback((): void => {
    window.gestore.autopilota.istruzioni(autopilota.id)
      .then((l) => { setLista(l); setErrore(undefined) })
      .catch((err: unknown) => setErrore(String(err)))
  }, [autopilota.id])
  useEffect(() => {
    leggi()
    const h = setInterval(leggi, 3000)
    return () => clearInterval(h)
  }, [leggi])
  return (
    <div className="diario__voci istruzioni">
      <p className="istruzioni__spiega">
        Quello che l’autopilota ha scritto alle sue chat, per intero e dalla più recente. Nella chat spesso vedi solo «Leggi ed esegui le istruzioni in …»: il testo vero è questo.
        Per ognuna trovi l’ora, la chat, il perché della mossa e com’è andata: «in coda» (decisa, non ancora scritta), «consegnata» (scritta nella chat), «partita» (la chat si è messa al lavoro), «non partita» o «mai arrivata» (un guasto, annotato nel suo diario).
        Se qualcosa è sbagliato, «Correggi» gli scrive una nota legata a quell’istruzione.
      </p>
      {errore !== undefined && lista === undefined ? <p className="diario__vuoto">Non riesco a leggere le istruzioni: {errore}</p> : null}
      {lista === undefined && errore === undefined ? <p className="diario__vuoto">Leggo le istruzioni…</p> : null}
      {lista !== undefined && lista.length === 0 ? (
        <p className="diario__vuoto">
          Ancora nessuna istruzione salvata. Si salvano dalla 0.41.0 in poi, nel momento in cui l’autopilota le decide: quelle mandate prima non ci sono.
        </p>
      ) : null}
      {(lista ?? []).map((i, k) => <Voce key={i.id} i={i} autopilota={autopilota} aperta={k === 0} onCorretto={onCambiato} />)}
    </div>
  )
}
