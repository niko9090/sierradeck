# Rapporto 2: il PC in Glos che non lavora (k-197b, 23/11)

Letto sul PC di riferimento (PC-Fisso), cartella `.sierradeck/errori-arrivati`. Solo lettura dei log, nessun codice cambiato. Il PC in Glos è «fisso_scrivania_glos» (host DESKTOP-G24D499, workspace BG4). Il primo rapporto (k-197a) non aveva potuto leggere i log: questo sì.

## In breve

1. **Nei log che da Glos sono arrivati qui non c'è nessuna unione scaduta, nessuna unione in fila, nessuna ripresa dopo il riavvio, nessun criterio rosso per tempo.** Zero righe «(scaduta)». Quindi le unioni scadute **non sono la causa provata** di Glos.
2. **Da Glos non arriva più niente da 7 giorni** (ultimo file: 16/11 alle 15:42) e nelle ultime 48 ore le voci di quel PC sono zero. Il silenzio non prova che vada bene: i registri veri dell'autopilota di BG4 restano su quel PC, e la cartella `DESKTOP-G24D499` dei rapporti dei lavori qui è vuota.
3. Quello che si misura davvero è un PC **piccolo e sempre pieno** (4 processori, 8 GB, carico 94%, posti pesanti al minimo, dal battito di k-197a) che **cambia versione quasi ogni giorno** e che ogni tanto sparisce dalla rete. La causa più forte è questa, non le unioni. È una deduzione dai numeri, non una prova.

## 1. Cosa ho letto

- `.recupero/DESKTOP-G24D499/`: 29 file, 124 voci, dal 30/10 al 16/11. Altre cartelle `.recupero` (LAPTOP, Aiutanti, Z2) cercate per «G24D499», «glos» e «BG4»: sono voci di altri PC che citano Glos, non sue.
- `lotto-*.md`: 77 file; 19 citano Glos (dal 30/10 al 17/11).
- `controllo-*.md`: 56 file (31/10 - 23/11); in 35 Glos ha la sua riga.
- La cartella `DESKTOP-G24D499/` (rapporti dei lavori della 0.116.0): **vuota**, perché Glos non ha ancora la 0.116.0.
- Non c'è nessun controllo e nessun lotto fra il 20/11 alle 22:37 e il 23/11 alle 10:22: due giorni senza dati (weekend).

## 2. Le righe di Glos, contate

| Cosa cercavo | Righe di Glos | Quando |
|--------------|---------------|--------|
| «(scaduta)» o unione scaduta | **0** | mai |
| «unione in fila» | **0** | mai |
| «unione ripresa dopo il riavvio» | **0** | mai (il registro del servizio non arriva fra gli errori) |
| Criterio rosso per tempo | **0** | mai |
| Criterio rosso (altro motivo) | 1 gruppo (2 voci) | 16/11 11:19-12:07, «fionda apl», k-34 unito con un file `docs/` che non c'era: un criterio sbagliato, non un tempo |
| «scaduto dopo 5 minuti» | 7 voci | 30/10 e 06/11: il supervisore non ha risposto al dialogo (0.88.x) |
| Autopilota fermo: «il servizio autopilota non risponde sulla porta 4763x» | **31 voci in 12 file** | solo dal 30/10 al 10/11 (versioni 0.88-0.98); **0 dopo il 10/11** |
| Autopilota riavviato | 0 righe | - |
| «Comando bloccato: il lavoro ha già finito e la sua unione è in corso o in fila» (autopilota `ap-5593c5f0…` di Glos) | **5 voci** | 15/11 (k-19, due volte), 16/11 (k-44), 17/11 (k-49), 20/11 (k-104) |
| Errori ripetuti più alti | 13 `autopilota:elenca`, 7 `dialoga`, 6 `dettaglio`, 4 `domande` | tutti 30/10-10/11, versioni vecchie |
| Altri errori | aggiornamento non riuscito (0.88.6, 0.98.0, 504 / net::ERR_NAME_NOT_RESOLVED), terminale `pty-host`, Aiuto fra PC (`OAuth session expired` su Z2, Laptop non raggiungibile) | 30/10-16/11 |

Nota: i 3 «OutOfMemoryError» dello stesso elenco sono dell'app Android 2.88.0 (31/10 e 06/11), non del PC.

Altri autopilota hanno la stessa riga «comando bloccato per unione in corso o in fila»: `ap-86817535…` 12/11, `ap-fb5bdfa7…` 18/11 e 23/11, `ap-c6bf00f6…` 20/11 (due volte). Cioè **è un sintomo di tutta la rete, 10 voci in 11 giorni, di cui metà a Glos**: là l'unione tiene occupato il workspace e i comandi aspettano.

## 3. Le ultime 48 ore, in ordine di tempo

| Quando (UTC) | Cosa dice il registro su Glos |
|--------------|-------------------------------|
| 20/11 22:37 | versione 0.112.0; «giro della posta fallito: Drive ricerca 403 (limite di richieste)» 5 ore prima |
| 21/11, 22/11 | **nessun dato** (nessun controllo, nessun lotto) |
| 23/11 10:22 | versione **0.114.1**, «attenzione» solo perché PC-Fisso è indietro (0.112.1); nessun errore suo |
| 23/11 12:22 | versione **0.114.2**, «attenzione» solo per la versione del Portatile Asus; nessun errore suo |
| 23/11 18:15 | versione **0.115.1** (battito, da k-197a); 94% di carico, posti pesanti al minimo |

Dunque nelle 48 ore **zero voci d'errore, zero unioni scadute, zero autopilota fermo** nelle fonti che ho. Ma anche **due cambi di versione in 8 ore** (0.114.1 → 0.114.2 → 0.115.1).

## 4. La causa, con i numeri

Quello che i numeri dicono, in ordine di peso:

1. **Il PC è troppo piccolo per quello che gli si chiede.** 4 processori e 8 GB contro 24 GB di PC-Fisso. La guardia del PC (`guardia-pc.ts`) dichiara «carico» dopo 20 secondi sopra il 75% e libera solo dopo un minuto intero sotto il 60% (dopo 10 minuti basta il 75%). A 94% è quasi sempre «carico»: ogni passo pesante aspetta fino a 2 minuti (90 secondi dentro un hook) e poi parte lo stesso, già lento. Sul PC di sviluppo, a 60-75%, la stessa guardia ha fatto aspettare i comandi 233 volte (media 4 min, max 31 min, rapporto k-191d). A Glos, a 94%, deve fare di più. **Questa è la causa che pesa di più**, e non è fra le correzioni della 0.116.0.
2. **Cambia versione quasi ogni giorno.** Dal 16/11 le versioni viste sono 0.107.4, 0.109.1, 0.109.2, 0.111.1, 0.111.3, 0.112.0, 0.114.1, 0.114.2, 0.115.1: **8 cambi in 7 giorni**. Ogni cambio riavvia il servizio dopo la quiete delle chat, e ogni riavvio rimette in riprova le unioni in corso (sul PC di sviluppo: 16 «unione ripresa dopo il riavvio» il 20/11 e 7 il 16/11). Un PC lento perde più tempo a ogni giro.
3. **Raggiungibilità a buchi.** Su 35 controlli con la riga di Glos: 6 «ok», 22 «attenzione», 7 «guasto» o «non risponde». Il 18/11 19:14 acceso secondo il Drive ma non raggiungibile su nessun indirizzo; il 20/11 alle 03:44 spento da 4 ore; il 20/11 alle 09:44 due messaggi di PC-Fisso all'autopilota di Glos non consegnati. Il messaggio arriva poi dalla posta sul Drive, ma intanto il lavoro aspetta.
4. **Unioni lente per fila** (k-191d, misurate sul PC di sviluppo): attesa mediana 18 minuti, p90 58 minuti, prova media 226 secondi. A Glos, con un quarto dei processori, la stessa prova dura di più. Ma qui **non c'è una misura di Glos**: le 5 voci «comando bloccato» ne sono l'unico segno.
5. **Da escludere come causa:** autopilota che non risponde (finito il 10/11), memoria (libera il 34%, sopra la soglia del 15%), criteri rossi per tempo (zero), unioni scadute (zero nei log arrivati).

## 5. Cosa risolve la 0.116.0

La 0.116.0 è nel ramo principale (commit 558e3a2c, tag `v0.116.0`, oggi alle 18:00 UTC). Glos ha la 0.115.1, quindi **per ora non la usa**.

Risolve, nel suo percorso di unione:
- le **unioni che scadono** passano dopo gli altri e hanno più tempo a ogni tentativo, dopo 3 scadenze un avviso (`unioni-che-scadono`); il pannello le mostra;
- un rilascio che cambia **solo la versione** non rilancia tutte le prove, l'**app Android** non si ricostruisce per i soli testi delle note, i **controlli dei rilasci già usciti** non si ripetono: sul PC di sviluppo erano il 15-30% del tempo di prova;
- i **lavori sullo stesso file** entrano insieme nel lotto, e la raffica di rami pronti si raccoglie qualche secondo (`unioni-veloci`): fila più corta;
- i **rapporti dei lavori** di ogni SierraDeck e Aiutante vanno al PC di riferimento: da Glos arriverà finalmente il suo registro unioni/criteri. È la prima cosa che serve a questa misura.

Non risolve: il PC al 94%, i riavvii per aggiornamento, la rete a buchi.

## 6. Cosa risolvono le correzioni già affidate

1. **Turno pesante per le misure della prova** (collo 3 di k-191d, `provaNelPrincipale`): due unioni di workspace diversi non misurano più insieme. Con 4 processori e più workspace (Glos ne elenca 13) è la correzione più utile: spariscono i rossi «per tempo» e le riprove. Non accorcia una prova da sola.
2. **Rotta per leggere il registro di un workspace da un altro PC** (terza correzione di k-197a): risolve la mancanza di questo rapporto. Con i rapporti dei lavori della 0.116.0 copre già i lavori nuovi, ma non il registro già scritto né il piano di BG4.

La terza correzione di k-197a è l'**installare la 0.116.0 a Glos** (lo fa Nicholas o l'aggiornamento automatico): senza, nessuna delle due serve a Glos.

## 7. Cosa manca ancora

1. **Una guardia che tenga conto del PC.** Oggi le soglie sono le stesse per un PC da 4 processori e per uno da 24 GB. Per Glos serve una regola che guardi i processori del PC (soglie e posti in proporzione), così le prove delle unioni partono **una per volta, senza attese a vuoto**. Da misurare: quanti secondi ha aspettato un comando pesante a Glos (nel suo registro `guardia-pc`).
2. **Aggiornamenti meno frequenti su quel PC**, oppure fatti solo a PC fermo: 8 cambi in 7 giorni sono troppi per un PC così carico (decide Nicholas).
3. **La misura vera di BG4**: dal registro di Glos servono le righe `[unione di prova]`, `unione in fila`, `(scaduta)`, `unione ripresa dopo il riavvio` e i tempi `guardia-pc`. Si ottengono o dalla rotta del punto 6.2, o dai rapporti della 0.116.0 appena Glos l'avrà installata. Rifare allora la tabella del paragrafo 2 (obiettivo: nessuna riga «(scaduta)», prova media sotto 100 secondi, attesa mediana in fila sotto 8 minuti).
4. **Il punto cieco dei registri**: Glos ha smesso di inviare errori il 16/11 mentre cambiava versione sei volte. Va verificato che l'invio automatico non sia rotto (a Portatile Asus oggi risulta «invio automatico non riuscito»): se lo è, parte della mancanza di dati è un guasto in più.
5. **Il 403 «limite di richieste» di Drive** a Glos (20/11) fa saltare il giro della posta: se si ripete, Glos non riceve gli ordini. Da guardare nel registro.

## 8. Sintesi per l'autopilota

- Causa: un PC piccolo e sempre al limite che si riavvia spesso e a volte non si vede in rete. Le unioni scadute non risultano nei log arrivati (0); il sintomo che c'è è «comando bloccato per unione in corso o in fila» (5 voci a Glos in 6 giorni).
- La 0.116.0 aiuta le unioni, non il carico del PC. Le due correzioni affidate aiutano il carico fra workspace e la visibilità, non il PC in sé.
- Serve una decisione: aggiornamenti e carico su Glos (7.1 e 7.2), e la misura dai rapporti della 0.116.0.
