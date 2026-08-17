import { useEffect, useMemo, useRef, useState } from 'react'
import { azioniDiFinestra } from '../azioni-finestra'
import type { AzioniWorkspace } from '../workspace-azioni'
import type { StatoWorkspace } from '../../main/ipc'

type Props = {
  stato: StatoWorkspace
  onStato: (s: StatoWorkspace) => void
  onChiudi: () => void
}

/**
 * Il pannello dei workspace: scegliere, crearne uno, eliminarlo.
 *
 * Tutto ciò che ha un ordine da rispettare vive in `workspace-azioni`, dove è
 * provabile senza montare React. Qui restano lo stato visibile e la resa.
 */
export function PannelloWorkspace({ stato, onStato, onChiudi }: Props): React.JSX.Element {
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [ultimoSpento, setUltimoSpento] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  const [nuovoNome, setNuovoNome] = useState<string | undefined>(undefined)
  // Il nuovo nome mentre si rinomina l'attivo. `undefined` = non si sta
  // rinominando; una stringa (anche vuota) = campo aperto.
  const [rinomina, setRinomina] = useState<string | undefined>(undefined)
  // Quali workspace risultano accesi non è uno stato di React: vive nella
  // memoria della finestra, che nessun `set` notifica. Questo contatore è come
  // il pannello si accorge di doverlo rileggere dopo uno spegnimento.
  const [giro, setGiro] = useState(0)
  // Il nome dell'attivo cambia sotto le azioni, che vengono create una volta
  // sola: senza questo riferimento resterebbero ferme al nome di quando il
  // pannello si è aperto, e ricorderebbero i riquadri vivi sotto un workspace
  // sbagliato.
  const attivo = useRef(stato.attivo)
  attivo.current = stato.attivo
  // Le azioni leggono lo store al momento della chiamata: ricrearle a ogni
  // rirender le farebbe catturare un layout vecchio.
  const azioni = useRef<AzioniWorkspace | undefined>(undefined)
  azioni.current ??= azioniDiFinestra(() => attivo.current)

  // Esc chiude il pannello: è sopra il mosaico, e chi lo apre per sbaglio deve
  // poterlo togliere senza cercare il tasto.
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && nuovoNome === undefined && rinomina === undefined) onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi, nuovoNome, rinomina])

  const esegui = (op: () => Promise<unknown>): void => {
    if (inCorso) return
    setInCorso(true)
    setErrore(undefined)
    void op()
      .catch((e: unknown) => setErrore(String(e)))
      .finally(() => setInCorso(false))
  }

  const cambia = (nome: string): void =>
    esegui(async () => {
      await azioni.current?.cambia(nome)
      onStato({ ...stato, attivo: nome })
      setGiro((n) => n + 1)
    })

  /**
   * I workspace che, in questa finestra, stanno ancora tenendo vivi dei
   * terminali pur non essendo in primo piano.
   *
   * `giro` non entra nel calcolo: sta fra le dipendenze perché la memoria dei
   * workspace vive fuori da React, e questo è ciò che lega la sua rilettura a
   * un rirender.
   */
  const accesi = useMemo(
    () => stato.nomi.filter((n) => n !== stato.attivo && azioni.current?.acceso(n) === true),
    [stato.nomi, stato.attivo, giro]
  )

  const spegni = (nome: string): void => {
    try {
      const quanti = azioni.current?.spegni(nome) ?? 0
      setErrore(undefined)
      setUltimoSpento(
        quanti === 1
          ? `«${nome}» spento: 1 chat chiusa.`
          : `«${nome}» spento: ${quanti} chat chiuse.`
      )
    } catch (e: unknown) {
      setErrore(String(e))
    }
    setGiro((n) => n + 1)
  }

  const conferma = (): void => {
    const nome = (nuovoNome ?? '').trim()
    if (nome === '') return
    esegui(async () => {
      const s = await azioni.current?.crea(nome)
      if (s !== undefined) onStato(s)
      setNuovoNome(undefined)
    })
  }

  // Rinominare è solo un'etichetta: le chat e i loro terminali non si toccano,
  // quindi non passa dalle azioni della finestra (che traslocano i layout) ma
  // dritto al Core, che poi lo annuncia a tutte le finestre.
  const confermaRinomina = (): void => {
    const nome = (rinomina ?? '').trim()
    if (nome === '' || nome === stato.attivo) {
      setRinomina(undefined)
      return
    }
    esegui(async () => {
      const s = await window.gestore.workspace.rinomina(stato.attivo, nome)
      onStato(s)
      setRinomina(undefined)
    })
  }

  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">Workspace</span>
        <span className="misura">{stato.nomi.length} salvati</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {/* I workspace sono tasti, non un menu a tendina: sono pochi, e con i
            tasti si vede a colpo d'occhio quale è premuto. */}
        {stato.nomi.length === 0 ? (
          <span className="vuoto">Nessun workspace salvato. Il primo nasce al primo salvataggio del layout.</span>
        ) : (
          stato.nomi.map((n) => (
            <button
              key={n}
              className="tasto"
              aria-pressed={n === stato.attivo}
              disabled={inCorso}
              onClick={() => (n === stato.attivo ? undefined : cambia(n))}
              title={n === stato.attivo ? 'Workspace attivo' : `Passa a ${n}`}
            >
              {n}
            </button>
          ))
        )}

        <span style={{ flex: 1 }} />

        {nuovoNome === undefined ? (
          <button className="tasto" onClick={() => setNuovoNome('')} disabled={inCorso}>
            + Nuovo
          </button>
        ) : (
          <>
            <input
              autoFocus
              className="campo"
              value={nuovoNome}
              placeholder="Nome del workspace"
              onChange={(e) => setNuovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') conferma()
                else if (e.key === 'Escape') setNuovoNome(undefined)
              }}
              style={{ width: 200 }}
            />
            <button className="tasto tasto--primario" onClick={conferma} disabled={inCorso}>
              Crea
            </button>
            <button className="tasto" onClick={() => setNuovoNome(undefined)} disabled={inCorso}>
              Annulla
            </button>
          </>
        )}

        <button
          className="tasto"
          onClick={() => setRinomina(stato.attivo)}
          disabled={inCorso || stato.nomi.length === 0 || rinomina !== undefined}
          title={`Cambia nome a «${stato.attivo}». Le sue chat restano dove sono.`}
        >
          ✎ Rinomina
        </button>

        <button
          className="tasto"
          onClick={() =>
            esegui(async () => {
              const s = await azioni.current?.elimina(stato.attivo)
              if (s !== undefined) onStato(s)
            })
          }
          disabled={inCorso || stato.nomi.length <= 1}
          title={
            stato.nomi.length <= 1
              ? 'L’ultimo workspace non si può eliminare: non resterebbe dove salvare il layout'
              : `Elimina ${stato.attivo}`
          }
        >
          Elimina
        </button>
      </div>

      {/* Rinominare l'attivo: le chat non si toccano, cambia solo l'etichetta —
          utile quando i nomi non dicono più cosa contengono. */}
      {rinomina !== undefined ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <span className="serigrafia">Rinomina «{stato.attivo}»</span>
          <input
            autoFocus
            className="campo"
            value={rinomina}
            placeholder="Nome nuovo"
            onChange={(e) => setRinomina(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confermaRinomina()
              else if (e.key === 'Escape') setRinomina(undefined)
            }}
            style={{ width: 200 }}
          />
          <button className="tasto tasto--primario" onClick={confermaRinomina} disabled={inCorso}>
            Rinomina
          </button>
          <button className="tasto" onClick={() => setRinomina(undefined)} disabled={inCorso}>
            Annulla
          </button>
        </div>
      ) : null}

      {/* Cambiare workspace non spegne più niente: le chat che si lasciano
          continuano a lavorare, e i loro claude.exe restano in piedi. È la
          scelta giusta — un workspace è una vista, non un interruttore — ma le
          risorse vanno pur liberate quando si vuole, ed è questo il solo posto
          da cui si può fare, perché quei riquadri non sono a schermo. */}
      {accesi.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <span className="serigrafia">Ancora al lavoro</span>
          {accesi.map((n) => (
            <button
              key={n}
              className="tasto"
              disabled={inCorso}
              onClick={() => spegni(n)}
              title={`Spegni «${n}»: chiude i suoi claude.exe. La disposizione resta salvata, e tornandoci le chat riprendono da dove erano.`}
            >
              ⏻ {n}
            </button>
          ))}
        </div>
      ) : null}

      {ultimoSpento !== undefined ? <div className="vuoto">{ultimoSpento}</div> : null}
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
    </div>
  )
}
