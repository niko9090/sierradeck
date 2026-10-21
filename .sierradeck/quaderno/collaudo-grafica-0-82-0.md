---
titolo: "Collaudo grafica 0.82.0: i cinque difetti di c-32 (trovati da c-41, corretti da c-43)"
quando: 2026-10-21T02:50:00+02:00
tag: ["0.82.0", "grafica", "collaudo", "difetti", "PC", "pagina", "app"]
---

Collaudo (c-41, consegna c-370) su main `3bd27ad4`, dopo l'unione di c-38 («meno cose in vista»).

**Aggiornamento 21/10 (c-43): tutti e cinque corretti.** Nessun `.fails` resta nel test. Come, e cosa è emerso, nella sezione «Correzione (c-43)» in fondo. Sotto, lo stato trovato da c-41.

**In breve:** c-38 non ha corretto i cinque difetti trovati da c-32 (l'analisi di c-32 sta solo sul ramo `ap/ap-f1e631f5/c-32`, commit `eb9635fb`, **non in main**). Sono ancora tutti aperti. Il 3 è aperto solo in parte. Serve una chat di sviluppo che li corregga, prima della release.

**Test:** `tests/main/collaudo-grafica-0-82-0.test.ts`.
- Ogni difetto aperto è un `it.fails`: il test descrive il comportamento giusto, e oggi fallisce come atteso.
- Il difetto 1 è un `it.todo`, perché va provato nella copia con due workspace.
- **Chi corregge un difetto vede il suo test diventare rosso e deve togliere `.fails`.**
- Esito: 5 verdi, 6 fallimenti attesi, 1 todo. Typecheck pulito. JUnit `GraficaMenoCaoticaTest` e `Migrazione*` verdi.

## I cinque difetti, con file e riga (main 3bd27ad4)
| # | Difetto | Dove | Stato |
|---|---|---|---|
| 1 | Pagina e app: le chat del workspace che non è davanti risultano «chiusa · tocca per riaprirla», anche se girano | `chatDiQui()` `src/main/index.ts:390` (solo finestra + sottofondo); la finestra annuncia solo `riquadriAperti` (`src/renderer/App.tsx:401`); la pagina le mette fra le salvate in `gruppiChat` (`client-pagina.ts:1615`, testo a `:2127`); l'app fa lo stesso (`Chat.kt`) | aperto |
| 2 | Pagina: «IN MOTO 4» con quattro chat ferme | `client-pagina.ts:1916`: `inMoto.length + (s.chat \|\| []).length` conta tutte le chat; anche la condizione a `:2571` | aperto |
| 3 | Righe vuote di interfaccia sotto il nome di una chat | «›»/«❯» dallo schermo: **corretto** da c-38. Ancora aperti: la riga di stato di SierraDeck con solo modello e costo (`rigaDiStato`, `shared/polso-chat.ts:112` → «Opus 5.5 · 0.00 $») non è in `RUMORE_DI_INTERFACCIA` (`renderer/ultime-righe.ts:56`), che riconosce solo contesto/5 ore/settimana. E il ripiego dal flusso, `ultimaRigaUtile` (`ultime-righe.ts:99`), non filtra né «›» né la riga di stato | in parte |
| 4 | «Fatta: 2 autopiloti nuovi» mentre Autopiloti dice «Nessun autopilota» | `shared/migrazione-elenco.ts:164-165`, pagina `client-pagina.ts:4882`, app `Migrazione.kt:50-51` (i tre lati) | aperto |
| 5 | Nuova chat (PC), «Fra i progetti» con il nome vuoto: sotto il campo «La cartella si chiamerà «Nuova chat».», in fondo «Serve un nome…» e «Apri la chat» spento | `ModaleNuovaChat.tsx:147` promette (`nomeCartellaDaNome('')` = «Nuova chat», `nuova-chat.ts:99`); `componiNuovaChat` rifiuta (`nuova-chat.ts:135`) | aperto |

**Passi per riprodurre:**
- **1:** copia `SIERRADECK_PROVA` con due workspace. Apri il secondo (le sue chat partono), torna al primo. Dal telefono, in Chat, le chat del secondo dicono «chiusa».
- **2:** quattro chat ferme al prompt, nessun autopilota al lavoro. Pagina → Domande → «In moto adesso»: «IN MOTO 4».
- **3:** una chat appena aperta, senza contesto né limiti letti. Sotto il suo nome sulla pagina compare «Opus 5.5 · 0.00 $».
- **4:** la trasformazione fatta con 2 workspace. Impostazioni → «Fatta: 2 autopiloti nuovi…», poi Autopiloti → «Nessun autopilota».
- **5:** Nuova chat → «Fra i progetti SierraDeck», nome vuoto.

## Cosa di c-38 è stato verificato
- I test `tests/main/grafica-0-82-0.test.ts` sono verdi, insieme ai JUnit.
- Foto «dopo» della grafica: le ha fatte c-38 (vedi `grafica-0-82-0.md`). Questo collaudo non ne ha fatte di nuove, perché i cinque difetti non sono corretti: le foto vanno rifatte dopo la correzione.

## Trappole
- **Il worktree nuovo non ha `node_modules`:** vitest dice «failed to load config». Va creata una giunzione verso quella della cartella principale (`New-Item -ItemType Junction`), come negli altri worktree.
- **Gradle con altre chat accese:** il demone può sparire («Gradle build daemon disappeared unexpectedly»). Rilanciando è passato.

## Correzione (c-43)
- **1, chat del workspace dietro.** La memoria dei workspace (`memoria-workspace.ts`) ha `vivi()`, e `chatDietro()` ne tira fuori i riquadri con un terminale acceso (non ibernati, non remoti). `App.tsx` li annuncia con il loro workspace e `dietro: true`; senza terminale morto (`attivitaDi(...).morto`). Nel main stanno in `chatDietroPerFinestra`, **fuori da `chatPerFinestra`**: quella decide le consegne (`inFinestra`, «chiudi», ripresa dopo l'aggiornamento), e una chat dietro deve restare «accesa nascosta» come prima. Telefono → scrittura, tasti e righe passano da `riquadroDelTelefono` (riquadri a schermo, poi memoria). Pagina (`gruppiChat`) e app (`raggruppaChat`) usano prima il `workspace` dichiarato dalla chat.
- **2.** `chatInMoto` = né `chiede` né `aspetta`, e viva. Le altre vanno sotto «ALTRE CHAT».
- **3.** `RUMORE_DI_INTERFACCIA` vale anche per `ultimaRigaUtile`. Ci sono in più la riga di stato con solo modello e costo, lo sforzo «· /effort», «❯ Try "…"» e «N more notice hidden».
- **4.** «Fatta: Panoramica nuova in N workspace, parte quando le scrivi.»
- **5.** In `componiNuovaChat` il nome vuoto vale `nomeCartellaDaNome('')` = «Nuova chat».

**Trappola vista nella copia:** nel flusso di un terminale, Claude Code sposta il cursore invece di andare a capo. La cornice con il titolo arriva quindi attaccata al resto della casella, in una riga sola che comincia con ≥160 trattini. Tagliata a 160 caratteri, sotto il nome restavano solo trattini. La lettura di riserva ora salta le righe che cominciano con `─━═` ripetuti. Nella copia la finestra usava il flusso anche per le chat davanti (lo schermo disegnato non rispondeva): da guardare a parte.
