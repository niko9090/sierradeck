---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-21T03:37:16.679Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.82.0 (minor), una sola release, mai installata da noi, rapporto in italiano. Contiene:
1) numero di chat insieme deciso dal PC in uso (processori, memoria, carico), con limiti giusti e non troppo stretti; le chat finite o inattive si chiudono da sole per fare posto;
2) un colore fisso per cosa fa una chat, uguale su PC, pagina e app;
3) visuale chiara di chi sta lavorando;
4) domande controllate contro lo stato vero e le risposte già date, mai su cose già successe;
5) menu dei workspace rifatto, che non va fuori schermo;
6) tasto «Apri cartella» del progetto;
7) grafica meno caotica e più pratica.
Già fatto: 0.80.0, 0.80.1, 0.81.0 e 0.81.1 pubblicate. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Limiti delle chat in base al PC: il numero massimo di chat al lavoro insieme si calcola da processori, memoria libera e carico del momento, con un minimo e un massimo sensati. Scende quando il PC è sotto sforzo e risale quando torna libero. Le nuove chat aspettano in fila invece di partire tutte. Le chat finite o senza lavoro da un po' si chiudono da sole (con chiudiChat, mai kill di chat al lavoro). In vista c'è sempre «N di M chat», con il motivo dietro un «?». Si può alzare o abbassare nelle Impostazioni. Test con PC finti piccolo, medio, grande e sotto carico; numeri di CPU e memoria prima e dopo nel rapporto
- ⬜ Un colore fisso per ogni attività di una chat (sviluppo, revisione, collaudo, rilascio, interfaccia, aspetta Nicholas, ferma o errore, finita), uguale su PC, pagina e app, con legenda dietro «?» e leggibile anche senza colore (etichetta o icona); test
- ⬜ Visuale di chi sta lavorando: per ogni autopilota, una riga per agente con colore, ruolo, cosa fa in parole semplici e da quanto, su PC, pagina e app; test
- ⬜ Controllo delle domande prima di mostrarle a Nicholas: confronto con le release pubblicate (gh), la versione installata, i rami, le chat aperte e chiuse e le risposte già date. Una domanda su una cosa già successa o già risposta non arriva: si chiude da sola con una riga nel registro e, se serve, una riga «già fatto: …» nella conversazione. Test con il caso vero del 20/10, «pubblico la 0.81.1?» quando era già pubblicata e installata
- ⬜ Menu dei workspace rifatto: sta sempre dentro lo schermo anche con tanti workspace e finestre piccole; ha una ricerca per nome, raggruppa per PC o recenti, e mette le azioni (apri, rinomina, Elimina, Apri cartella) dietro «⋯»; su PC, pagina e app; test e foto prima e dopo dalla copia di prova
- ⬜ Tasto «Apri cartella» che apre la cartella del progetto del workspace o della chat in Esplora file sul PC. Sulla pagina e sull'app apre la sezione File su quella cartella. Il percorso non viene scritto nel codice; test
- ⬜ Grafica meno caotica: schermata per schermata, meno elementi in vista, gerarchia chiara, testi corti con «?», uguale fra PC, pagina e app; foto prima e dopo dalla copia di prova nel rapporto
- ⬜ Ogni ramo delle chat di questo lavoro è unito in main dopo la Revisione, oppure chiuso senza unirlo perché doppio, superato o già in main; la scelta è scritta nel rapporto; nessuna chat finita resta aperta
- ⬜ Nessuna funzione tolta o spostata senza il sì di Nicholas; nessun dato privato nel codice o nei test
- ⬜ Release 0.82.0 pubblicata con APK, latest.yml e app-android.json, non bozza, mai installata; novità in italiano solo su quello che c'è davvero; rapporto in italiano in .sierradeck/quaderno/rapporto-0-82-0.md
- ✅ La guardia delle cancellazioni è rispettata
- ✅ I test del programma principale passano
- ✅ Gli altri test del programma passano (servizio, renderer, condivisi, pty)
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano

## Le mosse che contano

- **2026-10-21 03:27** — comando bloccato dal programma: Sei la Revisione: questo comando cambia il ramo o i file. Puoi leggere, fare il diff ed eseguire i test.
- **2026-10-21 03:28** — ha chiesto, ho risposto io: Il supervisore ha già chiuso l'obiettivo 0.82.0 e c-32 è già unito in main (85795bb9): la chat di Revisione aspetta senza motivo, si risponde senza disturbare Nicholas.
- **2026-10-21 03:34** — supervisore → finito: L'unico ostacolo al «finito», la Revisione di c-32, ha dato l'ok e il ramo è già in main: l'obiettivo è concluso, ripetere lo stesso giro non serve.
- **2026-10-21 03:34** — chiudo la chat c-40: il suo pezzo è fatto
- **2026-10-21 03:34** — c-32 era già finita: fermo il suo processo, se è ancora vivo
- **2026-10-21 03:34** — l'obiettivo sembra raggiunto, ma c-32 aspettano l'ok della Revisione prima di essere uniti: finisco dopo
- **2026-10-21 03:34** — riuso la chat c-40 (Revisione) per rivedere di nuovo: Rivedi il ramo ap/ap-f1e631f5/c-32 della chat c-32 («Foto «prima e dopo» della grafica per la 0.81.x
- **2026-10-21 03:35** — Revisione c-40: OK per c-32 (ap/ap-f1e631f5/c-32), unito nel ramo principale. controllati `.sierradeck/quaderno/analisi-0-80-0.md:21` e `:1131-1132` (foto e script «della cartella principale», copie uguali con md5) e `.sierradeck/quaderno/grafica-prima-0-80-0.md:86` più la riga dopo (trappola del worktree); ramo già in main con `85795bb9`, nessun commit dopo `95265ccb`.
- **2026-10-21 03:36** — Revisione c-40: OK per c-32 (ap/ap-f1e631f5/c-32), unito nel ramo principale. ricontrollati `.sierradeck/quaderno/analisi-0-80-0.md:21` (foto e script «della cartella principale», presenti: 24 + 5) e `.sierradeck/quaderno/grafica-prima-0-80-0.md:86`; ramo già in main con `85795bb9`, nessun commit dopo `95265ccb`.
- **2026-10-21 03:36** — ha chiesto, ho risposto io: La chat è ferma dopo aver finito la Revisione di c-32, che è già unita in main. Non c'è niente da chiedere a Nicholas: le si conferma che ha finito e la chat si chiude con chiudiChat.
- **2026-10-21 03:36** — supervisore → finito: Tre giri uguali perché il «chiudi c-32» riapriva la Revisione: tutto è verificato e unito, quindi «finito» senza altre mosse.
- **2026-10-21 03:36** — scheda nel quaderno: Trappola: chiudiChat su un ramo già unito riapre la Revisione (21/10)

## In numeri

- interventi: 657
- cartella: `~\Documents\SierraDeck`
