---
titolo: "Cosa si salva sul Drive e perché (inventario 12/10, regole 0.69.0)"
quando: 2026-10-12T23:30:00+02:00
tag: ["drive", "spazio", "0.69.0"]
---

Nicholas, 12/10: «perché occupiamo così tanto sul Drive? ottimizziamo, capiamo cosa mettere e cosa no».

## Inventario (misura del pannello, 12/10 sera)

Drive di Google: 14,9 GB usati su 15 GB (14,0 nel Drive, 0 nel cestino). Di questi, **SierraDeck occupa 6,40 GB in 13.191 file**:

| Cartella | File | Spazio | Perché c'è |
|---|---|---|---|
| chat | 4.091 | 4,56 GB | Le trascrizioni (`.jsonl`) di Claude Code, salvate **una copia per PC**. È la voce più grande. |
| orfani | 990 | 0,86 GB | Pezzi che l'indice non usa più: salvataggi interrotti e vecchie copie dell'indice. Nessuno li legge. |
| progetti | 8.084 | 0,54 GB | I file dei progetti (quello che git terrebbe, più `.git`). |
| sistema | 8 | 0,44 GB | L'indice cifrato, le chiavi, i workspace e le copie di sicurezza dell'indice. |
| recupero | 3 | 0,01 GB | Il cestino di SierraDeck (30 giorni). |
| battiti | 15 | ~0 | La presenza dei PC. |

**I file più grandi sono tutti chat**: una stessa conversazione da 55–78 MB ripetuta 2–3 volte sotto cartelle diverse, una per PC o per cartella di lavoro (es. la stessa chat SierraDeck da 77 MB c'è tre volte). Dalla 0.69 il pannello «Spazio» dà l'elenco dei 30 più grandi con il perché di ognuno (`misura().piuGrandi`, `percheSulDrive`).

## Regole (0.69.0)

- **Chat compresse** (gzip, prima di cifrare; segno `SDZ1\0` in testa, `cassaforte/compressione.ts`). Sulle 15 chat locali più grandi il rapporto misurato è **2,3 volte** (663 MB → 289 MB), quindi sul Drive si stima –2,5 GB a regime. Chi legge riconosce le due forme, così i file vecchi restano validi. **Si accende solo se ogni PC visto nei battiti è alla 0.69.0 o più** (`compressioneAccesa`): un PC vecchio scriverebbe la chat compressa così com'è, rovinandola. Finché un PC resta indietro, la compressione resta spenta.
- **Cosa non sale con un progetto** (`progetti/file.ts`): `node_modules`, `build`, `dist`, `out`, `.gradle`, cache varie, `coverage`, `.sierradeck/recuperati`. Ogni file oltre **50 MB** resta a casa e finisce nell'avviso «troppo grandi». Oltre **20 MB** il file sale, ma il pannello lo segnala come «⚠ file grande» sulla riga del progetto, sul PC, nella pagina e nell'app.
- **Niente doppioni per contenuto**: un file con la stessa impronta non si riscarica e non si ricarica (0.24.1).
- **Il recupero scaduto si svuota da solo** una volta al giorno (`pulizieDaSole`, chi = «automatico»). Comunque passa 30 giorni nel recupero: resta annullabile.
- **Spazio per progetto** nel pannello Progetti («sul Drive 340 MB»).

## Da far decidere a Nicholas (NON si cancella da soli)

- **Copie doppie**: 2,13 GB in 2.013 file (1.534 chat salvate due volte). Resta la copia più lunga, l'altra va nel recupero. Si toglie solo con il suo «sì» dal pannello Spazio.
- Il recupero scaduto (0,86 GB) si pulirà da solo con la 0.69.0. Se vuole, può farlo prima dal pannello.

Trappola: i percorsi delle chat sul Drive contengono le cartelle utente dei PC. Non copiarli mai nel codice, nei test o in una scheda.
