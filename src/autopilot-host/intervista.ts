export type ScambioIntervista = { domanda: string; risposta: string }

export type EsitoIntervista =
  | { tipo: 'domanda'; testo: string }
  | {
      tipo: 'pronto'
      nome?: string
      obiettivo?: string
      criteri: { descrizione: string; comando?: string }[]
    }

/**
 * Quante domande al massimo, in tutta la preparazione.
 *
 * Erano sei. Sul campo si è visto cosa vuol dire: l'utente si è ritrovato a
 * rispondere più volte sullo stesso argomento e ha detto la cosa che conta —
 * «non voglio essere tempestato di domande, se no parlavo con la chat io».
 * Delegare significa proprio non essere interpellati: due domande sono il
 * massimo che si può chiedere a chi si è alzato dalla scrivania, e la seconda è
 * già un lusso.
 */
export const SCAMBI_MAX = 2

/**
 * Quanto tempo ha ogni giro di preparazione prima che lo si consideri perso.
 *
 * Venti minuti, non i cinque di un giudizio. La differenza non è di prudenza ma
 * di mestiere: un giudizio guarda un esito già misurato e c'è una chat ferma
 * che aspetta la risposta, mentre qui l'autopilota deve **leggersi un progetto
 * che non ha mai visto** per capire quando il lavoro sarà finito — e non c'è
 * nessuno in attesa, perché chi ha delegato si è alzato dalla scrivania.
 *
 * Sul campo si è visto cosa costa sbagliarlo: la preparazione veniva uccisa a
 * metà, tre volte di fila, e l'unica cosa che l'utente leggeva era «la
 * preparazione si è guastata». Non era guasta: non le era stato dato il tempo
 * di fare quello che le era stato chiesto.
 */
export const TEMPO_PREPARAZIONE_MS = 20 * 60_000

/** Parole che due domande qualsiasi hanno in comune: non dicono nulla. */
const PAROLE_VUOTE = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su',
  'per', 'tra', 'fra', 'e', 'o', 'che', ' che', 'chi', 'cui', 'non', 'ma', 'se', 'come',
  'quando', 'anche', 'del', 'della', 'dei', 'delle', 'dello', 'degli', 'al', 'alla', 'ai',
  'alle', 'dal', 'dalla', 'nel', 'nella', 'nei', 'nelle', 'sul', 'sulla', 'vuoi', 'devo',
  'posso', 'ho', 'hai', 'sia', 'sono', 'essere', 'fare', 'vuole', 'ti', 'mi', 'si',
  'questo', 'questa', 'quello', 'quella', 'piu', 'meno', 'gia', 'ancora', 'solo', 'tutto'
])

function parole(testo: string): Set<string> {
  const pulite = testo
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 && !PAROLE_VUOTE.has(p))
  return new Set(pulite)
}

/**
 * Dice se questa domanda è, in sostanza, una che è già stata fatta.
 *
 * Non serve capirle: basta vedere che parlano delle stesse cose. Sul campo
 * sono state tre domande sul contratto elettrico, formulate ogni volta in modo
 * diverso, a cui l'utente ha dovuto rispondere tre volte. Le parole di servizio
 * — «vuoi», «che», «il» — non contano, altrimenti due domande qualunque
 * risulterebbero uguali e non se ne farebbe più nessuna.
 */
export function giaChiesta(scambi: ScambioIntervista[], domanda: string): boolean {
  const nuove = parole(domanda)
  if (nuove.size === 0) return false
  for (const s of scambi) {
    const vecchie = parole(s.domanda)
    if (vecchie.size === 0) continue
    let comuni = 0
    for (const p of nuove) if (vecchie.has(p)) comuni += 1
    // Metà delle parole in comune con una domanda già fatta: è quella domanda,
    // detta con altre parole.
    if (comuni / Math.min(nuove.size, vecchie.size) >= 0.5) return true
  }
  return false
}

/**
 * Il prompt dell'intervista che precede il lavoro.
 *
 * L'utente descrive cosa vuole; da lì in poi è l'autopilota a dover capire il
 * resto — **compresi i criteri di fine e il comando che li verifica**, che
 * prima gli venivano chiesti a mano in un modulo. Un modulo da compilare è
 * lavoro che ricade sull'utente proprio nel momento in cui sta delegando.
 *
 * Due vincoli che tengono l'intervista corta:
 *
 * 1. **Una domanda per volta.** Cinque domande insieme sono di nuovo un modulo.
 * 2. **Prima guardare, poi chiedere.** Il framework di test si scopre leggendo
 *    `package.json`; chiederlo significa far perdere tempo a entrambi per un
 *    dato che è lì.
 */
export function componiPromptIntervista(
  obiettivo: string,
  cwd: string,
  scambi: ScambioIntervista[],
  opzioni: { senzaDomande?: boolean } = {}
): string {
  const storia = scambi.length === 0
    ? ['(nessuna domanda fatta finora)']
    : scambi.map((s) => `D: ${s.domanda}\nR: ${s.risposta}`)

  return [
    'Stai preparando un autopilota: un agente che porterà a termine un compito da solo,',
    'senza che l’utente lo segua. Prima di partire devi capire abbastanza da sapere',
    '**quando il lavoro sarà finito**.',
    '',
    `Obiettivo dell’utente: ${obiettivo}`,
    `Cartella di lavoro: ${cwd}`,
    '',
    'Cosa hai già chiesto e cosa ti è stato risposto:',
    ...storia,
    '',
    'Regole:',
    '- **Guarda il progetto prima di chiedere.** Leggi i file, la configurazione, gli script,',
    '  i test, la cronologia: tutto ciò che puoi scoprire da solo non va domandato.',
    '- **Decidi tu.** Davanti a due strade ragionevoli scegli la più prudente e scrivila',
    '  nell’obiettivo riformulato, invece di chiedere quale preferisce.',
    '- Chiedi **solo** ciò che soltanto l’utente può sapere — una preferenza sua, un dato',
    '  che nel progetto non c’è — e solo se sbagliarlo manderebbe il lavoro nella direzione',
    '  sbagliata in un modo da cui è difficile tornare indietro.',
    '- **Non ripetere una domanda già fatta**, nemmeno con altre parole: la risposta è qui sopra.',
    '- Non chiedere all’utente i criteri di fine: sei tu a proporli, ricavandoli',
    '  dall’obiettivo e da ciò che hai visto nel progetto.',
    '- **Non eseguire la suite di test né altri comandi lunghi.** Ti serve sapere che il',
    '  comando *esiste* — lo dicono `package.json`, gli script, i file — non che passi:',
    '  a verificarlo ci penserà l’autopilota mentre lavora, ed è il suo mestiere. Qui ogni',
    '  minuto speso ad aspettare un comando è un minuto in cui il lavoro non è cominciato,',
    '  e su un progetto con i test rotti si aspetterebbe fino alla fine del tempo.',
    '',
    'Chi delega si è alzato dalla scrivania: ogni domanda lo fa tornare. Se dovesse',
    'rispondere a tutto, tanto varrebbe che parlasse lui con la chat. Nel dubbio, parti.',
    '',
    ...(opzioni.senzaDomande === true
      ? [
          '**Ora NON fare domande.** Hai quello che ti serve; ciò che manca lo decidi tu e lo',
          'scrivi nell’obiettivo. Rispondi con un solo oggetto JSON, la configurazione:',
          ...CONFIGURAZIONE
        ]
      : [
          'Rispondi con un solo oggetto JSON, senza altro testo. O una domanda:',
          '{"domanda": "la tua domanda"}',
          '',
          'oppure la configurazione finale:',
          ...CONFIGURAZIONE
        ])
  ].join('\n')
}

/** La forma della risposta finale: identica nei due modi di chiuderla. */
const CONFIGURAZIONE = [
  '{"pronto": true, "nome": "nome breve", "obiettivo": "obiettivo riformulato con precisione",',
  ' "criteri": [{"descrizione": "cosa deve essere vero", "comando": "comando che lo verifica"}]}',
  '',
  'Almeno un criterio dovrebbe avere un comando verificabile, quando il progetto ne offre uno:',
  'un esito eseguibile è un fatto, un giudizio è un parere.'
]

function leggiCriteri(raw: unknown): { descrizione: string; comando?: string }[] {
  if (!Array.isArray(raw)) return []
  const criteri: { descrizione: string; comando?: string }[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as Record<string, unknown>
    if (typeof o.descrizione !== 'string' || o.descrizione.trim() === '') continue
    const comando = typeof o.comando === 'string' && o.comando.trim() !== '' ? o.comando.trim() : undefined
    criteri.push({ descrizione: o.descrizione.trim(), ...(comando !== undefined ? { comando } : {}) })
  }
  return criteri
}

/**
 * Legge cosa ha deciso l'intervistatore.
 *
 * La domanda vince sulla configurazione quando ci sono entrambe: se ha ancora
 * qualcosa da chiedere non è pronto, e partire con una configurazione mezza
 * indovinata costa più di un'altra domanda.
 *
 * `undefined` significa «non ho capito», e il chiamante lo tratta come tale:
 * mai come un via libera.
 */
export function leggiEsitoIntervista(testo: string): EsitoIntervista | undefined {
  const inizio = testo.indexOf('{')
  const fine = testo.lastIndexOf('}')
  if (inizio === -1 || fine <= inizio) return undefined

  let o: unknown
  try {
    o = JSON.parse(testo.slice(inizio, fine + 1))
  } catch {
    return undefined
  }
  if (typeof o !== 'object' || o === null) return undefined
  const r = o as Record<string, unknown>

  const domanda = typeof r.domanda === 'string' ? r.domanda.trim() : ''
  if (domanda !== '') return { tipo: 'domanda', testo: domanda }

  if (r.pronto === true) {
    const criteri = leggiCriteri(r.criteri)
    // Senza criteri l'autopilota non saprebbe quando fermarsi: è esattamente
    // ciò per cui l'intervista esiste, quindi non può finire senza averli.
    if (criteri.length === 0) return undefined
    const nome = typeof r.nome === 'string' && r.nome.trim() !== '' ? r.nome.trim() : undefined
    const obiettivo = typeof r.obiettivo === 'string' && r.obiettivo.trim() !== '' ? r.obiettivo.trim() : undefined
    return {
      tipo: 'pronto',
      ...(nome !== undefined ? { nome } : {}),
      ...(obiettivo !== undefined ? { obiettivo } : {}),
      criteri
    }
  }

  return undefined
}
