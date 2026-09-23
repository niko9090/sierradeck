/**
 * La diagnosi di una chat che non si apre.
 *
 * Nicholas (23/09): «dobbiamo mettere una procedura per risolvere il problema
 * di chat che non si aprono». Fino a qui il riquadro mostrava una riga rossa o
 * gialla («[sessione terminata: 1]», «[errore: …]») o restava nero: toccava
 * all'utente indovinare. Qui, da cio' che il terminale ha detto, si decide
 * **quale caso e'** e si propone l'azione giusta. Puro: si prova senza xterm.
 */

export type SegnaleGuasto =
  /** `pty:spawn` rifiutato dal Core (cartella, PTY host, richiesta). */
  | { tipo: 'spawn-fallito'; messaggio: string }
  /** Un evento `error` dal PTY host (claude.exe non trovato, host morto). */
  | { tipo: 'errore'; messaggio: string }
  /** claude.exe e' uscito: con che codice, e dopo quanto dall'avvio. */
  | { tipo: 'uscita'; codice: number; trascorsoMs: number }
  /** Niente prompt entro il tempo previsto. */
  | { tipo: 'lenta'; trascorsoMs: number; previstoMs: number }

export type CasoGuasto =
  | 'cartella-sparita'
  | 'claude-assente'
  | 'sessione-in-uso'
  | 'trascrizione-assente'
  | 'accesso'
  | 'host'
  | 'morta'
  | 'lenta'
  | 'sconosciuto'

export type AzioneGuasto = 'riprova' | 'scegli-cartella' | 'nuova-chat' | 'aspetta' | 'accedi' | 'installa' | 'avanzata'

export type Diagnosi = {
  caso: CasoGuasto
  titolo: string
  spiegazione: string
  /** Il fatto nudo: codice, messaggio, righe. Va nel registro e nel dossier. */
  dettaglio: string
  azioni: AzioneGuasto[]
}

/** Le sequenze del terminale: via, per leggere le parole. */
export function senzaSequenze(testo: string): string {
  // eslint-disable-next-line no-control-regex
  return testo.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\r/g, '')
}

function ultimeParole(righe: string[]): string {
  return senzaSequenze(righe.join('\n')).split('\n').map((r) => r.trimEnd()).filter((r) => r.trim() !== '').slice(-12).join('\n')
}

const secondi = (ms: number): string => `${Math.round(ms / 1000)} s`

export function diagnostica(s: SegnaleGuasto, ultimeRighe: string[]): Diagnosi {
  const parole = ultimeParole(ultimeRighe)
  const testo = (s.tipo === 'spawn-fallito' || s.tipo === 'errore') ? `${s.messaggio}\n${parole}` : parole
  const t = testo.toLowerCase()

  if (s.tipo === 'lenta') {
    return {
      caso: 'lenta',
      titolo: 'La chat non è ancora arrivata al prompt',
      spiegazione: `Sono passati ${secondi(s.trascorsoMs)}, il previsto era ${secondi(s.previstoMs)}. Con una conversazione molto lunga claude.exe sta ancora rileggendo la trascrizione; se invece il riquadro è fermo su un errore, lo vedi sotto. Puoi aspettare ancora, oppure riprovare: il rilancio riprende la stessa conversazione, non ne perde niente.`,
      dettaglio: `nessun prompt dopo ${secondi(s.trascorsoMs)} (previsto ${secondi(s.previstoMs)})${parole !== '' ? `\n${parole}` : ''}`,
      azioni: ['aspetta', 'riprova', 'avanzata']
    }
  }

  if (/cwd non accessibile|deve essere una cartella|enoent.*(cwd|directory)|directory non trovata|no such file or directory/.test(t)) {
    return {
      caso: 'cartella-sparita',
      titolo: 'La cartella di questa chat qui non c’è più',
      spiegazione: 'Claude Code parte dentro la cartella della chat, e questa non esiste più su questo PC: spostata, rinominata, o su un disco che adesso non è collegato. La conversazione è al sicuro. Scegli dove sta ora la cartella e la chat riparte da lì; se la cartella è davvero sparita, apri una chat nuova altrove.',
      dettaglio: testo,
      azioni: ['scegli-cartella', 'avanzata']
    }
  }
  if (/pty host/.test(t)) {
    return {
      caso: 'host',
      titolo: 'Il processo che tiene i terminali è caduto',
      spiegazione: 'SierraDeck fa girare le chat dentro un processo di servizio (il PTY host), che si è fermato o non è partito. Si riavvia da solo: riprova fra qualche secondo. Se succede a ogni chat, il registro dice perché (Impostazioni → Registro).',
      dettaglio: testo,
      azioni: ['riprova', 'avanzata']
    }
  }
  if (/claude code non è ancora installato|file not found|non trovato|not recognized|non è riconosciuto|enoent/.test(t) && /claude/.test(t)) {
    return {
      caso: 'claude-assente',
      titolo: 'claude.exe non si trova',
      spiegazione: 'Il comando di Claude Code non parte: non è installato, o è stato spostato (per esempio da un aggiornamento di npm o di WinGet). SierraDeck può installarlo o ritrovarlo da solo.',
      dettaglio: testo,
      azioni: ['installa', 'riprova', 'avanzata']
    }
  }
  if (/already in use|session id .* in use|già in uso/.test(t)) {
    return {
      caso: 'sessione-in-uso',
      titolo: 'Questa conversazione è già aperta da un altro claude.exe',
      spiegazione: 'Claude Code non apre due volte la stessa sessione. Di solito è un claude.exe rimasto acceso da una chiusura precedente, o la stessa chat aperta in un’altra finestra o su un altro PC. Chiudi l’altra, poi riprova.',
      dettaglio: testo,
      azioni: ['riprova', 'nuova-chat', 'avanzata']
    }
  }
  if (/no conversation found|conversation .* not found|nessuna conversazione/.test(t)) {
    return {
      caso: 'trascrizione-assente',
      titolo: 'Claude Code non trova più questa conversazione',
      spiegazione: 'La trascrizione (il file .jsonl in ~/.claude/projects) non c’è più sotto questa cartella: Claude Code la cancella da sola dopo 30 giorni di inattività, oppure la chat è nata su un altro PC e qui non è mai scesa dal Drive. Puoi aprire una chat nuova nella stessa cartella, o portarla qui dal Drive (Account → Drive → «Porta qui»).',
      dettaglio: testo,
      azioni: ['nuova-chat', 'avanzata']
    }
  }
  if (/not logged in|please run \/login|\/login|invalid api key|authentication|unauthorized|token .*(expired|scaduto)|oauth/.test(t)) {
    return {
      caso: 'accesso',
      titolo: 'Claude Code non è più collegato al tuo account',
      spiegazione: 'L’accesso è scaduto o è stato revocato: claude.exe parte e si ferma chiedendo il login. Rifai l’accesso (si apre il browser), poi riprova la chat.',
      dettaglio: testo,
      azioni: ['accedi', 'riprova', 'avanzata']
    }
  }

  if (s.tipo === 'uscita') {
    return {
      caso: 'morta',
      titolo: `claude.exe si è chiuso subito (codice ${s.codice})`,
      spiegazione: `È uscito ${secondi(s.trascorsoMs)} dopo l’avvio, prima di arrivare al prompt. Le ultime righe qui sotto dicono di solito il perché (un’impostazione rotta, un plugin che non parte, una versione vecchia). «Riprova» rilancia la stessa conversazione; «Risoluzione avanzata» apre un assistente che legge queste righe e il registro e ti dice cosa fare.`,
      dettaglio: `uscito con ${s.codice} dopo ${secondi(s.trascorsoMs)}${parole !== '' ? `\n${parole}` : ''}`,
      azioni: ['riprova', 'nuova-chat', 'avanzata']
    }
  }

  return {
    caso: 'sconosciuto',
    titolo: 'La chat non è partita',
    spiegazione: 'Il terminale ha riportato un errore che non riconosco: lo vedi qui sotto così com’è. «Riprova» rilancia la stessa conversazione; «Risoluzione avanzata» apre un assistente con tutti i dettagli.',
    dettaglio: testo,
    azioni: ['riprova', 'avanzata']
  }
}

/** Quanto aspettare il prompt prima di dire che la chat e' lenta: il doppio del previsto, mai meno di 20 s. */
export function tettoAttesaMs(previstoMs: number): number {
  return Math.max(20_000, previstoMs * 2)
}

/** Un'uscita entro questo tempo dall'avvio e' «morta subito», non un `/exit` dell'utente. */
export const USCITA_PRECOCE_MS = 90_000
