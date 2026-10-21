---
titolo: "App Android e pagina 0.83.0: leggibilità (contrasto, caratteri, tocchi, colori degli stati) — regole e trappole"
quando: 2026-10-21T15:10:00+02:00
tag: ["0.83.0", "android", "pagina", "leggibilità", "contrasto", "accessibilità", "c-49"]
---

Lavoro di c-49 (consegna c-514), commit cb492fe3. Il perché di ogni regola sta qui sotto. I test che le fanno rispettare sono `LeggibilitaTest.kt` (app) e «leggibilità 0.83.0» in `tests/main/client-pagina.test.ts` (pagina).

## Regole (le controllano i test)

- **Testo sopra un colore pieno: `sopra(colore)`** (Tema.kt). Sceglie fra fondo e testo del banco quello con il contrasto più alto. Prima `onPrimary`/`onError` erano bianchi fissi: 2,6:1 sull'accento #4aa3ff, 2,2:1 su ambra e verde, quindi sotto AA. Ora tutti i `Button` pieni di Material sono sopra 7:1. Con la veste chiara del PC la scelta si gira da sola.
- **Mai `fontSize` sotto 12 sp.** Erano 136 testi a 10-11 sp. Restare in **sp** è quello che fa seguire la dimensione scelta nel telefono: niente dp per il testo, niente `fontScale` forzato. Il terminale ha la sua dimensione (A− A+) e non rientra nella regola.
- **Mai `.clickable`: si usa `Modifier.tocco`** (Componenti.kt). È `clickable` più `minimumInteractiveComponentSize()`, quindi almeno 48 dp. Ha la stessa firma (`enabled`, `onClick`). Nei lambda il ritorno si scrive `return@tocco`. «?» e legenda: 48 dp. Graffetta e invio della chat: 48 dp. IconButton: mai con `size(36.dp)`.
- **Il colore di uno stato viene da `ColoreStato`** (Attivita.kt), cioè dalla tabella del PC: verde, ambra, rosso #f2857c, quieto, blu. Non viene da `Banco.verde/ambra/rosso`. Il rosso del banco #dc5f5f sui fondi alti scendeva a 3,5-4,0:1. `Banco.rosso` resta per errori e pericoli (tasto Elimina, note d'errore).
- **Nessun `Color(0x…)` scritto a mano** fuori da Tema, ColoriAttivita, Ansi, Ponte e DriveScollegato. Il viola «altro PC» #a77bf3 è il token `--remoto` del PC, non un'attività.
- **Testi lunghi:** una riga sullo schermo, il resto dietro `Aiuto(...)`. Ne sono stati accorciati cinque (altri PC, sottofondo dell'autopilota, riavvio dopo il Drive, quaderno vuoto, quaderno personale vuoto).

## Contrasto misurato (WCAG 2.x, 21/10)

Calcolato con la formula WCAG sui valori di `Tema.kt`, `ColoriAttivita.kt` e `tavolozza()` di `src/shared/preferenze.ts`, con uno script a parte (fuori dal repo). Le correzioni di `Banco.applica` (`Contrasto.almenoAA`) sono già applicate.

**SierraDeck non ha un tema bianco.** Il «chiaro» è il cursore del chiarore al massimo (fondo #1e1e1e); lo «scuro» è il chiarore a 0. Si misura anche la veste di partenza dell'app, quella che vale prima che arrivi `/api/stile`.

Soglia per tutte le righe: 4,5:1 (testo normale). Le icone e le etichette grandi chiedono 3:1, quindi passano anche loro.

**Le righe che erano «no» e come sono state corrette:**
- quieto #9a9a9a sul pannello alto con chiarore 100: 4,36:1;
- rosso #dc5f5f sul pannello alto: 3,41:1 con chiarore 100, 4,02:1 nella veste di partenza;
- testo bianco sui tasti pieni: 2,2-2,6:1.

Correzioni: `almenoAA` in `Banco.applica`, il rosso di partenza a #dc7273, `sopra()` per il testo sui tasti pieni. Lo controlla `LeggibilitaTest`.

#### Tema scuro (app, prima di /api/stile)

| Coppia | Rapporto | Soglia | AA |
|---|---|---|---|
| testo #dfe3e7 su fondo #0b0c0e | 15,17:1 | 4,5:1 | sì |
| testo secondario #9aa1a9 su fondo | 7,5:1 | 4,5:1 | sì |
| rosso di errore #dc7273 su fondo | 6,24:1 | 4,5:1 | sì |
| testo #dfe3e7 su chassis #1d2023 | 12,69:1 | 4,5:1 | sì |
| testo secondario #9aa1a9 su chassis | 6,27:1 | 4,5:1 | sì |
| rosso di errore #dc7273 su chassis | 5,22:1 | 4,5:1 | sì |
| testo #dfe3e7 su alto #262a2e | 11,2:1 | 4,5:1 | sì |
| testo secondario #9aa1a9 su alto | 5,54:1 | 4,5:1 | sì |
| rosso di errore #dc7273 su alto | 4,61:1 | 4,5:1 | sì |
| sopra(accento) = #0b0c0e su #4aa3ff | 7,43:1 | 4,5:1 | sì |
| sopra(verde) = #0b0c0e su #54c07a | 8,57:1 | 4,5:1 | sì |
| sopra(ambra) = #0b0c0e su #e0a33c | 8,83:1 | 4,5:1 | sì |
| sopra(rosso) = #0b0c0e su #dc7273 | 6,24:1 | 4,5:1 | sì |
| stato verde #54c07a su fondo | 8,57:1 | 4,5:1 | sì |
| stato verde #54c07a su alto | 6,33:1 | 4,5:1 | sì |
| stato ambra #e0a33c su fondo | 8,83:1 | 4,5:1 | sì |
| stato ambra #e0a33c su alto | 6,52:1 | 4,5:1 | sì |
| stato rosso #f2857c su fondo | 7,85:1 | 4,5:1 | sì |
| stato rosso #f2857c su alto | 5,8:1 | 4,5:1 | sì |
| stato quieto #9aa1a9 su fondo | 7,5:1 | 4,5:1 | sì |
| stato quieto #9aa1a9 su alto | 5,54:1 | 4,5:1 | sì |
| stato blu #4aa3ff su fondo | 7,43:1 | 4,5:1 | sì |
| stato blu #4aa3ff su alto | 5,49:1 | 4,5:1 | sì |

#### Tema scuro (chiarore 0 del PC)

| Coppia | Rapporto | Soglia | AA |
|---|---|---|---|
| testo #dfdfdf su fondo #080808 | 15,03:1 | 4,5:1 | sì |
| testo secondario #9a9a9a su fondo | 7,12:1 | 4,5:1 | sì |
| rosso di errore #dc5f5f su fondo | 5,57:1 | 4,5:1 | sì |
| testo #dfdfdf su chassis #171717 | 13,45:1 | 4,5:1 | sì |
| testo secondario #9a9a9a su chassis | 6,37:1 | 4,5:1 | sì |
| rosso di errore #dc5f5f su chassis | 4,99:1 | 4,5:1 | sì |
| testo #dfdfdf su alto #1f1f1f | 12,37:1 | 4,5:1 | sì |
| testo secondario #9a9a9a su alto | 5,86:1 | 4,5:1 | sì |
| rosso di errore #dc5f5f su alto | 4,59:1 | 4,5:1 | sì |
| sopra(accento) = #080808 su #4aa3ff | 7,6:1 | 4,5:1 | sì |
| sopra(verde) = #080808 su #54c07a | 8,77:1 | 4,5:1 | sì |
| sopra(ambra) = #080808 su #e0a33c | 9,03:1 | 4,5:1 | sì |
| sopra(rosso) = #080808 su #dc5f5f | 5,57:1 | 4,5:1 | sì |
| stato verde #54c07a su fondo | 8,77:1 | 4,5:1 | sì |
| stato verde #54c07a su alto | 7,22:1 | 4,5:1 | sì |
| stato ambra #e0a33c su fondo | 9,03:1 | 4,5:1 | sì |
| stato ambra #e0a33c su alto | 7,44:1 | 4,5:1 | sì |
| stato rosso #f2857c su fondo | 8,03:1 | 4,5:1 | sì |
| stato rosso #f2857c su alto | 6,61:1 | 4,5:1 | sì |
| stato quieto #9aa1a9 su fondo | 7,67:1 | 4,5:1 | sì |
| stato quieto #9aa1a9 su alto | 6,31:1 | 4,5:1 | sì |
| stato blu #4aa3ff su fondo | 7,6:1 | 4,5:1 | sì |
| stato blu #4aa3ff su alto | 6,26:1 | 4,5:1 | sì |

#### Tema chiaro (chiarore 100 del PC)

| Coppia | Rapporto | Soglia | AA |
|---|---|---|---|
| testo #dfdfdf su fondo #1e1e1e | 12,51:1 | 4,5:1 | sì |
| testo secondario #9d9d9d su fondo | 6,15:1 | 4,5:1 | sì |
| rosso di errore #dc8585 su fondo | 6,14:1 | 4,5:1 | sì |
| testo #dfdfdf su chassis #2d2d2d | 10,33:1 | 4,5:1 | sì |
| testo secondario #9d9d9d su chassis | 5,08:1 | 4,5:1 | sì |
| rosso di errore #dc8585 su chassis | 5,07:1 | 4,5:1 | sì |
| testo #dfdfdf su alto #353535 | 9,2:1 | 4,5:1 | sì |
| testo secondario #9d9d9d su alto | 4,52:1 | 4,5:1 | sì |
| rosso di errore #dc8585 su alto | 4,52:1 | 4,5:1 | sì |
| sopra(accento) = #1e1e1e su #4aa3ff | 6,33:1 | 4,5:1 | sì |
| sopra(verde) = #1e1e1e su #54c07a | 7,3:1 | 4,5:1 | sì |
| sopra(ambra) = #1e1e1e su #e0a33c | 7,52:1 | 4,5:1 | sì |
| sopra(rosso) = #1e1e1e su #dc8585 | 6,14:1 | 4,5:1 | sì |
| stato verde #54c07a su fondo | 7,3:1 | 4,5:1 | sì |
| stato verde #54c07a su alto | 5,37:1 | 4,5:1 | sì |
| stato ambra #e0a33c su fondo | 7,52:1 | 4,5:1 | sì |
| stato ambra #e0a33c su alto | 5,53:1 | 4,5:1 | sì |
| stato rosso #f2857c su fondo | 6,69:1 | 4,5:1 | sì |
| stato rosso #f2857c su alto | 4,92:1 | 4,5:1 | sì |
| stato quieto #9aa1a9 su fondo | 6,39:1 | 4,5:1 | sì |
| stato quieto #9aa1a9 su alto | 4,7:1 | 4,5:1 | sì |
| stato blu #4aa3ff su fondo | 6,33:1 | 4,5:1 | sì |
| stato blu #4aa3ff su alto | 4,66:1 | 4,5:1 | sì |


**Tocchi:** il più piccolo è di **48 dp** (`Modifier.tocco`, IconButton, «?», legenda, graffetta e invio). Unica eccezione voluta: i segni ✓ ⋯ dei messaggi (`toccoInLinea`). Restano piccoli da vedere, ma Compose ne allarga da solo l'area di tocco a 48 dp.

**Caratteri sotto 12 sp rimasti:** 0 (`grep -rnE "fontSize = ([0-9]|1[01])\.sp" android/app/src/main/java`). Prima della 0.83.0 erano 136.

**Foto:** non le fa c-49. Le fa chi avrà l'emulatore dopo le misure di c-48, insieme alle altre foto della 0.83.0.

## Pagina servita dal PC

- I token `--t0…--t4` sono in **rem**, sia in `:root` che in `MISURE`, e `body` è `font: 100%`. Così i caratteri seguono la dimensione scelta nel browser del telefono. Con i px fissi non la seguivano.
- Nessun `font-size` in px nella pagina (lo controlla il test), e niente sotto 0,75rem (12px).
- Tasti di almeno 48px. Il «?» resta disegnato a 24px, ma `.aiuto::after` con `inset: -12px` lo rende toccabile su 48px.

## Trappole

- **Un solo emulatore e un solo Gradle alla volta.** Alle 13:45 del 21/10 girava `misura.py prima-c48 tutto` (le misure di velocità). Prima di installare un APK o toccare l'emulatore, controllare che non ci sia un `python misura.py` o un `GradleMain` in corso (`Get-CimInstance Win32_Process`).
- `sed -i` su `*.kt` riscrive anche i file senza modifiche. Git poi avvisa «LF will be replaced by CRLF» su tutti, ma il commit contiene solo i file cambiati davvero. Non è un problema.
