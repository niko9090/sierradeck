---
titolo: "Velocità delle richieste: dalla richiesta alla versione (numeri «prima», dal 21/10)"
quando: 2026-10-23T15:10:00+02:00
tag: ["0.85.0", "velocità", "rapporto", "punto"]
---

# Velocità delle richieste — i numeri «prima» (dal 21/10)

Fatta da c-129 per la 0.85.0. I numeri vengono dal registro dell'autopilota «App Android: analisi, correzioni e allineamento»: dialogo, diario delle decisioni (chat aperte, finite, approvate, unite) e date delle release su GitHub (`publishedAt`). Fotografia del 23/10 alle 15:10 (ora italiana). La 0.84.4 non era ancora uscita, quindi le richieste del 22-23/10 risultano «unite» e non ancora «pubblicate».

## Come si misura (`src/shared/velocita-richieste.ts`)

- **Richiesta**: ogni messaggio di Nicholas all'autopilota. Le risposte brevi (al massimo 3 parole: «si», «rifallo ancora») e le risposte alle domande («Hai risposto: …») continuano la richiesta di prima. Il dialogo ricorda solo 60 battute: le richieste più vecchie si ritrovano dalla risposta «su tua richiesta» nel diario. Il loro testo qui sotto è quindi l'inizio della risposta, non le parole di Nicholas.
- **Chat della richiesta**: la chat il cui compito è stato messo in coda («nuovo compito in coda») per quella richiesta; se non si sa, l'ultima richiesta arrivata prima che la chat partisse. Una chat aperta al posto di un'altra, e la Revisione di una chat, lavorano per la stessa richiesta.
- **Unita**: l'ultima unione dell'ultima chat di lavoro (il ramo si unisce a ogni fine turno, quindi conta l'ultima unione). **Versione**: la prima release pubblicata dopo l'unione.
- **Tempo perso**: *partenza* = dalla richiesta alla prima chat; *attese* = chat ferme, mute, messe da parte o in attesa di una risposta (sommate fra le chat); *Revisione* = dal lavoro consegnato all'approvazione, rifacimenti compresi; *unione* = dall'approvazione al ramo principale; *pubblicazione* = dall'unione alla release.
- Una richiesta senza chat nuove dopo un'ora, o già seguita da un'altra, non si misura: era una domanda («a che punto siamo?») oppure il lavoro è passato alle chat già aperte.

## Le richieste dal 21/10

| Arrivata | Stato | Chat | Prima chat | Unita | Versione | Richiesta → versione | Partenza | Attese | Revisione | Unione | Pubblicazione | Richiesta (inizio) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 21/10, 08:08 | pubblicata | c-45, c-46 | 21/10, 10:46 | 21/10, 12:58 | 0.82.1 | 8 h 54 min | 2 h 38 min | 0 | 0 | 0 | 4 h 05 min | (risposta) Va bene: la prossima versione è la 0.83.0, tutta dedicata all'app Android |
| 21/10, 11:47 | pubblicata | c-47…c-52 (6) | 21/10, 12:31 | 21/10, 15:51 | 0.82.1 | 5 h 15 min | 44 min | 0 | 0 | 0 | 1 h 11 min | (risposta) Ricevuto, e grazie per averlo scritto qui |
| 21/10, 15:53 | pubblicata | c-53…c-71 (19) | 21/10, 16:02 | 21/10, 20:31 | 0.84.1 | 20 h 02 min | 9 min | 1 h 59 min | 0 | 0 | 15 h 24 min | (risposta) Ricevuto: prima di tutto le chat che si bloccano |
| 22/10, 08:55 | pubblicata | c-72…c-84 (13) | 22/10, 09:04 | 22/10, 12:34 | 0.84.2 | 14 h 45 min | 9 min | 1 h 31 min | 45 min | 0 | 11 h 06 min | L'AUTOPILOTA DEVE FERMARSI SOLO QUANDO HA FINITO TUTTO |
| 22/10, 23:49 | unita | c-85…c-118 (34) | 22/10, 23:58 | 23/10, 09:50 | — | — | 8 min | 1 h 08 min | 6 h 38 min | 0 | — | continuano a esserci errore, hai pubblicato tutto?? |
| 23/10, 11:48 | unita | c-119…c-124 (6) | 23/10, 11:49 | 23/10, 14:55 | — | — | 1 min | 10 min | — | — | — | a che punto siamo? (con i «rifallo ancora» di prima: 0.84.4) |
| 23/10, 13:42 | unita | c-125, c-126 | 23/10, 13:43 | 23/10, 14:08 | — | — | 1 min | 0 | 0 | 0 | — | domande che non hanno senso… sei tu che devi trovare le soluzioni |
| 23/10, 14:28 | in corso | c-127…c-130 (4) | 23/10, 14:39 | — | — | — | 12 min | 0 | — | — | — | qui come siamo messi? … (la 0.85.0) |

Altre 16 richieste dal 21/10 non hanno aperto chat nuove (domande, o lavoro passato alle chat già aperte).

## Cosa dicono i numeri

- **Dalla richiesta alla versione: mediana 8 h 54 min** (4 richieste pubblicate; da 5 h 15 min a 20 h 02 min).
- **Il tempo si perde soprattutto dopo l'unione**: mediana della *pubblicazione* 4 h 05 min, con punte di 15 h 24 min (unito alle 20:31 del 21/10, ma la 0.84.0 era uscita alle 20:28 e la 0.84.1 solo il giorno dopo alle 11:55) e 11 h 06 min. Il codice è pronto ore prima che Nicholas lo possa installare.
- **Partenza veloce**: mediana 9 min dalla richiesta alla prima chat, tranne il mattino del 21/10 (2 h 38 min).
- **Attese delle chat**: fino a 2 ore sommate per richiesta (chat ferme, mute o messe da parte), quasi sempre in richieste con molte chat.
- **Revisione**: di solito non pesa; 6 h 38 min nella richiesta del 22/10 sera (c-85…c-118, i rami rimandati indietro 4-5 volte per l'ambiente della copia: corretto nella 0.84.4).

## Dove si vede

- Nel **Punto**, su PC, pagina e app: «Velocità: Dalla richiesta alla versione: 8 h 54 min (mediana di 4). Perso: pubblicazione 4 h 05 min, partenza 9 min.», con la spiegazione dietro il «?».
- Il servizio rilegge le release con la data da GitHub all'avvio e ogni 10 minuti (`src/autopilot-host/release-uscite.ts`) e le salva nell'autopilota (`releaseUscite`): PC, pagina e app non chiamano GitHub.

## Limiti da sapere

- L'attribuzione chat → richiesta è per tempo e per compito in coda: con molte richieste ravvicinate una chat può finire sulla richiesta vicina. Quando la 0.85.0 registra le richieste come obiettivi (c-127), si potrà legare ogni chat alla sua richiesta per nome.
- Le richieste del 21/10 mattina vengono dalla risposta nel diario: l'ora d'arrivo è quella della risposta (in genere pochi secondi dopo).

## «Dopo»

Da riempire dopo la 0.85.0: stessa misura sulle richieste dal 24/10, da confrontare con questa tabella.
