---
titolo: "«Installa» apre le note di cosa cambia; niente più novità all'avvio (0.39.0)"
quando: 2026-10-02T09:10:00+02:00
tag: ["aggiornamenti", "novita", "release", "telefono", "android", "markdown", "decisione-nicholas"]
---

# La decisione (Nicholas, 02/10)

«Quando si trova un aggiornamento, invece che installa e riavvia esce un pulsante installa che apre una finestra dove si vede il change log di quello che cambia con l'aggiornamento. Ed eliminiamo la finestra di change log all'apertura, che è fastidiosa.»

# Come funziona

- **Striscia del PC** (`App.tsx`, fase `pronto`): il tasto è «Installa» e apre `ModaleNote` (tipo `installa`).
  - Dentro ci sono le note della nuova versione e di quelle saltate, dalla più recente.
  - In fondo, **«Installa e riavvia»** chiama `aggiornamenti.installa()`, con la logica di sempre (quiete, avviso, ripresa).
  - **«Più tardi»** chiude la finestra.
- **Da dove vengono le note**: `aggiornamenti.note()` in `src/main/aggiornamenti.ts` chiama `raccogliNote` di `src/shared/note-aggiornamento.ts`:
  1. Prima l'API pubblica di GitHub, `repos/<owner>/<repo>/releases?per_page=100`, senza token: 60 richieste l'ora, con una memoria di 10 minuti. Il repository è quello di `aggiornamenti.json` se c'è, altrimenti `niko9090/sierradeck`. Se ne prendono i corpi in Markdown, filtrati con installata < v ≤ nuova, senza bozze né prerelease.
  2. Poi `info.releaseNotes` di electron-updater, con `fullChangelog = true` acceso: è **HTML** ricavato dall'atom di GitHub, che `markdownDaHtml` riporta a Markdown.
  3. Se non c'è niente, un `avviso` per esteso con il link alla pagina delle versioni. **Si può installare lo stesso.**
- **Il corpo della release è il changelog**: lo scrive la procedura di pubblicazione dalle voci di `novita.ts` (`- **…** …`, una riga vuota fra le voci). Se manca la voce in `novita.ts`, la finestra della versione dopo resta vuota.
- **Markdown sicuro**: `analizzaMarkdown` / `analizzaRiga` non producono mai HTML, ma blocchi `titolo | paragrafo | elenco | codice` fatti di pezzi `{testo, grassetto?, corsivo?, codice?, link?}`.
  - Le etichette HTML e i commenti si tolgono.
  - Un link resta solo se è `https://github.com/…` (`linkAmmesso`: niente http, niente credenziali, niente domini simili).
  - Le voci separate da righe vuote restano **un solo** elenco: le release sono scritte così.
  - I tre schermi disegnano gli stessi blocchi:
    - React con il testo dentro gli elementi;
    - la pagina con `esc` e un nuovo controllo del prefisso `https://github.com/`;
    - Kotlin con `AnnotatedString` e `LinkAnnotation.Url`.
- **Novità all'avvio tolte**: non esistono più l'IPC `novita:daMostrare`, la funzione `novitaDaMostrare` e `ModaleNovita.tsx`.
  - Le novità della versione installata, più le 5 prima, si aprono dal **numero di versione** in alto a sinistra (`Console`, `onApriNovita`) o da **Impostazioni → «Novità di questa versione»**, che manda l'evento `sierradeck:apri-novita`.
  - Si apre la stessa `ModaleNote`, convertita con `noteDaNovita`.
  - `ultimaVersioneVista` resta in `impostazioni-store`, ma non serve più.
- **Telefono**:
  - la rotta `GET /api/aggiornamento/note` risponde 409 se il PC è vecchio;
  - nella pagina, `installaAggiornamento()` legge le note e `confermaInstalla()` installa;
  - nell'app, `DialogoNoteAggiornamento` in `NoteAggiornamento.kt`, poi `Computer.kt` con l'«Installa» di prima.
  - Prima la pagina chiedeva «Sicuro?» e l'app non chiedeva niente: ora tutti e due passano dalle note.

# Trappole

- **Nessuna installazione salta la finestra.**
  - `sistema:riavvia` (il conto alla rovescia dopo «Porta qui» o una fusione) e `driveRiavvia` dal telefono, con un aggiornamento pronto, prima **installavano**. Ora riavviano e basta, con `aggiornamenti.nonInstallareAllaChiusura()` subito prima di `app.relaunch()`.
  - Va spento, perché `relaunch` + `quit` con `autoInstallOnAppQuit` acceso fa partire insieme l'installer silenzioso e la versione vecchia (13/09).
  - L'aggiornamento resta scaricato e ricompare «Installa».
- **Installazione alla chiusura** (`autoInstallOnAppQuit = true`): l'abbiamo **tenuta**. Non riavvia e non interrompe niente, perché chi chiude ha già deciso di smettere; i testi della striscia, delle Impostazioni e delle due finestre lo dicono.
- `fullChangelog = true` cambia solo la forma di `releaseNotes` (diventa un elenco): il resto di electron-updater non lo usa.

# Test

- `tests/shared/note-aggiornamento.test.ts`:
  - ordine e filtro delle versioni;
  - niente bozze o prerelease;
  - script e `<img onerror>` che spariscono;
  - link solo verso github.com;
  - elenco unico;
  - HTML di electron-updater riportato a Markdown;
  - le riserve quando GitHub non risponde.
- `tests/shared/novita.test.ts`: c'è la voce della versione; la voce resa nella finestra; il corpo della release riletto come un elenco solo.
- `tests/main/note-aggiornamento-pagina.test.ts` (pagina) e `tests/main/client-rotte.test.ts` (rotta).
- Kotlin: `NoteAggiornamentoTest`.
- Verificato sulle release vere: dalla 0.37.4 alla 0.38.2 → 4 versioni, ognuna con un elenco più la riga dell'app Android.
