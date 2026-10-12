---
titolo: "0.64.2: i workspace rispecchiano il PC di casa"
quando: 2026-10-12T14:05:00+02:00
tag: ["workspace", "riquadro remoto", "altri PC", "chiusura", "0.64.2", "difetto di Nicholas"]
---

# Il difetto

Nicholas, 12/10: «continuo a vedere due chat nel workspace MT5 quando nel portatile ne ho chiusa una e ne rimane aperta solo una».

La 0.60.9 toglieva un riquadro remoto **solo** se il PC di casa aveva registrato la chiusura (`chiuse` in `/api/stato`). Una chat chiusa prima della 0.60.9, o in un modo che non scrive «chiusa», restava qui per sempre con «Riapri là». Il collaudo con le chat di prova aveva provato il caso nuovo, non quello vero di Nicholas.

# La regola (una sola: `giudicaRiquadroRemoto` in `src/shared/chiuse.ts`)

Conta quello che il PC di casa ha aperto **adesso**. Una chat è «aperta là» se c'è fra le chat vive (riquadro o sottofondo, `chat`) **o** fra quelle salvate in un qualsiasi suo workspace (`workspace.chat` di `/api/stato`, cioè tutti i workspace, non solo quello a schermo). Se non c'è, il riquadro qui si toglie con la riga `[apertura] … non aperta sul PC di casa (…): tolgo il riquadro`.

Il riquadro resta:
- per 3 minuti dopo che è stato aperto (`remoto.dal`) o dopo che da qui si è scritto, riaperto o avviato là;
- finché un testo o un avvio in sottofondo partito da qui aspetta;
- se il PC di casa non risponde, cioè «non raggiungibile» (non si arriva nemmeno al giudizio);
- se il PC di casa non manda `workspace.chat`, cioè è vecchio: non si sa, quindi non si toglie.

# Due posti dove si applica

- **Riquadro a schermo** (`RiquadroRemoto.tsx`): a ogni giro, finché la chat non è viva.
- **Workspace che nessuna finestra mostra** (`src/main/rispecchia-workspace.ts`): il Core li controlla 45 s dopo l'avvio e poi ogni 2 minuti. Chiede solo `/api/stato` al PC di casa e toglie dall'archivio i riquadri remoti giudicati. Prima rilegge l'archivio e toglie solo dai workspace ancora nascosti. Senza questo, la pulizia avveniva solo quando Nicholas apriva quel workspace.
- I riquadri «remoti» che puntano a questo stesso PC si saltano (0.64.3): prima davano una falsa riga «non raggiungibile».

# Provato sul caso vero (12/10, sola lettura sul portatile)

Su questo PC il workspace MT5 era nascosto e conteneva «Spostamento progetto su PC fisso» e «Controllo resa». Il workspace MT5 del portatile aveva solo «Controllo resa». Dopo l'installazione della 0.64.2:

`12:00:10Z [apertura] «Spostamento progetto su PC fisso» (…) dal workspace «MT5», che nessuna finestra mostra: non aperta sul PC di casa (…): tolgo il riquadro`

MT5 qui contiene ora solo «Controllo resa». Verso il portatile non è partita nessuna azione: nel registro, dopo l'avvio, non c'è nessuna riga `[ponte]`.

# Non fatto

Il punto 3 della richiesta: le chat aperte là nel workspace corrispondente dovrebbero comparire anche qui. Aggiungere riquadri da solo cambia il layout che Nicholas ha davanti, quindi va deciso con lui come farlo senza rubare lo schermo.
