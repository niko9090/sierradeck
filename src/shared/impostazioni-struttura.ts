/**
 * Le impostazioni rifatte (0.56.0): una struttura sola per il PC, l'app e la
 * pagina. Nicholas (09/10): «Nelle impostazioni l'aggiornamento lo puoi
 * mettere in alto all'inizio? E sistemare tutto il menu impostazioni che così
 * com'è non serve a niente ed è fatto malissimo».
 *
 * Qui stanno le sezioni, nell'ordine, e ogni voce con la frase che spiega cosa
 * fa e cosa succede se la cambi. La ricerca in alto cerca in titoli,
 * spiegazioni e parole chiave, senza badare ad accenti e maiuscole. L'app ne
 * ha una copia (`ImpostazioniVoci.kt`), controllata da un test sui dati
 * scritti da qui (`resources/impostazioni/impostazioni-0.56.json`).
 *
 * L'inventario di prima e cosa è stato tolto, con il perché, stanno nel
 * quaderno: `impostazioni-rifatte-0-56.md`.
 */

export type IdSezione = 'aggiornamenti' | 'computer' | 'chat' | 'drive' | 'aspetto' | 'notifiche' | 'info'
export type Dove = 'pc' | 'app' | 'pagina'

export type Sezione = { id: IdSezione; titolo: string; spiega: string }

export const SEZIONI: readonly Sezione[] = [
  { id: 'aggiornamenti', titolo: 'Aggiornamenti', spiega: 'Le versioni di questo programma e del computer collegato, se ce n’è una nuova, cosa cambia, e com’è andato l’ultimo tentativo.' },
  { id: 'computer', titolo: 'Computer', spiega: 'Come si chiama questo computer, gli altri PC della tua cassaforte, le strade per raggiungerli e i dispositivi accoppiati.' },
  { id: 'chat', titolo: 'Chat e autopiloti', spiega: 'Dove lavora ogni chat, il PIN, le domande e come si comportano gli autopiloti.' },
  { id: 'drive', titolo: 'Drive e salvataggi', spiega: 'Il Drive dove si salvano le chat e la disposizione delle finestre.' },
  { id: 'aspetto', titolo: 'Aspetto', spiega: 'Colori, chiarezza e la disposizione dei pannelli.' },
  { id: 'notifiche', titolo: 'Notifiche', spiega: 'Quando e come avvisa che una chat o un autopilota ha bisogno di te.' },
  { id: 'info', titolo: 'Info e aiuto', spiega: 'Le versioni, il registro, «Copia i dettagli» per chiedere aiuto.' }
]

export type Voce = {
  id: string
  sezione: IdSezione
  titolo: string
  /** Cosa fa, e cosa succede se la cambi. */
  spiega: string
  /** Parole in più per la ricerca (sinonimi, nomi vecchi). */
  parole?: readonly string[]
  /** Dove c'è. */
  dove: readonly Dove[]
}

export const VOCI: readonly Voce[] = [
  // ── Aggiornamenti ──
  { id: 'versioni', sezione: 'aggiornamenti', titolo: 'Versioni', spiega: 'La versione di questa app (o pagina) e quella del computer collegato. Se non vanno d’accordo, qui si dice quale aggiornare.', parole: ['versione', 'app', 'pc'], dove: ['pc', 'app', 'pagina'] },
  { id: 'aggiorna-pc', sezione: 'aggiornamenti', titolo: 'Aggiornamento del computer', spiega: 'Cerca se c’è una versione nuova di SierraDeck per il computer, mostra cosa cambia e la installa. Prima di installare aspetta che le chat finiscano il turno: niente si perde, e il programma si riapre da solo.', parole: ['update', 'installa', 'novità', 'note'], dove: ['pc', 'app', 'pagina'] },
  { id: 'aggiorna-app', sezione: 'aggiornamenti', titolo: 'Aggiornamento dell’app', spiega: 'Controlla da sola, ogni qualche ora, se su GitHub c’è un’app nuova e te lo dice qui; il tasto la scarica e la installa. Se lo spegni, controlla solo quando lo chiedi tu.', parole: ['apk', 'android', 'controllo da solo'], dove: ['app'] },
  { id: 'scarica-da-solo', sezione: 'aggiornamenti', titolo: 'Scarica gli aggiornamenti da solo', spiega: 'Acceso: il computer scarica la versione nuova appena la trova, e ti chiede solo il tocco per installarla. Spento: la trova, te lo dice, e scarica quando premi «Scarica».', parole: ['automatico', 'download'], dove: ['pc'] },
  { id: 'ultimo-tentativo', sezione: 'aggiornamenti', titolo: 'Ultimo tentativo', spiega: 'Com’è andata l’ultima installazione, anche se non è riuscita, con il motivo: così si sa se riprovare o cosa sistemare prima.', parole: ['errore', 'fallito', 'installazione'], dove: ['pc', 'app', 'pagina'] },
  // ── Computer ──
  { id: 'nome-pc', sezione: 'computer', titolo: 'Nome di questo computer', spiega: 'Il nome con cui lo vedi qui, sul telefono e sugli altri PC al posto del nome di Windows. Cambiarlo non tocca niente altro.', parole: ['hostname', 'nome scelto'], dove: ['pc', 'app'] },
  { id: 'altri-pc', sezione: 'computer', titolo: 'Altri computer e strade', spiega: 'I PC della stessa cassaforte e da quale strada si raggiungono: rete di casa, Tailscale, collegamento diretto, Drive. Si raggiungono solo con la chiave di casa.', parole: ['tailscale', 'webrtc', 'rete', 'mappa', 'ponte'], dove: ['pc', 'app'] },
  { id: 'accoppiamento', sezione: 'computer', titolo: 'Telefoni accoppiati', spiega: 'I telefoni e i browser che possono comandare questo computer. Accoppiarne uno nuovo apre per tre minuti un codice da inquadrare; togliere un dispositivo lo scollega subito.', parole: ['qr', 'codice', 'dispositivi', 'client'], dove: ['pc'] },
  { id: 'porte', sezione: 'computer', titolo: 'Porte del client e degli autopiloti', spiega: 'Su quale porta il computer ascolta il telefono e gli altri PC, e quella del servizio degli autopiloti. Si cambiano solo se un altro programma le occupa; dopo il cambio va riaccoppiato il telefono.', parole: ['porta', '47640', 'rete'], dove: ['pc'] },
  { id: 'oltre-la-rete', sezione: 'computer', titolo: 'Accetta i dispositivi fuori dalla rete di casa', spiega: 'Spento: il telefono entra solo dalla rete di casa o da Tailscale. Acceso: anche da altre reti (serve comunque l’accoppiamento). Lascialo spento se non sai di averne bisogno.', parole: ['sicurezza', 'internet'], dove: ['pc'] },
  { id: 'cambia-computer', sezione: 'computer', titolo: 'Cambia computer', spiega: 'A quale computer è collegata quest’app (tocca il nome in alto). Gli altri si guardano anche passando da quello accoppiato, senza cambiarlo. «Dimentica» toglie un computer da quest’app: per tornarci serve un nuovo accoppiamento.', parole: ['postazioni', 'selettore', 'scollega', 'dimentica'], dove: ['app'] },
  // ── Chat e autopiloti ──
  { id: 'pin', sezione: 'chat', titolo: 'PIN delle chat', spiega: 'Il PIN che protegge le chat scelte da chi guarda dal telefono o da un altro PC, e dopo quanti minuti di inattività si richiudono. Senza PIN impostato non si protegge niente.', parole: ['sicurezza', 'blocco', 'password'], dove: ['pc'] },
  { id: 'ospite', sezione: 'chat', titolo: 'Dove vive ogni chat', spiega: 'Quale PC fa girare ogni chat («Ospitata da»). Le altre la guardano dal vivo. Cambiarlo non cancella niente e si annulla da qui.', parole: ['casa', 'ospitata', 'riordina'], dove: ['pc'] },
  { id: 'iberna', sezione: 'chat', titolo: 'Metti a dormire le chat del workspace che lasci', spiega: 'Acceso: cambiando workspace, le chat che lasci chiudono il loro claude.exe e si riprendono al ritorno. Spento: continuano a lavorare anche quando non le guardi.', parole: ['iberna', 'dormire', 'memoria'], dove: ['pc'] },
  { id: 'attesa-chat', sezione: 'chat', titolo: 'Avanzamento all’apertura di una chat lunga', spiega: 'Mentre una conversazione lunga si riapre, il riquadro mostra quanto manca invece di restare vuoto. Spento: il riquadro resta vuoto finché Claude Code è pronto.', parole: ['apertura', 'caricamento', 'attesa'], dove: ['pc'] },
  { id: 'posto-autopilota', sezione: 'chat', titolo: 'Dove si apre la scheda di un autopilota', spiega: 'A destra o sotto il mosaico delle chat, e quanto è larga. Non cambia niente del suo lavoro.', parole: ['larghezza', 'pannello'], dove: ['pc'] },
  // ── Drive e salvataggi ──
  { id: 'drive', sezione: 'drive', titolo: 'Drive', spiega: 'Il tuo Google Drive, dove ogni PC salva le sue chat cifrate con la chiave della cassaforte. Scollegato: le chat non si salvano e gli altri PC non si vedono.', parole: ['google', 'cloud', 'sincronia', 'cassaforte'], dove: ['pc', 'app', 'pagina'] },
  { id: 'torna-indietro', sezione: 'drive', titolo: 'Torna a com’era', spiega: 'Le ultime chiusure del programma con le chat che c’erano: se una disposizione si è persa, la rimetti com’era. Le chat di adesso non si cancellano, tornano nei loro workspace.', parole: ['ripristina', 'istantanee', 'chiusura', 'layout'], dove: ['pc'] },
  { id: 'fumetti-sincronia', sezione: 'drive', titolo: 'Avvisi del salvataggio automatico', spiega: 'Mostra un fumetto a ogni salvataggio sul Drive. Spento: il salvataggio avviene lo stesso, in silenzio; gli errori si vedono sempre.', parole: ['fumetti', 'notifiche drive'], dove: ['pc'] },
  // ── Aspetto ──
  { id: 'colore', sezione: 'aspetto', titolo: 'Colore e chiarezza', spiega: 'Il colore d’accento e quanto è chiaro lo sfondo. Il telefono li prende dal computer, così si vede tutto con la stessa grafica.', parole: ['tema', 'accento', 'chiarore', 'stile'], dove: ['pc', 'app'] },
  { id: 'stile', sezione: 'aspetto', titolo: 'Stile della console', spiega: '«Banco»: cornici sottili e riquadri a filo, più righe di terminale per chat. «Foglio»: più aria e angoli morbidi, qualche riga in meno. Il telefono segue lo stesso stile.', parole: ['banco', 'foglio', 'tema'], dove: ['pc', 'app'] },
  { id: 'scorciatoie', sezione: 'aspetto', titolo: 'Scorciatoie da tastiera', spiega: 'I tasti per le azioni più usate. Un campo vuoto spegne quella scorciatoia.', parole: ['tasti', 'tastiera'], dove: ['pc'] },
  // ── Notifiche ──
  { id: 'controllo-continuo', sezione: 'notifiche', titolo: 'Controllo continuo', spiega: 'Acceso: l’app guarda il computer ogni cinque secondi anche da chiusa e ti avvisa subito; Android mostra una riga fissa nelle notifiche. Spento: guarda ogni paio di minuti, senza riga fissa.', parole: ['avvisi', 'sfondo', 'batteria'], dove: ['app'] },
  { id: 'notifiche-android', sezione: 'notifiche', titolo: 'Notifiche di Android', spiega: 'Se Android ha spento le notifiche di SierraDeck, nessun avviso può arrivare: il tasto apre le impostazioni di Android per riaccenderle.', parole: ['permesso', 'android'], dove: ['app'] },
  { id: 'notifiche-pagina', sezione: 'notifiche', titolo: 'Notifiche del browser', spiega: 'La pagina avvisa con le notifiche del browser solo mentre è aperta. Per gli avvisi anche a pagina chiusa serve l’app.', parole: ['browser'], dove: ['pagina'] },
  // ── Info e aiuto ──
  { id: 'salute', sezione: 'info', titolo: 'Salute del sistema', spiega: 'Il Drive, gli altri PC, gli aggiornamenti non riusciti e gli errori delle ultime ore, con cosa fare per ognuno.', parole: ['diagnosi', 'errori', 'mappa'], dove: ['pc', 'app'] },
  { id: 'registro', sezione: 'info', titolo: 'Registro', spiega: 'Il diario del programma, giorno per giorno: serve a capire cosa è successo quando qualcosa non va.', parole: ['log', 'diario'], dove: ['pc'] },
  { id: 'copia-dettagli', sezione: 'info', titolo: 'Copia i dettagli', spiega: 'Copia in un testo solo versioni, collegamento e ultimi errori, da incollare quando chiedi aiuto. Non contiene chiavi né password.', parole: ['aiuto', 'supporto', 'diagnosi'], dove: ['pc', 'app', 'pagina'] },
  { id: 'scollega', sezione: 'info', titolo: 'Scollega questo dispositivo', spiega: 'Dimentica la chiave del computer su questo telefono: per tornare serve un nuovo accoppiamento. Sul computer non cambia niente.', parole: ['esci', 'accoppiamento'], dove: ['pagina'] }
]

/** Toglie accenti e maiuscole: «Novità» e «novita» sono la stessa ricerca. */
export function normalizza(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').toLowerCase()
}

/**
 * La ricerca in alto: le voci di quel posto che contengono **tutte** le
 * parole cercate, nell'ordine delle sezioni. Vuota = tutte.
 */
export function cercaImpostazioni(q: string, dove: Dove, voci: readonly Voce[] = VOCI): Voce[] {
  const qui = voci.filter((v) => v.dove.includes(dove))
  const parole = normalizza(q).split(/\s+/).filter((p) => p !== '')
  if (parole.length === 0) return [...qui]
  const ordine = SEZIONI.map((s) => s.id)
  return qui
    .filter((v) => {
      const testo = normalizza([v.titolo, v.spiega, ...(v.parole ?? []), SEZIONI.find((s) => s.id === v.sezione)?.titolo ?? ''].join(' '))
      return parole.every((p) => testo.includes(p))
    })
    .sort((a, b) => ordine.indexOf(a.sezione) - ordine.indexOf(b.sezione))
}

/** Le sezioni di quel posto, con le loro voci (dopo la ricerca): quelle vuote non si mostrano. */
export function sezioniDi(dove: Dove, q = ''): { sezione: Sezione; voci: Voce[] }[] {
  const trovate = cercaImpostazioni(q, dove)
  return SEZIONI.map((sezione) => ({ sezione, voci: trovate.filter((v) => v.sezione === sezione.id) })).filter((g) => g.voci.length > 0)
}
