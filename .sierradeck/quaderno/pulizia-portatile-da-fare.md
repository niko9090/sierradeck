---
titolo: "Pulizia del portatile, da fare quando si accende"
quando: 2026-10-16T10:00:00+02:00
tag: ["pulizia", "prove", "portatile", "da fare", "recupero"]
---

# Quando
Lo fa una chat, **solo quando Nicholas accende il portatile (LAPTOP-E60QM2D1) e lo dice**. Niente script che aspettano da soli: è la regola dopo il 14/10. Il portatile era alla 0.69.0, spento dal 13/10.

# Cosa c'è di prova là (letto il 16/10 dal suo ultimo battito)
- le cartelle `SierraDeck-prova-ws`, `SierraDeck-prova-c2` e `SierraDeck-prova-ap`, in `Progetti SierraDeck`;
- l'autopilota di prova che lavora in `SierraDeck-prova-ap`;
- eventuali workspace e chat aperte con quei nomi.

# Passi esatti (da PC-Fisso, attraverso il ponte)
1. **Dispositivo temporaneo.** Nessuna chiave sul disco si può riusare. Si aggiunge in `%APPDATA%\SierraDeck\dispositivi.json` un dispositivo con nome evidente («Collaudo Claude (temporaneo)») e il segno SHA-256 di una chiave generata nello scratchpad. Prima si tiene una copia del file. Le chiamate vanno a `http://127.0.0.1:47640` con l'intestazione `x-sierradeck-chiave`. Da Git Bash si usa `MSYS_NO_PATHCONV=1`.
2. **Il ponte:** `POST /api/ponte {"pc":"058be1ee679e","percorso":"…","corpo":{…}}`. Senza `corpo` il portatile riceve una GET.
3. **Inventario:** `percorso:/api/stato`, cioè chat, autopiloti e progetti. Poi `percorso:/api/workspace`, che dà i nomi dei workspace.
4. **Chiudere le chat di prova:** per ogni chat con la cartella «SierraDeck-prova-…», `/api/prova/chiudi {"chat":"<id>"}`. Decide il portatile se è di prova; le chat vere le rifiuta.
5. **Autopilota di prova:** `/api/prova/autopilota {"autopilota":"<id>","azione":"ferma"}`, poi, quando è fermo, `{"azione":"archivia"}`.
6. **Workspace di prova:** per ogni nome «SierraDeck-prova-…», `/api/workspace/elimina {"nome":"…"}`. Vanno nella lista dei workspace eliminati e si possono recuperare.
7. **Progetti nel recupero di 30 giorni:** `/api/prova/togli-progetto` con `{"nome":"SierraDeck-prova-ws"}`, `{"nome":"SierraDeck-prova-c2"}` e `{"nome":"SierraDeck-prova-ap"}`. Risponde 409 se dentro c'è ancora una chat aperta: prima il passo 4.
8. **Controllo:** di nuovo `/api/stato`. Non deve restare nessun «SierraDeck-prova-».
9. **Togliere il dispositivo temporaneo**, sempre, anche se qualcosa è andato storto. Si usa la funzione del programma: `apriDispositivi(dati).revoca('<id>')` da `src/main/dispositivi.ts`, la stessa del tasto in Impostazioni → Client. Poi si verifica che una chiamata con quella chiave dia 401 e che `dispositivi.json` non lo nomini più.

Le storie delle chat di prova sul disco del portatile (`~/.claude/projects`) non si raggiungono da lontano. Con la 0.75.2 installata là, il passo 7 le porta nel recupero da solo. Con la 0.69.0 restano: lo si scrive nel rapporto.

# Il Drive: «Chat delle prove» (dopo la 0.75.3)
Sul Drive restano 21 chat di prova, perché il salvataggio non toglie mai una chat sparita dal disco. **Dopo che Nicholas ha installato la 0.75.3**, lui apre Progetti → Spazio sul Drive → «Chat delle prove» → «Conferma». Le chat vanno nel recupero del Drive per 30 giorni e «Annulla» le rimette. Non parte mai da sola e non la preme una chat.
