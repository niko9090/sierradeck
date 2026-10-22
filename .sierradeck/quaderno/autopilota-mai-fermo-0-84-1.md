---
titolo: "0.84.1 — L'autopilota non resta mai fermo con il lavoro da finire"
quando: 2026-10-22T09:45:00+02:00
tag: ["0.84.1", "autopilota", "guardiano", "mai-fermo", "causa"]
---

## La causa della fermata della notte 21-22/10

L'autopilota si muove **solo** quando una sua chat chiude un turno (hook `Stop`).
Il guardiano (`guardiano.ts`, ogni minuto) mette da parte una chat che tace da
un'ora, e basta: nessuno la riprendeva.

Quella notte, dal diario di `ap-f1e631f5`:
- c-65, c-66, c-70 al lavoro; ultimi segni di vita verso le 22:27;
- 23:23, 23:30, 23:34: tutte e tre «messe da parte»;
- due erano ferme al prompt (niente in coda, quindi `consegnaAlleChatFerme` non
  le toccava), la terza zitta;
- nessun turno chiuso → nessun giro → niente fino alle 06:51, quando ha scritto
  Nicholas.

## Come funziona adesso (`src/autopilot-host/mai-fermo.ts`)

Regola pura `giroMaiFermo`, eseguita da `giriDaSoli` in `server.ts` a ogni giro
del guardiano (dopo la messa da parte):

1. **Nessuno al lavoro da 10 minuti** (`NESSUNO_AL_LAVORO_MS`), autopilota in
   `lavoro`, non fermo per aggiornamento → giro da solo, con una riga nel diario
   che dice lo stato di ogni chat.
2. **Chat muta → ripresa**: interrotta (solo se il Gestore non la vede già ferma
   al prompt: Ctrl+C su un prompt vuoto non serve) e le si riscrive l'**ultima
   istruzione valida** (`ultimeIstruzioni`), o il compito. Sul disco
   `chat.ripresa = { il, volte }`.
3. **Ancora muta 10 minuti dopo la ripresa → chat nuova**: stessa cartella e
   stesso ramo, sessione nuova, `sostituisce`/`sostituitaDa`. La vecchia diventa
   `finita`, **perde il campo `ramo`** (così il ramo si unisce e si rivede una
   volta sola, per la nuova) e va nel recupero di 30 giorni
   (`chiudiChat` con `alRecupero`). Tetto: `SOSTITUZIONI_MAX` = 2 chat nuove per
   compito, poi solo riprese e una riga a Nicholas.
4. **Una chat messa da parte** mentre le altre lavorano non resta abbandonata:
   stessa ripresa/sostituzione, solo per lei.
5. **Nessuna chat aperta**: compiti in coda → si aprono; niente in coda →
   compito «Riprendi il lavoro dell'autopilota…» (il «finito» lo decide poi il
   supervisore sui criteri misurati). Chi aspetta Nicholas (`bloccata`, domande
   aperte) non si tocca.
6. **«Finito» solo senza chat aperte**: se il supervisore dice finito mentre
   un'altra chat è `lavoro`/`bloccata`/`pausa`, si chiude solo questa chat.
   Prima T6 segnava `finita` anche le chat ancora al lavoro.

**Dopo un riavvio** i segnali in memoria (`ultimoTurno`, battiti) si perdono:
il silenzio si conta da `avvioServizio`; `ripresa` e `giroDaSolo` sono su disco.

La ripresa si dimentica quando la chat chiude un turno (`tornaDaParte` toglie
anche `ripresa`).

## Trappole

- In `suStop` le chat si ricalcolano da `a.chats`, non dal risultato di
  `tornaDaParte`: per togliere un campo alla chat del turno va fatto **nel map
  delle chat**, non solo sull'autopilota.
- `parseAutopilota` scarta tutto senza `versione: 1`: nei test che passano dal
  disco va messa.
- Tre test vecchi di `server.test.ts` («la chat viva che non finisce mai")
  aspettavano la chat ancora in `daParte`: ora viene ripresa nello stesso giro.

## Test

`tests/autopilot-host/mai-fermo-0-84-1.test.ts`: regola pura e servizio vero,
con il caso della notte (giro entro 15 minuti, anche dopo un riavvio),
sostituzione senza doppioni, chat che risponde e non viene sostituita, chat
nuova quando non c'è nessuno, «finito» con una chat ancora aperta.

## Prova di 2 ore (22/10, 09:36 → 11:36)

Il servizio vero (`creaServer`) gira con dati isolati nella cartella temporanea
della chat. Il Gestore e le chat sono simulati da uno script con un seme fisso:
chat che lavorano, che si zittiscono, che restano ferme al prompt. A metà c'è
un riavvio del servizio. Il freno, senza limiti del piano, ha tenuto 2 chat
attive su 4, come fa il programma vero quando non li conosce.

Il tratto più lungo senza nessuna chat al lavoro è stato di **12 minuti**, con
0 tratti oltre i 15. Ci sono stati 4 giri partiti da soli e 7 riprese, 0
sostituzioni, 0 messe da parte (il giro arriva sempre prima dell'ora), 0
doppioni. Numeri e limiti della prova nel `rapporto-0-84-1.md`, sezione 3.

**Per rifare una prova così:** il bundle si fa con esbuild
(`--alias:@src=<copia>/src --alias:@shared=<copia>/src/shared --platform=node`).
Il server si crea con `creaServer` e le dipendenze finte (avviaLavoro,
fermaLavoro, chiudiChat), su una porta diversa da 47630, e si chiama
`controllaChatFerme` ogni minuto come fa `index.ts`. Attenzione ai criteri che
cambiano senza commit: la memoria li ricorda per commit e la prova non vede il
cambio.
