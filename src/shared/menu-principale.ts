/**
 * **Il menu principale** (0.61.0), uguale su PC, pagina e app.
 *
 * Nicholas (11/10): «pratico, intuitivo, tutte le funzioni in vista ordinate
 * per importanza». Non trovava «Progetti» (un tasto piccolo accanto al vecchio
 * «☁ Drive», che trovava incomprensibile), e le impostazioni rimandavano a
 * pannelli che avevano già il loro tasto in alto.
 *
 * Qui stanno le sette voci, nell'ordine, con il nome, l'icona e cosa c'è
 * dentro. Il PC le disegna in `Console.tsx`, la pagina in `client-pagina.ts`
 * (fascia), l'app le legge da `assets/menu.json` (scritto dal test con
 * `AGGIORNA=1`) e le controlla in `MenuPrincipaleTest.kt`.
 *
 * `FUNZIONI` è l'inventario: ogni funzione di prima, con la voce dove si
 * trova adesso. Il test controlla che nessuna resti senza casa. L'inventario
 * per esteso, con il perché, sta nel quaderno: `menu-rifatti-0-61-0-inventario.md`.
 */
export type IdMenu = 'progetti' | 'autopiloti' | 'domande' | 'chat' | 'file' | 'salute' | 'impostazioni'

export type VoceMenu = {
  id: IdMenu
  nome: string
  /** Un segno che si legge anche in piccolo, uguale ovunque. */
  icona: string
  /**
   * Il nome nella fascia del telefono e della pagina, dove sette voci stanno
   * in 360 punti: con il trattino morbido (\u00ad) un nome lungo va a capo
   * pulito («Imposta-zioni») invece di uscire dalla sua colonna.
   */
  breve: string
  /** Cosa guarda e cosa fa: il testo del tasto, quando ci passi sopra. */
  spiega: string
  /**
   * Solo nella pagina e nell'app, non nella fascia del PC. È la sezione File
   * del telefono (sfogliare i progetti del PC e ritirare i file mandati): sul
   * PC il pannello dei file con i server (il «FileZilla») è stato tolto.
   */
  soloTelefono?: true
}

export const MENU_PRINCIPALE: readonly VoceMenu[] = [
  {
    id: 'progetti', nome: 'Progetti', icona: '▦', breve: 'Progetti',
    spiega: 'Tutti i tuoi progetti e le loro chat, su tutti i PC: dove lavora ognuno (il PC residente), chi ne ha una copia, cosa è assegnato male. Da qui Apri, Porta qui, Rendi residente, il contenuto del Drive, il salvataggio e l’arrivo dal Drive, e il quaderno del progetto.'
  },
  {
    id: 'autopiloti', nome: 'Autopiloti', icona: '◉', breve: 'Auto\u00adpiloti',
    spiega: 'Gli autopiloti di questo PC e quelli degli altri PC: cosa stanno facendo, cosa aspettano da te, e i comandi per crearli, fermarli, farli ripartire e archiviarli.'
  },
  {
    id: 'domande', nome: 'Domande', icona: '?', breve: 'Domande',
    spiega: 'Tutto quello che aspetta una tua risposta: chat ferme su una domanda o un permesso, chat che hanno finito, domande degli autopiloti. Si apre accanto alle chat e resta aperta mentre lavori.'
  },
  {
    id: 'chat', nome: 'Chat e workspace', icona: '▭', breve: 'Chat',
    spiega: 'Le chat e i workspace: nuova chat, riprendi una conversazione, crea, rinomina ed elimina i workspace, le chat usate da altri PC, una nuova finestra, e il Negozio con gli strumenti delle chat (plugin, skill, MCP).'
  },
  {
    id: 'file', nome: 'File', icona: '⇅', breve: 'File', soloTelefono: true,
    spiega: 'I file dei progetti dei tuoi PC, da sfogliare e leggere dal telefono, e quelli che un PC ti ha mandato: si guardano e si scaricano.'
  },
  {
    id: 'salute', nome: 'Salute', icona: '♥', breve: 'Salute',
    spiega: 'Come sta il sistema: il Drive, gli altri computer (acceso o spento, strada, versione, chat aperte, guarda dal vivo, cassetta), gli aggiornamenti, gli errori delle ultime ore e i consumi del piano, con cosa fare per ognuno.'
  },
  {
    id: 'impostazioni', nome: 'Impostazioni', icona: '⚙', breve: 'Imposta\u00adzioni',
    spiega: 'Solo le preferenze: aggiornamenti, nome del computer e rete, comportamento delle chat, l’account Google, aspetto, notifiche. Niente che abbia già un suo tasto in questa barra.'
  }
]

/** Dove si trova adesso ogni funzione di prima (PC, pagina e app): l'inventario della 0.61.0. */
export type Funzione = { funzione: string; dove: IdMenu; prima: string }

export const FUNZIONI: readonly Funzione[] = [
  // Progetti, con quello che era del vecchio «☁ Drive» e di Account → Drive
  { funzione: 'Pannello Progetti (residente, copie, Rendi residente, unioni, recupero)', dove: 'progetti', prima: '▦ Progetti (tasto piccolo)' },
  { funzione: 'Contenuto del Drive per progetto e per workspace', dove: 'progetti', prima: '☁ Drive' },
  { funzione: 'Porta qui', dove: 'progetti', prima: '☁ Drive' },
  { funzione: 'Sposta progetto', dove: 'progetti', prima: '☁ Drive' },
  { funzione: 'Riordina le chat', dove: 'progetti', prima: '☁ Drive' },
  { funzione: 'Dove vive ogni chat', dove: 'progetti', prima: '☁ Drive, Impostazioni → Chat' },
  { funzione: 'Togli e rimetti un workspace sul Drive', dove: 'progetti', prima: '☁ Drive' },
  { funzione: 'Salva ora e Ripristina', dove: 'progetti', prima: 'Impostazioni → Account' },
  { funzione: 'Salvataggio automatico', dove: 'progetti', prima: 'Impostazioni → Account' },
  { funzione: 'Fondi con il Drive', dove: 'progetti', prima: '☁ Drive, Impostazioni → Account' },
  { funzione: 'Stato della sincronizzazione', dove: 'progetti', prima: 'Impostazioni → Account' },
  { funzione: 'Progetti sul Drive (coda, testimone, togli, metti una cartella)', dove: 'progetti', prima: 'Impostazioni → Account' },
  { funzione: 'Code dei progetti', dove: 'progetti', prima: 'pagina e app: Computer' },
  { funzione: 'Quaderno del progetto', dove: 'progetti', prima: '▤ Quaderno' },
  // Autopiloti
  { funzione: 'Autopiloti di questo PC e degli altri PC', dove: 'autopiloti', prima: 'Autopiloti ▾, pagina Lavori, app Lavori' },
  // Domande
  { funzione: 'Domande in attesa', dove: 'domande', prima: 'Domande' },
  { funzione: 'Quello che è in moto adesso', dove: 'domande', prima: 'pagina: Adesso' },
  // Chat e workspace
  { funzione: 'Nuova chat', dove: 'chat', prima: '+ Nuova chat' },
  { funzione: 'Riprendi una conversazione', dove: 'chat', prima: '▣ Riprendi' },
  { funzione: 'Spazio delle chat: Chiudi, Archivia, Elimina dal PC, archiviate e recupero di 30 giorni', dove: 'chat', prima: 'nuova (0.79.0); prima solo «Butta» nel Riprendi del PC' },
  { funzione: 'Cambia, crea, rinomina ed elimina i workspace', dove: 'chat', prima: 'linguette dei workspace, ⋯, pagina e app: Computer → Workspace' },
  { funzione: 'Usate da altri PC', dove: 'chat', prima: '⧉ Usate da altri PC' },
  { funzione: 'Nuova finestra', dove: 'chat', prima: '⧉ Finestra' },
  { funzione: 'Negozio (plugin, skill, MCP)', dove: 'chat', prima: '▣ Negozio, pagina Computer, app Negozio' },
  // File
  { funzione: 'File dei progetti, dal telefono', dove: 'file', prima: '⇅ File' },
  { funzione: 'File mandati al telefono', dove: 'file', prima: '⇅ File' },
  // Salute
  { funzione: 'Salute del sistema', dove: 'salute', prima: '♥ Salute, Impostazioni → Info' },
  { funzione: 'Altri computer: chat aperte, guarda dal vivo, cassetta', dove: 'salute', prima: 'Impostazioni → Account, pagina e app: Computer' },
  { funzione: 'Consumi del piano e del contesto', dove: 'salute', prima: 'Consumi, Impostazioni → Consumi' },
  // Impostazioni
  { funzione: 'Aggiornamenti', dove: 'impostazioni', prima: 'Impostazioni' },
  { funzione: 'Nome del computer, porte, accoppiamento', dove: 'impostazioni', prima: 'Impostazioni' },
  { funzione: 'Account Google del Drive e cassaforte', dove: 'impostazioni', prima: 'Impostazioni → Account' },
  { funzione: 'Aspetto, scorciatoie, notifiche', dove: 'impostazioni', prima: 'Impostazioni' },
  { funzione: 'Registro e Copia i dettagli', dove: 'impostazioni', prima: 'Impostazioni → Info, Account' }
]

export function voceMenu(id: IdMenu): VoceMenu {
  const v = MENU_PRINCIPALE.find((x) => x.id === id)
  if (v === undefined) throw new Error(`voce di menu sconosciuta: ${id}`)
  return v
}

/**
 * **Le quattro voci del telefono** (0.83.0): app e pagina servita dal PC.
 * Sette voci in 360 punti erano troppe; sul telefono si raggruppano in
 * quattro, ognuna con le voci del PC che contiene e le sue linguette in cima.
 * Ogni funzione resta a due tocchi al massimo. L'app le legge da
 * `assets/menu.json` (chiave `telefono`) e le controlla in `NavigazioneTest.kt`;
 * la mappa per esteso sta nel quaderno: `app-android-0-83-0.md`.
 */
export type IdTelefono = 'adesso' | 'chat' | 'progetti' | 'altro'

export type VoceTelefono = {
  id: IdTelefono
  nome: string
  /** Le voci del PC che stanno qui dentro. */
  contiene: readonly IdMenu[]
  /** Le linguette in cima, nell'ordine (vuoto: una pagina sola). */
  linguette: readonly string[]
}

export const MENU_TELEFONO: readonly VoceTelefono[] = [
  { id: 'adesso', nome: 'Adesso', contiene: ['domande', 'autopiloti'], linguette: [] },
  { id: 'chat', nome: 'Chat', contiene: ['chat'], linguette: ['Chat', 'Workspace', 'Negozio'] },
  { id: 'progetti', nome: 'Progetti', contiene: ['progetti', 'file'], linguette: ['Progetti', 'File', 'Drive'] },
  { id: 'altro', nome: 'Altro', contiene: ['salute', 'impostazioni'], linguette: [] }
]
