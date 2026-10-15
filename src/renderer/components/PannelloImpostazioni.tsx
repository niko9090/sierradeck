import { TendinaMenu } from './TendinaMenu'
import { useEffect, useState } from 'react'
import { RigaMigrazione } from './RigaMigrazione'
import {
  coloreValido, portaValida, PREFERENZE_PREDEFINITE, type Preferenze
} from '@shared/preferenze'
import { PannelloProvider } from './PannelloProvider'
import { PannelloAccount } from './PannelloAccount'
import { SezioneScorciatoie } from './SezioneScorciatoie'
import { useLayoutStore } from '../state/layout'
import { contaChat, contaWorkspace, eChiusuraAutomatica, type Istantanea } from '@shared/istantanea'
import { SezionePin } from './SezionePin'
import { SezioneQuadernoPersonale } from './SezioneQuadernoPersonale'
import { SezioneAggiornamenti } from './SezioneAggiornamenti'
import { Aiuto } from './Aiuto'
import { NomeQuestoPc } from './PannelloAccount'
import { cercaImpostazioni, SEZIONI, type IdSezione } from '@shared/impostazioni-struttura'
import { statoCassaforte, statoDrive, statoTelefoni, statoVersione } from '@shared/stato-sistema'
import type { Colore, StatoVista } from '@shared/stato-vista'

const COLORE_IMP: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

/** La testata di una sezione: il titolo, e cosa c'è dentro dietro al suo «?» (0.62.0). */
function Testa({ id }: { id: IdSezione }): React.JSX.Element | null {
  const sez = SEZIONI.find((x) => x.id === id)
  if (sez === undefined) return null
  // L'àncora (0.70.0): la navigazione a sinistra ci porta.
  return <h4 id={`imp-${id}`} className="con-aiuto" style={{ scrollMarginTop: 12 }}>{sez.titolo}<Aiuto di={sez.titolo}>{sez.spiega}</Aiuto></h4>
}

/**
 * Un «?» dentro una `<label>`: senza, un clic sulla spiegazione aperta
 * accenderebbe o spegnerebbe la spunta della voce.
 */
function NellEtichetta({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span onClick={(e) => e.preventDefault()}><Aiuto>{children}</Aiuto></span>
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
      <h4 className="con-aiuto">Torna a com’era<Aiuto di="Torna a com’era">
        All’avvio SierraDeck riapre da solo l’ultima composizione: workspace, chat, finestre, autopiloti. Non c’è
        niente da salvare. Ogni volta che chiudi, però, conserva com’erano le cose: qui trovi le ultime tre chiusure.
        Servono se un aggiornamento o un blocco hanno lasciato i riquadri rotti o vuoti: scegli una chiusura e torna
        tutto com’era allora. Le chat che hai davanti adesso vengono sostituite (quelle chiuse restano nell’elenco
        «Riprendi», non si perdono). Le stesse chat viaggiano anche sul Drive.
      </Aiuto></h4>
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
/** Le schede (0.61.0: Consumi è in Salute, accanto alla sua colonna). */
export type TabImpostazioni = 'generali' | 'ai' | 'account'

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
      <h4 className="con-aiuto">Client — telefono, tablet, touch<Aiuto di="Client">
        Apri sul telefono uno di questi indirizzi, poi «Aggiungi alla schermata Home».
      </Aiuto></h4>
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
            <span className="con-aiuto">Codice da digitare<Aiuto di="codice">
              Vale tre minuti e per un dispositivo solo. Il codice non passa mai
              dalla rete: sta sullo schermo, e nel quadrato qui sotto.
            </Aiuto></span>
            <strong className="codice-accoppiamento">{codice}</strong>
          </div>
          {qr.length > 0 ? (
            <>
              <div className="impostazioni__nota con-aiuto">Inquadra con la fotocamera del telefono.<Aiuto di="codice da inquadrare">
                Inquadra con la fotocamera del telefono: si collega da solo, senza
                digitare niente. Se ci sono più reti, prova il primo che funziona.
              </Aiuto></div>
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
  // «Torna ai valori di fabbrica» arriva da «Strumenti ▾» (0.70.0), dopo la conferma.
  useEffect(() => {
    const suFabbrica = (): void => cambia(PREFERENZE_PREDEFINITE)
    window.addEventListener('sierradeck:impostazioni-fabbrica', suFabbrica)
    return () => window.removeEventListener('sierradeck:impostazioni-fabbrica', suFabbrica)
  })

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
      {salvato ? <div className="impostazioni__barra"><span className="riga__stato">salvate</span></div> : null}

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

        {vede('nome-pc', 'accoppiamento', 'porte', 'oltre-la-rete') ? (
          <section className="impostazioni__gruppo">
            <Testa id="computer" />
            {vede('nome-pc') ? <NomeQuestoPc /> : null}
            {vede('oltre-la-rete') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.clientOltreLaRete}
              onChange={(e) => cambia({ clientOltreLaRete: e.target.checked })}
            />
            <span className="con-aiuto">Accetta il Client anche da fuori la rete locale (VPN, altra sede)<NellEtichetta>
Con questo acceso resta <b>solo</b> la chiave del dispositivo a difendere
            un programma che esegue codice. Tienilo spento se non ti serve.
</NellEtichetta></span>
          </label>
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
            <span className="con-aiuto">Porta degli autopiloti<NellEtichetta>
Le porte cambiate valgono al prossimo avvio: un servizio in ascolto non
            cambia porta mentre qualcuno ci sta parlando.
</NellEtichetta></span>
            <input
              type="number"
              value={p.portaAutopiloti}
              onChange={(e) => cambia({ portaAutopiloti: Number(e.target.value) })}
            />
          </label>
            </> : null}
          </section>
        ) : null}
        {vede('accoppiamento') ? <SezioneClient /> : null}

        {vede('pin', 'iberna', 'attesa-chat', 'posto-autopilota') ? (
          <section className="impostazioni__gruppo">
            <Testa id="chat" />
            {vede('iberna') ? <RigaMigrazione /> : null}
            {vede('iberna') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.ibernaCambiandoWorkspace}
              onChange={(e) => cambia({ ibernaCambiandoWorkspace: e.target.checked })}
            />
            <span className="con-aiuto">Cambiando workspace, manda a dormire le chat che lasci<NellEtichetta>
Ogni chat aperta tiene acceso un <b>claude.exe</b>. Spento, restano tutte
            vive e tornare è istantaneo; acceso, si chiudono e la conversazione
            riparte da dove era con un tocco.
</NellEtichetta></span>
          </label>
            </> : null}
            {vede('attesa-chat') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.mostraAttesaChat}
              onChange={(e) => cambia({ mostraAttesaChat: e.target.checked })}
            />
            <span className="con-aiuto">Mostra l’avanzamento mentre una chat lunga si apre<NellEtichetta>
Mentre una conversazione lunga si riapre il riquadro mostra quanto manca, invece di restare vuoto.
</NellEtichetta></span>
          </label>
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
            <span className="con-aiuto">Quanto spazio prende<NellEtichetta>
Di lato è larghezza, sopra o sotto è altezza: è sempre la stessa
            misura, presa sull’asse su cui il diario cresce. Si può anche
            trascinare il solco fra terminale e diario.
</NellEtichetta></span>
            <input
              type="range"
              min={15}
              max={70}
              value={p.larghezzaAutopilota}
              onChange={(e) => cambia({ larghezzaAutopilota: Number(e.target.value) })}
            />
          </label>
            </> : null}
            <div className="impostazioni__nota con-aiuto">«Riparti al login» degli autopiloti: Autopiloti → Strumenti ▾.<Aiuto>«Riparti al login» degli autopiloti sta in Autopiloti, nel menu «Strumenti ▾»: vale per tutti insieme.</Aiuto></div>
          </section>
        ) : null}
        {vede('pin') ? <SezionePin /> : null}
        {vede('quaderno-personale') ? <SezioneQuadernoPersonale /> : null}

        {vede('account-google', 'torna-indietro', 'fumetti-sincronia') ? (
          <section className="impostazioni__gruppo">
            <Testa id="drive" />
            {vede('account-google') ? (
              <div className="impostazioni__riga">
                <span className="con-aiuto">Account Google e passphrase della cassaforte: scheda «Account».<Aiuto di="account Google">Account Google del Drive e passphrase della cassaforte: nella scheda «Account», qui sopra. Il contenuto del Drive, «Porta qui» e il salvataggio stanno in ▦ Progetti.</Aiuto></span>
                <button className="tasto" onClick={onAccount}>Vai alla scheda Account</button>
              </div>
            ) : null}
            {vede('fumetti-sincronia') ? <>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.fumettiSincroniaAutomatica}
              onChange={(e) => cambia({ fumettiSincroniaAutomatica: e.target.checked })}
            />
            <span className="con-aiuto">Mostra un fumetto anche per la sincronia automatica con il Drive<NellEtichetta>
La sincronia con il Drive non sta più in una striscia in alto: gli avvisi sono fumetti in basso a
            destra, che compaiono e spariscono senza spostare i riquadri. Il lavoro che chiedi tu (Fondi, Ripristina,
            Porta qui) ha sempre il suo fumetto con la barra, «Dettagli» e «Annulla». Il lavoro automatico
            (il salvataggio ogni cinque minuti, l’arrivo delle chat) spento non si vede: se ne parla solo se va
            male. Acceso, mostra una riga piccola con la percentuale, senza tasti.
</NellEtichetta></span>
          </label>
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
            <span className="con-aiuto">Stile della console<NellEtichetta>
              <b>Banco</b>: cornice sottile e riquadri a filo: su uno schermo pieno sono quattro righe di terminale in più per chat. Si impara per posizione.<br />
              <b>Foglio</b>: più aria e angoli morbidi: quattro righe in meno, restituite in riposo per gli occhi dopo otto ore davanti allo schermo.
</NellEtichetta></span>
            <select
              value={p.stile}
              onChange={(e) => cambia({ stile: e.target.value as Preferenze['stile'] })}
            >
              <option value="banco">Banco — metallo, solchi, densa</option>
              <option value="foglio">Foglio — piatta, arieggiata, morbida</option>
            </select>
          </label>
            </> : null}
          </section>
        ) : null}
        {vede('scorciatoie') ? <SezioneScorciatoie p={p} cambia={cambia} /> : null}

        {vede('registro', 'copia-dettagli') ? (
          <section className="impostazioni__gruppo">
            <Testa id="info" />
            <div className="impostazioni__riga">
              {vede('registro') ? <button className="tasto" onClick={() => void window.gestore.log.apri()}>Apri il registro</button> : null}
              {vede('copia-dettagli') ? <button className="tasto" onClick={copiaDettagli}>Copia i dettagli</button> : null}
            </div>
            {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
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


  // ── 0.70.0: a tutta finestra, la navigazione a sinistra, gli stati in cima ──
  const [menu, setMenu] = useState(false)
  const [fabbrica, setFabbrica] = useState(false)
  const [stati, setStati] = useState<{ versione?: StatoVista; drive?: StatoVista; cassaforte?: StatoVista; telefoni?: StatoVista }>({})
  useEffect(() => {
    void window.gestore.aggiornamenti.stato().then((a) => setStati((x) => ({ ...x, versione: statoVersione(a) }))).catch(() => undefined)
    void window.gestore.drive.stato().then((d) => setStati((x) => ({ ...x, drive: statoDrive(d) }))).catch(() => undefined)
    void window.gestore.sync.stato().then((c) => setStati((x) => ({ ...x, cassaforte: statoCassaforte(c) }))).catch(() => undefined)
    void window.gestore.client.stato().then((c) => setStati((x) => ({ ...x, telefoni: statoTelefoni(c.dispositivi.length) }))).catch(() => undefined)
  }, [])
  const vai = (id: string): void => {
    if (tab !== 'generali') setTab('generali')
    setTimeout(() => document.getElementById(`imp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const tessera = (titolo: string, st: StatoVista | undefined, dove: () => void): React.JSX.Element => (
    <button className="impostazioni__tessera" onClick={dove} title={st?.ragione}>
      <span className="progetti__quieto">{titolo}</span>
      <span style={{ color: COLORE_IMP[st?.colore ?? 'quieto'] }}>● {st?.parola ?? '…'}</span>
    </button>
  )

  return (
    <div className="progetti impostazioni-vista" role="dialog" aria-label="Impostazioni">
      <div className="progetti__testa">
        <span className="progetti__titolo">⚙ Impostazioni</span>
        <span style={{ flex: 1 }} />
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini" aria-expanded={menu} onClick={() => setMenu(!menu)}>Strumenti ▾</button>
          {menu ? (
            <TendinaMenu onChiudi={() => setMenu(false)}>
              <button className="progetti__voce" onClick={() => { setMenu(false); setFabbrica(true) }} title="Rimette le preferenze ai predefiniti, senza toccare chat, workspace, PIN o account">Torna ai valori di fabbrica…</button>
              <button className="progetti__voce" onClick={() => { setMenu(false); void window.gestore.log.apri() }}>Apri il registro</button>
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Impostazioni">Solo le preferenze: aggiornamenti, nome del computer e rete, comportamento delle chat, l’account Google, aspetto, notifiche. A sinistra le sezioni; in cima come stanno versione, Drive, cassaforte e telefoni (un clic porta alla sezione). In «Generali» c’è anche la ricerca.</Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {fabbrica ? (
        <div className="progetti__attende" style={{ color: 'var(--rosso)' }}>
          <span style={{ flex: 1 }}>Tutte le preferenze tornano ai valori di fabbrica (colori, porte, colonne, scorciatoie). Chat, workspace, PIN e account restano.</span>
          <button className="tasto tasto--mini tasto--pericolo" onClick={() => { setFabbrica(false); setTab('generali'); setTimeout(() => window.dispatchEvent(new Event('sierradeck:impostazioni-fabbrica')), 50) }}>Sì, torna ai valori di fabbrica</button>
          <button className="tasto tasto--mini" autoFocus onClick={() => setFabbrica(false)}>Annulla</button>
        </div>
      ) : null}
      <div className="impostazioni-vista__corpo">
        <nav className="impostazioni-vista__nav" aria-label="Sezioni">
          {SEZIONI.map((x) => (
            <button key={x.id} className="progetti__voce" onClick={() => vai(x.id)} title={x.spiega}>
              {x.titolo}
              {x.id === 'aggiornamenti' && stati.versione !== undefined ? <span style={{ float: 'right', color: COLORE_IMP[stati.versione.colore] }}>●</span> : null}
              {x.id === 'drive' && stati.drive !== undefined ? <span style={{ float: 'right', color: COLORE_IMP[stati.drive.colore] }}>●</span> : null}
            </button>
          ))}
          <div className="impostazioni-vista__separa" />
          <button className={`progetti__voce${tab === 'ai' ? ' impostazioni-vista__voce--accesa' : ''}`} onClick={() => setTab('ai')}>AI</button>
          <button className={`progetti__voce${tab === 'account' ? ' impostazioni-vista__voce--accesa' : ''}`} onClick={() => setTab('account')}>Account e Drive</button>
          {tab !== 'generali' ? <button className="progetti__voce" onClick={() => setTab('generali')}>‹ Generali</button> : null}
        </nav>
        <div className="impostazioni-vista__destra">
          <div className="impostazioni__tessere">
            {tessera('Versione', stati.versione, () => vai('aggiornamenti'))}
            {tessera('Drive', stati.drive, () => setTab('account'))}
            {tessera('Cassaforte', stati.cassaforte, () => setTab('account'))}
            {tessera('Telefoni', stati.telefoni, () => vai('computer'))}
          </div>
          <div className="impostazioni__corpo">
            {tab === 'generali' ? <SchedaGenerali onAccount={() => setTab('account')} /> : null}
            {tab === 'ai' ? <PannelloProvider incorporato /> : null}
            {tab === 'account' ? <PannelloAccount incorporato /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
