---
titolo: "Rapporto 0.78.0 per Nicholas: Panoramica 2 e le chat già avviate adottate"
quando: 2026-10-16T18:35:00+02:00
tag: ["rapporto", "0.78.0", "per Nicholas", "panoramica", "adozione", "migrazione"]
---

La 0.78.0 (app 2.78.0) è pubblicata con installer, latest.yml, APK firmato e app-android.json. **Non l'ho installata: la installi tu.** Le foto sono in `note/foto-0-78-0/`.

## Prima: com'era davvero sui tuoi dati (sola lettura, 16/10)
- Su questo PC è installata la **0.75.3**: la Panoramica della 0.77.0 non l'hai ancora vista. Il DESKTOP è sulla 0.77.0, il portatile sulla 0.69.0 (spento dal 13/10).
- Questo PC: 19 workspace, 18 a elenco (visitafacile no: ha solo una chat remota), 44 chat, di cui 27 in Predefinito.
- Autopiloti veri: SierraDeck e NexoraOS, ognuno con un dormiente doppio. Tutte le altre chat erano chat normali che il loro autopilota non conosceva: avevi ragione.

## Cosa cambia
- **Panoramica 2**, in ogni workspace a elenco (foto `h`, `i`, `j`, `k`, `l`, `m`):
  - **in alto:** l'obiettivo su 2 righe («Mostra tutto» solo se è tagliato), lo stato in una parola e la barra dei criteri. Toccandola si vede ogni criterio con ✓, ✗ o ○, quando è stato controllato e la prova;
  - **stato coerente con i criteri:** «finito» solo con tutti i criteri soddisfatti, altrimenti «◐ da verificare». NexoraOS dal vero: «da verificare · dice finito · criteri 7/8»;
  - **Adesso:** solo le chat al lavoro o che aspettano te, con 6 righe vere dello schermo, pulite da cornici, barre, testata, «… +18 lines» e riepiloghi del turno. Se nessuna lavora: «Nessuna chat al lavoro»;
  - **Piano:** i compiti dell'autopilota in 4 colonne (Da fare, In corso, In revisione, Fatto), con lo specialista e i giri di revisione «↺». Il clic apre la chat del compito;
  - **Chat:** le altre chat del workspace, con «solo mia»;
  - **Finite: N ▸:** una riga sola, che si apre in una lista compatta;
  - **a sinistra:** solo la conversazione fra te e l'autopilota; il resto in «Cosa è successo ▸», chiuso;
  - **domande a destra** solo se ce ne sono.
- **Le chat già avviate adottate:**
  - l'autopilota del workspace le conosce, con un ruolo dal contenuto o «Chat»;
  - scrive loro solo quando glielo chiedi, e solo quando sono ferme;
  - mai kill, riavvio, ripresa o spostamento;
  - «solo mia» lo esclude;
  - nei workspace con il solo dormiente l'adozione avviene quando gli scrivi il primo messaggio. Le 27 chat di Predefinito, quindi, quando scrivi al suo autopilota.
- **Autopiloti esistenti:** SierraDeck e NexoraOS diventano l'autopilota del loro workspace. I due dormienti doppi sono archiviati e recuperabili.
- **Molte chat:**
  - al più 9 linguette, le altre in «Altre» (con «◆ 17 ·» se ci sono chat che aspettano te);
  - le chat che cominciano allo stesso modo sono numerate «#1», «#2»: in Predefinito le «Sei l'ANALISTA…» erano schede identiche.
- **Telefono, pagina e app:** Situazione, Adesso, Piano a liste, Chat, Finite e conversazione con «Cosa è successo» (foto `tel-*`).

## Sicurezza (come nella 0.74.1)
- Copia degli autopiloti e dello stato prima di cambiare.
- Idempotente.
- «Torna come prima» toglie anche le adozioni.
- Solo i workspace del PC stesso.
- Se qualcosa fallisce, tutto resta com'era e il PC parte.
- Righe `[migrazione]` e `[adozione]` nel registro.

## Prove
- **Copia staccata dei 3 PC** (questo dai suoi file, gli altri due dal battito):

  | PC | chat prima | chat dopo | autopiloti veri | dormienti doppi archiviati | workspaces.json |
  |---|---|---|---|---|---|
  | questo PC (0.75.3) | 44 | 44 | 2 (SierraDeck, NexoraOS) | 2 | identico byte per byte |
  | DESKTOP (0.77.0) | 2 | 2 | 0 | 0 | identico |
  | portatile (0.69.0) | 1 | 1 | 0 | 0 | identico |

  Ripetuta: «già fatta». «Torna come prima» e poi «Rifai» funzionano.
- **Copia aperta davvero** (dati di questo PC, autopiloti veri resi innocui, più un progetto di prova):
  - **PID:** 28 chat vive in Predefinito, PID uguali dopo «Torna come prima», dopo «Rifai» e dopo il ricaricamento della finestra.
  - **Autopilota con specialisti al lavoro:** 3 compiti, poi altri 2 dati a voce, con le revisioni.
  - **Adozione dal vero:** appena nato ha adottato le 2 chat che c'erano. Gli ho scritto «chiedi alla chat «ciao…» di spiegare node --test»: il messaggio è stato scritto 3 secondi dopo, a chat ferma; all'altra chat niente.
- **Clic veri:**
  - nel workspace di prova 14 su 14 aprono la chat giusta, con 14 ritorni, 0 inversioni d'ordine e 0 doppioni;
  - in Predefinito 12 clic e 0 inversioni. Qualche clic col mouse cadeva sulla scheda vicina, perché nella copia le 26 chat passano di continuo fra «aspetta te» e «ferma» (la domanda di fiducia sulla cartella, che esiste solo nella copia) e la sezione «Adesso» si muove. Il clic diretto apre sempre la chat giusta (3 su 3).
- **Difetti trovati provando e corretti** (ognuno con il suo test):
  1. un giro dell'autopilota salvava la fotografia di inizio turno e **cancellava le adottate e i messaggi per loro**;
  2. il supervisore credeva in coda un messaggio perso: ora il prompt dice cosa c'è davvero in coda;
  3. 26 linguette di un carattere;
  4. «UxC» (il prezzo dell'uranio) letto come «ux», cioè Interfaccia: ora parole intere, e nel dubbio «Chat»;
  5. «Torna come prima» lasciava adottate le chat prese dopo la migrazione;
  6. la misura diceva «100% · 3 di 3» con 1 criterio su 3: la stessa contraddizione criticata da te;
  7. sulla pagina i «▸» non si aprivano;
  8. l'elenco dei criteri restava aperto cambiando workspace;
  9. «da assegnare» su compiti già in corso.
- **Test:** 4035 del programma e 345 dell'app verdi; TypeScript senza errori; l'app compila.

## Limiti che restano
- Dal telefono la Panoramica vede le chat dei workspace aperti sul PC; quelle di un workspace non aperto non compaiono (c'era già nella 0.77.0).
- L'app Android l'ho provata con i test e la build, non su un telefono.
- Nella prova l'autopilota ha chiuso con «unione finale del ramo … non riuscita»: è una cosa del servizio, che non ho toccato. È probabile che dipenda dai riavvii della copia fatti per la prova.
- Un file vuoto `x.test.ts` è rimasto nella cartella temporanea di Git Bash: la guardia ne ha bloccato la cancellazione perché fuori dalle cartelle del progetto, ed è giusto così.

## Ancora in attesa di te
Come prima:
- «Chat delle prove» in Spazio sul Drive;
- le 4 cartelle di storie di prova da rimettere nel recupero;
- il portatile da pulire quando lo accendi.
