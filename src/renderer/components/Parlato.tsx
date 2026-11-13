import { useEffect, useState } from 'react'
import { inCorso, MODELLI, MODELLO_PREDEFINITO, mb, percentuale, SPIEGA_CONSENSO, testoConsenso, type IdModello, type StatoModello } from '@shared/modello-voce'
import { parolaSvegliaValida, testoFase, type ModoVoce } from '@shared/parlato'
import { ascolto, useAscolto, useBersaglio, useModelloVoce, type Bersaglio } from '../ascolto'
import { cambiaVoce, useImpostazioniVoce } from '../voce'
import { Aiuto } from './Aiuto'

/**
 * I pezzi visibili di «Parlato» (13/11): l'interruttore Normale | Parlato
 * nella chat dell'autopilota, il consenso allo scaricamento la prima volta,
 * le impostazioni (parola di sveglia, modello, togli) e il segno sempre
 * visibile col tasto grande per fermare.
 */

const AIUTO_MODI =
  'Normale: 🎤 apre la dettatura di Windows, il testo va nel campo e parte solo quando premi «Manda». ' +
  'Parlato: il microfono resta aperto e le risposte nuove te le legge in breve. Comincia ogni frase con la parola di sveglia (di serie «Sierra»): «Sierra, aggiungi un controllo ai salvataggi». ' +
  'La frase finisce quando taci per un secondo e mezzo, e parte da sola. Quello che dici senza la parola si butta: TV, telefonate, altre persone. ' +
  'Detta da sola, «Sierra» apre 8 secondi per parlare. Comandi: «Sierra, riassunto», «Sierra, riassunto generale», «Sierra, ripeti», «Sierra, basta» (smette di leggere), «Sierra, smetti di ascoltare». ' +
  'Mentre legge non ascolta (non si sente da solo). Chiudendo la finestra con la X Parlato si spegne; ridotta a icona resta acceso. Riaprendo SierraDeck si riparte da Normale. ' +
  'Il riconoscimento è Whisper sul PC: l’audio non esce mai.'

/** L'interruttore e quello che serve accanto, nella testa di una chat dell'autopilota. */
export function InterruttoreParlato({ bersaglio }: { bersaglio: Bersaglio }): React.JSX.Element {
  useBersaglio(bersaglio)
  const a = useAscolto()
  const m = useModelloVoce()
  const imp = useImpostazioniVoce()
  const [consenso, setConsenso] = useState(false)
  const [scelto, setScelto] = useState<IdModello>(MODELLO_PREDEFINITO)
  const [daAccendere, setDaAccendere] = useState(false)
  const qui = a.fase !== 'spento' && a.bersaglio?.chiave === bersaglio.chiave
  const modo: ModoVoce = qui ? 'parlato' : 'normale'
  const api = typeof window !== 'undefined' ? window.gestore?.voceLocale : undefined

  // Finito lo scaricamento chiesto da qui, Parlato si accende da solo.
  useEffect(() => {
    if (!daAccendere || m === undefined) return
    if (m.fase === 'pronto') { setDaAccendere(false); setConsenso(false); void ascolto.accendi(bersaglio) }
    else if (m.fase === 'errore' || m.fase === 'assente') setDaAccendere(false)
  }, [daAccendere, m, bersaglio])

  const scegli = (nuovo: ModoVoce): void => {
    if (nuovo === modo) return
    if (nuovo === 'normale') { ascolto.spegni(); setConsenso(false); return }
    if (m?.fase === 'pronto') { void ascolto.accendi(bersaglio); return }
    setConsenso(true)
  }

  if (api === undefined) return <></>
  return (
    <span className="parlato">
      <span className="parlato__modi con-aiuto" role="group" aria-label="Modo della voce">
        <button className={`tasto tasto--mini${modo === 'normale' ? ' tasto--primario' : ''}`} aria-pressed={modo === 'normale'} onClick={() => scegli('normale')} title="Detti con 🎤 e mandi tu">Normale</button>
        <button className={`tasto tasto--mini${modo === 'parlato' ? ' tasto--primario' : ''}`} aria-pressed={modo === 'parlato'} onClick={() => scegli('parlato')} title={`Microfono aperto: comincia con «${imp.parolaSveglia}»`}>Parlato</button>
        <Aiuto di="Normale e Parlato">{AIUTO_MODI}</Aiuto>
      </span>
      {qui ? <StatoParlato /> : null}
      {consenso || (m !== undefined && inCorso(m) && daAccendere) ? (
        <Consenso stato={m} scelto={scelto} onScegli={setScelto} onSi={() => { setDaAccendere(true); void api.scarica(scelto).catch(() => setDaAccendere(false)) }} onNo={() => { setConsenso(false); if (m !== undefined && inCorso(m)) void api.annulla() }} />
      ) : null}
    </span>
  )
}

/** La riga dello stato, dentro la chat che ascolta. */
function StatoParlato(): React.JSX.Element {
  const a = useAscolto()
  const imp = useImpostazioniVoce()
  return (
    <span className={`parlato__stato parlato__stato--${a.fase}`} role="status" aria-live="polite">
      <span className="parlato__punto" aria-hidden="true" />
      {testoFase(a.fase, imp.parolaSveglia)}
      {a.ultima !== undefined ? <span className="parlato__ultima" title={a.ultima}> · {a.ultima}</span> : null}
    </span>
  )
}

function Consenso({ stato, scelto, onScegli, onSi, onNo }: {
  stato: StatoModello | undefined
  scelto: IdModello
  onScegli: (m: IdModello) => void
  onSi: () => void
  onNo: () => void
}): React.JSX.Element {
  const pc = stato !== undefined ? percentuale(stato) : undefined
  const lavora = stato !== undefined && inCorso(stato)
  return (
    <div className="parlato__consenso" role="dialog" aria-label="Scaricare il riconoscimento della voce">
      {lavora ? (
        <>
          <span>{stato.fase === 'verifica' ? 'Controllo l’impronta…' : stato.fase === 'estrai' ? 'Preparo il programma…' : `Scarico… ${pc ?? 0}%`}</span>
          <progress max={100} value={pc ?? 0} aria-label="Avanzamento dello scaricamento" />
          <button className="tasto tasto--mini" onClick={onNo}>Annulla</button>
        </>
      ) : (
        <>
          <span className="con-aiuto">{testoConsenso(scelto)}<Aiuto di="lo scaricamento">{SPIEGA_CONSENSO}</Aiuto></span>
          <span className="parlato__scelte" role="radiogroup" aria-label="Modello">
            {(Object.keys(MODELLI) as IdModello[]).map((id) => (
              <label key={id} title={MODELLI[id].spiega}>
                <input type="radio" name="modello-voce" checked={scelto === id} onChange={() => onScegli(id)} /> {MODELLI[id].titolo} · {mb(MODELLI[id].byte)} MB
              </label>
            ))}
          </span>
          {stato?.fase === 'errore' ? <span className="voceap__nota" role="alert">{stato.messaggio}</span> : null}
          <button className="tasto tasto--mini tasto--primario" onClick={onSi}>Scarica e accendi</button>
          <button className="tasto tasto--mini" onClick={onNo}>No</button>
        </>
      )}
    </div>
  )
}

/** Nelle impostazioni della voce (▾): la parola di sveglia, il modello, togli. */
export function ImpostazioniParlato(): React.JSX.Element | null {
  const imp = useImpostazioniVoce()
  const m = useModelloVoce()
  const [parola, setParola] = useState(imp.parolaSveglia)
  const [togli, setTogli] = useState(false)
  const api = typeof window !== 'undefined' ? window.gestore?.voceLocale : undefined
  useEffect(() => setParola(imp.parolaSveglia), [imp.parolaSveglia])
  if (api === undefined) return null
  const valida = parolaSvegliaValida(parola)
  return (
    <span className="parlato__impostazioni">
      <label title="Le frasi in Parlato cominciano con questa parola">
        Parola di sveglia{' '}
        <input
          className="campo parlato__parola"
          value={parola}
          maxLength={20}
          aria-invalid={!valida}
          onChange={(e) => setParola(e.target.value)}
          onBlur={() => { if (valida) cambiaVoce({ parolaSveglia: parola.trim() }); else setParola(imp.parolaSveglia) }}
        />
      </label>
      {m === undefined ? null : m.fase === 'pronto' ? (
        <span>
          Riconoscimento: {MODELLI[m.modello].titolo}, {mb(m.byte)} MB{' '}
          {togli ? (
            <>
              <button className="tasto tasto--mini" onClick={() => { ascolto.spegni(); setTogli(false); void api.rimuovi().catch(() => undefined) }}>Sì, togli</button>
              <button className="tasto tasto--mini" onClick={() => setTogli(false)}>No</button>
            </>
          ) : (
            <>
              <button className="tasto tasto--mini" onClick={() => setTogli(true)} title="Toglie programma e modello dal PC">Togli</button>
              <button
                className="tasto tasto--mini"
                onClick={() => void api.scarica(m.modello === 'preciso' ? 'leggero' : 'preciso').catch(() => undefined)}
                title={MODELLI[m.modello === 'preciso' ? 'leggero' : 'preciso'].spiega}
              >Usa il {MODELLI[m.modello === 'preciso' ? 'leggero' : 'preciso'].titolo.toLowerCase()} ({mb(MODELLI[m.modello === 'preciso' ? 'leggero' : 'preciso'].byte)} MB)</button>
            </>
          )}
        </span>
      ) : inCorso(m) ? (
        <span>Scarico il riconoscimento… {percentuale(m) ?? 0}% <button className="tasto tasto--mini" onClick={() => void api.annulla()}>Annulla</button></span>
      ) : (
        <span className="voceap__nota">{m.fase === 'errore' ? m.messaggio : 'Riconoscimento non scaricato: si scarica alla prima accensione di Parlato.'}</span>
      )}
    </span>
  )
}

/**
 * Il segno di Parlato, fisso in basso nella finestra finché il microfono è
 * aperto, anche cambiando workspace o vista: dove ascolta, cosa fa, e il
 * tasto grande per fermare.
 */
export function IndicatoreParlato(): React.JSX.Element | null {
  const a = useAscolto()
  const imp = useImpostazioniVoce()
  if (a.fase === 'spento') return null
  return (
    <div className={`parlato-segno parlato__stato--${a.fase}`} role="status" aria-live="polite">
      <span className="parlato__punto" aria-hidden="true" />
      <span className="parlato-segno__testo">
        <b>🎙 Parlato</b>{a.bersaglio !== undefined ? ` · ${a.bersaglio.nome}` : ''}
        <span className="parlato-segno__fase">{a.fase === 'errore' ? a.problema ?? testoFase(a.fase, imp.parolaSveglia) : testoFase(a.fase, imp.parolaSveglia)}</span>
      </span>
      {a.fase === 'errore'
        ? <button className="tasto parlato-segno__ferma" onClick={() => ascolto.spegni()}>Chiudi</button>
        : <button className="tasto tasto--primario parlato-segno__ferma" onClick={() => ascolto.spegni()} aria-label="Ferma l’ascolto">■ Ferma</button>}
    </div>
  )
}
