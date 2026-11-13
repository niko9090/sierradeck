import { useEffect, useState } from 'react'
import type { StatoAggiornamento } from '../../main/aggiornamenti'
import { tavolozza, type Preferenze } from '@shared/preferenze'
import { novitaConLeUltime } from '@shared/novita'
import { analizzaRiga, noteDaNovita, type NotaResa, type NoteAggiornamento } from '@shared/note-aggiornamento'
import { titoloNovita, type VistaNovita } from '@shared/finestra-novita'
import { Pezzi, Versione } from './ModaleNote'
import { Aiuto } from './Aiuto'

const PAGINA_VERSIONI = 'https://github.com/niko9090/sierradeck/releases'

/**
 * **La finestra degli aggiornamenti** (13/11), in basso a destra dello schermo:
 * tutto quello che prima stava nelle strisce e nelle finestre delle note dentro
 * la faccia del programma. Gli stessi tasti di prima, con le stesse chiamate:
 * scaricare, cercare, «Aggiorna adesso»; installare **solo** con «Installa e
 * riavvia», dopo aver visto cosa cambia.
 */
export function FinestraAggiornamenti(): React.JSX.Element {
  const [vista, setVista] = useState<VistaNovita>({ tipo: 'aggiornamento' })
  const [agg, setAgg] = useState<StatoAggiornamento>({ fase: 'fermo' })
  const [scaricaAuto, setScaricaAuto] = useState(true)
  const [versione, setVersione] = useState('')

  useEffect(() => {
    const applica = (p: Preferenze): void => {
      for (const [nome, valore] of Object.entries(tavolozza(p))) document.documentElement.style.setProperty(nome, valore)
      setScaricaAuto(p.scaricaAggiornamentiAutomatico)
    }
    window.gestore.preferenze.leggi().then(applica).catch(() => undefined)
    const via1 = window.gestore.preferenze.suCambio(applica)
    window.gestore.aggiornamenti.stato().then(setAgg).catch(() => undefined)
    const via2 = window.gestore.aggiornamenti.suStato(setAgg)
    window.gestore.finestraNovita?.vista().then(setVista).catch(() => undefined)
    const via3 = window.gestore.finestraNovita?.suVista(setVista)
    window.gestore.sistema.versione().then(setVersione).catch(() => undefined)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') chiudi() }
    window.addEventListener('keydown', suTasto)
    document.title = 'SierraDeck · Aggiornamento'
    return () => { via1(); via2(); via3?.(); window.removeEventListener('keydown', suTasto) }
  }, [])

  const chiudi = (): void => { void window.gestore.finestraNovita?.nascondi() }
  const vai = (v: VistaNovita): void => { void window.gestore.finestraNovita?.apri(v) }

  return (
    <div className="fnov" onPointerDown={() => { void window.gestore.finestraNovita?.letto() }}>
      <header className="fnov__testa">
        <span className={`led ${agg.fase === 'errore' ? 'led--fermo' : agg.fase === 'cerco' || agg.fase === 'attendo' ? 'led--attesa' : 'led--lavoro'}`} />
        <span className="serigrafia fnov__titolo">{titoloNovita(vista)}</span>
        {vista.tipo !== 'aggiornamento' ? (
          <button className="tasto tasto--mini fnov__nontrascina" onClick={() => vai({ tipo: 'aggiornamento' })} title="Torna allo stato dell’aggiornamento">‹ Stato</button>
        ) : null}
        <button className="tasto tasto--icona fnov__nontrascina" onClick={chiudi} title="Chiudi. Si riapre dal numero di versione in alto" aria-label="Chiudi">×</button>
      </header>
      {vista.tipo === 'novita' ? <Novita versione={versione} onChiudi={chiudi} />
        : vista.tipo === 'installa' ? <Installa versione={vista.versione} agg={agg} onPiuTardi={() => vai({ tipo: 'aggiornamento' })} />
          : <Stato agg={agg} scaricaAuto={scaricaAuto} versione={versione} onVai={vai} />}
    </div>
  )
}

/** Lo stato dell'aggiornamento: le stesse frasi e gli stessi tasti delle strisce di prima. */
export function Stato({ agg, scaricaAuto, versione, onVai }: {
  agg: StatoAggiornamento
  scaricaAuto: boolean
  versione: string
  onVai: (v: VistaNovita) => void
}): React.JSX.Element {
  const [fallitoChiuso, setFallitoChiuso] = useState(false)
  const v = agg.versione ?? 'versione nuova'
  const installa = (): void => onVai({ tipo: 'installa', versione: agg.versione ?? '' })
  const fallito = agg.tentativoFallito !== undefined && !fallitoChiuso && agg.fase !== 'installo' && agg.fase !== 'attendo' ? agg.tentativoFallito : undefined
  return (
    <div className="fnov__corpo">
      {agg.daTelefono === true ? <span className="serigrafia" title="La richiesta è arrivata da un dispositivo accoppiato">dal telefono</span> : null}

      {fallito !== undefined ? (
        <div className="fnov__blocco fnov__blocco--fallito" role="alert">
          <p><b>{fallito.titolo}</b> {fallito.motivo}</p>
          <p className="fnov__piccolo">Cosa puoi fare: {fallito.strade.map((x, i) => <span key={i}>{i + 1}. {x} </span>)}</p>
          <div className="fnov__tasti">
            <button className="tasto" onClick={() => void window.gestore.sistema.apriEsterno(fallito.pagina)} title={fallito.pagina}>Scarica a mano</button>
            {agg.fase === 'pronto' ? <button className="tasto tasto--primario" onClick={installa}>Riprova</button> : null}
            <button className="tasto" onClick={() => setFallitoChiuso(true)} title="Nascondi fino al prossimo avvio">Nascondi</button>
          </div>
        </div>
      ) : null}

      {agg.fase === 'aggiornato' ? <p>SierraDeck è già aggiornato.</p> : null}
      {agg.fase === 'cerco' ? <p>Sto guardando se c’è una versione nuova…{agg.daTelefono === true ? ' (chiesto dal telefono)' : ''}</p> : null}
      {agg.fase === 'errore' ? (
        <>
          <p>L’aggiornamento non è riuscito: {agg.errore ?? 'motivo sconosciuto'}</p>
          <div className="fnov__tasti"><button className="tasto" onClick={() => void window.gestore.aggiornamenti.cerca()}>Riprova</button></div>
        </>
      ) : null}
      {agg.fase === 'installo' ? <p>Sto installando la {v}. Il programma si chiude e riparte da solo: non serve fare niente.</p> : null}
      {agg.fase === 'attendo' ? (
        <>
          <p>
            {agg.attesaChat !== undefined && agg.attesa === undefined
              ? <>{agg.attesaChat.charAt(0).toUpperCase() + agg.attesaChat.slice(1)} — poi installo la {v}.</>
              : agg.attesa !== undefined
                ? <>Aspetto che finisca {agg.attesa}, poi installo la {v}.</>
                : <>Aspetto che {agg.chatOccupate === 1 ? 'una chat finisca quello che ha in mano' : `${agg.chatOccupate ?? 0} chat finiscano quello che hanno in mano`}, poi installo la {v}.</>}
            {' '}
            <Aiuto di="l’attesa prima di installare">
              {agg.attesaChat !== undefined && agg.attesa === undefined
                ? 'Gli autopiloti finiscono il turno e si fermano (al massimo 5 minuti, poi salvo il loro lavoro e installo); dopo il riavvio riprendono da soli.'
                : agg.attesa !== undefined
                  ? 'Un lavoro automatico (l’arrivo delle chat, il salvataggio dei cinque minuti) lo annullo io e si rifà da solo al prossimo giro; uno che hai chiesto tu lo lascio finire. Se non si ferma in tempo, non installo e te lo dico qui.'
                  : 'Una chat «lavora» se il suo terminale è acceso e non sta aspettando te. Ho già scritto in ognuna di fermarsi a fine turno e ho messo in pausa gli autopiloti. Al massimo 5 minuti: poi salvo il loro lavoro con un commit sul loro ramo e installo lo stesso. Non chiudere le chat a mano: l’installazione parte da sola.'}
            </Aiuto>
          </p>
          {agg.fasiTesto !== undefined && agg.fasiTesto !== '' ? <p className="fnov__piccolo">{agg.fasiTesto}.</p> : null}
          <div className="fnov__tasti">
            {agg.subito === true ? <span>Salvo il lavoro delle chat e installo subito…</span> : (
              <button
                className="tasto"
                title="Non aspetto che le chat finiscano il turno: salvo il loro lavoro sul loro ramo, le metto in pausa e installo adesso. Dopo il riavvio riprendono da sole."
                onClick={() => void window.gestore.aggiornamenti.aggiornaAdesso()}
              >
                Aggiorna adesso
              </button>
            )}
          </div>
        </>
      ) : null}
      {agg.fase === 'disponibile' ? (
        <>
          <p>C’è una versione nuova ({agg.versione}).{scaricaAuto ? ' La sto scaricando…' : ''}</p>
          {!scaricaAuto ? <div className="fnov__tasti"><button className="tasto" onClick={() => void window.gestore.aggiornamenti.scarica()}>Scarica</button></div> : null}
        </>
      ) : null}
      {agg.fase === 'scarico' ? (
        <>
          <p>Scarico la versione {agg.versione}… {agg.percento ?? 0}%</p>
          <span className="barra-agg"><span className="barra-agg__pieno" style={{ width: `${agg.percento ?? 0}%` }} /></span>
          {agg.fasiTesto !== undefined && agg.fasiTesto !== '' ? <p className="fnov__piccolo">{agg.fasiTesto}.</p> : null}
        </>
      ) : null}
      {agg.fase === 'pronto' ? (
        <>
          <p>
            {agg.errore !== undefined ? <><b>{agg.errore}</b>{' '}</> : null}
            La versione {agg.versione} è pronta. Si installa solo quando lo premi tu.
          </p>
          {/* Dalla 0.39.0 nessuna installazione parte da qui: prima si vede cosa cambia. */}
          <div className="fnov__tasti"><button className="tasto tasto--primario" onClick={installa}>Installa</button></div>
        </>
      ) : null}
      {agg.fase === 'fermo' && fallito === undefined ? <p>Nessun aggiornamento in corso{versione !== '' ? `: hai la ${versione}` : ''}.</p> : null}

      <div className="fnov__piede">
        <button className="account__link" onClick={() => onVai({ tipo: 'novita' })}>Cosa c’è di nuovo</button>
        <button className="tasto tasto--mini" onClick={() => void window.gestore.aggiornamenti.cerca()} title="Cerca ora un aggiornamento" disabled={agg.fase === 'cerco' || agg.fase === 'scarico' || agg.fase === 'attendo' || agg.fase === 'installo'}>⟳ Cerca ora</button>
      </div>
    </div>
  )
}

function ElencoNote({ note, etichetta, avviso }: { note: NotaResa[] | undefined; etichetta: (n: NotaResa, i: number) => string; avviso?: string }): React.JSX.Element {
  return (
    <div className="fnov__note">
      {note === undefined ? <p className="fnov__piccolo">Leggo le note dalle versioni pubblicate…</p> : null}
      {avviso !== undefined ? <p><b><Pezzi pezzi={analizzaRiga(avviso)} /></b></p> : null}
      {(note ?? []).map((n, i) => <Versione key={n.versione} n={n} etichetta={etichetta(n, i)} />)}
    </div>
  )
}

function TutteLeVersioni(): React.JSX.Element {
  return (
    <button className="account__link" onClick={() => { void window.gestore.sistema.apriEsterno(PAGINA_VERSIONI) }} title="La pagina di tutte le versioni su GitHub, con le note e gli installer">
      Tutte le versioni ▸
    </button>
  )
}

/** Le novità della versione installata (prima: la finestra «Cosa c’è di nuovo» dentro il programma). */
function Novita({ versione, onChiudi }: { versione: string; onChiudi: () => void }): React.JSX.Element {
  const n = versione !== '' ? novitaConLeUltime(versione) : undefined
  const note = n !== undefined ? noteDaNovita([n, ...(n.altre ?? [])]) : undefined
  return (
    <div className="fnov__corpo fnov__corpo--note">
      {n !== undefined ? <p className="fnov__piccolo">versione installata {n.versione}{note !== undefined && note.length > 1 ? `, con le ${note.length - 1} prima` : ''}</p> : null}
      <ElencoNote note={note} etichetta={(x, i) => (i === 0 ? `Questa versione · ${x.versione}` : `Versione ${x.versione}`)} />
      <div className="fnov__piede">
        <TutteLeVersioni />
        <button className="tasto tasto--primario" onClick={onChiudi}>Ho capito</button>
      </div>
    </div>
  )
}

/** Cosa cambia con la versione pronta, e «Installa e riavvia»: l'unico tasto che installa. */
function Installa({ versione, agg, onPiuTardi }: { versione: string; agg: StatoAggiornamento; onPiuTardi: () => void }): React.JSX.Element {
  const [dati, setDati] = useState<NoteAggiornamento | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    setDati(undefined)
    window.gestore.aggiornamenti.note()
      .then((d) => { if (vivo) setDati(d ?? { versione, installata: '', note: [], fonte: 'nessuna', dove: PAGINA_VERSIONI, avviso: `Gli aggiornamenti non sono attivi qui: le note le trovi nella pagina delle versioni, ${PAGINA_VERSIONI}.` }) })
      .catch(() => { if (vivo) setDati({ versione, installata: '', note: [], fonte: 'nessuna', dove: PAGINA_VERSIONI, avviso: `Non sono riuscito a leggere le note: le trovi scritte per esteso nella pagina delle versioni, ${PAGINA_VERSIONI}. Puoi installare lo stesso.` }) })
    return () => { vivo = false }
  }, [versione])
  const f = agg.tentativoFallito
  const avvisi = [
    ...(f !== undefined ? [`**${f.titolo}** ${f.motivo} Se non va di nuovo, scaricala a mano da ${f.pagina}`] : []),
    ...(dati?.avviso !== undefined ? [dati.avviso] : [])
  ]
  const sotto = dati === undefined ? 'leggo le note…'
    : dati.note.length > 1 ? `dalla ${dati.installata} che hai adesso: ${dati.note.length} versioni, la nuova e quelle che avevi saltato`
      : dati.installata !== '' ? `adesso hai la ${dati.installata}` : undefined
  return (
    <div className="fnov__corpo fnov__corpo--note">
      {sotto !== undefined ? <p className="fnov__piccolo">{sotto}</p> : null}
      <ElencoNote
        note={dati?.note}
        etichetta={(n, i) => (i === 0 && n.versione === versione ? `La nuova · ${n.versione}` : `Saltata · ${n.versione}`)}
        {...(avvisi.length > 0 ? { avviso: avvisi.join(' ') } : {})}
      />
      <div className="fnov__piede">
        <TutteLeVersioni />
        <span className="fnov__tasti">
          <Aiuto di="Installa e riavvia">
            «Installa e riavvia»: aspetto che le chat finiscano quello che hanno in mano (e il lavoro con il Drive, se ce n’è),
            le avviso, chiudo SierraDeck, installo e riparto da solo; al ritorno chat e autopiloti riprendono da dove erano.
            «Più tardi»: non installo; si installa solo quando lo premi tu.
          </Aiuto>
          <button className="tasto" onClick={onPiuTardi}>Più tardi</button>
          <button className="tasto tasto--primario" autoFocus onClick={() => { onPiuTardi(); void window.gestore.aggiornamenti.installa() }}>Installa e riavvia</button>
        </span>
      </div>
    </div>
  )
}
