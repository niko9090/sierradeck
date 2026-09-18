---
titolo: "La sezione dell'autopilota (0.29.0): la chat con lui in alto, il resto in linguette — e chi è «lui»"
quando: 2026-09-18T10:30:00+02:00
tag: ["autopilota", "ui", "chat", "supervisore", "0.29.0"]
---

# Cosa ha chiesto Nicholas (18/09)

«Lui ha già una chat di riferimento e ne dovrebbe aprire in autonomia una per
agente e lui fare da supervisore. Io posso dialogare con lui e lui con me
attraverso la chat, così rimangono ben visibili domande e risposte. Vorrei
una ristrutturazione grafica della sezione dell'autopilota, perché è davvero
caotica: in alto la parte di chat e nelle varie tab le altre info, così vedo
tutto senza scorrere come un matto.»

# Chi è «lui» (com'è fatto davvero l'autopilota)

- L'**autopilota** è il supervisore: una sessione `claude -p` senza terminale,
  ripresa con `--resume` a ogni fermata (`sessioneSupervisore`, una per chat
  governata dal 0.13.0). Non è una chat nel mosaico: vive nel servizio
  (porta 47630) e sopravvive alla chiusura del programma.
- Le **chat che eseguono** (`chats: ChatGovernata[]`, fino a `tettoChat`) sono
  riquadri veri nel mosaico, con gli hook `suStop`: a ogni fermata il
  supervisore le giudica e dice come proseguire. «Una chat per agente» è
  `tettoChat > 1`: ogni chat porta avanti un compito della coda.
- La «chat di riferimento» scelta alla creazione («Su quale chat») serve a
  prendere la **cartella**: l'autopilota non lavora dentro quella chat, ne
  apre una sua (dal 0.27.0 mai più l'adozione di una chat altrui).
- **Parlare con lui** = `POST /autopiloti/:id/dialogo`: il supervisore risponde
  con parole sue in qualche minuto e, se era un'istruzione, la applica e la
  porta alla chat che esegue a fine turno (`autopilota-dialogo.md`).

Quindi il modello di Nicholas c'è già, salvo un punto: il supervisore non ha
una chat visibile sua. La sua conversazione vera (i prompt di giudizio, le
risposte JSON) non si legge come una chat. La risposta della 0.29.0 è
**comporre** la chat con lui dall'archivio, non mostrare la sua trascrizione.

# Com'è fatta la sezione adesso

`DiarioAutopilota.tsx` (la colonna accanto al riquadro, `Mosaic.tsx`):

1. **Testa**: LED, nome, percentuale del passo (piccola, in riga), ⇤ largo, ›
   chiudi. Sotto, i passi e la barra (come prima, senza la riga della misura).
2. **`ChatAutopilota.tsx`** (metà di sopra, `flex 1 1 55%`, scorre da sola,
   sempre in fondo): il flusso è `conversazione(a)` in `chat-autopilota.ts`,
   pura e provata:
   - la tua richiesta (`obiettivoTuo`), poi l'intervista domanda/risposta
     (`intervista`, senza orario: subito dopo la richiesta, in ordine);
   - le decisioni del servizio come **note** (`vociDecisioni(a)` estratta da
     `diario-autopilota.ts`: `diario()` ora la usa e aggiunge il dialogo);
     le riprese uguali di fila si comprimono (`comprimiNote`, solo le note:
     due «sì» tuoi restano due);
   - una `risposta tardiva`/`risposta dell utente` nelle decisioni è una
     battuta **tua** (la tua risposta a una sua domanda);
   - il `dialogo` (tu/lui, con l'esito sotto salvo «nessun cambio»);
   - in coda, per stato: la **domanda aperta** (`motivoSospensione` in
     `attesa`, o in `intervista` con motivo) come bolla ambra; `pronto` →
     bolla ambra con il tasto **Vai**; `finito`/`sospeso` → nota verde/rossa.
   - Sotto il flusso la casella: con una domanda aperta il tasto è
     **Rispondi** (`domande()` + `rispondi(id)`, arriva subito alla chat
     ferma); altrimenti **Manda** (`dialoga`, risponde il supervisore).
     «Disfa» se c'è una modifica; il «?» ha la spiegazione lunga nel titolo.
3. **Linguette** (metà di sotto, `diario__lato` + `diario__pannello`):
   `Sta facendo` (anteprima della chat che esegue, letta ogni 2 s **solo se la
   linguetta è aperta**; con la flotta i bottoni «chat 1, 2…» scelgono
   quale), `Obiettivo` (`ObiettivoAutopilota`: tue parole / sue, percentuale,
   interventi, le sue chat con stato e compito), `Criteri`
   (`CriteriAutopilota`, si riscrivono), `Compiti` (`CompitiAutopilota`),
   `Ha deciso` (ragionamenti + diario). Il conto accanto alla linguetta dice
   se dentro c'è qualcosa (criteri 2/5, compiti 3, chat al lavoro).
4. **Largo** (⇤): chat e linguette **fianco a fianco** (`.diario--largo
   .diario__due { flex-direction: row }`).

Spariti: il riquadro ambra `diario__domanda` (ora è una bolla nella chat), la
scheda impilata `SchedaAutopilota` (ora esporta i tre contenuti delle
linguette), il testo lungo «Qui scrivi all'autopilota…» (nel «?»).

# Cosa NON è cambiato

- Il servizio, le rotte, l'archivio: nessun campo nuovo. Solo renderer.
- La pagina del telefono e l'app Android hanno ancora la vista di prima
  (`vistaAutopilota` in `client-pagina.ts`, `Lavori.kt`): da rifare con la
  stessa forma se Nicholas approva questa.
- `DomandaModale` (la finestra che compare per una domanda) resta.

# Trappole

- `vociDecisioni` deve restare **senza** il dialogo: `diario()` lo aggiunge,
  e la chat lo mette da sé; se lo mettesse anche lì, si leggerebbe doppio.
- La chat scorre in fondo quando cambia il **numero** di righe, non a ogni
  rilettura (l'autopilota si rilegge ogni 5 s): altrimenti chi rilegge
  l'inizio viene riportato giù di continuo.
- Le voci dell'intervista non hanno un orario: prendono `iniziatoIl` e
  l'ordine di inserimento (il sort è stabile su un indice). Una decisione
  con orario uguale a `iniziatoIl` finirebbe dopo di loro: va bene così.
