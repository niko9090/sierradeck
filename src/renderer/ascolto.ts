import { useEffect, useState } from 'react'
import {
  ATTESA_DOPO_SVEGLIA_MS, decidiFrase, dopoEventoFinestra, passoVad, PASSO_MS, PRIMA_MS, puoAscoltare, rms, VAD_INIZIO, valutaFrase,
  type FaseAscolto, type Vad
} from '@shared/parlato'
import type { ComandoVocale } from '@shared/voce-autopilota'
import type { StatoModello } from '@shared/modello-voce'
import { impostazioniVoce, voce } from './voce'

/**
 * **L'orecchio di «Parlato»** (13/11): il microfono aperto, una volta sola
 * per finestra, legato a una chat dell'autopilota alla volta (il
 * «bersaglio»). Taglia le frasi col VAD di `@shared/parlato`, butta quelle
 * corte, piane o sentite mentre parla il programma, le fa trascrivere a
 * Whisper sul PC (main) e manda all'autopilota solo quelle che cominciano con
 * la parola di sveglia. Vale per gli autopiloti degli altri PC: il bersaglio
 * manda con la sorgente della chat.
 */

export type Bersaglio = {
  /** La chat (sorgente + autopilota): una sola alla volta ascolta. */
  chiave: string
  nome: string
  invia: (testo: string) => Promise<unknown>
  comando: (c: ComandoVocale) => void
}

export type StatoAscolto = {
  fase: FaseAscolto
  bersaglio?: { chiave: string; nome: string }
  /** L'ultima frase mandata o il comando eseguito, per vederla. */
  ultima?: string | undefined
  problema?: string | undefined
}

const FREQUENZA = 16_000
const CAMPIONI_PASSO = 1024

function creaAscolto() {
  let s: StatoAscolto = { fase: 'spento' }
  let bersaglio: Bersaglio | undefined
  let flusso: MediaStream | undefined
  let contesto: AudioContext | undefined
  let vad: Vad = VAD_INIZIO
  // Gli ultimi passi prima della voce (PRIMA_MS) e la frase in corso.
  let prima: Float32Array[] = []
  let frase: Float32Array[] | undefined
  let parlavaLaVoce = false
  let fineVoce = 0
  let voceParla = voce.stato().parla
  let dettaturaAperta = false
  let svegliaFinoA: number | undefined
  let mutoFinoA = 0
  let inTrascrizione = 0
  const abbonati = new Set<(x: StatoAscolto) => void>()

  const cambia = (n: Partial<StatoAscolto>): void => {
    s = { ...s, ...n }
    if (s.fase === 'spento') delete s.bersaglio
    for (const f of abbonati) f(s)
  }
  /** La fase «a riposo» adatta al momento. */
  const riposo = (): FaseAscolto => (voceParla ? 'tace' : svegliaFinoA !== undefined && Date.now() <= svegliaFinoA ? 'sveglia' : inTrascrizione > 0 ? 'trascrive' : 'ascolta')

  voce.ascolta((v) => {
    if (voceParla && !v.parla) fineVoce = Date.now()
    voceParla = v.parla
    if (v.parla && frase !== undefined) parlavaLaVoce = true
    if (s.fase !== 'spento' && s.fase !== 'errore' && s.fase !== 'avvio') cambia({ fase: riposo() })
  })

  /** Un bip corto quando sente la parola di sveglia: con le mani libere non si guarda lo schermo. */
  const bip = (): void => {
    const c = contesto
    if (c === undefined) return
    try {
      const o = c.createOscillator()
      const g = c.createGain()
      o.frequency.value = 880
      g.gain.value = 0.06
      o.connect(g).connect(c.destination)
      o.start()
      o.stop(c.currentTime + 0.12)
      mutoFinoA = Date.now() + 300
    } catch { /* senza bip */ }
  }

  const aInt16 = (pezzi: Float32Array[]): Uint8Array => {
    const n = pezzi.reduce((t, p) => t + p.length, 0)
    const out = new Int16Array(n)
    let i = 0
    for (const p of pezzi) for (let j = 0; j < p.length; j += 1) { const x = Math.max(-1, Math.min(1, p[j] ?? 0)); out[i++] = x < 0 ? x * 0x8000 : x * 0x7fff }
    return new Uint8Array(out.buffer)
  }

  async function trascriviEDecidi(pezzi: Float32Array[], b: Bersaglio): Promise<void> {
    const api = window.gestore.voceLocale
    if (api === undefined) return
    inTrascrizione += 1
    cambia({ fase: 'trascrive' })
    const parola = impostazioniVoce().parolaSveglia
    try {
      const r = await api.trascrivi(aInt16(pezzi), parola)
      if (!r.ok) {
        if (r.messaggio !== 'occupato') cambia({ ultima: `⚠ ${r.messaggio}` })
        return
      }
      if (bersaglio?.chiave !== b.chiave) return
      const d = decidiFrase(r.testo, { parola, adesso: Date.now(), ...(svegliaFinoA !== undefined ? { svegliaFinoA } : {}) })
      if (d.tipo === 'scarta') return
      if (d.tipo === 'sveglia') { svegliaFinoA = Date.now() + ATTESA_DOPO_SVEGLIA_MS; bip(); setTimeout(() => { if (s.fase === 'sveglia') cambia({ fase: riposo() }) }, ATTESA_DOPO_SVEGLIA_MS + 50); return }
      svegliaFinoA = undefined
      bip()
      if (d.tipo === 'comando') {
        cambia({ ultima: `«${d.comando === 'spegni' ? 'smetti di ascoltare' : d.comando}»` })
        if (d.comando === 'spegni') { spegni(); return }
        if (d.comando === 'zitto') voce.zitto()
        else if (d.comando === 'ripeti') voce.ripeti()
        else b.comando(d.comando)
        return
      }
      cambia({ fase: 'manda', ultima: d.testo })
      await b.invia(d.testo).catch((e: unknown) => cambia({ ultima: `⚠ Non mandato: ${e instanceof Error ? e.message : String(e)}` }))
    } finally {
      inTrascrizione -= 1
      if (s.fase !== 'spento' && s.fase !== 'errore') cambia({ fase: riposo() })
    }
  }

  function suPasso(dati: Float32Array): void {
    const b = bersaglio
    if (b === undefined) return
    const adesso = Date.now()
    const si = adesso >= mutoFinoA && puoAscoltare({ modo: 'parlato', voceParla, msDaFineVoce: adesso - fineVoce, dettaturaAperta })
    if (!si) {
      // Mentre parla il programma non si ascolta niente: la frase in corso si butta.
      if (frase !== undefined) { frase = undefined; voce.fineAscolto() }
      vad = { ...VAD_INIZIO, rumore: vad.rumore }
      prima = []
      return
    }
    const copia = new Float32Array(dati)
    const { stato, evento } = passoVad(vad, rms(copia), PASSO_MS)
    vad = stato
    if (frase === undefined) {
      prima.push(copia)
      if (prima.length * PASSO_MS > PRIMA_MS + 128) prima.shift()
    } else {
      frase.push(copia)
    }
    if (evento === 'inizio') {
      frase = prima
      prima = []
      parlavaLaVoce = false
      // Mentre parli la voce non comincia una frase nuova.
      voce.inizioAscolto()
      if (s.fase === 'ascolta') cambia({ fase: 'sente' })
      return
    }
    if (evento !== undefined && frase !== undefined) {
      const pezzi = frase
      frase = undefined
      voce.fineAscolto()
      const giudizio = valutaFrase({ ...evento, parlavaLaVoce })
      if (!giudizio.tieni) { if (s.fase === 'sente') cambia({ fase: riposo() }); return }
      // La quiete in coda (1,5 s) non serve a Whisper: se ne tengono 300 ms.
      const togli = Math.max(0, Math.floor((evento.motivo === 'silenzio' ? 1500 - 300 : 0) / PASSO_MS))
      void trascriviEDecidi(pezzi.slice(0, Math.max(1, pezzi.length - togli)), b)
    }
  }

  async function accendi(b: Bersaglio): Promise<void> {
    bersaglio = b
    if (contesto !== undefined) { cambia({ bersaglio: { chiave: b.chiave, nome: b.nome }, fase: riposo() }); return }
    cambia({ fase: 'avvio', bersaglio: { chiave: b.chiave, nome: b.nome }, problema: undefined, ultima: undefined })
    try {
      const m = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true, channelCount: 1 } })
      if (bersaglio?.chiave !== b.chiave) { for (const t of m.getTracks()) t.stop(); return }
      flusso = m
      const c = new AudioContext({ sampleRate: FREQUENZA })
      contesto = c
      const sorgente = c.createMediaStreamSource(m)
      // ScriptProcessor: deprecato ma senza file a parte (la CSP vuole script solo dal pacchetto) e basta per un VAD.
      const proc = c.createScriptProcessor(CAMPIONI_PASSO, 1, 1)
      const zero = c.createGain()
      zero.gain.value = 0
      proc.onaudioprocess = (e) => suPasso(e.inputBuffer.getChannelData(0))
      sorgente.connect(proc)
      proc.connect(zero).connect(c.destination)
      for (const t of m.getAudioTracks()) t.onended = () => spegni('Il microfono si è staccato.')
      vad = VAD_INIZIO
      cambia({ fase: riposo() })
    } catch (e) {
      const nome = e instanceof DOMException ? e.name : ''
      const problema = nome === 'NotAllowedError' || nome === 'SecurityError'
        ? 'Il microfono è bloccato: Impostazioni di Windows → Privacy → Microfono.'
        : nome === 'NotFoundError' ? 'Nessun microfono trovato su questo PC.'
        : `Il microfono non è partito: ${e instanceof Error ? e.message : String(e)}`
      chiudiAudio()
      bersaglio = undefined
      cambia({ fase: 'errore', problema })
    }
  }

  function chiudiAudio(): void {
    for (const t of flusso?.getTracks() ?? []) t.stop()
    flusso = undefined
    void contesto?.close().catch(() => undefined)
    contesto = undefined
    if (frase !== undefined) voce.fineAscolto()
    frase = undefined
    prima = []
    svegliaFinoA = undefined
  }

  function spegni(problema?: string): void {
    chiudiAudio()
    bersaglio = undefined
    cambia({ fase: 'spento', problema })
  }

  // La X manda la finestra nell'area di notifica: Parlato si spegne (vedi `dopoEventoFinestra`).
  if (typeof window !== 'undefined') window.gestore?.voceLocale?.suFinestraNascosta(() => { if (s.fase !== 'spento' && dopoEventoFinestra('nascosta') === 'spegni') spegni('Finestra chiusa: ascolto spento.') })

  return {
    accendi,
    spegni,
    /** La chat che ascoltava si è chiusa: si spegne dopo un attimo, se nessuno la riprende (un ridisegno la rimonta subito). */
    chatChiusa(chiave: string): void {
      setTimeout(() => {
        if (bersaglio?.chiave === chiave && dopoEventoFinestra('chat-chiusa') === 'spegni' && !bersaglioVivo.has(chiave)) spegni()
      }, 1500)
    },
    /** La dettatura di Windows (🎤) è aperta: intanto non si ascolta. */
    dettatura(aperta: boolean): void { dettaturaAperta = aperta },
    /** Il bersaglio aggiornato (le funzioni di chi sta sopra cambiano a ogni disegno). */
    aggiorna(b: Bersaglio): void { if (bersaglio?.chiave === b.chiave) bersaglio = b },
    stato: (): StatoAscolto => s,
    ascolta(f: (x: StatoAscolto) => void): () => void { abbonati.add(f); return () => { abbonati.delete(f) } }
  }
}

/** Le chat montate adesso: una chat ridisegnata si rimonta, e non va spento l'ascolto. */
const bersaglioVivo = new Set<string>()

export const ascolto = creaAscolto()

/** Una chat che può ascoltare: si segna montata, e smontata avvisa l'orecchio. */
export function useBersaglio(b: Bersaglio): void {
  useEffect(() => { ascolto.aggiorna(b) })
  useEffect(() => {
    bersaglioVivo.add(b.chiave)
    return () => { bersaglioVivo.delete(b.chiave); ascolto.chatChiusa(b.chiave) }
  }, [b.chiave])
}

export function useAscolto(): StatoAscolto {
  const [x, setX] = useState(() => ascolto.stato())
  useEffect(() => ascolto.ascolta(setX), [])
  return x
}

// ------------------------------------------------------------- il modello di Whisper

let modello: StatoModello | undefined
const abbonatiModello = new Set<(s: StatoModello) => void>()
let agganciato = false

function aggancia(): void {
  if (agganciato) return
  const api = typeof window !== 'undefined' ? window.gestore?.voceLocale : undefined
  if (api === undefined) return
  agganciato = true
  api.suCambio((n) => { modello = n; for (const f of abbonatiModello) f(n) })
  void api.stato().then((n) => { modello = n; for (const f of abbonatiModello) f(n) }).catch(() => undefined)
}

/** Lo stato del riconoscimento (assente, scarica, pronto…); `undefined` finché non si sa, o nelle finestre senza. */
export function useModelloVoce(): StatoModello | undefined {
  const [x, setX] = useState(modello)
  useEffect(() => { aggancia(); abbonatiModello.add(setX); if (modello !== undefined) setX(modello); return () => { abbonatiModello.delete(setX) } }, [])
  return x
}
