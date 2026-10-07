---
titolo: "Il nome scelto dei PC al posto dell'hostname (0.52.4, app 2.52.4)"
quando: 2026-10-07T18:45:00+02:00
tag: ["nome-pc", "hostname", "battito", "telefono", "pagina"]
---

# Il difetto

Nicholas (07/10): nell'app, in alto e nella schermata del cambio di computer,
compariva il nome tecnico del PC (hostname) invece di quello che gli aveva dato.

**Cause:**
1. Il PC non aveva un nome scelto: `pc.json` → `nome` era l'hostname della prima volta, e `/api/stato` → `computer.nome` era `hostname()` (`nomeComputer` in `index.ts`).
2. Nell'app l'intestazione metteva per primo `stato.computer.nome`, cioè l'hostname, sopra il nome della postazione.
3. `Postazioni.usata` salvava come primo nome quello mandato dal PC (l'hostname). Da lì in poi lo trattava come «scritto a mano» e non lo aggiornava più. Per questo anche la schermata del cambio (che usa il nome della postazione) restava sull'hostname.

# Come funziona adesso

- **Funzione pura** `nomeDaMostrare(pc)` in `src/shared/nome-pc.ts`: prima `nomeScelto`, poi `nome`, poi `host`. `sottotitoloPc` dà l'hostname piccolo solo se è diverso (senza badare a maiuscole e minuscole).
  - **Copie:** la pagina servita (`pulitoPc`, `nomeDaMostrare`, `sottotitoloPc`, `hostPiccolo` in `client-pagina.ts`) e `NomePc.kt`.
  - **Test:** casi comuni in `tests/fixtures/nome-pc-casi.json`, letti da `tests/shared/nome-pc.test.ts` (anche contro la pagina) e da `NomePcTest.kt`.
  - **Pulizia:** è scritta senza espressioni regolari, perché nella pagina, che è un template, le barre rovesciate sono una trappola.
- **Sul PC:**
  - `pc.json` ha `nomeScelto`, mentre su disco `nome` resta l'hostname per le versioni vecchie.
  - `identitaPc.leggi()` restituisce `nome` già da mostrare, più `host` e `nomeScelto`. Così battito, presenze, staffette, case delle chat e posta portano il nome scelto **senza toccarli uno per uno**.
  - Il nome si cambia con `impostaNome` (IPC `pc:impostaNome`), dalla UI «Altri computer» → «Questo PC» (`NomeQuestoPc` in `PannelloAccount.tsx`), oppure dal telefono con `POST /api/nome-pc`, che risponde 403 a un altro PC.
- **Dove viaggia:**
  - il battito porta `host` e `nomeScelto`;
  - `/api/stato` → `computer: { nome, host, nomeScelto }`;
  - `/api/pc` porta `host`;
  - le Domande usano `nomeDaMostrare(b)`.
- **Renderer:**
  - `state/nomi-pc.ts` legge identità e battiti ogni 30 s e quando cambia il nome;
  - `useNomePc(id, ricordato)` e il componente `<NomePc>` danno il nome **di adesso** per id;
  - servono perché riquadri remoti, case e attese si ricordano il nome di quando sono nati.
  - Li usano: «SU» del Mosaic, `RiquadroRemoto`, `Terminal` (attesa e altrove), «Riprendi», `OspiteChat`, `ModaleRiordina` e la mappa (`NodoMappa.host`).
- **App:**
  - `intestazionePc(postazione, computer, ripiego)`: un nome scritto a mano sul telefono vince, poi quello del computer, poi quello salvato, poi l'indirizzo.
  - `Postazione` ha `host` e `aMano`. Il campo `aMano` è `null` sulle postazioni salvate prima della 2.52.4; `nomeDopo` lo decide così: un nome uguale all'hostname, all'indirizzo o al nome del PC non è scritto a mano.
  - La matita sul computer collegato chiama `api.nomePc`. Se riesce, la postazione segue il PC (`aMano = false`); se no, il nome resta solo sul telefono.

# Trappole

- Nel main, per avvisare le finestre si usa `finestreDiChat()` e non `BrowserWindow.getAllWindows()`: c'è un test che lo controlla (`finestre-pannello-separate.test.ts`).
- `/api/ciao` resta senza nome, di proposito: il nome di una macchina si dice solo a chi ha la chiave.
- Un PC vecchio (prima della 0.52.4) manda solo l'hostname in `nome`: l'app lo usa anche come `host`.
