---
titolo: "Aggiornamenti bloccati su tutti i PC (12/10) e controllo generale — 0.67.1/0.67.2"
quando: 2026-10-12T19:30:00+02:00
tag: ["aggiornamenti", "quiete", "autopiloti", "controllo-generale", "0.67.1"]
---

## Il sintomo
12/10, Nicholas: «anche gli aggiornamenti degli altri SierraDeck sono bloccati».
Con la 0.67.0 già uscita, i PC erano su 0.66.1 / 0.66.2 / 0.66.3.

## Le cause (in `src/main/aggiornamenti.ts` e `pausa-aggiornamento.ts`)
1. **Nessuna installazione da sola.** La versione si scaricava da sola, ma si
   installava solo con «Installa» oppure **alla chiusura** del programma
   (`autoInstallOnAppQuit`). I PC di Nicholas non chiudono mai SierraDeck.
2. **Quiete impossibile.** Anche con «Installa» (o «Installa là», o dal
   telefono) l'attesa si arrendeva dopo 10 minuti (`ATTESA_QUIETE_MS`): con
   gli autopiloti sempre al lavoro tutte le chat ferme insieme non arrivavano.
3. **Controllo ogni 6 ore** (`RICONTROLLA_MS`).

## La correzione (0.67.1)
- Appena la versione è scaricata parte da sola l'installazione alla quiete
  (`daInstallareDaSolo`, se lo scaricamento automatico è acceso). Gli
  autopiloti vengono messi in pausa per i turni nuovi (finiscono quello in
  corso) e ricevono l'avviso di fermarsi; **le chat di Nicholas non si
  toccano**: si aspettano e basta (`soloGovernate`), e al ritorno non si
  scrive loro «ti eri fermato».
- Tetto di attesa **2 ore** (`ATTESA_DA_SOLO_MS`) anche per «Installa» a
  mano; se non arriva la quiete si disfa la pausa e si riprova dopo 30 min
  (`RIPROVA_DA_SOLO_MS`).
- Testo dell'attesa con i nomi, uguale su PC/pagina/app/«Installa là»
  (campo `attesaChat` dello stato): «aggiorno appena finisce: 1 chat al lavoro
  («X»)». Dopo 20 min con una chat **non** di un autopilota ancora al lavoro:
  «Aspetto da N minuti: …» + notifica + riga nel registro (`testoAttesa`).
- Controllo ogni **10 minuti**; e ogni minuto si guarda se un battito di un
  altro PC ha una versione più nuova → si cerca subito
  (`shared/versioni-altri-pc.ts`, al massimo una volta ogni 5 min).
- La ripresa dopo il riavvio era già fatta (0.56.4 / 0.60.8): servizio
  autopiloti, consegne in coda, sottofondo.
- Test: `tests/main/aggiornamento-da-solo.test.ts`.

## Trappola
Chi lavora come autopilota **su questo PC** blocca la quiete di questo PC:
pubblicata la correzione bisogna chiudere il turno, sennò l'aggiornamento
aspetta proprio te.

## Altri difetti trovati nel controllo generale (0.67.1)
- **Copie di conflitto a catena** sul Drive: una copia di conflitto che andava
  in conflitto generava `a.conflitto-x-….conflitto-y-….ts`. Ora una copia non
  genera copie (`eCopiaDiConflitto`) e il nome riparte dal nome vero. Le
  catene già esistenti restano: toglierle è una pulizia del Drive da far
  confermare a Nicholas. Test `tests/main/conflitti-a-catena.test.ts`.
- **«passo al workspace «»»** nel registro del ponte: un cambio di workspace
  senza nome passava il ponte. Ora il ponte lo rifiuta (400) e non lo
  racconta; l'app non lo manda (e scarta nomi vuoti). Test in
  `tests/shared/ponte-azioni.test.ts`.

## Stato dei PC al 12/10 ~17:10 UTC (prima della 0.67.1)
- Questo PC 0.66.3, portatile 0.66.2, DESKTOP 0.66.4. Strade: portatile LAN
  (~25 ms), DESKTOP Tailscale (~140 ms): chiave di casa e ponte funzionano.
- Workspace: fionda non ha ancora un workspace (lo crea la 0.67.x sul
  residente DESKTOP); su DESKTOP «Fionda: completare la parte gestionale» sta
  in «Predefinito» con il suo autopilota sospeso.
- Da verificare dopo l'installazione: versioni finali, workspace creati PC per
  PC, Fionda sotto «Su altri PC» qui e sul portatile.

## Esito vero (12/10, 17:2x UTC)
- Questo PC è salito alla 0.67.1 appena chiuso il turno dell'autopilota (la
  versione vecchia installava solo con «Installa»: chiesto a quiete).
- «Installa là» dal PC fisso: DESKTOP e portatile **0.67.1 in ~2 minuti**
  ciascuno (scarico → installo → fatto), con la quiete arrivata da sola.
- Workspace creati dalla 0.67.x, PC per PC:
  - PC fisso: «Documents», «gen», «HomeAssistant»;
  - DESKTOP (residente di fionda): «convertitore», «Documents», **«fionda
    apl»**, «NAS-film», «glos video», «video installazione»;
  - portatile: nessuno (non è residente di progetti senza workspace).
- «fionda apl» compare sotto «Su altri PC» sul PC fisso e sul portatile.

## Due difetti visti nel giro vero → 0.67.2
- **Workspace doppi**: «NAS-film» accanto a «Nas film» (DESKTOP) e
  «HomeAssistant» accanto a «HA» (PC fisso, che ne aveva già la chat). Ora il
  nome si confronta senza spazi/trattini/trattini bassi, e un progetto con le
  chat già in un workspace (non «Predefinito») non ne riceve un altro. I due
  doppioni già creati NON li ho tolti: li toglie Nicholas se vuole (eliminati
  restano eliminati, `annotaEliminato`).
- **«Riprendi» non lasciava traccia** nel diario: l'autopilota di fionda su
  DESKTOP era «fermato dall'utente» e dopo l'aggiornamento risultava al
  lavoro. Il codice NON riprende i sospesi al riavvio (`daRiprendere` prende
  solo `lavoro`; la pausa per aggiornamento tocca solo `lavoro`): lo ha ripreso
  qualcuno con «Riprendi», che però non scriveva niente. Ora scrive «ripreso su
  tua richiesta («Riprendi»)» con lo stato di prima.

## Terzo difetto del giro vero → 0.67.3
- Il workspace «fionda apl» creato su DESKTOP conteneva, accanto alle chat
  vere, **due sessioni interne dell'autopilota** (dialogo «Sei l'autopilota che
  sta portando avanti…» e preparazione «Stai preparando un autopilota…»): il
  pannello le contava fra le chat del progetto perché lavorano nella sua
  cartella. Aprire quel workspace le avrebbe fatte ripartire in un terminale
  accanto al servizio. Ora `sessioniInterne` (id di supervisore e preparazione)
  + `eSessioneInterna` (anche dal primo messaggio fisso) le escludono dai
  workspace dei progetti, da «Apri» da un altro PC e dalle chat del pannello
  (marcate `senzaNome`). Quelle già aggiunte si tolgono al giro dopo
  (`togliInterneAggiunte`, solo se assenti dalla copia
  `workspaces.prima-dei-progetti.json`, anche dall'albero del layout). La
  copia «prima dei progetti» ora si fa una volta sola.

## Chiuso (12/10, ~18 UTC)
- I tre PC sono passati **da soli** 0.67.1 → 0.67.2 → 0.67.3, senza
  «Installa»: l'installazione alla quiete funziona.
- Trappola: fra `gh release create` e `npm run pubblica` la release esiste ma
  non ha ancora `latest.yml`; un PC che cerca in quel minuto mostra «errore 404
  latest.yml». È passeggero: il controllo dei 10 minuti lo rimette a posto.
- «fionda apl» su DESKTOP dopo la 0.67.3: solo le 2 chat vere.
- Dispositivo temporaneo del collaudo tolto, copia di prova cancellata.
- **Rimedio provato con la 0.67.4:** release creata come **bozza**
  (`gh release create … --draft`), poi `npm run pubblica` e `npm run allega-apk`
  caricano nella bozza, e solo alla fine `gh release edit vX --draft=false
  --latest`. Nessun PC vede la release prima che `latest.yml` ci sia.
