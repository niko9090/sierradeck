import { useEffect, useState } from 'react'
import { LIMITI_DI_SERIE, limitiCambiati, MINIMO, VOCI_INTERRUTTORI, VOCI_NUMERI, type ChiaveNumero, type LimitiPc, type VistaLimiti } from '@shared/limiti-pc'
import { CLASSI, CLASSI_PERMESSO, conPermesso, DURATA_PERMESSO_MIN, PAVIMENTO, type ClassePermesso } from '@shared/permessi-nicholas'
import { Aiuto } from './Aiuto'

/**
 * **La sezione «Limiti»** delle Impostazioni del PC (11/11). Nicholas: «perché
 * hai lasciato i limiti? devono poter essere sorpassati se decisi da me».
 *
 * Qui vede e cambia i tetti e gli interruttori del PC (`limiti.json` del
 * servizio, valgono subito) e i permessi che in un progetto ha tolto con
 * «Sì, sempre», per rimetterli a «chiedi». Un permesso «sempre» nasce solo
 * dalla sua risposta a una domanda: da qui si toglie e basta.
 *
 * `iniziale` serve alle prove (il disegno senza il servizio).
 */
export function SezioneLimiti({ vede, iniziale }: { vede?: (...id: string[]) => boolean; iniziale?: VistaLimiti }): React.JSX.Element {
  const mostra = vede ?? (() => true)
  const [vista, setVista] = useState<VistaLimiti | undefined>(iniziale)
  const [letto, setLetto] = useState(iniziale !== undefined)
  const [bozza, setBozza] = useState<Partial<Record<ChiaveNumero, string>>>({})
  const [nota, setNota] = useState<string | undefined>(undefined)

  const rileggi = (): void => {
    void window.gestore.autopilota.limiti()
      .then((v) => { setVista(v); setLetto(true) })
      .catch(() => { setVista(undefined); setLetto(true) })
  }
  useEffect(() => { if (iniziale === undefined) rileggi() }, [])

  const cambia = (p: Partial<LimitiPc>): void => {
    setNota(undefined)
    void window.gestore.autopilota.impostaLimiti(p)
      .then((v) => { if (v !== undefined) setVista(v); setNota('Salvati: valgono da subito.') })
      .catch((e: unknown) => setNota(`Non salvati: ${e instanceof Error ? e.message : String(e)}`))
  }
  // Il numero si scrive una cifra alla volta: si salva quando esci dal campo o premi Invio. Vuoto = il valore di serie.
  const conferma = (k: ChiaveNumero): void => {
    const testo = bozza[k]
    if (testo === undefined) return
    setBozza((b) => { const { [k]: _via, ...resto } = b; return resto })
    const t = testo.trim()
    if (t === '') { cambia({ [k]: null } as Partial<LimitiPc>); return }
    const n = Number(t)
    if (!Number.isInteger(n) || n < MINIMO[k]) { setNota(`Serve un numero intero da ${MINIMO[k]} in su.`); return }
    cambia({ [k]: n } as Partial<LimitiPc>)
  }
  const togliSempre = (ws: string, permessi: VistaLimiti['sempre'][number]['permessi'], classe: ClassePermesso): void => {
    setNota(undefined)
    void window.gestore.autopilota.impostaOrchestratore(ws, { permessi: conPermesso(permessi, classe, 'chiedi') })
      .then(() => { setNota('Fatto: da adesso torna a chiederti.'); rileggi() })
      .catch((e: unknown) => setNota(`Non riuscito: ${e instanceof Error ? e.message : String(e)}`))
  }

  if (!letto) return <div className="impostazioni__nota">Leggo i limiti…</div>
  if (vista === undefined) return <div className="impostazioni__nota">Il servizio degli autopiloti non risponde: i limiti restano quelli di ora. Riprova fra poco.</div>
  const l = vista.limiti
  const fissi = vista.fissi === true
  const cambiati = limitiCambiati(l)
  return (
    <>
      {fissi ? <div className="impostazioni__nota">Questo servizio non ha il file dei limiti: valgono quelli di serie.</div> : null}
      {mostra('limiti-pc') ? <>
        {VOCI_NUMERI.map((v) => {
          const valore = l[v.chiave]
          const serie = LIMITI_DI_SERIE[v.chiave]
          return (
            <label key={v.chiave} className="impostazioni__riga">
              <span className="con-aiuto">{v.nome}<span onClick={(e) => e.preventDefault()}><Aiuto di={v.nome}>{v.spiega} Di serie: {serie === null ? 'lo decide il PC' : `${serie} ${v.unita}`}.</Aiuto></span></span>
              <input
                className="campo"
                type="number"
                min={MINIMO[v.chiave]}
                style={{ width: 90 }}
                disabled={fissi}
                aria-label={v.nome}
                value={bozza[v.chiave] ?? (valore === null ? '' : String(valore))}
                placeholder={serie === null ? 'il PC' : String(serie)}
                onChange={(e) => { const t = e.target.value; setBozza((b) => ({ ...b, [v.chiave]: t })) }}
                onBlur={() => conferma(v.chiave)}
                onKeyDown={(e) => { if (e.key === 'Enter') conferma(v.chiave) }}
              />
            </label>
          )
        })}
        {VOCI_INTERRUTTORI.map((v) => (
          <label key={v.chiave} className="impostazioni__riga impostazioni__riga--spunta">
            <input type="checkbox" checked={l[v.chiave]} disabled={fissi} onChange={(e) => cambia({ [v.chiave]: e.target.checked } as Partial<LimitiPc>)} />
            <span className="con-aiuto">{v.nome}<span onClick={(e) => e.preventDefault()}><Aiuto di={v.nome}>{v.spiega}</Aiuto></span></span>
          </label>
        ))}
        {cambiati.length > 0 && !fissi ? (
          <div className="impostazioni__riga">
            <span className="riga__stato">{cambiati.length === 1 ? '1 limite cambiato da te' : `${cambiati.length} limiti cambiati da te`}</span>
            <button className="tasto tasto--mini" onClick={() => cambia(LIMITI_DI_SERIE)}>Torna ai valori di serie</button>
          </div>
        ) : null}
      </> : null}
      {mostra('permessi-nicholas') ? (
        <div className="impostazioni__riga" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span className="con-aiuto">Permessi tolti con «Sì, sempre»<Aiuto di="Permessi tolti">
            Le azioni protette di autopiloti e specialisti (push forzato, posti protetti, comandi in sottofondo, cancellare fuori dalle cartelle di lavoro, strumenti negati, cose di altri) si fanno solo dopo il tuo sì a una domanda. Con «Sì, questa volta» valgono {DURATA_PERMESSO_MIN} minuti; con «Sì, sempre» quel progetto non lo chiede più, finché non lo rimetti qui. Installare SierraDeck non diventa mai «sempre». Il modello, una scadenza o una scelta «consigliata» non danno mai un permesso. {PAVIMENTO}
          </Aiuto></span>
          {vista.sempre.length === 0 ? <span className="impostazioni__nota">Nessuno: ogni azione protetta ti chiede prima.</span> : vista.sempre.map((p) => (
            <div key={p.ws} className="impostazioni__nota">
              <b>{p.nome !== '' ? p.nome : p.ws}</b>
              {CLASSI_PERMESSO.filter((c) => p.permessi[c] === 'sempre').map((c) => (
                <div key={c} className="impostazioni__riga">
                  <span>{CLASSI[c].nome}</span>
                  <button className="tasto tasto--mini" onClick={() => togliSempre(p.ws, p.permessi, c)}>Torna a chiedere</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
    </>
  )
}
