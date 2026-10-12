---
titolo: "0.62.0: testi corti, la spiegazione dietro al «?»"
quando: 2026-10-12T08:30:00+02:00
tag: ["interfaccia", "testi", "aiuto", "pagina", "app", "0.62.0", "decisione di Nicholas"]
---

# La decisione

Nicholas, 12/10, dopo aver provato i menu della 0.61.0: «sono tutti troppo complicati, non si riesce a leggere tutta la pappardella che hai messo, piuttosto metti un punto di domanda e uno apre la spiegazione di quello che non sa».

Prima (09/09) aveva chiesto testi completi («non risparmiarti»). Le due richieste stanno insieme così: **la spiegazione resta completa, ma non è più a vista.** A vista restano tasti, numeri, stati e al più una riga corta. Tutto il resto sta dietro un «?» accanto alla cosa che spiega.

# Cosa resta sempre a vista

- I messaggi di esito, errore e avviso.
- Le domande in attesa: non si nascondono mai.
- Negli avvisi gravi, il «Cosa fare».
- Nei dialoghi di conferma, una riga con cosa succede e se si cancella qualcosa. Il dettaglio («Cosa succede», «Cosa non succede», «Se qualcosa non torna») sta dietro al «?».

# Come è fatto

- **PC:** `src/renderer/components/Aiuto.tsx`, usato come `<Aiuto di="nome">testo completo</Aiuto>`.
  - Disegna un tondino da 20 px; il fumetto si apre accanto.
  - Il fumetto si apre verso sinistra vicino al bordo destro e verso l'alto nella metà bassa della finestra.
  - Esc chiude prima il fumetto e non il pannello: ascolta in cattura e chiama `stopImmediatePropagation`.
  - Un clic dentro il fumetto non arriva alla `<label>` che lo contiene, quindi non accende la casella.
  - Per mettere il «?» accanto a un titolo: classe `.con-aiuto`.
- **Pagina servita:** `aiuto(id, testoHtml)` in `client-pagina.ts`.
  - Lo stato aperto/chiuso sta in `aiutiAperti`, non nel DOM: la pagina si ridisegna di continuo e un `<details>` si richiuderebbe da solo.
  - La spiegazione si apre sotto, a tutta larghezza.
  - Nelle Impostazioni le voci di ogni sezione sono tutte nel «?» del titolo della sezione (prima erano ripetute in fila sotto i comandi).
- **App:** `Aiuto.kt`, con `Aiuto(testo, di)`, `TitoloConAiuto` e `RigaConAiuto`. Il tondino ha un'area di tocco di 32 dp e apre una finestrella scorrevole con «Chiudi». `Sezione()` di `Computer.kt` accetta `aiuto =`.
- **Guardia:** `tests/renderer/testi-corti.test.ts` fallisce se un pannello del PC rimette un paragrafo `<p>` fisso di oltre 260 caratteri fuori da `<Aiuto>`. Non conta come spiegazione un paragrafo con una condizione, con ⚠ o con dentro dei tasti: è uno stato.

# Trappole

- I test che ricostruiscono pezzi della pagina con `estrai(...)` + `new Function` devono includere anche `aiuto` e `var aiutiAperti = {}`, altrimenti danno «aiuto is not defined». È successo in `sottofondo-pagina` e `pannello-drive-app`.
- Il blocco di `aiuto` nella pagina non va messo vicino a `ULTIMO_WORKSPACE`, perché `gestione-pagina.test.ts` esegue quel pezzo da solo.
- Un testo spostato dietro al «?» non si cerca più nel risultato chiuso: nei test si controlla `data-aiuto="…"`, oppure si apre l'aiuto.

# Prova dal vero

Copia `SIERRADECK_PROVA` (porte 47650/47651) e pagina in Edge senza finestra a 390 punti. Screenshot fuori dal repository, in `Documents\sierradeck-screenshot-0-62-0`. Con un Esc premuto sulla spiegazione aperta si chiude il fumetto e il pannello resta aperto.
