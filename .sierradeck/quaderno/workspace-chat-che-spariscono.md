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
