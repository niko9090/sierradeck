---
titolo: "«Togli il workspace dal Drive»: la lapide, e i file che restano di ogni PC (0.27.0)"
quando: 2026-09-14T05:20:00+02:00
tag: ["drive", "workspace", "lapide", "ripristino", "impostazioni", "0.27.0"]
---

# Il problema (rapporto 1, punti 1 e 2)

Sul Drive c'è **un solo** `sierradeck/workspaces.json` per tutti i PC, e dalla
0.26.0 ci sale l'**unione**. Due conseguenze che nessuno voleva:

1. un workspace cancellato su un PC restava nell'unione e ricompariva con
   «Fondi» o «Porta qui»: il Drive è la memoria lunga e nessuno la puliva;
2. «Ripristina dal Drive» scaricava anche `impostazioni.json` e
   `istantanee.json`, che sono **di ogni PC**: tema, cartella dei progetti e
   preferenze diventavano quelli dell'altro PC.

# La lapide

`Archivio.tolti?: Record<nome, { quando, pcId }>` in `src/shared/workspace.ts`,
letto e riscritto da `parseArchivio`. Vive **solo nella copia sul Drive**.

- `fondiArchivi(pc, drive, modo, escludi, { perDrive })` (`fusione.ts`): con
  `perDrive` (cioè in `unioneWorkspace`, quello che sale) i nomi con la lapide
  restano fuori **anche se questo PC li ha ancora**, e le lapidi si
  conservano; senza (Fondi, Porta qui) le lapidi non entrano nel file del PC
  e un workspace che il PC ha resta suo. **Una lapide toglie dal Drive, mai
  da un PC.**
- `sincronia.togliWorkspaceDalDrive(nome)` / `rimettiWorkspaceSulDrive(nome)`
  → `segnaWorkspaceSulDrive`: prende il lavoro esclusivo («Salvo sul Drive»),
  rilegge `workspaces.json` dal Drive, toglie/rimette, ricarica il blob e
  aggiorna il manifesto (Drive e locale) con la firma del file di qui, come
  fa l'unione, così il giro dopo non lo rivede come cambiato.
- Catalogo: `workspaceTolti[]` (nome, quando, quiEsiste). Scheda Drive, vista
  «Per workspace»: tasto «Togli dal Drive» con conferma per esteso, elenco
  «Tolti dal Drive» con «Rimetti sul Drive». Telefono: come «Togli la
  cartella», solo dal PC.
- Test: `tests/main/cassaforte-workspace-unione.test.ts` («la lapide»).

# I file di ogni PC

In `ripristina()`: `impostazioni.json` e `istantanee.json` si scaricano solo
se **qui mancano** (un PC nuovo li riceve, un PC che li ha li tiene), e prima
del ripristino si fa una copia `*.prima-del-ripristino-drive.json` dei tre
file dell'assetto (workspaces, impostazioni, istantanee), fuori dall'allowlist
della raccolta. Al salvataggio restano last-writer-wins sul Drive, che è
innocuo.

# Trappole

- `parseArchivio` ricostruisce l'oggetto: un campo nuovo va aggiunto al tipo,
  letto **e** riemesso, o sparisce alla prima lettura (era così anche per
  `finestre`).
- Chi confronta `fondiArchivi(pc, undefined, 'unione')` per identità: senza
  lapidi deve tornare **lo stesso oggetto** (test in `cassaforte-fusione`).
