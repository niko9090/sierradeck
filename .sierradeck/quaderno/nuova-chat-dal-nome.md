---
titolo: "Una chat nuova nasce dal nome: Documenti, progetti SierraDeck o altrove (0.19.0)"
quando: 2026-09-08T20:00:00+02:00
tag: ["chat", "cartelle", "progetti", "drive", "ui"]
---

# Perché

Nicholas (2026-09-08): «le chat di default si aprono nella cartella
Documenti con il nome della chat; se la cartella non esiste verrà creata; se
si preme "metti dentro alla cartella progetti" va in Documenti nella cartella
di SierraDeck per i progetti importati». Confermato: cartella dei progetti
spostata in Documenti, e casella «e mettila sul Drive».

# Com'è fatto

- `src/renderer/nuova-chat.ts`: `PostoChat = documenti | progetti | altrove`,
  `nomeCartellaDaNome` (via `< > : " / \ | ? *` e controlli → `-`, niente
  punti/spazi in coda, max 80, vuoto → «Nuova chat»), `unisciPercorso`
  (separatore della base), `componiNuovaChat({nome, posto, altrove, basi})`
  → `{cartella, nome, daCreare}`. Altrove = regola di prima (`validaNuovaChat`:
  cartella esistente, nome dalla cartella se manca).
- `ModaleNuovaChat.tsx`: prima «Come si chiama», poi tre radio con il
  percorso sotto; «altrove» mostra campo + Sfoglia; «progetti» mostra la
  casella «e mettila sul Drive» (abilitata se `sync.stato()` dice Drive
  connesso e sbloccato). Invio apre. Per documenti/progetti chiama
  `sistema.creaCartella` e poi `onApri(cartella, nome, {sulDrive})`.
- `Console.tsx`: se `sulDrive` → `progetti.aggiungiPercorso(cartella)`.
- IPC nuovi (`index.ts`): `sistema:cartelleBase` → `{documenti:
  app.getPath('documents'), progetti: identitaPc.cartellaProgetti}`;
  `sistema:creaCartella(p)` crea SOLO sotto una delle due basi (un percorso
  scritto a mano con un errore non deve diventare una cartella a caso);
  `progetti:aggiungiPercorso(p)` = «Metti una cartella sul Drive» senza
  finestra.
- `progetti/pc.ts`: `predefinita()` = `<home>/Progetti SierraDeck` se esiste
  già (legacy, non si sposta niente), altrimenti `<Documenti>/Progetti
  SierraDeck` (dep `documenti?`). Test `progetti-pc.test.ts`.

# Trappole

- Il tool Bash di Claude Code de-escapa i backslash negli heredoc: i test
  con percorsi Windows vanno scritti via file (Write), non via heredoc.
- Su un PC con `pc.json` senza `cartellaProgetti` e senza la cartella nella
  home, dopo l'update la ricezione cambia in Documenti: i progetti già
  ricevuti restano dove sono (il registro ha i percorsi per PC).
