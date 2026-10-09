import { useEffect, useState } from 'react'
import {
  coloreValido, portaValida, PREFERENZE_PREDEFINITE, type Preferenze
} from '@shared/preferenze'
import { PannelloProvider } from './PannelloProvider'
import { PannelloAccount } from './PannelloAccount'
import { PannelloConsumi } from './PannelloConsumi'
import { SezioneScorciatoie } from './SezioneScorciatoie'
import { useLayoutStore } from '../state/layout'
import { contaChat, contaWorkspace, eChiusuraAutomatica, type Istantanea } from '@shared/istantanea'
import { SezionePin } from './SezionePin'
import { SezioneAggiornamenti } from './SezioneAggiornamenti'
import { NomeQuestoPc } from './PannelloAccount'
import { cercaImpostazioni, SEZIONI, type IdSezione } from '@shared/impostazioni-struttura'

/** La testata di una sezione: il titolo e la frase che dice cosa c'è dentro (0.56.0). */
function Testa({ id }: { id: IdSezione }): React.JSX.Element | null {
  const sez = SEZIONI.find((x) => x.id === id)
  if (sez === undefined) return null
  return <><h4>{sez.titolo}</h4><div className="impostazioni__nota">{sez.spiega}</div></>
}

function quandoChiusura(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * «Torna a com'era»: le ultime tre chiusure, per rimettere in piedi tutto
 * com'era dopo un crash o un aggiornamento che ha lasciato un layout rotto.
 *
 * Non e' «salvare»: all'avvio torna sempre l'ultima composizione da sola
 * (Nicholas, 23/09), e i salvataggi con nome non esistono piu'. Questa e' la
 * rete di sicurezza, e sta qui, non davanti.
 */
function SezioneTornaIndietro(): React.JSX.Element {
  const [chiusure, setChiusure] = useState<Istantanea[] | undefined>(undefined)
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const [conferma, setConferma] = useState<string | undefined>(undefined)
  const ricarica = (): void => {
    window.gestore.istantanee.elenca()
      .then((tutte) => setChiusure(tutte.filter((i) => eChiusuraAutomatica(i.nome))))
      .catch(() => setChiusure([]))
  }
  useEffect(ricarica, [])
  const torna = (nome: string): void => {
    setConferma(undefined)
    window.gestore.istantanee.carica(nome)
      .then((layout) => {
        useLayoutStore.getState().cambiaVista(layout)
        setEsito(`Rimesso com’era alla ${nome.toLowerCase()}: le chat riprendono da sole con --resume.`)
      })
      .catch((e: unknown) => setEsito(`Non sono riuscito a tornare indietro: ${e instanceof Error ? e.message : String(e)}`))
  }
  return (
    <section className="impostazioni__gruppo">
      <h4>Torna a com’era</h4>
      <div className="impostazioni__nota">
        All’avvio SierraDeck riapre da solo l’ultima composizione: workspace, chat, finestre, autopiloti. Non c’è
        niente da salvare. Ogni volta che chiudi, però, conserva com’erano le cose: qui trovi le ultime tre chiusure.
        Servono se un aggiornamento o un blocco hanno lasciato i riquadri rotti o vuoti: scegli una chiusura e torna
        tutto com’era allora. Le chat che hai davanti adesso vengono sostituite (quelle chiuse restano nell’elenco
        «Riprendi», non si perdono). Le stesse chat viaggiano anche sul Drive.
      </div>
      {chiusure === undefined ? <div className="impostazioni__nota">Leggo…</div> : null}
      {chiusure !== undefined && chiusure.length === 0 ? (
        <div className="impostazioni__nota">Nessuna chiusura registrata ancora: la prima arriva quando chiudi SierraDeck con delle chat aperte.</div>
      ) : null}
      {chiusure !== undefined && chiusure.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {chiusure.map((i) => {
            const chat = contaChat(i)
            const ws = contaWorkspace(i)
            return (
              <li key={i.nome} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{i.nome}</strong>
                  <span className="impostazioni__nota" style={{ margin: 0 }}>
                    {' '}· {quandoChiusura(i.salvataIl)} · {chat === 1 ? '1 chat' : `${chat} chat`}{ws > 1 ? ` in ${ws} workspace` : ''}{i.finestre.length > 1 ? ` · ${i.finestre.length} finestre` : ''}
                  </span>
                </span>
                {conferma === i.nome ? (
                  <>
                    <button className="tasto tasto--primario tasto--mini" onClick={() => torna(i.nome)}>Sì, torna a com’era</button>
                    <button className="tasto tasto--mini" onClick={() => setConferma(undefined)}>Annulla</button>
                  </>
                ) : (
                  <button className="tasto tasto--mini" onClick={() => setConferma(i.nome)} title="Sostituisce le chat aperte con quelle di questa chiusura">Torna a questa</button>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
      {esito !== undefined ? <div className="impostazioni__nota">{esito}</div> : null}
    </section>
  )
}

/** Le schede del menu Impostazioni. */
export type TabImpostazioni = 'generali' | 'ai' | 'account' | 'consumi'

type StatoClient = Awaited<ReturnType<typeof window.gestore.client.stato>>

/**
 * Il Client: come ci si collega, e chi si e' collegato.
 *
 * Il codice sta **qui**, sullo schermo del computer, e non viaggia mai sulla
 * rete: è tutta la sicurezza dell'accoppiamento. Chi lo legge è seduto davanti
 * al tuo computer — e a quel punto ha già il tuo computer.
 */
function SezioneClient(): React.JSX.Element {
  const [stato, setStato] = useState<StatoClient | undefined>(undefined)
  // I quadrati da inquadrare: arrivano insieme all'apertura dell'accoppiamento
  // e valgono quanto lui. Scaduto quello, non servono più a niente.
  const [qr, setQr] = useState<{ indirizzo: string; immagine: string }[]>([])
  const ricarica = (): void => {
    window.gestore.client.stato().then(setStato).catch(() => setStato(undefined))
  }
  useEffect(() => {
    ricarica()
    // Il codice scade da solo dopo tre minuti: senza un giro regolare, resterebbe
    // scritto a schermo quando non vale piu' niente.
    const h = setInterval(ricarica, 5000)
    return () => clearInterval(h)
  }, [])

  if (stato === undefined) {
    // Cercare le reti richiede un attimo: dirlo è meglio di una sezione vuota,
    // che si legge come «non c'è niente» invece che «sto guardando».
    return (
      <section className="impostazioni__gruppo">
        <h4>Client — telefono, tablet, touch</h4>
        <div className="impostazioni__nota">Cerco le reti…</div>
      </section>
    )
  }

  const codice = stato.accoppiamento?.codice
  return (
    <section className="impostazioni__gruppo">
      <h4>Client — telefono, tablet, touch</h4>
      <div className="impostazioni__nota">
        Apri sul telefono uno di questi indirizzi, poi «Aggiungi alla schermata Home».
      </div>
      {stato.indirizzi.length === 0 ? (
        <div className="impostazioni__nota">Nessuna rete locale trovata.</div>
      ) : (
        <>
          {/* Il primo è quello da cui il computer esce davvero: gli altri
              esistono — una VPN, VirtualBox, WSL — ma un telefono non li
              raggiunge quasi mai, e metterli sullo stesso piano vuol dire
              farli provare tutti. */}
          {(stato.inEvidenza ?? stato.indirizzi.slice(0, 1)).map((ind) => (
            <div key={ind} className="impostazioni__riga">
              <code className="indirizzo-buono">http://{ind}:{stato.porta}</code>
            </div>
          ))}
          {stato.indirizzi.length > (stato.inEvidenza?.length ?? 1) ? (
            <details className="altri-indirizzi">
              <summary>
                Altri indirizzi ({stato.indirizzi.length - (stato.inEvidenza?.length ?? 1)})
              </summary>
              {stato.indirizzi
                .filter((x) => !(stato.inEvidenza ?? []).includes(x))
                .map((ind) => (
                  <div key={ind} className="impostazioni__riga">
                    <code>http://{ind}:{stato.porta}</code>
                  </div>
                ))}
            </details>
          ) : null}
        </>
      )}

      {codice !== undefined ? (
        <>
          <div className="impostazioni__riga">
            <span>Codice da digitare</span>
            <strong className="codice-accoppiamento">{codice}</strong>
          </div>
          {qr.length > 0 ? (
            <>
              <div className="impostazioni__nota">
                Inquadra con la fotocamera del telefono: si collega da solo, senza
                digitare niente. Se ci sono più reti, prova il primo che funziona.
              </div>
              <div className="qr-fila">
                {qr.slice(0, 2).map((q) => (
                  <figure key={q.indirizzo} className="qr">
                    <img src={q.immagine} alt={`codice per ${q.indirizzo}`} />
                    <figcaption>{q.indirizzo}</figcaption>
                  </figure>
                ))}
              </div>
              {qr.length > 2 ? (
                <details className="altri-indirizzi">
                  <summary>Se questi non funzionano, prova gli altri ({qr.length - 2})</summary>
                  <div className="qr-fila">
                    {qr.slice(2).map((q) => (
                      <figure key={q.indirizzo} className="qr">
                        <img src={q.immagine} alt={`codice per ${q.indirizzo}`} />
                        <figcaption>{q.indirizzo}</figcaption>
                      </figure>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
          <div className="impostazioni__nota">
            Vale tre minuti e per un dispositivo solo. Il codice non passa mai
            dalla rete: sta sullo schermo, e nel quadrato qui sopra.
          </div>
          <button
            className="tasto"
            onClick={() => { setQr([]); void window.gestore.client.chiudiAccoppiamento().then(ricarica) }}
          >
            Chiudi l’accoppiamento
          </button>
        </>
      ) : (
        <button
          className="tasto"
          onClick={() => {
            void window.gestore.client
              .apriAccoppiamento()
              .then((a) => { setQr(a.qr); ricarica() })
          }}
        >
          Collega un dispositivo
        </button>
      )}

      {stato.dispositivi.length > 0 ? (
        <>
          <div className="impostazioni__nota">Dispositivi collegati</div>
          {stato.dispositivi.map((d) => (
            <div key={d.id} className="impostazioni__riga">
              <span>
                {d.nome}
                <span className="riga__stato">
                  {d.ultimoAccesso !== undefined ? ` · visto ${d.ultimoAccesso.slice(0, 16).replace('T', ' ')}` : ''}
                </span>
              </span>
              <button className="tasto" onClick={() => { void window.gestore.client.revoca(d.id).then(ricarica) }}>
                Revoca
              </button>
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}

/** I colori proposti: chi non ha voglia di sceglierne uno preme e va avanti. */
const ACCENTI = ['#4aa3ff', '#54c07a', '#e0a33c', '#dc5f5f', '#b18cf0', '#37c8c3']

/**
 * La scheda «Generali»: aspetto, rete, client, comportamento — quello che
 * finora decideva il codice, ora a portata di mano. Le modifiche si applicano
 * mentre le fai: cambiare colore e dover premere «Salva» per vedere com'è
 * significa sceglierlo alla cieca.
 */
function SchedaGenerali({ onAccount }: { onAccount: () => void }): React.JSX.Element {
  const [p, setP] = useState<Preferenze>(PREFERENZE_PREDEFINITE)
  // La ricerca e le sezioni (0.56.0).
  const [q, setQ] = useState('')
  const visibili = new Set(cercaImpostazioni(q, 'pc').map((v) => v.id))
  const vede = (...id: string[]): boolean => id.some((x) => visibili.has(x))
  const [versione, setVersione] = useState('')
  useEffect(() => { void window.gestore.sistema.versione().then(setVersione).catch(() => undefined) }, [])
  const [nota, setNota] = useState<string | undefined>(undefined)
  const copiaDettagli = (): void => {
    const testo = [`SierraDeck ${versione} — dettagli per l’aiuto`, `Sistema: ${navigator.userAgent}`, `Stile: ${p.stile}, porte ${p.portaClient}/${p.portaAutopiloti}, fuori dalla rete: ${p.clientOltreLaRete ? 'sì' : 'no'}`].join(String.fromCharCode(10))
    void navigator.clipboard.writeText(testo).then(() => setNota('Dettagli copiati: incollali dove chiedi aiuto. Non ci sono chiavi né password.')).catch(() => setNota(testo))
  }
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [salvato, setSalvato] = useState(false)

  useEffect(() => {
    window.gestore.preferenze.leggi().then(setP).catch(() => undefined)
  }, [])

  const cambia = (parziale: Partial<Preferenze>): void => {
    const nuove = { ...p, ...parziale }
    setP(nuove)
    setSalvato(false)
    // Le porte si scrivono una cifra per volta: mentre «476» non è ancora una
    // porta valida, salvarla sarebbe rifiutarla in faccia a chi sta digitando.
    if (!portaValida(nuove.portaClient) || !portaValida(nuove.portaAutopiloti)) {
      setErrore('Le porte vanno da 1024 a 65535.')
      return
    }
    if (!coloreValido(nuove.accento)) return
    setErrore(undefined)
    window.gestore.preferenze
      .imposta(nuove)
      .then(() => setSalvato(true))
      .catch((e: unknown) => setErrore(String(e)))
  }

  return (
    <div className="impostazioni-scheda">
      <div className="impostazioni__barra">
        {salvato ? <span className="riga__stato">salvate</span> : null}
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={() => cambia(PREFERENZE_PREDEFINITE)}>
          Torna ai valori di fabbrica
        </button>
      </div>

      {errore !== undefined ? <div className="riga__stato" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}

      {/* La ricerca in alto (0.56.0): sezioni e voci da @shared/impostazioni-struttura. */}
      <input
        className="campo"
        style={{ width: '100%', margin: '8px 0' }}
        value={q}
        placeholder="Cerca nelle impostazioni (per esempio: aggiornamento, PIN, porta, colore)"
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() !== '' && visibili.size === 0 ? <div className="impostazioni__nota">Niente con «{q.trim()}». Prova con un’altra parola.</div> : null}
      <div className="impostazioni">
        {vede('versioni', 'aggiorna-pc', 'scarica-da-solo', 'ultimo-tentativo') ? (
          <section className="impostazioni__gruppo">
            <Testa id="aggiornamenti" />
            <SezioneAggiornamenti p={p} cambia={cambia} versione={versione} />
          </section>
        ) : null}

        {vede('nome-pc', 'altri-pc', 'accoppiamento', 'porte', 'oltre-la-rete') ? (
          <section className="impostazioni__gruppo">
            <Testa id="computer" />
            {vede('nome-pc') ? <NomeQuestoPc /> : null}
            {vede('altri-pc') ? (
              <div className="impostazioni__riga">
                <span>Altri computer e strade</span>
                <button className="tasto" onClick={() => window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'salute' }))}>Apri la mappa dei PC (Salute)</button>
                <button className="tasto" onClick={onAccount}>Elenco e cassetta (Account)</button>
              </div>
            ) : null}
            {vede('oltre-la-rete') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.clientOltreLaRete}
              onChange={(e) => cambia({ clientOltreLaRete: e.target.checked })}
            />
            <span>Accetta il Client anche da fuori la rete locale (VPN, altra sede)</span>
          </label>
          <div className="impostazioni__nota">
            Con questo acceso resta <b>solo</b> la chiave del dispositivo a difendere
            un programma che esegue codice. Tienilo spento se non ti serve.
          </div>
            </> : null}
            {vede('porte') ? <>
          <label className="impostazioni__riga">
            <span>Porta del Client</span>
            <input
              type="number"
              value={p.portaClient}
              onChange={(e) => cambia({ portaClient: Number(e.target.value) })}
            />
          </label>
          <label className="impostazioni__riga">
            <span>Porta degli autopiloti</span>
            <input
              type="number"
              value={p.portaAutopiloti}
              onChange={(e) => cambia({ portaAutopiloti: Number(e.target.value) })}
            />
          </label>
          <div className="impostazioni__nota">
            Le porte cambiate valgono al prossimo avvio: un servizio in ascolto non
            cambia porta mentre qualcuno ci sta parlando.
          </div>
            </> : null}
          </section>
        ) : null}
        {vede('accoppiamento') ? <SezioneClient /> : null}

        {vede('pin', 'ospite', 'iberna', 'attesa-chat', 'posto-autopilota') ? (
          <section className="impostazioni__gruppo">
            <Testa id="chat" />
            {vede('ospite') ? (
              <div className="impostazioni__riga">
                <span>Dove vive ogni chat</span>
                <button className="tasto" onClick={() => window.dispatchEvent(new Event('sierradeck:dove-vive'))}>Apri «Dove vive ogni chat»</button>
              </div>
            ) : null}
            {vede('iberna') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.ibernaCambiandoWorkspace}
              onChange={(e) => cambia({ ibernaCambiandoWorkspace: e.target.checked })}
            />
            <span>Cambiando workspace, manda a dormire le chat che lasci</span>
          </label>
          <div className="impostazioni__nota">
            Ogni chat aperta tiene acceso un <b>claude.exe</b>. Spento, restano tutte
            vive e tornare è istantaneo; acceso, si chiudono e la conversazione
            riparte da dove era con un tocco.
          </div>
            </> : null}
            {vede('attesa-chat') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.mostraAttesaChat}
              onChange={(e) => cambia({ mostraAttesaChat: e.target.checked })}
            />
            <span>Mostra l’avanzamento mentre una chat lunga si apre</span>
          </label>
            <div className="impostazioni__nota">Mentre una conversazione lunga si riapre il riquadro mostra quanto manca, invece di restare vuoto.</div>
            </> : null}
            {vede('posto-autopilota') ? <>
          <label className="impostazioni__riga">
            <span>Dove mostrarlo</span>
            <select
              value={p.postoAutopilota}
              onChange={(e) => cambia({ postoAutopilota: e.target.value as Preferenze['postoAutopilota'] })}
            >
              <option value="destra">A destra della chat</option>
              <option value="sinistra">A sinistra</option>
              <option value="sopra">Sopra</option>
              <option value="sotto">Sotto</option>
            </select>
          </label>
          <label className="impostazioni__riga">
            <span>Quanto spazio prende</span>
            <input
              type="range"
              min={15}
              max={70}
              value={p.larghezzaAutopilota}
              onChange={(e) => cambia({ larghezzaAutopilota: Number(e.target.value) })}
            />
          </label>
          <div className="impostazioni__nota">
            Di lato è larghezza, sopra o sotto è altezza: è sempre la stessa
            misura, presa sull’asse su cui il diario cresce. Si può anche
            trascinare il solco fra terminale e diario.
          </div>
            </> : null}
            <div className="impostazioni__nota">«Riparti al login» degli autopiloti sta nel pannello Autopiloti, accanto all’elenco: vale per tutti insieme.</div>
          </section>
        ) : null}
        {vede('pin') ? <SezionePin /> : null}

        {vede('drive', 'torna-indietro', 'fumetti-sincronia') ? (
          <section className="impostazioni__gruppo">
            <Testa id="drive" />
            {vede('drive') ? (
              <div className="impostazioni__riga">
                <span>Drive e cassaforte</span>
                <button className="tasto" onClick={onAccount}>Apri Account → Drive</button>
              </div>
            ) : null}
            {vede('fumetti-sincronia') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.fumettiSincroniaAutomatica}
              onChange={(e) => cambia({ fumettiSincroniaAutomatica: e.target.checked })}
            />
            <span>Mostra un fumetto anche per la sincronia automatica con il Drive</span>
          </label>
          <div className="impostazioni__nota">
            La sincronia con il Drive non sta più in una striscia in alto: gli avvisi sono fumetti in basso a
            destra, che compaiono e spariscono senza spostare i riquadri. Il lavoro che chiedi tu (Fondi, Ripristina,
            Porta qui) ha sempre il suo fumetto con la barra, «Dettagli» e «Annulla». Il lavoro automatico
            (il salvataggio ogni cinque minuti, l’arrivo delle chat) spento non si vede: se ne parla solo se va
            male. Acceso, mostra una riga piccola con la percentuale, senza tasti.
          </div>
            </> : null}
          </section>
        ) : null}
        {vede('torna-indietro') ? <SezioneTornaIndietro /> : null}

        {vede('colore', 'stile', 'scorciatoie') ? (
          <section className="impostazioni__gruppo">
            <Testa id="aspetto" />
            {vede('colore') ? <>
          <label className="impostazioni__riga">
            <span>Colore</span>
            <span className="accenti">
              {ACCENTI.map((c) => (
                <button
                  key={c}
                  className={c === p.accento ? 'accento accento--scelto' : 'accento'}
                  style={{ background: c }}
                  onClick={() => cambia({ accento: c })}
                  aria-label={`colore ${c}`}
                />
              ))}
              <input
                type="color"
                className="accento accento--libero"
                value={p.accento}
                onChange={(e) => cambia({ accento: e.target.value })}
                aria-label="scegli un colore qualunque"
              />
            </span>
          </label>
          <label className="impostazioni__riga">
            <span>Chiarore del fondo</span>
            <input
              type="range"
              min={0}
              max={100}
              value={p.chiarore}
              onChange={(e) => cambia({ chiarore: Number(e.target.value) })}
            />
          </label>
            </> : null}
            {vede('stile') ? <>
          <label className="impostazioni__riga">
            <span>Stile della console</span>
            <select
              value={p.stile}
              onChange={(e) => cambia({ stile: e.target.value as Preferenze['stile'] })}
            >
              <option value="banco">Banco — metallo, solchi, densa</option>
              <option value="foglio">Foglio — piatta, arieggiata, morbida</option>
            </select>
          </label>
          <div className="impostazioni__nota">
            {p.stile === 'banco'
              ? 'Cornice sottile e riquadri a filo: su uno schermo pieno sono quattro righe di terminale in più per chat. Si impara per posizione.'
              : 'Più aria e angoli morbidi: quattro righe in meno, restituite in riposo per gli occhi dopo otto ore davanti allo schermo.'}
          </div>
            </> : null}
          </section>
        ) : null}
        {vede('scorciatoie') ? <SezioneScorciatoie p={p} cambia={cambia} /> : null}

        {vede('salute', 'registro', 'copia-dettagli') ? (
          <section className="impostazioni__gruppo">
            <Testa id="info" />
            <div className="impostazioni__riga">
              {vede('salute') ? <button className="tasto" onClick={() => window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'salute' }))}>Salute del sistema</button> : null}
              {vede('registro') ? <button className="tasto" onClick={() => void window.gestore.log.apri()}>Apri il registro</button> : null}
              {vede('copia-dettagli') ? <button className="tasto" onClick={copiaDettagli}>Copia i dettagli</button> : null}
            </div>
            {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
            <div className="impostazioni__nota">«Torna ai valori di fabbrica», in cima, rimette tutte le preferenze di questa scheda ai predefiniti (colori, stile, porte, colonne, scorciatoie, comportamenti) senza toccare chat, workspace, PIN o account.</div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Il menu **Impostazioni**, a schede: tutto in un posto solo, diviso in tab.
 *
 * Prima erano quattro tasti separati nella barra in alto — AI, Account, Consumi,
 * e le impostazioni vere e proprie — e la barra si affollava. Ora è un menu
 * unico: «Generali» per aspetto/rete/comportamento, e le altre tre come schede
 * dentro, con la stessa testa e lo stesso Chiudi. La testa e le schede restano
 * ferme, scorre solo il corpo.
 */
export function PannelloImpostazioni(
  { onChiudi, tabIniziale = 'generali' }: { onChiudi: () => void; tabIniziale?: TabImpostazioni }
): React.JSX.Element {
  const [tab, setTab] = useState<TabImpostazioni>(tabIniziale)
  useEffect(() => { setTab(tabIniziale) }, [tabIniziale])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const bottone = (t: TabImpostazioni, testo: string): React.JSX.Element => (
    <button
      className={`impostazioni__tab${tab === t ? ' impostazioni__tab--attiva' : ''}`}
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
    >
      {testo}
    </button>
  )

  return (
    <div className="pannello pannello--impostazioni">
      <div className="impostazioni__testa">
        <div className="impostazioni__testa-riga">
          <strong>Impostazioni</strong>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>
        <div className="impostazioni__tabs">
          {bottone('generali', 'Generali')}
          {bottone('ai', 'AI')}
          {bottone('account', 'Account')}
          {bottone('consumi', 'Consumi')}
        </div>
      </div>
      <div className="impostazioni__corpo">
        {tab === 'generali' ? <SchedaGenerali onAccount={() => setTab('account')} /> : null}
        {tab === 'ai' ? <PannelloProvider incorporato /> : null}
        {tab === 'account' ? <PannelloAccount incorporato /> : null}
        {tab === 'consumi' ? <PannelloConsumi incorporato /> : null}
      </div>
    </div>
  )
}
