import { REGOLA_LEZIONI } from '@shared/lezioni-chat'
import { REGOLA_RAPPORTO } from '@shared/rapporti-chat'

/**
 * **Gli specialisti come subagenti nativi** (P3, 30/10/2026): il file per
 * `--agents`, scritto dal servizio in `orchestratori/<workspace>/agenti.json`.
 * Ognuno con il suo prompt, i suoi strumenti, il suo modello e la sua copia
 * del progetto (`isolation: "worktree"`): la CLI lo apre in sottofondo,
 * lo segue e sveglia l'orchestratore quando ha finito. Niente terminali del
 * mosaico, niente schermi da leggere.
 *
 * E il file per `--settings`: il PreToolUse dei divieti (lo stesso delle chat
 * governate, `/hook/pretool`), che fa rispettare anche i turni dei comandi
 * pesanti del PC.
 */

export type DefinizioneAgente = {
  description: string
  prompt: string
  tools: string[]
  model: 'haiku' | 'sonnet' | 'opus'
  isolation: 'worktree'
}

const LETTURA = ['Read', 'Grep', 'Glob']
const SHELL = ['Bash', 'PowerShell']
const SCRITTURA = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'TodoWrite']

const COMUNE = [
  'Lavori per l’autopilota di SierraDeck, che coordina il workspace e parla con Nicholas: il compito, il criterio e i vincoli sono nel messaggio che ricevi.',
  'Lavori nella tua copia del progetto (un worktree tuo, su un ramo tuo). Fai commit quando un pezzo è compiuto. Non cambiare ramo, non toccare la cartella principale, non fare push e non installare niente: il ramo lo prova e lo unisce l’autopilota, che misura il criterio.',
  'Se ti manca una decisione che non puoi prendere tu, fermati e dillo nel riepilogo finale («bloccato: …»): l’autopilota risponde, o chiede a Nicholas.',
  '',
  'Il tuo messaggio finale è il riepilogo che l’autopilota legge: cosa hai fatto, i file toccati, come l’hai verificato, cosa resta. In fondo le righe:',
  ...REGOLA_RAPPORTO,
  ...REGOLA_LEZIONI
].join('\n')

export const AGENTI_ORCHESTRATORE: Record<string, DefinizioneAgente> = {
  sviluppatore: {
    description: 'Scrive e corregge codice per un compito del piano, con i suoi test. Usalo per ogni cambiamento al progetto.',
    prompt: `Sei lo sviluppatore. Scrivi codice pulito nello stile del progetto, con i test che servono, e verifichi il criterio prima di dire «fatto».\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, ...SCRITTURA],
    model: 'sonnet',
    isolation: 'worktree'
  },
  verificatore: {
    description: 'Prova un ramo o un comportamento: lancia test e controlli, riproduce un difetto, dice cosa passa e cosa no. Corregge solo i test.',
    prompt: `Sei il verificatore. Misuri i fatti: lanci i comandi, leggi le uscite, riproduci i difetti. Non cambi il codice del prodotto; al più scrivi o correggi test.\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, 'Edit', 'Write', 'TodoWrite'],
    model: 'haiku',
    isolation: 'worktree'
  },
  revisore: {
    description: 'Rilegge un ramo o un cambiamento e trova i difetti veri (correttezza, casi limite, regressioni). Solo lettura.',
    prompt: `Sei il revisore. Leggi il cambiamento e il codice intorno e trovi i difetti che contano, con il file e la riga. Non scrivi niente: elenchi i problemi in ordine di gravità.\n\n${COMUNE}`,
    tools: [...LETTURA],
    model: 'opus',
    isolation: 'worktree'
  },
  esploratore: {
    description: 'Cerca nel progetto dove sta una cosa e come funziona, prima di pianificare. Solo lettura, veloce.',
    prompt: `Sei l’esploratore. Trovi dove stanno le cose nel progetto e come sono collegate, e lo riassumi con i percorsi dei file. Non scrivi niente.\n\n${COMUNE}`,
    tools: [...LETTURA],
    model: 'haiku',
    isolation: 'worktree'
  },
  interfaccia: {
    description: 'Cambia l’interfaccia (React, CSS, testi in italiano) per un compito del piano.',
    prompt: `Sei lo specialista dell’interfaccia: componenti React, stili, testi in un italiano semplice e corretto. Mantieni lo stile esistente.\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, ...SCRITTURA],
    model: 'sonnet',
    isolation: 'worktree'
  },
  android: {
    description: 'Lavora sull’app Android (Kotlin) per un compito del piano.',
    prompt: `Sei lo specialista Android: Kotlin, Gradle, l’app che parla con il PC. Compili prima di dire «fatto».\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, ...SCRITTURA],
    model: 'sonnet',
    isolation: 'worktree'
  }
}

export const RUOLI_AGENTI = Object.keys(AGENTI_ORCHESTRATORE)

/** Il contenuto di `agenti.json` per `--agents`. */
export function fileAgenti(): string {
  return JSON.stringify(AGENTI_ORCHESTRATORE, null, 2)
}

/** Il contenuto di `impostazioni-cli.json` per `--settings`: i divieti sui comandi, dal servizio. */
export function fileImpostazioniCli(porta: number, autopilotaId: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: 'Bash|PowerShell',
        hooks: [{ type: 'http', url: `http://127.0.0.1:${porta}/hook/pretool?ap=${encodeURIComponent(autopilotaId)}`, timeout: 30 }]
      }]
    }
  }, null, 2)
}
