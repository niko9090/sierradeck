---
titolo: "Risposte dal riquadro delle domande verificate sul PC della chat (0.84.1)"
quando: 2026-10-22T10:00:00+02:00
tag: ["domande", "scelte", "risposte", "registro", "altri-pc", "0.84.1"]
---

# La richiesta (Nicholas, 21/10)

Una risposta data dal riquadro delle domande conta solo se il PC della chat l'ha premuta davvero e la chat è andata avanti. Se non ci riesce, riprova una volta da solo. Nicholas vede l'esito, e ogni pressione finisce nel registro.

# Com'era

`/api/scegli` (e `/api/scrivi` quando la chat è ferma su una scelta) mandava i tasti con `mandaTasti` e rispondeva subito `{ fatto: true }`. Se un tasto si perdeva, la domanda restava lì ma nessuno lo sapeva: per 8 s la nascondeva anche `giaRisposta`.

# Come funziona adesso

- **`src/main/risposta-verificata.ts`**, `premiEVerifica`:
  - preme i tasti, poi rilegge lo schermo di adesso ogni 200 ms per (durata dei pezzi + 3,5 s);
  - **presa** = una lettura in cui la domanda non c'è più o è diversa (`firmaScelte`, che conta anche le spunte);
  - basta **una** lettura senza la domanda: un permesso identico che ricompare dopo il comando non fa premere di nuovo;
  - altrimenti **un solo nuovo tentativo**, con i tasti ricalcolati sullo schermo di adesso (le frecce possono essere già arrivate, l'Invio no);
  - dopo due pressioni: **non presa**.
- **Le rotte** (`client-rotte.ts`, `premiRisposta`):
  - presa → 200 con `esito`, `tentativi`, `frase`;
  - non presa → 409 con la frase, e `risposte.delete`, così la domanda si rimostra subito e si può ritoccare;
  - un secondo tocco durante la verifica → 409 «già mandata».
- **Registro:** righe `[risposta] «Blu» nella chat «Prova» (p-1), chiesto da tel:…: tentativo 1 di 2 …` / `presa al tentativo N` / `NON presa dopo 2 tentativi`. Sul PC che inoltra a un altro PC c'è una riga in più: `alla chat su <pcId>: presa là…`.
- **Altri PC:** la verifica la fa sempre il PC della chat. `scegliAltroPc` e `scriviAltroPc` (in `index.ts`) leggono l'esito con `leggiEsitoAltroPc`. Un PC vecchio risponde solo `fatto`: l'esito è `senza-verifica`, con la frase «Mandata: … non controlla se è stata presa».
- **Tempi:** `/api/scegli` e `/api/scrivi` sono in `ROTTE_CON_VERIFICA` (`pc-remoto.ts`), con un'attesa di 14 s invece di 4. Non stanno in `ROTTE_LENTE`, perché quella lista va tenuta uguale a `Api.ROTTE_LENTE` dell'app e cambiarla vorrebbe dire un APK nuovo. L'app aspetta 15 s, la pagina non ha limite.
- **Dove si vede l'esito:**
  - riquadro Domande del PC (`PannelloDomande`): «✓ Presa: …» oppure «⚠ Non presa: …»;
  - pagina del telefono (`scegliIn`, `scriviIn`, scelte dentro la chat): `notaGlobale` / `notaScelta`;
  - app Android: la «non presa» compare come errore (il 409 esisteva già), la «presa» non ha una frase sua. Per non dover rifare l'APK `android/` non è stato toccato.
- **Accesa** in `index.ts` con `verificaRisposte: {}`. Senza questa dipendenza (i test vecchi) le rotte fanno come prima e scrivono `premuto, senza verifica`.

# Test

`tests/main/risposta-verificata.test.ts`, sugli schermi veri `tests/fixtures/claude-2.1.294-domande/`. Copre:
- presa al primo colpo e al secondo;
- non presa dopo 2 tentativi;
- un permesso che ricompare;
- la spunta;
- le rotte, compresi l'altro PC nuovo e vecchio e il doppio tocco.

# Trappole

- In un test, `array.shift() ?? x` trasforma una lettura `undefined` («domanda sparita») nel ripiego: per le sequenze di letture usare un contatore.
- Una chat in sottofondo non ha finestra: `schermoDi` torna `undefined` e si rilegge la foto `codaGrezza`, che si aggiorna ogni circa 2 s. La finestra di 3,5 s basta, ma è il caso più lento.
