import { useCallback, useEffect, useRef, useState } from 'react'
import { workspaceCorrente } from '../workspace-corrente'

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

/** Lo stato del PIN di una chat, riletto ogni tre secondi e a ogni cambio. */
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
    const t = setInterval(rileggi, 3000)
    const via = window.gestore.pin.suCambiato(rileggi)
    return () => { clearInterval(t); via() }
  }, [rileggi])
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

/** Il tasto della testata: protegge o toglie la protezione; il tasto destro apre lo stesso menu. */
export function TastoPin({ sessione, titolo }: { sessione: string; titolo: string }): React.JSX.Element | null {
  const { protetta, chiusa, rileggi } = usePin(sessione)
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined)
  const [attivo, setAttivo] = useState(false)
  useEffect(() => {
    const leggi = (): void => { void window.gestore.pin.stato().then((s) => setAttivo(s.attivo)).catch(() => undefined) }
    leggi()
    return window.gestore.pin.suCambiato(leggi)
  }, [])
  const proteggi = (si: boolean): void => { void window.gestore.pin.proteggiChat(sessione, si).then(rileggi); setMenu(undefined) }
  return (
    <>
      <button
        className="comando-riquadro"
        onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
        title={protetta ? `«${titolo}» è protetta dal PIN${chiusa ? '' : ' (adesso aperta)'}` : 'Proteggi questa chat con il PIN'}
        aria-label="PIN della chat"
        style={{ opacity: protetta ? 1 : 0.55 }}
      >
        {protetta ? (chiusa ? '🔒' : '🔓') : '🔐'}
      </button>
      {menu !== undefined ? <MenuPin x={menu.x} y={menu.y} onChiudi={() => setMenu(undefined)} voci={[
        ...(!attivo ? [{ testo: 'Il PIN è spento: accendilo dalle Impostazioni → PIN delle chat', azione: () => setMenu(undefined), spenta: true }] : []),
        protetta
          ? { testo: 'Togli il PIN da questa chat', azione: () => proteggi(false) }
          : { testo: 'Proteggi con il PIN', azione: () => proteggi(true), spenta: !attivo },
        ...(protetta && !chiusa ? [{ testo: 'Richiudi adesso', azione: () => { void window.gestore.pin.richiudi().then(rileggi); setMenu(undefined) } }] : [])
      ]} /> : null}
    </>
  )
}

export function MenuPin({ x, y, voci, onChiudi }: { x: number; y: number; voci: { testo: string; azione: () => void; spenta?: boolean }[]; onChiudi: () => void }): React.JSX.Element {
  useEffect(() => {
    const via = (): void => onChiudi()
    const t = setTimeout(() => window.addEventListener('mousedown', via), 0)
    return () => { clearTimeout(t); window.removeEventListener('mousedown', via) }
  }, [onChiudi])
  return (
    <div className="menu-pin" style={{ left: Math.min(x, window.innerWidth - 300), top: Math.min(y, window.innerHeight - 120) }} onMouseDown={(e) => e.stopPropagation()}>
      {voci.map((v) => (
        <button key={v.testo} className="menu-pin__voce" disabled={v.spenta === true && v.testo.startsWith('Proteggi')} onClick={v.azione}>{v.testo}</button>
      ))}
    </div>
  )
}
