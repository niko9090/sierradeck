---
titolo: "Rapporto 0.84.1 (bozza): autopilota mai fermo, rami, prova delle 2 ore"
quando: 2026-10-22T10:05:00+02:00
tag: ["0.84.1", "rapporto", "autopilota", "mai-fermo", "rami"]
---

Bozza di c-72, 22/10. La 0.84.1 non è ancora pubblicata: questo rapporto si
completa con la release. Mai installata da noi: l'installazione la avvia solo
Nicholas.

## 1. La causa della fermata della notte 21-22/10

**Causa.** L'autopilota decideva qualcosa solo quando una sua chat chiudeva un
turno (hook `Stop`). Il guardiano, ogni minuto, metteva da parte una chat zitta
da un'ora, ma non la riprendeva. Senza turni chiusi nessuno svegliava più
l'autopilota.

**I dati** (diario di `ap-f1e631f5`):
- c-65, c-66 e c-70 al lavoro, con gli ultimi segni di vita verso le 22:27;
- messe da parte alle 23:23 (c-70), 23:30 (c-66) e 23:34 (c-65);
- due erano ferme al prompt senza messaggi in coda, quindi la consegna alle chat
  ferme non le toccava; la terza era zitta;
- dalle 23:34 alle 06:51 nessun turno chiuso e nessuna mossa. Alle 06:51 ha
  ripreso tutto il messaggio di Nicholas.

**Correzione** (commit `e2a7dbf4`, unita in main con `28188217`):
`src/autopilot-host/mai-fermo.ts`, chiamato dal guardiano in `server.ts`.
- Se l'autopilota è «al lavoro» e da 10 minuti nessuna chat lavora, il servizio
  fa un giro da solo. Nel diario resta una riga con lo stato di ogni chat.
- Una chat zitta viene interrotta, se non è già ferma al prompt, e riceve di
  nuovo l'ultima istruzione valida.
- Se 10 minuti dopo è ancora zitta, il suo compito passa a una chat nuova,
  nella stessa cartella e sullo stesso ramo. La vecchia va nel recupero di 30
  giorni. Il compito resta a una chat sola. Il tetto è di 2 chat nuove per
  compito; dopo, solo riprese e una riga a Nicholas.
- Una chat messa da parte mentre le altre lavorano non resta abbandonata.
- Se non c'è nessuna chat aperta si aprono i compiti in coda. Se la coda è
  vuota, si apre una chat che riprende l'obiettivo. Chi aspetta una risposta di
  Nicholas non viene toccato.
- «Finito» vale solo con nessuna chat aperta. Prima, quando l'autopilota
  finiva, venivano chiuse anche le chat ancora al lavoro.
- Funziona anche dopo un riavvio: il silenzio si conta dalla partenza del
  servizio, e le riprese sono salvate su disco.

**Test**: `tests/autopilot-host/mai-fermo-0-84-1.test.ts`, 21 test, con il caso
vero della notte:
- con l'ultimo segnale alle 22:27 e due chat ferme, il giro arriva entro 15
  minuti;
- lo stesso dopo un riavvio, con lo stato su disco della notte;
- le chat che restano zitte passano a chat nuove sugli stessi rami, senza
  doppioni;
- una chat che risponde dopo la ripresa non viene sostituita;
- «finito» con una chat ancora aperta non chiude.

Tre test vecchi di `server.test.ts` aspettavano che la chat restasse da parte:
ora viene ripresa nello stesso giro. Dettagli e trappole nella scheda
`autopilota-mai-fermo-0-84-1.md`.

## 2. I rami di questo lavoro

Verificato su `git log main` il 22/10. Le unioni dei rami del collaudo le ha
fatte c-73 sul suo ramo (vedi `rami-0-84-1.md`); il ramo c-73 è entrato in main
con `9e65759b`.

| Ramo | Scelta | Commit di unione | Motivo |
|---|---|---|---|
| c-68 | **unito** | `beb07159` (in c-73) | D1-D4 del collaudo di coordinazione: «Riprendi» non riapre le chat concluse, Rilascio nel recupero, `**SEGNALE:**` in grassetto, conversazione ripristinata non richiusa |
| c-556 | **unito** | `a0486c47` (in c-73) | hook ECC spenti anche nelle copie delle chat (`hook-ecc.ts`) |
| c-66 | **doppio** di c-68 | `ca5bb2c2` (in c-73) | stessi D1-D4: tenuti codice e test di c-68, di c-66 restano solo i documenti |
| c-70 | **unito** | `782b948a` (in c-73) | gli 8 difetti delle domande chiare, più il «perché» della Revisione e la domanda dopo un riavvio |
| c-65 | **doppio** di c-70, tranne il difetto 6 | `0f6df7d4` (in c-73) | preso solo il campo `superata` della scheda (`fe8e48cd`), che c-70 aveva fatto a metà |
| c-73 | **unito** | `9e65759b` | il ramo che raccoglie le unioni sopra, dopo la Revisione; misurato verde (TypeScript, 2401 + 604 + 1870 test, Android) |
| c-72 | **unito** | `28188217` | autopilota mai fermo (questo lavoro) |

**Da pulire nella coda dell'autopilota.** Ci sono ancora compiti superati:
- «Rivedi il ramo» di c-66, c-65 e c-70: già uniti da c-73;
- «0.84.1 PRIMA DI TUTTO»: è questo lavoro, già in main;
- «Aggiornare lista-lavori.md con la richiesta del 22/10»: riga 5.0, già
  scritta.

Non vanno dati a chat nuove.

## 3. La prova delle 2 ore

**Metodo.** È il servizio vero (`creaServer`, con gli orologi veri e il
guardiano ogni minuto), su dati isolati in una cartella di prova sotto la
cartella temporanea della chat, sulla porta 47681. Nessun dato di Nicholas è
toccato. Il Gestore e le chat invece sono simulati: non è l'app intera con chat
Claude vere.

**Come si comportano le chat simulate.** A ogni turno ricevuto, con un seme
fisso:
- 62%: lavorano da 2 a 11 minuti (battito ogni minuto), poi chiudono il turno;
- 18%: diventano mute, come su un comando che non finisce; l'interruzione le
  sblocca;
- 8%: diventano morte e non rispondono più a niente;
- 12%: restano ferme al prompt.

**Come procede la prova.** Il supervisore dice «prosegui» finché i criteri sono
rossi. I criteri diventano verdi negli ultimi 8 minuti. A metà prova il servizio
si riavvia e perde la memoria dei segnali. Ogni 15 secondi si misura:
- quante chat lavorano davvero;
- il tratto più lungo con l'autopilota «al lavoro» e nessuna chat che lavora;
- i doppioni;
- un «finito» con chat aperte.

**Il freno ha tenuto 2 chat attive su 4.** All'avvio le chat sono 4. Alla prima
fine turno c-3 e c-4 sono andate in pausa con «limiti del piano non ancora
letti: al massimo 2 specialisti finché non so quanto resta». È lo stesso freno
del programma vero (`tettoDellaFlotta`). Nella prova nessun Gestore manda i
limiti del piano, quindi il servizio fa quello che fa sul PC quando non li
conosce: al massimo 2 chat insieme. Le chat in pausa non sono «al lavoro» e il
giro da solo non le tocca: ripartono quando il freno lo permette. La prova
quindi misura il «mai fermo» su 2 chat attive, che è anche il caso più difficile:
con meno chat è più facile che restino tutte zitte.

**Numeri a metà (10:40, 64 minuti di prova).** Presi dal diario della prova e
dall'archivio della copia, in sola lettura.

| Cosa | Quanto |
|---|---|
| Tratto più lungo con l'autopilota «al lavoro» e nessuna chat che lavora | **11 minuti** (10:17 → 10:28) |
| Tratti oltre i 15 minuti | 0 |
| Giri partiti da soli | 1 (10:28) |
| Chat riprese (interrotte e con l'ultima istruzione) | 2 (c-1 e c-2) |
| Chat sostituite da una chat nuova | 0 (tutte e due hanno ripreso a lavorare) |
| Chat messe da parte (60 minuti) | 0 |
| Doppioni | 0 |
| Riavvio del servizio | 10:36, poi le chat riprese dalla ripresa d'avvio |

c-2 era muta dalle 09:39. Mentre c-1 lavorava, c-2 restava ad aspettare: la
messa da parte scatta a 60 minuti. Alle 10:17 anche c-1 si è zittita, e da quel
momento nessuna chat lavorava più. Alle 10:28 è partito il giro da solo, 11
minuti dopo (10 di soglia, più il minuto del guardiano). Le due chat sono state
interrotte e hanno ricevuto di nuovo l'ultima istruzione. Per c-2 sono 49
minuti, quindi prima dei 60 della messa da parte. Tutte e due hanno ripreso a
lavorare al turno dopo.

**Numeri alla fine (11:36, 120 minuti di prova).** Presi dalla misura della
prova stessa, ogni 15 secondi (`esito-prova.json`).

| Cosa | Quanto |
|---|---|
| Tratto più lungo con l'autopilota «al lavoro» e nessuna chat che lavora | **12 minuti** |
| Tratti senza nessuna chat al lavoro | 3, tutti chiusi da un giro da solo |
| Tratti oltre i 15 minuti | **0** |
| Giri partiti da soli | 4 (3 «nessuno al lavoro», 1 per una chat già ripresa e ancora zitta) |
| Riprese (chat rimesse al lavoro con l'ultima istruzione) | 7, di cui 5 con interruzione: le altre erano già ferme al prompt |
| Chat sostituite da una chat nuova | 0 |
| Chat messe da parte (60 minuti) | 0: il giro da solo è sempre arrivato prima |
| Doppioni (lo stesso compito a due chat) | 0 |
| «Finito» con chat aperte | 0 |
| Chat simulate | 23 fine turno; 7 volte mute, 3 ferme al prompt, 0 morte |

**Cosa non ha coperto la prova.**
- **Il passaggio a una chat nuova.** Con il seme della prova nessuna chat è
  diventata «morta», e ogni chat ripresa ha ripreso a lavorare. Il passaggio
  lo provano i test (`mai-fermo-0-84-1.test.ts`, anche con lo stato della notte
  dopo un riavvio).
- **Il «finito».** I criteri sono diventati verdi a 112 minuti. La memoria dei
  criteri, però, ricorda l'esito per commit, e nella prova il codice non cambia
  mai: alla fermata delle 11:35 il criterio risultava ancora rosso. Dopo tanti
  giri identici le regole hanno chiesto a Nicholas («Sono bloccato…»). Quella
  chat è passata «bloccata», cioè in attesa di una persona: non è ferma per un
  difetto. Nel programma vero un criterio cambia solo con un commit.

**Visto nella prova, da guardare (non toccato, è fuori da questo lavoro).** Al
riavvio del servizio (10:36) la ripresa d'avvio ha rimesso al lavoro anche c-3
e c-4, che erano in pausa per il freno: `chatDaRiprendere` in `ripresa.ts`
prende tutte le chat non finite. Dopo un turno il freno le ha rimesse in pausa,
quindi non è un danno. Però è un turno che il freno non avrebbe permesso.

## 4. Le voci 0.84.1 ancora aperte

| Voce | Chat | Stato al 22/10 mattina |
|---|---|---|
| Domande dalle chat degli altri PC: testo intero, contesto, progetto e PC, scelte in italiano, tasto «Apri la chat su <PC>» | c-74 | al lavoro sul suo ramo (parte del lavoro era nel ramo `wip/domande-altri-pc-c628`) |
| Risposte dal riquadro verificate sul PC della chat, un nuovo tentativo, esito visibile, voce nel registro | c-75 | al lavoro; un primo giro è già in main (`214cc0c6`, unito con `d1f9e092`) |
| Errori dell'interfaccia del 21/10: «grezze», «sierradeck:al-telefono», chat chiuse con la cartella cancellata | c-76 | al lavoro sul suo ramo |
| «Aggiorna adesso»: mette in pausa le chat in sicurezza e installa subito; dopo «Installa» nessuna consegna nuova; l'installazione la avvia solo Nicholas | — | in coda, nessuna chat ancora |
| Segnale delle chat (parto, fatto, bloccata, aspetto) in vista su pagina e app | — | in coda, nessuna chat ancora |
| Release 0.84.1: APK nuovo con `npm run allega-apk` (`android/` è cambiato), `latest.yml`, `app-android.json`, non bozza | — | in coda, dopo tutte le voci sopra |
