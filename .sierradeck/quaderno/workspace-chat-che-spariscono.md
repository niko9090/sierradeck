---
titolo: "Workspace: perché creando o cambiando sparivano le chat"
quando: 2026-08-27T11:55:00+02:00
tag: ["workspace", "layout", "difetto", "persistenza"]
---

## Il sintomo
«Creo o cambio workspace e non trovo più le chat.» Nella sessione in corso il
guasto sembrava andare e venire — la memoria dei workspace, che vince sul disco,
rimetteva a schermo i riquadri vivi e copriva il danno. Dopo un riavvio le chat
non c'erano più davvero.

## Causa 1 — il nome vecchio (era questa, quasi sempre)
Il salvataggio del layout è **sincrono**: `cambiaVista` fa un `set` sullo store,
zustand avvisa i sottoscritti nello stesso istante e `persistenza-layout` manda
subito `layout:salva(layout, nomeDelWorkspace)`.

Quel nome veniva dallo stato di React (`attivoOra`), che i chiamanti aggiornavano
**dopo** che la promessa del cambio rientrava — cioè dopo `cambiaVista`. Il Core
riceveva quindi «il layout di B, salvalo sotto A» e obbediva, come deve:

- **creando** un workspace il layout della destinazione è vuoto → A veniva
  **azzerato**;
- **cambiando** workspace → A si ritrovava le chat di B, e l'invariante «una
  chat, un workspace» le toglieva a B.

Valeva per tutte e quattro le strade (fascia, pannello, telefono, il seguire il
cambio di un'altra finestra): passano tutte da `cambia`/`trasloca`.

**Rimedio.** `src/renderer/workspace-corrente.ts`: dove la finestra si trova vive
fuori da React, in un posto solo, leggibile e scrivibile in modo sincrono. Le
azioni lo dichiarano (`annunciaAttivo`) **prima** di `cambiaVista`; la persistenza
lo legge al momento del salvataggio; `App` lo tiene allineato allo stato React con
`aggiornaWorkspace`. Le azioni non ricevono più il nome da fuori: non c'è più
niente da passare, quindi niente da sbagliare.

## Causa 2 — la chiave del monitor che cambia sotto
L'archivio tiene i layout in una mappa **per monitor**, con chiave = geometria
dello schermo (posizione, risoluzione, scalatura). La chiave veniva ricalcolata a
ogni richiesta: bastava trascinare la finestra su un altro schermo, cambiare
risoluzione o scalatura, e la stessa finestra cominciava a chiedere una chiave
diversa da quella sotto cui aveva salvato. Il layout era ancora lì, ma nessuno lo
chiedeva più — e si vedeva esattamente come «cambio workspace e le chat non ci
sono».

**Rimedio.** In `ipc.ts` la chiave di archiviazione si decide **una volta sola per
finestra** (`chiaveDellaFinestra`, congelata alla prima domanda e liberata alla
chiusura). La geometria viva resta dov'è giusto averla — rimettere le finestre sui
loro schermi al ripristino di un'istantanea — sotto il nome `monitorDellaFinestra`.

## Causa 3 — `crea`/`elimina` partivano dall'attivo dell'archivio
`attivo` è dell'applicazione, non della finestra: con due finestre su workspace
diversi era quello dell'**altra**. Ora partono dal workspace che questa finestra
dichiara di mostrare, e ripiegano sull'archivio solo in avvio, quando non lo sa
ancora.

## Come si difende
`tests/renderer/workspace-azioni.test.ts` — il finto ambiente ora tiene separati
l'attivo dell'archivio e il workspace **dichiarato dalla finestra**, e registra
quale dei due valeva **nell'istante** di `cambiaVista`. Rimettendo
`annunciaAttivo` dopo `cambiaVista`, quattro prove cadono.

---

## Seguito (27/08, 0.12.10) — gli altri difetti trovati risalendo la stessa strada

**Il `claude.exe` orfano.** Spostare una chat in un altro workspace lasciava acceso
il suo processo. `staccaPane` mette il riquadro fra i `ceduti`, e i `ceduti` dicono
al `Terminal` di *staccare* invece di chiudere — giusto verso un'altra **finestra**,
dove qualcuno riprende subito il pty; verso un altro **workspace** non lo riprende
nessuno. L'ordine ora sta in `spostaInWorkspace`, accanto a `spostaRiquadro`: si
chiude **dopo** che la consegna è riuscita. Nello stesso punto, `staccaPane` non
portava con sé `model` né `ibernata`: una chat spostata tornava al modello
predefinito e una che dormiva si risvegliava da sola.

**Le ultime due scritture non atomiche.** `finestre-store` (che si scrive **alla
chiusura**, quando un'interruzione è più probabile) e `quaderno-store` (schede
scritte a mano, che nessuna sorgente rigenera).

**I tre interruttori morti.** `postoAutopilota`: il CSS c'era già ma non era
applicato a niente, e come scritto avrebbe girato `.riquadro`, che contiene anche
l'intestazione. Ora la classe sta sul **corpo** del riquadro, la direzione arriva da
`data-diario` sulla radice, e il diario si misura con `flex-basis` — la stessa
preferenza vale come larghezza di lato e come altezza sopra o sotto. «In una
finestra a parte» non è mai stato costruito: tolto dalle scelte.
`mostraAttesaChat`: il motore (`attesa-chat.ts`) era scritto e provato ma non lo
importava nessuno — modulo morto e interruttore morto sono la stessa cosa vista da
due lati. `portaAutopiloti`: il servizio è un processo a parte e importava la
costante; ora la porta gli arriva nell'ambiente, e la stessa raggiunge gli hook di
ogni chat come **lettura** e non come numero, perché si compongono all'apertura.

**Flotta: la chat fantasma.** `apriChatMancanti` toglie i compiti dalla coda e
registra le chat *prima* di avviare i processi — giusto, o una chat viva e non
registrata resterebbe orfana. Ma su avvio fallito il catch scriveva solo nel log: il
compito era già uscito dalla coda e restava una chat in `lavoro` che non girava.
E `chiatteAttive` conta proprio quelle: il fantasma teneva un posto **per sempre**.
Tre avvii falliti con il tetto a tre e l'autopilota non apriva più niente, vivo e
fermo. Ora `dopoAvvioFallito`, con tre tentativi e poi si lascia.

**I due residui del lost update.** La 0.9.39 aveva chiuso #1 e #4 con
`conservaCambiUtente`, ma due campi restavano fuori: `cicli` — riscritto col valore
letto all'inizio, quindi il conto **tornava indietro** di quanto avevano contato le
sorelle, e `cicliMax` è un freno dell'utente — e `decisioni`, dove il ragionamento
della chat sorella spariva dal diario. Le decisioni si fondono per contenuto, non
per posizione: un turno salva anche a metà strada, e alcune sono già lì.

## Cosa resta aperto
Guardiano per-chat (#6); `rete-sicurezza` (criteri non misurati, kill non ad albero,
`GET /consegne` senza ack); `sessioneSupervisore` sovrascritta fra turni concorrenti
(minore: fondere due id di sessione non ha un significato ovvio); i `ceduti` che
crescono ancora per lo spostamento **fra finestre**; i quattro difetti Android, che
per essere distribuiti vogliono una build firmata.

---

## 2026-08-28 — è successo di nuovo, e la causa non è chiusa

**Il fatto.** Aggiornamento 0.12.15 → 0.12.17 alle 07:56 (log: due «sessione
avviata» a due minuti di distanza). Dopo il riavvio, `workspaces.json`:

| workspace | cosa contiene | cosa doveva contenere |
|---|---|---|
| DDJ-Dj_Deck | la chat DDJ | giusto |
| Wdeck | la chat **HomeAssistant** | la chat Wdeck |
| HA | vuoto | la chat HomeAssistant |
| SierraDeck | la chat SierraDeck **e** la chat Wdeck | la sola chat SierraDeck |

Le chat si sono spostate **verso** altri workspace, e quello di partenza è
rimasto vuoto: la firma di `unaChatUnWorkspace`, che dopo un salvataggio
autorevole toglie una conversazione a tutti i workspace tranne il primo che la
contiene. Cioè: qualcuno ha salvato un layout *contenente chat altrui* sotto un
nome che l'archivio considerava autorevole.

**Cosa NON era.** Le difese già in piedi funzionano e sono state rilette una per
una: `workspace-corrente` (il nome dichiarato prima di `cambiaVista`),
`salvaLayoutAttivo` (che migra **solo** con nome autorevole),
`seguiAttivoDellaPrincipale` (solo la finestra più vecchia muove `attivo`). Il
buco è a monte: **come fa una finestra a mostrare i riquadri di un altro
workspace mentre ne dichiara uno valido.** Sospetti non verificati, in ordine di
plausibilità:

1. `chiaveDiFinestra` (`screen.getDisplayMatching`) al riavvio: due finestre, una
   per monitor, e per un istante possono risolvere alla stessa chiave prima di
   essere posizionate. Il layout del monitor 1 finirebbe caricato nella finestra
   del monitor 2, e riscritto sotto la chiave del monitor 2. Nei dati di oggi la
   chat «Wdeck» sta in `SierraDeck` **sotto la chiave del secondo monitor**,
   mentre in `Wdeck` il secondo monitor è vuoto: coerente.
2. La finestra di divergenza fra `layout:carica` e la prima
   `workspace:stato` risolta, se in mezzo scatta un `layout:salva`.

**Cosa è stato fatto (0.12.18), che non è la correzione.**

- **Copia di sicurezza prima di installare.** `aggiornamenti.ts`, al momento in
  cui `installazioneAvviata` diventa vero, copia `workspaces.json` in
  `workspaces.prima-dell-aggiornamento.json` nella cartella dei dati. Il riavvio
  per aggiornamento è l'unico momento in cui il guasto si è visto, ed è anche
  l'unico in cui si sa **in anticipo** di stare per riavviare.
- **I traslochi lasciano una riga.** `registerLayoutIpc` prende ora il registro
  della sessione e scrive, a ogni `layout:salva`: quale workspace ha **perso**
  chat, quante, l'id della finestra, la chiave del monitor, il nome dichiarato e
  l'attivo. Più le righe per i salvataggi non autorevoli.

Le due volte precedenti non c'era **niente** da leggere: né quale finestra avesse
salvato, né sotto quale nome, né cosa fosse stato tolto a chi. Si poteva solo
ragionare sul codice e sperare — ed è così che questa scheda è arrivata a
centoventi righe senza chiudere il difetto. La prossima volta si guarda il log.

**Regola generale.** Quando un difetto si ripresenta dopo due correzioni
ragionate, la terza mossa non è una terza correzione ragionata: è **rendere
osservabile il momento del danno** e renderlo **reversibile**. Una teoria in più
su un guasto che non lascia tracce vale meno di una riga di log.

## 2026-08-28 (sera) — il registro ha parlato, e diceva la cosa sbagliata

Le prime righe raccolte dal registro messo stamattina:

```
12:12:32 [layout] «Wdeck» perde 1 chat salvando la finestra 1
         (monitor 1920x1080@0,0@1, dichiara «Wdeck», attivo «Wdeck»): 99df28df…
12:32:03 [layout] «SierraDeck» perde 1 chat salvando la finestra 1
         (monitor 1920x1080@0,0@1, dichiara «SierraDeck», attivo «SierraDeck»): 4290fe99…
```

Verificando `workspaces.json` subito dopo, **tutte e due le chat erano al loro
posto**: `99df28df` di nuovo in Wdeck, `4290fe99` in SierraDeck sul secondo
monitor. Cioè: una era un **trasloco fra finestre** (uscita da un workspace e
rientrata in un altro nello stesso gesto), l'altra una **sparizione transitoria**
rientrata da sé.

Due conseguenze.

**Lo strumento era inutilizzabile.** Segnalava con lo stesso allarme il gesto più
normale che ci sia — spostare una chat da una finestra all'altra — e la cosa
grave. Uno strumento che grida a ogni passo non si legge più, e avrebbe fatto
perdere il prossimo caso vero in mezzo al rumore. Adesso guarda **l'archivio
intero**: una chat che dopo la scrittura non sta più in *nessun* workspace è
sparita davvero e ha la riga `ATTENZIONE`; una che ha solo cambiato posto è un
`trasloco`, annotato piano, perché serve a ricostruire una sequenza.

**Ma il transitorio è la scoperta.** Esiste un istante in cui l'archivio viene
scritto **senza** una chat che è viva e che tornerà. Se il programma si chiude
proprio lì — e il riavvio per aggiornamento è esattamente il momento in cui si
chiude — quel transitorio diventa definitivo. È coerente con tutte e tre le
volte in cui il lavoro si è incrociato: **succede sempre intorno a un riavvio.**

Non è ancora la causa. È però la prima cosa concreta in tre giri, e dice dove
guardare: non «quale codice scrive sotto il nome sbagliato», ma «cosa toglie un
riquadro dallo store per un istante».

## Salvataggi: uno che non arriva sul disco non lo diceva

`scriviJsonAtomico` non solleva mai — registra e torna `false` — e
`istantanee-store` buttava via quel valore. Una scrittura non riuscita era
indistinguibile da una riuscita: l'interfaccia diceva «salvato» e sul disco
restava il salvataggio di prima. Chi lo ricaricava ritrovava il lavoro di due ore
prima senza nessuna spiegazione possibile.

Ora si scrive **e si rilegge**: se quello che si voleva salvare non si rilegge,
solleva, e il modale mostra l'errore. Il file è piccolo, la rilettura non costa
niente, ed è l'unica prova che il salvataggio esiste.

Cercando come far fallire la scrittura si è scoperto anche che **non fallisce**:
un file illeggibile al suo posto viene messo da parte da `elenca` e il
salvataggio successivo trova la strada libera. È il comportamento giusto — il
lavoro dell'utente vince su un file rotto — e nessuno se lo aspettava leggendo il
codice, quindi ora c'è un test che lo fissa.
