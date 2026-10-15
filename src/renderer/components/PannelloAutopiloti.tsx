import { TendinaMenu } from './TendinaMenu'
import { SpecialistiVista } from './SpecialistiVista'
import { MessaggiVersoLaChat, RigaDalVivo } from './DalVivoAutopilota'
import { createPortal } from 'react-dom'
import { contaGruppiAp, cercaAutopiloti, GRUPPI_AP, nelGruppoAp, ordinaAutopiloti, vistaAutopilota, type GruppoAp } from '@shared/autopiloti-vista'
import { haDomandaAperta } from '@shared/chat-autopilota'
import type { Colore } from '@shared/stato-vista'

const COLORE_AP: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }
import { useEffect, useMemo, useState } from 'react'
import { REGOLE_PUBBLICAZIONE, type RegolaPubblicazione } from '@shared/harness'
import { BOZZA_AUTOPILOTA_VUOTA, controllaBozzaAutopilota, PARTENZE, type BozzaAutopilota, type Partenza } from '@shared/azioni-telefono'
import type { Autopilota } from '@shared/autopilota'
import { destinazioni } from '../destinazioni-autopilota'
import { useLayoutStore } from '../state/layout'
import { useSessionStore } from '../state/sessions'
import { AutopilotiAltriPc } from './AutopilotiAltriPc'
import { Aiuto } from './Aiuto'
import { azioniDiFinestra } from '../azioni-finestra'
import { nomeWorkspacePerAutopilota } from '@shared/vista-elenco'

// La bozza è la stessa del telefono (0.55.0): `@shared/azioni-telefono`.
// La regola di partenza e' «stabile»: chiede prima di pubblicare. E' la scelta
// che non fa niente di irreversibile senza di te. La partenza è «via».
type Bozza = BozzaAutopilota
const BOZZA_VUOTA: Bozza = BOZZA_AUTOPILOTA_VUOTA

/** Il valore della voce che riapre il campo libero, quando la lista non basta. */
const ALTRA = '::altra'

type Props = {
  elenco: Autopilota[]
  errore: string | undefined
  alLogin: boolean | undefined
  onRicarica: () => void
  onErrore: (e: string | undefined) => void
  onAlLogin: (v: boolean | undefined) => void
  onChiudi: () => void
  /**
   * Il workspace da cui si sta avviando: l'autopilota se lo ricorda e ci fa
   * nascere le sue chat.
   *
   * Va detto adesso perché adesso è l'unico momento in cui si sa. Dopo, quando
   * la consegna arriva, la sua conversazione non esiste ancora da nessuna
   * parte: cercarla nei workspace salvati non dà niente, e la chat compariva
   * sotto gli occhi di chi guardava altro.
   */
  workspaceAttivo: string
}

/**
 * Il pannello degli autopiloti: cosa stanno facendo, e come avviarne uno.
 *
 * Le righe portano il LED accanto al nome — lo stesso della fascia, così
 * l'occhio che è stato attirato da un colore lassù lo ritrova identico qui —
 * e il modulo di creazione compare solo quando serve.
 */
export function PannelloAutopiloti({
  elenco,
  errore,
  alLogin,
  onRicarica,
  onErrore,
  onAlLogin,
  onChiudi,
  workspaceAttivo
}: Props): React.JSX.Element {
  const [bozza, setBozza] = useState<Bozza | undefined>(undefined)
  // 0.74.0: l'autopilota nuovo nasce nel suo workspace, con la vista a elenco
  // (Nicholas: «il workspace è l'ambiente in cui opera»). Si può togliere la spunta.
  const [suoWorkspace, setSuoWorkspace] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  // Vero quando l'utente ha scelto «altra cartella»: solo allora compare il
  // campo libero, che altrimenti reintrodurrebbe il percorso battuto a mano.
  const [aMano, setAMano] = useState(false)
  // La vista (0.70.0).
  const [gruppo, setGruppo] = useState<GruppoAp>('tutti')
  const [q, setQ] = useState('')
  // Il tempo passa anche se l'elenco non cambia (0.73.0): «da 12 min» e «senza segni» si aggiornano ogni mezzo minuto.
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setOra(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [scelto, setScelto] = useState<string | undefined>(undefined)
  const [menu, setMenu] = useState(false)
  const [togli, setTogli] = useState<string | undefined>(undefined)

  const panes = useLayoutStore((s) => s.panes)
  const sessions = useSessionStore((s) => s.sessions)
  const caricaSessioni = useSessionStore((s) => s.load)
  const mete = useMemo(() => destinazioni(Object.values(panes), sessions), [panes, sessions])

  // L'indice può non essere ancora stato letto se non si è mai aperta la
  // finestra delle sessioni: senza, la lista offrirebbe solo le chat aperte.
  useEffect(() => {
    if (bozza !== undefined && sessions.length === 0) void caricaSessioni()
  }, [bozza, sessions.length, caricaSessioni])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Prima il dettaglio, poi il modulo, poi la vista (0.70.0).
      if (bozza !== undefined) { if (!inCorso) setBozza(undefined) }
      else if (scelto !== undefined) setScelto(undefined)
      else onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi, bozza, inCorso, scelto])

  const esegui = (op: () => Promise<unknown>): void => {
    if (inCorso) return
    setInCorso(true)
    onErrore(undefined)
    void op()
      .then(onRicarica)
      .catch((e: unknown) => onErrore(String(e)))
      .finally(() => setInCorso(false))
  }

  // La stessa validazione del telefono (0.55.0): il primo problema, in parole.
  const controllo = bozza === undefined ? undefined : controllaBozzaAutopilota({ ...bozza, workspace: workspaceAttivo })
  const crea = (): void => {
    if (controllo === undefined || !controllo.ok) return
    const r = controllo.richiesta
    esegui(async () => {
      // Il suo workspace (0.74.0): creato adesso, diventa quello davanti, con
      // la vista a elenco già accesa. Nessuna chat in più: le apre lui.
      let workspace = r.workspace
      if (suoWorkspace) {
        const esistenti = (await window.gestore.workspace.stato()).nomi
        const nome = nomeWorkspacePerAutopilota(r.nome !== '' ? r.nome : r.obiettivo.split(/\s+/).slice(0, 4).join(' '), esistenti)
        window.dispatchEvent(new CustomEvent('sierradeck:vista-elenco', { detail: { nome, accesa: true } }))
        await azioniDiFinestra().crea(nome)
        // La finestra è già nel workspace nuovo: la barra e la colonna lo devono sapere.
        window.dispatchEvent(new CustomEvent('sierradeck:rileggi-workspace'))
        workspace = nome
      }
      // I criteri, se scritti, uno per riga: se no li ricava lui nell'intervista.
      // Quante chat: non si sceglie piu' qui (decisione di Nicholas, 30/09).
      // Le decide lui in base a quanto il lavoro si divide, dentro il freno sui
      // limiti del piano. Qui si sceglie cosa fa a lavoro finito.
      // Il workspace è quello da cui sta partendo: è lì che il suo lavoro
      // dovrà comparire, anche fra tre ore, quando chi lo ha avviato starà
      // guardando altro.
      await window.gestore.autopilota.crea({
        nome: r.nome, obiettivo: r.obiettivo, cwd: r.cwd, criteri: r.criteri, pubblicazione: r.pubblicazione,
        ...(r.vaSulCloud === true ? { vaSulCloud: true } : {}),
        ...(workspace !== undefined ? { workspace } : {}),
        partenza: r.partenza
      })
      setBozza(undefined)
    })
  }

  // ── La vista (0.70.0): tabella, gruppi, ricerca, dettaglio a destra ──
  // 0.73.0: la stessa vista per le righe e per i conti delle linguette (prima i
  // conti ignoravano la domanda aperta: «aspetta te» nella riga, «Al lavoro» nel
  // conto), con l'ultimo segno di vita come sulla pagina e nell'app.
  const vistaDi = (a: Autopilota): ReturnType<typeof vistaAutopilota> => {
    const segno = Date.parse((a as unknown as { ultimoSegno?: string }).ultimoSegno ?? '')
    return vistaAutopilota({ ...a, ...(haDomandaAperta(a) !== undefined ? { domanda: haDomandaAperta(a) } : {}) }, ora, Number.isNaN(segno) ? undefined : segno)
  }
  const righe = ordinaAutopiloti(cercaAutopiloti(elenco, q).map((a) => ({ ...a, vista: vistaDi(a) })))
  const conti = contaGruppiAp(elenco.map(vistaDi))
  const visibili = righe.filter((r) => nelGruppoAp(r.vista, gruppo))
  const sel = righe.find((r) => r.id === scelto)
  const verbo = (r: (typeof righe)[number]): React.JSX.Element | null => {
    const v = r.vista.azione
    if (v === 'ferma') return <button className="tasto tasto--mini" disabled={inCorso} onClick={(e) => { e.stopPropagation(); esegui(() => window.gestore.autopilota.ferma(r.id)) }}>Ferma</button>
    if (v === 'rispondi') return <button className="tasto tasto--mini tasto--acceso" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'domande' })) }} title="Apre le Domande: la sua domanda è lì">Rispondi</button>
    return <button className="tasto tasto--mini" disabled={inCorso} onClick={(e) => { e.stopPropagation(); esegui(() => window.gestore.autopilota.riprendi(r.id)) }} title={r.criteri.length === 0 ? 'Riprende la preparazione: è da lì che escono i criteri di fine' : 'Rimette al lavoro le sue chat'}>{r.criteri.length === 0 ? 'Riprendi le domande' : 'Riprendi'}</button>
  }

  return createPortal(
    <div className="progetti autopiloti" role="dialog" aria-label="Autopiloti">
      <div className="progetti__testa">
        <span className="progetti__titolo">◉ Autopiloti</span>
        <div className="progetti__gruppi" role="tablist">
          {GRUPPI_AP.filter((g) => g.id === 'tutti' || conti[g.id] > 0 || g.id === gruppo).map((g) => (
            <button key={g.id} role="tab" aria-selected={gruppo === g.id} className={`progetti__gruppo${gruppo === g.id ? ' progetti__gruppo--acceso' : ''}${g.id === 'aspettano' ? ' progetti__gruppo--ambra' : ''}`} onClick={() => setGruppo(g.id)}>
              {g.testo} <span className="progetti__conto">{conti[g.id]}</span>
            </button>
          ))}
        </div>
        <input className="campo campo--mini progetti__cerca" placeholder="Cerca per nome, obiettivo o cartella" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ flex: 1 }} />
        <button
          className="tasto tasto--primario"
          onClick={() => {
            setAMano(false)
            setScelto(undefined)
            // La prima destinazione è la chat che si sta guardando: è quella
            // giusta quasi sempre, e trovarla già scelta evita un gesto.
            setBozza(bozza === undefined ? { ...BOZZA_VUOTA, cwd: mete[0]?.cwd ?? '' } : undefined)
          }}
          disabled={inCorso}
        >
          {bozza === undefined ? '+ Nuovo autopilota' : 'Annulla'}
        </button>
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini" aria-expanded={menu} onClick={() => setMenu(!menu)}>Strumenti ▾</button>
          {menu ? (
            <TendinaMenu onChiudi={() => setMenu(false)}>
              <button className="progetti__voce" disabled={inCorso} onClick={() => { setMenu(false); onRicarica() }}>Aggiorna</button>
              {/* Il servizio sopravvive alla chiusura dell'applicazione ma non allo
                  spegnimento del PC: è questo interruttore a farlo tornare da solo. */}
              <label className="progetti__voce" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Il servizio degli autopiloti riparte da solo all’accesso a Windows, con tutti gli autopiloti">
                <input
                  type="checkbox"
                  checked={alLogin === true}
                  disabled={alLogin === undefined || inCorso}
                  onChange={(e) => {
                    const attivare = e.target.checked
                    esegui(async () => {
                      const s = await window.gestore.autopilota.avvioAlLogin(attivare)
                      onAlLogin(s.installato)
                      // E li cambia tutti insieme: è l'interruttore generale.
                      for (const a of elenco) {
                        await window.gestore.autopilota.riprendiAlRiavvio(a.id, attivare)
                      }
                      onRicarica()
                    })
                  }}
                />
                Riparti al login
              </label>
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Autopiloti">
          Un autopilota guida una o più chat verso un obiettivo, finché i criteri di fine non sono soddisfatti. Stato: <span style={{ color: 'var(--verde)' }}>al lavoro</span>, <span style={{ color: 'var(--ambra)' }}>aspetta te</span> (una domanda nelle Domande), <span style={{ color: 'var(--ambra)' }}>senza segni</span> (nessun segno da 10 minuti), <span style={{ color: 'var(--blu)' }}>si prepara</span> o <span style={{ color: 'var(--blu)' }}>pronto</span> (aspetta il tuo «Vai»), fermo, finito, <span style={{ color: 'var(--rosso)' }}>guasto</span>. Clic su una riga: il dettaglio con obiettivo, criteri e messaggi.
        </Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {errore !== undefined ? <div className="progetti__striscia">⚠ {errore}</div> : null}

      <div className={`progetti__corpo${sel !== undefined || bozza !== undefined ? ' progetti__corpo--destra' : ''}`}>
        <div className="progetti__tabella" role="grid">
          <div className="progetti__riga progetti__riga--testa" role="row">
            <span className="progetti__cella">Autopilota</span>
            <span className="progetti__cella">Chat</span>
            <span className="progetti__cella">Criteri</span>
            <span className="progetti__cella">Ultima azione</span>
            <span className="progetti__cella">Da</span>
            <span className="progetti__cella">Stato</span>
            <span className="progetti__cella" />
          </div>
          {elenco.length === 0 && errore === undefined ? <div className="progetti__vuoto">Nessun autopilota · <button className="account__link" onClick={() => setBozza({ ...BOZZA_VUOTA, cwd: mete[0]?.cwd ?? '' })}>Affida un lavoro</button></div> : null}
          {elenco.length > 0 && visibili.length === 0 ? <div className="progetti__vuoto">{q !== '' ? `Nessun autopilota per «${q}».` : 'Nessuno in questo gruppo.'}</div> : null}
          {visibili.map((r) => {
            const acceso = r.id === scelto
            return (
              <div key={r.id} role="row" tabIndex={0} aria-selected={acceso}
                className={`progetti__riga${acceso ? ' progetti__riga--scelta' : ''}`}
                onClick={() => { setScelto(acceso ? undefined : r.id); setBozza(undefined) }}>
                <span className="progetti__cella" title={r.cwd}><b>{r.nome !== '' ? r.nome : r.obiettivo.slice(0, 60)}</b> <span className="progetti__quieto">{r.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? ''}</span></span>
                <span className="progetti__cella">{r.vista.chat.testo}</span>
                <span className="progetti__cella">{r.vista.criteri.testo}</span>
                <span className="progetti__cella progetti__quieto" title={r.vista.ultima}>{r.vista.ultima}</span>
                <span className="progetti__cella progetti__quieto">{r.vista.da}</span>
                <span className="progetti__cella" title={r.vista.stato.ragione}><span style={{ color: COLORE_AP[r.vista.stato.colore] }}>● {r.vista.stato.parola}</span></span>
                <span className="progetti__cella" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>{verbo(r)}</span>
              </div>
            )
          })}
          {/* Gli autopiloti degli altri PC (0.59.0): stessa chiave di casa, «gira su <PC>». */}
          <div style={{ padding: '12px 16px' }}><AutopilotiAltriPc /></div>
        </div>

        {bozza !== undefined ? (
          <div className="progetti__dettaglio autopiloti__modulo">
            <div className="progetti__dcorpo">
        <div className="nuovo-ap">
          {/* Una finestra vera, non una riga: l'obiettivo di un autopilota e'
              un mandato — vincoli, cosa non toccare, come si capisce che ha
              finito — e in una riga sola non si vedeva nemmeno quello che si
              stava scrivendo (Nicholas, 22/09/2026). Nessun tetto di
              caratteri: un documento intero va bene. */}
          <div className="nuovo-ap__testa">
            <span className="con-aiuto"><span className="serigrafia">Nuovo autopilota</span><Aiuto di="Nuovo autopilota">Quante chat apre lo decide lui, in base a quanto il lavoro si divide in parti indipendenti: ognuna lavora in una sua copia del progetto (un git worktree, su un suo ramo) e il suo lavoro si unisce al ramo principale a ogni turno. Il consumo lo governa il freno sui limiti del piano: sopra il 60% della finestra di 5 ore non apre chat nuove, sopra l’80% ne tiene una, sopra il 95% si ferma e riparte da solo all’azzeramento (lo stesso vale per la settimana). Non tocca mai chat e autopiloti non suoi, «Porta qui», l’account, le preferenze né file fuori dalle sue cartelle: lo impedisce il programma.</Aiuto></span>
            <span className="misura">Ctrl+Invio per preparare · Esc per annullare</span>
          </div>

          <label className="etichetta nuovo-ap__blocco">
            <span className="con-aiuto"><span className="serigrafia">Cosa vuoi ottenere</span><Aiuto di="Cosa vuoi ottenere">Tutto quello che scrivi qui arriva a lui parola per parola, come mandato: non viene riassunto né tagliato. Invio va a capo; Ctrl+Invio prepara.</Aiuto></span>
            <textarea
              autoFocus
              className="campo campo--obiettivo"
              value={bozza.obiettivo}
              placeholder={'Descrivilo con parole tue, tutto quello che serve: l’obiettivo, i vincoli (cosa non toccare, cosa non fare), come si capisce che ha finito, dove guardare. Puoi incollare un documento intero.'}
              onChange={(e) => setBozza({ ...bozza, obiettivo: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); crea() } }}
              spellCheck={false}
            />
            <span className="misura nuovo-ap__conto">
              {bozza.obiettivo.trim() === '' ? 'Ancora niente.' : `${bozza.obiettivo.length.toLocaleString('it-IT')} caratteri, ${bozza.obiettivo.trim().split(/\s+/).length.toLocaleString('it-IT')} parole.`}
            </span>
          </label>

          <div className="nuovo-ap__riga">
            <label className="etichetta" style={{ flex: '2 1 280px' }}>
              <span className="con-aiuto"><span className="serigrafia">In quale cartella lavora</span><Aiuto di="In quale cartella lavora">La cartella del progetto: è lì che legge i file, lancia i comandi e lascia il quaderno. Le chat che apre nascono lì, nel workspace da cui lo avvii.</Aiuto></span>
              {aMano || mete.length === 0 ? (
                <>
                  <input
                    className="campo"
                    value={bozza.cwd}
                    placeholder="C:\Users\...\progetto"
                    onChange={(e) => setBozza({ ...bozza, cwd: e.target.value })}
                  />
                  {mete.length > 0 ? (
                    <button
                      type="button"
                      className="collegamento"
                      onClick={() => {
                        setAMano(false)
                        setBozza({ ...bozza, cwd: mete[0]?.cwd ?? '' })
                      }}
                    >
                      torna alla lista
                    </button>
                  ) : null}
                </>
              ) : (
                <select
                  className="campo"
                  value={bozza.cwd}
                  onChange={(e) => {
                    if (e.target.value === ALTRA) {
                      setAMano(true)
                      setBozza({ ...bozza, cwd: '' })
                    } else setBozza({ ...bozza, cwd: e.target.value })
                  }}
                >
                  {mete.some((m) => m.aperta) ? (
                    <optgroup label="Chat aperte adesso">
                      {mete
                        .filter((m) => m.aperta)
                        .map((m) => (
                          <option key={m.cwd} value={m.cwd}>
                            {m.etichetta} — {m.dettaglio}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                  {mete.some((m) => !m.aperta) ? (
                    <optgroup label="Progetti recenti">
                      {mete
                        .filter((m) => !m.aperta)
                        .map((m) => (
                          <option key={m.cwd} value={m.cwd}>
                            {m.etichetta} — {m.dettaglio}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                  <option value={ALTRA}>Altra cartella…</option>
                </select>
              )}
            </label>

            <label className="etichetta" style={{ flex: '1 1 200px' }}>
              <span className="serigrafia">Nome (facoltativo)</span>
              <input
                className="campo"
                value={bozza.nome}
                placeholder="Se vuoto: le prime parole dell’obiettivo"
                onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
              />
              <span className="misura">Come lo vedi nell’elenco, nei LED e nelle notifiche.</span>
            </label>

          </div>

          <div className="nuovo-ap__riga">
            <label className="etichetta" style={{ flex: '2 1 280px' }}>
              <span className="con-aiuto"><span className="serigrafia">Pubblicazione del progetto</span><Aiuto di="Pubblicazione del progetto">{REGOLE_PUBBLICAZIONE.find((r) => r.valore === bozza.pubblicazione)?.spiega}</Aiuto></span>
              <select
                className="campo"
                value={bozza.pubblicazione}
                onChange={(e) => setBozza({ ...bozza, pubblicazione: e.target.value as RegolaPubblicazione })}
              >
                {REGOLE_PUBBLICAZIONE.map((r) => <option key={r.valore} value={r.valore}>{r.etichetta}</option>)}
              </select>
            </label>
            <div className="etichetta" style={{ flex: '1 1 220px' }}>
              <span className="con-aiuto"><span className="serigrafia">Cloud</span><Aiuto di="Cloud">Il «cloud» è il Drive di SierraDeck, dove si salvano le chat. Se le chat di questo progetto stanno sul Drive (questa spunta, oppure la sincronizzazione Drive del progetto già accesa) lavora in autonomia completa, senza farti domande: commit, unione dei suoi rami, push e pubblicazione secondo la regola qui accanto. Il remoto git e gli script di pubblicazione del progetto servono solo a sapere dove mandare su e con quale comando pubblicare. Senza Drive fa commit sui suoi rami e li unisce, e basta: niente push, niente pubblicazione.</Aiuto></span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={bozza.cloud} onChange={(e) => setBozza({ ...bozza, cloud: e.target.checked })} />
                va sul cloud: le chat stanno sul Drive
              </label>
            </div>
          </div>

          <label className="etichetta nuovo-ap__blocco">
            <span className="con-aiuto"><span className="serigrafia">Partenza</span><Aiuto di="Partenza">{PARTENZE.find((p) => p.valore === bozza.partenza)?.spiega}</Aiuto></span>
            <select
              className="campo"
              value={bozza.partenza}
              onChange={(e) => setBozza({ ...bozza, partenza: e.target.value as Partenza })}
            >
              {PARTENZE.map((p) => <option key={p.valore} value={p.valore}>{p.etichetta}</option>)}
            </select>
          </label>

          <label className="etichetta nuovo-ap__blocco" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={suoWorkspace} onChange={(e) => setSuoWorkspace(e.target.checked)} />
            <span className="con-aiuto">Nel suo workspace, a elenco<Aiuto di="il suo workspace">Crea un workspace con il nome dell’autopilota e lo porta davanti: a sinistra lui e i suoi specialisti, a destra una chat sola, grande. Non apre chat in più: apre lui quelle che servono, e chiude da sole quelle che hanno finito. Togli la spunta per farlo lavorare nel workspace che hai davanti.</Aiuto></span>
          </label>

          <label className="etichetta nuovo-ap__blocco">
            <span className="con-aiuto"><span className="serigrafia">Come si capisce che ha finito (facoltativo, uno per riga)</span><Aiuto di="criteri di fine">Sono i criteri di fine: li verifica lui, uno per uno, prima di dichiararsi finito. Se li lasci vuoti se li ricava da solo nell’intervista, guardando il progetto.</Aiuto></span>
            <textarea
              className="campo campo--criteri"
              value={bozza.criteri}
              placeholder={'es. i test passano\nla pagina si apre senza errori in console\nil quaderno ha una scheda con cosa è cambiato'}
              onChange={(e) => setBozza({ ...bozza, criteri: e.target.value })}
              spellCheck={false}
            />
          </label>

          <div className="nuovo-ap__azioni">
            <button
              className="tasto tasto--primario"
              onClick={crea}
              disabled={inCorso || controllo?.ok !== true}
              title={controllo !== undefined && !controllo.ok ? controllo.errore : 'Prepara l’autopilota'}
            >
              {inCorso ? 'Preparo…' : 'Prepara'}
            </button>
            <button className="tasto" onClick={() => setBozza(undefined)} disabled={inCorso}>Annulla</button>
            <Aiuto di="Prepara">
              Cosa succede dopo: legge il progetto, ti fa al massimo un paio di domande (nella sua scheda, nella scheda «Domande» del telefono, e per notifica), si scrive i criteri se non li hai dati, e {bozza.partenza === 'subito' ? 'appena è pronto comincia da solo, senza aspettare il tuo «Vai»' : 'aspetta il tuo «Vai». Non parte da solo'}. Puoi cambiargli obiettivo e vincoli anche dopo, scrivendogli nella sua scheda.
            </Aiuto>
            {controllo !== undefined && !controllo.ok && bozza.obiettivo.trim() !== '' ? <span className="misura" style={{ flex: '1 1 100%', marginTop: 4 }}>⚠ {controllo.errore}</span> : null}
          </div>
        </div>
            </div>
          </div>
        ) : sel !== undefined ? (
          <div className="progetti__dettaglio">
            <div className="progetti__dtesta">
              <span className="progetti__dtitolo" title={sel.nome}>{sel.nome !== '' ? sel.nome : sel.obiettivo.slice(0, 60)}</span>
              <button className="tasto tasto--mini" onClick={() => setScelto(undefined)} aria-label="Chiudi il dettaglio">×</button>
            </div>
            <div style={{ padding: '0 16px 4px' }}>
              <span className="progetti__pillola" style={{ color: COLORE_AP[sel.vista.stato.colore], borderColor: COLORE_AP[sel.vista.stato.colore] }}>{sel.vista.stato.parola}{sel.vista.da !== '' ? ` · da ${sel.vista.da}` : ''}</span>
            </div>
            <div className="progetti__azioni">
              {verbo(sel)}
              {/* La sua spunta: riprendere da solo dopo un riavvio. */}
              <label className="progetti__quieto" style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="Se riprendere questo autopilota da solo dopo un riavvio">
                <input type="checkbox" checked={sel.riprendiAlRiavvio !== false} disabled={inCorso} onChange={(e) => { const acceso = e.target.checked; esegui(() => window.gestore.autopilota.riprendiAlRiavvio(sel.id, acceso)) }} />
                riparte dopo un riavvio
              </label>
              {/* In sottofondo solo se lo chiedi tu (0.72.0): di serie la chat sta in un riquadro del suo workspace. */}
              <label className="progetti__quieto" style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="Di serie la sua chat sta in un riquadro del suo workspace, e una consegna porta la finestra lì (mai mentre scrivi). Acceso: lavora senza riquadro, con un avviso e «Guarda».">
                <input type="checkbox" checked={sel.sottofondo === true} disabled={inCorso} onChange={(e) => { const acceso = e.target.checked; esegui(() => window.gestore.autopilota.sottofondo(sel.id, acceso)) }} />
                lavora in sottofondo
              </label>
              {/* I criteri si misurano solo mentre lavora o quando lo chiedi tu (0.72.0). */}
              {sel.stato !== 'lavoro' && sel.criteri.some((c) => c.comando !== undefined) ? (
                <button className="tasto tasto--mini" disabled={inCorso} onClick={() => esegui(() => window.gestore.autopilota.ricontrollaCriteri(sel.id))}
                  title="Misura adesso i criteri con un comando (test, typecheck…). Da solo il programma non lo fa più: solo mentre l’autopilota lavora o quando lo chiedi tu.">
                  Ricontrolla i criteri
                </button>
              ) : null}
              {/* «Archivia» (0.37.0): un fermo che non deve ripartire esce dalla banda e dalle notifiche. */}
              {sel.stato === 'sospeso' || sel.stato === 'fallito' ? (
                <button className="tasto tasto--mini" disabled={inCorso} onClick={() => esegui(() => window.gestore.autopilota.archivia(sel.id, sel.archiviato !== true))}
                  title={sel.archiviato === true ? 'Lo rimette fra quelli che ti avvisano, senza farlo ripartire' : 'Lo mette da parte: resta qui, ma niente banda in alto e niente notifiche'}>
                  {sel.archiviato === true ? 'Archiviato · togli' : 'Archivia'}
                </button>
              ) : null}
              <span className="con-aiuto" style={{ marginLeft: 'auto' }}>
                {togli === sel.id ? (
                  <>
                    <button className="tasto tasto--mini tasto--pericolo" disabled={inCorso} onClick={() => { setTogli(undefined); setScelto(undefined); esegui(() => window.gestore.autopilota.elimina(sel.id)) }}>Sì, togli</button>
                    <button className="tasto tasto--mini" autoFocus onClick={() => setTogli(undefined)}>Annulla</button>
                  </>
                ) : (
                  <button className="tasto tasto--mini tasto--pericolo" disabled={inCorso} onClick={() => setTogli(sel.id)}>Togli…</button>
                )}
                <Aiuto di="Togli">Toglie l’autopilota dall’elenco e ferma le sue chat. Le conversazioni restano.</Aiuto>
              </span>
            </div>
            <div className="progetti__dcorpo">
              {sel.vista.stato.ragione !== undefined ? <div className="progetti__voceelenco" style={{ color: COLORE_AP[sel.vista.stato.colore] }}>{sel.vista.stato.ragione}</div> : null}
              <div className="progetti__sezione">
                <span className="serigrafia">Obiettivo</span>
                <div className="progetti__voceelenco" style={{ whiteSpace: 'pre-wrap', alignItems: 'flex-start' }}>{sel.obiettivo.length > 600 ? `${sel.obiettivo.slice(0, 600)}…` : sel.obiettivo}</div>
              </div>
              <div className="progetti__sezione">
                <span className="serigrafia">Criteri {sel.vista.criteri.testo}</span>
                {sel.criteri.length === 0 ? <div className="progetti__quieto">Li prepara lui, guardando il progetto.</div> : null}
                {sel.criteri.map((c, i) => (
                  <div key={i} className="progetti__voceelenco"><span style={{ color: c.soddisfatto ? 'var(--verde)' : 'var(--testo-quieto)' }}>{c.soddisfatto ? '✓' : '○'}</span> {c.descrizione}</div>
                ))}
              </div>
              <div className="progetti__sezione">
                <span className="serigrafia">Dal vivo</span>
                <RigaDalVivo autopilota={sel} />
              </div>
              <MessaggiVersoLaChat autopilota={sel} onCambiato={onRicarica} />
              <SpecialistiVista autopilota={sel} onGuarda={onChiudi} />
              <div className="progetti__quieto">Il dialogo, il diario, le istruzioni e i file stanno nella sua scheda, accanto alla sua chat.</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
