---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-02T07:26:10.262Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Richiesta di Nicholas del 02/10, da pubblicare come 0.39.0.
(1) Quando c'è un aggiornamento, la striscia mostra «Installa». Il tasto apre una finestra con le note di cosa cambia (della versione nuova e di quelle saltate, dalle releaseNotes dell'aggiornamento o dalle release GitHub, con Markdown reso in modo sicuro) e con i tasti «Installa e riavvia» (logica attuale di quiete e ripresa) e «Più tardi». Nessun installa-e-riavvia parte più senza passare da questa finestra.
(2) La finestra delle novità all'avvio è tolta. Le novità restano leggibili da un comando nel menu o nelle impostazioni.
(3) Su app Android e pagina servita, «Installa» dal telefono mostra prima le stesse note e poi chiede la conferma.
Funzioni pure con i test (vitest e Kotlin). Versione 0.39.0 dopo git fetch, voce in novita.ts, APK alzato, scheda nel quaderno. Commit in italiano, uno per gruppo; push e pubblicazione fatti dall'autopilota con la procedura del quaderno, verificando latest.yml, APK e app-android.json, con il corpo della release che contiene la voce delle novità. Resta valido tutto il lavoro fino alla 0.38.2. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Sul PC la striscia mostra «Installa», che apre la finestra con le note (versioni saltate comprese, Markdown sicuro) e i tasti «Installa e riavvia» e «Più tardi»; nessun installa-e-riavvia salta la finestra; la finestra delle novità all'avvio è tolta e le novità restano leggibili dal menu; test sulle funzioni pure (lo giudica il supervisore)
- ⬜ Su app Android e pagina servita, «Installa» dal telefono mostra prima le note e poi chiede la conferma, con i test (lo giudica il supervisore)
- ✅ La versione è 0.39.x con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano (compreso novita.test.ts)
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-01 20:27** — su tua richiesta: Hai ragione, finora non si è mosso niente. Ho controllato: l'ultimo commit è ancora la scheda delle novità di Claude Code. Le tue istruzioni sulle linguette erano in coda per la fine di un turno della chat, ma quel turno era già finito, quindi non sono mai arrivate. Adesso la faccio ripartire.

Sull
- **2026-10-01 20:30** — su tua richiesta: Hai ragione, ed è un difetto serio: l'autopilota ha incollato le istruzioni nella chat ma non ha premuto invio. La chat è ancora ferma, con il testo nella casella. Ecco perché finora non mi hai visto lavorare.

**Subito:** clicca dentro quella chat e premi **Invio**. Il testo che vedi è giusto, sono
- **2026-10-01 20:39** — supervisore → prosegui: La 0.37.4 è uscita con un altro contenuto: la correzione dell'invio mancato, che è il difetto più grave segnalato da Nicholas, manca ancora (riga 254), e la 0.38.0 non è cominciata.
- **2026-10-01 21:32** — supervisore → finito: Ho controllato tutto. La 0.37.5 ha tolto il return muto alla riga 254. La v0.38.0 è pubblicata, non è una bozza, ha i 5 allegati e l'APK 2.42.0. Ci sono le linguette Domande e File, finestre-pannello.ts con finestreDiChat() e le stesse difese della finestra principale, più i test vitest e Kotlin. Origin è allineato e tutti i criteri con un comando passano.
- **2026-10-01 21:38** — su tua richiesta: Hai ragione: l'autopilota esiste proprio perché tu non debba premere niente. Invio deve partire da solo, sempre.

Cosa stai vedendo: nella 0.37.5 avevo fatto aggiungere un paracadute. Se l'autopilota manda il compito e gli sembra che la chat non sia partita, invece di stare zitto ti mostra «Premi In
- **2026-10-01 21:55** — comando bloccato dal programma: SierraDeck blocca questa cancellazione: «/e/Users/nikof/Documents/SierraDeck/.sierradeck/consegne/prova.md» è fuori dalle cartelle di questo autopilota (E:\Users\nikof\Documents\SierraDeck, E:\Users\nikof\Documents\SierraDeck.sierradeck-wt). Si cancellano solo file dentro le sue cartelle.
- **2026-10-01 22:03** — supervisore → finito: Ho controllato tutto. Il commit ef03fc9 riporta la causa vera (un falso allarme, provato con Claude Code 2.1.287), la consegna con file più riga corta e il controllo che non legge più lo scrollback. Nel codice la banda «Premi Invio» non c'è più, resta solo un commento, e i test delle consegne ci sono. La v0.38.1 è pubblicata, non in bozza, con i 5 allegati. Origin è allineato.
- **2026-10-01 22:45** — su tua richiesta: Hai ragione, e mi scuso. Ho guardato cosa succede davvero.

**1. La chat NexoraOS non riceve niente.** Il tuo PC è passato alla 0.38.1 alle 00:28 e da quel momento l'autopilota non scrive più niente nella chat. Il campo è vuoto, come dici tu. La 0.38.1 doveva risolvere il problema dell'Invio, invece
- **2026-10-01 23:06** — supervisore → finito: Tutti i criteri sono soddisfatti e li ho verificati. La v0.38.2 è pubblicata, non in bozza, con i 5 allegati. Origin è allineato e la scheda sulla firma del codice c'è. La causa è ricostruita dai dati reali (c-1.md scritto, trascrizione ferma, chat in un altro workspace) ed è coperta da test e da una prova con claude vero. Il PC di Nicholas però gira ancora la 0.38.1: la conferma sul campo arriverà dalle righe [consegna] nel log dopo che avrà aggiornato.
- **2026-10-02 06:52** — su tua richiesta: Chiaro, faccio così:

1. **Quando c'è un aggiornamento**, nella striscia in alto non trovi più «Installa e riavvia» ma solo **«Installa»**. Premendolo si apre una finestra che spiega cosa cambia: le note della versione nuova, scritte per esteso. Se hai saltato qualche versione, ci sono le note di tu
- **2026-10-02 07:21** — supervisore → prosegui: il supervisore non ha risposto: decidono le regole
- **2026-10-02 07:26** — supervisore → finito: Ho controllato i punti chiave. La v0.39.0 è pubblicata, non in bozza, con i 5 allegati e l'APK 2.43.0, e origin è allineato. Il tasto «Installa» apre la finestra delle note, con «Più tardi». Le novità si aprono solo su richiesta. Ci sono i test vitest (note-aggiornamento e pagina) e Kotlin (NoteAggiornamentoTest). Resta una cosa da far confermare a Nicholas, senza blocchi: l'installazione alla chiusura del programma è ancora attiva.

## In numeri

- interventi: 23
- cartella: `E:\Users\nikof\Documents\SierraDeck`
