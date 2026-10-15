---
titolo: "0.75.0: parlare all'autopilota con il microfono (PC, pagina, app)"
quando: 2026-10-15T23:30:00+02:00
tag: ["0.75.0", "microfono", "dettatura", "pc", "pagina", "app"]
---

Nicholas, 15/10: «voglio poterti parlare direttamente con il microfono per comunicare qui».

# Dove sta il 🎤
- **Sul PC:** nella chat con l'autopilota (`ChatAutopilota`), in «Scrivi tu» delle Domande (`SchedaDomandaVista`), nelle domande dell'autopilota (`DomandeAutopilota`), nella conversazione delle Domande (`PannelloDomande`) e nel primo messaggio dell'autopilota dormiente (`ElencoWorkspace`).
- **Sulla pagina e nell'app:** gli stessi posti.

Il testo dettato va **nel campo**, mai inviato da solo.

# Come funziona
- **PC, dettatura di Windows.** La Web Speech API di Electron non va senza le chiavi di Google.
  - `TastoMicrofono.tsx` mette il cursore in fondo al campo e chiama `dettatura:apri`.
  - Il main porta davanti la finestra e preme Win+H con `keybd_event` (PowerShell, `src/main/dettatura.ts`).
  - Prima legge (in sola lettura) il registro della privacy del microfono (`ConsentStore\microphone` e `\NonPackaged`) e la build di Windows (dalla 17134). Se manca qualcosa, il tasto dice «dettatura non disponibile su questo PC» con il «?».
  - Le regole pure stanno in `shared/dettatura.ts`.
- **Pagina, Web Speech API** (`webkitSpeechRecognition`), con `lang it-IT`, `interimResults` e `continuous`.
  - `testoDettatoJs` mette il dettato dopo il testo che c'era. Il campo si ricerca per id a ogni risultato, perché la pagina si ridisegna.
  - Senza API, il tasto dice che il browser non ce l'ha.
- **App, `SpeechRecognizer` di sistema** con `EXTRA_LANGUAGE it-IT`, `EXTRA_PARTIAL_RESULTS` e `EXTRA_PREFER_OFFLINE`.
  - Il permesso `RECORD_AUDIO` si chiede alla prima volta, con il motivo in una riga.
  - Nel manifest c'è `<queries>` per `RecognitionService` (serve da Android 11).
  - La logica di stato è pura in `Dettatura.kt` (`RegolaDettatura.passo`), con i test in `DettaturaTest`.

**L'audio non passa da SierraDeck:** lo ascolta il sistema, e lo dice il «?» su tutti e tre i lati.

# Provato dal vero (copia di prova, Windows 11 build 26100)
- Il clic su 🎤 in «Scrivi tu» porta davanti la finestra, mette il fuoco nel campo e apre il pannello «Servizi vocali Microsoft» della digitazione vocale (foto `note/prova-073/foto-075/desk-01.png`).
- Alla seconda pressione Windows prova ad ascoltare e risponde «Verifica che il microfono sia acceso»: su questo PC adesso non c'è un microfono attivo. Il testo dettato vero va verificato con un microfono.

**Trappole:**
- alla prima volta Windows mostra l'informativa dei servizi vocali online, e dice che può installare il riconoscimento sul dispositivo: è Windows a chiederlo, e lo decide Nicholas;
- `keybd_event` preme sulla finestra **davanti**: per questo il main fa prima `focus()`;
- nel template della pagina le regex vogliono `\\s` nel sorgente.
