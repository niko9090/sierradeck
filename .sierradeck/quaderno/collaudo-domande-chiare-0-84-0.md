---
titolo: "Collaudo delle domande chiare 0.84.0: 8 difetti, corretti per la 0.84.1 (c-65, c-70)"
quando: 2026-10-22T10:30:00+02:00
tag: ["0.84.0", "0.84.1", "domande", "collaudo", "c-65", "c-70"]
---

Collaudo del lavoro di c-61 (già in main, scheda `domande-chiare-0-84-0.md`), con le domande vere del 20-21/10 lette dalla memoria del servizio (`%APPDATA%/SierraDeck/autopiloti/servizio/memoria.json`, sola lettura).

**Test:** `tests/shared/collaudo-domande-chiare.test.ts` e `tests/autopilot-host/collaudo-domande-chiare-servizio.test.ts`. Prima erano `it.fails`; la Revisione (21/10 sera) ha chiesto di correggerli subito sul ramo c-65, ripartendo da main dopo la 0.84.0. **Corretti per la 0.84.1**, ora sono `it` normali. Verdi: servizio e condivisi 2371, renderer e pty 604, main 1870, typecheck. `android/` non è toccato.

# Come sono stati corretti
- 1: in `SIGLA_CHAT` una «/» esclude la sigla solo se prima non c'è un'altra sigla (`(?<!(?<!c-\d+)\/)`).
- 2: una sigla sconosciuta **resta** nel testo. Il controllo la vede e la fa riscrivere; se la riscrittura non arriva, passa con l'avvertenza. Cambiato anche il test di c-61 che voleva «una chat precedente».
- 3 e 4: «questo lavoro», «questo autopilota», «quella cosa» e «questa cosa» sono in `RIFERIMENTI_VAGHI`, che vale anche per le scelte. Seguiti da un nome fra «» vanno bene.
- 5: `SIGLA_AUTOPILOTA` («ap-» più almeno 6 cifre esadecimali) entra nelle note di chiarezza.
- 6: `SUPERATA`/`eSuperata` in `domande-telefono.ts`. La conversazione dice «chiusa senza risposta, non serve più: …».
  **Il 22/10 si è visto che non bastava:** la scheda della domanda (`SchedaDomanda.risposta`) la disegnano tre posti con la scritta fissa «risposta dall’autopilota: …»: `SchedaDomandaVista.tsx`, `client-pagina.ts` (`schedaDomandaHtml`) e `SchedaDomandaVista.kt`. Per una superata adesso c’è `scheda.superata` (il motivo) al posto di `risposta`, e tutti e tre scrivono «chiusa senza risposta, non serve più: …». Anche l’etichetta in elenco (`tipoDomanda`) dice «non serve più». Un’app vecchia non conosce il campo e non scrive niente sotto la domanda. Test Kotlin: `DomandaSuperataTest`. **Tocca `android/`.**
- 7 e 8: in `server.ts`, `risoltaChiara` toglie le sigle da domanda e risposta in tutte e sei le chiamate a `risolta`. `chatDellaDomanda` usa `nomeCompito`.
- Nei test i nomi del NAS, dell'utente e della chiave sono inventati (`nas-prova`, `mario`, `backup@pc-prova`), anche nel test di c-61.

# Cosa va già bene (provato)
- «Come vuoi che proceda?» (20/10) da sola non passa; le sigle di «c-7, c-10 e c-12» tornano indietro; le quattro domande 0.81.1 del 21/10 si riconoscono superate dallo stato vero; le domande su nexora-nas passano così come sono.
- Conversazione, app e pagina: la traccia della risposta porta la domanda intera (`tracciaDopoRisposta`, `server.ts` ~4420); l'app usa la conversazione composta dal PC, quindi vale anche lì.

# Difetti trovati (file:riga di allora, come riprodurre)
1. **Sigla dopo la barra** — `src/shared/domanda-chiara.ts:22`. `sigleIn('Chiudo le chat c-7/c-4?')` → solo `c-7`: il lookbehind esclude «/» (serve per i percorsi) e così salta anche «c-7/c-4».
2. **Sigla sconosciuta** — `domanda-chiara.ts:96`. `senzaSigle('Chiudo le chat c-310 e c-311?', [])` → «Chiudo le chat una chat precedente e una chat precedente?»: sgrammaticata e non dice quale lavoro; poi `domandaControllata` la mostra senza riscrittura né avvertenza. Meglio: lasciarla al controllo (riscrittura) invece di sostituirla.
3. **«questo lavoro», «questo autopilota»** — `domanda-chiara.ts:26` (`RIFERIMENTI_VAGHI`). Due domande vere del 21/10 («Chiudo adesso questo lavoro e tolgo i due workspace…», «Chiudo adesso questo autopilota…») passano. C'è «quel lavoro» ma non «questo lavoro».
4. **«quella cosa» nelle scelte** — `domanda-strutturata.ts:123` guarda `PAROLE_VAGHE` solo nella domanda; `noteDiChiarezza` (`domanda-chiara.ts:56`) guarda le scelte solo con `RIFERIMENTI_VAGHI`, che non ha «quella cosa». Una scelta «fai quella cosa» passa.
5. **Id dell'autopilota** — `domanda-chiara.ts:22`. «Chiudo l'autopilota ap-f1e631f5 adesso?» passa: per Nicholas è una sigla come «c-12».
6. **Superata letta come risposta** — `src/shared/domande-conversazioni.ts:288` e `:297`. Una domanda chiusa da `ricontrollaDomande` compare come «risposta dall'autopilota: Superata, non serve più: …» sotto «ha risposto da solo a una domanda della sua chat»: nessuno ha risposto.
7. **Sigle nelle risolte** — `src/autopilot-host/server.ts:3611` (anche 3178, 3187, 3349, 3661: `decisione.domanda` grezza). La chat finisce con «Chiudo anche la chat c-7…?», il supervisore risponde da solo: fra le risolte la domanda resta con «c-7». La domanda aperta è pulita, quella accanto alla risposta no.
8. **Nome della chat con le sigle** — `server.ts:293` (`chatDellaDomanda`: `c.compito.slice(0, 80)`). Per una chat della Revisione il titolo è «Rivedi il ramo ap/ap-f1e631f5/c-61 della chat c-61…». Va usato `nomeCompito`.

# Visto nel codice, senza test
- `server.ts:2373`: nella domanda «Come vado avanti con «…»?» dopo due respinte, il «perché» è `v.note` della Revisione, che può contenere sigle e rami; questa domanda non passa da `domandaControllata` né da `senzaSigle`.
- `server.ts:1639` (`riapriDomandaIntervista`): dopo un riavvio la domanda della preparazione torna senza parti né controllo.

# Corretti (c-70, 21/10) — escono con la 0.84.1
Tutti gli 8 `it.fails` sono diventati `it` e passano.
1. `SIGLA_CHAT` riconosce la sigla dopo la barra solo se prima c'è un'altra sigla («c-7/c-4»); i percorsi («consegne/c-440.md») restano fuori.
2. `senzaSigle` lascia la sigla che non conosce: il controllo la fa riscrivere o la passa con l'avvertenza. Per le domande già chiuse, che non si possono far riscrivere, c'è `senzaSigleMai` («una chat che non c'è più», «un altro autopilota»).
3-4. «questo lavoro», «questo autopilota», «quella cosa», «questa cosa» in `RIFERIMENTI_VAGHI` (guardati in domanda e scelte); in più `validaDomanda` guarda `PAROLE_VAGHE` anche nelle scelte.
5. L'id dell'autopilota (`ap-` + 8 cifre esadecimali) è una sigla. Nel servizio si traduce col nome dell'autopilota (`conosciute(a)` = chat + autopilota, passato a `domandaControllata`).
6. `PREFISSO_SUPERATA` (in `domande-conversazioni.ts`, usato anche dal registro): la superata si legge «chiusa: superata — motivo», sotto «ha chiuso una domanda superata»; pagina, app (`SchedaDomandaVista.kt`) e `domande-vista.ts` non ci mettono davanti «risposta dall'autopilota».
7. Tutte e sei le `deps.domande.risolta` del servizio passano da `risoltaChiara` (domanda e risposta con `senzaSigleMai`).
8. `chatDellaDomanda` usa `nomeCompito`.
- Revisione dopo le respinte: il «perché» passa da `senzaSigleMai` e la domanda da `domandaControllataSubito` (controllo senza riscrittura, sincrono).
- Riavvio: `riapriDomandaIntervista` rilegge le parti dal testo con `partiDaTesto` (l'inverso di `testoDomanda`) e le controlla; un testo vecchio, non a parti, resta com'era.

Trappola: la regex con lookbehind variabile `(?<=…c-\d+\/)` funziona in Node; non spostarla nella pagina servita senza provarla nei browser vecchi del telefono.

# Revisione respinta senza un difetto nel codice (c-70, 21/10)
La prima Revisione ha visto rossi i test e il TypeScript sul ramo. Il codice era a posto: avevo tolto la junction `node_modules` dalla copia della chat appena finito, e i criteri misurati nella copia non trovavano più `tsc` né vitest. Rimessa la junction: TypeScript pulito, 273 file e 2977 test verdi (servizio, renderer, condivisi, pty); i due test di Git rossi in una corsa sotto carico (scadenza a 9-10 s) passano da soli.
**Regola:** la junction `node_modules` di una copia si toglie solo quando la chat si chiude (ramo unito o scartato), non a fine compito: la Revisione e i criteri misurano ancora lì.

# c-70 e c-65 uniti insieme (c-73, 22/10)
c-70 e c-65 hanno corretto gli stessi 8 difetti ognuna per conto suo. Unita prima
c-70 (difetti 1-5, 7, 8, il «perché» della Revisione e il riavvio, come sopra);
poi c-65 **solo per il difetto 6**, che c-70 aveva corretto a metà:
- c-70 riconosceva la superata dal testo («chiusa: superata» in testa a
  `risposta`), in verde, e l'elenco diceva ancora «risposta dall'autopilota».
- Tenuto il modo di c-65: la scheda ha il campo `superata` (il motivo) al posto
  di `risposta`; PC (`SchedaDomandaVista.tsx`), pagina (`schedaDomandaHtml`) e
  app (`SchedaDomandaVista.kt`, `Modelli.kt`) scrivono «chiusa senza risposta,
  non serve più: …»; in elenco «non serve più». Test `DomandaSuperataTest`
  (Kotlin) e `collaudo-domande-chiare.test.ts`.
- Una sola costante per il testo del registro: `SUPERATA` in
  `domande-telefono.ts` (tolta `PREFISSO_SUPERATA`, identica).
- **Tocca `android/`**: la 0.84.1 vuole un APK nuovo (`npm run allega-apk`).
