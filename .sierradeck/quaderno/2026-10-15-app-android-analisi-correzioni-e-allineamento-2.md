---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-15T15:04:38.597Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.73.0: schermate leggibili (spunta al posto di «consegnato alle», Domande essenziali); risposte della scheda che non si perdono; chat che non restano «in attesa» quando sono ferme; lista degli autopiloti chiara; nessuna chat aperta da sola su altri PC; agenti specializzati visibili, ognuno nella sua chat con il ruolo nel nome, e elencati nella scheda dell'autopilota. Su PC, pagina e app. Una sola release 0.73.0, mai installata da noi; rapporto in italiano. Restano le protezioni della 0.72.0. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Righe «consegnato alle» sostituite da un segno di spunta; una riga solo per un messaggio fermo, con Manda adesso; PC, pagina e app; test
- ⬜ Domande essenziali: domanda in una frase, scelte come tasti, Scrivi tu, dettagli dietro il punto interrogativo, nessuna cronologia; PC, pagina e app; test
- ⬜ La risposta dell'autopilota alla scheda arriva anche se è lunga o ha caratteri speciali; test
- ⬜ Le chat ferme non restano «in attesa»: causa trovata, stato giusto subito, coda che parte; test
- ⬜ Lista degli autopiloti chiara e aggiornata, senza doppioni, su PC, pagina e app
- ⬜ Nessuna chat si apre da sola su altri PC: solo con un comando di Nicholas; test
- ⬜ Agenti specializzati visibili: ognuno nella sua chat con il ruolo nel nome, elencati nella scheda dell'autopilota con stato e Guarda; prova dal vero con un autopilota di prova
- ⬜ Prova con clic veri su una copia di prova, foto prima/dopo e rapporto in italiano
- ⬜ Versione 0.73.0 pubblicata con APK, latest.yml e app-android.json, non bozza, mai installata
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano

## Le mosse che contano

- **2026-10-15 07:41** — supervisore → chiediUtente: Il push e la release della 0.72.0 sono bloccati dal login di GitHub, che è andato perso e che solo Nicholas può rifare (gh auth login -h github.com, poi gh auth setup-git).
- **2026-10-15 10:11** — su tua richiesta: Capito, grazie. Ho controllato da questo PC e la causa più probabile c'è: **il telefono è scollegato da Tailscale da circa un giorno.** Nell'elenco di Tailscale il tuo S25 Ultra risulta «offline», visto l'ultima volta ieri. Dal telefono i PC si raggiungono solo in due modi: la stessa rete di casa, o
- **2026-10-15 13:26** — il servizio è ripartito: la domanda aperta è stata ritrovata, aspetto ancora la tua risposta
- **2026-10-15 13:28** — risposta tardiva: GIA FATTO
- **2026-10-15 13:30** — supervisore → finito: Tutti i criteri con comando passano (13:30 UTC) e la 0.72.0 è pubblicata e non installata. Nel quaderno ci sono la causa analizzata, le protezioni e i difetti corretti. Il messaggio in chiaro per il telefono che non si collega è segnato per la prossima versione, e la si comincia quando Nicholas la chiede.
- **2026-10-15 13:30** — scheda nel quaderno: Dopo la 0.72.0: cosa resta
- **2026-10-15 13:39** — su tua richiesta: Scusa, è un difetto mio: le ultime due risposte non sono partite perché erano troppo lunghe e con caratteri che il programma non riusciva a leggere. Adesso ho capito cosa vuoi e lo faccio.

1. Le righe «consegnato alle...» spariscono. Un messaggio arrivato avrà solo un piccolo segno di spunta accant
- **2026-10-15 13:39** — ripreso su tua richiesta («Riprendi»)
- **2026-10-15 13:49** — su tua richiesta: Ricevuto. Ti dico cosa sistemo, tutto nella stessa versione. Siccome ci sono cose nuove diventa la 0.73.0, ed è sempre una versione sola, che installi tu.

1. Chat bloccate «in attesa» anche quando sono ferme. Trovo dal registro perché succede e lo correggo: quando una chat è ferma, il suo stato dev
- **2026-10-15 13:51** — la chat lavora e un messaggio aspettava da 2 min: glieli scrivo adesso, durante il turno
- **2026-10-15 15:04** — supervisore → finito: Ho verificato tutto: la 0.73.0 è pubblicata (non bozza, con installer, latest.yml, APK 2.73.0 e app-android.json) e non è installata, perché su questo PC c'è ancora la 0.72.0. Su origin c'è tutto, i commit coprono i punti da A a G, i test passano e il rapporto è nel quaderno. I punti aperti hanno un motivo: per provare l'app manca un telefono collegato, e i riquadri dal vivo li deve scegliere Nicholas.
- **2026-10-15 15:04** — scheda nel quaderno: Dopo la 0.73.0: cosa resta

## In numeri

- interventi: 117
- cartella: `~\Documents\SierraDeck`
