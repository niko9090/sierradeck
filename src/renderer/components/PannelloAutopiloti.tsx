import { useEffect, useMemo, useState } from 'react'
import { REGOLE_PUBBLICAZIONE, type RegolaPubblicazione } from '@shared/harness'
import { BOZZA_AUTOPILOTA_VUOTA, controllaBozzaAutopilota, PARTENZE, type BozzaAutopilota, type Partenza } from '@shared/azioni-telefono'
import type { Autopilota } from '@shared/autopilota'
import { descriviAutopilota, ledDi } from '@shared/autopilota-vista'
import { destinazioni } from '../destinazioni-autopilota'
import { useLayoutStore } from '../state/layout'
import { useSessionStore } from '../state/sessions'

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
  const [inCorso, setInCorso] = useState(false)
  // Vero quando l'utente ha scelto «altra cartella»: solo allora compare il
  // campo libero, che altrimenti reintrodurrebbe il percorso battuto a mano.
  const [aMano, setAMano] = useState(false)

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
      if (bozza === undefined) onChiudi()
      else if (!inCorso) setBozza(undefined)
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi, bozza, inCorso])

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
        ...(r.workspace !== undefined ? { workspace: r.workspace } : {}),
        partenza: r.partenza
      })
      setBozza(undefined)
    })
  }

  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">Autopiloti</span>
        <button
          className="tasto tasto--primario"
          onClick={() => {
            setAMano(false)
            // La prima destinazione è la chat che si sta guardando: è quella
            // giusta quasi sempre, e trovarla già scelta evita un gesto.
            setBozza(bozza === undefined ? { ...BOZZA_VUOTA, cwd: mete[0]?.cwd ?? '' } : undefined)
          }}
          disabled={inCorso}
        >
          {bozza === undefined ? '+ Nuovo autopilota' : 'Annulla'}
        </button>
        <button className="tasto" onClick={onRicarica} disabled={inCorso}>
          Aggiorna
        </button>

        <span style={{ flex: 1 }} />

        {/* Il servizio sopravvive alla chiusura dell'applicazione ma non allo
            spegnimento del PC: è questo interruttore a farlo tornare da solo. */}
        <label className="serigrafia" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={alLogin === true}
            disabled={alLogin === undefined || inCorso}
            onChange={(e) => {
              const attivare = e.target.checked
              esegui(async () => {
                const s = await window.gestore.autopilota.avvioAlLogin(attivare)
                onAlLogin(s.installato)
                // E li cambia tutti insieme: è l'interruttore generale, e
                // lasciare i singoli come stavano vorrebbe dire accendere il
                // servizio senza che ritrovi al lavoro nessuno.
                for (const a of elenco) {
                  await window.gestore.autopilota.riprendiAlRiavvio(a.id, attivare)
                }
                onRicarica()
              })
            }}
          />
          riparti al login
        </label>
      </div>

      {bozza !== undefined ? (
        <div className="nuovo-ap">
          {/* Una finestra vera, non una riga: l'obiettivo di un autopilota e'
              un mandato — vincoli, cosa non toccare, come si capisce che ha
              finito — e in una riga sola non si vedeva nemmeno quello che si
              stava scrivendo (Nicholas, 22/09/2026). Nessun tetto di
              caratteri: un documento intero va bene. */}
          <div className="nuovo-ap__testa">
            <span className="serigrafia">Nuovo autopilota</span>
            <span className="misura">Ctrl+Invio per preparare · Esc per annullare</span>
          </div>

          <label className="etichetta nuovo-ap__blocco">
            <span className="serigrafia">Cosa vuoi ottenere</span>
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
              {' '}Tutto quello che scrivi qui arriva a lui parola per parola, come mandato: non viene riassunto né tagliato.
              Invio va a capo; Ctrl+Invio prepara.
            </span>
          </label>

          <div className="nuovo-ap__riga">
            <label className="etichetta" style={{ flex: '2 1 280px' }}>
              <span className="serigrafia">In quale cartella lavora</span>
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
              <span className="misura">La cartella del progetto: è lì che legge i file, lancia i comandi e lascia il quaderno. Le chat che apre nascono lì, nel workspace da cui lo avvii.</span>
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
              <span className="serigrafia">Pubblicazione del progetto</span>
              <select
                className="campo"
                value={bozza.pubblicazione}
                onChange={(e) => setBozza({ ...bozza, pubblicazione: e.target.value as RegolaPubblicazione })}
              >
                {REGOLE_PUBBLICAZIONE.map((r) => <option key={r.valore} value={r.valore}>{r.etichetta}</option>)}
              </select>
              <span className="misura">{REGOLE_PUBBLICAZIONE.find((r) => r.valore === bozza.pubblicazione)?.spiega}</span>
            </label>
            <label className="etichetta" style={{ flex: '1 1 220px' }}>
              <span className="serigrafia">Cloud</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={bozza.cloud} onChange={(e) => setBozza({ ...bozza, cloud: e.target.checked })} />
                va sul cloud: le chat stanno sul Drive
              </span>
              <span className="misura">Il «cloud» è il Drive di SierraDeck, dove si salvano le chat. Se le chat di questo progetto stanno sul Drive (questa spunta, oppure la sincronizzazione Drive del progetto già accesa) lavora in autonomia completa, senza farti domande: commit, unione dei suoi rami, push e pubblicazione secondo la regola qui accanto. Il remoto git e gli script di pubblicazione del progetto servono solo a sapere dove mandare su e con quale comando pubblicare. Senza Drive fa commit sui suoi rami e li unisce, e basta: niente push, niente pubblicazione.</span>
            </label>
          </div>
          <p className="misura" style={{ margin: 0 }}>
            Quante chat apre lo decide lui, in base a quanto il lavoro si divide in parti indipendenti: ognuna lavora in una sua copia del progetto (un git worktree, su un suo ramo) e il suo lavoro si unisce al ramo principale a ogni turno. Il consumo lo governa il freno sui limiti del piano: sopra il 60% della finestra di 5 ore non apre chat nuove, sopra l’80% ne tiene una, sopra il 95% si ferma e riparte da solo all’azzeramento (lo stesso vale per la settimana). Non tocca mai chat e autopiloti non suoi, «Porta qui», l’account, le preferenze né file fuori dalle sue cartelle: lo impedisce il programma.
          </p>

          <label className="etichetta nuovo-ap__blocco">
            <span className="serigrafia">Partenza</span>
            <select
              className="campo"
              value={bozza.partenza}
              onChange={(e) => setBozza({ ...bozza, partenza: e.target.value as Partenza })}
            >
              {PARTENZE.map((p) => <option key={p.valore} value={p.valore}>{p.etichetta}</option>)}
            </select>
            <span className="misura">{PARTENZE.find((p) => p.valore === bozza.partenza)?.spiega}</span>
          </label>

          <label className="etichetta nuovo-ap__blocco">
            <span className="serigrafia">Come si capisce che ha finito (facoltativo, uno per riga)</span>
            <textarea
              className="campo campo--criteri"
              value={bozza.criteri}
              placeholder={'es. i test passano\nla pagina si apre senza errori in console\nil quaderno ha una scheda con cosa è cambiato'}
              onChange={(e) => setBozza({ ...bozza, criteri: e.target.value })}
              spellCheck={false}
            />
            <span className="misura">Sono i criteri di fine: li verifica lui, uno per uno, prima di dichiararsi finito. Se li lasci vuoti se li ricava da solo nell’intervista, guardando il progetto.</span>
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
            <span className="misura" style={{ flex: '1 1 100%', marginTop: 4 }}>
              {controllo !== undefined && !controllo.ok && bozza.obiettivo.trim() !== '' ? <>⚠ {controllo.errore} </> : null}
              Cosa succede dopo: legge il progetto, ti fa al massimo un paio di domande (nella sua scheda, nella scheda «Domande» del telefono, e per notifica), si scrive i criteri se non li hai dati, e {bozza.partenza === 'subito' ? 'appena è pronto comincia da solo, senza aspettare il tuo «Vai»' : 'aspetta il tuo «Vai». Non parte da solo'}. Puoi cambiargli obiettivo e vincoli anche dopo, scrivendogli nella sua scheda.
            </span>
          </div>
        </div>
      ) : null}

      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}

      {elenco.length === 0 && errore === undefined ? (
        <div className="vuoto">
          Nessun autopilota. Digli cosa vuoi ottenere: ti farà qualche domanda, poi lavora da solo
          finché non ci arriva.
        </div>
      ) : null}

      {elenco.map((a) => {
        const d = descriviAutopilota(a)
        const led = ledDi(a)
        return (
          <div key={a.id} className="riga">
            <span className={`led ${led.classe}`} title={led.titolo} />
            <span className="riga__nome">{d.titolo}</span>
            <span className="riga__stato">{d.sottotitolo}</span>
            <span className="misura">{d.avanzamento}</span>
            {/* In preparazione può servire tutt'e due: fermarla, o farla
                ripartire quando è rimasta appesa a una domanda scaduta. Il
                tasto dice quale delle due cose fa, perché «Riprendi» su un
                autopilota che si sta ancora preparando lasciava credere che
                lo mandasse al lavoro. */}
            {a.stato === 'lavoro' || a.stato === 'attesa' || a.stato === 'intervista' ? (
              <button
                className="tasto"
                onClick={() => esegui(() => window.gestore.autopilota.ferma(a.id))}
                disabled={inCorso}
              >
                Ferma
              </button>
            ) : null}
            {a.stato !== 'lavoro' && a.stato !== 'attesa' ? (
              <button
                className="tasto"
                onClick={() => esegui(() => window.gestore.autopilota.riprendi(a.id))}
                disabled={inCorso}
                title={
                  a.criteri.length === 0
                    ? 'Riprende la preparazione: è da lì che escono i criteri di fine'
                    : 'Rimette al lavoro le sue chat'
                }
              >
                {a.criteri.length === 0 ? 'Riprendi le domande' : 'Riprendi'}
              </button>
            ) : null}
            {/* «Archivia» (0.37.0): un fermo che non deve ripartire esce dalla
                banda e dalle notifiche, ma resta qui con la sua etichetta. */}
            {a.stato === 'sospeso' || a.stato === 'fallito' ? (
              a.archiviato === true ? (
                <button
                  className="tasto"
                  onClick={() => esegui(() => window.gestore.autopilota.archivia(a.id, false))}
                  disabled={inCorso}
                  title="È archiviato: non compare nella banda in alto e non manda notifiche. Toglierlo dall’archivio lo rimette fra quelli che ti avvisano, senza farlo ripartire"
                >
                  Archiviato · togli
                </button>
              ) : (
                <button
                  className="tasto"
                  onClick={() => esegui(() => window.gestore.autopilota.archivia(a.id, true))}
                  disabled={inCorso}
                  title="Lo mette da parte: resta qui, ma non compare più nella banda in alto e non manda notifiche. «Riprendi» lo rimette al lavoro"
                >
                  Archivia
                </button>
              )
            ) : null}
            {/* La sua spunta, non quella di tutti: un lavoro lungo deve poter
                riprendere da solo dopo un riavvio, e quello che stavi provando
                per curiosità no. L'interruttore qui sopra dice se il servizio
                torna su; questo dice quali autopiloti ritrova al lavoro. */}
            <label
              className="serigrafia"
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              title="Se riprendere questo autopilota da solo dopo un riavvio"
            >
              <input
                type="checkbox"
                // `!== false` e non `=== true`: chi non ha mai toccato la
                // spunta riparte, ed è il comportamento vero. Mostrarla vuota
                // direbbe il contrario di quello che poi succede.
                checked={a.riprendiAlRiavvio !== false}
                disabled={inCorso}
                aria-label={`Riparti all’avvio: ${d.titolo}`}
                onChange={(e) => {
                  const acceso = e.target.checked
                  esegui(() => window.gestore.autopilota.riprendiAlRiavvio(a.id, acceso))
                }}
              />
              avvio
            </label>
            <button
              className="tasto"
              onClick={() => esegui(() => window.gestore.autopilota.elimina(a.id))}
              disabled={inCorso}
              title="Toglie l’autopilota dall’elenco e ferma le sue chat"
              aria-label={`Elimina ${d.titolo}`}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
