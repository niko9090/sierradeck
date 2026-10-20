---
titolo: "Misurare il Drive senza account: il Drive finto e le chat vere in sola lettura"
quando: 2026-10-20T13:35:00+02:00
tag: ["misure", "drive", "copia di prova", "trappola"]
---

# Misurare il Drive senza account

Per contare le chiamate a Google e misurare il primo giro di un PC nuovo **non serve un account di prova**.

**Comando** (PowerShell, dalla radice del progetto):

```
$env:MISURA_CHAT = "$env:USERPROFILE\.claude\projects"   # si legge soltanto
$env:MISURA_LATENZA_MS = "0"                              # o 120 per simulare la rete
npx vitest run --config scripts/misure/vitest.misure.config.ts
```

**Come funziona** (`scripts/misure/drive-finto.misura.ts`):
- È **l'adattatore vero del programma**, `creaArchivioDrive`, che parla con un Drive in memoria. Quel Drive risponde come l'API v3 (`appDataFolder`: ricerca, elenco, scaricamento, creazione, scrittura, cancellazione) e conta le richieste per tipo.
- Gira dentro il setup dei test, con le cartelle finte. Una scrittura nella casa vera fa fallire la misura, quindi le chat vere si possono leggere senza rischi.
- Quattro giri:
  1. primo salvataggio;
  2. salvataggio senza cambi;
  3. primo giro di un PC nuovo, con tutto da scaricare in cartelle vuote;
  4. ripristino senza niente di nuovo.
- Gli esiti si accodano in `note/misure-drive/esiti.jsonl`, una riga per lancio.

**Cosa non misura:**
- la rete vera: con latenza 0 i tempi sono solo il lavoro del PC (cifrare, comprimere, scrivere);
- il ponte fra due PC: serve un secondo PC accoppiato.

**Trappola delle misure della copia** (`misura-080.mjs`, in appendice ad `analisi-0-80-0.md`): lanciato in un `for` con `| grep` e `timeout`, il secondo giro è rimasto appeso 30 minuti. Va lanciato un giro alla volta con l'uscita su file. Prima del giro dopo, controllare che non restino processi `electron.exe` della copia.

**Numeri del 20/10** (in `analisi-0-80-0.md`):
- il primo giro di un PC nuovo è passato da 1.886 a 982 richieste;
- il ripristino senza novità da 28 s a 0,6 s.
