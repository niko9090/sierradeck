---
titolo: "Le chat che rimbalzavano fra i PC ogni 5 minuti: causa, regola «esiste qui = mia», e i battiti che non si vedono (0.28.3)"
quando: 2026-09-17T17:30:00+02:00
tag: ["drive", "multi-pc", "progetti", "registro", "posta", "rimappatura", "trappola"]
---

Nicholas (17/09): «ho provato ad aprire una chat che non è nativa di qui ma
non si apre nulla». Il portatile è alla 0.28.2, acceso, e sincronizza.

## Cosa succedeva (dal registro di questo PC)

Ogni 5 minuti, 168 volte in un giorno: `ARRIVO: 15 chat da portare qui` →
`15 chat tornate nella cartella del loro PC (E:\Documents\Progetti
SierraDeck\fionda apl, …\Wdeck)` → `8 chat rimappate nelle cartelle di qui
(C:\Users\nikof\Progetti SierraDeck\Wdeck)` → al SALVA `conflitto … vince
questo` sulle stesse chat. Una chat presa in mezzo punta a una cartella che
qui non c'è → all'apertura «Questa chat lavora su un altro PC» **senza
nome** (pc id vuoto) e «Scrivile là» senza destinatario.

## Le tre cause

1. **Il registro `progetti-drive.json` diceva «di un altro PC» per cartelle
   che esistono qui.** Il pc id `058be1ee679e` dichiara 17 percorsi
   `C:\Users\nikof\Progetti SierraDeck\<X>`; 11 esistono su questo disco.
   Stesso utente sui due PC (o un vecchio id di questa macchina: `pc.json`
   riscritto il 06/09). `altrove()` (index.ts) girava sul registro e
   rispondeva «un altro PC»; `pianificaRitorno` spostava le chat sotto lo
   slug dell'origine.
2. **L'arrivo riscaricava quello che la rimappatura aveva spostato.** Il
   filtro dei candidati (`sincronia.ts` `arrivo`) faceva `locale ===
   undefined → scarica`: il file non stava più a quel percorso perché era
   stato messo sotto lo slug di qui. Loop perfetto.
3. **Nessun battito `pc-<id>` di altri PC sul Drive.** `pc-altrui.json`
   riscritto ogni 30 s e sempre `[]`; `elenca('pc-')` funziona (pagina da
   1000, `nextPageToken`). Quindi l'altro PC non scrive il suo battito, o
   lo scrive con un id che qui viene filtrato come «me». Non osservabile
   da qui: il registro non diceva né se il MIO battito veniva scritto né
   cosa vedevo.

## La correzione (0.28.3)

- `altrove(cwd)`: **se `existsSync(cwd)` → non è di nessun altro, punto**,
  prima dei battiti e del registro. `pianificaRitorno` riceve `esiste` e
  salta le chat con la cartella qui.
- `giaArrivata(prec.file[p], v)` (incrementale.ts): se il manifesto locale
  conosce già quella voce del Drive (stessa impronta, o size+mtime) non si
  riscarica anche se il file non sta più a quel percorso. Il manifesto
  locale impara ogni voce arrivata, quindi vale dal giro dopo.
- `posta.ts`: log `[posta] battito scritto sul Drive come pc-<id> («nome»,
  versione, N cartelle)` la prima volta, e `[posta] altri PC sul Drive: …`
  ogni volta che l'elenco cambia (anche «nessuno»). Da leggere su ENTRAMBI i
  PC per capire da che parte manca il battito.
- Test: `tests/main/rimbalzo-fra-pc.test.ts`.

## Da verificare dopo l'aggiornamento di entrambi i PC

Nel registro del portatile deve comparire «battito scritto sul Drive come
pc-…»; nel registro del fisso «altri PC sul Drive: Portatile 0.28.3 (pc-…)».
Se sul portatile manca la riga del battito → il suo `scatola()` è
`undefined` (cassaforte bloccata o Drive non connesso) o `giro()` fallisce
(«[posta] giro fallito …»). Se c'è ma qui non si vede → id uguale (pc.json
copiato da un backup: `LaptopBackup` del 5/7) e va rigenerato sul portatile.

## Dati del Drive utili (17/09)

4766 file di SierraDeck, 1919 di questo PC. Slug per macchina nel
manifesto: `E--Documents-Progetti-SierraDeck-*` 835 chat (attivo OGGI: è
l'altro PC), `E--Users-nikof-*` 725 (qui), `X--*` 345 (fino all'8/9),
`C--Users-nikof-*` 326, `C--Users-tecnico-*` 154 (fino al 9/9),
`E--obsidian-Glos` 69, `C--Users-asus` 2. Almeno tre macchine hanno
scritto su questo Drive. Conto: n.ferrariconsulenze@gmail.com.
