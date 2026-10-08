import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { basename, dirname, join, resolve } from 'node:path'
import { cosaCambia } from '@shared/negozio'

/**
 * Il negozio, lato scrittura per skill e MCP: qui non c'è un CLID a cui delegare
 * come per i plugin, quindi si toccano i file — ma con le pinze.
 *
 * Una **skill** non si disattiva cancellandola: si mette in `skillOverrides` del
 * `settings.json` («off»). Un **MCP** di progetto si disattiva aggiungendolo a
 * `disabledMcpjsonServers` dentro `~/.claude.json`, sotto il progetto giusto.
 *
 * `~/.claude.json` è il file più delicato dell'utente (decine di KB, tutta la sua
 * configurazione): si legge, si cambia **una sola chiave**, si riscrive tutto il
 * resto identico. Se non è leggibile non si scrive: meglio un'azione che non
 * riesce che un file corrotto.
 */

export type EsitoAzione = { ok: boolean; messaggio?: string; fatto?: string }

function leggiOggetto(percorso: string): Record<string, unknown> | undefined {
  if (!existsSync(percorso)) return {}
  try {
    const val = JSON.parse(readFileSync(percorso, 'utf8')) as unknown
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return undefined
    return val as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Qui dentro ci sono `~/.claude.json` e i `settings.json`: i file piu' delicati
 * che questo programma tocchi. Una scrittura interrotta a meta' — chiusura
 * brutale, disco pieno — li lasciava **troncati al posto di quelli di prima**,
 * cioe' faceva sparire in un colpo i server MCP, i permessi e la cronologia dei
 * progetti di Claude Code. Su temporaneo e poi rinomina: o c'e' tutto il
 * contenuto nuovo, o resta tutto quello vecchio.
 */
function scrivi(percorso: string, dati: unknown): boolean {
  return scriviAtomico(percorso, `${JSON.stringify(dati, null, 2)}\n`, 'negozio')
}

/**
 * Attiva o disattiva una skill senza toccarne i file: `skillOverrides[nome]`
 * diventa `'off'` per spegnerla, e si toglie del tutto per riaccenderla (così il
 * file non si riempie di voci morte).
 */
export function commutaSkill(radiceClaude: string, nome: string, abilita: boolean): EsitoAzione {
  const percorso = join(radiceClaude, 'settings.json')
  const s = leggiOggetto(percorso)
  if (s === undefined) return { ok: false, messaggio: 'settings.json non leggibile' }
  const over = (s.skillOverrides !== null && typeof s.skillOverrides === 'object' && !Array.isArray(s.skillOverrides)
    ? { ...(s.skillOverrides as Record<string, unknown>) }
    : {}) as Record<string, unknown>
  if (abilita) delete over[nome]
  else over[nome] = 'off'
  if (Object.keys(over).length === 0) delete s.skillOverrides
  else s.skillOverrides = over
  // **Si guarda se ha scritto davvero.** `scriviAtomico` non solleva mai — e'
  // il suo contratto, perche' chi lo chiama e' quasi sempre dentro un canale a
  // senso unico — quindi il `try`/`catch` che stava qui non poteva scattare, e
  // un salvataggio fallito tornava indietro come `ok: true`: il pannello
  // diceva fatto, e non era cambiato niente.
  return scrivi(percorso, s)
    ? { ok: true, fatto: cosaCambia(abilita ? 'attiva-skill' : 'disattiva-skill') }
    : { ok: false, messaggio: 'settings.json non salvato: guarda il registro' }
}

/**
 * Una skill nuova, scritta da zero: `<cartella skills>/<nome>/SKILL.md` con
 * l'intestazione che Claude Code legge (nome e descrizione) e le istruzioni
 * sotto. Il nome segue la regola della documentazione: minuscole, numeri e
 * trattini, fino a 64. Se c'è già una skill con quel nome non si scrive sopra.
 */
export function creaSkill(cartellaSkills: string, d: { nome: string; descrizione: string; istruzioni: string }): EsitoAzione {
  const nome = d.nome.trim()
  if (!NOME_SKILL.test(nome)) return { ok: false, messaggio: 'Il nome di una skill è fatto di lettere minuscole, numeri e trattini (fino a 64), per esempio «revisione-testi».' }
  const descrizione = d.descrizione.replace(/\s+/g, ' ').trim()
  if (descrizione === '') return { ok: false, messaggio: 'Serve la descrizione: è da lì che Claude capisce quando usarla.' }
  if (d.istruzioni.trim() === '') return { ok: false, messaggio: 'Servono le istruzioni: cosa deve fare Claude quando usa la skill.' }
  const dove = join(cartellaSkills, nome)
  if (existsSync(dove)) return { ok: false, messaggio: `C’è già una skill «${nome}» in quella cartella: scegli un altro nome, o togli prima quella.` }
  try {
    mkdirSync(dove, { recursive: true })
  } catch (e) {
    return { ok: false, messaggio: `Non riesco a creare la cartella: ${String(e)}` }
  }
  const testo = `---\nname: ${nome}\ndescription: ${JSON.stringify(descrizione)}\n---\n\n${d.istruzioni.trim()}\n`
  return scriviAtomico(join(dove, 'SKILL.md'), testo, 'negozio')
    ? { ok: true, fatto: cosaCambia('aggiungi-skill') }
    : { ok: false, messaggio: 'SKILL.md non salvato: guarda il registro.' }
}

const NOME_SKILL = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Una skill già fatta, da una cartella che contiene il suo SKILL.md: si copia
 * tutta (gli script e i file che usa stanno lì accanto).
 */
export function importaSkill(cartellaSkills: string, sorgente: string): EsitoAzione {
  if (!existsSync(join(sorgente, 'SKILL.md'))) return { ok: false, messaggio: 'In quella cartella non c’è un SKILL.md: una skill è una cartella con dentro il suo SKILL.md.' }
  const nome = basename(sorgente.replace(/[\\/]+$/, ''))
  const dove = join(cartellaSkills, nome)
  if (existsSync(dove)) return { ok: false, messaggio: `C’è già una skill «${nome}» lì: togli prima quella, o rinomina la cartella.` }
  try {
    mkdirSync(cartellaSkills, { recursive: true })
    cpSync(sorgente, dove, { recursive: true, errorOnExist: true })
  } catch (e) {
    return { ok: false, messaggio: `Copia non riuscita: ${String(e)}` }
  }
  return { ok: true, fatto: cosaCambia('aggiungi-skill') }
}

/**
 * Si può togliere solo una skill che sta **direttamente** dentro una delle
 * cartelle delle skill (personali o del progetto) e ha il suo SKILL.md: il
 * percorso arriva dall'interfaccia, e non deve poter indicare altro.
 */
export function skillTogliibile(percorso: string, cartelleSkills: string[]): boolean {
  const norm = (x: string): string => resolve(x).replace(/[\\/]+$/, '').toLowerCase()
  const genitore = norm(dirname(resolve(percorso)))
  return cartelleSkills.some((c) => norm(c) === genitore) && existsSync(join(percorso, 'SKILL.md'))
}
