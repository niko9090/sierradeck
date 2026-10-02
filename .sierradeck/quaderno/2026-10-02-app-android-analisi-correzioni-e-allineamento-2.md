---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-02T09:56:24.868Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Difetti segnalati da Nicholas il 02/10, da pubblicare come 0.39.1.
(1) Le domande si vedono sempre per intero, senza tagli e con gli a capo, nella linguetta Domande (anche staccata), nella colonna, nell'app Android e nella pagina; un testo lungo fa scorrere l'area. Il taglio va cercato e corretto con dati veri.
(2) Una domanda di un autopilota non apre la colonna a destra: si fa avanti solo la linguetta Domande della sua scheda (o la sua finestra pannello). La colonna si apre da sola solo per le chat senza autopilota; il numerino conta tutto e nessuna domanda resta invisibile all'avvio.
Test vitest e Kotlin. Patch 0.39.1 dopo git fetch, voce in novita.ts, scheda nel quaderno, APK alzato se android/ cambia, altrimenti riallegare il 2.43.0. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno, verificando latest.yml, APK e app-android.json. Resta valido tutto il lavoro fino alla 0.39.0. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Le domande si vedono per intero ovunque (linguetta, finestra pannello, colonna, app, pagina), causa del taglio trovata con dati veri, test su una domanda lunga multi-riga (lo giudica il supervisore)
- ⬜ Una domanda di un autopilota apre solo la sua linguetta Domande e non la colonna a destra; la colonna si apre da sola solo per le chat senza autopilota; test sui due casi (lo giudica il supervisore)
- ✅ La versione è 0.39.1 o una 0.39.x successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano (compreso novita.test.ts)
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

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
- **2026-10-02 09:32** — su tua richiesta: Ricevuto, sono due difetti e li correggo subito come 0.39.1:

1. **Le domande tagliate.** Ogni domanda deve vedersi per intero, dalla prima all'ultima parola, sia nella linguetta Domande sotto la chat sia nella colonna. Se è lunga, la linguetta scorre, ma il testo non viene mai accorciato. Prima di 
- **2026-10-02 09:56** — supervisore → finito: Ho controllato tutto. La causa del taglio è stata trovata sui dati veri: il limite di 500 caratteri dopo l'obiettivo, tolto in 579e055. La colonna non si apre più per gli autopiloti (31c0191). L'app 2.43.1 ha il suo test. La v0.39.1 è pubblicata, non in bozza, con i 5 allegati, e origin è allineato. Resta un limite già dichiarato da Nicholas: per le chat che hanno solo finito il turno, il telefono mostra le ultime 20 righe.

## In numeri

- interventi: 24
- cartella: `E:\Users\nikof\Documents\SierraDeck`
