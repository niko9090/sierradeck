---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-13T12:38:57.492Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.71.0: autopilota rifatto. Agenti specializzati (Sviluppo, Collaudo, Interfaccia, Revisione, Rilascio) guidati da un coordinatore che scompone, assegna, gestisce più chat in parallelo e unisce dopo la revisione; consegne affidabili a più chat, mai perse; domande chiare, una alla volta, che sopravvivono al riavvio; supervisore che verifica i fatti, ricorda le decisioni ed evita i giri a vuoto; giri più veloci misurati prima e dopo; tutto visibile su PC, pagina e app. Una sola release 0.71.0 a lavoro finito, mai installata da noi; prove solo su autopiloti di prova; rapporto in italiano a Nicholas. Niente dati privati nel codice; solo i PC della stessa chiave di casa; sulle chat vere solo lettura. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Nessun ordine perso nel passaggio sottofondo → riquadro: i testi in coda vengono scritti e inviati (verifica «partita») o tornano nella coda dell'autopilota, mai segnati consegnati prima; test che riproduce il caso del 13/10 09:36
- ⬜ «Strumenti ▾» dei Progetti funziona (causa trovata, test); tutti i menu, «⋯», «?» e tasti delle 10 schermate della 0.70.0 provati con clic veri nella copia di prova, sul PC e sulla pagina, con gli esiti nel quaderno e ogni difetto corretto
- ⬜ Progetti: «Sposta su ▾» in vista nel dettaglio, da qualsiasi PC verso qualsiasi PC della stessa chiave di casa (via ponte se l'arrivo non è questo PC), conferma con riassunto, avanzamento visibile, «Annulla tutto», niente cancellato; stesso su pagina e app; test e prova dal vero su un progetto di prova fra due PC veri
- ⬜ Piano rivisto da un agente esperto di sistemi multi-agente e scritto nel quaderno prima del codice
- ⬜ Agenti specializzati: ruoli Sviluppo, Collaudo, Interfaccia, Revisione e Rilascio con istruzioni proprie; il coordinatore scompone l'obiettivo, assegna i compiti per ruolo, apre o riusa le chat e unisce il lavoro solo dopo l'ok della Revisione; ruolo visibile su PC, pagina e app; test e prova dal vero su un autopilota di prova
- ⬜ Più chat insieme: supervisore e coda per chat, consegne che non si rubano la finestra, nessun ordine perso dopo il riavvio del servizio; test con 3 chat in parallelo e prova dal vero
- ⬜ Domande chiare: una alla volta, linguaggio semplice, scelta consigliata segnata; le domande vaghe o lunghe vengono respinte; la domanda aperta sopravvive al riavvio del servizio (test); le risposte già date non vengono richieste
- ⬜ Supervisore più intelligente: verifica git, test e log prima di decidere; memoria delle decisioni di Nicholas letta a ogni giro; antiloop che ferma e spiega; test
- ⬜ Più veloce: tempi di un giro (supervisore, consegna, attese) misurati prima e dopo, con i numeri nel rapporto
- ⬜ Rapporto in italiano nel quaderno con cosa è cambiato, prove fatte e punti aperti
- ✅ Nessun indirizzo, nome o id vero dei PC di Nicholas nel codice, nei test, nell'app e nelle pagine
- ✅ La versione è 0.71.0 o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ L'APK dell'ultima release è firmato con il certificato di rilascio di Ferrari Consulenze
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-12 22:56** — supervisore → prosegui: Il lavoro notturno è appena partito (0.69.0 pubblicata, foto prima fatte, revisioni in corso); bisogna mettere in git il bump e procedere schermata per schermata senza fermarsi.
- **2026-10-13 00:57** — supervisore → finito: Ho verificato tutto. La 0.70.0 è pubblicata, non è una bozza, e ha installer, latest.yml, APK 2.70.0 firmato e app-android.json; non l'ha installata nessuno di noi. Le dieci schermate sono riprogettate, con un commit per ognuna. Le foto prima/dopo sono 40, in note/foto-0-70/. Il rapporto rapporto-notte-0-70-0.md è nel quaderno, con le tabelle «prima → adesso» e i punti aperti motivati. Tutti i criteri con comando sono verdi; ora tocca a Nicholas guardare e installare.
- **2026-10-13 00:57** — scheda nel quaderno: 0.70.0 pubblicata: cosa resta dopo l'installazione di Nicholas
- **2026-10-13 09:30** — su tua richiesta: Ricevuto. Il prossimo lavoro è l'**autopilota**, ed entra in **una sola versione, la 0.71.0**, che pubblico solo a lavoro finito. Come sempre la installi tu.

**Cosa cambia:**
1. **Agenti specializzati.** L'autopilota non lavora più con una chat sola che fa tutto: diventa un capo squadra con chat sp
- **2026-10-13 09:30** — ripreso su tua richiesta («Riprendi»)
- **2026-10-13 09:33** — su tua richiesta: Oggi si può fare, ma è scomodo, e hai ragione che deve stare tutto lì. Come funziona adesso, nella scheda **Progetti**:
- **Per portarlo sul PC dove sei:** clicca il progetto e, nel dettaglio a destra, premi **«Lavora su questo PC»**. Parte lo spostamento con i passi in vista e «Annulla tutto».
- **
- **2026-10-13 09:35** — su tua richiesta: Hai ragione, scusa. Ho controllato: su questo PC c'è la **0.70.0**, installata da te alle 11:27, e il menu «Strumenti ▾» dei Progetti è proprio quello nuovo di stanotte. Leggendo il codice non vedo il motivo per cui non si apre, quindi la chat lo **riproduce sul programma di prova** e lo corregge, c
- **2026-10-13 09:35** — la chat lavora e 2 messaggi aspettavano da 3 min: glieli scrivo adesso, durante il turno
- **2026-10-13 10:23** — su tua richiesta: No, e hai fatto bene a chiedere: **la chat è ferma dalle 11:36**. Ho guardato il registro. Alle 11:35 le ho mandato le istruzioni sul tasto Strumenti e su «Sposta su». In quel momento la chat lavorava in sottofondo, e un minuto dopo è passata nella sua finestra del workspace «SierraDeck». Proprio in
- **2026-10-13 10:25** — la chat lavora e un messaggio aspettava da 2 min: glieli scrivo adesso, durante il turno
- **2026-10-13 12:38** — supervisore → finito: Ho verificato: la 0.71.0 è pubblicata (non bozza, con installer, latest.yml, APK 2.71.0 firmato e app-android.json) e non è installata. I commit coprono tutto il lavoro: c-14, Strumenti e giro dei menu, Sposta su, ruoli, domande, velocità. Nel quaderno ci sono il piano, le schede e il rapporto. Il commit b13a377 contiene lavoro vero, solo con un messaggio sbagliato, e la causa è corretta in b72155f. Resta solo la prova di «Sposta su» fra due PC veri, che si può fare soltanto dopo che Nicholas installa: è un punto aperto con un motivo.
- **2026-10-13 12:38** — scheda nel quaderno: 0.71.0: da verificare dopo l'installazione di Nicholas

## In numeri

- interventi: 113
- cartella: `~\Documents\SierraDeck`
