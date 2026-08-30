---
titolo: "Quando la chat fa una domanda: rispondere da soli, e chiedere in modo chiaro"
quando: 2026-08-31T00:10:00+02:00
tag: ["autopilota", "domande", "supervisore", "hook"]
---

# Il difetto: ogni bivio tornava indietro, e tornava indietro illeggibile

Prima della **0.12.44** la notifica di Claude Code (`/hook/notification`)
faceva una cosa sola: marcava l'autopilota `attesa`, apriva una domanda per
l'utente e mandava l'avviso. Nessun tentativo di rispondere.

Due danni, e il secondo era peggiore del primo.

**Un autopilota che delega indietro ogni bivio non fa risparmiare tempo, ne fa
perdere.** Chi lo ha lanciato torna alla scrivania e trova il lavoro fermo su
«uso npm o pnpm?» — una domanda a cui l'obiettivo, i criteri e il progetto
rispondono da soli.

**E la domanda non era una domanda.** Il testo girato all'utente era
`` `${notification_type}: ${message}` ``, cioè roba come
`attesa: Claude is waiting for your input`. La domanda vera **non sta nella
notifica**: la notifica dice che la chat è ferma e perché, non cosa vuole.
Quello sta nell'ultimo messaggio della conversazione.

## Le tre parti della correzione

**1. Leggere la domanda vera** — `autopilot-host/trascrizione.ts`.
`ultimoMessaggioAssistente` legge il JSONL di Claude Code dalla fine e tiene
solo i blocchi di testo (le chiamate a strumenti non sono cose dette a
qualcuno). Non solleva mai: è il file di un altro programma, può non esserci,
può essere in mezzo a una scrittura, e il formato è già cambiato una volta fra
le versioni — per questo si accettano sia `{message:{role,content}}` sia
l'oggetto piatto. `componiDomanda` unisce notifica e messaggio: nessuna delle
due basta da sola.

**2. Provare a rispondere** — `autopilot-host/risposta-autonoma.ts`. La domanda
passa dal supervisore, che è una sessione Claude Code viva nella cartella del
progetto e può guardare i file. Il prompt dice **esplicitamente** che rispondere
è il caso normale: senza quella riga un modello prudente gira all'utente
qualunque cosa, che è il comportamento da togliere. Si chiede alla persona solo
per tre cose — un segreto, una spesa, una scelta sul suo prodotto o un'azione
distruttiva che non si annulla.

Un giudizio **illeggibile vale «chiedi», non «rispondi»**: una risposta
inventata entra nella chat come una decisione presa, e da lì in poi il lavoro va
avanti su una premessa che nessuno ha mai stabilito. Stessa cosa se il
supervisore non risponde affatto.

Mentre il supervisore pensa l'autopilota va messo in `inLavorazione`, o il
guardiano del silenzio sospende proprio chi sta facendo quello che gli è stato
chiesto.

**3. Chiedere in modo leggibile** — `domandaChiara`. Chi risponde può avere un
telefono in mano e non aver seguito niente delle ultime due ore: una domanda che
dà per scontato il contesto («uso la porta 8080?») non è una domanda, è un
indovinello. Il testo nomina chi chiede, a che lavoro, perché serve adesso, la
domanda, e **cosa succede se non rispondi subito** — quella riga è la più
importante: senza, una domanda scaduta sembra lavoro perso e chi la vede tardi
lascia perdere invece di rispondere.

Vale per tutte e due le strade: la notifica *e* il `chiediUtente` che esce dal
giudizio sullo `Stop`.

## Il caso che funzionava già

Se la chat fa una domanda e **chiude il turno**, scatta `Stop`, non
`Notification`: lì il supervisore riceveva già `## Ultimo messaggio della chat`
e poteva rispondere con `prosegui` + istruzioni. Aggiunta una riga al prompt che
lo dice a chiare lettere, perché era implicito e l'implicito qui costa un
autopilota fermo.

## Da ricordare

- `Notification` **non trattiene** l'hook (a differenza di `Stop`): la chat
  resta ferma al suo prompt e riparte quando le si scrive dentro. Per questo la
  risposta si consegna con `avviaLavoro(a, risposta, chat)` — è testo scritto
  nella chat, come lo scriveresti tu.
- Con `--dangerously-skip-permissions` (che è come nascono le chat governate) le
  notifiche di permesso non arrivano quasi mai: quella che si vede davvero è
  l'attesa d'input. È il motivo per cui leggere la trascrizione non è un extra
  ma l'unica fonte della domanda.
