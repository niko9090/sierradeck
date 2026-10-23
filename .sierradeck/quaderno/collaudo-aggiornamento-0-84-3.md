---
titolo: "Collaudo 0.84.3 — aggiornamento senza tempi morti: regge, 3 difetti (corretti da c-109)"
quando: 2026-10-23T03:55:00+02:00
tag: ["0.84.3", "collaudo", "aggiornamenti", "installa", "fasi"]
---

Collaudo di c-97 (23/10) sul lavoro di c-91 (come funziona:
`aggiornamento-senza-tempi-morti-0-84-3.md`). Test:
`tests/main/collaudo-aggiornamento-0-84-3.test.ts`, con `creaAggiornamenti`
vero (electron-updater e SierraDeck Update finti) e `attendiQuiete` vera.

## Cosa regge (3 test verdi)

- **La catena intera col caso vero del 22/10** (tre chat che non finiscono mai
  il turno, «Installa» alle 15:28:51 UTC): scaricato prima in 40 s; mezz'ora con
  la versione pronta e niente si installa da solo; dopo «Installa» al secondo
  minuto la riga dice «Scaricato in 40 s · salvo le chat da 2 min (al massimo 5
  min) · poi installo e riparto»; commit delle chat una volta sola fra 5:00 e
  5:30; installer una volta sola; `aggiornamento-in-corso.json` con fasi e
  conti; al ritorno il file si legge una volta sola e la riga è «Aggiornato dalla
  0.84.2 alla 0.84.3 in 7 min (scaricato prima, chat salvate in 5 min, installato
  in 1 min, ripartito in 30 s). Lavoro di 2 chat salvato sul loro ramo. …»
- **Chat che finiscono in un minuto**: si installa entro 2 minuti, non al quinto.
- **«Installa» mentre scarica ancora**: non parte niente e il tasto non resta
  appeso; a scaricamento finito funziona.

## Difetti (`it.fails`: quando uno è corretto il test diventa rosso, e il `.fails` va tolto)

**D1, medio — l'attesa del Drive viene prima dei 5 minuti, e può ancora annullare tutto.**
- Dove: `src/main/index.ts:6657` (`attendiLavoroDrive` prima di `attendiQuiete`),
  tetto 10 minuti per fusione/ripristino in `src/main/attesa-drive.ts:31`; se il
  lavoro non finisce l'installazione si annulla (`index.ts:1737-1739`).
- Effetto: nel caso peggiore 10 min + 15 s + 5 min + 60 s prima dell'installer
  (16 min), e in quei primi 10 minuti gli autopiloti non sono in pausa né le chat
  avvisate. «salvo le chat» parte a «Installa» (`aggiornamenti.ts:592`), quindi
  la riga dice «salvo le chat da 8 min (al massimo 5 min)».
- Passi: un'unione delle chat col Drive in corso, poi «Installa».
- Correzione possibile: pausa e avviso subito; il Drive dentro gli stessi 5
  minuti; allo scadere annullare il lavoro del Drive (si rifà) invece di rinunciare.

**D2, lieve — «Installa là» non mostra le fasi.** `StatoAggiornamentoRemoto`
(`src/shared/installa-la.ts:16-25`) non porta `fasiTesto` e il messaggio
dell'attesa (`installa-la.ts:132-133`) dice solo «aspetta la quiete prima di
chiudersi». Sul PC che ha premuto non si vedono fasi né tempo.

**D3, lieve — riepilogo che conta anche le chat di Nicholas.** `chiusa` passa
tutte le chat in volo (`pausa-aggiornamento.ts:328`), `index.ts:6687` le mette nei
conti, e nella conversazione degli autopiloti `rigaRiepilogo`
(`fasi-aggiornamento.ts:171-173`) scrive «3 chat … ripartono dal loro ultimo
salvataggio» con 2 commit: la chat fuori dagli autopiloti non ha ramo né
salvataggio.

## Correzioni (c-109, 23/10)

Tutti e tre corretti, `.fails` tolti, tests/main verdi (1949), TypeScript pulito.

- **D1:** il Drive non si aspetta più prima: `attendiQuiete` ha un parametro
  `drive` (`DriveInCorso` in `src/main/pausa-aggiornamento.ts`) e lo aspetta
  **dentro** lo stesso tetto di 5 minuti, dopo aver messo in pausa gli
  autopiloti e avvisato le chat al secondo zero. Si installa solo quando chat
  e Drive sono quieti; allo scadere (o con «Aggiorna adesso») il lavoro del
  Drive si **annulla** (si rifà al giro dopo), si aspetta al massimo
  `DRIVE_ANNULLATO_MS` (30 s) che si fermi, e si installa lo stesso: niente
  più «non chiudo». In `index.ts` `driveDentroInstalla()` (accanto ad
  `attendiLavoroDrive`) annulla subito i lavori automatici e dà il resto
  all'attesa. `attendiLavoroDrive` resta solo per il riavvio senza installare.
  In vista, passati i 5 minuti `testoFasi` dice «passati 5 min: salvo il lavoro
  delle chat», mai «da 8 min (al massimo 5 min)».
- **D2:** `StatoAggiornamentoRemoto.fasiTesto` (la rotta `/api/aggiornamento`
  lo dava già) e `passoInstallaLa` lo mette nel messaggio, in «attendo» e in
  «installo».
- **D3:** `chiusa` dà `interrotte` = solo le chat governate (vanno nella riga
  degli autopiloti) e `alLavoro` = tutte (nel registro).

## Da sapere

- **Niente prova dal vivo dell'installazione, neanche nella copia di prova:**
  `SIERRADECK_PROVA` separa dati e porte, ma l'installer NSIS ha lo stesso appId
  e installerebbe sopra il programma vero di Nicholas. Il collaudo resta nei test.
- Nel banco di prova `checkForUpdates` deve rispondere (`update-not-available`):
  una ricerca appesa lascia la fase a «cerco» e «Installa» non fa niente (la
  guardia vuole «pronto»). Nella realtà electron-updater risponde sempre.
