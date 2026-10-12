/**
 * Il ponte del telefono (0.48.0): dal telefono le chat di **tutti** i PC dal
 * vivo, passando dal PC a cui il telefono è accoppiato.
 *
 * Il telefono è accoppiato a un PC solo. Quel PC sa già raggiungere gli altri
 * (rete di casa, Tailscale, WebRTC, Drive — 0.40.0) con la chiave di casa
 * firmata (0.47.0): il telefono gli chiede `POST /api/ponte {pc, percorso,
 * corpo}` e lui la gira a quel PC. Il telefono non ha mai la chiave di casa.
 *
 * **Gli stessi permessi del PC**: passano le rotte che il PC stesso usa dal
 * suo riquadro remoto (vedere lo stato e la storia, scrivere, premere
 * un'opzione, riprendere o aprire una chat; dalla 0.50.0 mandarle un file) e,
 * dalla 0.55.0, quelle per gestire chat, workspace e autopiloti di quel PC.
 * Il Drive, gli aggiornamenti, l'account e il negozio di quel PC: no.
 * Un altro PC non può usare il ponte (niente catene).
 */

export const ROTTE_PONTE: readonly string[] = [
  '/api/stato', '/api/storia', '/api/scrivi', '/api/scegli', '/api/sessioni/riprendi', '/api/apri',
  // Le chat in sottofondo (0.58.4): scrivere dal telefono a una chat chiusa su quel PC.
  '/api/sottofondo/avvia', '/api/sottofondo/stato',
  // Rispondere alle domande di un autopilota di quel PC (0.59.0).
  '/api/rispondi',
  // Il PIN delle chat di quel PC (0.49.0): lo verifica lui.
  '/api/pin/sblocca',
  // I file dal telefono (0.50.0): viaggiano a pezzi fino a quel PC, e si salvano nel progetto della chat là.
  '/api/allegati/inizia', '/api/allegati/pezzo', '/api/allegati/stato', '/api/allegati/fine', '/api/allegati/annulla',
  // La sezione File (0.54.0): sfogliare i progetti di quel PC, in sola lettura, e ritirare i file che quel PC manda al telefono.
  '/api/file/progetti', '/api/file/elenco', '/api/file/leggi',
  '/api/consegne', '/api/consegne/pezzo', '/api/consegne/ricevuta',
  // Gestire quel PC dal telefono (0.55.0), come dal PC che hai davanti: i
  // workspace, chiudere/togliere/rinominare una chat, la cartella per una chat
  // nuova, le conversazioni da riprendere e gli autopiloti. Passa solo verso
  // un PC della stessa cassaforte (la chiave di casa, regola della 0.47).
  '/api/workspace', '/api/workspace/crea', '/api/workspace/elimina', '/api/workspace/rinomina',
  '/api/chat/chiudi', '/api/chat/dormi', '/api/chat/sveglia', '/api/chat/sposta', '/api/chat/nome',
  // Chiudere una chat di prova (0.63.0): se lo è, lo decide il PC dove vive.
  '/api/prova/chiudi', '/api/prova/autopilota',
  '/api/autopilota/archivia', '/api/pin/proteggi', '/api/chat/ospite', '/api/modelli',
  '/api/sfoglia', '/api/cartelle', '/api/sessioni',
  '/api/autopilota', '/api/autopilota/crea', '/api/autopilota/ferma', '/api/autopilota/riprendi', '/api/autopilota/vai',
  '/api/autopilota/elimina', '/api/autopilota/riavvio', '/api/autopilota/dialogo', '/api/autopilota/file', '/api/autopilota/diff',
  '/api/autopilota/istruzioni', '/api/autopilota/correggi', '/api/quaderno', '/api/quaderno/scheda',
  // Il pannello delle chat e dei progetti del Drive di quel PC (0.58.0).
  '/api/drive/pannello', '/api/drive/azione'
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
    return { ok: false, stato: 403, errore: `Attraverso il ponte passano le chat (vederle, scriverle, aprirle, chiuderle, rinominarle), i workspace, gli autopiloti, i file dei progetti e quelli mandati al telefono. Il Drive, gli aggiornamenti, l’account e il negozio di un altro PC si gestiscono da quel PC. «${percorso}» no.` }
  }
  const corpo = o.corpo
  if (corpo !== undefined && corpo !== null && (typeof corpo !== 'object' || Array.isArray(corpo))) return { ok: false, stato: 400, errore: 'Il corpo della richiesta non è un oggetto.' }
  return { ok: true, r: { pc, percorso, ...(corpo !== undefined && corpo !== null ? { corpo: corpo as Record<string, unknown> } : {}) } }
}

/**
 * Cosa scrivere nel registro di questo PC per una richiesta del telefono
 * attraverso il ponte (0.60.3). `undefined` = una lettura, che non si scrive.
 *
 * Il collaudo fra i due PC (11/10) ha trovato che dal telefono si scriveva a
 * una chat dell'altro PC, la si apriva, se ne creava un workspace, e nel
 * registro del PC che faceva da ponte non restava niente: solo dal PC, con i
 * suoi passi `[apertura]`, si poteva dimostrare che cosa era successo.
 */
export function azioneDelPonte(percorso: string, corpo?: Record<string, unknown>): string | undefined {
  const s = (k: string): string => (typeof corpo?.[k] === 'string' ? corpo[k] as string : '')
  const nella = s('chat') !== '' ? ` nella chat ${s('chat').slice(0, 12)}` : ''
  const la = `la chat${s('chat') !== '' ? ` ${s('chat').slice(0, 12)}` : ''}`
  switch (percorso) {
    case '/api/scrivi': return `scrivo${nella} (${s('testo').length} caratteri${s('idMessaggio') !== '' ? `, ${s('idMessaggio')}` : ''})`
    case '/api/scegli': return `scelgo${nella}`
    case '/api/apri': return `apro una chat nuova in ${s('cartella')}${s('workspace') !== '' ? ` nel workspace «${s('workspace')}»` : ''}`
    case '/api/sessioni/riprendi': return `riapro la chat ${s('sessione').slice(0, 8)} in ${s('cartella')}`
    case '/api/chat/chiudi': return `chiudo ${la}`
    case '/api/prova/autopilota': return `${s('azione') === 'ferma' ? 'fermo' : s('azione') === 'riprendi' ? 'faccio riprendere' : 'archivio'} l’autopilota di prova ${s('autopilota')}`
    case '/api/prova/chiudi': return `chiudo la chat di prova${s('chat') !== '' ? ` ${s('chat').slice(0, 12)}` : ''}`
    case '/api/chat/dormi': return `metto a dormire ${la}`
    case '/api/chat/sveglia': return `sveglio ${la}`
    case '/api/chat/sposta': return `sposto ${la} nel workspace «${s('workspace')}»`
    case '/api/chat/nome': return `rinomino ${la}`
    case '/api/chat/ospite': return `cambio la casa della ${la.slice(3)}`
    case '/api/workspace': return corpo === undefined ? undefined : `passo al workspace «${s('nome')}» (sullo schermo di quel PC)`
    case '/api/workspace/crea': return `creo il workspace «${s('nome')}»`
    case '/api/workspace/elimina': return `tolgo il workspace «${s('nome')}»`
    case '/api/workspace/rinomina': return `rinomino il workspace «${s('nome')}»`
    case '/api/autopilota/crea': return `creo un autopilota in ${s('cartella') !== '' ? s('cartella') : s('cwd')}`
    case '/api/autopilota/archivia': return `${corpo?.archivia === false ? 'tolgo dall’archivio' : 'archivio'} l’autopilota ${s('autopilota')}`
    case '/api/autopilota/elimina': return `elimino l’autopilota ${s('autopilota')}`
    case '/api/drive/azione': return `azione «${s('azione')}» del pannello sul progetto ${s('progetto') !== '' ? s('progetto') : s('id')}`
    default: return undefined
  }
}
