---
titolo: "«Non connesso» mentre la chat scorre (0.56.0, app 2.56.0): la causa, lo stato unico per PC, la linea lenta"
quando: 2026-10-09T11:30:00+02:00
tag: ["collegamento", "telefono", "app", "pagina", "pc-remoto", "linea", "isteresi"]
---

# La segnalazione (Nicholas, 09/10)

«Anche la sezione di connessione va sistemata perché ci sono volte che dice che non è connesso e la chat però scorre».

# La causa (tre controlli che non si parlavano)

Erano vere tutte e due le ipotesi, e ce n'era una terza.

1. **L'indicatore usava un controllo separato dal flusso della chat.**
   - La linea (`collegamento.ts` / `Linea.kt` / la copia nella pagina) avanzava solo con il keepalive: `/api/stato` ogni 2 s.
   - Lo schermo della chat arrivava da altre richieste (`/api/storia`, `/api/dentro`, `/api/scrivi`), che la linea **non contava**.
   - Sul PC ogni riquadro remoto aveva la sua macchina: uno poteva dire «giù» mentre un altro, dello stesso PC, riceveva lo schermo.
2. **Un solo keepalive scaduto (6 s) bastava a dichiarare la caduta.** `/api/stato` è la risposta più pesante: tutte le chat, i workspace, le domande, gli autopiloti. Attraverso il ponte e Tailscale può passare i 6 secondi mentre la storia, leggera, arriva in 300 ms.
3. **Nell'app il pallino del PC accoppiato e la banda «Non parlo con il computer»** dipendevano da un terzo contatore: `connesso = false` dopo due giri di `/api/stato` falliti, qualunque cosa facesse la chat.

# Come è adesso

- **Lo stato è uno solo per PC.**
  - App: `Collegamenti` (in `Linea.kt`), con chiave `"accoppiato"` o l'id del PC del ponte. Lo leggono l'indicatore in alto, la pillola, la banda delle urgenze, la chat sull'altro PC, la schermata del cambio PC e Lavori.
  - PC: `linee-remote.ts` → `avanzaLineaPc`/`useLineaPc` per pcId, condiviso da tutti i riquadri di quel PC.
  - Pagina: una sola `linea`.
- **Ogni risposta riuscita è un segno di vita.**
  - App: `Api.conSegno` intorno a ogni chiamata. Per il PC accoppiato vale qualunque risposta HTTP. Per un PC del ponte, un 502/504 è «quel PC no, il ponte sì».
  - Pagina: `chiedi()` conta ogni risposta tranne `/api/stato`, che conta già il giro.
  - PC: `pc-remoto.ts` tiene `vivoIl` per ogni PC. La Salute e la mappa (`statoDi`) non bussano se quel PC ha risposto a qualcosa negli ultimi 20 s.
- **«Non connesso» (`ricollego`) solo con tutte e due le condizioni:** 3 fallimenti di fila **e** 20 s senza nessun dato (`GIU_DOPO_FALLITI`, `GIU_DOPO_MS`).
  - Prima la linea è **«lenta»** (gialla): si continua a chiedere ogni 2 s, senza attese crescenti.
  - Collegati ma senza risposte da 8 s, anche senza errori (una richiesta appesa), la fase mostrata è «lenta» (`faseVista`).
  - La caduta si data dall'ultimo segno di vita.
- **Isteresi:** da «non connesso» la prima risposta fa «lenta», la seconda «collegato» (`TORNA_DOPO_OK`). L'indicatore non sfarfalla.
- Il primo collegamento, senza mai un segno di vita, va giù subito come prima: serve alla schermata «Mi collego a…».
- Con la linea lenta i messaggi in coda partono lo stesso, sul PC e nella pagina. Prima partivano solo da «collegato».

# Test

- `tests/shared/collegamento.test.ts`:
  - il caso di Nicholas: due minuti in cui il controllo fallisce ogni 2 s e la storia arriva ogni 1,5 s, e «non connesso» non compare mai;
  - la caduta vera, il ritorno con isteresi, la richiesta appesa.
- `LineaTest.kt`: gli stessi casi, più `Collegamenti` con l'`Api` vera contro un PC finto che dà la storia mentre il controllo scade.
- `linea-pagina.test.ts`: la copia della pagina confrontata con la macchina condivisa su 800 passi a caso (fase, tentativi, caduta, ultimo segno di vita, fallimenti).

# Trappola

La pagina ha **una copia** della macchina (`passoLinea`): se cambia `collegamento.ts` va cambiata anche lei. Il test a caso lo scopre.
