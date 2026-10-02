---
titolo: "«Installa là»: aggiornare un altro PC dal pannello Salute (0.46.0)"
quando: 2026-10-02T18:30:00+02:00
tag: ["aggiornamenti", "pc-remoto", "salute", "chiave-di-casa"]
---

# Come funziona

- Sul PC **remoto** non serve niente di nuovo: usa le rotte che c'erano già per
  il telefono, `/api/aggiornamento` (stato), `/cerca`, `/scarica`, `/note`,
  `/installa`. Sono dietro la chiave: un altro PC entra solo con la **chiave di
  casa** (`chiaveDiCasa('client-pc:<id>')`, quindi stessa cassaforte = stesso
  Drive di SierraDeck). L'attesa della quiete (chat che finiscono il turno, lavoro
  Drive) la fa `aggiornamenti.installa()` di quel PC.
- Su **questo** PC: `src/shared/installa-la.ts` → `passoInstallaLa(nome, da, osservazione, memoria, adesso)`
  è la macchina a stati pura (cerca → scarica → installa → attendo → riparte →
  fatto/fallito/errore). Il main (`index.ts`, «Installa là») osserva ogni 3 s con
  `/api/ciao` (versione che gira davvero) + `/api/aggiornamento` e manda
  `installaLa:stato` alle finestre.
- Conferma con le note: `salute:noteInstallaLa` chiede a quel PC di cercare e
  legge le **sue** note; se non risponde, usa le novità di qui fra la sua
  versione e questa.

# Esiti

- **fatto**: torna con versione > quella di partenza.
- **fallito**: torna con la stessa versione (con il `tentativoFallito` di quel PC,
  se c'è: motivo e strade), oppure non torna entro 12 minuti.
- **errore**: si ferma prima (non trova, non scarica, preparazione > 20 min,
  strada solo via Drive: dalla cassetta Drive non si installa).

# Da sapere

- Non provato dal vivo su un altro PC (avrebbe reinstallato il portatile di
  Nicholas senza che lo sapesse): coperto dai test di `tests/shared/installa-la.test.ts`.
- Il PC remoto segna la ricerca come «dal telefono» (`cercaAggiornamento` fa
  `cerca(true)`): innocuo, ma il suo schermo dice «chiesto dal telefono».
- Il telefono non mostra il tasto (azione `installa-la` saltata dall'app;
  la pagina dice «dal computer»).
