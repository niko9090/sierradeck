import { useCallback, useEffect, useState } from 'react'
import type { Preferenze } from '@shared/preferenze'
import { MODI_AVVISO, NOMI_MODI, NOMI_TIPI, TIPI_AVVISO, type ImpostazioniAvvisi, type ModoAvviso, type VistaAvvisi } from '@shared/avvisi-telefono'
import { Aiuto } from './Aiuto'

/**
 * «Notifiche» nelle Impostazioni del PC (k-47). Nicholas, 06/11: «nelle
 * impostazioni c'è la voce Notifiche ma non c'è nulla come menu». La voce a
 * sinistra c'era per tutti, ma le scelte erano scritte solo per app e pagina:
 * sul PC la sezione si apriva vuota.
 *
 * Dall'11/11 in cima ci sono le notifiche vere (`AvvisiDelPc`): cosa avvisa
 * e come, per telefono, pagina e Telegram, le stesse scelte che si vedono
 * nell'app e nella pagina, tenute da questo PC. Sotto, le due scelte del PC:
 * il fumetto del salvataggio automatico sul Drive e la finestra degli
 * aggiornamenti quando l'aggiornamento aspetta a lungo (preferenze, salvate dal
 * pannello). Dal 13/11 niente notifica di Windows per l'aggiornamento: tutto
 * passa dalla sua finestra.
 */
export function SezioneNotifiche({ p, cambia, vede }: { p: Preferenze; cambia: (x: Partial<Preferenze>) => void; vede?: (...id: string[]) => boolean }): React.JSX.Element {
  const mostra = vede ?? (() => true)
  return (
    <>
      {mostra('avvisi', 'avvisi-ultimi') ? <AvvisiDelPc vede={mostra} /> : null}
      {mostra('avviso-windows-aggiornamento') ? (
        <label className="impostazioni__riga impostazioni__riga--spunta">
          <input type="checkbox" checked={p.avvisoWindowsAggiornamento} onChange={(e) => cambia({ avvisoWindowsAggiornamento: e.target.checked })} />
          <span className="con-aiuto">Mostra la finestra degli aggiornamenti se l’attesa è lunga
            {/* Dentro la <label>: senza preventDefault un clic sulla spiegazione cambierebbe la spunta. */}
            <span onClick={(e) => e.preventDefault()}><Aiuto di="Finestra degli aggiornamenti per l’attesa lunga">
              Acceso: se hai premuto «Installa e riavvia» e le chat non finiscono il turno per molto tempo, la finestra degli aggiornamenti in basso a destra si mostra anche con SierraDeck nascosto. Spento: si vede solo quando apri SierraDeck o premi il numero di versione in alto. Non cambia mai quando si installa.
            </Aiuto></span>
          </span>
        </label>
      ) : null}
      {mostra('fumetti-sincronia') ? (
        <label className="impostazioni__riga impostazioni__riga--spunta">
          <input type="checkbox" checked={p.fumettiSincroniaAutomatica} onChange={(e) => cambia({ fumettiSincroniaAutomatica: e.target.checked })} />
          <span className="con-aiuto">Mostra un fumetto anche per il salvataggio automatico sul Drive
            <span onClick={(e) => e.preventDefault()}><Aiuto di="Fumetti del salvataggio automatico">
              I fumetti sono in basso a destra, compaiono e spariscono senza spostare i riquadri. Il lavoro che chiedi tu (Fondi, Ripristina, Porta qui) ha sempre il suo fumetto con la barra, «Dettagli» e «Annulla». Il lavoro automatico (il salvataggio ogni cinque minuti, l’arrivo delle chat) spento non si vede: se ne parla solo se va male. Acceso, mostra una riga piccola con la percentuale, senza tasti.
            </Aiuto></span>
          </span>
        </label>
      ) : null}
    </>
  )
}

/** Le ore di silenzio proposte quando si accendono. */
const SILENZIO_PROPOSTO = { da: '23:00', a: '07:00' }
/** Ogni quanto si rilegge la riga di stato mentre la sezione è aperta (chi ascolta cambia da solo). */
const RILEGGI_MS = 4000

/**
 * Le notifiche di questo PC: la riga «chi ascolta», «Prova notifica», i
 * quattro tipi (Suona, Silenziosa, Spenta), la chat ferma, le ore di silenzio
 * e le ultime venti. Finché non ha letto, solo «Leggo…».
 */
export function AvvisiDelPc({ vede }: { vede: (...id: string[]) => boolean }): React.JSX.Element {
  const [v, setV] = useState<VistaAvvisi | undefined>(undefined)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const leggi = useCallback((): void => { void window.gestore.avvisi.stato().then(setV).catch(() => undefined) }, [])
  useEffect(() => {
    leggi()
    const t = setInterval(leggi, RILEGGI_MS)
    return () => clearInterval(t)
  }, [leggi])

  if (v === undefined) return <div className="impostazioni__nota">Leggo le notifiche…</div>
  const imposta = (x: Partial<ImpostazioniAvvisi>): void => {
    void window.gestore.avvisi.imposta(x).then((nuove) => setV((prima) => (prima === undefined ? prima : { ...prima, impostazioni: nuove }))).catch(() => undefined)
  }
  const prova = (): void => {
    setNota('Partita: deve arrivare sul telefono, nella pagina aperta e su Telegram.')
    void window.gestore.avvisi.prova().then(setV).catch(() => setNota('La prova non è partita: riprova fra qualche secondo.'))
  }
  return <SceltaAvvisi v={v} imposta={imposta} prova={prova} vede={vede} {...(nota !== undefined ? { nota } : {})} />
}

/** Quello che si vede, senza stato: le scelte arrivano da `AvvisiDelPc`. */
export function SceltaAvvisi({ v, imposta, prova, nota, vede }: {
  v: VistaAvvisi; imposta: (x: Partial<ImpostazioniAvvisi>) => void; prova: () => void; nota?: string; vede: (...id: string[]) => boolean
}): React.JSX.Element {
  const imp = v.impostazioni
  return (
    <>
      {vede('avvisi') ? (
        <>
          <div className="impostazioni__riga" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="con-aiuto">{v.riga}<Aiuto di="Chi riceve le notifiche">
              <p>Le notifiche nascono qui, su questo computer, e partono per l’app del telefono, per la pagina aperta in un browser e per Telegram (se c’è il bot). L’app le aspetta con una richiesta che resta aperta: quando è collegata la riga dice «in ascolto», e la notifica arriva in un paio di secondi.</p>
              <p>Se il telefono è spento o lontano, le domande ancora aperte gli arrivano appena si ricollega; quelle già chiuse no. Ogni passaggio (nata, consegnata con i secondi di ritardo, chiusa) resta nel registro del PC, alla riga «[avviso]».</p>
            </Aiuto></span>
            <button className="tasto" onClick={prova}>Prova notifica</button>
          </div>
          {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
          {TIPI_AVVISO.map((t) => (
            <label key={t} className="impostazioni__riga">
              <span className="con-aiuto">{NOMI_TIPI[t].titolo}
                <span onClick={(e) => e.preventDefault()}><Aiuto di={NOMI_TIPI[t].titolo}>
                  <p>{NOMI_TIPI[t].spiega}</p>
                  <p><b>Suona</b>: la notifica arriva con il suono (non più di uno ogni venti secondi, e mai nelle ore di silenzio). <b>Silenziosa</b>: arriva senza suono. <b>Spenta</b>: non arriva, né sul telefono, né nella pagina, né su Telegram; resta solo nelle Domande o nel pannello che la riguarda.</p>
                </Aiuto></span>
              </span>
              <select value={imp.tipi[t]} onChange={(e) => imposta({ tipi: { ...imp.tipi, [t]: e.target.value as ModoAvviso } })}>
                {MODI_AVVISO.map((m) => <option key={m} value={m}>{NOMI_MODI[m]}</option>)}
              </select>
            </label>
          ))}
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input type="checkbox" checked={imp.chatFerma} onChange={(e) => imposta({ chatFerma: e.target.checked })} />
            <span className="con-aiuto">Anche una chat mia ferma da tre minuti
              <span onClick={(e) => e.preventDefault()}><Aiuto di="Chat ferma">
                Acceso: una chat che hai aperto tu (non quelle degli autopiloti) che ha finito il turno o chiede una scelta, e resta ferma per tre minuti, manda una notifica. Se chiede una scelta è una Domanda, se ha solo finito è un Fatto: suonano come hai scelto sopra. Spento: niente notifiche per le tue chat.
              </Aiuto></span>
            </span>
          </label>
          <div className="impostazioni__riga impostazioni__riga--spunta" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="impostazioni__riga--spunta" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={imp.silenzio !== null} onChange={(e) => imposta({ silenzio: e.target.checked ? SILENZIO_PROPOSTO : null })} />
              <span>Ore di silenzio</span>
            </label>
            {imp.silenzio !== null ? (
              <>
                <span>dalle</span>
                <input type="time" aria-label="Silenzio dalle" value={imp.silenzio.da} onChange={(e) => { if (imp.silenzio !== null && e.target.value !== '') imposta({ silenzio: { da: e.target.value, a: imp.silenzio.a } }) }} />
                <span>alle</span>
                <input type="time" aria-label="Silenzio alle" value={imp.silenzio.a} onChange={(e) => { if (imp.silenzio !== null && e.target.value !== '') imposta({ silenzio: { da: imp.silenzio.da, a: e.target.value } }) }} />
              </>
            ) : null}
            <Aiuto di="Ore di silenzio">
              Nelle ore di silenzio le notifiche arrivano lo stesso, ma senza suono: al mattino le trovi tutte. L’ora è quella di questo computer. «Prova notifica» suona sempre.
            </Aiuto>
          </div>
        </>
      ) : null}
      {vede('avvisi-ultimi') ? (
        <details className="impostazioni__riga" style={{ display: 'block' }}>
          <summary className="con-aiuto">Ultime notifiche ({v.ultimi.length})
            <Aiuto di="Ultime notifiche">
              Le ultime venti notifiche partite da questo computer, la più recente in cima, con com’è finita ognuna. Se una non ti è arrivata ma qui c’è, il problema è fra il computer e il telefono: guarda la riga in cima, e il registro del PC alla riga «[avviso] consegnato».
            </Aiuto>
          </summary>
          {v.ultimi.length === 0 ? <div className="impostazioni__nota">Ancora nessuna.</div> : (
            <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
              {v.ultimi.map((a) => (
                <li key={`${a.id}-${a.n}`} className="impostazioni__nota" style={{ marginBottom: 4 }}>
                  <b>{a.ora}</b> · {NOMI_TIPI[a.tipo].titolo} · {a.titolo}: {a.testo} <i>({a.esito})</i>
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
    </>
  )
}
