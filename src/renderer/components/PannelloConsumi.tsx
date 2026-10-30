import { testoQuota, vistaContesto, vistaFinestra } from '@shared/consumi-vista'
import { nomiDistinti } from '@shared/chat-vista'
import type { Colore } from '@shared/stato-vista'

import { useEffect, useState } from 'react'
import type { Consumi } from '@shared/consumi'
import { andamentoOggi, formattaToken, quotaCache } from '@shared/consumi'
import { oraDi } from '@shared/polso-chat'
import type { StatoAccesso } from '../../main/accesso'
import { Aiuto } from './Aiuto'

const COLORE_CONSUMI: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

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
          {/* 0.70.0: una riga con i separatori; prima «0 in entrata0 in uscita…» tutto attaccato. */}
          <div className="misura">{testoQuota(q)}</div>
        </>
      )}
    </div>
  )

  const limiti = consumi?.limiti
  const finestra = (nome: string, spiega: string, f: { percento: number; resettaIl?: number; etichetta?: string; stato?: string } | undefined): React.JSX.Element => {
    const p = f === undefined ? 0 : Math.round(f.percento)
    const classe = p >= 95 ? 'limite__pieno--rosso' : p >= 80 ? 'limite__pieno--ambra' : ''
    // 0.70.0: la parola con il colore e la percentuale grande (libero, attento, pieno, vecchia, attesa).
    const v = vistaFinestra(f)
    return (
      <div className="limite">
        <div className="limite__testa">
          <span className="riga__nome con-aiuto">{nome}<Aiuto di={nome}>{spiega}</Aiuto></span>
          <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{f === undefined ? '—' : `${p}%`}</span>
          <span style={{ color: COLORE_CONSUMI[v.colore], fontWeight: 700 }}>{v.parola}</span>
        </div>
        <div className="limite__barra" title={`${p}%`}>
          <span className={`limite__pieno ${classe}`} style={{ width: `${Math.max(f === undefined ? 0 : 1, p)}%` }} />
        </div>
        {/* La frase di `limiti-piano.ts` (0.37.0), sotto la barra (0.70.0): letto quando, azzerata, vecchia. */}
        <div className="misura" style={{ marginTop: 4 }}>{f === undefined ? 'non ancora letta' : f.etichetta ?? `${p}% usato${f.resettaIl !== undefined ? ` · si azzera ${oraDi(f.resettaIl, adesso)}` : ''}`}</div>
      </div>
    )
  }

  const costo = consumi?.costo
  // Tre chat con lo stesso nome si distinguono (0.70.0).
  const nomiChat = nomiDistinti((consumi?.chatAperte ?? []).map((c) => ({ id: c.sessione, titolo: c.titolo ?? c.sessione.slice(0, 8) })))
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
      <p className="misura con-aiuto" style={{ margin: '6px 0 14px' }}>
        {limiti === undefined ? 'Non ancora letti.' : `Letti ${oraDi(limiti.letti, adesso)}${limiti.modello !== undefined ? ` da una chat con ${limiti.modello}` : ''}.`}
        <Aiuto di="limiti del piano">{limiti === undefined ? 'Arrivano dalla riga di stato di Claude Code dopo la prima risposta di una chat aperta da SierraDeck, e solo con un abbonamento Pro o Max (con una chiave API a consumo non ci sono finestre). Se restano vuoti anche dopo una risposta, guarda il registro.' : 'Sono gli stessi numeri di «/usage» in Claude Code: fra tutte le chat vale la lettura più recente, e si aggiornano a ogni risposta. Oltre 20 minuti la lettura è segnata vecchia; dopo l’azzeramento si aspetta la lettura nuova invece di mostrare il valore di prima. Sopra l’80% compare un avviso in basso a destra, sopra il 95% uno rosso.'}</Aiuto>
      </p>

      <div className="serigrafia con-aiuto" style={{ marginBottom: 6 }}>Spesa stimata da Claude Code<Aiuto di="spesa stimata">È il costo che Claude Code stessa calcola per ogni sessione con i prezzi di listino, sommato per giorno: con un abbonamento non è una fattura, ma dice quanto vale il lavoro fatto. Una chat lunga più giorni conta tutta nel giorno dell’ultima risposta. Si conosce solo per le chat aperte da SierraDeck da questa versione in poi.</Aiuto></div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 0 6px' }}>
        {(['oggi', 'settimana', 'totale'] as const).map((k) => (
          <div key={k} className="consumo">
            <div className="serigrafia">{k === 'oggi' ? 'Oggi' : k === 'settimana' ? 'Ultimi 7 giorni' : 'Da quando si legge'}</div>
            <div className="consumo__numero">{costo === undefined ? '—' : dollari(costo[k])}</div>
          </div>
        ))}
      </div>

      {consumi?.orchestratori !== undefined && consumi.orchestratori.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div className="serigrafia con-aiuto" style={{ marginBottom: 6 }}>Orchestratori, per workspace<Aiuto di="costo degli orchestratori">Quanto vale il lavoro dell’orchestratore di ogni workspace: il costo di listino che Claude Code calcola per ogni suo turno, letto dal suo registro dei costi. È sull’abbonamento, quindi non è una spesa in più: serve a vedere quale workspace pesa di più. Oggi · ultimi 7 giorni · da sempre.</Aiuto></div>
          {consumi.orchestratori.map((o) => (
            <div key={o.workspace} className="riga" style={{ gap: 12 }}>
              <span className="riga__nome" style={{ minWidth: 140 }}>{o.workspace}</span>
              <span className="misura" style={{ flex: 1 }}>{o.turni} {o.turni === 1 ? 'turno' : 'turni'}{o.ultimo !== undefined ? ` · l’ultimo ${oraDi(o.ultimo, adesso)}` : ''}</span>
              <span className="misura" title="Oggi · ultimi 7 giorni · da sempre">{dollari(o.oggi)} · {dollari(o.settimana)} · {dollari(o.totale)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {consumi !== undefined && consumi.chatAperte !== undefined && consumi.chatAperte.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div className="serigrafia con-aiuto" style={{ marginBottom: 6 }}>Le chat aperte adesso<Aiuto di="contesto">Il contesto è la memoria di lavoro della chat: al 90% conviene farle riassumere dove è arrivata, perché quando Claude Code lo compatta può perdere dettagli.</Aiuto></div>
          {consumi.chatAperte.map((c) => (
            <div key={c.sessione} className="riga" style={{ gap: 12 }}>
              <span className="riga__nome" style={{ minWidth: 140 }}>{nomiChat.get(c.sessione) ?? c.titolo ?? c.sessione.slice(0, 8)}</span>
              {/* Il contesto in una parola (0.70.0): libera, piena, riassumi. */}
              <span style={{ color: COLORE_CONSUMI[vistaContesto(c.contestoPercento).colore], minWidth: 64 }} title={vistaContesto(c.contestoPercento).ragione}>{vistaContesto(c.contestoPercento).parola}</span>
              <span className="misura">{c.modello ?? '—'}</span>
              <span className="barra" style={{ flex: 1 }} title="Quanto del contesto della chat e' occupato: vicino al 100% Claude Code lo compatta da solo">
                <span className={`barra__pieno${(c.contestoPercento ?? 0) >= 90 ? ' barra__pieno--ambra' : ''}`} style={{ width: `${Math.max(2, c.contestoPercento ?? 0)}%` }} />
              </span>
              <span className="misura">{c.contestoEtichetta ?? `${c.contestoPercento ?? 0}%`}{c.costoUsd !== undefined ? ` · ${dollari(c.costoUsd)}` : ''}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="serigrafia con-aiuto" style={{ marginBottom: 6 }}>Token<Aiuto di="token">I token sono letti dalle trascrizioni di Claude Code e sono la misura vera di quanto si consuma; i limiti e la spesa arrivano da Claude Code stessa. Se una chat non compare fra quelle aperte, è stata aperta prima di questa versione: riaprirla basta.</Aiuto></div>
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
          <div className="serigrafia con-aiuto" style={{ marginBottom: 6 }}>Per modello (ultimi 7 giorni)<Aiuto di="per modello">I modelli grandi pesano di più sui limiti: se la finestra sale in fretta, spostare i compiti semplici su un modello più piccolo la fa durare.</Aiuto></div>
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
