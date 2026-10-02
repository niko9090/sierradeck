---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-02T10:51:30.390Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Due difetti del 02/10. (A) 0.39.2: un'installazione fallita va rilevata al riavvio, con un avviso chiaro sul PC e sul telefono e la scheda firma-del-codice aggiornata. (B) 0.39.3 URGENTE: le chat degli altri PC danno errori perché il Drive è scollegato dal 23/09 e i battiti non passano. Correggere con: banda fissa sul Drive scollegato (PC e telefono), scoperta diretta dei PC sugli ultimi indirizzi, stato «non so se è acceso» invece di «spento», chat remota evidente ovunque, motivi veri negli errori del riquadro remoto. Funzioni pure con i test. Versione 0.39.3 dopo git fetch, voce in novita.ts, scheda nel quaderno, APK alzato se cambia android. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno, verificando latest.yml, APK e app-android.json. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Un'installazione fallita viene rilevata al riavvio, con un avviso chiaro sul PC e sul telefono; il segno viene pulito quando riesce; test vitest (lo giudica il supervisore)
- ✅ La scheda sulla firma del codice cita il caso reale del portatile
- ⬜ Drive scollegato con banda fissa e avviso sul telefono; scoperta diretta dei PC; stato «non so se è acceso» con dati vecchi; motivi veri negli errori remoti; chat remota evidente ovunque; funzioni pure con i test (lo giudica il supervisore)
- ✅ La versione è 0.39.3 o una 0.39.x successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

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
- **2026-10-02 09:58** — su tua richiesta: Grazie, il registro del portatile è stato decisivo, e mi fa correggere quello che ti avevo detto. Ecco cosa è successo davvero:

- **Alle 08:32** il portatile si è aggiornato alla 0.38.2 senza problemi: un minuto dopo ripartiva con la versione nuova.
- **Alle 11:29** ha trovato la 0.39.0 e l'ha scar
- **2026-10-02 10:15** — su tua richiesta: Ho trovato il motivo degli errori, ed è più grave di quanto pensassi.

**Il Drive di SierraDeck è scollegato dal 23 settembre, sia su questo PC sia sul portatile.** Nel registro c'è «Google Drive non connesso: manca l'autorizzazione», e da allora a ogni avvio risulta «connesso: false». I PC si ricon
- **2026-10-02 10:19** — supervisore → prosegui: La 0.39.2 è fatta, ma il criterio della 0.39.3 fallisce: il difetto del multi-PC (Drive scollegato dal 23/09, chat remote con errori) è ancora tutto da correggere.
- **2026-10-02 10:51** — supervisore → finito: La v0.39.3 è pubblicata e non in bozza, con i 5 allegati (APK 2.43.3); origin è allineato e tutti i criteri con comando passano. La causa del Drive scollegato è documentata (invalid_grant di Google del 23/09) e lo stato del programma ora vede il Drive acceso e i due PC accesi. Resta solo la prova dal vivo con Nicholas, come era stato deciso.

## In numeri

- interventi: 26
- cartella: `E:\Users\nikof\Documents\SierraDeck`
