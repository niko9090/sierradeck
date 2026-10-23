---
titolo: "Promesse mantenute: «ti avviso quando…» legato a un fatto (0.85.1)"
quando: 2026-10-23T23:05:00+02:00
tag: ["autopilota", "promesse", "dialogo", "indicatore", "0.85.1"]
---

**Perché.** Nicholas, 23/10 sera: «dice spesso che mi tiene aggiornato ma questo non succede mai». Era vero: la risposta dalla scheda è una sola, poi l'autopilota parlava solo se Nicholas riscriveva. Nel dialogo del 22-23/10 ci sono 6 promesse («ti avviso io quando è pronta», «ti dico io quando la 0.84.4 è pronta», «ti scrivo io a ogni passo importante»…), nessuna mantenuta da sola.

**Come funziona adesso** (`src/shared/promesse.ts`, cablato in `server.ts`):
- Nella risposta dalla scheda (`rispondiAlDialogo`) le frasi che promettono diventano `Autopilota.promesse`, ognuna con un **fatto** e una **scadenza**. Fatti: `release` (versione X **o una dopo** pubblicata, da `releaseUscite` che il servizio rilegge da GitHub ogni 10 min), `unito` (traguardo `unito` della chat o `conclusa.come === 'unito'`), `richiesta` (`statoRichiesta` = fatta), `bloccata`, `criterio`, `finito`.
- Il fatto lo dà il supervisore nel JSON (`"promesse": [{frase, fatto, di, entroOre}]`); se manca o non si controlla (chat inesistente…), lo ricava il programma dalla frase: versione nella frase → nel paragrafo → la più bassa non uscita nominata nella risposta → la prossima versione dai criteri. Le versioni dopo «app/APK/android» (2.84.1) non contano.
- Una frase che promette e **non si lega a niente si toglie dalla risposta** (esito «tolta una promessa non legata a un fatto», riga `[promesse]` nel registro). Il prompt lo vieta già (`REGOLA_PROMESSE`) e mostra le promesse aperte, così non si ripetono.
- `controllaPromesse` gira **ogni minuto** (`index.ts`): fatto successo → messaggio nel dialogo «Come promesso il …: … Prova: …», `annuncio` (= notifica su PC, pagina e app, senza toccare l'app) e `avvisa` (Telegram). Chat chiusa senza unire / criterio sparito → «non può più succedere», chiusa come `superata`. Scadenza passata → «Non ancora… Perché: …» (pezzi mancanti della versione, ultimo passo della chat…) e rimanda dello stesso intervallo, al più `RINVII_MAX` = 3 volte; poi resta aperta «in ritardo» finché il fatto arriva.
- Indicatore: campo `promesse` sotto le tre righe, su PC (`PuntoAutopilota.tsx`), pagina (`client-pagina.ts`) e app (`IndicatoreAutopilota.kt`, **android/ cambiato → APK nuovo alla 0.85.1**).

**Trappole.**
- Riconoscere una promessa: «ti dico com'è andata» e «ti dico perché» **non** lo sono (servono «quando/appena/a ogni» dopo il verbo, o «quando/appena …» prima); il testo fra «…» non conta («quando ti scrivo «ti avviso io»» del 23/10 21:12 parla delle promesse, non ne fa). I casi veri sono in `tests/autopilot-host/promesse-0-85-1.test.ts`: se si tocca una regex, devono restare verdi.
- `promesse` è nei campi che la fotografia di fine turno rilegge dal disco (come `richieste` e `annuncio`), e nel ri-merge di fine dialogo: altrimenti una promessa registrata durante un turno sparisce.
