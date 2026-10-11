---
titolo: "0.61.0: menu rifatti — inventario di oggi e dove finisce ogni voce"
quando: 2026-10-11T20:40:00+02:00
tag: ["menu", "navigazione", "impostazioni", "Progetti", "Drive", "pagina", "app", "0.61.0", "decisione di Nicholas"]
---

# Perché

Nicholas (11/10) vuole «pratico, intuitivo, tutte le funzioni in vista ordinate per importanza». Oggi non trova «Progetti»: è un tasto piccolo accanto al vecchio «☁ Drive», che vede ancora e trova incomprensibile. Nelle impostazioni ci sono voci che rimandano a pannelli che hanno già il loro tasto in alto.

# La struttura nuova (uguale su PC, pagina e app)

Una barra principale in alto. Su telefono e pagina è la fascia di navigazione, sempre visibile. In ordine d'importanza:

| # | Voce | Cosa c'è dentro |
|---|---|---|
| 1 | **▦ Progetti** | Pannello Progetti (residente, copie, Rendi residente, unioni, recupero). Più quello che era del Drive: il contenuto del Drive per progetto e per workspace, Porta qui, Sposta progetto, Riordina le chat, Dove vive ogni chat, salvataggio e arrivo (Salva ora, Ripristina, salvataggio automatico, Fondi), stato della sincronizzazione, progetti sul Drive (coda, testimone), Quaderno |
| 2 | **🤖 Autopiloti** | Pannello Autopiloti, con quelli degli altri PC |
| 3 | **? Domande** | La colonna delle domande |
| 4 | **💬 Chat e workspace** | Nuova chat, Riprendi una conversazione, i workspace (cambia, crea, rinomina, elimina), Usate da altri PC, Nuova finestra, Negozio (gli strumenti delle chat) |
| 5 | **⇅ File** | Pannello File |
| 6 | **♥ Salute** | Salute, gli altri computer (chat aperte, guarda dal vivo, cassetta) e i Consumi |
| 7 | **⚙ Impostazioni** | Solo preferenze, con la struttura della 0.56 (Aggiornamenti in cima, ricerca) |

Sul PC le linguette dei workspace, il modello e «+ Nuova chat» restano in una riga sotto la barra. È la riga della zona chat, non un menu: servono a ogni minuto, e metterle dentro un pannello vorrebbe dire due clic invece di uno.

# Inventario di oggi → dove finisce

## PC (`Console.tsx`, barra unica di oggi)

| Oggi | Dove finisce |
|---|---|
| `▣ Riprendi` | Chat e workspace (anche nella riga dei workspace) |
| `+ Nuova chat`, selettore del modello | Riga dei workspace (invariati); anche in Chat e workspace |
| `⧉ Finestra` | Chat e workspace |
| linguette dei workspace, `⋯` | Riga dei workspace; gestione in Chat e workspace |
| `v…` (novità), spia dell'aggiornamento, `⟳` | Restano a destra della barra: sono stato, non menu |
| `⚙ Impostazioni` | Impostazioni (7ª voce) |
| `▤ Quaderno` | Progetti (il quaderno è del progetto) e Autopiloti; tasto tolto dalla barra |
| `▣ Negozio` | Chat e workspace; tasto tolto dalla barra |
| `⇅ File` | File (5ª voce) |
| `☁ Drive` | **Sparisce**: le sue funzioni utili vanno in Progetti (vedi sotto) |
| `▦ Progetti` (piccolo) | Progetti (1ª voce, grande) |
| `⧉ Usate da altri PC` | Chat e workspace (il numero resta sul tasto) |
| `♥ Salute` | Salute (6ª voce) |
| `Domande n` | Domande (3ª voce) |
| `Consumi` (colonna) | Salute → Consumi apre la colonna; scheda Consumi tolta dalle Impostazioni |
| `Autopiloti n ▾` | Autopiloti (2ª voce) |

## Il vecchio pannello «☁ Drive» (`PannelloDrive.tsx`) → Progetti

| Funzione | In Progetti |
|---|---|
| Catalogo per progetto e per workspace, filtri, Apri, Togli la cartella o il workspace dal Drive, Rimetti | Sezione «Il contenuto del Drive» (in basso: azioni rare) |
| Sposta progetto…, Riordina le chat…, Dove vive ogni chat… | Tasti in alto |
| «Chat e progetti del Drive…» | **Sparisce**: è Progetti stesso |
| «Fondi con il Drive…» (doppione di Account) | Sezione «Salvataggio e arrivo», una volta sola |
| Avanzamento del lavoro con Annulla | Sezione «Il contenuto del Drive» |

## Impostazioni → Account (`PannelloAccount.tsx`)

| Oggi | Dove finisce |
|---|---|
| Accesso all'account, Esci | Resta in Impostazioni → Account |
| ☁️ Drive Connetti/Scollega, 🔎 Il Drive collegato, 🔒 Cassaforte (passphrase, sblocca, cambia, chiave di recupero) | Restano in Account: è il collegamento dell'account Google |
| 🔄 Sincronizzazione (Salva ora, Ripristina), «Tutto al sicuro», 🧩 Fondi, salvataggio automatico, registro | Progetti → «Salvataggio e arrivo» |
| 📁 Progetti sul Drive (coda, testimone, togli, metti una cartella) | Progetti → «Progetti sul Drive» |
| Altri computer (chat aperte, guarda dal vivo, azioni) | Salute → «Gli altri computer» |
| «Apri i log» e «Registro attività ▸» (doppione) | Uno solo: Impostazioni → Info → «Apri il registro» |

## Impostazioni → Generali (`impostazioni-struttura.ts`): voci tolte perché rimandano a un tasto in alto

| Voce | Tasto che la sostituisce |
|---|---|
| altri-pc: «Apri la mappa dei PC (Salute)», «Elenco e cassetta (Account)» | ♥ Salute |
| ospite: «Apri «Dove vive ogni chat»» | ▦ Progetti |
| drive: «Apri Account → Drive» | La scheda Account accanto, nella stessa finestra |
| salute: «Salute del sistema» | ♥ Salute |
| scheda Consumi | ♥ Salute → Consumi |

## Pagina servita (`client-pagina.ts`)

| Oggi | Dove finisce |
|---|---|
| fascia ADESSO, DOMANDE, CHAT, LAVORI, PROGETTI, COMPUTER | fascia PROGETTI, AUTOPILOTI, DOMANDE, CHAT, FILE, SALUTE, IMPOSTAZIONI |
| ADESSO (domande, fermi, polso) | Dentro DOMANDE (in testa le domande, sotto «in moto adesso») |
| LAVORI (autopiloti, delega, Quaderno) | AUTOPILOTI |
| COMPUTER → Workspace | CHAT |
| COMPUTER → Code (dei progetti), Drive | PROGETTI |
| COMPUTER → Progetti (doppione) | Sparisce |
| COMPUTER → Altri computer, Salute, Consumi | SALUTE |
| COMPUTER → Negozio | CHAT |
| COMPUTER → File | FILE |
| COMPUTER → Impostazioni | IMPOSTAZIONI |
| Impostazioni → «Apri il Drive» (doppione) | Sparisce (il Drive è in PROGETTI) |

## App Android (`App.kt`, `Computer.kt`)

| Oggi (fascia in basso) | Dove finisce |
|---|---|
| Chat, Domande, Lavori, Negozio, File, Progetti, Computer | Progetti, Autopiloti, Domande, Chat, File, Salute, Impostazioni |
| Lavori | Autopiloti |
| Negozio | Dentro Chat (tasto in alto) |
| Computer = impostazioni | Impostazioni |
| Computer → gruppo Drive (SezioneDrive, Porta qui, Crea qui) | Progetti, sotto il pannello |
| Computer → Code dei progetti | Progetti |
| Computer → Workspace | Chat (già lì con «Workspace»), tolto dalle impostazioni |
| Computer → Altri computer, Salute del sistema, Consumi | Salute |
| la pillola del computer in alto (cambia computer) | Resta: dice di quale PC si parla |

# Difetti trovati facendo l'inventario (corretti nella 0.61.0)

- **Pagina:** la fascia aveva 6 voci in una griglia da 5. «Chiudi» nella scheda Progetti apriva il pannello invece di chiuderlo.
- **PC:** `apri-pannello` con `domande` non disegnava niente. Il fumetto «Consumi» apriva Impostazioni → Generali. Icone ripetute (`▣` per Riprendi e Negozio, `⧉` per Finestra e Usate da altri PC). «Porta qui» del vecchio Drive non aveva più un tasto.
