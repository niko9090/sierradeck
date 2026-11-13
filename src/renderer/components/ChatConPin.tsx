import { useCallback, useEffect, useRef, useState } from 'react'
import { workspaceCorrente } from '../workspace-corrente'
import { apriMenuContestuale } from '../menu-contestuale'

/**
 * Il PIN delle chat (0.49.0) sullo schermo di questo PC.
 *
 * Una chat protetta e non sbloccata mostra la copertura con il lucchetto al
 * posto del terminale: il terminale resta acceso sotto (Claude Code, gli
 * autopiloti e le consegne continuano a lavorare), ma non si vede e non
 * riceve tasti (`inert`). Lo stato lo decide il guardiano nel processo
 * principale, lo stesso che risponde al telefono e agli altri PC.
 */

export type VistaPin = { protetta: boolean; chiusa: boolean }

/**
 * Ogni quanto si rilegge il PIN di una chat (0.80.0). Solo una chat protetta e
 * aperta cambia senza avviso: si richiude da sola dopo l'inattività. Tutto il
 * resto arriva con `pin:cambiato`; i 30 s sono una rete di sicurezza. Prima
 * ogni riquadro faceva 4 chiamate ogni 3 s, protetto o no.
 */
export function ogniQuantoRileggerePin(v: VistaPin): number {
  return v.protetta && !v.chiusa ? 3000 : 30_000
}

/** Lo stato del PIN di una chat, riletto a ogni cambio e ogni tanto (vedi sopra). */
export function usePin(sessione: string | undefined): VistaPin & { rileggi: () => void } {
  const [v, setV] = useState<VistaPin>({ protetta: false, chiusa: false })
  const rileggi = useCallback((): void => {
    const ws = workspaceCorrente()
    void Promise.all([window.gestore.pin.protetta(sessione, ws), window.gestore.pin.chiusa(sessione, ws)])
      .then(([protetta, chiusa]) => setV((p) => (p.protetta === protetta && p.chiusa === chiusa ? p : { protetta, chiusa })))
      .catch(() => undefined)
  }, [sessione])
  useEffect(() => {
    rileggi()
    return window.gestore.pin.suCambiato(rileggi)
  }, [rileggi])
  const passo = ogniQuantoRileggerePin(v)
  useEffect(() => {
    const t = setInterval(rileggi, passo)
    return () => { clearInterval(t) }
  }, [rileggi, passo])
  return { ...v, rileggi }
}

export function CoperturaPin({ titolo, onSblocca }: { titolo: string; onSblocca: (pin: string) => Promise<{ ok: boolean; errore?: string }> }): React.JSX.Element {
  const [pin, setPin] = useState('')
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [provo, setProvo] = useState(false)
  const manda = (): void => {
    if (pin === '' || provo) return
    setProvo(true)
    void onSblocca(pin).then((e) => {
      if (!e.ok) setErrore(e.errore ?? 'PIN sbagliato.')
      setPin('')
    }).finally(() => setProvo(false))
  }
  return (
    <div className="copertura-pin" onMouseDown={(e) => e.stopPropagation()}>
      <div className="copertura-pin__lucchetto" aria-hidden="true">🔒</div>
      <div className="copertura-pin__titolo">«{titolo}» è protetta dal PIN</div>
      <div className="copertura-pin__spiega">
        La chat continua a lavorare: qui sotto non si vede e non si scrive finché non metti il PIN. Si richiude da sola dopo il tempo di inattività scelto nelle Impostazioni, e alla chiusura del programma.
      </div>
      <input
        className="campo copertura-pin__campo"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        placeholder="PIN"
        value={pin}
        maxLength={8}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErrore(undefined) }}
        onKeyDown={(e) => { if (e.key === 'Enter') manda() }}
      />
      <button className="tasto tasto--primario" disabled={pin.length < 4 || provo} onClick={manda}>{provo ? 'Controllo…' : 'Apri'}</button>
      {errore !== undefined ? <div className="copertura-pin__errore">{errore}</div> : null}
    </div>
  )
}

/** Il terminale con il PIN: coperto e inerte finché la chat è chiusa per questo schermo. */
export function ChatConPin({ sessione, titolo, children }: { sessione: string; titolo: string; children: React.ReactNode }): React.JSX.Element {
  const { chiusa, rileggi } = usePin(sessione)
  const ultimoGesto = useRef(0)
  // Un gesto sulla chat aperta allunga la richiusura (uno ogni dieci secondi basta).
  const gesto = (): void => {
    const ora = Date.now()
    if (ora - ultimoGesto.current < 10_000) return
    ultimoGesto.current = ora
    void window.gestore.pin.tocca(sessione, workspaceCorrente()).catch(() => undefined)
  }
  const sotto: Record<string, unknown> = chiusa ? { inert: '' } : {}
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} onKeyDownCapture={gesto} onMouseDownCapture={gesto}>
      <div {...sotto} style={{ width: '100%', height: '100%', visibility: chiusa ? 'hidden' : 'visible' }}>{children}</div>
      {chiusa ? (
        <CoperturaPin
          titolo={titolo}
          onSblocca={async (pin) => {
            const e = await window.gestore.pin.sblocca(sessione, workspaceCorrente(), pin)
            rileggi()
            return e
          }}
        />
      ) : null}
    </div>
  )
}

/** Il tasto della testata: protegge o toglie la protezione; clic e tasto destro aprono lo stesso menu (del sistema, 13/11). */
export function TastoPin({ sessione, titolo }: { sessione: string; titolo: string }): React.JSX.Element | null {
  const { protetta, chiusa, rileggi } = usePin(sessione)
  const [attivo, setAttivo] = useState(false)
  useEffect(() => {
    const leggi = (): void => { void window.gestore.pin.stato().then((s) => setAttivo(s.attivo)).catch(() => undefined) }
    leggi()
    return window.gestore.pin.suCambiato(leggi)
  }, [])
  const proteggi = (si: boolean): void => { void window.gestore.pin.proteggiChat(sessione, si).then(rileggi) }
  const menu = (e: React.MouseEvent): void => apriMenuContestuale(e, [
    ...(!attivo ? [{ id: 'spento', testo: 'Il PIN è spento: accendilo dalle Impostazioni → PIN delle chat', spenta: true }] : []),
    protetta
      ? { id: 'togli', testo: 'Togli il PIN da questa chat' }
      : { id: 'metti', testo: 'Proteggi con il PIN', spenta: !attivo },
    ...(protetta && !chiusa ? [{ id: 'richiudi', testo: 'Richiudi adesso' }] : [])
  ], {
    togli: () => proteggi(false),
    metti: () => proteggi(true),
    richiudi: () => { void window.gestore.pin.richiudi().then(rileggi) }
  })
  return (
    <button
      className="comando-riquadro"
      onClick={menu}
      onContextMenu={menu}
      title={protetta ? `«${titolo}» è protetta dal PIN${chiusa ? '' : ' (adesso aperta)'}` : 'Proteggi questa chat con il PIN'}
      aria-label="PIN della chat"
      style={{ opacity: protetta ? 1 : 0.55 }}
    >
      {protetta ? (chiusa ? '🔒' : '🔓') : '🔐'}
    </button>
  )
}
