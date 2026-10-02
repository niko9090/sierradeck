import {
  chatProtetta, chiaveSblocco, dopoTentativo, frase, inattivitaValida, leggiImpostazioniPin, pinValido, puoProvare, richiudi,
  sbloccata, tocca, TENTATIVI_INIZIALI, type ChatPerPin, type ImpostazioniPin, type Sblocchi, type Tentativi
} from '@shared/pin-chat'
import { improntaPin, verificaPin } from './pin-impronta'

/**
 * Il guardiano del PIN delle chat (0.49.0), uno per PC: tiene le impostazioni
 * (solo l'impronta del PIN), chi ha aperto quale chat e fino a quando, e i
 * tentativi sbagliati — **uno solo per tutte le strade insieme** (questo
 * schermo, il telefono, la pagina, gli altri PC, il ponte): chi prova da
 * cinque parti non prova cinque volte più in fretta. La verifica la fa
 * sempre il PC di casa della chat: gli altri chiedono qui.
 */

/** Quello che il pannello può sapere: mai l'impronta. */
export type StatoPin = Omit<ImpostazioniPin, 'impronta'> & { impostato: boolean }

export type EsitoPin = { ok: true } | { ok: false; errore: string; fraMs?: number }

/** Chi guarda senza dire chi è (un altro PC prima della 0.49.1): niente sblocco che resti. */
export function visoreAnonimo(visore: string): boolean {
  return visore === 'pc'
}

export type GuardianoPin = {
  stato: () => StatoPin
  /** Imposta o cambia il PIN. Se ce n'è già uno serve quello, o la password della cassaforte. */
  impostaPin: (nuovo: string, attuale?: string) => Promise<EsitoPin>
  attiva: (si: boolean) => EsitoPin
  impostaInattivita: (min: number) => void
  proteggiChat: (sessione: string, si: boolean) => void
  proteggiWorkspace: (nome: string, si: boolean) => void
  /** Dimenticato: si toglie il PIN con la password principale della cassaforte. Le protezioni restano, spente. */
  azzera: (passphrase: string) => Promise<EsitoPin>
  protetta: (c: ChatPerPin) => boolean
  /** Chiusa per chi guarda, adesso. */
  chiusa: (visore: string, c: ChatPerPin & { id?: string }) => boolean
  sblocca: (visore: string, c: ChatPerPin & { id?: string }, pin: string) => EsitoPin
  /** Un gesto su una chat aperta (scrivere, premere): sposta in avanti la richiusura. */
  tocca: (visore: string, c: ChatPerPin & { id?: string }) => void
  richiudi: (visore?: string) => void
}

export function creaGuardianoPin(deps: {
  leggi: () => unknown
  scrivi: (p: ImpostazioniPin) => void
  /** La password principale della cassaforte è giusta? */
  passphraseGiusta: (passphrase: string) => Promise<boolean>
  adesso?: () => number
  log?: (m: string) => void
}): GuardianoPin {
  const adesso = deps.adesso ?? ((): number => Date.now())
  let imp = leggiImpostazioniPin(deps.leggi())
  const sblocchi: Sblocchi = new Map()
  let tentativi: Tentativi = TENTATIVI_INIZIALI
  const salva = (p: ImpostazioniPin): void => { imp = p; deps.scrivi(p) }
  const prova = (pin: string): EsitoPin => {
    const puo = puoProvare(tentativi, adesso())
    if (!puo.ok) return { ok: false, errore: `Troppi tentativi sbagliati: riprova fra ${frase(puo.fraMs)}.`, fraMs: puo.fraMs }
    const giusto = verificaPin(pin, imp.impronta)
    tentativi = dopoTentativo(tentativi, giusto, adesso())
    if (giusto) return { ok: true }
    deps.log?.(`[pin] PIN sbagliato (${tentativi.sbagliati} di fila)`)
    const dopo = puoProvare(tentativi, adesso())
    return dopo.ok
      ? { ok: false, errore: 'PIN sbagliato.' }
      : { ok: false, errore: `PIN sbagliato. Troppi tentativi: il prossimo fra ${frase(dopo.fraMs)}.`, fraMs: dopo.fraMs }
  }

  return {
    stato() {
      const { impronta, ...resto } = imp
      return { ...resto, impostato: impronta !== undefined }
    },
    async impostaPin(nuovo, attuale) {
      if (!pinValido(nuovo)) return { ok: false, errore: 'Il PIN va da 4 a 8 cifre, solo numeri.' }
      if (imp.impronta !== undefined) {
        const ok = attuale !== undefined && (prova(attuale).ok || (attuale.length > 8 && await deps.passphraseGiusta(attuale)))
        if (!ok) return { ok: false, errore: 'Per cambiare il PIN serve quello di adesso (o la password principale della cassaforte).' }
      }
      salva({ ...imp, impronta: improntaPin(nuovo), attivo: true })
      richiudi(sblocchi)
      deps.log?.('[pin] PIN impostato')
      return { ok: true }
    },
    attiva(si) {
      if (si && imp.impronta === undefined) return { ok: false, errore: 'Prima imposta un PIN.' }
      salva({ ...imp, attivo: si })
      if (si) richiudi(sblocchi)
      return { ok: true }
    },
    impostaInattivita(min) { salva({ ...imp, inattivitaMin: inattivitaValida(min) }) },
    proteggiChat(sessione, si) {
      const chat = imp.chat.filter((x) => x !== sessione)
      salva({ ...imp, chat: si ? [...chat, sessione] : chat })
      if (si) richiudi(sblocchi)
    },
    proteggiWorkspace(nome, si) {
      const workspace = imp.workspace.filter((x) => x !== nome)
      salva({ ...imp, workspace: si ? [...workspace, nome] : workspace })
      if (si) richiudi(sblocchi)
    },
    async azzera(passphrase) {
      const puo = puoProvare(tentativi, adesso())
      if (!puo.ok) return { ok: false, errore: `Troppi tentativi sbagliati: riprova fra ${frase(puo.fraMs)}.`, fraMs: puo.fraMs }
      const giusta = passphrase !== '' && await deps.passphraseGiusta(passphrase)
      tentativi = dopoTentativo(tentativi, giusta, adesso())
      if (!giusta) return { ok: false, errore: 'La password della cassaforte non è giusta.' }
      const { impronta: _via, ...resto } = imp
      salva({ ...resto, attivo: false })
      richiudi(sblocchi)
      deps.log?.('[pin] PIN azzerato con la password della cassaforte')
      return { ok: true }
    },
    protetta: (c) => chatProtetta(imp, c),
    chiusa(visore, c) {
      return chatProtetta(imp, c) && !sbloccata(sblocchi, visore, chiaveSblocco(c), adesso(), imp.inattivitaMin)
    },
    sblocca(visore, c, pin) {
      if (!chatProtetta(imp, c)) return { ok: true }
      const e = prova(pin)
      // Un PC prima della 0.49.1 non dice chi è (`pc`): il PIN giusto vale
      // per quella richiesta e non resta aperto, se no si aprirebbe per tutti.
      if (e.ok && !visoreAnonimo(visore)) tocca(sblocchi, visore, chiaveSblocco(c), adesso(), imp.inattivitaMin, true)
      return e
    },
    tocca(visore, c) { if (!visoreAnonimo(visore)) tocca(sblocchi, visore, chiaveSblocco(c), adesso(), imp.inattivitaMin) },
    richiudi(visore) { richiudi(sblocchi, visore) }
  }
}
