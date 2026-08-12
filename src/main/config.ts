// Quale eseguibile lanciare lo decide il Core, non il renderer. Il renderer e'
// il processo meno affidabile dei tre — vi confluiscono output PTY grezzo e
// titoli di sessione letti da disco — e con `sandbox: false` qualunque
// contenuto che riesca a eseguirvi otterrebbe esecuzione di comandi arbitraria
// se fosse lui a scegliere il binario. Il modulo resta puro e testabile.
//
// L'estensione `.exe` nel valore di ripiego e' obbligatoria. node-pty su
// Windows non usa la risoluzione di sistema: implementa la propria ricerca
// sul PATH (src/win/path_util.cc, get_shell_path) combinando ogni cartella
// con il nome file letterale e non consulta mai PATHEXT. Con 'claude'
// cercherebbe un file senza estensione, non troverebbe claude.exe, e
// fallirebbe con "File not found:" seguito da un percorso vuoto — un
// fallimento insidioso perche' la finestra si apre e il terminale si monta,
// ma il riquadro resta vuoto. Non usare 'claude'.
export function resolveClaudeCommand(env: Record<string, string | undefined>): string {
  return env.GESTORE_CLAUDE_PATH ?? 'claude.exe'
}

// `--dangerously-skip-permissions` e' deliberato e vale per ogni chat aperta dal
// gestore. Una richiesta di permesso e' una domanda che Claude Code pone nel
// suo riquadro e attende: in un mosaico di sei terminali significa sei
// riquadri che possono fermarsi ciascuno per conto proprio, mentre chi guarda
// vede solo quello in primo piano. La scelta e' dell'utente ed e' consapevole —
// le chat girano sulle sue cartelle, sulla sua macchina. Non renderla
// condizionale senza una leva visibile in interfaccia: un flag di questo peso
// che dipende da una variabile d'ambiente e' peggio di uno esplicito.
/**
 * `riprendi` distingue la prima apertura di una chat dal suo ripristino dopo un
 * riavvio, e i due casi vogliono opzioni opposte e incompatibili: `--session-id`
 * rifiuta un id gia' scritto su disco («Session ID ... is already in use»),
 * `--resume` rifiuta un id che non c'e'. Sbagliare ramo lascia un riquadro
 * aperto su un terminale morto — che e' come si presentava il ripristino prima
 * che questo parametro esistesse.
 *
 * A deciderlo e' l'esistenza della trascrizione, non il fatto che il layout sia
 * stato ripristinato: un riquadro aperto e mai usato non ha trascrizione, e
 * andrebbe in `--resume` a vuoto.
 */
export function buildClaudeArgs(
  sessionUuid: string,
  title?: string,
  riprendi = false,
  /**
   * Il modello scelto per questa chat. Assente vuol dire «quello che usa
   * Claude Code»: imporne uno di nostra iniziativa sarebbe decidere al posto
   * dell'utente una cosa che lui ha già configurato altrove.
   */
  model?: string
): string[] {
  const args = riprendi
    ? ['--resume', sessionUuid, '--dangerously-skip-permissions']
    : ['--session-id', sessionUuid, '--dangerously-skip-permissions']
  if (model !== undefined && model.trim() !== '') args.push('--model', model.trim())
  if (title !== undefined && title.trim() !== '') args.push('-n', title.trim())
  return args
}
