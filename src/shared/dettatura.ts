/**
 * Parlare all'autopilota con il microfono (0.75.0). Nicholas, 15/10: «voglio
 * poterti parlare direttamente con il microfono per comunicare qui».
 *
 * Sul PC si usa la **dettatura di Windows** (Win+H): la Web Speech API di
 * Electron non funziona senza le chiavi di Google, e non si scarica né si
 * installa niente. Il testo dettato finisce nel campo che ha il fuoco; lo
 * manda sempre Nicholas. Il programma non registra, non salva e non manda
 * audio: lo ascolta Windows, con le sue impostazioni.
 *
 * Qui la regola pura: se la dettatura si può aprire, e se no perché e come
 * attivarla. Le stesse parole sul PC; pagina e app hanno il loro
 * riconoscimento (del browser e di Android).
 */

export type StatoDettatura = { disponibile: true } | { disponibile: false; motivo: string; comeAttivare: string }

/** La dettatura di Windows (Win+H) c'è da Windows 10 1803, build 17134. */
export const BUILD_MINIMA_DETTATURA = 17134

export const SPIEGA_DETTATURA =
  'Il tasto 🎤 mette il cursore nel campo e apre la dettatura di Windows (come Win+H): parli in italiano e il testo compare nel campo mentre parli. ' +
  'Non parte niente da solo: quando hai finito lo rileggi e premi tu «Manda». ' +
  'SierraDeck non registra, non salva e non manda l’audio a nessuno: lo ascolta Windows, con le sue impostazioni di riconoscimento vocale. ' +
  'Per fermare la dettatura premi di nuovo 🎤 o Win+H, oppure clicca fuori.'

export function valutaDettatura(p: {
  piattaforma: string
  /** `os.release()`: «10.0.26100». */
  release: string
  /** Privacy di Windows → Microfono, «Consenti alle app di accedere al microfono»: `Allow` o `Deny` (assente = predefinito, consentito). */
  microfono?: string
  /** La stessa voce per le app desktop (`NonPackaged`). */
  microfonoDesktop?: string
}): StatoDettatura {
  if (p.piattaforma !== 'win32') {
    return { disponibile: false, motivo: 'Dettatura non disponibile su questo PC: c’è solo su Windows.', comeAttivare: 'Su macOS usa la dettatura del sistema (premi due volte Fn) dentro il campo; su Linux un programma di dettatura del sistema.' }
  }
  const build = Number(p.release.split('.')[2] ?? '0')
  if (!Number.isFinite(build) || build < BUILD_MINIMA_DETTATURA) {
    return { disponibile: false, motivo: 'Dettatura non disponibile su questo PC: Windows è troppo vecchio.', comeAttivare: 'La dettatura (Win+H) c’è da Windows 10 versione 1803. Aggiorna Windows da Impostazioni → Windows Update.' }
  }
  if (p.microfono === 'Deny' || p.microfonoDesktop === 'Deny') {
    return {
      disponibile: false,
      motivo: 'Dettatura non disponibile su questo PC: il microfono è bloccato.',
      comeAttivare: 'Apri Impostazioni di Windows → Privacy e sicurezza → Microfono e accendi «Accesso al microfono» e «Consenti alle app desktop di accedere al microfono». Poi riprova.'
    }
  }
  return { disponibile: true }
}
