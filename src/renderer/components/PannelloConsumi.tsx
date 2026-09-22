import { useEffect, useState } from 'react'
import type { Consumi } from '@shared/consumi'
import { andamentoOggi, formattaToken, quotaCache } from '@shared/consumi'
import { oraDi } from '@shared/polso-chat'
import type { StatoAccesso } from '../../main/accesso'

/**
 * Quanto si è consumato, con quale account, e a che punto sono i limiti.
 *
 * Tre fonti, dette per quello che sono:
 * - i **token** letti dalle trascrizioni di Claude Code (l'indice li ha già);
 * - i **limiti del piano** e la **spesa stimata**, che Claude Code passa alla
 *   riga di stato di ogni chat aperta da SierraDeck: la finestra di cinque
 *   ore e quella settimanale con l'ora di azzeramento, e il costo in dollari
 *   che lui stesso calcola per la sessione. Con un abbonamento la spesa è
 *   un'indicazione, non una fattura, ma i limiti sono quelli veri.
 * Nicholas (22/09/2026): «importa anche qui i limiti se puoi e emetti avvisi
 * per aiutare a capire l'utente».
 */
export function PannelloConsumi({ onChiudi, incorporato = false }: { onChiudi?: () => void; incorporato?: boolean }): React.JSX.Element {
  const [consumi, setConsumi] = useState<Consumi | undefined>(undefined)
  const [accesso, setAccesso] = useState<StatoAccesso | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [adesso, setAdesso] = useState(Date.now())

  useEffect(() => {
    const leggi = (): void => {
      window.gestore.sessions.consumi().then((c) => { setConsumi(c); setAdesso(Date.now()) }).catch((e: unknown) => setErrore(String(e)))
    }
    leggi()
    window.gestore.accesso.stato().then(setAccesso).catch(() => setAccesso(undefined))
    // I limiti cambiano a ogni risposta di una chat: si rilegge ogni mezzo minuto finche' il pannello e' aperto.
    const t = setInterval(leggi, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (incorporato) return
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi?.() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi, incorporato])

  const colonna = (titolo: string, q: Consumi['oggi'] | undefined): React.JSX.Element => (
    <div className="consumo">
      <div className="serigrafia">{titolo}</div>
      <div className="consumo__numero">
        {q === undefined ? '—' : formattaToken(q.ingresso + q.uscita)}
      </div>
      {q === undefined ? null : (
        <>
          <div className="consumo__barra" title={`${quotaCache(q)}% dalla cache, che costa meno`}>
            <span className="consumo__cache" style={{ width: `${quotaCache(q)}%` }} />
          </div>
          <div className="misura consumo__righe">
            <span>{formattaToken(q.ingresso)} in entrata</span>
            <span>{formattaToken(q.uscita)} in uscita</span>
            <span>{formattaToken(q.cache)} dalla cache ({quotaCache(q)}%)</span>
            <span>{q.chat === 1 ? '1 chat' : `${q.chat} chat`}</span>
          </div>
        </>
      )}
    </div>
  )

  const limiti = consumi?.limiti
  const finestra = (nome: string, spiega: string, f: { percento: number; resettaIl?: number } | undefined): React.JSX.Element => {
    const p = f === undefined ? 0 : Math.round(f.percento)
    const classe = p >= 95 ? 'limite__pieno--rosso' : p >= 80 ? 'limite__pieno--ambra' : ''
    return (
      <div className="limite">
        <div className="limite__testa">
          <span className="riga__nome">{nome}</span>
          <span className="misura">{f === undefined ? 'non ancora letta' : `${p}% usato${f.resettaIl !== undefined ? ` · si azzera ${oraDi(f.resettaIl, adesso)}` : ''}`}</span>
        </div>
        <div className="limite__barra" title={`${p}%`}>
          <span className={`limite__pieno ${classe}`} style={{ width: `${Math.max(f === undefined ? 0 : 1, p)}%` }} />
        </div>
        <div className="misura" style={{ marginTop: 2 }}>{spiega}</div>
      </div>
    )
  }

  const costo = consumi?.costo
  const dollari = (n: number): string => `${n.toFixed(2).replace('.', ',')} $`

  const corpo = (
    <>
      {accesso?.email !== undefined ? (
        <p className="misura" style={{ margin: '0 0 10px' }}>
          {accesso.email}
          {accesso.piano !== undefined ? ` · ${accesso.piano}` : ''}
          {accesso.organizzazione !== undefined ? ` · ${accesso.organizzazione}` : ''}
        </p>
      ) : null}

      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}

      <div className="serigrafia" style={{ marginBottom: 6 }}>Limiti del piano</div>
      <div className="limiti">
        {finestra('Finestra di 5 ore', 'Anthropic conta l’uso in una finestra mobile di cinque ore: al 100% le chat si fermano fino all’ora di azzeramento, poi si riparte da zero.', limiti?.cinqueOre)}
        {finestra('Settimana', 'Il tetto settimanale su tutti i modelli: si azzera nel giorno e all’ora indicati. Chi lo tocca resta fermo fino ad allora, qualunque sia la finestra di cinque ore.', limiti?.settimana)}
      </div>
      <p className="misura" style={{ margin: '6px 0 14px', lineHeight: 1.5 }}>
        {limiti === undefined
          ? 'Non ancora letti. Arrivano dalla riga di stato di Claude Code dopo la prima risposta di una chat aperta da SierraDeck, e solo con un abbonamento Pro o Max (con una chiave API a consumo non ci sono finestre). Se restano vuoti anche dopo una risposta, guarda il registro.'
          : `Letti ${oraDi(limiti.letti, adesso)}${limiti.modello !== undefined ? ` da una chat con ${limiti.modello}` : ''}. Sono gli stessi numeri di «/usage» in Claude Code; si aggiornano a ogni risposta. Sopra l’80% compare un avviso in basso a destra, sopra il 95% uno rosso.`}
      </p>

      <div className="serigrafia" style={{ marginBottom: 6 }}>Spesa stimata da Claude Code</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 0 6px' }}>
        {(['oggi', 'settimana', 'totale'] as const).map((k) => (
          <div key={k} className="consumo">
            <div className="serigrafia">{k === 'oggi' ? 'Oggi' : k === 'settimana' ? 'Ultimi 7 giorni' : 'Da quando si legge'}</div>
            <div className="consumo__numero">{costo === undefined ? '—' : dollari(costo[k])}</div>
          </div>
        ))}
      </div>
      <p className="misura" style={{ margin: '0 0 14px', lineHeight: 1.5 }}>
        È il costo che Claude Code stessa calcola per ogni sessione con i prezzi di listino, sommato per giorno: con un abbonamento non è una fattura, ma dice quanto vale il lavoro fatto. Una chat lunga più giorni conta tutta nel giorno dell’ultima risposta. Si conosce solo per le chat aperte da SierraDeck da questa versione in poi.
      </p>

      {consumi !== undefined && consumi.chatAperte !== undefined && consumi.chatAperte.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div className="serigrafia" style={{ marginBottom: 6 }}>Le chat aperte adesso</div>
          {consumi.chatAperte.map((c) => (
            <div key={c.sessione} className="riga" style={{ gap: 12 }}>
              <span className="riga__nome" style={{ minWidth: 140 }}>{c.titolo ?? c.sessione.slice(0, 8)}</span>
              <span className="misura">{c.modello ?? '—'}</span>
              <span className="barra" style={{ flex: 1 }} title="Quanto del contesto della chat e' occupato: vicino al 100% Claude Code lo compatta da solo">
                <span className={`barra__pieno${(c.contestoPercento ?? 0) >= 90 ? ' barra__pieno--ambra' : ''}`} style={{ width: `${Math.max(2, c.contestoPercento ?? 0)}%` }} />
              </span>
              <span className="misura">contesto {c.contestoPercento ?? 0}%{c.costoUsd !== undefined ? ` · ${dollari(c.costoUsd)}` : ''}</span>
            </div>
          ))}
          <p className="misura" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
            Il contesto è la memoria di lavoro della chat: al 90% conviene farle riassumere dove è arrivata, perché quando Claude Code lo compatta può perdere dettagli.
          </p>
        </div>
      ) : null}

      <div className="serigrafia" style={{ marginBottom: 6 }}>Token</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 0 12px' }}>
        {colonna(
          consumi === undefined
            ? 'Oggi'
            : andamentoOggi(consumi) === 'sopra'
              ? 'Oggi — più del solito'
              : andamentoOggi(consumi) === 'sotto'
                ? 'Oggi — meno del solito'
                : 'Oggi',
          consumi?.oggi
        )}
        {colonna('Ultimi 7 giorni', consumi?.settimana)}
        {colonna('Da sempre', consumi?.totale)}
      </div>

      {consumi !== undefined && consumi.perModello !== undefined && consumi.perModello.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div className="serigrafia" style={{ marginBottom: 6 }}>Per modello (ultimi 7 giorni)</div>
          {consumi.perModello.map((m) => {
            const massimo = consumi.perModello?.[0]?.token ?? 1
            return (
              <div key={m.modello} className="riga" style={{ gap: 12 }}>
                <span className="riga__nome" style={{ minWidth: 140 }}>{m.modello}</span>
                <span className="barra" style={{ flex: 1 }}>
                  <span className="barra__pieno" style={{ width: `${Math.max(2, (m.token / massimo) * 100)}%` }} />
                </span>
                <span className="misura">{formattaToken(m.token)}</span>
              </div>
            )
          })}
          <p className="misura" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
            I modelli grandi pesano di più sui limiti: se la finestra sale in fretta, spostare i compiti semplici su un modello più piccolo la fa durare.
          </p>
        </div>
      ) : null}

      {consumi !== undefined && consumi.perProgetto.length > 0 ? (
        <div>
          <div className="serigrafia" style={{ marginBottom: 6 }}>Dove va il lavoro</div>
          {consumi.perProgetto.map((p) => {
            const massimo = consumi.perProgetto[0]?.token ?? 1
            return (
              <div key={p.progetto} className="riga" style={{ gap: 12 }}>
                <span className="riga__nome" style={{ minWidth: 140 }}>{p.progetto}</span>
                <span className="barra" style={{ flex: 1 }}>
                  <span className="barra__pieno" style={{ width: `${Math.max(2, (p.token / massimo) * 100)}%` }} />
                </span>
                <span className="misura">{formattaToken(p.token)}</span>
              </div>
            )
          })}
        </div>
      ) : null}

      <p className="misura" style={{ marginTop: 10, lineHeight: 1.5 }}>
        I token sono letti dalle trascrizioni di Claude Code e sono la misura vera di quanto si consuma; i limiti e la spesa arrivano da Claude Code stessa. Se una chat non compare fra quelle aperte, è stata aperta prima di questa versione: riaprirla basta.
      </p>
    </>
  )

  if (incorporato) return <div className="impostazioni-scheda">{corpo}</div>
  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">Consumi</span>
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>
      {corpo}
    </div>
  )
}
