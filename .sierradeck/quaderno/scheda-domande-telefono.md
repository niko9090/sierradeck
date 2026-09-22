---
titolo: "La scheda «Domande» del telefono (0.30.0, app 2.33.0): un posto solo, non bloccante, per tutto ciò che aspetta una risposta"
quando: 2026-09-22T11:30:00+02:00
tag: ["telefono", "android", "pagina", "domande", "autopilota", "scelte", "api"]
---

Nicholas (22/09): «sul cellulare non riesco a vedere e a rispondere bene alle
domande sia della chat che quelle iniziali! È importantissimo che io riesca a
rispondere. Voglio una sezione a parte, non bloccante».

## Com'era

Le domande arrivavano in tre posti, tutti parziali:
- la **prima** domanda degli autopiloti (`stato.domande[0]`) come banda
  ambra in cima con un `AlertDialog` (`Urgenze.kt`): una alla volta, le
  altre invisibili, e la finestra bloccava l'app;
- le **scelte** del terminale (`scelteDiTerminale`, elenchi numerati: permessi,
  «vuoi procedere?», riprendi conversazione) solo **dentro** la chat aperta
  (`/api/storia`, `/api/dentro`); `/api/stato` non diceva quale chat le
  aspettasse;
- le chat ferme solo nelle notifiche.
Le «domande iniziali» sono l'**intervista** dell'autopilota prima di
partire (`autopilot-host/intervista.ts`, max 2 scambi): finivano nello
stesso registro (`autopilot-host/domande.ts`) e quindi nella banda, senza
dire che erano un'intervista.

## Com'è (tre lati, come sempre)

- **PC** — `GET /api/domande` (`client-rotte.ts`) → `{ voci }` costruite da
  `src/shared/domande-telefono.ts` (`raccogliDomande`, puro, con test):
  `autopilota` (id domanda, nome, `origine: intervista|lavoro`, testo),
  `scelta` (chat, titolo, cwd, `righe` = contesto sopra la «1.», opzioni,
  corrente), `chat` (ferma: aspetta e non governata, ultime 8 righe). Le
  risposte usano le rotte di sempre: `/api/rispondi`, `/api/scegli`,
  `/api/scrivi`. In `/api/stato` ogni chat ha `chiede: boolean` (scelte
  vive), calcolato senza mandare le righe.
- **App** — `Scheda.DOMANDE` (`Domande.kt`), seconda nella fascia, pallino
  ambra e numero = domande + chat che chiedono (le ferme non contano).
  Legge `/api/domande` ogni 2 s mentre è aperta. Ogni scheda ha dentro tutto
  e le risposte mandate restano segnate finché il computer non toglie la
  voce (`mandate`). La banda urgenze non apre più la finestra: «Vedi» porta
  alla scheda. Una notifica toccata (extra `chat`/`domanda`) apre la scheda
  (`Apertura.schedaRichiesta`, `MainActivity.apriDoveChiede`). Il
  `DialogoRisposta` è stato tolto.
- **Pagina** — scheda `domande` (`vistaDomande`, `leggiDomande` ogni 2 s solo
  se aperta), voce in fascia con il conteggio, `rispondiVoce`, `scegliIn`,
  `scriviIn`.

## Trappole pagate qui

- **Le heredoc del terminale di Claude riducono `\\` a `\`**: un test scritto
  con `cat <<'EOF'` conteneva `'C:\x'` (→ SyntaxError) e un `'\n'` dentro il
  template della pagina è diventato un a capo vero. Script e test con
  backslash: scriverli con lo strumento Write, non con heredoc.
- Il testo della pagina vive in un template TS: niente `'\n'` nelle stringhe
  JS, usare `String.fromCharCode(10)`.

## Non fatto (da decidere)

- Le domande degli autopiloti non hanno opzioni predefinite (`chiediUtente`
  produce solo testo): i pulsanti ci sono solo per le scelte delle chat.
- Dalla scheda non si salta alla chat: la voce ha già contesto e risposta.
- Il conteggio in fascia non include le chat ferme: scelta voluta.
