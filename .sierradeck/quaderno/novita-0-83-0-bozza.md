---
titolo: "Novità della 0.83.0 (bozza)"
quando: 2026-10-21T14:30:00+02:00
tag: ["release", "0.83.0", "bozza", "android"]
---

Bozza scritta da c-51 con i commit già in main al 21/10 (24b85f93). **Aggiornata da c-52 (21/10, 15:30): le righe vere sono ora in `src/shared/novita.ts`, voce 0.83.0; la riga della pagina (c-50) è confermata perché è in main (`e12eccd7`).** Al massimo 8 righe nella release. Le righe «DA CONFERMARE» si scrivono o si tolgono solo dopo che il loro ramo è stato unito in main.

## Novità (da copiare nella release)

- App: quattro voci fisse in basso, Adesso, Chat, Progetti e Altro. «Indietro» funziona sempre allo stesso modo e ogni funzione si raggiunge in due tocchi al massimo, senza perderne nessuna. `f7ff7150`
- Adesso: in cima ci sono le domande per te, a cui rispondi con un tocco. `f7ff7150`
- Autopilota: la casella per scrivere resta in basso, anche con la tastiera aperta, e sopra c'è solo la conversazione. Stato, criteri, chat e giri stanno in una riga in alto che si apre con un tocco. `3316262c` `fa313896`
- Più leggibile: i caratteri seguono la dimensione scelta nel telefono, il contrasto è buono anche nel tema scuro, i tasti sono grandi e i colori delle attività sono quelli del PC, con il loro simbolo. `cb492fe3` `304da880`
- **Velocità: dopo c-48.** All'apertura compare subito l'ultimo stato e l'app chiede meno cose al PC. Si scrive in `novita.ts` (c'è il commento al posto giusto) solo con i numeri veri del rapporto, dopo l'unione di c-48.
- Confermata (c-50, `e12eccd7`): la pagina del telefono servita dal PC ha le stesse quattro voci e gli stessi colori dell'app.

## Non va nelle novità (interno)

- File Kotlin divisi in pezzi sotto le 800 righe (`f7ff7150`): non si vede da fuori, sta nel rapporto.
- Elenco delle quattro voci condiviso fra PC e app (`MENU_TELEFONO`, `assets/menu.json`): sta nel rapporto.
