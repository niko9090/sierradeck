import { useCallback, useEffect, useState } from 'react'

/**
 * «PIN delle chat» nelle Impostazioni (0.49.0). Facoltativo: spento finché
 * non si imposta un PIN. Tutto quello che si sceglie qui vale anche per il
 * telefono e per gli altri PC che guardano le chat di questo PC: il PIN lo
 * controlla sempre questo PC.
 */

type Stato = Awaited<ReturnType<typeof window.gestore.pin.stato>>

const INATTIVITA = [5, 15, 30, 60, 240]

export function SezionePin(): React.JSX.Element {
  const [s, setS] = useState<Stato | undefined>(undefined)
  const [workspace, setWorkspace] = useState<string[]>([])
  const [nuovo, setNuovo] = useState('')
  const [conferma, setConferma] = useState('')
  const [attuale, setAttuale] = useState('')
  const [pass, setPass] = useState('')
  const [nota, setNota] = useState<{ ok: boolean; testo: string } | undefined>(undefined)
  const leggi = useCallback((): void => {
    void window.gestore.pin.stato().then(setS).catch(() => undefined)
    void window.gestore.workspace.stato().then((w) => setWorkspace(w.nomi)).catch(() => undefined)
  }, [])
  useEffect(() => { leggi(); return window.gestore.pin.suCambiato(leggi) }, [leggi])

  const imposta = (): void => {
    if (nuovo !== conferma) { setNota({ ok: false, testo: 'I due PIN non sono uguali.' }); return }
    void window.gestore.pin.imposta(nuovo, s?.impostato === true ? attuale : undefined).then((e) => {
      setNota(e.ok ? { ok: true, testo: s?.impostato === true ? 'PIN cambiato.' : 'PIN impostato e acceso.' } : { ok: false, testo: e.errore })
      if (e.ok) { setNuovo(''); setConferma(''); setAttuale('') }
    })
  }
  const azzera = (): void => {
    void window.gestore.pin.azzera(pass).then((e) => {
      setNota(e.ok ? { ok: true, testo: 'PIN tolto. Le chat e i workspace che avevi protetto restano segnati: impostando un PIN nuovo tornano protetti.' } : { ok: false, testo: e.errore })
      if (e.ok) setPass('')
    })
  }

  return (
    <section className="impostazioni__gruppo">
      <h4>PIN delle chat</h4>
      <div className="impostazioni__nota">
        Facoltativo. Con il PIN acceso, una chat (o un intero workspace) che proteggi mostra un lucchetto al posto del terminale: niente testo e niente casella per scrivere finché non metti il PIN. Vale qui, sul telefono (app e pagina) e quando un altro PC la guarda: il PIN lo controlla sempre questo PC. Dopo il tempo di inattività scelto qui sotto la chat si richiude da sola, e si richiude tutto quando chiudi il programma. Negli elenchi, nelle Domande, nella Salute e nelle Istruzioni degli autopiloti resta il nome della chat, ma non il suo contenuto. La chat intanto continua a lavorare: Claude Code, gli autopiloti e le loro istruzioni vanno avanti, perché il PIN chiude la vista e la tastiera delle persone, non il lavoro.
      </div>
      <div className="impostazioni__nota">
        <b>Cosa protegge e cosa no, detto chiaro.</b> Protegge da chi è davanti a uno schermo: qualcuno al tuo PC mentre sei via, il telefono in mano ad altri, un altro PC della casa. <b>Non</b> protegge i file delle conversazioni sul disco (le cartelle di Claude Code, i file .jsonl): chi può usare il tuo account di Windows li legge lo stesso, e lì serve la password di Windows o la cifratura del disco. Non cifra niente: è una serratura sulla vista. Del PIN si salva solo un’impronta (scrypt con un sale), mai il PIN; dopo tre tentativi sbagliati si aspetta, 30 secondi e poi il doppio ogni volta fino a un’ora, contando insieme i tentativi da qui, dal telefono e dagli altri PC.
      </div>

      {s === undefined ? <div className="impostazioni__nota">Leggo…</div> : (
        <>
          <label className="impostazioni__riga">
            <span>PIN acceso</span>
            <input type="checkbox" checked={s.attivo} disabled={!s.impostato}
              onChange={(e) => { void window.gestore.pin.attiva(e.target.checked).then((r) => { if (!r.ok) setNota({ ok: false, testo: r.errore }) }) }} />
          </label>
          {!s.impostato ? <div className="impostazioni__nota">Prima imposta un PIN qui sotto: si accende da solo.</div> : null}

          <div className="impostazioni__riga" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span>{s.impostato ? 'Cambia il PIN' : 'Imposta il PIN'}</span>
            {s.impostato ? <input className="campo" type="password" inputMode="numeric" placeholder="PIN di adesso" value={attuale} onChange={(e) => setAttuale(e.target.value)} style={{ width: 120 }} /> : null}
            <input className="campo" type="password" inputMode="numeric" maxLength={8} placeholder="nuovo, 4-8 cifre" value={nuovo} onChange={(e) => setNuovo(e.target.value.replace(/\D/g, ''))} style={{ width: 130 }} />
            <input className="campo" type="password" inputMode="numeric" maxLength={8} placeholder="ripetilo" value={conferma} onChange={(e) => setConferma(e.target.value.replace(/\D/g, ''))} style={{ width: 110 }} />
            <button className="tasto" disabled={nuovo.length < 4} onClick={imposta}>{s.impostato ? 'Cambia' : 'Imposta'}</button>
          </div>

          <label className="impostazioni__riga">
            <span>Richiudi dopo</span>
            <select className="campo" value={s.inattivitaMin} onChange={(e) => { void window.gestore.pin.inattivita(Number(e.target.value)) }}>
              {[...new Set([...INATTIVITA, s.inattivitaMin])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} minuti` : `${m / 60} ${m === 60 ? 'ora' : 'ore'}`} di inattività{m === 15 ? ' (predefinito)' : ''}</option>
              ))}
            </select>
          </label>
          <div className="impostazioni__nota">«Inattività» vuol dire nessun tasto e nessun clic su quella chat (o, dal telefono e dagli altri PC, nessun messaggio e nessuna scelta mandati): guardarla soltanto non la tiene aperta.</div>

          <div className="impostazioni__riga" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span>Workspace protetti</span>
            {workspace.length === 0 ? <span className="impostazioni__nota">nessun workspace</span> : workspace.map((w) => (
              <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={s.workspace.includes(w)} disabled={!s.attivo && !s.workspace.includes(w)}
                  onChange={(e) => { void window.gestore.pin.proteggiWorkspace(w, e.target.checked) }} />
                {w}
              </label>
            ))}
          </div>
          <div className="impostazioni__nota">
            Ogni chat di un workspace protetto è protetta, anche quelle che aprirai. Una chat singola si protegge dal tasto 🔐 nella testata del suo riquadro (anche con il tasto destro). Chat protette una per una: {s.chat.length}.
          </div>

          <div className="impostazioni__riga">
            <span>Richiudi tutte adesso</span>
            <button className="tasto" onClick={() => { void window.gestore.pin.richiudi().then(() => setNota({ ok: true, testo: 'Richiuse tutte, qui, sul telefono e per gli altri PC.' })) }}>Richiudi</button>
          </div>

          {s.impostato ? (
            <div className="impostazioni__riga" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span>PIN dimenticato</span>
              <input className="campo" type="password" placeholder="password principale della cassaforte" value={pass} onChange={(e) => setPass(e.target.value)} style={{ width: 260 }} />
              <button className="tasto" disabled={pass === ''} onClick={azzera}>Togli il PIN</button>
            </div>
          ) : null}
          {s.impostato ? <div className="impostazioni__nota">Con la password principale della cassaforte (quella del Drive di SierraDeck, non il PIN) si toglie il PIN; poi se ne imposta uno nuovo. Anche qui valgono le attese dopo i tentativi sbagliati.</div> : null}
        </>
      )}
      {nota !== undefined ? <div className="riga__stato" style={{ color: nota.ok ? 'var(--verde)' : 'var(--ambra)' }}>{nota.testo}</div> : null}
    </section>
  )
}
