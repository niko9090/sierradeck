import type { Terminal as XTerm } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { scegliWebgl, type RichiedenteWebgl } from '@shared/scelta-webgl'

/**
 * Il WebGL dei terminali, con un tetto di contesti. Chi ce l'ha lo decide
 * `scegliWebgl`; qui si applica: si carica l'addon agli scelti, si libera agli
 * altri. Senza WebGL (niente GPU, driver vecchi, accelerazione spenta) resta il
 * renderer normale, in silenzio, e non si riprova per il resto della sessione.
 */

type Voce = {
  term: XTerm
  visibile: boolean
  ultimoFuoco: number
  addon: WebglAddon | null
  /** Contesto perso: questo riquadro resta col renderer normale finche' non riappare a schermo. */
  perso: boolean
}

const voci = new Map<string, Voce>()
let fallito = false
let contatore = 0

function stacca(v: Voce): void {
  const a = v.addon
  if (!a) return
  v.addon = null
  try {
    a.dispose()
  } catch {
    /* gia' liberato: il terminale torna comunque al renderer normale */
  }
}

function applica(): void {
  const richiedenti: RichiedenteWebgl[] = []
  for (const [id, v] of voci) {
    richiedenti.push({ id, visibile: v.visibile && !v.perso, ultimoFuoco: v.ultimoFuoco })
  }
  const { conWebgl, senzaWebgl } = scegliWebgl(richiedenti, { webglFallito: fallito })
  // Prima si libera, poi si carica: il tetto non va superato nemmeno per un attimo.
  for (const id of senzaWebgl) {
    const v = voci.get(id)
    if (v) stacca(v)
  }
  for (const id of conWebgl) {
    const v = voci.get(id)
    if (!v || v.addon) continue
    try {
      const addon = new WebglAddon()
      addon.onContextLoss(() => {
        v.perso = true
        stacca(v)
        // Il contenuto e' del terminale, non dell'addon: si ridisegna e basta.
        try {
          v.term.refresh(0, v.term.rows - 1)
        } catch {
          /* terminale gia' chiuso */
        }
        applica()
      })
      v.term.loadAddon(addon)
      v.addon = addon
    } catch {
      fallito = true
      for (const altro of voci.values()) stacca(altro)
      return
    }
  }
}

/**
 * Mette il terminale fra quelli che possono avere il WebGL. Da chiamare dopo
 * `term.open`. Il ritorno va chiamato alla chiusura, prima di `term.dispose`.
 */
export function registraWebgl(term: XTerm, nodo: HTMLElement): () => void {
  const id = `t${++contatore}`
  const v: Voce = { term, visibile: false, ultimoFuoco: 0, addon: null, perso: false }
  voci.set(id, v)

  const osservatore =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((e) => {
          const ultimo = e[e.length - 1]
          if (!ultimo) return
          const era = v.visibile
          v.visibile = ultimo.isIntersecting
          if (era !== v.visibile) {
            if (v.visibile) v.perso = false
            applica()
          }
        })
  if (osservatore) osservatore.observe(nodo)
  else v.visibile = true

  const alFuoco = (): void => {
    v.ultimoFuoco = Date.now()
    applica()
  }
  const area = term.textarea
  area?.addEventListener('focus', alFuoco)
  applica()

  return () => {
    osservatore?.disconnect()
    area?.removeEventListener('focus', alFuoco)
    stacca(v)
    voci.delete(id)
    applica()
  }
}
