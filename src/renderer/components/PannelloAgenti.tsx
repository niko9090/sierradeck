import { useEffect, useMemo, useState } from 'react'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { Aiuto } from './Aiuto'
import { useSorgente } from '../sorgente-autopilota'
import { daQuanto } from '@shared/attesa-vista'
import {
  FRASE_NESSUNO, SPIEGA_PANNELLO, SPIEGA_TOKEN, SPIEGA_UNIONI, STATI_AGENTE, TESTO_FERMA,
  consumoPerPc, contaAlLavoro, contatoriToken, esitiRecenti, fileInModifica, filaUnioni, schedeAgenti, testoDatiVecchi, testoToken
} from '../pannello-agenti-vista'

const RILEGGI_MS = 5_000

type Props = {
  vista: VistaAttesa | 'vecchio' | undefined
  /** I modi in cui l'autopilota scelto chiama il suo workspace (chiave, cartella). */
  riferimenti: string[]
  adesso: number
  /** Un workspace di un altro PC si guarda e basta: niente «Ferma». */
  soloLettura?: boolean
  /** Il nome dell'altro PC, quando il pannello legge da là. */
  pcNome?: string
  /** La lettura è fallita e non c'è ancora niente da mostrare. */
  nonRisponde?: boolean
  /** 25/11: quando la vista è stata letta bene l'ultima volta (ms): i dati di un altro PC fermi da troppo si dicono vecchi. */
  lettoIl?: number
  /** L'agente di cui «Ferma» aspetta il «Sì». */
  daFermare?: string
  /** Il messaggio dell'ultima fermata. */
  nota?: string
  onFerma?: (id: string) => void
  onConfermaFerma?: (id: string) => void
  onAnnullaFerma?: () => void
}

const nulla = (): void => undefined

/**
 * **Il pannello degli agenti a destra** (r-174, r-176, r-177; rifatto il 23/11): in cima i
 * contatori dei token (oggi e totali) e il consumo per PC; poi ogni agente con il suo
 * stato (un colore fisso per stato), dove gira, da quanto e quanto ha consumato; i file
 * che si stanno modificando; le unioni (la fila, quella in corso, gli esiti).
 * Non sparisce mai: se nessuno lavora lo dice con una frase. Solo disegno: la logica
 * sta in `pannello-agenti-vista.ts`.
 */
export function ElencoAgenti({ vista, riferimenti, adesso, soloLettura = false, pcNome, nonRisponde = false, lettoIl, daFermare, nota, onFerma = nulla, onConfermaFerma = nulla, onAnnullaFerma = nulla }: Props): React.JSX.Element {
  if (vista === undefined) {
    return <div className="agenti"><div className="progetti__vuoto">{nonRisponde ? `Non riesco a leggere gli agenti${pcNome !== undefined ? ` su ${pcNome}` : ''}. Riprovo da solo.` : 'Leggo gli agenti…'}</div></div>
  }
  if (vista === 'vecchio') return <div className="agenti"><div className="progetti__vuoto">{pcNome !== undefined ? `${pcNome} non sa ancora dire chi lavora: va aggiornato.` : 'Serve la versione nuova del servizio.'}</div></div>
  const schede = schedeAgenti(vista, riferimenti, adesso)
  const alLavoro = contaAlLavoro(schede)
  const token = contatoriToken(vista, riferimenti)
  const perPc = consumoPerPc(schede)
  const files = fileInModifica(schede)
  const fila = filaUnioni(vista, riferimenti, adesso)
  const vecchi = testoDatiVecchi({ pcNome, lettoIl, nonRisponde, adesso })
  const esiti = esitiRecenti(vista, riferimenti)
  return (
    <div className="agenti" aria-label={pcNome !== undefined ? `Agenti, su ${pcNome}` : 'Agenti'}>
      {vecchi !== '' ? <div className="agenti__vecchi" role="status">{vecchi}</div> : null}
      <div className="agenti__sezione">
        <span className="serigrafia con-aiuto">Token<Aiuto di="i token">{SPIEGA_TOKEN}</Aiuto></span>
        <div className="agenti__cifre">
          <div className="agenti__cifra"><b>{testoToken(token.oggi)}</b><span>oggi</span></div>
          <div className="agenti__cifra"><b>{testoToken(token.totali)}</b><span>totali</span></div>
          <div className="agenti__cifra"><b>{alLavoro}</b><span>{alLavoro === 1 ? 'agente al lavoro' : 'agenti al lavoro'}</span></div>
        </div>
        {perPc.length > 0 ? (
          <ul className="agenti__elenco agenti__pc" aria-label="Consumo per PC">
            {perPc.map((p) => (
              <li key={p.pc} className="agenti__riga">
                <span className="agenti__corpo">{p.pc}</span>
                <span className="agenti__durata">{p.agenti} {p.agenti === 1 ? 'agente' : 'agenti'}</span>
                <b className="agenti__token">{testoToken(p.token)}</b>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="agenti__sezione">
        <span className="serigrafia con-aiuto">Agenti<Aiuto di="gli agenti">{SPIEGA_PANNELLO}</Aiuto></span>
        {nota !== undefined ? <div className="progetti__quieto">{nota}</div> : null}
        {alLavoro === 0 ? <div className="spec__vuoto agenti__nessuno" role="status">{FRASE_NESSUNO}</div> : null}
        {schede.length > 0 ? (
          <ul className="agenti__elenco" aria-label="Agenti">
            {schede.map((a) => (
              <li key={a.id} className={`agenti__scheda agenti-st--${STATI_AGENTE[a.stato].colore}`} data-stato={a.stato}>
                <div className="agenti__testa">
                  <span className="agenti__pillola">{a.parole}</span>
                  {a.ruolo !== '' ? <span className="agenti__ruolo">{a.ruolo}</span> : null}
                  {a.durata !== '' ? <span className="agenti__durata">{a.stato === 'lavora' || a.stato === 'invio' ? `da ${a.durata}` : a.durata}</span> : null}
                  <span className="agenti__tasti">
                    {soloLettura ? null : daFermare === a.id ? (
                      <>
                        <span className="spec__chiede">{TESTO_FERMA.domanda}</span>
                        <button className="tasto tasto--mini" onClick={() => onConfermaFerma(a.id)}>{TESTO_FERMA.si}</button>
                        <button className="tasto tasto--mini" onClick={onAnnullaFerma}>{TESTO_FERMA.no}</button>
                      </>
                    ) : a.fermaRichiesta ? <span className="spec__chiede">fermata chiesta…</span> : a.puoFermare ? (
                      <button className="tasto tasto--mini" title="Lo ferma: il lavoro fatto resta salvato" onClick={() => onFerma(a.id)}>{TESTO_FERMA.tasto}</button>
                    ) : null}
                  </span>
                </div>
                <div className="agenti__titolo">{a.compito !== undefined ? <b>{a.compito} </b> : null}{a.titolo}</div>
                <div className="agenti__dati">
                  {a.pc !== '' ? <span title="Dove gira">{a.pc}</span> : null}
                  {a.stato === 'lavora' || a.stato === 'invio' ? <span title="Token consumati">{a.token > 0 ? `${testoToken(a.token)} token` : 'token: non noti'}</span> : null}
                  {a.file.length + a.fileAltri > 0 ? <span title={a.file.join('\n')}>{a.file.length + a.fileAltri} file</span> : null}
                </div>
                {a.nota !== '' ? <div className="agenti__nota">{a.nota}</div> : null}
                {a.adesso !== '' && a.stato === 'lavora' ? <div className="agenti__adesso" title={a.adesso}>{a.adesso}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="agenti__sezione">
        <span className="serigrafia">File in modifica</span>
        {files.righe.length === 0 ? <div className="spec__vuoto">Nessun file toccato in questo momento.</div> : (
          <ul className="agenti__elenco agenti__file" aria-label="File in modifica">
            {files.righe.map((f) => (
              <li key={f.file} className="agenti__riga">
                <span className="agenti__corpo agenti__nomefile" title={f.file}>{f.file}</span>
                <span className="agenti__durata">{f.chi.join(', ')}</span>
              </li>
            ))}
            {files.altri > 0 ? <li className="agenti__riga"><span className="agenti__durata">+ {files.altri} altri</span></li> : null}
          </ul>
        )}
      </div>

      <div className="agenti__sezione">
        <span className="serigrafia con-aiuto">Unioni<Aiuto di="le unioni">{SPIEGA_UNIONI}</Aiuto></span>
        {fila.length === 0 && esiti.length === 0 ? <div className="spec__vuoto">Nessuna unione in corso né recente.</div> : null}
        {fila.length > 0 ? (
          <ul className="agenti__elenco" aria-label="Fila delle unioni">
            {fila.map((u) => (
              <li key={u.id} className="agenti__riga agenti__riga--unione" title={u.motivo !== '' ? u.motivo : undefined} data-tono={u.tono}>
                <span className="agenti__num">{u.posizione}°</span>
                <span className="agenti__corpo">
                  {u.titolo}
                  {u.sotto !== '' ? <span className={`agenti__sotto${u.tono === 'rosso' ? ' agenti-testo--rosso' : u.aspettaTe ? ' agenti-testo--ambra' : ''}`}>{u.sotto}</span> : null}
                </span>
                <span className={`agenti__stato agenti-testo--${u.tono}`}>{u.parole}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {esiti.length > 0 ? (
          <ul className="agenti__elenco" aria-label="Esiti recenti">
            {esiti.map((e) => (
              <li key={e.id} className="agenti__riga" title={[e.motivo, e.comando].filter((t) => t !== '').join('\n')}>
                <span className={`agenti__pallino agenti-sfondo--${e.verde ? 'verde' : 'rosso'}`} aria-hidden="true" />
                <span className="agenti__corpo">
                  {e.titolo}
                  {e.motivoCorto !== '' ? <span className="agenti__sotto">{e.motivoCorto}</span> : null}
                </span>
                <span className={`agenti__stato agenti-testo--${e.verde ? 'verde' : 'rosso'}`}>{e.parole} · {daQuanto(e.quando, adesso)} fa</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Il pannello vivo: legge la lista dalla sorgente del workspace (questo PC o l'altro) ogni
 * pochi secondi e a ogni spinta, e ferma davvero con `fermaSpecialista` (solo su questo PC).
 */
export function PannelloAgenti({ riferimenti }: { riferimenti: string[] }): React.JSX.Element {
  const sorgente = useSorgente()
  const remoto = sorgente.remoto
  const [vista, setVista] = useState<VistaAttesa | 'vecchio' | undefined>(undefined)
  const [nonRisponde, setNonRisponde] = useState(false)
  const [lettoIl, setLettoIl] = useState<number | undefined>(undefined)
  const [adesso, setAdesso] = useState(() => Date.now())
  const [daFermare, setDaFermare] = useState<string | undefined>(undefined)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const rileggi = useMemo(() => (): void => {
    sorgente.attesa()
      .then((v) => { setNonRisponde(false); setLettoIl(Date.now()); setVista((p) => { const n = v ?? 'vecchio'; return JSON.stringify(p) === JSON.stringify(n) ? p : n }) })
      .catch(() => setNonRisponde(true))
  }, [sorgente])
  useEffect(() => {
    setVista(undefined)
    setLettoIl(undefined)
    rileggi()
    const t = setInterval(rileggi, RILEGGI_MS)
    const spinta = sorgente.suSpecialistiCambiati(rileggi)
    return () => { clearInterval(t); spinta?.() }
  }, [rileggi, sorgente])
  useEffect(() => { setAdesso(Date.now()) }, [vista])
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 15_000); return () => clearInterval(t) }, [])
  const rif = useMemo(() => riferimenti, [riferimenti.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const ferma = (id: string): void => {
    setDaFermare(undefined)
    void window.gestore.autopilota.fermaSpecialista(id)
      .then((r) => { setNota(r.messaggio); rileggi() })
      .catch(() => { setNota('Non è andata: il servizio non ha risposto. Riprova tra poco.'); rileggi() })
  }
  return (
    <ElencoAgenti
      vista={vista} riferimenti={rif} adesso={adesso} soloLettura={remoto !== undefined} nonRisponde={nonRisponde}
      {...(lettoIl !== undefined ? { lettoIl } : {})}
      {...(remoto !== undefined ? { pcNome: remoto.pcNome } : {})}
      {...(daFermare !== undefined ? { daFermare } : {})}
      {...(nota !== undefined ? { nota } : {})}
      onFerma={setDaFermare} onConfermaFerma={ferma} onAnnullaFerma={() => setDaFermare(undefined)}
    />
  )
}
