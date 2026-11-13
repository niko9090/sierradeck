import { useEffect, useMemo, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import type { Battuta } from '@shared/chat-autopilota'
import { riassunto, type Riassunto, type TipoRiassunto } from '@shared/riassunto-autopilota'
import { battuteDaDire, chiaveBattuta, fraseDiBattuta } from '@shared/voce-autopilota'
import { useSondaggio } from '../state/sondaggio'
import { useSorgente } from '../sorgente-autopilota'
import { sondaggioOrchestratore } from './TestaOrchestratore'
import { Aiuto } from './Aiuto'
import {
  cambiaVoce, COME_AGGIUNGERE_VOCE, SENZA_VOCE_ITALIANA, useImpostazioniVoce, useStatoVoce, VELOCITA_MAX, VELOCITA_MIN, voce, vociItaliane
} from '../voce'

/** Una richiesta di riassunto arrivata da fuori (un comando detto nel campo). */
export type RichiestaRiassunto = { tipo: TipoRiassunto; n: number; leggi: boolean }

const AIUTO_RIASSUNTO = 'Il riassunto lo scrive il programma con quello che sa già (lavori partiti, finiti e uniti, cosa non è andato, richieste fatte, versioni uscite, le sue risposte e le domande che ti aspettano): è immediato e non costa niente. «Dal tuo ultimo messaggio» guarda solo da quando gli hai scritto l’ultima volta; «Generale» dà il punto sul workspace. Se vuoi il suo parere con parole sue, chiediglielo nella chat: costa un turno. «Ascolta» lo legge con la voce italiana di Windows.'

const AIUTO_VOCE = 'Con la conversazione a voce accesa SierraDeck legge ad alta voce, in breve, le risposte e le domande NUOVE dell’autopilota (non la storia vecchia, non il codice). Per rispondere premi 🎤 e parla: mentre parli la voce tace. Quando smetti di parlare per qualche secondo il testo parte da solo (puoi annullare, o spegnere «Manda da solo»). Parole che fanno qualcosa qui senza mandare niente: «riassunto», «riassunto generale», «ripeti», «basta». La voce è quella di Windows, sul PC: niente audio esce dal PC. Se manca la voce italiana: ' + COME_AGGIUNGERE_VOCE

/**
 * **Riassunto e conversazione a voce** nella testa della chat
 * dell'autopilota (13/11). I dati arrivano dalla sorgente: vale uguale per
 * l'autopilota di un altro PC.
 */
export function VoceAutopilota({ autopilota, workspace, battute, richiesta }: {
  autopilota: Autopilota
  workspace: string
  /** Le battute della chat, per dire le nuove con la conversazione a voce. */
  battute: readonly Battuta[]
  richiesta?: RichiestaRiassunto
}): React.JSX.Element {
  const sorgente = useSorgente()
  const imp = useImpostazioniVoce()
  const stato = useStatoVoce()
  const vista = useSondaggio(useMemo(() => sondaggioOrchestratore(workspace, sorgente), [workspace, sorgente]))
  const [aperto, setAperto] = useState<Riassunto | undefined>(undefined)
  const [leggo, setLeggo] = useState(false)
  const [regola, setRegola] = useState(false)
  const [voci, setVoci] = useState<SpeechSynthesisVoice[] | undefined>(undefined)
  const chiave = `${sorgente.chiave}|${autopilota.id}`

  const fai = (tipo: TipoRiassunto, leggi: boolean): void => {
    setLeggo(true)
    void Promise.all([
      sorgente.orchestratore(workspace).catch(() => undefined),
      sorgente.coda(workspace).catch(() => undefined)
    ]).then(([v, coda]) => {
      const r = riassunto(tipo, { autopilota, ...(v !== undefined ? { vista: v } : {}), ...(coda !== undefined ? { coda } : {}), adesso: Date.now() })
      setAperto(r)
      if (leggi) voce.subito(`riassunto:${chiave}:${Date.now()}`, r.parlato)
    }).finally(() => setLeggo(false))
  }
  const ultimaRichiesta = useRef(0)
  useEffect(() => {
    if (richiesta === undefined || richiesta.n === ultimaRichiesta.current) return
    ultimaRichiesta.current = richiesta.n
    fai(richiesta.tipo, richiesta.leggi)
  })

  // La conversazione a voce: accendendola si segna visto tutto quello che c'è; poi si dicono solo le nuove.
  const viste = useRef<Set<string> | undefined>(undefined)
  const domandePrima = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!imp.conversazione) { viste.current = undefined; domandePrima.current = undefined; return }
    if (viste.current === undefined) {
      viste.current = new Set(battute.map(chiaveBattuta))
      domandePrima.current = vista?.domandeAperte
      return
    }
    const nuove = battuteDaDire(battute, viste.current)
    for (const b of nuove) {
      viste.current.add(chiaveBattuta(b))
      voce.accoda({ id: `${chiave}:${chiaveBattuta(b)}`, testo: fraseDiBattuta(b) })
    }
    // Una domanda nuova che non sta nella chat (nelle Domande): si dice che c'è.
    const d = vista?.domandeAperte
    if (d !== undefined) {
      if (domandePrima.current !== undefined && d > domandePrima.current && !nuove.some((b) => b.tono === 'domanda')) {
        voce.accoda({ id: `${chiave}:domande:${d}:${Math.floor(Date.now() / 60_000)}`, testo: 'Ha una nuova domanda per te: la trovi nelle Domande.' })
      }
      domandePrima.current = d
    }
  }, [imp.conversazione, battute, vista?.domandeAperte, chiave])

  useEffect(() => {
    if (!regola || voci !== undefined) return
    void vociItaliane().then(setVoci)
  }, [regola, voci])

  return (
    <div className="voceap">
      <div className="voceap__tasti">
        <button className="tasto tasto--mini" disabled={leggo} onClick={() => fai('da-ultimo', false)} title="Cosa è successo dal tuo ultimo messaggio">Riassunto</button>
        <button
          className={`tasto tasto--mini${imp.conversazione ? ' tasto--primario' : ''}`}
          aria-pressed={imp.conversazione}
          onClick={() => cambiaVoce({ conversazione: !imp.conversazione })}
          title="Legge ad alta voce le sue risposte nuove; rispondi con 🎤"
        >{imp.conversazione ? '🔊 A voce' : '🔇 A voce'}</button>
        <button className="tasto tasto--mini" aria-expanded={regola} onClick={() => setRegola((x) => !x)} title="Velocità e voce">▾</button>
        {stato.parla ? <button className="tasto tasto--mini" onClick={() => voce.zitto()} title="Smetti di leggere">■ Ferma</button> : null}
      </div>
      {stato.problema !== undefined ? (
        <div className="voceap__nota con-aiuto" role="alert">{stato.problema}<Aiuto di="la voce italiana">{stato.problema === SENZA_VOCE_ITALIANA ? COME_AGGIUNGERE_VOCE : 'La sintesi vocale non è disponibile in questa finestra.'}</Aiuto></div>
      ) : null}
      {regola ? (
        <div className="voceap__regola">
          <label>
            Velocità{' '}
            <input type="range" min={VELOCITA_MIN} max={VELOCITA_MAX} step={0.1} value={imp.velocita} aria-label="Velocità della voce" onChange={(e) => cambiaVoce({ velocita: Number(e.target.value) })} />
            {' '}{imp.velocita.toFixed(1)}×
          </label>
          {voci === undefined ? <span className="voceap__nota">Cerco le voci…</span> : voci.length === 0 ? (
            <span className="voceap__nota con-aiuto">{SENZA_VOCE_ITALIANA}<Aiuto di="aggiungere la voce italiana">{COME_AGGIUNGERE_VOCE}</Aiuto></span>
          ) : (
            <label>
              Voce{' '}
              <select value={imp.voce ?? ''} onChange={(e) => cambiaVoce(e.target.value === '' ? { voce: undefined } : { voce: e.target.value })}>
                <option value="">la prima italiana</option>
                {voci.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </label>
          )}
          <label>
            <input type="checkbox" checked={imp.invioDaSolo} onChange={(e) => cambiaVoce({ invioDaSolo: e.target.checked })} />
            {' '}Manda da solo quello che detti
          </label>
          <button className="tasto tasto--mini" onClick={() => voce.subito(`prova:${Date.now()}`, 'Ciao, sono la voce di SierraDeck.')}>Prova</button>
          <Aiuto di="la conversazione a voce">{AIUTO_VOCE}</Aiuto>
        </div>
      ) : null}
      {aperto !== undefined ? (
        <div className="voceap__riassunto" role="region" aria-label="Riassunto">
          <div className="voceap__intesta">
            <b>{aperto.titolo}</b>
            <span style={{ flex: 1 }} />
            <button className="tasto tasto--mini" onClick={() => (stato.parla ? voce.zitto() : voce.subito(`riassunto:${chiave}:${Date.now()}`, aperto.parlato))}>
              {stato.parla ? '■ Ferma' : '▶ Ascolta'}
            </button>
            <button className="tasto tasto--mini" disabled={leggo} onClick={() => fai(aperto.tipo === 'generale' ? 'da-ultimo' : 'generale', false)}>
              {aperto.tipo === 'generale' ? 'Dal tuo ultimo messaggio' : 'Generale'}
            </button>
            <Aiuto di="il riassunto">{AIUTO_RIASSUNTO}</Aiuto>
            <button className="tasto tasto--mini" aria-label="Chiudi il riassunto" onClick={() => setAperto(undefined)}>×</button>
          </div>
          <ul className="voceap__righe">
            {aperto.righe.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
