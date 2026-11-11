import { isAbsolute, resolve } from 'node:path'
import { CLASSI_PERMESSO, eClasse, type ClassePermesso } from '@shared/permessi-nicholas'
import { eInstallazione, rottaVietata } from './divieti'
import { gitCheRiscriveIlPubblicato } from './guardia-orchestratore'
import { azioneStrumento, postoProtetto, strumentoNegato } from './permessi-automatici'
import { chiaveComando, chiavePercorso } from './permessi-nicholas'

/**
 * **La richiesta di un permesso, controllata dal programma** (11/11).
 *
 * L'autopilota dice la classe e l'azione (`chiedi_consenso`); il programma
 * guarda che quell'azione sia davvero di quella classe (un comando che non è
 * un push forzato non diventa una domanda sul push forzato), ne ricava la
 * chiave con cui le guardie la riconosceranno, e il testo da mostrare a
 * Nicholas: il comando o il percorso così com'è, non le parole del modello.
 */

export type RichiestaConsenso = { classe?: unknown; comando?: unknown; percorsi?: unknown; strumento?: unknown }
export type RichiestaLetta =
  | { ok: true; classe: ClassePermesso; /** Le chiavi per le guardie. */ azioni: string[]; /** Quello che legge Nicholas. */ mostra: string[] }
  | { ok: false; motivo: string }

const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
/** Un comando da mostrare e da riconoscere: una riga sola, non enorme. */
const COMANDO_MAX = 1500

export function leggiRichiestaConsenso(p: RichiestaConsenso, o: { cwd: string; casa?: string; temp?: string }): RichiestaLetta {
  if (!eClasse(p.classe)) return { ok: false, motivo: `classe sconosciuta: una fra ${CLASSI_PERMESSO.join(', ')}` }
  const classe = p.classe
  const comando = str(p.comando)
  if (comando.length > COMANDO_MAX) return { ok: false, motivo: `il comando è troppo lungo (al più ${COMANDO_MAX} caratteri): a Nicholas va mostrato per intero` }
  const conComando = (controllo: (c: string) => string | undefined): RichiestaLetta => {
    if (comando === '') return { ok: false, motivo: 'manca «comando»: il comando esatto, così come verrà lanciato' }
    const no = controllo(comando)
    return no !== undefined ? { ok: false, motivo: no } : { ok: true, classe, azioni: [chiaveComando(comando)], mostra: [chiaveComando(comando)] }
  }
  switch (classe) {
    case 'cancellazioni':
      return { ok: false, motivo: 'per le cancellazioni la domanda la apre il programma da solo, con i percorsi esatti, quando il comando viene bloccato: fai lanciare il comando e aspetta la risposta di Nicholas' }
    case 'push-forzato':
      return conComando((c) => (gitCheRiscriveIlPubblicato(c) === undefined ? 'questo comando non è un push forzato né una cancellazione dal remoto: il programma non lo blocca per questo' : undefined))
    case 'installazione':
      return conComando((c) => (eInstallazione(c) ? undefined : 'questo comando non installa SierraDeck (non lancia l’installatore e non chiama la rotta che installa)'))
    case 'cose-altrui':
      return conComando((c) => (rottaVietata(c) === undefined ? 'questo comando non chiama una funzione protetta del programma' : undefined))
    case 'sottofondo':
      return conComando(() => undefined)
    case 'posti-protetti': {
      const percorsi = (Array.isArray(p.percorsi) ? p.percorsi : []).map(str).filter((x) => x !== '')
      if (percorsi.length === 0) return { ok: false, motivo: 'manca «percorsi»: i file da scrivere, uno per uno, con il percorso per intero' }
      if (percorsi.length > 20) return { ok: false, motivo: 'al più 20 file per domanda' }
      const file = percorsi.map((x) => (isAbsolute(x) ? resolve(x) : resolve(o.cwd, x)))
      const liberi = file.filter((f) => !postoProtetto(f, o))
      if (liberi.length > 0) return { ok: false, motivo: `non ${liberi.length === 1 ? 'è' : 'sono'} in un posto protetto, quindi si ${liberi.length === 1 ? 'scrive' : 'scrivono'} senza chiedere: ${liberi.join(', ')}` }
      return { ok: true, classe, azioni: file.map(chiavePercorso), mostra: file }
    }
    case 'strumenti-negati': {
      const strumento = str(p.strumento)
      if (strumento === '') return { ok: false, motivo: 'manca «strumento»: il nome dello strumento negato (per Bash o PowerShell anche «comando»)' }
      if (!strumentoNegato(strumento)) return { ok: false, motivo: `${strumento} non è fra gli strumenti che il programma nega` }
      if ((strumento === 'Bash' || strumento === 'PowerShell') && comando === '') return { ok: false, motivo: 'per Bash o PowerShell serve anche «comando»: il comando esatto' }
      const azione = azioneStrumento(strumento, { command: comando })
      return { ok: true, classe, azioni: [azione], mostra: [azione] }
    }
  }
}

/** Quanto indietro si guarda nel dialogo per sapere se installare l'ha chiesto Nicholas. */
export const INSTALLA_CHIESTO_ENTRO_MS = 24 * 3_600_000

/**
 * **Installare lo propone solo Nicholas** (regola del 12/10): la domanda sul
 * permesso di installare si apre solo se nelle sue ultime battute c'è la
 * richiesta di installare. Le righe del programma e dell'autopilota non contano.
 */
export function nicholasHaChiestoDiInstallare(righe: readonly { quando: string; da: string; testo: string; nicholas?: true }[], ora: number): boolean {
  return righe.some((r) => r.da === 'tu' && r.nicholas === true && ora - Date.parse(r.quando) <= INSTALLA_CHIESTO_ENTRO_MS && /\binstall(a|ala|alo|are|i|ami|amela|atela)\b/iu.test(r.testo) && !/\bnon\s+(la\s+|lo\s+)?install/iu.test(r.testo))
}
