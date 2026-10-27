---
titolo: "Supervisore muto per «spawn ENAMETOOLONG»: il prompt va dallo stdin (0.85.1)"
quando: 2026-10-23T21:25:00+02:00
tag: ["supervisore", "windows", "trappola", "0.85.1"]
---

## Cosa succedeva

Il 23/10 il supervisore è fallito 239 volte (124 di fila) con `Error: spawn ENAMETOOLONG`.
Il prompt passava come argomento (`claude -p <prompt>`) e, con obiettivo e criteri
cresciuti, superava il limite della riga di comando di Windows (32.767 caratteri).
Il processo non partiva nemmeno. Ogni chiamata ingoiava l'errore e ricadeva sulle
regole, quindi da fuori sembrava un autopilota lento che faceva domande strane.

## La correzione

- `argomentiSupervisore` passa solo `-p` senza testo; `interrogazioneReale` scrive il
  prompt su `figlio.stdin.end(prompt)`. Claude Code con `-p` e senza testo legge lo stdin.
- `conAllarme` (in `supervisore.ts`) avvolge `deps.interroga` dentro `creaServer`: conta
  i fallimenti **di fila**. Al terzo: `console.error('[supervisore] ALLARME — …')`, più una
  riga nel registro degli autopiloti della stessa cartella. Finché il conto resta ≥ 3,
  `GET /autopiloti` aggiunge `supervisoreMuto` e l'indicatore diventa rosso:
  «Supervisore muto: N risposte mancate di fila — motivo». Basta una risposta riuscita
  per azzerare il conto.
- Test: `tests/autopilot-host/supervisore.test.ts`, con un claude finto in Node e un prompt
  di 48.006 caratteri. Il test controlla la risposta e che gli argomenti restino sotto i 200 caratteri.

## Da ricordare

- **Mai testi che crescono con i dati sulla riga di comando** di `claude`. Oggi ci passano
  solo costanti corte: `--append-system-prompt` con la direttiva del quaderno in
  `config.ts` e le istruzioni dell'agente in `risoluzione.ts`. Le chat ricevono le
  consegne per file («Leggi ed esegui … .sierradeck/consegne/c-N.md»).
- Per provare un `execFile` di claude in un test: `interrogazioneReale(process.execPath, [script])`.
  `primaDegliArgomenti` mette lo script prima di `-p`, così Node non lo prende per il suo `-p` (print).

## Trappola vista il 23/10 sera: il giro senza fine col supervisore muto

Finché gira il servizio installato (senza questa correzione), una chat che ha finito
con tutti i criteri verdi riceve dall'hook di fine turno sempre lo stesso messaggio:
«I criteri passano tutti, ma il supervisore non ha detto se il lavoro è concluso: rifaccio il giro».
A c-145 è successo tre volte di fila dopo «SEGNALE: fatto». Con il supervisore muto
deve decidere la regola: criteri verdi più `SEGNALE: fatto` vuol dire chat finita.
Non va ripetuto il giro. Vedi anche la scheda del giro senza fine della 0.85.0.

Anche c-146 (23/10 sera) l'ha ricevuto 4 volte di fila dopo «SEGNALE: fatto», con criteri verdi e lavoro unito: stessa causa (servizio installato senza la correzione di c-145). Si esce solo con l'install della 0.85.1, che decide Nicholas.

Lo stesso giro anche per c-150 (che ha ripreso c-146 la sera del 23/10): 4 volte di fila dopo «SEGNALE: fatto», con il lavoro già in main. Per una chat che riprende un compito già unito basta controllare (`git merge-base --is-ancestor`), rilanciare i test del pezzo e chiudere: non c'è niente da rifare.

Anche c-147 (promesse mantenute, notte fra il 23 e il 24/10): dopo il lavoro unito lo stesso messaggio più volte di fila, intervallato da conflitti con main e da un test rosso dopo mezzanotte (data fissa nel test). Stessa causa: il servizio installato non ha ancora la correzione.

Ancora il 27/10 (c-157, che ha ripreso c-151 sul ramo c-145): stesso giro dopo «SEGNALE: fatto», con la 0.85.1 pubblicata e tutto in main. Vuol dire che il servizio in uso non ha ancora la 0.85.1: il giro finisce solo quando Nicholas la installa.

## Controllo delle altre chiamate (c-1108, 23/10 sera)

Tutto ciò che interroga Claude in sottofondo — chiedi all'autopilota, risposte dalla scheda,
scomposizione, Revisione, riparazione dei criteri, cambio d'obiettivo — passa da `deps.interroga`
in `server.ts`, cioè da `interrogazioneReale`: prompt sullo stdin per tutti. Le altre `execFile`
di `claude` sono corte e fisse: `negozio/cli.ts` (nomi di plugin/MCP), `risoluzione.ts`
(percorso del dossier + `ISTRUZIONI_AGENTE`), `claude-versione.ts` (`--version`). Le chat
ricevono una riga sola (`consegna-breve.ts`). Se si aggiunge una nuova chiamata a `claude` con
testo che cresce, deve passare da `interrogazioneReale` o dallo stdin.

## Esito del criterio vecchio ripetuto (c-151, 23/10 notte)

L'hook di fine turno ha riportato tre volte lo stesso fallimento di `tests/main`
(`grafica-0-81-0.test.ts`, «… hanno ognuno il suo nome», sempre 1376 ms): era un esito
di prima che entrasse c-148 (`90757852`). Rilanciato a mano lo stesso comando su main `3a245a01`:
rc=0, 1951 test verdi. Se l'esito si ripete identico, tempi compresi, rilanciare il comando
del criterio a mano e scrivere il commit di main su cui passa: rifare il lavoro non serve.

c-151 (notte 23→24/10): lo stesso «rifaccio il giro» più di 10 volte di fila dopo «SEGNALE: fatto», con criteri verdi, lavoro in main (`afa8220f`) e suite servizio/renderer/condivisi/pty rilanciata a mano con rc=0. È la conferma più netta: finché non si installa la 0.85.1, una chat finita resta in questo giro.

## 27/10: sul PC gira ancora la 0.84.4, il supervisore è ancora muto
Il servizio installato è la **0.84.4** (`versione-installata.json`, 23/10), non la
0.85.1: la correzione c'è nel codice e nella release, ma non sul PC. Il registro del
27/10 ha 998 «decisione del supervisore non ottenuta: spawn ENAMETOOLONG» (fino a
461 risposte mancate di fila per un autopilota). Effetto visibile: a fine turno
l'hook ripete «i criteri passano tutti, ma il supervisore non ha detto se il lavoro
è concluso» all'infinito, anche con il lavoro finito e il `RAPPORTO: finita`
scritto. Non è un difetto della chat né del codice in `main`: si risolve solo
quando Nicholas installa la 0.85.1 (o una successiva). Noi non installiamo.

**Aggiornamento 27/10, 13:53 UTC:** Nicholas ha installato la 0.85.1
(`versione-installata.json`). L'ultimo «spawn ENAMETOOLONG» nel registro è delle
13:51, prima dell'installazione; dopo non ce ne sono più. Il giro infinito di fine
turno nasceva da lì.
