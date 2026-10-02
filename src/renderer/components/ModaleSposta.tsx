import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PASSI_SPOSTA, sipuoSpostare, type Controllo } from '@shared/una-casa'

/**
 * «Sposta progetto da un PC all'altro» (0.42.0): la procedura guidata.
 *
 * Sei passi, uno alla volta, ognuno con il suo testo per esteso (in
 * `PASSI_SPOSTA`): scelta, controlli, trasferimento, verifica, cambio della
 * casa, copia archiviata. Si va avanti solo se il passo è riuscito; fino alla
 * verifica compresa qui non cambia niente. L'ultimo passo non cancella: mette
 * da parte, e «Annulla lo spostamento» (in «Riordina le chat») torna indietro.
 */

type Props = { onChiudi: () => void; cwdIniziale?: string }

type Progetto = { cwd: string; nome: string; sessioni: string[]; titoli: string[] }
type Pc = { pcId: string; nome: string; versione: string; battito: string }

export function ModaleSposta({ onChiudi, cwdIniziale }: Props): React.JSX.Element {
  const [passo, setPasso] = useState(0)
  const [progetti, setProgetti] = useState<Progetto[] | undefined>(undefined)
  const [pc, setPc] = useState<Pc[]>([])
  const [cwd, setCwd] = useState(cwdIniziale ?? '')
  const [dest, setDest] = useState('')
  const [controlli, setControlli] = useState<Controllo[] | undefined>(undefined)
  const [mettiSulDrive, setMettiSulDrive] = useState(false)
  const [esiti, setEsiti] = useState<Record<number, { ok: boolean; messaggio: string }>>({})
  const [lavoro, setLavoro] = useState(false)

  useEffect(() => {
    window.gestore.sposta.progetti().then(setProgetti).catch(() => setProgetti([]))
    window.gestore.sposta.pc().then(setPc).catch(() => setPc([]))
  }, [])
  const progetto = progetti?.find((p) => p.cwd === cwd)
  const nomeDest = pc.find((p) => p.pcId === dest)?.nome ?? 'l’altro PC'

  const esegui = (n: number, f: () => Promise<{ ok: boolean; messaggio: string; serveDrive?: boolean }>): void => {
    setLavoro(true)
    setEsiti((e) => { const x = { ...e }; delete x[n]; return x })
    f().then((r) => setEsiti((e) => ({ ...e, [n]: r })))
      .catch((err: unknown) => setEsiti((e) => ({ ...e, [n]: { ok: false, messaggio: String(err) } })))
      .finally(() => setLavoro(false))
  }
  const controlla = (): void => {
    setLavoro(true); setControlli(undefined)
    window.gestore.sposta.controlli(cwd, dest).then(setControlli).catch((e: unknown) => setControlli([{ id: 'errore', ok: false, titolo: String(e) }])).finally(() => setLavoro(false))
  }
  useEffect(() => { if (passo === 1) controlla() }, [passo])

  const puoAvanti = passo === 0 ? progetto !== undefined && dest !== ''
    : passo === 1 ? controlli !== undefined && sipuoSpostare(controlli)
    : passo >= 2 && passo <= 4 ? esiti[passo]?.ok === true
    : false
  const p = PASSI_SPOSTA[passo]

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !lavoro) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Sposta progetto da un PC all’altro</span>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" disabled={lavoro} onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        <ol className="sposta__passi" aria-label="I passi">
          {PASSI_SPOSTA.map((x, i) => (
            <li key={x.id} className={i === passo ? 'sposta__passo sposta__passo--qui' : i < passo ? 'sposta__passo sposta__passo--fatto' : 'sposta__passo'}>
              {i + 1}. {x.titolo}
            </li>
          ))}
        </ol>
        <p className="account__nota" style={{ margin: '8px 0' }}><b>{passo + 1}. {p?.titolo}.</b> {p?.testo}</p>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {passo === 0 ? (
            <>
              <label className="account__nota">Il progetto (una cartella di questo PC con le sue chat):</label>
              <select className="account__campo" value={cwd} onChange={(e) => setCwd(e.target.value)}>
                <option value="">— scegli —</option>
                {(progetti ?? []).map((x) => <option key={x.cwd} value={x.cwd}>{x.nome} · {x.sessioni.length} chat · {x.cwd}</option>)}
              </select>
              {progetto !== undefined ? (
                <p className="account__nota">Le sue chat: {progetto.titoli.slice(0, 12).join(' · ')}{progetto.titoli.length > 12 ? ` … e altre ${progetto.titoli.length - 12}` : ''}</p>
              ) : null}
              <label className="account__nota">Dove deve andare a vivere:</label>
              <select className="account__campo" value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">— scegli il PC —</option>
                {pc.map((x) => <option key={x.pcId} value={x.pcId}>{x.nome} · {x.versione}</option>)}
              </select>
              {pc.length === 0 ? <p className="account__nota">Non conosco altri PC: compaiono quando hanno SierraDeck aperto con il Drive collegato.</p> : null}
            </>
          ) : null}

          {passo === 1 ? (
            <>
              {controlli === undefined ? <p className="account__nota">Controllo…</p> : controlli.map((c) => (
                <div key={c.id} className="sposta__controllo">
                  <span className={c.ok ? 'sposta__ok' : 'sposta__no'}>{c.ok ? '✓' : '✗'}</span>
                  <span><b>{c.titolo}</b>{c.cosaFare !== undefined ? <span className="account__nota"> — {c.cosaFare}</span> : null}</span>
                </div>
              ))}
              <button className="tasto tasto--mini" disabled={lavoro} onClick={controlla} style={{ alignSelf: 'flex-start' }}>Ricontrolla</button>
            </>
          ) : null}

          {passo === 2 ? (
            <>
              <label className="account__nota" style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <input type="checkbox" checked={mettiSulDrive} onChange={(e) => setMettiSulDrive(e.target.checked)} />
                Se la cartella del progetto non è ancora sul Drive, mettila sul Drive (è il modo in cui il codice arriva su {nomeDest}; da qui in poi si sincronizza come gli altri progetti sul Drive).
              </label>
              <button className="tasto tasto--primario" disabled={lavoro} onClick={() => esegui(2, () => window.gestore.sposta.trasferisci(cwd, dest, mettiSulDrive))} style={{ alignSelf: 'flex-start' }}>
                {lavoro ? 'Trasferisco… (può volerci qualche minuto)' : `Salva sul Drive e chiedi a ${nomeDest} di portarlo da sé`}
              </button>
            </>
          ) : null}
          {passo === 3 ? (
            <button className="tasto tasto--primario" disabled={lavoro} onClick={() => esegui(3, () => window.gestore.sposta.verifica(cwd, dest))} style={{ alignSelf: 'flex-start' }}>
              {lavoro ? 'Verifico…' : `Confronta le chat di qui con quelle arrivate su ${nomeDest}`}
            </button>
          ) : null}
          {passo === 4 ? (
            <button className="tasto tasto--primario" disabled={lavoro} onClick={() => esegui(4, () => window.gestore.sposta.casa(cwd, dest))} style={{ alignSelf: 'flex-start' }}>
              {`Da adesso la casa di queste chat è ${nomeDest}`}
            </button>
          ) : null}
          {passo === 5 ? (
            <button className="tasto tasto--primario" disabled={lavoro || esiti[5]?.ok === true} onClick={() => esegui(5, () => window.gestore.sposta.archivia(cwd, dest))} style={{ alignSelf: 'flex-start' }}>
              {esiti[5]?.ok === true ? 'Fatto' : 'Metti da parte le copie di qui (non si cancellano)'}
            </button>
          ) : null}

          {esiti[passo] !== undefined ? (
            <div className={esiti[passo]?.ok === true ? 'riga__stato' : 'avviso'}>{esiti[passo]?.ok === true ? '✓ ' : '⚠ '}{esiti[passo]?.messaggio}</div>
          ) : null}
          {passo === 5 && esiti[5]?.ok === true ? (
            <p className="account__nota">
              Il progetto adesso vive su {nomeDest}: le sue chat le apri da lì, e da qui le guardi dal vivo. Se hai cambiato idea,
              «Annulla lo spostamento» è in Drive → «Riordina le chat…», in fondo: rimette qui le chat e la loro casa.
            </p>
          ) : null}
        </div>

        <div className="dialogo__piede" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span className="account__nota" style={{ flex: 1 }}>
            {passo <= 3 ? 'Fino alla verifica compresa, qui non cambia niente.' : passo === 4 ? 'Questo passo cambia la casa: da qui in poi le chat salgono sul Drive da ' + nomeDest + '.' : 'L’ultimo passo mette da parte, non cancella.'}
          </span>
          <button className="tasto" disabled={lavoro || passo === 0 || esiti[4]?.ok === true} onClick={() => setPasso((x) => Math.max(0, x - 1))}>Indietro</button>
          {passo < PASSI_SPOSTA.length - 1 ? (
            <button className="tasto tasto--primario" disabled={!puoAvanti || lavoro} onClick={() => setPasso((x) => x + 1)}>Avanti</button>
          ) : (
            <button className="tasto tasto--primario" disabled={lavoro} onClick={onChiudi}>Chiudi</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
