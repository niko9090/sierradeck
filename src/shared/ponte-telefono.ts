/**
 * Il ponte del telefono (0.48.0): dal telefono le chat di **tutti** i PC dal
 * vivo, passando dal PC a cui il telefono è accoppiato.
 *
 * Il telefono è accoppiato a un PC solo. Quel PC sa già raggiungere gli altri
 * (rete di casa, Tailscale, WebRTC, Drive — 0.40.0) con la chiave di casa
 * firmata (0.47.0): il telefono gli chiede `POST /api/ponte {pc, percorso,
 * corpo}` e lui la gira a quel PC. Il telefono non ha mai la chiave di casa.
 *
 * **Gli stessi permessi del PC**: passano solo le rotte che il PC stesso usa
 * dal suo riquadro remoto (vedere lo stato e la storia, scrivere, premere
 * un'opzione, riprendere o aprire una chat). Rinominare, chiudere, gli
 * autopiloti, il Drive, gli aggiornamenti di quel PC: no, come dal PC.
 * Un altro PC non può usare il ponte (niente catene).
 */

export const ROTTE_PONTE: readonly string[] = [
  '/api/stato', '/api/storia', '/api/scrivi', '/api/scegli', '/api/sessioni/riprendi', '/api/apri'
]

export function rottaPonte(percorso: string): boolean {
  return ROTTE_PONTE.includes(percorso)
}

export type RichiestaPonte = { pc: string; percorso: string; corpo?: Record<string, unknown> }

/** La richiesta del telefono, controllata: o la richiesta, o il perché no (per esteso). */
export function leggiRichiestaPonte(x: unknown): { ok: true; r: RichiestaPonte } | { ok: false; stato: number; errore: string } {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : {}
  const pc = typeof o.pc === 'string' ? o.pc.trim() : ''
  const percorso = typeof o.percorso === 'string' ? o.percorso.trim() : ''
  if (pc === '' || percorso === '') return { ok: false, stato: 400, errore: 'Manca il PC o la rotta da chiedere.' }
  if (!rottaPonte(percorso)) {
    return { ok: false, stato: 403, errore: `Attraverso il ponte si può solo quello che il PC fa dal suo riquadro remoto: vedere le chat e la loro storia, scrivere, premere un’opzione, riprendere o aprire una chat. «${percorso}» no.` }
  }
  const corpo = o.corpo
  if (corpo !== undefined && corpo !== null && (typeof corpo !== 'object' || Array.isArray(corpo))) return { ok: false, stato: 400, errore: 'Il corpo della richiesta non è un oggetto.' }
  return { ok: true, r: { pc, percorso, ...(corpo !== undefined && corpo !== null ? { corpo: corpo as Record<string, unknown> } : {}) } }
}
