---
titolo: "«Sto leggendo il terminale…» per sempre, e «non risponde» che non diceva niente"
quando: 2026-08-28T14:15:00+02:00
tag: ["telefono", "terminale", "rete", "difetto", "osservabilita"]
---

## 1. La chat che restava a leggere

**Il sintomo.** Dal telefono una chat resta su «Sto leggendo il terminale…»
all'infinito, mentre sul computer la stessa chat si vede benissimo.

**La causa.** In `src/renderer/aggancio.ts`, `deps.annunciaId(...)` era chiamata
**solo** nel ramo `rilancia()` — quello dello spawn. Nel ramo del **riaggancio**
(pty gia' vivo, `ptyIdIniziale` presente) non veniva chiamata: l'id si sapeva
gia', quindi «non c'era niente da annunciare».

Era vero finche' `annunciaId` faceva una cosa sola. Da quando chi guarda da
lontano legge **lo schermo disegnato** invece del flusso, quell'annuncio ne fa
due: registra anche la griglia di xterm di quel riquadro
(`registraSchermo`). Senza registrazione, `righeDiPty` torna `undefined`, il
telefono riceve `coda` e `codaGrezza` vuote, e `/api/storia` non ha niente da
mandare.

E il riaggancio non e' un caso raro: succede a **ogni** ricarico della finestra,
a ogni cambio di workspace, a ogni riquadro spostato fra finestre.

**La lezione.** Quando una funzione acquista un secondo compito, tutti i suoi
punti di chiamata vanno riletti — perche' erano stati scelti per il primo. Qui
il nome stesso, `annunciaId`, continuava a descrivere solo il vecchio lavoro e
faceva sembrare completo un elenco che non lo era piu'.

**Contorno.** `setPtyId` nello store ora e' idempotente: lo stesso id non produce
uno stato nuovo. Senza, ogni riquadro riagganciato genererebbe un salvataggio del
layout che non ha niente da salvare — e i salvataggi inutili non sono gratis,
vedi [[workspace-chat-che-spariscono]].

**E l'app non mente piu'.** Una risposta *riuscita ma vuota* non solleva, quindi
non finiva in nessun `catch`: l'app restava in attesa per sempre. Ora conta le
risposte vuote consecutive e dopo tre (sei secondi) dice cosa sta succedendo.
**Vuoto e in attesa sono due stati diversi e vanno detti in due modi diversi.**

## 2. «Non risponde», che mandava a guardare dove non c'era niente

Un pomeriggio perso perche' il telefono non si collegava. Dalla parte del
computer era tutto a posto — verificato: server in ascolto, firewall con la
regola TCP Allow sul percorso giusto, rete classificata Private, indirizzo nel QR
corretto (il programma lo chiede a Windows con `Get-NetIPConfiguration`). La
causa era **una VPN sbagliata attiva sul telefono**.

Il messaggio dell'app diceva: «non risponde. Controlla l'indirizzo o che
SierraDeck sia acceso» — cioe' mandava a controllare le due cose che stavano
bene, e taceva l'unica che non andava.

**Il difetto vero non era il messaggio: era che l'app lasciava scegliere ad
Android la rete.** Un telefono ha quasi sempre tre reti insieme — wifi, dati
mobili, VPN — e Android sceglie la predefinita guardando **chi porta a
Internet**, non chi porta al computer di casa. Basta un wifi giudicato scadente,
o una VPN accesa, perche' una richiesta a `192.168.1.191` esca dai dati mobili o
entri nel tunnel, dove quell'indirizzo non esiste.

**Come sta adesso** (`Rete.kt`):

- un indirizzo di casa (10, 192.168, 172.16–31, 169.254) esce **dal wifi**, con
  `socketFactory` e `dns` legati a quella `Network`: senza `socketFactory` il
  socket lo assegna comunque Android alla predefinita, e il ragionamento non
  arriva fino al filo;
- un indirizzo **Tailscale** (100.64–100.127) usa la rete predefinita, VPN
  compresa: li' il tunnel e' la strada giusta, e forzarlo sul wifi sarebbe
  l'errore speculare;
- se non si sa niente (nessun contesto, nessun wifi) si torna al client di
  prima: peggio di prima non si sta mai;
- e il messaggio d'errore adesso dice **da dove** ci si e' provati — «sei solo
  sui dati mobili», «c'e' una VPN attiva» — e suggerisce la prova che discrimina
  in cinque secondi: aprire lo stesso indirizzo col browser del telefono.

**La lezione.** Un messaggio d'errore che elenca cause plausibili senza dire
**cosa e' stato tentato** non aiuta: sposta la ricerca su un terreno a caso. Il
minimo utile e' raccontare il tentativo — indirizzo, rete, esito — perche' e'
l'unica cosa che chi ha scritto il codice sa e chi legge lo schermo no.

Vedi anche [[telefono-schermo-e-invio]] e [[telefono-si-scollega-da-solo]].
