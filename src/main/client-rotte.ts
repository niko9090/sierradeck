import type { ChatSalvata } from '@shared/workspace'
import { nomeDaMostrare } from '@shared/nome-pc'
import { leggiIstruzioni, notaCorreggi } from '@shared/istruzioni-autopilota'
import type { Esito } from './client-server'
import type { Dispositivi } from './dispositivi'
import { chiaveFermo, eFermo, type Autopilota } from '@shared/autopilota'
import { paginaClient, ICONA_SVG, MANIFESTO } from './client-pagina'
import { ledDi, misuraPasso, passaggi } from '@shared/autopilota-vista'
import { conversazione, haDomandaAperta, staPensando } from '@shared/chat-autopilota'
import { PREFERENZE_PREDEFINITE, tavolozza, type Preferenze } from '@shared/preferenze'
import { validateNomeWorkspace } from './validation'
import { pathToSlug } from './indexer/project-scanner'
import { firmaScelte, rispostaDaTesto, scelteDiTerminale, tastiPerRisposta, type Scelta } from '@shared/scelte-terminale'
import type { OpzioneBattito } from '@shared/posta'
import { leggiIdChatAltroPc, raccogliDomande, vociPerLeApp } from '@shared/domande-telefono'
import { domandeScheda } from '@shared/domande-autopilota'
import { conversazioniDomande, quanteAspettano, type Inviato } from '@shared/domande-conversazioni'
import { alberoChat } from '@shared/harness'
import type { NoteAggiornamento } from '@shared/note-aggiornamento'
import { leggiRichiestaPonte } from '@shared/ponte-telefono'
import { MODELLI } from '@shared/modelli'
import {
  bozzaDaCorpo, controllaBozzaAutopilota, controllaNomeWorkspace, ULTIMO_WORKSPACE,
  type AzioneFinestra, type EsitoAzioneFinestra, type RichiestaAutopilota
} from '@shared/azioni-telefono'
import { ANTEPRIMA_NASCOSTA, oscuraChat, rifiutoChiusa, STATO_CHIUSA } from '@shared/pin-chat'
import type { GuardianoPin } from './pin-guardiano'
import type { Allegati } from './allegati'
import { creaMemoriaInvii, idMessaggioValido } from '@shared/collegamento'
import type { Strada } from '@shared/strada-pc'
import {
  controllaAllegato, creaLimitatore, decidiDestinazione, leggiCartellaDestinazione, leggiDestinazione, notaPulita, PEZZO_BYTE, ALLEGATO_MAX_BYTE,
  pezzoBase64Valido, rigaPerAutopilota, rigaPerChat, type DestinazioneDecisa
} from '@shared/allegati'
import type { FileProgetti } from './file-progetti'
import type { AlTelefono } from './al-telefono'
import type { QuadernoPersonale } from './quaderno-personale'
import { chiaveCartella, eTelefono, idConsegnaValido, nomiDistinti, radiceAmmessa, rifiutoProgettoChiuso } from '@shared/file-telefono'

/**
 * Un altro PC con la chiave di casa: `pc` (prima della 0.49.1, senza dire chi
 * è) o `pc:<chi guarda>` (0.49.1: il suo id, o `tel:<telefono>@<PC>` dal ponte).
 */
export function daAltroPc(dispositivo: string | undefined): boolean {
  return dispositivo === 'pc' || (dispositivo?.startsWith('pc:') ?? false)
}

/** Le rotte che mostrano o scrivono dentro una chat: passano dal PIN (0.49.0). */
const ROTTE_DENTRO_CHAT = new Set(['/api/storia', '/api/dentro', '/api/scrivi', '/api/scegli', '/api/chat/chiudi', '/api/chat/nome', '/api/chat/dormi', '/api/chat/sveglia', '/api/chat/sposta', '/api/chat/ospite'])
import type { TentativoFallito } from '@shared/tentativo-installazione'
import type { AvvisoDrive } from '@shared/scoperta-pc'
import type { EsitoNegozio, McpVoce, PluginVoce, SkillVoce } from '@shared/negozio'

/**
 * Cosa può fare il Client, e cosa no.
 *
 * Non è una copia di SierraDeck sul telefono: da un dispositivo con lo schermo
 * piccolo, in piedi, con una mano sola, servono **poche cose fatte bene**.
 * Guardare come vanno i lavori, rispondere a una domanda che blocca tutto,
 * mandare due parole a una chat. Tutto il resto si fa al computer.
 *
 * Manca di proposito qualunque cosa distrugga: niente chiusura di chat, niente
 * eliminazione, niente cambio di cartella. Un tocco sbagliato in tram non deve
 * poter buttare via il lavoro della notte.
 */

export type BattitoPcTelefono = {
  pcId: string; nome: string; host?: string; nomeScelto?: string; versione: string; battito: string
  cartelle: string[]
  chat: { sessione?: string; titolo: string; cwd: string; aspetta: boolean; scelte?: OpzioneBattito[] }[]
}

export type VocePostaTelefono = {
  id: string; testo: string; cwd: string; sessione?: string; creataIl: string; daPc: string; daNome: string
  stato: 'attesa' | 'consegnata' | 'fallita'; consegnataIl?: string; aSessione?: string; esito?: string; apertaIl?: string
}

export type VoceCodaTelefono = {
  id: string; testo: string; creataIl: string; daNome: string; sessione?: string
  stato: 'attesa' | 'consegnata'; consegnataIl?: string; aNome?: string; aSessione?: string
}

export type Chat = {
  id: string
  titolo: string
  cwd: string
  /**
   * La conversazione che c'è dentro.
   *
   * Serve al Core per sapere **quale finestra** ospita già una certa chat, e
   * quindi a chi consegnare le istruzioni di un autopilota: mandarle a tutte
   * significherebbe scrivere lo stesso messaggio due volte.
   */
  sessione?: string
  /**
   * Ha finito di scrivere e aspetta te.
   *
   * Il prompt si è visto e poi c’è stato silenzio: è lo stesso giudizio con
   * cui l’autopilota decide quando può parlare a una chat. Da un telefono è
   * la sola notizia che valga una notifica — «sta lavorando» non chiede
   * niente a nessuno.
   */
  aspetta?: boolean
  /** Se la governa un autopilota: allora è lui ad avvisare, non lei. */
  governata?: boolean
  /** Chi la governa: l'autopilota e la sua chat, come li conosce il servizio. */
  autopilota?: { id: string; chat: string }
  /**
   * Ha un terminale acceso.
   *
   * Diverso da `aspetta`, e la differenza conta prima di un aggiornamento: un
   * riquadro ibernato o appena aperto non aspetta te **e** non sta facendo
   * niente. Senza distinguerli, aspettare che le chat siano ferme vorrebbe
   * dire aspettare per sempre un lavoro che non e' mai cominciato.
   */
  viva?: boolean
  /**
   * Il progetto di questa chat e' in mano a un altro PC: il suo nome.
   * Un'informazione, non un comando: dal telefono si vede, si decide al computer.
   */
  altrove?: string
  /** L'ultima riga vista nel terminale: dice a colpo d'occhio se si muove. */
  ultimaRiga?: string
  /** Il workspace del riquadro (0.49.0): per il PIN dei workspace. */
  workspace?: string
  /**
   * Dai segnali di Claude Code (0.45.0): chiede un permesso o una domanda,
   * l'errore che ha fermato il turno, e da dove viene lo stato (segnali, o
   * lo schermo come riserva). Assenti per le chat senza segnali.
   */
  chiedeSegnale?: boolean
  errore?: string
  fonteStato?: 'segnali' | 'schermo'
  /**
   * Le ultime righe, per chi vuole guardare dentro.
   *
   * Non viaggiano con l'elenco: si chiedono per **una** chat, quando la si
   * apre. Mandarle tutte ogni due secondi vorrebbe dire spedire qualche decina
   * di kilobyte al minuto sulla rete del telefono per righe che nessuno sta
   * guardando.
   */
  coda?: string[]
  /**
   * Le stesse righe come le ha scritte il terminale, colori compresi.
   *
   * Costano pochi byte in piu' delle ripulite e viaggiano per la stessa strada
   * — una chat sola, quando la si apre — ma dall'altra parte fanno la
   * differenza fra un terminale e la sua trascrizione sbiancata.
   */
  codaGrezza?: string[]
}

export type DipendenzeRotte = {
  dispositivi: Dispositivi
  /** Le chat aperte adesso, in tutte le finestre. */
  chat: () => Chat[]
  autopiloti: () => Promise<Autopilota[]>
  /** Risponde alla domanda di un autopilota. */
  rispondi: (idDomanda: string, risposta: string) => Promise<void>
  /** Le domande in attesa di risposta. */
  domande: () => Promise<{ id: string; autopilotaId: string; testo: string }[]>
  /**
   * Manda del testo a una chat, come se fosse stato digitato: il testo, e poi
   * l'invio.
   *
   * Il testo puo' essere una sequenza di tasti — le frecce con cui ci si muove
   * in un elenco di scelte — o addirittura vuoto, quando l'opzione voluta e'
   * gia' quella evidenziata e serve il solo invio.
   */
  scriviAChat: (idChat: string, testo: string) => void
  /**
   * Manda dei tasti a una chat **a pezzi**, uno dopo l'altro con una pausa,
   * senza aggiungere niente (0.52.5): le frecce, poi il testo di una risposta
   * libera, poi l'invio. Senza, si ripiega su `scriviAChat` (frecce e testo
   * insieme, poi l'invio).
   */
  tastiAChat?: (idChat: string, pezzi: string[]) => void
  /**
   * Scrive a una chat di un altro PC (0.37.2): e' cosi' che si risponde, dalle
   * Domande, a una chat che aspetta su un altro computer acceso.
   */
  /** Il PIN di una chat di un altro PC (0.49.1, dalle Domande): lo controlla quel PC. */
  pinAltroPc?: (pcId: string, sessione: string, pin: string) => Promise<{ ok: true } | { ok: false; messaggio: string; stato?: number }>
  scriviAltroPc?: (pcId: string, sessione: string, testo: string) => Promise<{ ok: true } | { ok: false; messaggio: string }>
  /** Una scelta per la chat di un altro PC (0.52.6), dalle Domande: passa dal ponte. */
  scegliAltroPc?: (pcId: string, sessione: string, opzione: string, libera?: string) => Promise<{ ok: true } | { ok: false; messaggio: string; stato?: number; pin?: boolean }>
  /** La strada con cui si arriva a quel PC (0.40.0), in due parole: la pagina e l'app la mostrano accanto a «SU <PC>». */
  stradaPc?: (pcId: string) => string | undefined
  /** La linguetta «File» dal telefono (0.38.0): solo lettura. */
  fileAutopilota?: (id: string) => Promise<unknown>
  /**
   * «Sposta progetto» (0.42.0), dal lato di chi riceve: solo per gli altri PC
   * con la chiave di casa (dispositivo `pc`), mai per un telefono.
   */
  sposta?: { pronto: () => unknown; ricevi: (corpo: unknown) => Promise<unknown>; verifica: (sessioni: string[]) => Promise<unknown> }
  /** Le case delle chat (0.52.0, «Ospitata da»): solo fra PC della stessa cassaforte. */
  caseChat?: { leggi: () => unknown; ricevi: (corpo: unknown) => Promise<unknown> }
  /** «Salute del sistema» (0.44.0): il Drive, gli altri PC, gli errori, con spiegazioni e azioni. */
  salute?: () => Promise<unknown>
  /**
   * Il ponte del telefono (0.48.0): una rotta di un altro PC, chiesta da qui
   * con le strade fra PC e la chiave di casa. Lo stato e il corpo di quel PC,
   * o l'errore con il motivo per esteso.
   */
  ponte?: (pc: string, percorso: string, corpo?: Record<string, unknown>, dispositivo?: string) => Promise<{ stato: number; corpo: unknown; strada?: Strada }>
  /**
   * Il PIN delle chat (0.49.0). Ogni rotta che mostra o scrive dentro una
   * chat passa da qui: una chat protetta e non sbloccata da **chi guarda**
   * risponde 423 e niente contenuto; negli elenchi resta il nome senza
   * anteprime.
   */
  pin?: GuardianoPin
  /**
   * I file dal telefono (0.50.0): gli invii a pezzi, salvati nel progetto
   * della chat o dell'autopilota. Assente in un PC più vecchio: 409.
   */
  allegati?: Allegati
  /**
   * La sezione «File» del telefono e della pagina (0.54.0): i progetti di
   * questo PC, in sola lettura, solo dentro le loro cartelle. Il PIN vale:
   * un progetto con una chat protetta e chiusa per chi guarda non si apre.
   */
  fileProgetti?: FileProgetti
  /** I file dal PC al telefono (0.54.0): la coda di ogni telefono, che lui ritira a pezzi. */
  alTelefono?: AlTelefono
  /**
   * Il Quaderno personale (0.57.0): i dati riservati di Nicholas. Si gestisce
   * da questo PC e dai telefoni accoppiati a lui, mai da un altro PC né da un
   * telefono che passa dal ponte: i dati stanno solo qui.
   */
  quadernoPersonale?: QuadernoPersonale
  /** La linguetta «Istruzioni» dal telefono (0.41.0): le consegne alle sue chat, intere. */
  istruzioniAutopilota?: (id: string) => Promise<unknown[]>
  diffAutopilota?: (id: string, chiave: string, percorso: string) => Promise<string>
  /**
   * Apre una chat nuova in una cartella già conosciuta.
   *
   * Aprire non distrugge niente: nel peggiore dei casi resta un riquadro in
   * più, che si chiude al computer. È per questo che c'è, mentre chiudere no.
   */
  /** `workspace`: dove metterla (0.55.0); senza, quello che la finestra ha davanti. */
  apriChat: (cartella: string, modello?: string, workspace?: string, nome?: string) => void
  /**
   * I workspace, e **tutte** le chat che contengono.
   *
   * `chat` sono quelle dell'archivio, workspace per workspace: il telefono le
   * mostra accanto a quelle vive (`chat` qui sopra), così nel tab Chat si vede
   * tutto quello che c'è sul computer e non solo il workspace davanti.
   */
  workspace: () => Promise<{ nomi: string[]; attivo: string; chat?: ChatSalvata[] }>
  cambiaWorkspace: (nome: string) => Promise<void>
  /** Ferma o riprende un autopilota: due gesti reversibili, quindi ammessi. */
  fermaAutopilota: (id: string) => Promise<void>
  riprendiAutopilota: (id: string) => Promise<void>
  /** Il via a un autopilota che si e preparato e aspetta di essere letto. */
  vaiAutopilota: (id: string) => Promise<void>
  /**
   * Gli scrivi dal telefono: torna subito la ricevuta, la sua risposta
   * compare nel `dialogo` del dettaglio al giro dopo. Assente nei computer
   * con una versione precedente: la pagina e l'app lo dicono.
   */
  dialogaAutopilota?: (id: string, testo: string) => Promise<{ ricevuto: boolean }>
  /**
   * Affida un lavoro nuovo a un autopilota.
   *
   * È l'unica cosa che *crea* qualcosa da qui, e ci sta: delegare è il gesto
   * che ha più senso da fermi, in piedi, con una mano sola — e non distrugge
   * niente, perché l'autopilota prima di partire chiede. Le sue domande
   * arrivano su questo stesso telefono.
   */
  creaAutopilota: (
    /**
     * Gli stessi campi della finestra del PC (0.55.0), già controllati da
     * `controllaBozzaAutopilota`: nome, obiettivo, cartella, criteri,
     * pubblicazione, cloud, workspace, partenza.
     */
    richiesta: RichiestaAutopilota
  ) => Promise<{ id: string }>
  /**
   * Le azioni sui workspace e sulle chat fatte dalla finestra, con il codice
   * dei suoi tasti (0.55.0). Senza (i test vecchi, un PC senza finestre) si
   * usano le strade di prima, dove ci sono.
   */
  azioneFinestra?: (a: AzioneFinestra) => Promise<EsitoAzioneFinestra>
  /** La cartella dell'utente: un autopilota non lavora lì né in una radice di disco. */
  cartellaUtente?: () => string
  /**
   * «Installa là» dal telefono (0.56.2): questo PC aggiorna un altro PC della
   * cassaforte, come dalla Salute. `undefined` = la Salute non è ancora pronta.
   */
  installaLa?: (pcId: string) => unknown
  installaLaStato?: () => unknown[]
  /** Archiviare un autopilota fermo (0.56.0), come dal pannello del PC. */
  archiviaAutopilota?: (id: string, archivia: boolean) => Promise<void>
  /** Proteggere o no una chat con il PIN (0.56.0): `pin:proteggiChat` del PC. */
  proteggiChat?: (sessione: string, si: boolean) => void
  /** «Ospitata da» (0.56.0): `casa:scegli` del PC. `pc.id = 'qui'` = questo PC. */
  scegliOspite?: (sessioni: string[], pc: { id: string; nome: string }) => Promise<{ ok: boolean; messaggio: string }>
  /**
   * Elimina un autopilota. È la prima cosa che *disfa* qualcosa da qui.
   *
   * Prima non c'era, per la regola «un tocco sbagliato in tram non deve buttare
   * via il lavoro della notte». Ma un telefono da cui si governa tutto e da cui
   * non si può togliere niente è mezzo strumento: il muro giusto è il gesto —
   * la pagina lo chiede due volte — non l'assenza del comando.
   */
  eliminaAutopilota: (id: string) => Promise<void>
  /** Se quell'autopilota debba ripartire da solo dopo un riavvio. */
  riprendiAlRiavvio: (id: string, riprendi: boolean) => Promise<void>
  /** Chiude una chat del mosaico: la conversazione resta su disco. */
  chiudiChat: (idChat: string) => void
  /** Il nome che dai tu a una chat, che vince su quello di Claude Code. */
  rinominaChat: (idChat: string, nome: string) => void
  /**
   * Le conversazioni che si possono riprendere.
   *
   * Al computer è il tasto «Riprendi»; dal telefono non c'era, e si apriva una
   * conversazione nuova nella cartella — con tutto quello che c'era dentro
   * rimasto da un'altra parte.
   */
  sessioni: () => Promise<{ id: string; cwd: string; titolo: string; quando: string }[]>
  /**
   * La cartella di una chat e' di un altro PC (il suo battito, il registro, il
   * Drive lo dicono): il nome di quel PC. Dal telefono la chat si segna
   * «su X» e non si riapre qui: si scrive la' con la posta.
   */
  chatAltrove?: (cwd: string) => string | undefined
  /** Riapre **quella** conversazione, con la sua storia, nel workspace dove sta salvata. */
  riprendiSessione: (cwd: string, sessione: string) => void
  creaWorkspace: (nome: string) => Promise<void>
  eliminaWorkspace: (nome: string) => Promise<void>
  /**
   * I progetti sul Drive con chi li ha in mano e quanti comandi aspettano
   * nella coda condivisa: dal telefono si vede, si aggiunge, si toglie.
   */
  progetti?: () => { id: string; nome: string; chi: 'io' | 'altro' | 'libero'; pcNome?: string; inCoda: number }[]
  coda?: (progetto: string) => Promise<{ voci: VoceCodaTelefono[] } | undefined>
  codaAggiungi?: (progetto: string, testo: string, sessione?: string) => Promise<{ voci: VoceCodaTelefono[] } | undefined>
  codaTogli?: (progetto: string, voce: string) => Promise<{ voci: VoceCodaTelefono[] } | undefined>
  codaPulisci?: (progetto: string) => Promise<{ voci: VoceCodaTelefono[] } | undefined>
  /**
   * La posta per un PC: gli altri computer sul Drive (con battito, cartelle e
   * chat aperte) e la cassetta di ciascuno. Un'azione scritta qui si esegue
   * **solo su quel PC**, quando c'e'. Assenti nei computer con una versione
   * precedente.
   */
  pcIo?: () => string
  pc?: () => Promise<BattitoPcTelefono[]>
  posta?: (pc: string) => Promise<{ voci: VocePostaTelefono[] } | undefined>
  postaAggiungi?: (pc: string, voce: { cwd: string; testo: string; sessione?: string; origine?: 'umano' | 'autopilota'; daVisore?: string }) => Promise<{ voci: VocePostaTelefono[] } | undefined>
  postaTogli?: (pc: string, voce: string) => Promise<{ voci: VocePostaTelefono[] } | undefined>
  postaPulisci?: (pc: string) => Promise<{ voci: VocePostaTelefono[] } | undefined>
  /**
   * Il Drive dal telefono: il catalogo (per progetto e per workspace, con lo
   * stato rispetto al computer), «Porta qui», il lavoro in corso con la sua
   * barra, l'annulla e il riavvio. Sono le stesse cose della scheda «Drive»
   * del computer: il telefono le guarda e le comanda, il lavoro lo fa il PC.
   */
  driveCatalogo?: () => Promise<unknown>
  /** La lettura del catalogo in corso, a fasi: il telefono la chiede mentre aspetta. */
  driveCatalogoStato?: () => unknown
  drivePortaQui?: (chiave: string) => Promise<unknown>
  drivePortaQuiWorkspace?: (nome: string) => Promise<unknown>
  driveLavoro?: () => unknown
  driveAnnulla?: () => boolean
  driveRiavvia?: () => Promise<{ ok: boolean; messaggio?: string }>
  /** I salvataggi: insiemi di chat da rimettere in piedi tutti insieme. */
  salvataggi: () => Promise<{ nome: string; quando: string; chat: number }[]>
  caricaIstantanea: (nome: string) => Promise<void>
  /** Quanto si è consumato: una delle cose che si guardano più volentieri da fuori. */
  consumi: () => Promise<unknown>
  /** Le schede del quaderno di una cartella: il resoconto che l'autopilota lascia. */
  quaderno: (cwd: string) => { file: string; titolo: string; quando: string }[]
  scheda: (cwd: string, file: string) => { file: string; titolo: string; corpo: string; quando: string } | undefined
  /** Cambiare le preferenze da fuori: i colori del computer si scelgono anche da qui. */
  impostaPreferenze: (parziali: Record<string, unknown>) => Promise<void>
  /** L'aggiornamento del **computer**: a che punto è, e i due comandi. */
  /**
   * Un pezzo di cronologia di una chat: `da` righe in giù, `quante` righe.
   *
   * Serve a scorrere **tutta** la conversazione da un telefono, non solo le
   * ultime che stanno a schermo. Assente vuol dire che nessuna finestra ha
   * quella chat: si torna a quello che c’è nell’elenco invece di far
   * aspettare.
   */
  righeDi?: (idChat: string, da: number, quante: number) => Promise<unknown>
  /**
   * Lo schermo **di adesso** di una chat, vestito, chiesto alla finestra.
   *
   * L'elenco delle chat e' una foto vecchia fino a due secondi: bastava a
   * guardare, non a premere. Una scelta si controlla su questo, e si ripiega
   * sulla foto solo se nessuna finestra risponde.
   */
  schermoDi?: (idChat: string) => Promise<string[] | undefined>
  /** L'orologio, per sapere da quanto una scelta e' stata mandata. */
  adesso?: () => number
  /** La banda del Drive scollegato del computer (0.39.3), se c'e'. */
  avvisoDrive?: () => AvvisoDrive | undefined
  aggiornamento: () => { fase: string; versione?: string; percento?: number; errore?: string; tentativoFallito?: TentativoFallito }
  /**
   * Cercare un aggiornamento **adesso**.
   *
   * Il computer guarda da se' ogni sei ore, che va bene finche' non hai appena
   * pubblicato e vuoi sapere se e' arrivato. Da un telefono l'attesa e' cieca:
   * non si vede il tasto del computer e non si sa nemmeno se stia guardando.
   */
  cercaAggiornamento: () => void
  scaricaAggiornamento: () => void
  installaAggiornamento: () => void
  /**
   * Cosa cambia con l'aggiornamento pronto: le stesse note della finestra di
   * «Installa» del PC, gia' scomposte in blocchi sicuri (mai HTML). Il telefono
   * le mostra prima di chiedere la conferma.
   */
  noteAggiornamento?: () => Promise<NoteAggiornamento | undefined>
  /** Le cartelle in cui si può aprire una chat: quelle già viste da Claude Code. */
  cartelle: () => Promise<string[]>
  /**
   * Il negozio, da un telefono.
   *
   * Sul computer è un pannello a schede; qui è meno, e di proposito: si
   * **guarda** cosa c’è installato e si accende o si spegne. Installare un
   * plugin passa dal CLI di Claude Code e ci mette qualche secondo, ma resta
   * un gesto reversibile — disinstallare no dal telefono, quello si fa al
   * computer, dove vedi cosa stai togliendo.
   */
  negozio?: () => Promise<{
    /** Gli installati e i più installati (non i 3500 del catalogo: 0.53.0). */
    plugin: PluginVoce[]
    /** Quanti plugin ha il catalogo intero: il resto si trova cercando. */
    totalePlugin?: number
    skill: SkillVoce[]
    agenti: unknown[]
    mcp: McpVoce[]
    /** La cartella della chat da cui si leggono skill e MCP di progetto. */
    cartella?: string
    /** Il negozio non ha potuto rispondere. Diverso da «non c'è niente». */
    errore?: string
    /** La spiegazione di un vuoto legittimo, tipo «nessuna chat aperta». */
    nota?: string
  }>
  /** La ricerca nel catalogo intero (0.53.0). */
  cercaPlugin?: (q: string) => Promise<{ plugin: PluginVoce[]; totale: number; errore?: string }>
  /** Gli MCP con lo stato del collegamento, provato da `claude mcp list` (0.53.0). */
  saluteMcp?: () => Promise<{ mcp: McpVoce[]; errore?: string }>
  installaPlugin?: (id: string, accetta?: string) => Promise<EsitoNegozio>
  aggiornaPlugin?: (id: string, accetta?: string) => Promise<EsitoNegozio>
  commutaPlugin?: (id: string, attivo: boolean) => Promise<EsitoNegozio>
  commutaSkill?: (nome: string, attivo: boolean) => EsitoNegozio
  commutaMcp?: (nome: string, attivo: boolean) => EsitoNegozio
  approvaMcp?: (nome: string, si: boolean) => EsitoNegozio
  /**
   * Chi è entrato.
   *
   * Era in sola lettura, e il ragionamento era che entrare da un telefono
   * vuol dire scrivere una password su una tastiera che qualcuno guarda.
   * Regge per l'inizio, non per il seguito: un account in cui **non si può
   * uscire** non è prudenza, è una trappola — e chi ne ha due non ha nessun
   * modo di passare dall'uno all'altro se non alzarsi e andare al computer.
   * La prudenza vera è chiedere conferma prima di uscire, non togliere il
   * comando.
   */
  account?: () => Promise<{ email?: string; entrato: boolean }>
  /** Entra con questo account: la stessa chiamata del pannello sul computer. */
  entraAccount?: (email: string, password: string) => Promise<{ ok: boolean; messaggio?: string }>
  /** Esce. Vale per il computer, non solo per il telefono che l'ha chiesto. */
  esciAccount?: () => Promise<void>
  versione: string
  /** Il nome della macchina: serve al telefono per distinguere piu' computer. Dalla 0.52.4 è quello scelto (ripiego: l'hostname). */
  nomeComputer?: () => string
  /** Nome scelto e hostname, separati (0.52.4): l'hostname si mostra solo come sottotitolo. */
  identitaComputer?: () => { nome: string; host: string; nomeScelto?: string }
  /** Cambia il nome scelto di questo PC (0.52.4), dal telefono; vuoto = torna all'hostname. */
  impostaNomeComputer?: (nome: string) => { nome: string; host: string; nomeScelto?: string }
  /**
   * Le cartelle dentro una cartella, per scegliere dove aprire una chat nuova.
   *
   * Senza `dove` torna i punti di partenza — dischi, la cartella dell'utente,
   * i progetti noti — perche' su un telefono risalire una gerarchia dalla radice
   * e' l'unica cosa peggiore che digitare il percorso a mano.
   */
  sfoglia?: (dove: string) => Promise<{
    percorso: string
    /** La cartella che la contiene, per il tasto «su». Assente in cima. */
    su?: string
    voci: { nome: string; percorso: string }[]
    /** Siamo ai punti di partenza, non dentro una cartella vera. */
    radici?: boolean
    /** Qui dentro c'e' gia' un progetto Claude Code: si vede, e aiuta. */
    progetto?: boolean
  }>
  /** Quella cartella esiste davvero? Il solo controllo che ha senso fare qui. */
  cartellaEsiste?: (percorso: string) => Promise<boolean>
  /** Qual è l'ultimo APK dell'app, per il tasto «Scarica». */
  apk?: () => Promise<{ versione: string; url: string } | undefined>
  /**
   * Le preferenze del computer: da lì il telefono prende i suoi colori.
   *
   * Non una tavolozza scritta a mano nella pagina — che invecchierebbe da sola
   * e mostrerebbe un programma diverso da quello che hai davanti — ma la
   * stessa, con lo stesso chiarore e lo stesso stile.
   */
  preferenze?: () => Preferenze
}

const OK = (corpo: unknown): Esito => ({ stato: 200, corpo })
const TESTO = (corpo: string, tipo: string): Esito => ({ stato: 200, corpo, tipo })

/** Il testo che si può mandare a una chat: due parole, non un romanzo. */
const TESTO_MAX = 50_000
/** L'obiettivo di un autopilota dal telefono: un documento intero va bene. */
const OBIETTIVO_MAX = 200_000

function stringa(corpo: unknown, campo: string): string {
  if (typeof corpo !== 'object' || corpo === null) return ''
  const v = (corpo as Record<string, unknown>)[campo]
  return typeof v === 'string' ? v.trim() : ''
}

/** Un numero dal corpo di una richiesta, con il suo ripiego. */
function numero(corpo: unknown, campo: string, ripiego: number): number {
  if (typeof corpo !== 'object' || corpo === null) return ripiego
  const v = (corpo as Record<string, unknown>)[campo]
  return typeof v === 'number' && Number.isFinite(v) ? v : ripiego
}

/**
 * Le rotte aperte: l'ingresso.
 *
 * `/api/ciao` risponde senza chiave perché serve a capire di essere nel posto
 * giusto — è quello che il telefono chiede per primo, quando ancora non ha
 * niente. Dice il nome e la versione, e nient'altro: chi non è accoppiato non
 * deve poter sapere cosa sta girando qui dentro.
 */
export function rotteLibere(deps: DipendenzeRotte) {
  return async (r: { metodo: string; percorso: string; corpo: unknown }): Promise<Esito> => {
    // La pagina prima di tutto: è l'unica strada per arrivare al campo dove si
    // scrive il codice di accoppiamento.
    if (r.percorso === '/' || r.percorso === '/index.html') {
      return TESTO(paginaClient(), 'text/html; charset=utf-8')
    }
    if (r.percorso === '/manifest.json') {
      return TESTO(JSON.stringify(MANIFESTO), 'application/manifest+json; charset=utf-8')
    }
    if (r.percorso === '/favicon.ico') {
      // Il cristallo, come icona della scheda del browser.
      return TESTO(ICONA_SVG, 'image/svg+xml; charset=utf-8')
    }

    // Qual e' l'app da scaricare: si chiede senza chiave perche' e' la stessa
    // informazione che sta su una pagina pubblica, e serve **prima** di
    // essersi collegati - e' li' che si propone l'app.
    if (r.percorso === '/api/app') {
      const app = await deps.apk?.()
      return app === undefined ? OK({}) : OK(app)
    }

    if (r.percorso === '/api/ciao') {
      // Solo chi è: nome e versione. **Non** se la finestra di accoppiamento è
      // aperta — dirlo a chi non ha la chiave significa dire a un estraneo sulla
      // rete quando vale la pena provare a indovinare il codice. Il telefono
      // legittimo tenta l'accoppiamento e basta: è /api/accoppia a dirgli com'è
      // andata, ed è protetto dal limite sui tentativi.
      return OK({
        programma: 'SierraDeck',
        versione: deps.versione
      })
    }

    // Il bussare di un altro PC (0.39.3): dietro la chiave, quindi una
    // risposta qui vuol dire «sono proprio io, e la tua chiave e' buona».
    // Leggera: un PC la chiede a ogni indirizzo per sapere se e' acceso.
    if (r.percorso === '/api/pc') {
      const idn = deps.identitaComputer?.()
      return OK({ programma: 'SierraDeck', versione: deps.versione, nome: idn?.nome ?? deps.nomeComputer?.() ?? '', ...(idn !== undefined ? { host: idn.host } : {}) })
    }

    if (r.percorso === '/api/accoppia' && r.metodo === 'POST') {
      const codice = stringa(r.corpo, 'codice')
      const nome = stringa(r.corpo, 'nome')
      const esito = deps.dispositivi.accoppia(codice, nome === '' ? 'dispositivo' : nome)
      if (esito === undefined) {
        return { stato: 403, corpo: { errore: 'codice non valido o scaduto' } }
      }
      console.log(`[client] dispositivo accoppiato: ${nome}`)
      return OK(esito)
    }

    return { stato: 404, corpo: { errore: 'non trovato' } }
  }
}

/** Le rotte che richiedono un dispositivo riconosciuto. */
/**
 * Per quanto una scelta appena mandata resta «gia' risposta».
 *
 * Fra l'invio dei tasti e il ridisegno del terminale passano decimi di
 * secondo; fra il ridisegno e la foto che il telefono legge, fino a due
 * secondi per lato. In quel buco la stessa domanda ricompariva sul telefono
 * come se il tocco non fosse arrivato, e il secondo tocco andava a finire
 * nella domanda dopo — mentre la chat aveva gia' proseguito con la prima.
 * Otto secondi coprono il buco; se dopo la domanda e' ancora li', e' davvero
 * ancora li'.
 */
export const RISPOSTA_FRESCA_MS = 8000

/**
 * Un PC e' acceso se il suo battito sul Drive ha meno di cinque minuti. Una
 * regola sola per `/api/pc` e per l'etichetta «acceso/spento» di `/api/sessioni`.
 */
export function battitoVivo(battito: string, ora: number): boolean {
  const t = Date.parse(battito)
  return Number.isFinite(t) && ora - t < 5 * 60_000
}

/** Un pezzo dello schermo di una chat, come lo manda la finestra. */
type FinestraRighe = { totale: number; da: number; pulite: string[]; grezze: string[]; continua?: boolean[]; colonne?: number }

/** Le righe che `/api/dentro` prende dalla finestra: quanto lo schermo che il PC tiene in memoria. */
const RIGHE_DENTRO = 60

/** Le colonne e le continuazioni, solo se ci sono e tornano con le righe. */
function conLarghezza(f: FinestraRighe | undefined): { continua?: boolean[]; colonne?: number } {
  if (f === undefined) return {}
  return {
    ...(Array.isArray(f.continua) && f.continua.length === f.grezze.length ? { continua: f.continua } : {}),
    ...(typeof f.colonne === 'number' && f.colonne > 0 ? { colonne: f.colonne } : {})
  }
}

/**
 * I tasti di una risposta, a pezzi (0.52.5). Un PC senza `tastiAChat` (i test
 * vecchi) li riceve come prima: tutto tranne l'invio, poi l'invio.
 */
function mandaTasti(deps: DipendenzeRotte, chat: string, pezzi: string[]): void {
  if (deps.tastiAChat !== undefined) { deps.tastiAChat(chat, pezzi); return }
  const finale = pezzi[pezzi.length - 1] === String.fromCharCode(13)
  deps.scriviAChat(chat, (finale ? pezzi.slice(0, -1) : pezzi).join(''))
}

export function rotteClient(depsPieni: DipendenzeRotte) {
  const deps = depsPieni
  const adesso = deps.adesso ?? (() => Date.now())
  const g = deps.pin
  /** Chi guarda, per gli sblocchi: questo schermo, un altro PC (anche il ponte), un telefono. */
  const visoreDi = (dispositivo: string | undefined): string =>
    dispositivo === undefined || dispositivo === 'locale' ? 'locale' : daAltroPc(dispositivo) ? dispositivo : `tel:${dispositivo}`
  /** Le chat come le vede quel visore: le chiuse senza anteprime e senza schermo. */
  const chatPer = (visore: string): Chat[] => g === undefined ? deps.chat() : deps.chat().map((c) => {
    if (!g.protetta(c)) return c
    if (!g.chiusa(visore, c)) return { ...c, pin: 'aperta' } as Chat
    const { coda: _c, codaGrezza: _g, ...resto } = c
    return { ...oscuraChat(resto as unknown as Record<string, unknown>), coda: [], codaGrezza: [] } as unknown as Chat
  })
  /**
   * Una cartella e' conosciuta se sta nell'elenco per percorso **o per slug**:
   * lo slug e' esatto in andata, il percorso ricavato da uno slug no.
   */
  const conosciuta = (ammesse: string[], cartella: string): boolean =>
    ammesse.includes(cartella) || ammesse.some((a) => pathToSlug(a) === pathToSlug(cartella))
  // Per chat: l'ultima scelta mandata e quando. Vive quanto il server.
  const risposte = new Map<string, { firma: string; quando: number }>()
  /**
   * Quello che si e' mandato a ogni chat, dal telefono o dal PC: resta nel
   * filo della conversazione della scheda Domande (0.36.0). Gli ultimi dieci,
   * dell'ultima ora: e' memoria di conversazione, non un archivio.
   */
  const inviati = new Map<string, Inviato[]>()
  const ricordaInviato = (chat: string, testo: string): void => {
    const ora = adesso()
    const tenuti = (inviati.get(chat) ?? []).filter((i) => ora - Date.parse(i.quando) < 60 * 60_000)
    inviati.set(chat, [...tenuti, { quando: new Date(ora).toISOString(), testo: testo.slice(0, 2000) }].slice(-10))
  }
  const giaRisposta = (chat: string, s: { opzioni: { testo: string }[] } | undefined): boolean => {
    if (s === undefined) return false
    const r = risposte.get(chat)
    return r !== undefined && r.firma === firmaScelte(s) && adesso() - r.quando < RISPOSTA_FRESCA_MS
  }
  /**
   * Le scelte sullo schermo di **adesso**, chiesto alla finestra: la foto
   * dell'elenco ha fino a due secondi, e in due secondi la domanda puo' essere
   * gia' stata risposta, da qui, un attimo fa. Senza finestra, la foto.
   */
  const scelteAdesso = async (c: Chat): Promise<Scelta | undefined> => {
    const fresche = await deps.schermoDi?.(c.id).catch(() => undefined)
    return scelteDiTerminale((fresche ?? c.codaGrezza ?? c.coda ?? []).join(String.fromCharCode(10)))
  }
  /** Le scelte da mostrare: nessuna, se sono quelle appena mandate. */
  const scelteVive = (chat: string, righe: string[]): ReturnType<typeof scelteDiTerminale> => {
    const s = scelteDiTerminale(righe.join(String.fromCharCode(10)))
    return giaRisposta(chat, s) ? undefined : s
  }
  /** I file nuovi per minuto, per mittente (0.50.0). */
  const limitaAllegati = creaLimitatore()
  /** Gli id dei messaggi già consegnati (0.51.0): chi rimanda dopo una caduta non scrive due volte. */
  const memoriaInvii = creaMemoriaInvii()
  return async (r: {
    metodo: string
    percorso: string
    corpo: unknown
    dispositivo?: string
  }): Promise<Esito> => {
    const visore = visoreDi(r.dispositivo)
    /**
     * Un progetto con una chat protetta dal PIN, chiusa per chi guarda (0.54.0):
     * i suoi file non si vedono. Le chat aperte e quelle salvate nei workspace.
     */
    const progettoChiuso = async (cwd: string): Promise<ReturnType<typeof rifiutoProgettoChiuso> | undefined> => {
      if (g === undefined) return undefined
      const k = chiaveCartella(cwd)
      const aperta = depsPieni.chat().find((c) => chiaveCartella(c.cwd) === k && g.protetta(c) && g.chiusa(visore, c))
      if (aperta !== undefined) return rifiutoProgettoChiuso(aperta.titolo, aperta.id)
      const salvate: ChatSalvata[] = (await depsPieni.workspace().catch(() => undefined))?.chat ?? []
      const s = salvate.find((c) => {
        if (chiaveCartella(c.cwd) !== k) return false
        const per = { sessione: c.sessione, workspace: c.workspace }
        return g.protetta(per) && g.chiusa(visore, per)
      })
      return s === undefined ? undefined : rifiutoProgettoChiuso(s.titolo)
    }
    // ── Il PIN delle chat (0.49.0) ──
    // Una chat di un altro PC (le Domande, 0.49.1): il PIN lo controlla quel PC,
    // anche se qui il PIN non è mai stato acceso.
    const altroveDelPin = r.metodo === 'POST' && r.percorso === '/api/pin/sblocca' ? leggiIdChatAltroPc(stringa(r.corpo, 'chat')) : undefined
    if (altroveDelPin !== undefined) {
      if (depsPieni.pinAltroPc === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora aprire con il PIN le chat degli altri PC' } }
      const e = await depsPieni.pinAltroPc(altroveDelPin.pcId, altroveDelPin.sessione, stringa(r.corpo, 'pin'))
      return e.ok ? OK({ fatto: true }) : { stato: e.stato ?? 502, corpo: { errore: e.messaggio } }
    }
    if (g !== undefined) {
      if (r.metodo === 'POST' && r.percorso === '/api/pin/sblocca') {
        const c = depsPieni.chat().find((x) => x.id === stringa(r.corpo, 'chat'))
        if (c === undefined) return { stato: 404, corpo: { errore: 'questa chat non è aperta qui' } }
        const e = g.sblocca(visore, c, stringa(r.corpo, 'pin'))
        return e.ok ? OK({ fatto: true }) : { stato: e.fraMs !== undefined ? 429 : 403, corpo: { errore: e.errore, ...(e.fraMs !== undefined ? { fraMs: e.fraMs } : {}) } }
      }
      if (ROTTE_DENTRO_CHAT.has(r.percorso)) {
        const c = depsPieni.chat().find((x) => x.id === stringa(r.corpo, 'chat'))
        if (c !== undefined && g.chiusa(visore, c)) return { stato: STATO_CHIUSA, corpo: rifiutoChiusa(c.titolo) }
        if (c !== undefined && (r.percorso === '/api/scrivi' || r.percorso === '/api/scegli')) g.tocca(visore, c)
      }
    }
    // Una vista per questa richiesta: chi guarda cambia da una richiesta all'altra.
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const deps: DipendenzeRotte = g === undefined ? depsPieni : {
      ...depsPieni,
      chat: () => chatPer(visore),
      ...(depsPieni.istruzioniAutopilota !== undefined ? {
        // Le istruzioni mandate a una chat chiusa: si vede che c'è, non cosa dice.
        istruzioniAutopilota: async (id: string) => (await (depsPieni.istruzioniAutopilota as (id: string) => Promise<unknown[]>)(id)).map((i) => {
          const o = i as { chatId?: string; testo?: string }
          const c = depsPieni.chat().find((x) => x.id === o.chatId)
          return c !== undefined && g.chiusa(visore, c) ? { ...o, testo: ANTEPRIMA_NASCOSTA, pin: 'chiusa' } : i
        })
      } : {})
    }
    // ── I file dal telefono (0.50.0) ──
    // Arrivano a pezzi e si salvano nel progetto della chat o dell'autopilota.
    // Solo da chi è già passato dal muro (dispositivo accoppiato, o PC con la
    // firma di casa, anche dal ponte); il PIN della chat vale come per scrivere.
    if (r.metodo === 'POST' && r.percorso.startsWith('/api/allegati/')) {
      const al = depsPieni.allegati
      if (al === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora ricevere file: aggiornalo alla 0.50.0.' } }
      const id = stringa(r.corpo, 'id')
      /** La chat di destinazione, se è protetta e chiusa per chi manda. */
      const chiusaPerChi = (tipo: string, a: string): Chat | undefined => {
        if (tipo !== 'chat' || g === undefined) return undefined
        const c = depsPieni.chat().find((x) => x.id === a)
        return c !== undefined && g.chiusa(visore, c) ? c : undefined
      }
      if (r.percorso === '/api/allegati/inizia') {
        const corpo = (typeof r.corpo === 'object' && r.corpo !== null ? r.corpo : {}) as Record<string, unknown>
        const k = controllaAllegato({ nome: corpo.nome, byte: corpo.byte })
        if (!k.ok) return { stato: k.stato, corpo: { errore: k.errore } }
        const autopiloti = await depsPieni.autopiloti().catch(() => [] as Autopilota[])
        // «Carica» dalla sezione File (0.54.0): una cartella di un progetto, non una chat.
        const inCartella = leggiCartellaDestinazione(r.corpo)
        let sotto: string | undefined
        let d: DestinazioneDecisa | { ok: true; tipo: 'cartella'; id: string; titolo: string; cwd: string }
        if (inCartella !== undefined) {
          const fp = depsPieni.fileProgetti
          if (fp === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora ricevere file in una cartella: aggiornalo alla 0.54.0.' } }
          const chiusoP = await progettoChiuso(inCartella.progetto)
          if (chiusoP !== undefined) return { stato: STATO_CHIUSA, corpo: chiusoP }
          const ris = await fp.risolvi(inCartella.progetto, inCartella.cartella)
          if (!ris.ok) return { stato: ris.stato, corpo: { errore: ris.errore } }
          sotto = inCartella.cartella
          d = { ok: true, tipo: 'cartella', id: inCartella.progetto, titolo: inCartella.cartella === '' ? inCartella.progetto : inCartella.cartella, cwd: ris.radice }
        } else {
          d = decidiDestinazione(leggiDestinazione(r.corpo), {
            chat: depsPieni.chat(),
            autopiloti: autopiloti.map((a) => ({ id: a.id, nome: a.nome !== '' ? a.nome : a.obiettivo, cwd: a.cwd })),
            altroPc: (x) => leggiIdChatAltroPc(x) !== undefined
          })
        }
        if (!d.ok) return { stato: d.stato, corpo: { errore: d.errore } }
        const chiusa = chiusaPerChi(d.tipo, d.id)
        if (chiusa !== undefined) return { stato: STATO_CHIUSA, corpo: rifiutoChiusa(chiusa.titolo) }
        // Un invio nuovo conta per il limite; uno ripreso no.
        if (al.leggi(id) === undefined && !limitaAllegati(visore, adesso())) {
          return { stato: 429, corpo: { errore: 'Troppi file in un minuto da questo dispositivo: aspetta un momento e riprova.' } }
        }
        const sha = stringa(r.corpo, 'sha256').toLowerCase()
        const nota = notaPulita(corpo.nota)
        const e = al.inizia({
          id, chi: visore, nome: k.nome, byte: corpo.byte as number, tipo: d.tipo, a: d.id, titolo: d.titolo, cwd: d.cwd,
          ...(sotto !== undefined ? { sotto } : {}),
          ...(/^[a-f0-9]{64}$/.test(sha) ? { sha256: sha } : {}),
          ...(nota !== '' ? { nota } : {})
        })
        if (!e.ok) return { stato: e.stato, corpo: { errore: e.errore } }
        if (g !== undefined && d.tipo === 'chat') { const c = depsPieni.chat().find((x) => x.id === d.id); if (c !== undefined) g.tocca(visore, c) }
        return OK({ id, ricevuti: e.ricevuti, pezzo: PEZZO_BYTE, massimo: ALLEGATO_MAX_BYTE, nome: k.nome, byte: corpo.byte, verso: d.titolo })
      }
      if (r.percorso === '/api/allegati/pezzo') {
        const dati = (r.corpo as { dati?: unknown } | undefined)?.dati
        if (!pezzoBase64Valido(dati)) return { stato: 400, corpo: { errore: 'Pezzo del file non valido.' } }
        const e = al.pezzo(id, visore, numero(r.corpo, 'da', -1), Buffer.from(dati, 'base64'))
        return e.ok ? OK({ ricevuti: e.ricevuti }) : { stato: e.stato, corpo: { errore: e.errore, ...(e.ricevuti !== undefined ? { ricevuti: e.ricevuti } : {}) } }
      }
      if (r.percorso === '/api/allegati/stato') {
        const e = al.stato(id, visore)
        return e.ok ? OK({ ricevuti: e.ricevuti, byte: e.byte }) : { stato: e.stato, corpo: { errore: e.errore } }
      }
      if (r.percorso === '/api/allegati/annulla') {
        return OK({ fatto: al.annulla(id, visore) })
      }
      if (r.percorso === '/api/allegati/fine') {
        const inv = al.leggi(id)
        if (inv !== undefined && inv.chi === visore) {
          // Il PIN si ricontrolla alla fine: la chat può essersi richiusa mentre il file viaggiava.
          const chiusa = chiusaPerChi(inv.tipo, inv.a)
          if (chiusa !== undefined) return { stato: STATO_CHIUSA, corpo: rifiutoChiusa(chiusa.titolo) }
          if (inv.tipo === 'cartella') {
            const chiusoP = await progettoChiuso(inv.a)
            if (chiusoP !== undefined) return { stato: STATO_CHIUSA, corpo: chiusoP }
          }
        }
        const e = await al.finisci(id, visore)
        if (!e.ok) return { stato: e.stato, corpo: { errore: e.errore } }
        const { arrivato } = e
        const i = arrivato.invio
        let avvisata: 'chat' | 'autopilota' | undefined
        let avviso: string | undefined
        if (i.tipo === 'chat') {
          const c = depsPieni.chat().find((x) => x.id === i.a)
          if (c !== undefined) {
            // Una consegna di una persona («umano»): è passata dal PIN, qui sopra e all'inizio.
            const riga = rigaPerChat({ nome: arrivato.nome, percorso: arrivato.relativo, ...(i.nota !== undefined ? { nota: i.nota } : {}) })
            deps.scriviAChat(c.id, riga)
            ricordaInviato(c.id, riga)
            if (g !== undefined) g.tocca(visore, c)
            avvisata = 'chat'
          } else {
            avviso = 'La chat si è chiusa mentre il file arrivava: il file è nel progetto, ma la chat non è stata avvisata.'
          }
        } else if (i.tipo === 'cartella') {
          // Caricato in una cartella dalla sezione File: nessuno da avvisare.
        } else if (deps.dialogaAutopilota !== undefined) {
          const esito = await deps.dialogaAutopilota(i.a, rigaPerAutopilota({ nome: arrivato.nome, percorso: arrivato.assoluto, ...(i.nota !== undefined ? { nota: i.nota } : {}) })).catch(() => ({ ricevuto: false }))
          if (esito.ricevuto) avvisata = 'autopilota'
          else avviso = 'Il file è nel progetto, ma l’autopilota non ha risposto: diglielo tu nel dialogo.'
        }
        return OK({
          arrivato: true, nome: arrivato.nome, percorso: arrivato.relativo, assoluto: arrivato.assoluto, cartella: i.cwd, verso: i.titolo,
          ...(avvisata !== undefined ? { avvisata } : {}), ...(avviso !== undefined ? { avviso } : {})
        })
      }
      return { stato: 404, corpo: { errore: 'non trovato' } }
    }

    // ── La sezione «File» (0.54.0): i progetti di questo PC, in sola lettura ──
    if (r.metodo === 'POST' && r.percorso.startsWith('/api/file/')) {
      const fp = depsPieni.fileProgetti
      if (fp === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora mostrare i file dei progetti: aggiornalo alla 0.54.0.' } }
      if (r.percorso === '/api/file/progetti') {
        const tutti = nomiDistinti(await fp.progetti())
        const conPin = await Promise.all(tutti.map(async (p) => ((await progettoChiuso(p.percorso)) !== undefined ? { ...p, chiuso: true } : p)))
        return OK({ progetti: conPin })
      }
      const progetto = stringa(r.corpo, 'progetto')
      const percorso = typeof (r.corpo as { percorso?: unknown } | undefined)?.percorso === 'string' ? (r.corpo as { percorso: string }).percorso : ''
      if (progetto === '') return { stato: 400, corpo: { errore: 'Manca il progetto.' } }
      const chiusoP = await progettoChiuso(progetto)
      if (chiusoP !== undefined) return { stato: STATO_CHIUSA, corpo: chiusoP }
      if (r.percorso === '/api/file/elenco') {
        const e = await fp.elenco(progetto, percorso)
        return e.ok ? OK(e) : { stato: e.stato, corpo: { errore: e.errore } }
      }
      if (r.percorso === '/api/file/leggi') {
        const e = await fp.leggi(progetto, percorso, numero(r.corpo, 'da', 0), numero(r.corpo, 'quanti', PEZZO_BYTE))
        if (!e.ok) return { stato: e.stato, corpo: { errore: e.errore } }
        const { dati, ...resto } = e
        return OK({ ...resto, dati: dati.toString('base64'), letti: dati.length })
      }
      return { stato: 404, corpo: { errore: 'non trovato' } }
    }

    // ── Il Quaderno personale (0.57.0): solo questo schermo e i telefoni accoppiati qui ──
    if (r.metodo === 'POST' && (r.percorso === '/api/quaderno-personale' || r.percorso.startsWith('/api/quaderno-personale/'))) {
      const q = depsPieni.quadernoPersonale
      if (q === undefined) return { stato: 409, corpo: { errore: 'Questo computer non ha ancora il quaderno personale: aggiornalo alla 0.57.0.' } }
      if (!(visore === 'locale' || visore.startsWith('tel:'))) {
        return { stato: 403, corpo: { errore: 'Il quaderno personale di un PC si gestisce solo da quel PC o da un telefono accoppiato direttamente a lui: i dati non viaggiano verso gli altri PC.' } }
      }
      if (r.percorso === '/api/quaderno-personale') return OK(q.stato())
      if (r.percorso === '/api/quaderno-personale/salva') {
        const id = stringa(r.corpo, 'id')
        const nota = stringa(r.corpo, 'nota')
        const e = q.salva({ ...(id !== '' ? { id } : {}), nome: stringa(r.corpo, 'nome'), valore: stringa(r.corpo, 'valore'), ...(nota !== '' ? { nota } : {}) })
        return e.ok ? OK({ voce: e.voce, stato: q.stato() }) : { stato: 400, corpo: { errore: e.errore } }
      }
      if (r.percorso === '/api/quaderno-personale/togli') {
        return q.togli(stringa(r.corpo, 'id')) ? OK({ stato: q.stato() }) : { stato: 404, corpo: { errore: 'Questa voce non c’è più.' } }
      }
      if (r.percorso === '/api/quaderno-personale/revoca') {
        return q.revoca(stringa(r.corpo, 'sessione'), stringa(r.corpo, 'voce'))
          ? OK({ stato: q.stato() })
          : { stato: 404, corpo: { errore: 'Questo consenso non c’è più: forse è già stato revocato.' } }
      }
      return { stato: 404, corpo: { errore: 'non trovato' } }
    }

    // ── I file dal PC al telefono (0.54.0): il telefono ritira la sua coda ──
    if (r.metodo === 'POST' && (r.percorso === '/api/consegne' || r.percorso.startsWith('/api/consegne/'))) {
      const t = depsPieni.alTelefono
      if (t === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora mandare file al telefono: aggiornalo alla 0.54.0.' } }
      if (!eTelefono(visore)) return { stato: 403, corpo: { errore: 'Le consegne sono per i telefoni: un altro PC o questo schermo non ne hanno.' } }
      if (r.percorso === '/api/consegne') {
        // Un telefono che passa dal ponte si presenta: da qui in poi gli si può mandare anche da questo PC.
        const nome = stringa(r.corpo, 'nome')
        t.visto(visore, nome === '' ? undefined : nome)
        return OK({
          consegne: t.perTelefono(visore).map((c) => ({
            id: c.id, nome: c.nome, byte: c.byte, sha256: c.sha256, daPc: c.daPc, creata: c.creata, da: c.da,
            ...(c.daChat !== undefined ? { daChat: c.daChat } : {}), ...(c.nota !== undefined ? { nota: c.nota } : {}),
            ...(c.ricevuti !== undefined ? { ricevuti: c.ricevuti } : {})
          }))
        })
      }
      const id = stringa(r.corpo, 'id')
      if (!idConsegnaValido(id)) return { stato: 400, corpo: { errore: 'Id della consegna non valido.' } }
      if (r.percorso === '/api/consegne/pezzo') {
        const e = t.pezzo(id, visore, numero(r.corpo, 'da', 0))
        return e.ok ? OK({ dati: e.dati.toString('base64'), letti: e.dati.length, byte: e.byte }) : { stato: e.stato, corpo: { errore: e.errore } }
      }
      if (r.percorso === '/api/consegne/ricevuta') {
        const e = t.ricevuta(id, visore, stringa(r.corpo, 'sha256'))
        return e.ok ? OK({ fatto: true }) : { stato: e.stato, corpo: { errore: e.errore } }
      }
      return { stato: 404, corpo: { errore: 'non trovato' } }
    }

    if (r.percorso === '/api/stato') {
      // `autopilotiLetti` (0.37.0): se il servizio non risponde l'elenco arriva
      // vuoto, e il telefono lo prendeva per «nessun autopilota» — dimenticava
      // i fermi gia' annunciati e, al ritorno del servizio, li annunciava tutti
      // di nuovo. Con il segnale sa che non ha letto niente.
      let autopilotiLetti = true
      const [autopiloti, domande, workspace] = await Promise.all([
        deps.autopiloti().catch(() => { autopilotiLetti = false; return [] as Autopilota[] }),
        deps.domande().catch(() => []),
        deps.workspace().catch(() => ({ nomi: [], attivo: '' }))
      ])
      // Quante domande aspettano te, con la stessa funzione delle Domande
      // (0.37.2): il pallino del telefono e della pagina dice lo stesso numero
      // del tasto «Domande» del PC (prima contava domande + scelte, e lasciava
      // fuori gli autopiloti che aspettano il via).
      const domandeInAttesa = quanteAspettano(conversazioniDomande({
        voci: raccogliDomande({
          domande,
          autopiloti: autopiloti.map((a) => ({ id: a.id, nome: a.nome, obiettivo: a.obiettivo, stato: a.stato })),
          chat: deps.chat(),
          scelteDi: (id, righe) => scelteVive(id, righe)
        }),
        autopiloti
      }))
      return OK({
        domandeInAttesa,
        // Quanti file aspettano questo telefono (0.54.0): l'app li ritira subito.
        ...(depsPieni.alTelefono !== undefined && eTelefono(visore) ? { consegne: depsPieni.alTelefono.perTelefono(visore).length } : {}),
        // Senza la coda delle righe: l'elenco si chiede ogni due secondi, e
        // quello che si guarda dentro è una chat sola, quando la si apre.
        chat: deps.chat().map(({ coda, codaGrezza, ...resto }) => ({
          ...resto,
          // Se sullo schermo c'e' un elenco di scelte: e' il pallino della
          // scheda «Domande» del telefono, senza aprire la chat.
          // I segnali di Claude Code prima (0.45.0); lo schermo come riserva.
          chiede: resto.chiedeSegnale ?? scelteVive(resto.id, codaGrezza ?? coda ?? []) !== undefined
        })),
        // I progetti sul Drive: chi li ha in mano e quanti comandi aspettano.
        progetti: deps.progetti?.() ?? [],
        // Solo quello che serve a una piastrella: mandare tutto lo stato di un
        // autopilota su una rete di casa, ogni due secondi, sarebbe spedire un
        // libro per leggerne il titolo.
        autopiloti: autopiloti.map((a) => ({
          id: a.id,
          nome: a.nome !== '' ? a.nome : a.obiettivo,
          stato: a.stato,
          // Il colore del suo LED, deciso dalla **stessa** funzione della
          // console. Il telefono ne aveva una sua, scritta a mano, e sbagliava
          // dove conta: fallito e finito avevano lo stesso puntino grigio.
          led: ledDi(a).classe,
          cicli: a.cicli,
          strategia: a.strategia,
          // Perche' si e' fermato. «Sospeso» da solo manda a cercare altrove:
          // la parte utile e' sempre stata il motivo, e dal telefono non
          // arrivava.
          motivo: a.motivoSospensione,
          // La chiave di **questo** fermo (id, momento, motivo): telefono e
          // pagina annunciano un fermo una volta sola, e quello nuovo si'.
          ...(eFermo(a) ? { fermo: chiaveFermo(a) } : {}),
          // Messo da parte con «Archivia»: niente notifiche.
          ...(a.archiviato === true ? { archiviato: true } : {}),
          // Dove lavora: serve al Quaderno, che e' quello che **lui** produce.
          // Dal telefono si leggeva la cartella della prima chat dell'elenco,
          // che con piu' progetti aperti e' semplicemente un'altra cosa.
          cwd: a.cwd,
          fatti: a.criteri.filter((c) => c.soddisfatto).length,
          criteri: a.criteri.length
        })),
        autopilotiLetti,
        domande,
        workspace,
        // **Anche l'aggiornamento**, che costa niente: e' gia' in memoria. Senza
        // di lui il telefono non puo' accorgersi che il computer si sta per
        // chiudere, e un'installazione avviata dallo schermo del computer, vista
        // da fuori, e' indistinguibile da un cavo staccato.
        aggiornamento: deps.aggiornamento(),
        // Il Drive del computer scollegato (0.39.3): la stessa banda del PC.
        ...(deps.avvisoDrive?.() !== undefined ? { driveScollegato: deps.avvisoDrive?.() } : {}),
        // Come si chiama questo computer.
        //
        // Serve a chi ne ha piu' di uno: un elenco di indirizzi IP non si legge,
        // e «lo studio» invece si. Sta **qui** e non in `/api/ciao`, che si puo'
        // chiamare senza chiave: il nome di una macchina non si regala a
        // chiunque sia sulla rete, si dice a chi si e' gia' presentato.
        // Dalla 0.43.0 anche la versione: l'app spegne (e spiega) le
        // funzioni che questo computer non ha ancora. Un campo in piu':
        // le app vecchie lo ignorano.
        // Dalla 0.52.4 `nome` è quello scelto da chi usa il PC (ripiego:
        // l'hostname), `host` il nome tecnico, `nomeScelto` solo se c'è.
        computer: (() => {
          const idn = deps.identitaComputer?.()
          return {
            nome: idn?.nome ?? deps.nomeComputer?.() ?? '',
            ...(idn !== undefined ? { host: idn.host } : {}),
            ...(idn?.nomeScelto !== undefined ? { nomeScelto: idn.nomeScelto } : {}),
            versione: deps.versione
          }
        })()
      })
    }

    /**
     * Tutto quello che aspetta una risposta, in un elenco solo: le domande
     * degli autopiloti (l'intervista prima di partire, una decisione mentre
     * lavora), le chat che aspettano una scelta, le chat che hanno finito e
     * aspettano te. E' la scheda «Domande» del telefono, che prima non c'era:
     * le domande stavano in tre posti diversi, una alla volta, e una finestra
     * bloccava il resto. Le risposte passano dalle rotte di sempre:
     * `/api/rispondi`, `/api/scegli`, `/api/scrivi`.
     */
    if (r.percorso === '/api/domande') {
      const [autopiloti, domande, battiti] = await Promise.all([
        deps.autopiloti().catch(() => [] as Autopilota[]),
        deps.domande().catch(() => []),
        deps.pc?.().catch(() => [] as BattitoPcTelefono[]) ?? Promise.resolve([] as BattitoPcTelefono[])
      ])
      // Le chat degli altri PC accesi che aspettano (0.37.2), dal loro battito.
      const io = deps.pcIo?.()
      const ora = adesso()
      const voci = raccogliDomande({
        domande,
        autopiloti: autopiloti.map((a) => ({ id: a.id, nome: a.nome, obiettivo: a.obiettivo, stato: a.stato })),
        chat: deps.chat(),
        scelteDi: (id, righe) => scelteVive(id, righe),
        ...(deps.scriviAltroPc !== undefined
          ? { altriPc: battiti.filter((b) => b.pcId !== io).map((b) => {
            const strada = deps.stradaPc?.(b.pcId)
            return { pcId: b.pcId, nome: nomeDaMostrare(b), vivo: battitoVivo(b.battito, ora), chat: b.chat, ...(strada !== undefined ? { strada } : {}) }
          }) }
          : {})
      })
      // Le stesse voci come conversazioni a messaggi (0.36.0): e' quello che
      // disegnano il PC, la pagina e l'app. `voci` resta per le app vecchie.
      const conversazioni = conversazioniDomande({ voci, autopiloti, inviati: Object.fromEntries(inviati) })
      // Il numero sul tasto «Domande», uguale ovunque (0.37.2).
      // `voci` resta per le app vecchie (prima della 0.36.0 delle conversazioni),
      // e le app leggono `opzioni` come oggetti {numero, testo, scelta}: le
      // risposte da toccare di un autopilota erano stringhe, e un'app che le
      // incontrava non leggeva piu' niente delle Domande (trovato dal test di
      // compatibilita', 0.43.0; dalla 0.41.0 ogni domanda ha le sue scelte).
      return OK({ voci: vociPerLeApp(voci), conversazioni, chiedono: quanteAspettano(conversazioni) })
    }

    // Il ponte del telefono (0.48.0): le chat degli altri PC dal vivo,
    // passando da qui. Solo un telefono accoppiato (un altro PC no: niente
    // catene) e solo le rotte che il PC usa dal suo riquadro remoto.
    if (r.percorso === '/api/ponte' && r.metodo === 'POST') {
      if (daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: 'Il ponte è solo per il telefono: un altro PC bussa direttamente.' } }
      if (deps.ponte === undefined) return { stato: 409, corpo: { errore: 'Questo computer non fa ancora da ponte verso gli altri PC.' } }
      const l = leggiRichiestaPonte(r.corpo)
      if (!l.ok) return { stato: l.stato, corpo: { errore: l.errore } }
      const partito = Date.now()
      const e = await deps.ponte(l.r.pc, l.r.percorso, l.r.corpo, r.dispositivo)
      // La strada fra questo PC e quello, e quanto ci ha messo (0.51.0): il
      // telefono la mostra accanto a «SU <PC>». Un campo in più: le app
      // vecchie lo ignorano.
      const corpo = (e.corpo ?? {}) as object
      const ponte = { ...(e.strada !== undefined ? { strada: e.strada } : {}), ritardoMs: Date.now() - partito }
      return { stato: e.stato, corpo: Array.isArray(corpo) ? corpo : { ...corpo, ponte } }
    }

    // «Salute del sistema» (0.44.0), dietro la chiave: dice com'e' messo il PC.
    if (r.percorso === '/api/salute' && deps.salute !== undefined) {
      return OK((await deps.salute()) as object)
    }

    // I colori del computer, per vestire la pagina con la stessa grafica.
    if (r.percorso === '/api/stile') {
      const p = deps.preferenze?.() ?? PREFERENZE_PREDEFINITE
      return OK({ token: tavolozza(p), stile: p.stile })
    }

    // Tutto di un autopilota, come lo vede il pannello del computer: dove si
    // trova nel suo percorso, quanto manca, i criteri che si e' dato e cosa ha
    // deciso. L'elenco ne manda un riassunto perche' viaggia ogni due secondi;
    // questo si chiede quando se ne apre uno.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota') {
      const id = stringa(r.corpo, 'autopilota')
      const tutti = await deps.autopiloti().catch(() => [] as Autopilota[])
      const a = tutti.find((x) => x.id === id)
      if (a === undefined) return { stato: 404, corpo: { errore: 'autopilota inesistente' } }
      // La domanda aperta, se c'e': la pagina e l'app rispondono da li',
      // dalla stessa casella con cui gli parlano.
      const tutteLeDomande = await deps.domande().catch(() => [])
      const mia = tutteLeDomande.find((d) => d.autopilotaId === id)
      return OK({
        ...a,
        // Calcolati qui e non nella pagina: sono le stesse funzioni che
        // disegnano il pannello al computer, e due copie divergerebbero.
        passaggi: passaggi(a),
        misura: misuraPasso(a),
        // La chat con lui (0.29.0): la stessa che sta in cima alla sezione sul
        // PC, composta una volta sola per tutti e tre.
        chat: conversazione(a),
        domanda: haDomandaAperta(a),
        pensa: staPensando(a),
        // T7 (0.36.0): il coordinatore e le sue sotto-chat, con ramo e stato.
        albero: alberoChat(a),
        // La linguetta «Domande» (0.38.0): le sue domande una per volta, con la
        // stessa funzione del PC (preparazione, lavoro, «Pubblico adesso?», via).
        domandeScheda: domandeScheda(a, tutteLeDomande),
        ...(mia !== undefined ? { domandaId: mia.id } : {})
      })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/rispondi') {
      const id = stringa(r.corpo, 'domanda')
      const risposta = stringa(r.corpo, 'risposta')
      if (id === '' || risposta === '') {
        return { stato: 400, corpo: { errore: 'servono la domanda e la risposta' } }
      }
      await deps.rispondi(id, risposta.slice(0, TESTO_MAX))
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/scrivi') {
      const chat = stringa(r.corpo, 'chat')
      const testo = stringa(r.corpo, 'testo')
      if (chat === '' || testo === '') return { stato: 400, corpo: { errore: 'servono chat e testo' } }
      // L'id del messaggio (0.51.0): se è già arrivato, si conferma senza riscriverlo.
      const idM = stringa(r.corpo, 'idMessaggio')
      const conId = idMessaggioValido(idM)
      if (conId && memoriaInvii.gia(chat, idM, adesso())) return OK({ fatto: true, doppio: true })
      // Una chat di un altro PC (dalle Domande, 0.37.2): il testo va la'.
      const altrove = leggiIdChatAltroPc(chat)
      if (altrove !== undefined) {
        if (deps.scriviAltroPc === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa scrivere alle chat degli altri PC' } }
        const esito = await deps.scriviAltroPc(altrove.pcId, altrove.sessione, testo.slice(0, TESTO_MAX)).catch((e: unknown) => ({ ok: false as const, messaggio: String(e) }))
        // 423 (0.49.1): la chat là è protetta dal PIN e chiusa per questo PC.
        if (!esito.ok) return { stato: (esito as { pin?: boolean }).pin === true ? STATO_CHIUSA : 502, corpo: { errore: esito.messaggio, ...((esito as { pin?: boolean }).pin === true ? { pin: 'chiusa' } : {}) } }
        ricordaInviato(chat, testo)
        if (conId) memoriaInvii.segna(chat, idM, adesso())
        return OK({ fatto: true })
      }
      // La chat è ferma su una scelta (0.52.5): il testo non si scrive nel
      // selettore, dove Invio sceglieva la prima opzione. Si legge come
      // un'opzione, la risposta libera o niente (`rispostaDaTesto`).
      const trovata = deps.chat().find((c) => c.id === chat)
      if (trovata !== undefined) {
        const s = await scelteAdesso(trovata)
        if (s !== undefined) {
          const r = rispostaDaTesto(s, testo)
          if ('errore' in r) return { stato: 409, corpo: { errore: r.errore, scelte: s } }
          const k = tastiPerRisposta(s, r)
          if ('errore' in k) return { stato: 409, corpo: { errore: k.errore, scelte: s } }
          mandaTasti(deps, chat, k.pezzi)
          risposte.set(chat, { firma: firmaScelte(s), quando: adesso() })
          ricordaInviato(chat, r.tipo === 'opzione' ? `scelto: ${r.testo}` : testo)
          if (conId) memoriaInvii.segna(chat, idM, adesso())
          return OK({ fatto: true, comeScelta: r.tipo === 'opzione' ? r.testo : 'risposta libera' })
        }
      }
      deps.scriviAChat(chat, testo.slice(0, TESTO_MAX))
      ricordaInviato(chat, testo)
      if (conId) memoriaInvii.segna(chat, idM, adesso())
      return OK({ fatto: true })
    }

    /**
     * Rispondere a un riquadro di scelta, dal telefono.
     *
     * Non arriva un numero di riga ma **il testo dell'opzione toccata**, e qui
     * si ricontrolla che quel testo sia ancora dov'era. E' l'unica cosa che
     * rende sicuro premere un pulsante da lontano: fra il momento in cui la
     * pagina ha letto lo schermo e il momento del tocco possono passare
     * secondi, e in quei secondi il terminale puo' aver cambiato domanda. Contare
     * le frecce sulla vecchia posizione vorrebbe dire premere invio su
     * un'opzione che nessuno ha scelto — e una di quelle opzioni, quasi sempre,
     * concede un permesso.
     *
     * Se non torna, non si tira a indovinare: si dice che e' cambiata e si
     * rimanda a guardare.
     */
    if (r.metodo === 'POST' && r.percorso === '/api/scegli') {
      const id = stringa(r.corpo, 'chat')
      const voluta = stringa(r.corpo, 'opzione')
      // La chat di un altro PC (0.52.6): la scelta va là, dove si ricontrolla sullo schermo vero.
      const altrove = leggiIdChatAltroPc(id)
      if (altrove !== undefined) {
        if (deps.scegliAltroPc === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa scegliere nelle chat degli altri PC' } }
        const libera = stringa(r.corpo, 'testo')
        const e = await deps.scegliAltroPc(altrove.pcId, altrove.sessione, voluta, libera !== '' ? libera : undefined)
          .catch((x: unknown) => ({ ok: false as const, messaggio: String(x) }))
        if (!e.ok) {
          const st = (e as { stato?: number }).stato
          if ((e as { pin?: boolean }).pin === true) return { stato: STATO_CHIUSA, corpo: { errore: e.messaggio, pin: 'chiusa' } }
          return { stato: st === 409 || st === 404 ? st : 502, corpo: { errore: e.messaggio } }
        }
        ricordaInviato(id, `scelto: ${voluta}`)
        return OK({ fatto: true })
      }
      const trovata = deps.chat().find((c) => c.id === id)
      if (trovata === undefined) return { stato: 404, corpo: { errore: 'chat non trovata' } }
      // Sullo schermo di **adesso**, chiesto alla finestra: la foto dell'elenco
      // ha fino a due secondi, e in due secondi la domanda puo' essere gia'
      // stata risposta — da qui, un attimo fa.
      const scelte = await scelteAdesso(trovata)
      const dove = scelte?.opzioni.findIndex((o) => o.testo === voluta) ?? -1
      if (scelte === undefined || dove < 0) {
        return { stato: 409, corpo: { errore: 'la scelta e cambiata: guarda di nuovo' } }
      }
      // La stessa domanda, mandata un attimo fa: il terminale non si e' ancora
      // ridisegnato. Un secondo invio finirebbe nella domanda dopo.
      if (giaRisposta(id, scelte)) {
        return { stato: 409, corpo: { errore: 'gia mandata: aspetta che lo schermo cambi' } }
      }
      // «Type something.» con il testo (0.52.5): la risposta libera.
      const libera = stringa(r.corpo, 'testo')
      const k = tastiPerRisposta(scelte, scelte.opzioni[dove]?.libera === true && libera.trim() !== '' ? { tipo: 'libera', testo: libera } : { tipo: 'opzione', testo: voluta })
      if ('errore' in k) return { stato: 409, corpo: { errore: k.errore } }
      mandaTasti(deps, id, k.pezzi)
      risposte.set(id, { firma: firmaScelte(scelte), quando: adesso() })
      ricordaInviato(id, scelte.opzioni[dove]?.libera === true ? libera : `scelto: ${voluta}`)
      return OK({ fatto: true })
    }

    // Guardare dentro una chat: le ultime righe del suo terminale. È la
    // differenza fra sapere che «si muove» e sapere **cosa** sta facendo —
    // l'unica cosa che da fuori permette di decidere se serve intervenire.
    if (r.metodo === 'POST' && r.percorso === '/api/dentro') {
      const id = stringa(r.corpo, 'chat')
      const trovata = deps.chat().find((c) => c.id === id)
      if (trovata === undefined) return { stato: 404, corpo: { errore: 'chat non trovata' } }
      // Lo schermo di adesso dalla finestra (0.52.6), con le colonne e le
      // continuazioni per ricomporre il testo; la foto se nessuna risponde.
      const vivo = (await deps.righeDi?.(id, -1, RIGHE_DENTRO).catch(() => undefined)) as FinestraRighe | undefined
      return OK({
        chat: trovata.id,
        titolo: trovata.titolo,
        righe: vivo?.pulite ?? trovata.coda ?? [],
        // Le righe vestite. Restano anche quelle ripulite: una versione vecchia
        // dell'app Android legge quelle, e non deve trovarsi lo schermo vuoto.
        grezze: vivo?.grezze ?? trovata.codaGrezza ?? [],
        ...conLarghezza(vivo),
        // Le scelte che il terminale sta aspettando, se ne sta aspettando.
        //
        // Si leggono qui e non sul telefono perche' qui si possono provare, e
        // perche' un telefono con una versione vecchia della pagina non deve
        // dover imparare a riconoscere un riquadro di scelta: se questo campo
        // non gli arriva, per lui semplicemente non c'e' niente da toccare —
        // com'era prima.
        scelte: scelteVive(id, trovata.codaGrezza ?? trovata.coda ?? [])
      })
    }

    // La cronologia di una chat, a finestre.
    //
    // `/api/dentro` da’ lo schermo di adesso, che è quello che serve entrando.
    // Questa da’ **qualunque** pezzo, e con esso il totale: è ciò che permette
    // di risalire una conversazione dal telefono invece di vederne la coda.
    if (r.metodo === 'POST' && r.percorso === '/api/storia') {
      const id = stringa(r.corpo, 'chat')
      const trovata = deps.chat().find((c) => c.id === id)
      if (trovata === undefined) return { stato: 404, corpo: { errore: 'chat non trovata' } }
      // Quello che l'elenco ha gia': e' il ripiego se nessuna finestra
      // risponde — una chat appena chiusa, una finestra che sta partendo — ed
      // e' meglio di un errore per una cosa che si guarda scorrendo.
      const pulite = trovata?.coda ?? []
      const vestite = trovata?.codaGrezza ?? []
      const da = numero(r.corpo, 'da', -1)
      const quante = Math.max(1, Math.min(numero(r.corpo, 'quante', 120), 400))
      const finestra = (await deps.righeDi?.(id, da, quante)) as FinestraRighe | undefined
      return OK({
        chat: id,
        totale: finestra?.totale ?? vestite.length,
        da: finestra?.da ?? 0,
        righe: finestra?.pulite ?? pulite,
        grezze: finestra?.grezze ?? vestite,
        // Per ricomporre il testo sul telefono (0.52.6): le continuazioni di
        // xterm e le colonne del terminale di qui. Senza (foto), non si unisce niente.
        ...conLarghezza(finestra),
        // Le scelte si leggono **sempre dallo schermo di adesso**, mai dalla
        // finestra chiesta: chi ha risalito la conversazione sta guardando roba
        // vecchia, e i pulsanti devono restare quelli della domanda viva. Sono
        // qui e non solo in `/api/dentro` perche' l'app del telefono legge da
        // questa: e' nativa, non una pagina, e senza questo campo li' i pulsanti
        // non compaiono.
        scelte: scelteVive(id, vestite)
      })
    }

    // Le cartelle in cui si può aprire: si chiedono solo quando servono, non
    // ogni due secondi come lo stato — è una lettura del disco.
    if (r.percorso === '/api/cartelle') {
      return OK({ cartelle: await deps.cartelle().catch(() => [] as string[]) })
    }

    /**
     * Sfogliare il disco per trovare una cartella nuova.
     *
     * Serviva perche' dal telefono si potevano aprire chat **solo** nelle
     * cartelle gia' conosciute: un progetto nuovo, o uno vecchio mai aperto da
     * qui, non c'era modo di sceglierlo. E digitare a mano un percorso di
     * Windows su una tastiera del telefono non e' una risposta.
     *
     * Senza `percorso` torna i punti di partenza: i dischi, la cartella
     * dell'utente, e i progetti gia' noti — quelli si raggiungono con un tocco
     * invece di risalire una gerarchia.
     */
    if (r.metodo === 'POST' && r.percorso === '/api/sfoglia') {
      const dove = stringa(r.corpo, 'percorso')
      const esito = await deps.sfoglia?.(dove).catch(() => undefined)
      return OK(esito ?? { percorso: '', voci: [], radici: true })
    }

    /**
     * Aprire una chat nuova.
     *
     * La cartella doveva essere una di quelle **gia' conosciute**, e la
     * motivazione era che un percorso qualunque arrivato dalla rete aprirebbe
     * una sessione dove capita. A guardarla bene non reggeva: chi ha la chiave
     * di questo computer puo' gia' **scrivere in una chat**, cioe' far eseguire
     * qualunque comando in qualunque cartella. L'elenco chiuso non era un muro,
     * era un impaccio — e impediva la cosa piu' normale del mondo, aprire un
     * progetto nuovo.
     *
     * Il muro vero resta dov'e' sempre stato: l'accoppiamento. Qui si controlla
     * quello che si puo' controllare davvero — che la cartella **esista** e sia
     * una cartella, cosi' un errore di battitura non crea una chat nel vuoto.
     */
    if (r.metodo === 'POST' && r.percorso === '/api/apri') {
      const cartella = stringa(r.corpo, 'cartella')
      if (cartella === '') return { stato: 400, corpo: { errore: 'serve la cartella' } }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      const esiste = ammesse.includes(cartella) || (await deps.cartellaEsiste?.(cartella).catch(() => false)) === true
      if (!esiste) {
        return { stato: 404, corpo: { errore: 'cartella inesistente' } }
      }
      const modello = stringa(r.corpo, 'modello')
      // Il modello (0.56.0): solo uno dell'elenco del PC.
      if (modello !== '' && !MODELLI.some((m) => m.valore === modello)) return { stato: 400, corpo: { errore: `«${modello}» non è un modello che il computer conosce: sceglilo dall'elenco.` } }
      const nomeChat = stringa(r.corpo, 'nome').trim().slice(0, 80)
      // Il workspace (0.55.0): solo uno che c'è. Un nome sbagliato non deve
      // creare un workspace di nascosto.
      const ws = stringa(r.corpo, 'workspace')
      if (ws !== '') {
        const nomi = (await deps.workspace().catch(() => undefined))?.nomi ?? []
        if (!nomi.includes(ws)) return { stato: 404, corpo: { errore: `il workspace «${ws}» non c'è su questo computer: crealo prima, o scegline uno dell'elenco` } }
      }
      deps.apriChat(cartella, modello === '' ? undefined : modello, ws === '' ? undefined : ws, nomeChat === '' ? undefined : nomeChat)
      return OK({ fatto: true })
    }

    // Fermare e riprendere sono reversibili: un tocco sbagliato costa un
    // secondo tocco, non il lavoro della notte. Per questo ci sono, mentre
    // chiudere ed eliminare no.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/ferma') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.fermaAutopilota(id)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/riprendi') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.riprendiAutopilota(id)
      return OK({ fatto: true })
    }

    // Il via a chi si è preparato. Sta qui perché è dal telefono che si scopre
    // di averlo pronto: l'avviso arriva mentre si è altrove, e senza questo
    // tasto il lavoro resterebbe fermo fino al ritorno alla scrivania.
    // La linguetta «File» (0.38.0): i file che l'autopilota ha cambiato, per
    // chat, e il diff di uno. Solo lettura, come sul PC.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/file') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      if (deps.fileAutopilota === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora mostrare i file: aggiornalo' } }
      try { return OK({ gruppi: await deps.fileAutopilota(id) }) } catch (e) { return { stato: 404, corpo: { errore: e instanceof Error ? e.message : String(e) } } }
    }
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/istruzioni') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      if (deps.istruzioniAutopilota === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora mostrare le istruzioni: aggiornalo' } }
      try { return OK({ istruzioni: await deps.istruzioniAutopilota(id) }) } catch (e) { return { stato: 502, corpo: { errore: e instanceof Error ? e.message : String(e) } } }
    }
    // «Correggi» su un'istruzione (0.41.0): la nota va nel dialogo, legata a quell'istruzione.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/correggi') {
      const id = stringa(r.corpo, 'autopilota')
      const quale = stringa(r.corpo, 'istruzione')
      const nota = stringa(r.corpo, 'nota')
      if (id === '' || quale === '' || nota.trim() === '') return { stato: 400, corpo: { errore: 'servono l autopilota, l istruzione e la nota' } }
      if (deps.istruzioniAutopilota === undefined || deps.dialogaAutopilota === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora correggere le istruzioni: aggiornalo' } }
      const tutte = leggiIstruzioni(await deps.istruzioniAutopilota(id))
      const i = tutte.find((x) => x.id === quale)
      if (i === undefined) return { stato: 404, corpo: { errore: 'istruzione non trovata' } }
      const esito = await deps.dialogaAutopilota(id, notaCorreggi(i, nota.slice(0, TESTO_MAX)))
      return OK({ fatto: esito.ricevuto })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/diff') {
      const id = stringa(r.corpo, 'autopilota')
      const chiave = stringa(r.corpo, 'chat')
      const percorso = stringa(r.corpo, 'percorso')
      if (id === '' || chiave === '' || percorso === '') return { stato: 400, corpo: { errore: 'servono autopilota, chat e percorso' } }
      if (deps.diffAutopilota === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora mostrare i file: aggiornalo' } }
      try { return OK({ diff: await deps.diffAutopilota(id, chiave, percorso) }) } catch (e) { return { stato: 404, corpo: { errore: e instanceof Error ? e.message : String(e) } } }
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/vai') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.vaiAutopilota(id)
      return OK({ fatto: true })
    }

    // Parlargli. La ricevuta torna subito; la risposta arriva nel dettaglio
    // (`/api/autopilota`), che il telefono rilegge ogni due secondi: nessuna
    // chiamata HTTP lunga quanto un pensiero del supervisore.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/dialogo') {
      const id = stringa(r.corpo, 'autopilota')
      const testo = stringa(r.corpo, 'testo')
      if (id === '' || testo === '') return { stato: 400, corpo: { errore: 'servono l autopilota e il testo' } }
      if (deps.dialogaAutopilota === undefined) {
        return { stato: 409, corpo: { errore: 'questo computer non sa ancora dialogare con gli autopiloti: aggiornalo' } }
      }
      const esito = await deps.dialogaAutopilota(id, testo.slice(0, TESTO_MAX))
      return OK({ fatto: esito.ricevuto })
    }

    // Affidare un lavoro. La cartella passa dallo stesso muro di «apri»: un
    // percorso qualunque arrivato dalla rete manderebbe un agente a lavorare
    // dove capita, e con un autopilota nessuno se ne accorgerebbe per ore.
    // Dalla 0.55.0 con gli stessi campi e la stessa validazione della finestra
    // del PC (`controllaBozzaAutopilota`). La cartella non deve più essere
    // fra quelle già viste da Claude Code — dal PC si sceglie «Altra
    // cartella…», e dal telefono ora si sfoglia — ma deve esistere, e non può
    // essere la radice di un disco né la cartella dell'utente: lì un agente
    // autonomo non deve lavorare.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/crea') {
      const controllo = controllaBozzaAutopilota(bozzaDaCorpo(r.corpo))
      if (!controllo.ok) return { stato: 400, corpo: { errore: controllo.errore, campo: controllo.campo } }
      const richiesta = controllo.richiesta
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      const casa = deps.cartellaUtente?.() ?? ''
      if (!conosciuta(ammesse, richiesta.cwd) && !radiceAmmessa(richiesta.cwd, casa)) {
        return { stato: 403, corpo: { errore: 'Un autopilota non lavora nella radice di un disco né nella cartella dell’utente: lì ci sono i file di tutto il computer. Scegli la cartella del progetto.', campo: 'cwd' } }
      }
      // E deve esistere: un autopilota in una cartella che non c'e' si scopre
      // ore dopo, quando il supervisore non parte.
      if (deps.cartellaEsiste !== undefined && !(await deps.cartellaEsiste(richiesta.cwd).catch(() => false))) {
        return { stato: 404, corpo: { errore: `La cartella ${richiesta.cwd} non c’è su questo computer: scegline una dall’elenco o sfogliando.`, campo: 'cwd' } }
      }
      if (richiesta.workspace !== undefined) {
        const nomi = (await deps.workspace().catch(() => undefined))?.nomi ?? []
        if (nomi.length > 0 && !nomi.includes(richiesta.workspace)) {
          return { stato: 404, corpo: { errore: `Il workspace «${richiesta.workspace}» non c’è su questo computer: scegline uno dell’elenco.`, campo: 'workspace' } }
        }
      }
      const creato = await deps.creaAutopilota({ ...richiesta, obiettivo: richiesta.obiettivo.slice(0, OBIETTIVO_MAX) })
      return OK({ fatto: true, autopilota: creato.id })
    }

    // Il negozio: cosa c'è, e cosa è acceso.
    if (r.percorso === '/api/negozio') {
      const dati = await deps.negozio?.().catch(() => undefined)
      return OK(dati ?? { plugin: [], skill: [], agenti: [], mcp: [] })
    }

    // La ricerca nel catalogo: il telefono non riceve piu' 3500 plugin.
    if (r.metodo === 'POST' && r.percorso === '/api/negozio/cerca') {
      if (deps.cercaPlugin === undefined) return { stato: 404, corpo: { errore: 'questo computer non sa ancora cercare nel catalogo' } }
      const trovati = await deps.cercaPlugin(stringa(r.corpo, 'q').slice(0, 100)).catch((e: unknown) => ({ plugin: [], totale: 0, errore: String(e) }))
      return OK(trovati)
    }

    // Lo stato del collegamento degli MCP: qualche secondo, a parte.
    if (r.percorso === '/api/negozio/salute-mcp') {
      if (deps.saluteMcp === undefined) return { stato: 404, corpo: { errore: 'questo computer non sa ancora provare gli MCP' } }
      return OK(await deps.saluteMcp().catch((e: unknown) => ({ mcp: [], errore: String(e) })))
    }

    // Installare e aggiornare. `accetta` e' l'impronta del comando del
    // marketplace che la persona ha letto e confermato sul telefono.
    if (r.metodo === 'POST' && (r.percorso === '/api/negozio/installa' || r.percorso === '/api/negozio/aggiorna')) {
      const id = stringa(r.corpo, 'id')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l id' } }
      const accetta = stringa(r.corpo, 'accetta')
      const fai = r.percorso === '/api/negozio/installa' ? deps.installaPlugin : deps.aggiornaPlugin
      if (fai === undefined) return OK({ ok: false, messaggio: 'questo computer non sa farlo da qui: va aggiornato' })
      const esito = await fai(id, accetta === '' ? undefined : accetta).catch((e: unknown) => ({ ok: false, messaggio: String(e) }))
      return OK(esito)
    }

    // Accendere e spegnere: tre cose diverse dietro lo stesso gesto, e da qui
    // si distinguono solo per il «cosa».
    if (r.metodo === 'POST' && r.percorso === '/api/negozio/commuta') {
      const cosa = stringa(r.corpo, 'cosa')
      const nome = stringa(r.corpo, 'nome')
      const corpo = r.corpo as Record<string, unknown> | undefined
      const attivo = corpo?.attivo === true
      if (nome === '') return { stato: 400, corpo: { errore: 'serve il nome' } }
      const esito =
        cosa === 'plugin' ? await deps.commutaPlugin?.(nome, attivo)
        : cosa === 'skill' ? deps.commutaSkill?.(nome, attivo)
        : cosa === 'mcp' ? deps.commutaMcp?.(nome, attivo)
        : cosa === 'mcp-approva' ? deps.approvaMcp?.(nome, attivo)
        : undefined
      return OK(esito ?? { ok: false, messaggio: 'non so accendere questa cosa' })
    }

    if (r.percorso === '/api/account') {
      const chi = await deps.account?.().catch(() => undefined)
      return OK(chi ?? { entrato: false })
    }

    // Entrare da lontano. Cambiare account è questo più «esci» prima: non
    // serve un comando a parte, e uno in meno è uno in meno che può sbagliare.
    if (r.metodo === 'POST' && r.percorso === '/api/account/entra') {
      if (deps.entraAccount === undefined) {
        return { stato: 501, corpo: { errore: 'questo computer non sa ancora entrare da fuori' } }
      }
      const email = stringa(r.corpo, 'email')
      const password = stringa(r.corpo, 'password')
      if (email === '' || password === '') {
        return { stato: 400, corpo: { errore: 'servono email e password' } }
      }
      const esito = await deps.entraAccount(email, password).catch((err: unknown) => ({
        ok: false,
        messaggio: String(err)
      }))
      return OK(esito)
    }

    if (r.metodo === 'POST' && r.percorso === '/api/account/esci') {
      if (deps.esciAccount === undefined) {
        return { stato: 501, corpo: { errore: 'questo computer non sa ancora uscire da fuori' } }
      }
      await deps.esciAccount().catch(() => undefined)
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/consumi') {
      return OK(await deps.consumi().catch(() => ({})))
    }

    // Il quaderno di una cartella: le schede che l'autopilota lascia accanto al
    // codice. Solo per le cartelle conosciute, come tutto il resto.
    if (r.metodo === 'POST' && r.percorso === '/api/quaderno') {
      const cartella = stringa(r.corpo, 'cartella')
      if (cartella === '') return { stato: 400, corpo: { errore: 'serve la cartella' } }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!conosciuta(ammesse, cartella)) return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      return OK({ schede: deps.quaderno(cartella) })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/quaderno/scheda') {
      const cartella = stringa(r.corpo, 'cartella')
      const file = stringa(r.corpo, 'file')
      if (cartella === '' || file === '') return { stato: 400, corpo: { errore: 'servono cartella e scheda' } }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!conosciuta(ammesse, cartella)) return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      const s = deps.scheda(cartella, file)
      return s === undefined ? { stato: 404, corpo: { errore: 'scheda inesistente' } } : OK(s)
    }

    if (r.percorso === '/api/preferenze' && r.metodo !== 'POST') {
      return OK({ preferenze: deps.preferenze?.() ?? PREFERENZE_PREDEFINITE })
    }

    // Cambiarne una non deve poter cancellare le altre: arriva un pezzo, e il
    // computer lo mescola con quelle che ha gia'.
    if (r.metodo === 'POST' && r.percorso === '/api/preferenze') {
      const corpo = r.corpo
      if (typeof corpo !== 'object' || corpo === null) {
        return { stato: 400, corpo: { errore: 'servono le preferenze da cambiare' } }
      }
      // Le impostazioni che governano la RETE non si cambiano DALLA rete. Un
      // dispositivo accoppiato che potesse impostare `clientOltreLaRete=true`
      // toglierebbe il primo muro (accettazione dai soli IP locali) all'intero
      // server, lasciando la sola chiave a difesa di un programma che esegue
      // codice; e spostare le porte lo renderebbe irraggiungibile. Aprire il muro
      // o cambiare porta deve passare dal computer, con la scelta davanti. Le
      // altre preferenze — tema, viste, comodità — restano cambiabili dal telefono.
      const parziali = corpo as Record<string, unknown>
      const ammesse: Record<string, unknown> = {}
      for (const [chiave, valore] of Object.entries(parziali)) {
        if (chiave === 'clientOltreLaRete' || chiave === 'portaClient' || chiave === 'portaAutopiloti') {
          continue
        }
        ammesse[chiave] = valore
      }
      await deps.impostaPreferenze(ammesse)
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/aggiornamento') {
      return OK(deps.aggiornamento())
    }

    // Cercare non scarica e non installa: e' la piu' innocua delle tre, e non
    // chiede conferme.
    if (r.metodo === 'POST' && r.percorso === '/api/aggiornamento/cerca') {
      deps.cercaAggiornamento()
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/aggiornamento/note') {
      if (deps.noteAggiornamento === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora mostrare le note' } }
      const note = await deps.noteAggiornamento()
      return note === undefined ? { stato: 409, corpo: { errore: 'gli aggiornamenti non sono attivi su questo computer' } } : OK(note)
    }

    if (r.metodo === 'POST' && r.percorso === '/api/aggiornamento/scarica') {
      deps.scaricaAggiornamento()
      return OK({ fatto: true })
    }

    // Installare **riavvia il computer di casa**: e' la cosa piu' invasiva che
    // si possa chiedere da un telefono, e la pagina la chiede due volte.
    if (r.metodo === 'POST' && r.percorso === '/api/aggiornamento/installa') {
      deps.installaAggiornamento()
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/sessioni') {
      const elenco = await deps.sessioni().catch(() => [])
      const conAltrove = elenco.map((s) => ({ s, su: deps.chatAltrove?.(s.cwd) }))
      // «su X · acceso / spento», come l'elenco «Riprendi» sul computer
      // (0.33.0): il telefono diceva solo «su X», e non si sapeva se quel PC
      // fosse li' a rispondere. I battiti si leggono solo se servono.
      const accesi = new Map<string, boolean>()
      if (conAltrove.some((x) => x.su !== undefined) && deps.pc !== undefined) {
        const ora = adesso()
        for (const b of await deps.pc().catch(() => [] as BattitoPcTelefono[])) accesi.set(b.nome, battitoVivo(b.battito, ora))
      }
      return OK({
        sessioni: conAltrove.map(({ s, su }) => su === undefined ? s : {
          ...s,
          altrove: su,
          ...(accesi.has(su) ? { altroveAcceso: accesi.get(su) } : {})
        })
      })
    }

    // Riprendere una conversazione: la stessa regola di «apri» sulla cartella,
    // perche' un percorso qualunque arrivato dalla rete aprirebbe una sessione
    // dove capita.
    // ── Il Drive: catalogo, «Porta qui», lavoro in corso ─────────────────
    // `disponibile: false` = un computer che non conosce ancora queste rotte
    // (o non ha il Drive): non e' un errore, e il telefono lo dice cosi'.
    if (r.percorso === '/api/drive/catalogo') {
      if (deps.driveCatalogo === undefined) return OK({ ok: false, disponibile: false, messaggio: 'questo computer non sa ancora mostrare il Drive' })
      const esito = await deps.driveCatalogo().catch((e: unknown) => ({ ok: false, messaggio: String(e) }))
      return OK({ disponibile: true, ...(esito as object) })
    }
    if (r.percorso === '/api/drive/catalogoStato') {
      return OK((deps.driveCatalogoStato?.() as object | undefined) ?? {})
    }
    // «Porta qui» dal telefono non c'e' piu' (0.42.0, «una chat, una casa»):
    // un progetto si sposta con «Sposta progetto», dal PC dove sta, che
    // controlla, verifica e archivia. Portarlo qui di nascosto ne farebbe due
    // case.
    if (r.metodo === 'POST' && (r.percorso === '/api/drive/porta' || r.percorso === '/api/drive/portaWorkspace')) {
      return OK({ ok: false, messaggio: 'Dalla 0.42.0 un progetto non si porta più qui dal catalogo: ogni chat ha una casa sola. Per spostarlo usa «Sposta progetto…» nella scheda Drive del PC dove sta adesso; da qui intanto le sue chat si guardano dal vivo.' })
    }
    // Il nome scelto di questo PC (0.52.4), cambiato dal telefono: lo stesso
    // campo di «Altri computer» sul PC. Da un altro PC no: ognuno si chiama
    // come vuole chi ci lavora davanti, o il suo telefono.
    if (r.percorso === '/api/nome-pc' && r.metodo === 'POST') {
      if (daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: 'il nome di un PC si cambia da quel PC o dal suo telefono' } }
      if (deps.impostaNomeComputer === undefined) return { stato: 404, corpo: { errore: 'questo computer non sa ancora cambiare nome' } }
      const nome = stringa(r.corpo, 'nome') ?? ''
      return OK({ ok: true, ...deps.impostaNomeComputer(nome) })
    }
    // Le case delle chat (0.52.0): un altro PC di casa manda la sua scelta
    // («Ospitata da»), o chiede le nostre. Mai dal telefono né da fuori: la
    // casa decide dove parte un claude.exe.
    if (r.percorso === '/api/case') {
      if (!daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: 'solo un altro PC con la stessa cassaforte' } }
      if (deps.caseChat === undefined) return { stato: 404, corpo: { errore: 'questo computer non conosce ancora le case delle chat' } }
      if (r.metodo === 'POST') return OK((await deps.caseChat.ricevi(r.corpo).catch((e: unknown) => ({ ok: false, messaggio: String(e) }))) as object)
      return OK(deps.caseChat.leggi() as object)
    }
    // «Sposta progetto» (0.42.0): chi riceve. Solo da un altro PC di casa.
    if (r.percorso.startsWith('/api/sposta/')) {
      if (!daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: 'solo un altro PC con la stessa cassaforte' } }
      if (deps.sposta === undefined) return { stato: 404, corpo: { errore: 'questo computer non sa ancora ricevere un progetto' } }
      if (r.percorso === '/api/sposta/pronto') return OK(deps.sposta.pronto() as object)
      if (r.metodo === 'POST' && r.percorso === '/api/sposta/ricevi') return OK((await deps.sposta.ricevi(r.corpo).catch((e: unknown) => ({ ok: false, messaggio: String(e) }))) as object)
      if (r.metodo === 'POST' && r.percorso === '/api/sposta/verifica') {
        const s = (r.corpo as { sessioni?: unknown } | undefined)?.sessioni
        return OK((await deps.sposta.verifica(Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string') : [])) as object)
      }
    }
    if (r.percorso === '/api/drive/lavoro') {
      return OK((deps.driveLavoro?.() as object | undefined) ?? {})
    }
    if (r.metodo === 'POST' && r.percorso === '/api/drive/annulla') {
      return OK({ fatto: deps.driveAnnulla?.() === true })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/drive/riavvia') {
      if (deps.driveRiavvia === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora riavviarsi a comando' } }
      return OK(await deps.driveRiavvia())
    }

    // ── La coda condivisa dei comandi di un progetto ─────────────────────
    if (r.metodo === 'POST' && r.percorso === '/api/coda') {
      const progetto = stringa(r.corpo, 'progetto')
      if (progetto === '') return { stato: 400, corpo: { errore: 'serve il progetto' } }
      const coda = await deps.coda?.(progetto).catch(() => undefined)
      return OK({ voci: coda?.voci ?? [], disponibile: coda !== undefined })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/coda/aggiungi') {
      const progetto = stringa(r.corpo, 'progetto')
      const testo = stringa(r.corpo, 'testo').trim()
      const sessione = stringa(r.corpo, 'sessione')
      if (progetto === '' || testo === '') return { stato: 400, corpo: { errore: 'servono il progetto e il testo' } }
      if (testo.length > 4000) return { stato: 400, corpo: { errore: 'testo troppo lungo' } }
      const coda = await deps.codaAggiungi?.(progetto, testo, sessione === '' ? undefined : sessione).catch(() => undefined)
      if (coda === undefined) return { stato: 409, corpo: { errore: 'la coda sta sul Drive: serve la cassaforte sbloccata e il Drive collegato' } }
      return OK({ fatto: true, voci: coda.voci })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/coda/togli') {
      const progetto = stringa(r.corpo, 'progetto')
      const voce = stringa(r.corpo, 'voce')
      if (progetto === '' || voce === '') return { stato: 400, corpo: { errore: 'servono il progetto e la voce' } }
      const coda = await deps.codaTogli?.(progetto, voce).catch(() => undefined)
      if (coda === undefined) return { stato: 409, corpo: { errore: 'coda non raggiungibile' } }
      return OK({ fatto: true, voci: coda.voci })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/coda/pulisci') {
      const progetto = stringa(r.corpo, 'progetto')
      if (progetto === '') return { stato: 400, corpo: { errore: 'serve il progetto' } }
      const coda = await deps.codaPulisci?.(progetto).catch(() => undefined)
      if (coda === undefined) return { stato: 409, corpo: { errore: 'coda non raggiungibile' } }
      return OK({ fatto: true, voci: coda.voci })
    }

    // ── La posta per un PC: gli altri computer, e le loro cassette ────────
    if (r.percorso === '/api/pc') {
      const pc = await deps.pc?.().catch(() => [] as BattitoPcTelefono[])
      // `vivo` lo decide il computer, non il telefono: e' lui ad avere l'ora giusta.
      const ora = adesso()
      return OK({
        io: deps.pcIo?.() ?? '',
        disponibile: deps.pc !== undefined,
        pc: (pc ?? []).map((b) => ({ ...b, vivo: battitoVivo(b.battito, ora) }))
      })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/posta') {
      const pc = stringa(r.corpo, 'pc')
      if (pc === '') return { stato: 400, corpo: { errore: 'serve il pc' } }
      const p = await deps.posta?.(pc).catch(() => undefined)
      return OK({ voci: p?.voci ?? [], disponibile: p !== undefined })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/posta/aggiungi') {
      const pc = stringa(r.corpo, 'pc')
      const cwd = stringa(r.corpo, 'cwd').trim()
      const testo = stringa(r.corpo, 'testo').trim()
      const sessione = stringa(r.corpo, 'sessione')
      if (pc === '' || cwd === '' || testo === '') return { stato: 400, corpo: { errore: 'servono il pc, la cartella e il testo' } }
      if (testo.length > 4000) return { stato: 400, corpo: { errore: 'testo troppo lungo' } }
      if (deps.postaAggiungi === undefined) return { stato: 409, corpo: { errore: 'questo computer non sa ancora mandare azioni a un altro PC: aggiornalo' } }
      // Chi scrive (0.49.1): il telefono che passa da qui, o questo PC; sempre una persona.
      const io = deps.pcIo?.() ?? ''
      const daVisore = r.dispositivo === undefined || r.dispositivo === 'locale' || daAltroPc(r.dispositivo) ? io : `tel:${r.dispositivo}@${io}`
      const p = await deps.postaAggiungi(pc, { cwd, testo, ...(sessione !== '' ? { sessione } : {}), origine: 'umano', ...(daVisore !== '' ? { daVisore } : {}) }).catch(() => undefined)
      if (p === undefined) return { stato: 409, corpo: { errore: 'la posta sta sul Drive: serve la cassaforte sbloccata e il Drive collegato' } }
      return OK({ fatto: true, voci: p.voci })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/posta/togli') {
      const pc = stringa(r.corpo, 'pc')
      const voce = stringa(r.corpo, 'voce')
      if (pc === '' || voce === '') return { stato: 400, corpo: { errore: 'servono il pc e la voce' } }
      const p = await deps.postaTogli?.(pc, voce).catch(() => undefined)
      if (p === undefined) return { stato: 409, corpo: { errore: 'posta non raggiungibile' } }
      return OK({ fatto: true, voci: p.voci })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/posta/pulisci') {
      const pc = stringa(r.corpo, 'pc')
      if (pc === '') return { stato: 400, corpo: { errore: 'serve il pc' } }
      const p = await deps.postaPulisci?.(pc).catch(() => undefined)
      if (p === undefined) return { stato: 409, corpo: { errore: 'posta non raggiungibile' } }
      return OK({ fatto: true, voci: p.voci })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/sessioni/riprendi') {
      const cartella = stringa(r.corpo, 'cartella')
      const sessione = stringa(r.corpo, 'sessione')
      if (cartella === '' || sessione === '') {
        return { stato: 400, corpo: { errore: 'servono la cartella e la conversazione' } }
      }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      // Il confronto e' per **slug**, non per percorso: `cartelle()` ricava i
      // percorsi dai nomi delle cartelle di Claude Code, che perdono trattini,
      // sottolineature e spazi (`Game_ascensore` → `Game\ascensore`). Per
      // percorso, ogni chat con uno di quei caratteri nella cartella tornava
      // «cartella non conosciuta» dal telefono. Lo slug e' esatto in andata.
      const slugAmmessi = new Set(ammesse.map(pathToSlug))
      if (!ammesse.includes(cartella) && !slugAmmessi.has(pathToSlug(cartella))) {
        return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      }
      const su = deps.chatAltrove?.(cartella)
      if (su !== undefined) {
        // «Altri computer», come si chiama la sezione sul PC, nella pagina e
        // nell'app: il testo diceva «Altri PC», che non esisteva da nessuna parte.
        // 0.36.1: non un errore ma lo stato di quel PC, «su X · acceso/spento»,
        // e cosa succede: sul computer il riquadro si collega da solo dal vivo
        // (o aspetta quel PC). Dal telefono la vista dal vivo di un altro PC
        // non c'e' ancora: aprirla qui la farebbe partire in una cartella vuota.
        let acceso: boolean | undefined
        if (deps.pc !== undefined) {
          const b = (await deps.pc().catch(() => [] as BattitoPcTelefono[])).find((x) => x.nome === su)
          if (b !== undefined) acceso = battitoVivo(b.battito, adesso())
        }
        const stato = acceso === true ? ' · acceso' : acceso === false ? ' · spento o non risponde' : ''
        const sulComputer = acceso === false
          ? `Sul computer, aprendola dall'elenco «Riprendi», il riquadro aspetta «${su}» e si collega da solo dal vivo appena torna acceso.`
          : `Sul computer, aprendola dall'elenco «Riprendi», il riquadro si collega da solo dal vivo a «${su}» e ci lavori a distanza.`
        return { stato: 409, corpo: { errore: `questa chat è su «${su}»${stato}: la sua cartella ${cartella} sta là, qui non c'è, e da qui partirebbe in una cartella vuota. ${sulComputer} Per lasciarle un'azione: Computer → «Altri computer».` } }
      }
      deps.riprendiSessione(cartella, sessione)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/workspace/crea') {
      // Stessa validazione del percorso desktop (IPC): il nome viene dalla rete,
      // e finora questa rotta lo passava grezzo — lunghezza illimitata e caratteri
      // di controllo che il percorso IPC invece rifiuta. È anche la precondizione
      // che, insieme all'escaping degli onclick, toglie ogni residuo all'XSS via
      // nome workspace.
      let nome: string
      try { nome = validateNomeWorkspace(stringa(r.corpo, 'nome')) }
      catch { return { stato: 400, corpo: { errore: controllaNomeWorkspace(stringa(r.corpo, 'nome')).ok ? 'nome non valido' : (controllaNomeWorkspace(stringa(r.corpo, 'nome')) as { errore: string }).errore } } }
      // Come dal pannello del PC (0.55.0): la finestra lo crea, ci va e lo
      // dice alle altre. Un nome che c'è già non è un errore: ci si va.
      if (deps.azioneFinestra !== undefined) {
        const e = await deps.azioneFinestra({ tipo: 'workspace', azione: 'crea', nome })
        if (!e.ok) return { stato: 409, corpo: { errore: `Il workspace «${nome}» non è stato creato: ${e.errore ?? 'la finestra del computer non ha detto perché'}.` } }
        return OK({ fatto: true })
      }
      await deps.creaWorkspace(nome)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/workspace/elimina') {
      let nome: string
      try { nome = validateNomeWorkspace(stringa(r.corpo, 'nome')) }
      catch { return { stato: 400, corpo: { errore: 'nome non valido' } } }
      const ws = await deps.workspace().catch(() => undefined)
      if (ws !== undefined && !ws.nomi.includes(nome)) return { stato: 404, corpo: { errore: `Il workspace «${nome}» non c’è più su questo computer.` } }
      if (ws !== undefined && ws.nomi.length <= 1) return { stato: 409, corpo: { errore: ULTIMO_WORKSPACE } }
      // Il PIN (0.55.0): un workspace con dentro una chat protetta e chiusa per
      // chi guarda non si elimina da qui finché quella chat non è aperta.
      if (g !== undefined && ws !== undefined) {
        const chiusa = (ws.chat ?? []).find((c) => {
          if (c.workspace !== nome) return false
          const per = { sessione: c.sessione, workspace: c.workspace }
          return g.protetta(per) && g.chiusa(visore, per)
        })
        const aperta = chiusa === undefined ? depsPieni.chat().find((c) => (c as { workspace?: string }).workspace === nome && g.protetta(c) && g.chiusa(visore, c)) : undefined
        if (chiusa !== undefined || aperta !== undefined) {
          const titolo = chiusa?.titolo ?? aperta?.titolo ?? ''
          return { stato: STATO_CHIUSA, corpo: { ...rifiutoChiusa(titolo), errore: `Nel workspace «${nome}» c’è la chat «${titolo}», protetta dal PIN: aprila con il PIN, poi elimina il workspace.`, ...(aperta !== undefined ? { chat: aperta.id } : {}) } }
        }
      }
      // Come dal pannello del PC (0.55.0): copia di sicurezza, terminali spenti.
      if (deps.azioneFinestra !== undefined) {
        const e = await deps.azioneFinestra({ tipo: 'workspace', azione: 'elimina', nome })
        if (!e.ok) return { stato: 409, corpo: { errore: `Il workspace «${nome}» non è stato eliminato: ${e.errore ?? 'la finestra del computer non ha detto perché'}.` } }
        return OK({ fatto: true })
      }
      await deps.eliminaWorkspace(nome)
      return OK({ fatto: true })
    }

    // Rinominare un workspace (0.55.0), come «✎ Rinomina» del pannello: le
    // chat non si toccano, cambia l'etichetta.
    if (r.metodo === 'POST' && r.percorso === '/api/workspace/rinomina') {
      const vecchio = stringa(r.corpo, 'nome')
      const ws = await deps.workspace().catch(() => undefined)
      if (ws !== undefined && !ws.nomi.includes(vecchio)) return { stato: 404, corpo: { errore: `Il workspace «${vecchio}» non c’è più su questo computer.` } }
      const nuovo = controllaNomeWorkspace(stringa(r.corpo, 'nuovo'), (ws?.nomi ?? []).filter((n) => n !== vecchio))
      if (!nuovo.ok) return { stato: 400, corpo: { errore: nuovo.errore } }
      if (nuovo.nome === vecchio) return OK({ fatto: true })
      if (deps.azioneFinestra === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora rinominare un workspace da qui: aggiornalo alla 0.55.0.' } }
      const e = await deps.azioneFinestra({ tipo: 'workspace', azione: 'rinomina', nome: vecchio, nuovo: nuovo.nome })
      if (!e.ok) return { stato: 409, corpo: { errore: `Il workspace non è stato rinominato: ${e.errore ?? 'la finestra del computer non ha detto perché'}.` } }
      return OK({ fatto: true })
    }

    // I salvataggi con nome non esistono piu' (0.34.0): all'avvio il computer
    // riapre da solo l'ultima composizione. Le rotte restano per le app
    // vecchie, con un elenco vuoto e un rifiuto che spiega.
    if (r.percorso === '/api/salvataggi') {
      return OK({ salvataggi: [], nota: 'I salvataggi con nome non esistono più: il computer riapre da solo l’ultima composizione.' })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/salvataggi/carica') {
      return { stato: 410, corpo: { errore: 'i salvataggi con nome non esistono più dalla 0.34.0: all’avvio il computer riapre da solo l’ultima composizione; per tornare a una chiusura precedente usa Impostazioni → «Torna a com’era» sul computer' } }
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/elimina') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.eliminaAutopilota(id)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/riavvio') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      const corpo = r.corpo as Record<string, unknown> | undefined
      await deps.riprendiAlRiavvio(id, corpo?.riprendi === true)
      return OK({ fatto: true })
    }

    // Chiudere una chat non chiude la conversazione: quella resta su disco e si
    // riprende. È la ragione per cui questo comando può stare su un telefono.
    if (r.metodo === 'POST' && r.percorso === '/api/chat/chiudi') {
      const id = stringa(r.corpo, 'chat')
      if (id === '') return { stato: 400, corpo: { errore: 'serve la chat' } }
      if (deps.azioneFinestra !== undefined) {
        if (!depsPieni.chat().some((c) => c.id === id)) return { stato: 404, corpo: { errore: 'Questa chat non è più aperta sul computer: forse l’ha già chiusa qualcuno.' } }
        const e = await deps.azioneFinestra({ tipo: 'chat', azione: 'chiudi', chat: id })
        if (!e.ok) return { stato: 409, corpo: { errore: `La chat non è stata chiusa: ${e.errore ?? 'la finestra del computer non ha detto perché'}.` } }
        return OK({ fatto: true })
      }
      deps.chiudiChat(id)
      return OK({ fatto: true })
    }

    // «Installa là» dal telefono (0.56.2): solo dal telefono accoppiato a questo PC, mai attraverso il ponte.
    if (r.percorso === '/api/installa-la/stato') {
      if (deps.installaLaStato === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora aggiornare gli altri PC dal telefono: aggiornalo alla 0.56.2.' } }
      return OK({ avanzamenti: deps.installaLaStato() })
    }
    if (r.metodo === 'POST' && r.percorso === '/api/installa-la') {
      if (daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: '«Installa là» si chiede dal telefono accoppiato a questo PC, non da un altro PC.' } }
      const pc = stringa(r.corpo, 'pc')
      if (pc === '') return { stato: 400, corpo: { errore: 'Quale PC aggiornare?' } }
      if (deps.installaLa === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora aggiornare gli altri PC dal telefono: aggiornalo alla 0.56.2.' } }
      const a = deps.installaLa(pc)
      if (a === undefined) return { stato: 409, corpo: { errore: 'La Salute di questo PC non è ancora pronta: riprova fra qualche secondo.' } }
      // Un PC che non ha mai lasciato un battito sul Drive (ripasso 0.56.2): prima si accettava e si riprovava per sempre.
      if ((a as { sconosciuto?: unknown }).sconosciuto === true) return { stato: 404, corpo: { errore: 'Questo PC non è fra quelli della cassaforte (non ha mai lasciato un battito sul Drive): non so dove bussare per aggiornarlo.' } }
      return OK({ fatto: true, avanzamento: a })
    }

    // I modelli fra cui scegliere per una chat nuova (0.56.0): gli stessi della fascia del PC.
    if (r.percorso === '/api/modelli') return OK({ modelli: MODELLI })

    // Archiviare un autopilota fermo (0.56.0): come dal pannello del PC.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/archivia') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      if (deps.archiviaAutopilota === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora archiviare da qui: aggiornalo alla 0.56.0.' } }
      const a = (await deps.autopiloti().catch(() => [] as Autopilota[])).find((x) => x.id === id)
      if (a === undefined) return { stato: 404, corpo: { errore: 'Questo autopilota non c’è più.' } }
      const archivia = (r.corpo as { archivia?: unknown } | undefined)?.archivia !== false
      if (archivia && !eFermo(a)) return { stato: 409, corpo: { errore: 'Si archivia solo un autopilota fermo (sospeso o fallito): prima fermalo con «Ferma».' } }
      await deps.archiviaAutopilota(id, archivia)
      return OK({ fatto: true })
    }

    // Il PIN di una chat dal telefono (0.56.0). Proteggere si può sempre;
    // togliere la protezione solo a chat aperta per chi guarda (dopo il PIN),
    // altrimenti chiunque avesse il telefono la toglierebbe senza saperlo.
    if (r.metodo === 'POST' && r.percorso === '/api/pin/proteggi') {
      if (g === undefined || deps.proteggiChat === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora proteggere una chat da qui: aggiornalo alla 0.56.0.' } }
      if (!g.stato().impostato) return { stato: 409, corpo: { errore: 'Sul computer non c’è ancora un PIN: si sceglie là, in Impostazioni → Chat e autopiloti → PIN. Poi da qui si protegge ogni chat.' } }
      const c = depsPieni.chat().find((x) => x.id === stringa(r.corpo, 'chat'))
      if (c === undefined || c.sessione === undefined || c.sessione === '') return { stato: 404, corpo: { errore: 'Questa chat non è aperta sul computer, o non ha ancora una conversazione.' } }
      const si = (r.corpo as { si?: unknown } | undefined)?.si !== false
      if (!si && g.protetta(c) && g.chiusa(visore, c)) return { stato: STATO_CHIUSA, corpo: { ...rifiutoChiusa(c.titolo), chat: c.id } }
      deps.proteggiChat(c.sessione, si)
      return OK({ fatto: true })
    }

    // «Ospitata da» (0.56.0): quale PC fa girare questa chat, con la conferma lunga del PC.
    if (r.metodo === 'POST' && r.percorso === '/api/chat/ospite') {
      if (deps.scegliOspite === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora scegliere l’ospite da qui: aggiornalo alla 0.56.0.' } }
      const c = depsPieni.chat().find((x) => x.id === stringa(r.corpo, 'chat'))
      if (c === undefined || c.sessione === undefined || c.sessione === '') return { stato: 404, corpo: { errore: 'Questa chat non è aperta sul computer, o non ha ancora una conversazione.' } }
      const pc = stringa(r.corpo, 'pc')
      if (pc === '') return { stato: 400, corpo: { errore: 'Scegli il PC che la ospita.' } }
      const e = await deps.scegliOspite([c.sessione], { id: pc, nome: stringa(r.corpo, 'pcNome') || pc })
      return e.ok ? OK({ fatto: true, messaggio: e.messaggio }) : { stato: 409, corpo: { errore: e.messaggio } }
    }

    // Mettere a dormire, svegliare, spostare in un altro workspace (0.55.0):
    // i tasti ⏸, «Svegliala» e ⇄ del riquadro sul PC.
    if (r.metodo === 'POST' && (r.percorso === '/api/chat/dormi' || r.percorso === '/api/chat/sveglia' || r.percorso === '/api/chat/sposta')) {
      const id = stringa(r.corpo, 'chat')
      if (id === '') return { stato: 400, corpo: { errore: 'serve la chat' } }
      if (deps.azioneFinestra === undefined) return { stato: 409, corpo: { errore: 'Questo computer non sa ancora farlo da qui: aggiornalo alla 0.55.0.' } }
      const c = depsPieni.chat().find((x) => x.id === id)
      if (c === undefined) return { stato: 404, corpo: { errore: 'Questa chat non è più aperta sul computer: forse l’ha già chiusa qualcuno.' } }
      if (r.percorso === '/api/chat/sposta') {
        const verso = stringa(r.corpo, 'workspace')
        const ws = await deps.workspace().catch(() => undefined)
        if (verso === '' || (ws !== undefined && !ws.nomi.includes(verso))) return { stato: 404, corpo: { errore: `Il workspace «${verso}» non c’è su questo computer: scegline uno dell’elenco.` } }
        const e = await deps.azioneFinestra({ tipo: 'chat', azione: 'sposta', chat: id, workspace: verso })
        if (!e.ok) return { stato: 409, corpo: { errore: `La chat non è stata spostata: ${e.errore ?? 'la finestra del computer non ha detto perché'}.` } }
        return OK({ fatto: true })
      }
      const azione = r.percorso === '/api/chat/dormi' ? 'dormi' : 'sveglia'
      const e = await deps.azioneFinestra({ tipo: 'chat', azione, chat: id })
      if (!e.ok) return { stato: 409, corpo: { errore: `${azione === 'dormi' ? 'La chat non si è addormentata' : 'La chat non si è svegliata'}: ${e.errore ?? 'la finestra del computer non ha detto perché'}.` } }
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/chat/nome') {
      const id = stringa(r.corpo, 'chat')
      const nome = stringa(r.corpo, 'nome')
      if (id === '' || nome === '') return { stato: 400, corpo: { errore: 'servono chat e nome' } }
      deps.rinominaChat(id, nome.slice(0, 80))
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/workspace') {
      const nome = stringa(r.corpo, 'nome')
      if (nome === '') return { stato: 400, corpo: { errore: 'serve il nome' } }
      await deps.cambiaWorkspace(nome)
      return OK({ fatto: true })
    }

    return { stato: 404, corpo: { errore: 'non trovato' } }
  }
}
