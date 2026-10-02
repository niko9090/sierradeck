import { useEffect, useState } from 'react'
import type { Consumi } from '@shared/consumi'
import { LARGHEZZA_CONSUMI } from '@shared/preferenze'
import { SOGLIE_FRENO } from '@shared/harness'
import { LETTURA_VECCHIA_MS } from '@shared/limiti-piano'

/**
 * «Consumi e limiti» sul PC: una colonna laterale fissa accanto alle chat
 * (0.37.0), con la stessa meccanica delle Domande — si apre e si chiude dal
 * tasto «Consumi» della console, aperta/chiusa e larghezza si ritrovano al
 * riavvio (preferenze `consumiLaterali`, `larghezzaConsumi`), e puo' stare
 * aperta insieme alle Domande quando c'e' posto.
 *
 * Tutti i numeri vengono da `/api/consumi` del computer, cioe' da
 * `limiti-piano.ts`: la stessa lettura della pagina, dell'app e del freno
 * degli autopiloti. Nicholas vuole i testi per esteso: cosa guarda, cosa vuol
 * dire ogni numero, da dove arriva, cosa fare se non torna.
 */

type Props = {
  onChiudi: () => void
  larghezza: number
  onLarghezza: (px: number) => void
  /** Quanti autopiloti stanno lavorando adesso: il freno vale per loro. */
  autopilotiAlLavoro: number
}

/** Ogni quanto si rilegge: i limiti cambiano a ogni risposta di una chat. */
const OGNI_MS = 15_000

const STATO: Record<string, string> = {
  fresca: 'lettura fresca',
  vecchia: 'lettura vecchia',
  azzerata: 'azzerata, in attesa'
}

export function ColonnaConsumi({ onChiudi, larghezza, onLarghezza, autopilotiAlLavoro }: Props): React.JSX.Element {
  const [consumi, setConsumi] = useState<Consumi | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [larga, setLarga] = useState(larghezza)
  useEffect(() => setLarga(larghezza), [larghezza])

  useEffect(() => {
    const leggi = (): void => {
      window.gestore.sessions.consumi()
        .then((c) => { setConsumi(c); setErrore(undefined) })
        .catch((e: unknown) => setErrore(String(e)))
    }
    leggi()
    const t = setInterval(leggi, OGNI_MS)
    return () => clearInterval(t)
  }, [])

  /** La maniglia sul bordo sinistro, come nelle Domande: si salva al rilascio. */
  const trascina = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const bersaglio = e.currentTarget
    bersaglio.setPointerCapture(e.pointerId)
    const partenza = e.clientX
    const iniziale = larga
    let ultima = iniziale
    const muovi = (ev: PointerEvent): void => {
      ultima = Math.round(Math.min(LARGHEZZA_CONSUMI.max, Math.max(LARGHEZZA_CONSUMI.min, iniziale + (partenza - ev.clientX))))
      setLarga(ultima)
    }
    const molla = (): void => {
      bersaglio.removeEventListener('pointermove', muovi)
      bersaglio.removeEventListener('pointerup', molla)
      onLarghezza(ultima)
    }
    bersaglio.addEventListener('pointermove', muovi)
    bersaglio.addEventListener('pointerup', molla)
  }

  const limiti = consumi?.limiti
  const finestra = (nome: string, f: NonNullable<Consumi['limiti']>['cinqueOre'], cosa: string): React.JSX.Element => {
    const p = f === undefined ? 0 : Math.round(f.percento)
    const classe = f?.stato === 'azzerata' ? 'limite__pieno--spento' : p >= 95 ? 'limite__pieno--rosso' : p >= 80 ? 'limite__pieno--ambra' : ''
    return (
      <div className="limite">
        <div className="limite__testa">
          <span className="riga__nome">{nome}</span>
          <span className="misura">{f === undefined ? 'non ancora letta' : `${f.stato === 'azzerata' ? '—' : `${p}%`} · ${STATO[f.stato] ?? f.stato}`}</span>
        </div>
        <div className="limite__barra" title={f === undefined ? 'non ancora letta' : `${p}%`}>
          <span className={`limite__pieno ${classe}`} style={{ width: `${Math.max(f === undefined || f.stato === 'azzerata' ? 0 : 1, p)}%` }} />
        </div>
        <div className="misura consumi-lato__frase">{f === undefined ? 'Nessuna chat aperta dal computer l’ha ancora letta.' : f.etichetta}</div>
        <div className="misura consumi-lato__spiega">{cosa}</div>
      </div>
    )
  }

  const chat = consumi?.chatAperte ?? []
  // Le chat di altri PC nei workspace (0.39.3): qui non si contano, si segnano.
  const [remote, setRemote] = useState(0)
  useEffect(() => {
    window.gestore.workspace.remote().then((r) => setRemote(Object.values(r).reduce((a, b) => a + b, 0))).catch(() => undefined)
  }, [consumi])
  const freno = consumi?.freno
  const vecchiaMin = Math.round(LETTURA_VECCHIA_MS / 60_000)

  return (
    <aside className="domande-lato consumi-lato" style={{ width: larga }} aria-label="Consumi e limiti">
      <div
        className="domande-lato__maniglia"
        role="separator"
        aria-orientation="vertical"
        title="Trascina per cambiare la larghezza della colonna «Consumi e limiti»"
        onPointerDown={trascina}
      />
      <div className="domande-lato__testa">
        <span className="serigrafia">Consumi e limiti</span>
        <span className="misura">{consumi === undefined ? 'leggo…' : limiti === undefined ? 'limiti non letti' : limiti.vecchio ? 'lettura vecchia' : 'aggiornati'}</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={onChiudi} title="Chiude la colonna. Si riapre dal tasto «Consumi» della console.">×</button>
      </div>
      <div className="consumi-lato__corpo">
        <p className="misura domande-lato__cosa">
          Quanto resta del tuo piano Claude, quanto è piena la memoria di ogni chat aperta e cosa fanno di conseguenza gli autopiloti. Si rilegge da sola ogni {OGNI_MS / 1000} secondi; è la stessa lettura che vedi nella pagina e nell’app del telefono.
        </p>
        {errore !== undefined ? <div className="avviso">⚠ Non riesco a leggere i consumi: {errore}</div> : null}

        <div className="serigrafia consumi-lato__titolo">Limiti del piano</div>
        {finestra('Finestra di 5 ore', limiti?.cinqueOre, 'La percentuale è quanto hai usato della finestra mobile di cinque ore del tuo abbonamento, su tutte le chat e su tutti i tuoi dispositivi. Al 100% le chat si fermano fino all’ora di azzeramento, poi si riparte da zero.')}
        {finestra('Settimana', limiti?.settimana, 'La percentuale è quanto hai usato del tetto settimanale, su tutti i modelli. Chi lo tocca resta fermo fino al giorno e all’ora di azzeramento, qualunque sia la finestra di cinque ore.')}
        <p className="misura consumi-lato__spiega">
          Da dove arrivano: Claude Code li passa alla riga di stato di ogni chat aperta da SierraDeck dopo ogni risposta (sono gli stessi numeri di «/usage»; solo con abbonamento Pro o Max). Fra tutte le chat vale la lettura più recente: la finestra più nuova e, dentro la stessa finestra, la lettura confermata per ultima — non la chat che ha scritto per ultima né il numero più alto. «Letto N minuti fa» è l’età della lettura; oltre {vecchiaMin} minuti è segnata vecchia, perché nel frattempo puoi aver consumato da un altro dispositivo. Dopo l’ora di azzeramento la finestra si dice «azzerata, in attesa»: il numero nuovo arriva alla prossima risposta. Una chat con chiave API o con un modello senza limiti non cancella il valore buono.
        </p>

        <div className="serigrafia consumi-lato__titolo">Contesto delle chat aperte</div>
        {remote > 0 ? (
          <p className="misura">
            <span className="segno-remoto">{remote} {remote === 1 ? 'chat è' : 'chat sono'} SU ALTRI PC</span>: non compaiono qui, perché lavorano là e il loro contesto lo legge quel PC (aprilo là, o dalla sua pagina sul telefono).
          </p>
        ) : null}
        {chat.length === 0 ? (
          <p className="misura">Nessuna chat aperta.</p>
        ) : (
          chat.map((c) => {
            const p = c.contesto?.percento ?? c.contestoPercento
            return (
              <div key={c.sessione} className="limite">
                <div className="limite__testa">
                  <span className="riga__nome">{c.titolo ?? c.sessione.slice(0, 8)}</span>
                  <span className="misura">{c.modello ?? ''}</span>
                </div>
                <div className="limite__barra" title={p === undefined ? 'non ancora letto' : `${p}%`}>
                  <span className={`limite__pieno ${(p ?? 0) >= 90 ? 'limite__pieno--ambra' : ''}`} style={{ width: `${p ?? 0}%` }} />
                </div>
                <div className="misura consumi-lato__frase">{c.contestoEtichetta ?? (p === undefined ? 'contesto non ancora letto' : `${p}%`)}</div>
              </div>
            )
          })
        )}
        <p className="misura consumi-lato__spiega">
          Il contesto è la memoria di lavoro della chat: quanta parte della sua finestra (200 mila token, o un milione con i modelli a contesto esteso) è occupata dalla conversazione. Si conta come Claude Code, solo con i token in ingresso (testo nuovo più cache), non con le risposte. Al 90% conviene farle riassumere dove è arrivata: vicino al pieno Claude Code la compatta da sola e può perdere dettagli. Dopo «/compact» il numero torna alla risposta successiva.
        </p>

        <div className="serigrafia consumi-lato__titolo">Freno degli autopiloti</div>
        {freno === undefined ? (
          <p className="misura">Non ancora calcolato.</p>
        ) : (
          <div className="limite">
            <div className="limite__testa">
              <span className="riga__nome">{freno.titolo}</span>
              <span className="misura">{autopilotiAlLavoro === 0 ? 'nessun autopilota al lavoro' : autopilotiAlLavoro === 1 ? '1 autopilota al lavoro' : `${autopilotiAlLavoro} autopiloti al lavoro`}</span>
            </div>
            <div className="misura consumi-lato__frase">{freno.spiegazione}</div>
          </div>
        )}
        <p className="misura consumi-lato__spiega">
          Il freno guarda la stessa lettura qui sopra e vale per tutti gli autopiloti: sotto il {SOGLIE_FRENO.nienteNuove}% della finestra più piena aprono tutte le chat utili; dal {SOGLIE_FRENO.nienteNuove}% non ne aprono di nuove; dall’{SOGLIE_FRENO.una}% ne tengono una sola; dal {SOGLIE_FRENO.fermo}% si fermano a fine turno e ripartono da soli all’azzeramento. Senza limiti letti lavorano con una chat sola. Le tue chat non le tocca.
        </p>

        <div className="serigrafia consumi-lato__titolo">Se non torna</div>
        <p className="misura consumi-lato__spiega">
          Limiti «non ancora letti» o fermi a lungo: fai rispondere una chat aperta da SierraDeck (anche una domanda breve) e aspetta qualche secondo. Se restano vuoti hai una chiave API a consumo (lì le finestre non esistono) oppure la riga di stato di Claude Code è sostituita da una tua in «~/.claude/settings.json»: SierraDeck non la tocca. Un numero diverso da «/usage» di solito è una lettura vecchia: guarda «letto N minuti fa». Il perché di ogni lettura è nel registro (Impostazioni → Registro).
        </p>
      </div>
    </aside>
  )
}
