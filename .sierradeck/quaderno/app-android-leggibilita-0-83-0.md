---
titolo: "App Android e pagina 0.83.0: leggibilità (contrasto, caratteri, tocchi, colori degli stati) — regole e trappole"
quando: 2026-10-21T13:50:00+02:00
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

## Pagina servita dal PC

- I token `--t0…--t4` sono in **rem**, sia in `:root` che in `MISURE`, e `body` è `font: 100%`. Così i caratteri seguono la dimensione scelta nel browser del telefono. Con i px fissi non la seguivano.
- Nessun `font-size` in px nella pagina (lo controlla il test), e niente sotto 0,75rem (12px).
- Tasti di almeno 48px. Il «?» resta disegnato a 24px, ma `.aiuto::after` con `inset: -12px` lo rende toccabile su 48px.

## Trappole

- **Un solo emulatore e un solo Gradle alla volta.** Alle 13:45 del 21/10 girava `misura.py prima-c48 tutto` (le misure di velocità). Prima di installare un APK o toccare l'emulatore, controllare che non ci sia un `python misura.py` o un `GradleMain` in corso (`Get-CimInstance Win32_Process`).
- `sed -i` su `*.kt` riscrive anche i file senza modifiche. Git poi avvisa «LF will be replaced by CRLF» su tutti, ma il commit contiene solo i file cambiati davvero. Non è un problema.
