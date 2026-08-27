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
