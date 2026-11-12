/**
 * L'ambiente dei processi figli (chat, `claude -p`), senza quello che
 * appartiene solo a chi li lancia.
 *
 * 12/11: spostato qui da `pty-host/pty-manager.ts` (che resta a esportarlo)
 * perché anche SierraDeck Aiutante ne ha bisogno, e importarlo da là voleva
 * dire trascinarsi node-pty, che l'Aiutante non installa.
 */

/**
 * Variabili che il gestore inietta nei propri processi e che non devono
 * proseguire dentro i terminali dell'utente.
 *
 * `ELECTRON_RUN_AS_NODE` e' quella che fa danno: il Core lancia il PTY host
 * con quella variabile a `1`, il PtyManager copia l'ambiente dell'host in ogni
 * pty, e da li' la eredita `claude.exe` e chiunque l'utente avvii da un
 * riquadro. Qualunque applicazione Electron lanciata da li' — `code .`, e in
 * generale i CLI costruiti su Electron — parte come Node puro e si comporta in
 * modo inspiegabile. E' il classico sintomo che si insegue per ore perche' non
 * si manifesta mai fuori dal gestore.
 *
 * `ELECTRON_RENDERER_URL` la mette electron-vite in sviluppo: dentro un
 * terminale non significa niente.
 *
 * L'elenco e' esplicito e non una regola su `ELECTRON_*` per una ragione
 * precisa: un riquadro deve riprodurre l'ambiente della shell dell'utente. Le
 * altre variabili `ELECTRON_*` eventualmente presenti le ha esportate lui, e
 * toglierle sarebbe la stessa classe di difetto vista al contrario — il
 * gestore che altera in silenzio l'ambiente dei terminali che ospita.
 */
export const NON_EREDITATE = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_RENDERER_URL',
  // I marcatori della sessione Claude Code che ha lanciato il gestore.
  // Osservato sul campo: ereditando CLAUDE_CODE_CHILD_SESSION, la chat scrive
  // «Transcript saving is off» e **non salva la trascrizione**. Senza .jsonl
  // quella conversazione non entra nell'indice e non si puo' piu' riprendere:
  // il gestore perderebbe in silenzio la propria materia prima, e se ne
  // accorgerebbe solo giorni dopo cercando una chat che non c'e'.
  //
  // Succede ogni volta che il gestore parte da dentro una sessione di Claude
  // Code — un terminale integrato, il servizio autopilota, un test come questo.
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_PID',
  // Gli altri marcatori della sessione che ha lanciato il gestore. `CLAUDECODE`
  // e `CLAUDE_CODE_ENTRYPOINT` dicono a chiunque parta di qui «sei dentro Claude
  // Code», e chi li legge cambia comportamento — a partire da Claude Code
  // stesso, che smette di colorare l'interfaccia perche' si crede incanalato in
  // un altro programma. `CLAUDE_EFFORT` deciderebbe lo sforzo delle chat di
  // rimbalzo, senza che nessuno l'abbia chiesto.
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_EFFORT',
  // Il canale privato della sessione che ci ha lanciati, con il suo gettone.
  // Non e' una questione di comportamento ma di segreti: passarlo a ogni
  // terminale dell'utente lo consegna a qualunque cosa vi giri dentro.
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  // Il divieto di colorare, ereditato da chi ci ha avviati.
  //
  // Un terminale che *non* sa colorare lo dichiara, e i programmi seri
  // ubbidiscono. Ma il terminale che offriamo noi e' xterm.js: sa i 256 colori e
  // anche il colore pieno. Ereditare il divieto di un altro guscio significa
  // mentire sulle proprie capacita', e il sintomo e' identico a un guasto —
  // chat improvvisamente tutte grigie, senza un errore e senza un motivo
  // visibile. Succede ogni volta che il gestore parte da dentro una sessione di
  // Claude Code, che imposta NO_COLOR per i comandi che lancia.
  'NO_COLOR'
]

/**
 * L'ambiente per il processo `claude`, senza le variabili che il PTY host
 * toglie già alle chat (`NON_EREDITATE`): `ELECTRON_RUN_AS_NODE` ereditata dal
 * servizio farebbe partire `claude.exe` come Node puro.
 */
export function ambientePulito(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [nome, valore] of Object.entries(base)) {
    if (valore === undefined || NON_EREDITATE.includes(nome)) continue
    env[nome] = valore
  }
  return env
}
