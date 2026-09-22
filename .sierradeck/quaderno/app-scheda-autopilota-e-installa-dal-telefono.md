---
titolo: "App: scheda autopilota schiacciata dalla tastiera; «Installa» muto dal telefono (2.36.0 / 0.33.1)"
quando: 2026-09-22T23:55:00+02:00
tag: ["android", "autopiloti", "aggiornamenti", "debug-wireless"]
---

# Sintomo (22/09, foto dello schermo via adb)

Nella scheda di un autopilota sul telefono: «non vedo cosa scrivo, non scorre la pagina e non vedo la chat». La casella di scrittura e «Manda» stavano **sotto le linguette, fuori dallo schermo**; «Chat con lui» tagliato in fondo.

# Causa

`DettaglioAutopilota` (Lavori.kt) aveva due `Column(weight(1f))`: la meta' di sopra (fasi + misura + chat + casella) e la meta' di sotto (linguette + contenuto). Con la tastiera aperta lo spazio si dimezza; nella meta' di sopra le fasi e la misura sono fisse, la `LazyColumn` della chat va a zero e la casella, non pesata, finisce oltre il bordo (clippata). Il motivo del fermo era scritto tre volte (striscia, intestazione, nota delle fasi).

# Correzione (app 2.36.0)

- Fasi e misura sono le **prime voci della LazyColumn**: scorrono con la chat.
- Le linguette nascono **chiuse** (`linguettaAperta`), il contenuto ha `heightIn(max = 260.dp)`; toccare la linguetta aperta la richiude. Niente indicatore quando sono chiuse.
- Casella con i colori della chat (`OutlinedTextFieldDefaults.colors`, testo `Banco.testo`).
- Scroll in fondo con `lista.layoutInfo.totalItemsCount - 1` (l'indice contava solo le battute).

# «Installa» dal telefono che non fa niente

Il PC (fino alla 0.33.0) risponde `pronto` + `errore` quando l'attesa della quiete fallisce, e **l'app non mostrava `errore` in fase «pronto»**; se la POST falliva, `Installazione.finita` senza una parola. Se `installazioneAvviata` e' rimasto vero da un tentativo precedente, ogni «Installa» rimanda lo stato vecchio in silenzio: da 0.33.1 lo dice nello `errore` («chiudi e riapri SierraDeck»). L'app 2.36.0 mostra il motivo in «pronto»/«disponibile» e un poscritto dopo «Installa».

# Come si e' debuggato (riusabile)

Debug wireless Android via Tailscale: `adb pair <ip>:<porta della finestra "Associa"> <codice>` (la porta di associazione e' DIVERSA da quella della schermata principale), poi `adb connect <ip>:<porta principale>`; `adb exec-out screencap -p > file.png` e leggere l'immagine. L'app release non e' debuggable (`run-as` no) e non logga gli errori HTTP: le foto dello schermo sono l'unica prova. Il telefono di Nicholas: S25 Ultra, `100.120.40.52` in Tailscale.

# Scoperto per strada

Un **terzo PC, DESKTOP-G24D499** («desktop-glos-niko», 100.113.83.97), gira la 0.29.1 e non scrive il battito sul Drive dal 21/09 sera pur essendo acceso: da controllare la' (cassaforte chiusa? Drive scollegato?). Il portatile si e' aggiornato da solo alla 0.33.0.
