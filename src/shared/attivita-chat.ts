import { statoDaSegnali, type Segnale } from './segnali-chat'

/**
 * Cosa fa una chat adesso, in parole semplici, dai segnali di Claude Code
 * (0.79.0, la dashboard dell'autopilota). Nicholas vuole leggere nel
 * riassunto «Al lavoro» che cosa sta facendo ogni chat — «fa girare i test»,
 * «modifica il codice (App.tsx)» — senza leggere quello che scrivono le chat.
 *
 * La fonte è l'ultimo strumento usato nel turno (`PreToolUse` per i comandi e
 * gli agenti, che durano; `PostToolUse` per gli altri), letto dal suo nome e
 * dal comando, mai dalla descrizione che scrive la chat. Il riassunto
 * (`riassuntoAlLavoro` in `panoramica.ts`) la mette accanto a «da quanto».
 *
 * Pura: la usano il PC (per la pagina e l'app arriva già composta in
 * `/api/panoramica`) e i test.
 */

const nomeFile = (p: string | undefined): string | undefined => {
  if (p === undefined) return undefined
  const n = p.replace(/\\/g, '/').split('/').filter((x) => x !== '').pop()
  return n !== undefined && n.length <= 40 && !/\s/.test(n) ? n : undefined
}

/**
 * Un comando della shell in parole semplici. Dal comando, non dalla
 * descrizione che scrive la chat: «Run tests» è parola sua, `npx vitest` no.
 */
export function attivitaComando(comando: string): string {
  const c = comando.toLowerCase()
  if (/\b(vitest|jest|pytest|mocha)\b|playwright test|\bnpm (run )?test\b|\b(pnpm|yarn) test\b|testdebugunittest|\bgradlew? .*\btest|\b(go|cargo) test\b|\bnode --test\b/.test(c)) return 'fa girare i test'
  if (/\bnpm run pubblica\b|\bgh release\b|allega-apk|electron-builder/.test(c)) return 'prepara la release'
  if (/\b(tsc|typecheck)\b|\bnpm run (build|pacchetto)\b|electron-vite build|\bassemble(debug|release)?\b|\b(go|cargo) build\b/.test(c)) return 'compila il programma'
  if (/\bgit (merge|rebase|cherry-pick)\b/.test(c)) return 'unisce il lavoro delle altre chat'
  if (/\bgit (commit|add)\b/.test(c)) return 'salva il lavoro'
  if (/\bgit (status|diff|log|show|blame)\b/.test(c)) return 'guarda le modifiche'
  if (/\b(npm|pnpm|yarn) (i|install|ci|add)\b|\bpip install\b/.test(c)) return 'installa i pacchetti'
  if (/sierradeck_prova|\belectron\b|\bnpm run (dev|start)\b/.test(c)) return 'prova il programma'
  if (/^\s*(cd [^&;]+(&&|;)\s*)?(cat|head|tail|ls|dir|grep|rg|find|sed -n|wc|type)\b/.test(c)) return 'legge il codice'
  return 'esegue un comando'
}

/** Uno strumento di Claude Code in parole semplici. */
export function attivitaStrumento(strumento: string, dettaglio?: string, comando?: string): string {
  const s = strumento
  if (s === 'Bash' || s === 'PowerShell') return attivitaComando(comando ?? dettaglio ?? '')
  if (s === 'Edit' || s === 'Write' || s === 'MultiEdit' || s === 'NotebookEdit') {
    const f = nomeFile(dettaglio)
    return f !== undefined ? `modifica il codice (${f})` : 'modifica il codice'
  }
  if (s === 'Read' || s === 'Grep' || s === 'Glob' || s === 'LS' || s === 'NotebookRead') return 'legge il codice'
  if (s === 'Task' || s === 'Agent') return 'si fa aiutare da un agente'
  if (s === 'WebFetch' || s === 'WebSearch') return 'cerca informazioni in rete'
  if (s === 'TodoWrite' || s === 'TaskCreate' || s === 'TaskUpdate') return 'organizza il lavoro'
  if (s === 'AskUserQuestion') return 'ti fa una domanda'
  if (s === 'Skill') return 'segue una procedura'
  if (/chrome|devtools|browser|playwright/i.test(s)) return 'prova nel browser'
  if (/manda_al_telefono/.test(s)) return 'manda un file al telefono'
  return 'lavora'
}

/** Dopo quanto silenzio un «al lavoro» dai segnali non si racconta più come lavoro (come `lavoraDaSegnali`). */
export const SILENZIO_MS = 10 * 60_000

/** Cosa dice di una chat il suo ultimo giro di segnali. */
export type DaiSegnali = { cosa: string; dal: string; aspettaTe: boolean; lavora: boolean }

/**
 * Cosa fa una chat secondo i segnali: la fase del turno decide se lavora o
 * aspetta; mentre lavora, l'ultimo strumento del turno dice che cosa fa.
 * `undefined` se non c'è nessun segnale.
 */
export function cosaFaDaSegnali(segnali: readonly Segnale[], adesso?: number): DaiSegnali | undefined {
  const st = statoDaSegnali([...segnali])
  if (st === undefined) return undefined
  if (st.fase === 'chiede') {
    if (st.chiede?.tipo === 'domanda') return { cosa: 'ti fa una domanda', dal: st.dal, aspettaTe: true, lavora: false }
    // Il comando dal segnale del permesso, non la descrizione scritta dalla chat (revisione ECC).
    const permesso = [...segnali].reverse().find((g) => g.evento === 'PermissionRequest')
    const per = st.chiede?.strumento !== undefined ? attivitaStrumento(st.chiede.strumento, st.chiede.dettaglio, permesso?.comando) : undefined
    return { cosa: per !== undefined && per !== 'lavora' ? `aspetta il tuo permesso: ${per}` : 'aspetta il tuo permesso', dal: st.dal, aspettaTe: true, lavora: false }
  }
  if (st.fase === 'errore') return { cosa: 'si è fermata per un errore', dal: st.dal, aspettaTe: false, lavora: false }
  if (st.fase === 'chiusa') return { cosa: 'chat chiusa', dal: st.dal, aspettaTe: false, lavora: false }
  if (st.fase === 'aspetta') return { cosa: 'ha finito il turno', dal: st.dal, aspettaTe: false, lavora: false }
  // Un «al lavoro» senza più segnali da tanto è forse uno Stop perso (revisione ECC):
  // non si dice più «fa girare i test» per ore, si dice da quanto tace.
  const ultimo = Date.parse(segnali[segnali.length - 1]?.quando ?? '')
  if (adesso !== undefined && Number.isFinite(ultimo) && adesso - ultimo >= SILENZIO_MS) {
    return { cosa: `nessun segnale da ${Math.round((adesso - ultimo) / 60_000)} min`, dal: st.dal, aspettaTe: false, lavora: false }
  }
  // Al lavoro: l'ultimo strumento dopo l'inizio del turno.
  let inizio = -1
  for (let i = segnali.length - 1; i >= 0; i--) if (segnali[i]!.evento === 'UserPromptSubmit') { inizio = i; break }
  const strumento = [...segnali.slice(inizio + 1)].reverse().find((g) => (g.evento === 'PreToolUse' || g.evento === 'PostToolUse') && g.strumento !== undefined)
  const cosa = strumento !== undefined ? attivitaStrumento(strumento.strumento!, strumento.dettaglio, strumento.comando) : 'ci pensa'
  return { cosa, dal: st.dal, aspettaTe: false, lavora: true }
}

/**
 * L'attività da mettere nel riassunto «Al lavoro»: solo quando i segnali dicono
 * che la chat lavora o aspetta te. «ha finito il turno», «chat chiusa» o un
 * silenzio lungo non sono attività: lì decide lo stato della scheda.
 */
export function attivitaDaSegnali(segnali: readonly Segnale[], adesso?: number): string | undefined {
  const g = cosaFaDaSegnali(segnali, adesso)
  return g !== undefined && (g.lavora || g.aspettaTe) ? g.cosa : undefined
}
