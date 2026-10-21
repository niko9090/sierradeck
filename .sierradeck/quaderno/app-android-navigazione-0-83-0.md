---
titolo: "App Android 0.83.0: quattro voci, indietro, schermata dell'autopilota — com'è fatta e le trappole"
quando: 2026-10-21T12:45:00+02:00
tag: ["android", "navigazione", "0.83.0", "c-46", "c-509", "trappole"]
---

# Com'è fatta (ramo c-46)

La mappa prima/dopo, con il perché, sta in `app-android-0-83-0.md` (c-45). Questa scheda dice dove sta ogni cosa nel codice e cosa ricordare.

**Barra a 4 voci.** `Navigazione.kt` contiene `VoceBarra` (ADESSO, CHAT, PROGETTI, ALTRO), `Posto` e `Navigazione`, ed è puro (`NavigazioneTest`).
- Ordine e nomi vengono da `MENU_TELEFONO` in `src/shared/menu-principale.ts`, scritti in `assets/menu.json` con la chiave `telefono` (`AGGIORNA=1` sul test `tests/shared/menu-principale.test.ts`).
- Le 7 `Scheda` di prima restano solo come *destinazioni* (notifiche, «Apri la chat»): `Navigazione.verso` le porta nella voce giusta.

**Indietro**, uguale ovunque:
1. chiude il dialogo;
2. chiude il dettaglio (chat, autopilota, progetto, sezione di Altro, riga riassuntiva aperta);
3. torna alla prima linguetta;
4. torna ad Adesso;
5. da Adesso esce dall'app.

I passi 1-2 li fanno i `BackHandler` delle schermate, che vincono perché sono composti più in fondo. I passi 3-5 li fa `App.kt` con `Navigazione.indietro`.

**Adesso** = `Adesso.kt`, cioè `Lavori` con `testa = domandeInCima(...)`.
- Le domande si rispondono con un tocco (`DomandeAdesso.tocco`).
- `/api/domande` si legge solo mentre la testa è composta (`PolsoDomande`).

**Altro**: `Altro.kt` mostra l'elenco delle sezioni con Cerca. Ogni sezione legge il PC solo quando è aperta.

**File divisi** (tutti sotto le 800 righe; c'è anche un test in `DomandeAdessoTest`):

| Prima | Ora |
|---|---|
| `Lavori.kt` | Lavori, DettaglioAutopilota, PartiAutopilota, Delega |
| `Chat.kt` | Chat, DettaglioChat, SceltaChat, MenuChat |
| `Modelli.kt` | Modelli, ModelliLavoro, ModelliDrive |
| `Computer.kt` | ConsumiVista, AltriComputer, CodeProgetti, SezioniImpostazioni, AggiornamentiVista, AccountVista (in Computer.kt resta solo `DriveECode`) |
| `App.kt` | App, BarraVoci, NotaGlobale |

**Autopilota (c-509, Nicholas 21/10: «non si vede nulla, troppe info»).**
- In alto una riga riassuntiva, `RiassuntoAutopilota.di`, uguale a `riassuntoApTesto` della pagina: stato, criteri, chat, giri, e prima le domande.
- Un tocco apre tutto il resto; chiusa, sotto ci sono solo la conversazione e la casella.
- Sulla pagina servita dal PC le parti hanno la classe `solo-riassunto`, nascosta da `.riassunto-chiuso`.

# Trappole

- **Tastiera.** Sono servite tre cose insieme:
  - `imePadding()` sulla schermata;
  - `consumeWindowInsets(pad)` sul contenuto dello `Scaffold`, altrimenti sotto la casella resta un vuoto alto quanto la barra;
  - `adjustResize` nel manifest, per Android senza edge-to-edge (l'emulatore è API 30).

  In più la barra delle voci si nasconde con `tastieraAperta()`, che legge gli inset della finestra: `WindowInsets.isImeVisible` di Compose non basta senza edge-to-edge.
- **Nomi Kotlin già presi.** C'era già `Voce` in AzioniTelefono.kt (per questo `VoceBarra`) e `AdessoTest` in DalVivoTest.kt (per questo `DomandeAdessoTest`). Dopo una divisione, private→internal ha fatto scontrare anche Criterio, Account e Fascia. Prima di creare un nome, cercarlo con grep.
- **Test che leggono i sorgenti per nome di file.** Spostando codice, vanno aggiornati: test TS (copia-incolla, grafica-0-82-0, testi-creazione, menu-principale) e test Kotlin (HarnessAppTest, NomePcTest, SceltaVistaTest, MenuPrincipaleTest).
- **Emulatore.** Sull'emulatore c'è l'APK *release* (firmato). Un debug dà `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, e disinstallare perde l'accoppiamento. Per provare: `gradle assembleRelease` con la chiave locale, poi `adb install -r`. Non è una pubblicazione.
- **Worktree senza node_modules.** Fare un junction verso quello della cartella principale (lo fanno tutti i worktree).
- **Hook GateGuard (ECC).** Blocca il primo Write/Edit di ogni file e i comandi «distruttivi» (anche `git checkout -- file`): presentare i fatti e riprovare.
- **Heredoc Bash con testo italiano.** Gli apostrofi rompono l'heredoc: meglio scrivere uno script Python con Write.

# Non fatto qui

- «Hai risposto: …» non è stato provato dal vivo. Compare rispondendo a una *domanda*, e le sole domande aperte sull'emulatore erano «Vai» di autopiloti di prova: rispondere li avrebbe fatti partire durante le misure di c-11. È coperto dal PC (`src/shared/chat-autopilota.ts`).
- I punti 3-4 di c-509 non sono stati fatti da questa chat:
  - chiudere la domanda «pubblico la 0.81.1?»;
  - chiudere le chat ferme della 0.79-0.82.

  Toccano al supervisore e alla regola «mai chiudere chat a mano».
- `StatoChat.kt` dice ancora «nella scheda Domande». Il testo è condiviso con i test TS: va cambiato insieme al PC.
