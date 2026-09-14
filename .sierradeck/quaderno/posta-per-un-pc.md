---
titolo: "La posta per un PC: azioni che si eseguono solo su quel computer, quando è acceso (0.27.0)"
quando: 2026-09-14T03:40:00+02:00
tag: ["drive", "multi-pc", "posta", "consegna", "telefono", "0.27.0"]
---

# Perché

Nicholas (2026-09-14, notte): «se sto operando su una chat su una cartella
in rete gli altri come fanno a operare lì? bisogna creare una sorta di azione
che rimane eseguibile solo in remoto su quel PC quando è online, altrimenti
non funzionerebbe». La coda condivisa dei progetti (`coda-condivisa-comandi.md`)
copre i progetti che viaggiano sul Drive: consegna chi ha il testimone. Qui
la cartella **sta su un PC preciso** (un disco di rete montato solo lì, un
progetto che non viaggia): non si porta il lavoro, si manda il comando là.

# Com'è fatta (`src/main/progetti/posta.ts`)

Due oggetti cifrati sul Drive, nella scatola delle presenze:

- `pc-<pcId>` — il **battito** di ogni PC: nome, versione, quando, le
  cartelle in cui lavora (progetti collegati qui + cartelle delle chat
  aperte), le chat aperte con «aspetta». Si riscrive solo se cambia
  qualcosa o ogni 2 minuti (`BATTITO_PC_OGNI_MS`). Un PC è «acceso» se ha
  battuto da meno di 5 minuti (`PC_SPENTO_DOPO_MS`).
- `posta-<pcId>` — la **cassetta**: `VocePosta { id, testo, cwd, sessione?,
  creataIl, daPc, daNome, stato: attesa|consegnata|fallita, consegnataIl?,
  aSessione?, esito?, apertaIl? }`, al massimo 50 voci; una cassetta vuota si
  cancella dal Drive.

Il **postino** (`creaPostino`, un giro ogni 30 s da `index.ts`, sfalsato di
25 s dalla ronda): batte, poi prende la **prima** voce in attesa della sua
cassetta:
1. la cartella non esiste qui → `fallita` con `esito`;
2. c'è una chat viva che aspetta nella cartella (o la chat precisa) →
   `scriviNelRiquadro` (testo + invio, come dal telefono) → `consegnata`
   con `aSessione`;
3. c'è una chat nella cartella ma lavora → si aspetta il giro dopo;
4. non c'è nessuna chat → `apriChat(cwd)` (o `riprendiChat(cwd, sessione)`)
   una volta (`apertaIl`), si riprova ad aprirla solo dopo 5 minuti.

`Scatola.elenca(prefisso)` (nuova, facoltativa) serve a trovare i `pc-*`.

# Dove si usa

- PC: pannello Account → «Altri computer» (`SezioneComputer`) → «Azioni…» →
  `ModalePosta.tsx` (cartella fra quelle del PC o libera, chat, testo, voci
  in attesa/chiuse, togli, pulisci). IPC `posta:*`.
- Telefono: pagina, tab Computer → «Altri PC» (`elencoPc`, `apriPc`,
  `mandaPosta`); app Android, `Computer.kt` sezione «Altri computer»
  (`PcRemoto`, `Posta`, `VocePosta` in `Modelli.kt`, `Api.pc/posta*`).
  Rotte `GET /api/pc` (`vivo` deciso dal PC), `POST /api/posta`,
  `/api/posta/aggiungi`, `/togli`, `/pulisci`; 409 se il PC è vecchio.
- Test: `tests/main/progetti-posta.test.ts` (il punto: dal portatile alla
  torre; apertura di una chat; chat precisa; cartella inesistente; ordine;
  battito parsimonioso; Drive giù), rotte, pagina.

# Limiti noti

- Un PC compare fra gli altri solo dopo il primo giro con la 0.27.0 e con
  il Drive collegato e la cassaforte sbloccata.
- Il risultato si legge dalla chat di quel PC (dal telefono collegato a
  quel PC, o quando la chat arriva qui con la sincronizzazione): la voce
  dice solo «consegnata a «…»», non cosa ha risposto la chat.
- Due mittenti che scrivono nella stessa cassetta nello stesso istante:
  l'ultimo vince (come la coda).
- Il postino apre una chat nel workspace attivo della prima finestra
  (`client:apri` senza workspace).
