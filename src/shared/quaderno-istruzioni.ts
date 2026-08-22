import { CARTELLA_QUADERNO, SOTTOCARTELLA } from './quaderno'

/**
 * La regola che rende il quaderno un **obbligo** della chat, non un optional.
 *
 * Il quaderno serve a poco se le chat non ci scrivono ciò che imparano: le
 * decisioni prese, i vincoli scoperti, come funziona una cosa, un errore risolto
 * e il perché. Senza, ogni conversazione riparte da zero e si ripaga in token un
 * contesto che si poteva leggere in dieci righe. Per questo la regola non vive in
 * un CLAUDE.md che l'utente potrebbe non avere, ma viene iniettata nel prompt di
 * sistema di **ogni** chat aperta dal Gestore (`--append-system-prompt`), senza
 * toccare nessun file dell'utente né `~/.claude`.
 *
 * È scritta perché la chat la applichi da sé: annota man mano, e — questo è il
 * «promemoria a fine turno» chiesto — ricontrolla di averlo fatto **prima** di
 * restituire il controllo. Preferito a un hook che blocca la chiusura perché un
 * hook che si inceppa lascia la chat ferma, che è esattamente il guasto che
 * questo prodotto esiste per evitare.
 */
export const DIRETTIVA_QUADERNO = [
  'Stai lavorando dentro SierraDeck. Questo progetto ha un QUADERNO condiviso:',
  `la cartella \`${CARTELLA_QUADERNO}/${SOTTOCARTELLA}/\` dentro la cartella di lavoro,`,
  'fatta di schede Markdown (una per argomento).',
  '',
  'OBBLIGO: quando in questa conversazione emerge qualcosa di utile e duraturo sul',
  'progetto — una decisione presa e il perché, un vincolo scoperto, come funziona',
  'una parte del sistema, un errore risolto e la sua causa, una trappola da',
  'ricordare — DEVI registrarlo nel quaderno di tua iniziativa, senza che nessuno',
  'te lo chieda. Non è un extra: è parte del lavoro.',
  '',
  'Come scrivere una scheda:',
  `- crea o aggiorna un file \`.md\` in \`${CARTELLA_QUADERNO}/${SOTTOCARTELLA}/\`;`,
  '- in cima un\'intestazione YAML fra due righe di `---` con:',
  '  `titolo: "..."`, `quando: <data-ora ISO>`, e se aiutano `tag: ["...", "..."]`;',
  '- sotto, il contenuto in Markdown: conciso, un argomento per scheda, scritto',
  '  per essere riletto da una persona fra un mese.',
  '- se una scheda sull\'argomento esiste già, AGGIORNALA invece di duplicarla.',
  '',
  'Cosa NON mettere: chiacchiere, passaggi banali, o cose già ovvie dal codice.',
  'Solo ciò che a una persona (o alla prossima chat) farebbe risparmiare tempo.',
  '',
  'PRIMA di considerare finito un compito o di restituire il controllo all\'utente,',
  'fermati un istante e controlla: è emerso qualcosa che merita una scheda? Se sì,',
  'scrivila o aggiornala adesso. È l\'ultima cosa da fare, non la prima da saltare.'
].join('\n')
