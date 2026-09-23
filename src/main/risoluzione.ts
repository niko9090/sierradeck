/**
 * La risoluzione avanzata: il dossier di una chat che non si apre, e il
 * comando con cui un agente lo legge.
 *
 * Nicholas (23/09): «una risoluzione avanzata dove un agente valuta bene il
 * caso, in una mini finestra temporanea». Il riquadro ha gia' fatto la
 * diagnosi; qui si mette insieme **tutto cio' che l'utente non vede** —
 * dov'e' claude.exe, se l'accesso e' valido, se la trascrizione esiste, le
 * ultime righe del registro — in un file di testo, e si avvia un Claude Code
 * interattivo che lo legge e ragiona con l'utente. Puro dove si puo': il
 * dossier e il comando si provano senza avviare niente.
 */

export type RichiestaRisoluzione = {
  cwd: string
  sessionUuid: string
  titolo: string
  caso: string
  titoloDiagnosi: string
  dettaglio: string
  ultimeRighe: string[]
}

export type ContestoRisoluzione = {
  versioneSierraDeck: string
  claude: string | undefined
  accesso: { autenticato: boolean; motivo?: string; email?: string }
  cartellaEsiste: boolean
  trascrizione: { percorso: string; esiste: boolean; byte?: number }
  ultimeRigheRegistro: string[]
  sistema: string
}

const TESTO_MAX = 12_000

function taglia(t: string, max: number): string {
  return t.length <= max ? t : `${t.slice(0, max)}\n… (tagliato, ${t.length - max} caratteri in più)`
}

/** Il dossier, in Markdown, come lo legge l'agente. */
export function componiDossier(r: RichiestaRisoluzione, c: ContestoRisoluzione, adesso = new Date().toISOString()): string {
  const righe = [
    `# Dossier: una chat di SierraDeck non si apre`,
    ``,
    `Scritto il ${adesso} da SierraDeck ${c.versioneSierraDeck} (${c.sistema}).`,
    ``,
    `## La diagnosi del riquadro`,
    `- Caso: **${r.caso}** — ${r.titoloDiagnosi}`,
    `- Dettaglio: ${taglia(r.dettaglio, 2000)}`,
    ``,
    `## La chat`,
    `- Titolo: ${r.titolo}`,
    `- Sessione (session id di Claude Code): ${r.sessionUuid}`,
    `- Cartella di lavoro: ${r.cwd} — ${c.cartellaEsiste ? 'esiste' : '**NON esiste su questo PC**'}`,
    `- Trascrizione: ${c.trascrizione.percorso} — ${c.trascrizione.esiste ? `esiste${c.trascrizione.byte !== undefined ? `, ${c.trascrizione.byte} byte` : ''}` : '**NON esiste**'}`,
    ``,
    `## Claude Code su questo PC`,
    `- Comando: ${c.claude ?? '**non trovato** (né GESTORE_CLAUDE_PATH, né ~/.local/bin, né PATH, né WinGet, né npm)'}`,
    `- Accesso: ${c.accesso.autenticato ? `valido${c.accesso.email !== undefined ? ` (${c.accesso.email})` : ''}` : `**non valido**${c.accesso.motivo !== undefined ? ` — ${c.accesso.motivo}` : ''}`}`,
    `- Come SierraDeck avvia una chat: \`claude --resume <sessione> --dangerously-skip-permissions --append-system-prompt … [--settings …] [--model …] [-n titolo]\` nella cartella di lavoro; \`--session-id\` al posto di \`--resume\` quando la trascrizione non esiste.`,
    ``,
    `## Le ultime righe del terminale della chat`,
    '```',
    taglia(r.ultimeRighe.join('\n'), TESTO_MAX),
    '```',
    ``,
    `## Le ultime righe del registro di SierraDeck`,
    '```',
    taglia(c.ultimeRigheRegistro.join('\n'), TESTO_MAX),
    '```',
    ``
  ]
  return righe.join('\n')
}

/** Le istruzioni all'agente: cosa e', cosa puo' fare, cosa non deve fare. */
export const ISTRUZIONI_AGENTE = [
  'Sei l’assistente di risoluzione di SierraDeck, il programma che apre le chat di Claude Code in riquadri su Windows.',
  'Una chat non si apre. Hai un dossier in un file: leggilo per primo, per intero.',
  'Rispondi in italiano, breve e concreto: 1) cosa è successo, 2) la causa più probabile, 3) cosa fare adesso, un passo alla volta.',
  'Puoi eseguire comandi di verifica (claude --version, claude auth status, dir, type, Get-ChildItem) e leggere file di configurazione (~/.claude/settings.json, settings.local.json, .claude/settings.json della cartella).',
  'Non modificare né cancellare file del progetto o trascrizioni senza chiederlo prima e senza spiegare cosa cambia. Una modifica a un file di impostazioni va proposta, mostrata, e fatta solo dopo un sì.',
  'Se il caso è «trascrizione assente» non inventare una conversazione: spiega che la chat si può riaprire nuova nella stessa cartella o portare qui dal Drive.',
  'Quando hai finito di' + ' aiutare, dillo chiaramente: l’utente chiude questa finestra e preme «Riprova» nel riquadro della chat.'
].join(' ')

/** Il primo messaggio all'agente: dove sta il dossier. */
export function promptIniziale(fileDossier: string): string {
  return `Leggi il dossier in "${fileDossier}" e aiutami: una chat di SierraDeck non si apre. Prima la diagnosi in tre righe, poi la prima cosa da fare.`
}

/** Gli argomenti di claude.exe per la mini finestra: interattivo, con il prompt iniziale. */
export function argomentiAgente(fileDossier: string): string[] {
  return [promptIniziale(fileDossier), '--dangerously-skip-permissions', '--append-system-prompt', ISTRUZIONI_AGENTE]
}

/** Le ultime `n` righe di un registro, da un testo intero. */
export function ultimeRighe(testo: string, n: number): string[] {
  const righe = testo.split(/\r?\n/).filter((r) => r !== '')
  return righe.slice(-n)
}
