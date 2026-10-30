import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { haDomandaAperta } from '@shared/chat-autopilota'
import { COLORE_DAL_VIVO, messaggiCompatti, oraBreve, statoAutopilotaDalVivo, statoMessaggi, type EtichettaDalVivo } from '@shared/stato-dal-vivo'
import type { Colore } from '@shared/stato-vista'
import { Aiuto } from './Aiuto'
import { adessoDi, AIUTO_ADESSO, COLORE_ADESSO, type SegniDalVivo } from '@shared/adesso'
import { COLORE_SEGNALE, SIMBOLO_SEGNALE, type ChatNelPunto } from '@shared/adesso'
import { compitoBreve, nomeChi, senzaSigle } from '@shared/chat-autopilota'
import { parolaSegnale } from '@shared/segnali-flotta'

/**
 * Si vede sempre chi lavora (0.69.0). Nicholas, 12/10: «io voglio sempre vedere
 * tutto, almeno vedere che stanno lavorando». Una riga: lo stato in quattro
 * parole, da quanto, l'ultima azione; e «nessun segno da 10 min» quando chi è
 * al lavoro non fa niente. Le stesse parole sulla pagina e nell'app.
 */
const TINTA: Record<Colore, string> = {
  verde: 'var(--verde, #3fb950)',
  ambra: 'var(--ambra, #d29922)',
  rosso: 'var(--rosso, #dc5f5f)',
  blu: 'var(--blu, #4aa3ff)',
  quieto: 'var(--testo-quieto, #8b949e)'
}
const COLORE = (e: EtichettaDalVivo): string => TINTA[COLORE_DAL_VIVO[e]]

/** Il tempo passa anche se l'autopilota non cambia: si ridisegna ogni mezzo minuto. */
function useOra(): number {
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setOra(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return ora
}

const segno = (a: Autopilota): number | undefined => {
  const t = Date.parse((a as unknown as { ultimoSegno?: string }).ultimoSegno ?? '')
  return Number.isNaN(t) ? undefined : t
}

export function RigaDalVivo({ autopilota: a, senzaStato = false }: {
  autopilota: Autopilota
  /**
   * Nella Panoramica (0.82.0): la parola dello stato la dice già la testata
   * sopra. Qui resta una riga sola: l'ultima azione, da quanto e l'avviso ⚠.
   */
  senzaStato?: boolean
}): React.JSX.Element | null {
  const ora = useOra()
  const d = haDomandaAperta(a)
  const s = statoAutopilotaDalVivo({ ...a, ...(d !== undefined ? { domanda: d } : {}) }, ora, segno(a))
  if (senzaStato) {
    if (s.ultimaAzione === '' && s.senzaSegni === undefined) return null
    return (
      <span className="dal-vivo misura" title={s.ultimaAzione} style={{ display: 'block', fontSize: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {s.ultimaAzione}{s.da !== '' ? ` · da ${s.da}` : ''}
        {s.senzaSegni !== undefined ? <span style={{ color: 'var(--ambra)' }}> · ⚠ {s.senzaSegni}</span> : null}
      </span>
    )
  }
  return (
    <span className="dal-vivo" style={{ display: 'block', fontSize: 'var(--t1)' }}>
      <b style={{ color: COLORE(s.etichetta) }}>{s.etichetta}</b>
      {s.da !== '' ? <span className="misura"> · da {s.da}</span> : null}
      {s.senzaSegni !== undefined ? <span style={{ color: 'var(--ambra)' }}> · ⚠ {s.senzaSegni}</span> : null}
      {s.ultimaAzione !== '' ? <span className="misura" title={s.ultimaAzione} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ultimaAzione}</span> : null}
    </span>
  )
}

/**
 * I messaggi verso la chat (0.72.1): una spunta ✓ per ogni messaggio arrivato
 * (l'ora e il testo nel tooltip), un puntino per quello in consegna, e **una
 * riga sola**, solo se qualcosa è fermo: «in attesa da N min».
 */
export function MessaggiVersoLaChat({ autopilota: a }: { autopilota: Autopilota }): React.JSX.Element | null {
  const ora = useOra()
  const c = messaggiCompatti(statoMessaggi(a, ora, oraBreve))
  if (c.segni.length === 0 && c.fermo === undefined) return null
  return (
    <div className="messaggi-chat" style={{ margin: '6px 0', fontSize: 'var(--t1)' }}>
      <div className="messaggi-segni">
        <span className="serigrafia con-aiuto" style={{ marginRight: 4 }}>Messaggi per la chat
          <Aiuto di="Messaggi per la chat">
            Ogni ✓ è un messaggio tuo o dell’autopilota arrivato alla chat: passaci sopra per l’ora e il testo. Entrano alla fine del turno; se aspettano più di due minuti se ne scrive uno anche durante il turno, mai più di uno: gli altri partono alla fine, uniti.
          </Aiuto>
        </span>
        {c.segni.map((s) => (
          <span key={s.id} className={`messaggi-segni__segno${s.tipo === 'in consegna' ? ' messaggi-segni__segno--volo' : ''}`} title={s.titolo} aria-label={s.titolo}>
            {s.tipo === 'consegnato' ? '✓' : '⋯'}
          </span>
        ))}
      </div>
      {c.fermo !== undefined ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4 }}>
          <span style={{ color: 'var(--ambra)', whiteSpace: 'nowrap' }}>{c.fermo.dettaglio}{c.fermo.quanti > 1 ? ` · ${c.fermo.quanti} messaggi` : ''}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.fermo.testo}>{c.fermo.testo}</span>
        </div>
      ) : null}
    </div>
  )
}

/** Le righe di `adessoDi` con il nome di chi lavora, senza sigle e con il segnale della chat. */
function righeAdesso(a: Autopilota & SegniDalVivo, ora: number): { chat: ChatNelPunto[]; finite: number } {
  const adesso = adessoDi(a, ora)
  const chat = adesso.righe.map((r): ChatNelPunto => {
    const c = a.chats.find((x) => x.id === r.id)
    const s = c?.segnale
    let parola = ''
    if (s !== undefined) {
      const sorella = s.tipo === 'aspetto' && s.di !== undefined ? a.chats.find((x) => x.id === s.di) : undefined
      parola = s.tipo === 'aspetto' && s.di !== undefined
        ? (sorella !== undefined ? `aspetta ${nomeChi(sorella)} («${senzaSigle(compitoBreve(sorella.compito, 40))}»)` : 'aspetta un’altra chat')
        : senzaSigle(parolaSegnale(s))
    }
    return {
      ...r,
      chi: c !== undefined ? nomeChi(c) : r.chi,
      compito: senzaSigle(r.compito),
      testo: senzaSigle(r.testo),
      colore: COLORE_ADESSO[r.tono],
      ...(s !== undefined ? { segnale: { tipo: s.tipo, parola, colore: COLORE_SEGNALE[s.tipo], simbolo: SIMBOLO_SEGNALE[s.tipo] } } : {})
    }
  })
  return { chat, finite: adesso.finite }
}

/**
 * Il riquadro «Adesso» (0.81.0): una riga per chat, cosa fa, da quanto, e se è
 * ferma perché. Le righe le calcola `adessoDi`, la stessa della pagina e dell'app.
 */
export function AdessoAutopilota({ autopilota: a, dentro = false, soloFerme = false }: {
  autopilota: Autopilota
  /** Dentro la sezione «Adesso» della Panoramica: senza titolo, ce l'ha già. */
  dentro?: boolean
  /** Solo le chat ferme: sotto le schede delle finestre, il resto lo dicono loro. */
  soloFerme?: boolean
}): React.JSX.Element | null {
  const ora = useOra()
  // Le righe di `adessoDi` (0.84.3, collaudo c-96 D1), senza sigle e con il
  // segnale di ogni chat, come sulla pagina e nell'app. Dal 30/10 non passano
  // più dal Punto: il piano dell'autopilota per obiettivo non c'è più.
  const tutto = righeAdesso(a as Autopilota & SegniDalVivo, ora)
  const righe = soloFerme ? tutto.chat.filter((r) => r.tono === 'ferma') : tutto.chat
  const finite = soloFerme ? 0 : tutto.finite
  if (righe.length === 0 && finite === 0) return null
  return (
    <div className={`adesso-ap${dentro ? ' adesso-ap--dentro' : ''}`} aria-label="Adesso">
      {dentro ? null : <span className="serigrafia con-aiuto">Adesso<Aiuto di="il riquadro Adesso">{AIUTO_ADESSO}</Aiuto></span>}
      {righe.map((r) => (
        <div key={r.id} className={`adesso-ap__riga adesso-ap__riga--${r.tono}`}>
          <b style={{ color: TINTA[COLORE_ADESSO[r.tono]] }}>{r.chi}</b>
          <span className="adesso-ap__compito" title={r.compito}>{r.compito}</span>
          <span className="adesso-ap__testo" style={{ color: r.tono === 'lavoro' ? undefined : TINTA[COLORE_ADESSO[r.tono]] }}>{r.testo}</span>
          {r.segnale !== undefined ? <span className="adesso-ap__segnale" style={{ color: TINTA[r.segnale.colore as keyof typeof TINTA] }}>{r.segnale.simbolo} {r.segnale.parola}</span> : null}
        </div>
      ))}
      {finite > 0 ? <div className="adesso-ap__finite">{finite === 1 ? '1 chat finita' : `${finite} chat finite`}</div> : null}
    </div>
  )
}
