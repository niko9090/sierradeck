import { useEffect, useState } from 'react'
import { accoda, aPezzi, fineAscolto, finita, FILA_VUOTA, inizioAscolto, prossima, ripeti, subito, zitto, type FilaVoce, type Frase } from '@shared/voce-autopilota'

/**
 * **La voce di SierraDeck** (13/11): legge i riassunti e, con la
 * conversazione a voce accesa, le risposte e le domande nuove
 * dell'autopilota. Gratis e senza rete: la sintesi vocale del sistema
 * (`speechSynthesis`, le voci di Windows), solo una voce italiana.
 *
 * Le impostazioni stanno su questo PC (localStorage): valgono per gli
 * autopiloti di qui e per quelli degli altri PC guardati da qui.
 */

export type ImpostazioniVoce = {
  /** La conversazione a voce: spenta finché non la accendi. */
  conversazione: boolean
  /** La velocità: 0.7 – 1.6. */
  velocita: number
  /** Il nome della voce scelta; assente: la prima italiana. */
  voce?: string
  /** Con la conversazione accesa, quello che detti parte da solo dopo una pausa. */
  invioDaSolo: boolean
}

const CHIAVE = 'sierradeck.voce'
const PREDEFINITE: ImpostazioniVoce = { conversazione: false, velocita: 1, invioDaSolo: true }
export const VELOCITA_MIN = 0.7
export const VELOCITA_MAX = 1.6

function leggiImpostazioni(): ImpostazioniVoce {
  try {
    const x = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as Partial<ImpostazioniVoce>
    const v = typeof x.velocita === 'number' && Number.isFinite(x.velocita) ? Math.min(VELOCITA_MAX, Math.max(VELOCITA_MIN, x.velocita)) : 1
    return {
      conversazione: x.conversazione === true,
      velocita: v,
      invioDaSolo: x.invioDaSolo !== false,
      ...(typeof x.voce === 'string' && x.voce !== '' ? { voce: x.voce } : {})
    }
  } catch {
    return { ...PREDEFINITE }
  }
}

let impostazioni: ImpostazioniVoce | undefined
const abbonatiImpostazioni = new Set<(i: ImpostazioniVoce) => void>()

export function impostazioniVoce(): ImpostazioniVoce {
  return (impostazioni ??= leggiImpostazioni())
}

/** `voce: undefined` torna alla prima voce italiana. */
export function cambiaVoce(p: { [K in keyof ImpostazioniVoce]?: ImpostazioniVoce[K] | undefined }): void {
  const prima = impostazioniVoce()
  const n = { ...prima } as ImpostazioniVoce
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) delete (n as Record<string, unknown>)[k]
    else (n as Record<string, unknown>)[k] = v
  }
  impostazioni = n
  try { localStorage.setItem(CHIAVE, JSON.stringify(n)) } catch { /* resta fino al riavvio */ }
  // Spenta la conversazione, la voce tace subito.
  if (prima.conversazione && !n.conversazione) voce.zitto()
  for (const f of abbonatiImpostazioni) f(n)
}

export function useImpostazioniVoce(): ImpostazioniVoce {
  const [i, setI] = useState(impostazioniVoce)
  useEffect(() => { abbonatiImpostazioni.add(setI); return () => { abbonatiImpostazioni.delete(setI) } }, [])
  return i
}

// ------------------------------------------------------------- le voci

const sintesi = (): SpeechSynthesis | undefined => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined)

/** Le voci italiane del sistema (Windows le carica dopo un attimo: si aspetta `voiceschanged`, al più 2 s). */
export function vociItaliane(): Promise<SpeechSynthesisVoice[]> {
  const s = sintesi()
  if (s === undefined) return Promise.resolve([])
  const italiane = (): SpeechSynthesisVoice[] => s.getVoices().filter((v) => v.lang.toLowerCase().startsWith('it'))
  if (s.getVoices().length > 0) return Promise.resolve(italiane())
  return new Promise((ok) => {
    const fatto = (): void => { s.removeEventListener('voiceschanged', fatto); clearTimeout(t); ok(italiane()) }
    const t = setTimeout(fatto, 2000)
    s.addEventListener('voiceschanged', fatto)
  })
}

export const SENZA_VOCE_ITALIANA = 'Manca una voce italiana su questo PC.'
export const COME_AGGIUNGERE_VOCE = 'Impostazioni di Windows → Ora e lingua → Voce → Gestisci voci → Aggiungi voci: scegli Italiano. Poi riapri SierraDeck.'

// ------------------------------------------------------------- la fila

export type StatoVoce = { parla: boolean; ascolta: boolean; inFila: number; problema?: string }

/**
 * Chi dice le frasi: una alla volta, mai mentre parli tu (dettatura aperta),
 * le nuove in fila. Una sola per finestra.
 */
function creaVoce() {
  let s: FilaVoce = FILA_VUOTA
  let problema: string | undefined
  const gia = new Set<string>()
  const abbonati = new Set<(v: StatoVoce) => void>()
  const avvisa = (): void => {
    const v: StatoVoce = { parla: s.parla !== undefined, ascolta: s.ascolta, inFila: s.fila.length, ...(problema !== undefined ? { problema } : {}) }
    for (const f of abbonati) f(v)
  }
  const avanti = (): void => {
    const p = prossima(s)
    s = p.stato
    if (p.dire !== undefined) void di(p.dire)
    avvisa()
  }
  const di = async (f: Frase): Promise<void> => {
    const sy = sintesi()
    const voci = await vociItaliane()
    if (s.parla?.id !== f.id) return
    const i = impostazioniVoce()
    const scelta = voci.find((v) => v.name === i.voce) ?? voci.find((v) => v.localService) ?? voci[0]
    if (sy === undefined || scelta === undefined) {
      problema = sy === undefined ? 'La voce non c’è in questa finestra.' : SENZA_VOCE_ITALIANA
      s = zitto(s)
      avvisa()
      return
    }
    problema = undefined
    const u = new SpeechSynthesisUtterance(f.testo)
    u.voice = scelta
    u.lang = scelta.lang
    u.rate = i.velocita
    const fine = (): void => { s = finita(s, f.id); avanti() }
    u.onend = fine
    u.onerror = fine
    sy.speak(u)
  }
  const ferma = (): void => { sintesi()?.cancel() }
  return {
    /** In fondo alla fila (le risposte nuove). */
    accoda(f: Frase): void {
      // La stessa chat può essere aperta in due posti (Panoramica e colonna): una frase si dice una volta.
      if (gia.has(f.id)) return
      gia.add(f.id)
      if (gia.size > 500) gia.delete(gia.values().next().value as string)
      s = accoda(s, f)
      avanti()
    },
    /** Subito (un riassunto chiesto da te): ferma quello che stava dicendo. */
    subito(id: string, testo: string): void {
      const prima = s.parla
      s = subito(s, aPezzi(testo).map((t, i) => ({ id: `${id}#${i}`, testo: t })))
      if (prima !== undefined) ferma()
      avanti()
    },
    zitto(): void { const prima = s.parla; s = zitto(s); if (prima !== undefined) ferma(); avvisa() },
    ripeti(): void { const prima = s.parla; s = ripeti(s); if (prima !== undefined) ferma(); avanti() },
    /** Parli tu: la voce tace e riprende da dove era quando hai finito. */
    inizioAscolto(): void { const prima = s.parla; s = inizioAscolto(s); if (prima !== undefined) ferma(); avvisa() },
    fineAscolto(): void { s = fineAscolto(s); avanti() },
    ascolta(f: (v: StatoVoce) => void): () => void { abbonati.add(f); return () => { abbonati.delete(f) } },
    stato(): StatoVoce { return { parla: s.parla !== undefined, ascolta: s.ascolta, inFila: s.fila.length, ...(problema !== undefined ? { problema } : {}) } }
  }
}

export const voce = creaVoce()

export function useStatoVoce(): StatoVoce {
  const [v, setV] = useState(() => voce.stato())
  useEffect(() => voce.ascolta(setV), [])
  return v
}
