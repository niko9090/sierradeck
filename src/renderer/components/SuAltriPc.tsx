import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Altrove = { pc: string; nome: string; workspace: string[] }

/**
 * I workspace degli altri PC, nella barra anche quando i workspace di qui sono
 * pochi e si vedono come linguette (0.67.0). Prima «Su altri PC» stava solo
 * nella tendina dei workspace, che c'è solo quando sono tanti: con due
 * workspace un progetto che vive su un altro PC (il caso «fionda» di Nicholas,
 * 12/10) dalla barra non si trovava.
 *
 * «Apri»: il workspace di quel PC, qui, con le sue chat dal vivo là.
 */
export function SuAltriPc(): React.JSX.Element | null {
  const [altrove, setAltrove] = useState<Altrove[]>([])
  const [aperto, setAperto] = useState(false)
  const [porto, setPorto] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [posto, setPosto] = useState<{ top: number; left: number } | undefined>(undefined)
  const tasto = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const leggi = (): void => { void window.gestore.workspace.altriPc().then(setAltrove).catch(() => undefined) }
    leggi()
    const t = setInterval(leggi, 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (aperto) setErrore(undefined); if (aperto) void window.gestore.workspace.altriPc().then(setAltrove).catch(() => undefined) }, [aperto])
  useLayoutEffect(() => {
    if (!aperto) return
    const r = tasto.current?.getBoundingClientRect()
    if (r === undefined) return
    const larghezza = Math.min(420, window.innerWidth - 32)
    setPosto({ top: r.bottom + 4, left: Math.max(16, Math.min(r.left, window.innerWidth - larghezza - 16)) })
  }, [aperto])

  const quanti = altrove.reduce((n, p) => n + p.workspace.length, 0)
  if (quanti === 0) return null
  return (
    <>
      <button ref={tasto} className="ws__voce" onClick={() => setAperto(!aperto)} aria-expanded={aperto}
        title="I workspace che vivono su altri PC: «Apri» li mostra qui, con le chat dal vivo là">
        Su altri PC <span className="ws-menu__quanti">{quanti}</span> ▾
      </button>
      {aperto && posto !== undefined ? createPortal(
        <>
          <div className="ws-menu__velo" onMouseDown={() => setAperto(false)} />
          <div className="ws-menu__tendina" style={{ top: posto.top, left: posto.left }} aria-label="Workspace su altri PC">
            <div className="ws-menu__lista">
              {altrove.flatMap((p) => p.workspace.map((n) => (
                <div key={`${p.pc}:${n}`} className="ws-menu__voce ws-menu__voce--altrove">
                  <span className="ws-menu__voce-nome">{n}</span>
                  <span className="ws-menu__conta">{p.nome}</span>
                  <button className="tasto tasto--mini tasto--acceso" disabled={porto !== undefined}
                    title={`Apre qui «${n}»: le sue chat dal vivo su ${p.nome}, dove continuano a girare. Su ${p.nome} non cambia niente.`}
                    onClick={() => {
                      setPorto(n)
                      void window.gestore.workspace.apriDaAltroPc(p.pc, n)
                        .then((r) => { if (r.ok) setAperto(false); else setErrore(r.messaggio) })
                        .catch((err: unknown) => setErrore(String(err)))
                        .finally(() => setPorto(undefined))
                    }}>{porto === n ? '…' : 'Apri'}</button>
                </div>
              )))}
            </div>
            {errore !== undefined ? <div className="ws-menu__vuoto" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}
          </div>
        </>, document.body) : null}
    </>
  )
}
