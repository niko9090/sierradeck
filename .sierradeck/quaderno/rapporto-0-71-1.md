---
titolo: "Rapporto 0.71.1 per Nicholas: domande sempre visibili, spostamento con PC spento, Progetti provata con i dati veri"
quando: 2026-10-13T19:45:00+02:00
tag: ["rapporto", "0.71.1", "per Nicholas"]
---

# In breve

La 0.71.1 è **pubblicata e non installata**: la installi tu. L'app è la 2.71.1, con l'APK firmato.

# 1. Le domande che sparivano

**Le cause**, trovate leggendo il codice e il registro vero (senza toccarlo):
- Una chat che finiva il turno **con una domanda scritta** contava come «ha finito», e dalla 0.70.0 il filtro «Aspettano te» la nascondeva. Questa era la causa principale.
- **Un dialogo** che i segnali vedevano e lo schermo no finiva fra le «ha finito».
- **Quando l'autopilota rispondeva da solo** (alla notifica della chat, con una risposta già data, oltre le 6 domande all'ora, o alle domande di fine turno) restava solo una riga nel diario.
- La prova dal vero ha trovato altre due cose:
  - **il suggerimento in grigio** di Claude Code 2.1.29x nel campo bloccava la consegna dei messaggi in sottofondo;
  - **difetto grave**: subito dopo un messaggio, il sottofondo ripremeva Invio sulla domanda a scelta appena aperta, e così **rispondeva al posto tuo** con la prima opzione.

**Adesso:**
- Ogni domanda di una chat sta in «Aspettano te» finché rispondi, sul PC, sulla pagina e nell'app.
- Se risponde l'autopilota, la domanda resta visibile per 12 ore come «risposta dall'autopilota: …».
- Nessun Invio parte mai su una domanda aperta.

**Prova dal vero** su una chat di prova (cartella «SierraDeck-prova-c2», Claude Code 2.1.296):
- la fiducia nella cartella è arrivata come «permesso»;
- la domanda scritta è arrivata in Domande in 2 s;
- la domanda a scelta è rimasta aperta finché ho scelto «Gatto» dalle Domande;
- dopo ogni risposta, la domanda è sparita.

# 2. Lo spostamento fermo

Il tuo trasloco di «SierraDeck» delle 17:07 è fermo perché il portatile è spento. **Non l'ho toccato.**

Adesso il motivo è scritto in chiaro, con il nome del PC, e ci sono due scelte:
- **«Aspetta …»**: riparte da solo quando il PC si riaccende;
- **«Vai avanti senza…»** (con conferma): usa la copia che quel PC ha già sul Drive. La sua copia sul disco resta dov'è; quando il PC torna, quello che ha solo lui entra nei recuperati e la sua copia va nel recupero di quel PC per 30 giorni. Niente si perde.

Funziona uguale su PC, pagina e app.

# 3. Progetti provata tasto per tasto con i tuoi dati

Ho usato una copia staccata dei tuoi dati, senza Drive, senza ponte e senza chiave di casa. L'ho cancellata alla fine.
- **PC:** 547 controlli con clic veri.
- **Pagina:** 341 tocchi veri a larghezza telefono.

Errori trovati e corretti:
- tutti gli altri PC risultavano «da aggiornare»;
- 14 progetti su 29 erano «da sistemare» solo perché registrati due volte con la stessa cartella: ora sono 2;
- «Quaderno del progetto» apriva un altro quaderno;
- «Dove vive ogni chat…» si apriva sotto la schermata;
- «Annulla l'unione» partiva senza conferma;
- sulla pagina del telefono il menu «Sposta su…» allargava la pagina, così i «?» e i tasti a destra non si toccavano.

Dettagli in `progetti-provati-con-dati-veri-0-71-1.md`.

# Punti aperti

1. Il trasloco di «SierraDeck» resta fermo finché accendi il portatile o scegli «Vai avanti senza»: decidi tu.
2. L'app Android non l'ho provata dal vero con i tuoi dati (nessun telefono collegato): ha gli stessi dati e gli stessi testi del PC, e i suoi test passano.
3. Sulla pagina, un tocco può andare perso se cade proprio mentre arrivano dati nuovi: è successo 2 volte su 341. È rimasto così.
4. Restano da prima: mettere l'OAuth di Google «In produzione» e togliere i progetti di prova.
