---
titolo: "Velocità dell'app Android 0.83.0: cosa è cambiato e i numeri prima/dopo"
quando: 2026-10-21T17:00:00+02:00
tag: ["0.83.0", "android", "velocità", "misure", "polling", "cache", "trappola"]
---

Lavoro di c-48 (consegne c-512 e successive), fatto sopra il commit di velocità di c-11 (646673b1, portato con cherry-pick in ae632778) e sopra le quattro voci di c-46, già in main. Questa scheda prende il posto delle righe «in corso» del § 8 di `app-android-0-83-0.md`.

## Cosa fa l'app adesso

1. **All'apertura mostra l'ultimo stato salvato** (`CopiaStato`, `StatoVeloce.kt`).
   - Il file è `stato-<impronta>.json`, nella cartella privata dell'app: uno per computer, con l'impronta dell'indirizzo nel nome e non l'indirizzo.
   - Si legge su IO e si mostra subito. Il primo stato vero lo sostituisce (`daCopia`).
   - Si riscrive al massimo ogni 30 s, e solo se è cambiato. «Dimentica» il computer cancella anche la sua copia.
2. **Lo stato si decodifica solo se cambia** (`StatoSoloSeCambia`).
   - Se il testo è uguale all'ultimo: niente decodifica e stesso oggetto, quindi Compose non ridisegna.
   - Se cambia: chat, autopiloti e domande rimasti uguali restano gli oggetti di prima.
3. **Stato fermo, si chiede più di rado:** dopo 5 giri uguali di fila il prossimo arriva fra 3 s invece di 2 (`PolsoApp.davantiOgni`). 3 s è sotto gli 8 s di `Linea.LENTA_DOPO_MS`, quindi la linea non sembra lenta.
4. **Adesso non chiede più `/api/domande` ogni 2 s.** Lo rilegge solo quando `DomandeAdesso.firma(stato)` cambia (domande, autopiloti che cambiano fase, chat che chiedono) e subito dopo ogni risposta. Con una conversazione aperta resta ogni 2 s.
5. **Autopiloti degli altri PC:** una volta al minuto invece che ogni 15 s.
6. **Liste con chiavi stabili:** Conversazioni (messaggi e «in attesa») e DettaglioAutopilota (messaggi), con `ChiaviElenco`. Due righe identiche prendono chiavi diverse («#2»): due chiavi uguali fanno cadere la LazyColumn.
7. **Drive e PannelloDrive:** `Davanti.pausa` invece di `delay`, quindi le letture si fermano con l'app dietro.
8. **Da c-11:**
   - R8 sull'APK di rilascio, da 16,8 a 4,2 MB;
   - «Mi collego a…» compare solo dopo 1 s;
   - stato e Ronda si decodificano fuori dal thread dello schermo;
   - prima dello stato si legge «Carico le chat…».

I test sono in `StatoVeloceTest` (10) e `AvvioVelocitaTest`: 425 test unitari verdi, 1 saltato.

## Numeri

Il PC era carico per tutto il pomeriggio (100 % di CPU, con Gradle e vitest di altre chat). Per questo «prima» e «dopo» sono stati misurati **a turni**: 3 giri, e in ogni giro prima la 0.82.0 e subito dopo la nuova (`note/prova-083/ab.py`).
- **Prima:** l'APK di rilascio 0.82.0 pubblicato, preso dalla copia di c-39.
- **Dopo:** l'APK di rilascio di c-48 (188824ed).
- **Condizioni:** stesso emulatore `sd11` (Android 11, 1080×2400), stessa copia di prova dietro il contatore delle chiamate (10.0.2.2:47770), stesso metodo e stesso script di c-11 (`misura.py`).

| Misura | Prima (0.82.0) | Dopo (0.83.0) | |
|---|---|---|---|
| Avvio a freddo (`am start -W`, mediana di 24) | 3282 ms | **2808 ms** | −14 % |
| Primo contenuto visibile (mediana di 12) | 9032 ms | **7340 ms** | −19 % |
| Schermata ferma, finiti i salti (mediana di 12) | 12069 ms | **8757 ms** | −27 % |
| Cambio schermata (tocco sulla barra, mediana) | 652 ms (7 voci, 63 tocchi) | **459 ms** (4 voci, 36 tocchi) | −30 % |
| Scorrimento di una lista di 250 righe, p50 / p90 per fotogramma | 65 / 109 ms | **57 / 101 ms** | meglio |
| Chiamate al PC al minuto, app davanti e ferma (3 min) | 29,0 | **26,7** | −8 % |
| Chiamate al PC al minuto, app dietro (2 min) | 4,5 | 4,5 | uguale |

**La lista lunga.** È File › Archivio › lunga, una cartella di 250 file finti della copia di prova. Prima ci si arriva con File, dopo con Progetti › File. La misura «prima» di c-11 non era valida: la sua lista «Riprendi» ne mostrava solo 3, e la sua `lista` era vuota. Sull'emulatore senza GPU tutti i fotogrammi superano i 16 ms (i «a scatti» sono il 100 % sia prima sia dopo): per confrontare si usano i percentili.

**A PC scarico** (riferimento, non confrontabile con la tabella):
- c-11 alle 10:40 misurava sulla 0.82.0: avvio 1358 ms, primo contenuto 4315 ms, schermata ferma 6506 ms, cambio 482 ms.
- Il primo giro «dopo» di c-48, con meno carico: avvio 1633 ms, primo contenuto 3892 ms, ferma 4415 ms, cambio 367 ms.

I file dei numeri, fuori da git, sono in `note/prova-083/misure/` della copia `ap-f1e631f5-c-48`:
- `ab.json` e `prima-ab-N.json` / `dopo-ab-N.json`;
- `prima-c11.json` (la copia delle misure «prima» di c-11);
- le chiamate in `prima-c48-finale.json` e `dopo-c48-finale.json`.

## Ancora da guadagnare

- **Domande nella copia salvata:** la nuova si apre su Adesso, e in cima ci sono le domande, che arrivano da `/api/domande` e non dallo stato. La copia salvata non le contiene. Salvare anche l'ultima risposta di `/api/domande` farebbe comparire subito anche quelle.
- **Peso dell'avvio a freddo:** ne pesano molto `Application`/Compose e il primo layout. Un *baseline profile* aiuterebbe.

## Trappole

- **Un PC carico falsa le misure.** Lo stesso APK ha dato 1,6 s e poi 3,0 s di avvio a mezz'ora di distanza. Non si confrontano numeri presi in momenti diversi: si misurano prima e dopo a turni.
- **Versione installata sull'emulatore:** `dumpsys package … lastUpdateTime` è in UTC. Le 10:38 erano le 12:38 italiane, cioè la build di c-11, non la 0.82.0.
- **Lo stesso numero di versione:** la 0.82.0 e la build nuova hanno lo stesso `versionName`. Per tornare alla vecchia serve `adb install -r -d`, che tiene l'accoppiamento.
- **Nomi nel dump di `uiautomator`:** i nomi con emoji arrivano come `&#128193; Archivio`, e si toccano scritti così.
- **Cache di Kotlin rovinata:** con un altro Gradle acceso nello stesso momento, `App.kt` dava «Unresolved reference» su classi che c'erano. Si risolve togliendo `android/app/build/kotlin`.
- **Heredoc di Bash:** si mangia i backslash dei percorsi Windows. Script con percorsi si scrivono con Write.
