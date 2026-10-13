---
titolo: "Giro dei menu con clic veri (0.71.0): perché «Strumenti ▾» non funzionava e cosa è stato corretto"
quando: 2026-10-13T13:05:00+02:00
tag: ["interfaccia", "difetto", "prova dal vero", "0.70.0", "0.71.0", "trappola"]
---

# Il difetto segnalato

Nicholas, sulla 0.70.0 installata: «il tasto Strumenti non funziona».

# La causa vera (non era il CSS)

`attivaChiusuraFuori` (`src/renderer/trascina-finestre.ts`) chiude il pannello aperto a **ogni mousedown** fuori da `.pannello` e `.console`. Le schermate a tutta finestra della 0.70.0 (Autopiloti, Salute, Impostazioni, File, Negozio, Quaderno) usano invece la classe `.progetti`. Il primo mousedown vero su una linguetta, su «Strumenti ▾» o su un «?» chiudeva quindi **tutta la schermata**, prima ancora del clic.

Nella notte della 0.70.0 le prove erano fatte con `element.click()`, che non passa dal mousedown: per questo sembrava tutto a posto.

**Trappola da ricordare:** provare l'interfaccia solo con eventi del mouse veri (CDP `Input.dispatchMouseEvent`: moved, pressed, released), mai con `element.click()`.

# Cosa è stato corretto

| Dove | Prima | Adesso |
|---|---|---|
| Tutte le schermate `.progetti` | Il primo clic vero le chiudeva | Un clic dentro (anche in tendine, fumetti «?» e conferme) non è «fuori»: vedi `DENTRO_LA_FINESTRA` |
| Gli 8 «Strumenti ▾» (barra, Progetti, Autopiloti, Salute, Impostazioni, File, Quaderno, Account) | `onMouseLeave` la chiudeva appena il mouse usciva di 4 px; con la testata a capo usciva dallo schermo | `TendinaMenu.tsx`: si chiude solo con un clic fuori, con Esc o scegliendo una voce; la posizione resta dentro la finestra (`posizioneMenu`) |
| «Su altri PC ▾» | Esc non la chiudeva, e il suo velo restava sopra tutto | Esc la chiude; larghezza allineata al CSS (480), così non esce a destra |
| Salute → «Consumi e limiti (colonna)» | La colonna si apriva **sotto** la Salute, invisibile | La Salute si chiude e la colonna si vede |
| Pagina del telefono, tutti i «?» | Il tocco cambiava `aiutiAperti` ma la pagina non si ridisegnava | `aiutiAperti` è nell'impronta della pagina |
| Autopiloti → altri PC | Crash «a.criteri.filter is not a function» (dal registro del 13/10, 09:32): in `/api/stato` i criteri sono un numero | `autopilotiDaStato` li rifà elenco; `descriviAutopilota` regge le righe storte |

Test: `tests/renderer/chiusura-fuori.test.ts`, `tendina-menu.test.ts`, `colonna-consumi.test.ts`, `tests/main/pagina-aiuti.test.ts`, `tests/shared/autopiloti-altri-righe.test.ts`.

# Esiti del giro, dopo le correzioni

Prove fatte nella copia `SIERRADECK_PROVA` con gli script dello scratchpad `giro-menu.mjs` (PC) e `giro-pagina.mjs` (pagina, Edge senza finestra).

**PC a 1584 px:** 89 elementi provati, 88 rispondono. Il «?» del PIN delle chat apre il fumetto verso l'alto: va bene se guardato da solo, il giro lo segnava per la posizione presa prima dello scorrimento.

| Schermata | Provati | OK |
|---|---|---|
| Principale | 3 | 3 |
| Progetti | 6 | 6 |
| Autopiloti | 5 | 5 |
| Domande | 3 | 3 |
| File | 2 | 2 |
| Salute | 7 | 7 |
| Impostazioni | 27 | 26 |
| Chat e workspace | 3 | 3 |
| Negozio | 2 | 2 |
| Quaderno | 2 | 2 |
| Account | 4 | 4 |
| Consumi | 7 | 7 |

**PC a 900 px:** tutto risponde. «Su altri PC ▾» usciva a destra ed è corretto.

**Voci di «Strumenti ▾» dei Progetti:** tutte aprono il loro foglio o la loro finestra. Le voci provate sono: Tutte le chat, Salvataggio e arrivo, Il contenuto del Drive, Spazio sul Drive, Riordina le chat…, Dove vive ogni chat…, Sposta progetto….

**Pagina a 390 e a 1200 px:** 26 su 26 su ogni scheda (linguette e «?»). Prima della correzione, nessun «?» si apriva.

Aperto: «Strumenti ▾» e «⋯» della pagina compaiono solo dentro le sottoviste (dettaglio progetto, chat aperta), e il giro automatico non ci entra.
