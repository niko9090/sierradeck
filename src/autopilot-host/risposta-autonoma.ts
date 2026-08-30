/**
 * Quando la chat fa una domanda, **prima si prova a rispondere**.
 *
 * Fino a ieri no: qualunque domanda della chat fermava l'autopilota e la
 * girava all'utente. Ed è il contrario del punto — un autopilota che delega
 * indietro ogni bivio non fa risparmiare tempo, ne fa perdere: chi lo ha
 * lanciato torna alla scrivania e trova il lavoro fermo su «uso `npm` o
 * `pnpm`?», una domanda a cui l'obiettivo, i criteri e il progetto rispondono
 * da soli.
 *
 * Quindi la domanda passa prima dal supervisore, che è una sessione Claude Code
 * viva dentro la cartella del progetto: può guardare i file, l'obiettivo, i
 * criteri e la storia delle decisioni. Se la risposta è lì, risponde e il
 * lavoro continua senza che nessuno se ne accorga.
 *
 * All'utente si arriva solo per quello che l'utente **solo** sa: una
 * credenziale, una spesa, una scelta sul suo prodotto, un rischio che tocca
 * roba sua. Tre categorie, non «nel dubbio chiedi».
 */

import type { Autopilota } from '@shared/autopilota'

export type EsitoRisposta =
  | { tipo: 'rispondo'; risposta: string; perche?: string }
  | { tipo: 'chiedi'; domanda: string; perche?: string }

/**
 * Il prompt per il supervisore.
 *
 * Due cose lo rendono utile invece che cerimonioso: gli si dà **tutto il
 * contesto che ha l'autopilota** — obiettivo, criteri, cosa è già successo — e
 * gli si dice esplicitamente che rispondere è il caso normale e chiedere
 * l'eccezione. Senza la seconda riga un modello prudente gira all'utente
 * qualunque cosa, che è esattamente il comportamento da togliere.
 */
export function componiPromptRisposta(a: Autopilota, domanda: string): string {
  return [
    'Stai facendo da supervisore a una chat che sta lavorando a un obiettivo, e che si è',
    'fermata a fare una domanda. Devi decidere se la domanda si può risolvere senza',
    'disturbare la persona che ha delegato il lavoro.',
    '',
    `Obiettivo: ${a.obiettivo}`,
    `Cartella del progetto: ${a.cwd}`,
    '',
    'Criteri di fine:',
    ...a.criteri.map(
      (c) => `- ${c.descrizione}${c.soddisfatto ? ' [già soddisfatto]' : ''}`
    ),
    ...(a.decisioni.length > 0
      ? ['', 'Ultime decisioni prese:', ...a.decisioni.slice(-5).map((d) => `- ${d.cosa}`)]
      : []),
    '',
    'La domanda della chat:',
    domanda,
    '',
    'Puoi guardare il progetto per decidere: i file, la configurazione, come sono fatte le',
    'cose che ci stanno già dentro.',
    '',
    '**Rispondere è il caso normale.** Quasi ogni domanda che una chat fa durante un lavoro',
    'delegato ha già una risposta nell’obiettivo, nei criteri, o in come è fatto il progetto:',
    'quale strumento usare, come chiamare una cosa, se procedere con quello che stava facendo.',
    'Rispondere a quelle è il tuo mestiere.',
    '',
    '**Chiedi alla persona solo per queste tre cose**, e per nient’altro:',
    '- un segreto che non è nel progetto: una password, una chiave, un accesso;',
    '- una spesa, o qualcosa che costa denaro;',
    '- una scelta sul suo prodotto o sui suoi dati che cambia cosa il prodotto È — non come',
    '  è fatto dentro — o un’azione distruttiva su roba sua che non si annulla.',
    '',
    'Se chiedi, scrivi una domanda **che si capisce da sola**: cosa serve, perché serve adesso,',
    'e cosa succede con ognuna delle risposte possibili. Chi la legge potrebbe essere lontano dal',
    'computer e non aver seguito niente di quello che è successo finora.',
    '',
    'Rispondi con un solo oggetto JSON, senza altro testo intorno:',
    '{"azione": "rispondo|chiedi", "risposta": "...", "domanda": "...", "perche": "..."}',
    '',
    '- `risposta`: cosa scrivere nella chat. Va scritta **alla chat**, come le scriveresti tu:',
    '  è il messaggio che riceverà, non una spiegazione di cosa dovrebbe fare.',
    '- `domanda`: cosa chiedere alla persona. Serve solo con `chiedi`.',
    '- `perche`: una riga sul motivo, per il registro del lavoro.'
  ].join('\n')
}

/** Il primo oggetto JSON dentro un testo, o `undefined`. */
function primoOggetto(testo: string): Record<string, unknown> | undefined {
  const inizio = testo.indexOf('{')
  const fine = testo.lastIndexOf('}')
  if (inizio === -1 || fine <= inizio) return undefined
  try {
    const letto: unknown = JSON.parse(testo.slice(inizio, fine + 1))
    return typeof letto === 'object' && letto !== null ? letto as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function testoDi(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/**
 * Legge il verdetto del supervisore.
 *
 * **Illeggibile vale «chiedi», non «rispondi».** Nel dubbio si disturba la
 * persona: una risposta inventata da un giudizio che non si è capito entra
 * nella chat come se fosse una decisione presa, e da lì in poi il lavoro va
 * avanti su una premessa che nessuno ha mai stabilito.
 *
 * Allo stesso modo, `rispondo` senza una risposta scritta non è una risposta:
 * scrivere il vuoto nella chat la farebbe ripartire senza aver saputo niente.
 */
export function leggiEsitoRisposta(testo: string): EsitoRisposta | undefined {
  const o = primoOggetto(testo)
  if (o === undefined) return undefined
  const perche = testoDi(o.perche)
  const risposta = testoDi(o.risposta)
  const domanda = testoDi(o.domanda)
  if (o.azione === 'rispondo' && risposta !== undefined) {
    return { tipo: 'rispondo', risposta, ...(perche !== undefined ? { perche } : {}) }
  }
  if (domanda !== undefined) {
    return { tipo: 'chiedi', domanda, ...(perche !== undefined ? { perche } : {}) }
  }
  return undefined
}

/**
 * La domanda come la legge chi la riceve.
 *
 * Chi risponde può essere lontano dal computer, con un telefono in mano, e non
 * aver seguito niente di quello che è successo nelle ultime due ore. Una
 * domanda che dà per scontato il contesto — «uso la porta 8080?» — non è una
 * domanda a cui si può rispondere: è un indovinello.
 *
 * Quindi si nomina **chi** sta chiedendo e **a che lavoro**, poi la domanda, e
 * in fondo cosa succede se non si risponde. Quell'ultima riga è la più
 * importante delle tre: senza, una domanda che scade sembra un lavoro perso, e
 * chi la vede tardi lascia perdere invece di rispondere.
 */
export function domandaChiara(a: Autopilota, domanda: string, perche?: string): string {
  const chi = a.nome !== '' ? a.nome : a.obiettivo.slice(0, 40)
  return [
    `«${chi}» si è fermato e ha bisogno di te.`,
    '',
    `Sta lavorando a: ${a.obiettivo}`,
    ...(perche !== undefined ? ['', `Perché serve adesso: ${perche}`] : []),
    '',
    domanda.trim(),
    '',
    'Rispondendo, la chat riprende da dov’era. Se rispondi tardi riparte lo stesso:',
    'non si perde niente di quello che ha già fatto.'
  ].join('\n')
}
