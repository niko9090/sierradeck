---
titolo: "«Elimina workspace» con il recupero di 30 giorni (0.81.0)"
quando: 2026-10-19T18:30:00+02:00
tag: ["workspace", "recupero", "0.81.0", "PC", "pagina", "app"]
---

**Prima.** Eliminare un workspace lo toglieva da `workspaces.json`. Le conversazioni restavano su disco, ma la disposizione si perdeva: quali chat c'erano e in quali riquadri. Ne restava solo una copia, `workspaces.prima-dell-eliminazione.json`, cioè l'ultima, da riaprire a mano.

**Ora (ramo c-10, `c7b4934`).**
- **Elimina.** Il workspace intero, con i layout di ogni slot, va in `workspaces-recupero.json` nella cartella dei dati, dentro «Eliminati».
  - Ci resta 30 giorni, poi la voce esce da sola. Si toglie solo la riga dal JSON: le conversazioni non si cancellano mai.
  - Vale per tutte e due le strade: il pannello (IPC `workspace:elimina`) e la rete senza finestre (`eliminaWorkspace` in `index.ts`).
- **Ripristina.** Il workspace torna nella fascia di tutte le finestre (`workspace:ripristinato`) **senza cambiare lo schermo**.
  - Se nel frattempo è nato un workspace con lo stesso nome, torna come «nome (recuperato)», poi «(recuperato 2)».
  - La voce si toglie dal recupero solo **dopo** che `workspaces.json` è stato scritto.
- **Sicurezza dei dati.** Un `workspaces-recupero.json` che c'è ma non si legge non si riscrive: niente recupero, e niente voci perse. È la stessa lezione di `7680168`.
- **Testi.** Conferma corta («Le sue chat si chiudono, le conversazioni restano. Per 30 giorni lo ritrovi in «Eliminati», con «Ripristina».»), con il resto dietro il «?» (`AIUTO_ELIMINA_WORKSPACE`). La riga sotto il nome è `rigaEliminato`: «3 chat · resta fino al 18/11».
  - Sono uguali su PC (`PannelloWorkspace`), pagina (`eliminatiWsHtml`) e app (`GestioneWorkspace`).
  - L'app li confronta con `azioni-0.55.json`, che si rigenera con `AGGIORNA=1 npx vitest run tests/shared/azioni-telefono-app.test.ts`.

**Rotte:**
- `GET /api/workspace/recupero` restituisce `{ voci: [{nome, eliminatoIl, scadeIl, chat, da?}] }`;
- `POST /api/workspace/ripristina {nome, eliminatoIl}`: un PC più vecchio risponde 409 «aggiornalo alla 0.81.0», mentre GET dà `senzaRecupero: true`.

Le due rotte passano dal ponte. `ripristina` è vietata agli autopiloti, come `elimina`.

**Trappola per chi scrive codice Kotlin da uno script Node:** `${…}` dentro un template literal JS diventa interpolazione di JS. I `${` di Kotlin vanno scritti `\${`.

**Trappola dei test Kotlin:** un nome di test fra apici inversi non può contenere punti («0.81.0»). Gradle si ferma con `Name contains illegal characters: ..` in `compileDebugUnitTestKotlin`: si scrive «0-81-0».

**Restano da fare:**
- i due workspace sbagliati del 19/10 («visitafacile» qui e «dentro al mio server nexora c'è gia un») si tolgono con questo «Elimina», **dopo** che Nicholas installa la 0.81.0;
- prima va chiesto a Nicholas cosa fare dell'autopilota ap-79a4ce02, che ha la sua richiesta vera: va rifatto in NexoraOS o va tolto insieme al workspace;
- al rilascio l'app va alzata di versione, perché `android/` è cambiato.
