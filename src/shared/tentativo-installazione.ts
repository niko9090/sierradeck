/**
 * Un'installazione che non è andata a buon fine, riconosciuta al riavvio (0.39.2).
 *
 * Il caso vero, sul portatile di Nicholas, il 02/10. Alle 09:32 UTC parte
 * «INSTALLA 0.39.0», la finestra di SierraDeck Update si fa viva e SierraDeck si
 * chiude. Alle 09:47 il programma riparte, ma è ancora la 0.38.2. Nessuno se ne
 * accorge: la striscia ripropone «Installa» come se fosse la prima volta. Alle
 * 06:32 la 0.38.2 si era installata bene, sullo stesso PC.
 *
 * Come funziona:
 * - un attimo prima di lanciare l'installer, il main scrive il **segno**
 *   `tentativo-installazione.json` nella cartella dei dati: quale versione,
 *   da quale, a che ora;
 * - all'avvio lo rilegge, e questa funzione decide com'è andata;
 * - riuscito: il segno si toglie;
 * - fallito: resta, e la striscia del PC e il telefono lo dicono finché la
 *   versione non cambia.
 *
 * Il perché si dice solo se lo dice il diario di SierraDeck Update, che annota
 * il codice di uscita dell'installer. Senza diario si dice il motivo
 * **probabile**, come probabile.
 */

export type Tentativo = {
  /** La versione che si voleva installare. */
  versione: string
  /** La versione che c'era quando si e' provato. */
  da: string
  /** Quando, ISO. */
  quando: string
}

export type EsitoTentativo =
  | { tipo: 'nessuno' }
  | { tipo: 'riuscito'; tentativo: Tentativo }
  | { tipo: 'fallito'; tentativo: Tentativo }

/** Legge il segno scritto prima dell'installazione; `undefined` se manca o non si capisce. */
export function leggiTentativo(grezzo: unknown): Tentativo | undefined {
  if (typeof grezzo !== 'object' || grezzo === null) return undefined
  const o = grezzo as Record<string, unknown>
  const s = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
  const t = { versione: s(o.versione), da: s(o.da), quando: s(o.quando) }
  return t.versione !== '' && t.da !== '' ? t : undefined
}

/**
 * Com'e' andato l'ultimo tentativo, guardando la versione che gira adesso.
 * - Nessun segno: niente da dire.
 * - Si e' ancora sulla versione di partenza: **fallito**.
 * - La versione e' cambiata (quella voluta, o un'altra installata a mano):
 *   riuscito, e il segno va tolto.
 */
export function esitoTentativo(tentativo: Tentativo | undefined, installata: string): EsitoTentativo {
  if (tentativo === undefined) return { tipo: 'nessuno' }
  if (installata === tentativo.da && installata !== tentativo.versione) return { tipo: 'fallito', tentativo }
  return { tipo: 'riuscito', tentativo }
}

/** Cosa dice il diario di SierraDeck Update dell'ultima installazione. */
export type Diagnosi =
  | { tipo: 'codice'; codice: number }
  | { tipo: 'non-partito'; messaggio: string; bloccatoDaWindows: boolean }
  | { tipo: 'tempo-scaduto' }
  | { tipo: 'interrotto' }
  | { tipo: 'prima-dell-installer' }
  | { tipo: 'uscito-bene' }

/**
 * Il diario di SierraDeck Update (`%TEMP%/sierradeck-update.log`), righe
 * «HH:mm:ss testo». Chi chiama passa solo un diario scritto **dopo** il
 * tentativo: uno piu' vecchio parla di un'altra installazione.
 */
export function diagnosiDiario(diario: string | undefined): Diagnosi | undefined {
  if (diario === undefined || diario.trim() === '') return undefined
  const codice = /installer fallito, codice (-?\d+)/.exec(diario)
  if (codice !== null) return { tipo: 'codice', codice: Number(codice[1]) }
  const nonPartito = /installer non partito: (.*)/.exec(diario)
  if (nonPartito !== null || diario.includes('installer non avviato')) {
    const messaggio = (nonPartito?.[1] ?? '').trim()
    // Solo se il messaggio di Windows parla davvero di un blocco: niente diagnosi inventate.
    const bloccatoDaWindows = /blocc|block|criteri|policy|application control|controllo (delle )?app|smart app/i.test(messaggio)
    return { tipo: 'non-partito', messaggio, bloccatoDaWindows }
  }
  if (diario.includes('installer terminato (codice 0)')) return { tipo: 'uscito-bene' }
  if (diario.includes('tempo scaduto')) return { tipo: 'tempo-scaduto' }
  if (diario.includes('lancio l\'installer')) return { tipo: 'interrotto' }
  return { tipo: 'prima-dell-installer' }
}

/** Quello che il PC e il telefono mostrano quando l'ultimo tentativo non e' riuscito. */
export type TentativoFallito = Tentativo & {
  /** «Ho provato a installare la X alle HH:MM ma sei ancora sulla Y.» */
  titolo: string
  /** Il perche': certo se lo dice il diario, altrimenti detto come probabile. */
  motivo: string
  /** Cosa si puo' fare, per esteso. */
  strade: string[]
  /** La pagina della release, per scaricare l'installer a mano. */
  pagina: string
}

function ora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const PROBABILE = 'Il motivo più probabile è una protezione di Windows (Smart App Control o l’antivirus) che ha fermato l’installer: l’installer di SierraDeck non è firmato, e Windows ferma più volentieri i programmi senza firma. Non lo so con certezza.'

/** Il perché, detto con la certezza che c'è davvero. Esportata per i test e per il registro. */
export function motivoDaDiagnosi(d: Diagnosi | undefined): string {
  if (d === undefined) return `SierraDeck Update non ha lasciato il suo diario, quindi non so cosa sia successo all’installer. ${PROBABILE}`
  switch (d.tipo) {
    case 'codice':
      return `L’installer è partito ma è uscito con il codice ${d.codice}, cioè non ha finito (SierraDeck Update l’ha annotato nel suo diario). ${PROBABILE}`
    case 'non-partito':
      return d.bloccatoDaWindows
        ? `Windows non ha lasciato partire l’installer: «${d.messaggio}». È il blocco di un programma senza firma.`
        : `L’installer non è nemmeno partito${d.messaggio !== '' ? `: «${d.messaggio}»` : ''}. ${PROBABILE}`
    case 'tempo-scaduto':
      return `L’installer è partito ma non ha mai finito, e SierraDeck Update ha smesso di aspettarlo. Può essere rimasto fermo su una richiesta di Windows. ${PROBABILE}`
    case 'interrotto':
      return `L’installer è partito, ma il diario di SierraDeck Update finisce lì: non dice né che è finito né che è fallito, come se fosse stato fermato da fuori. ${PROBABILE}`
    case 'prima-dell-installer':
      return `SierraDeck Update si è fermato prima di lanciare l’installer. ${PROBABILE}`
    case 'uscito-bene':
      return 'L’installer dice di aver finito bene, ma all’avvio la versione è ancora quella di prima: non so dire perché.'
  }
}

/** Il testo intero dell'avviso, uguale su PC, pagina e app. */
export function avvisoTentativoFallito(t: Tentativo, d: Diagnosi | undefined, pagina: string): TentativoFallito {
  const alle = ora(t.quando)
  return {
    ...t,
    titolo: `Ho provato a installare la ${t.versione}${alle !== '' ? ` alle ${alle}` : ''}, ma sei ancora sulla ${t.da}.`,
    motivo: motivoDaDiagnosi(d),
    strade: [
      `Scaricala a mano: dalla pagina della versione (${pagina}) scarica «SierraDeck-Setup-${t.versione}.exe» e aprilo. Se Windows lo ferma, «Ulteriori informazioni» → «Esegui comunque» quando c’è. Si installa sopra quella che hai, senza perdere chat e impostazioni.`,
      'Riprova da «Installa»: se il blocco è stato una volta sola, può andare.',
      'La soluzione per tutti i PC è la firma del codice: la decide Nicholas (vedi la scheda «firma del codice» nel quaderno).'
    ],
    pagina
  }
}

/** La pagina della release di una versione. */
export function paginaRelease(versione: string, base = 'https://github.com/niko9090/sierradeck/releases'): string {
  return `${base}/tag/v${versione}`
}
