---
titolo: "Grafica meno caotica 0.82.0: cosa è cambiato, prima e dopo (c-38)"
quando: 2026-10-21T02:30:00+02:00
tag: ["0.82.0", "grafica", "PC", "pagina", "app", "foto", "rapporto"]
---

Parte «grafica meno caotica» della 0.82.0, da riportare in `rapporto-0-82-0.md`. Ramo `ap/ap-f1e631f5/c-38`.

**Regola seguita:** nessuna funzione tolta. Le cose rare sono andate dietro «⋯» o «?». Dove un'informazione era detta due o tre volte, ne resta una.

**Foto:** `foto-0-82-0/prima/` e `foto-0-82-0/dopo/`, fuori da git (mostrano percorsi della macchina). Copia di prova `note/prova-082` vista come `P:\` (subst), porte 47700/47701, DevTools 9383 (finestra) e 9384 (Edge a 412 px). Script: `prepara.mjs`, `avvia.ps1` (`-ferma` per spegnerla), `scatta.mjs`.

**App:** niente foto, perché qui non ci sono né emulatore né telefono. È allineata dal codice Kotlin, con i test JUnit.

## Schermata per schermata
| Schermata | Prima | Dopo | Foto |
|---|---|---|---|
| Avvisi sopra le chat (PC) | due bande impilate, alte 50 px ciascuna (tasti da 34 px): 100 px tolti alle chat | righe da 30 px con tasti piccoli, gli stessi tasti | `pc-00-avvio` |
| Panoramica (PC) | «fermo» tre volte: in testata, sopra la conversazione («fermo · da 1 min») e nell'«Adesso» | sopra la conversazione una riga sola: ultima azione · da quanto · ⚠ | `pc-00-avvio` |
| Panoramica (PC, pagina, app) | «Al lavoro · 0 / Nessuna chat al lavoro» e subito «Adesso · 0 / Nessuna chat al lavoro» | «Adesso» vuoto non si mostra quando c'è già «Al lavoro». Con un PC 0.78, che non manda «Al lavoro», resta | `pag-06b` |
| Interruttore delle viste (PC) | due «?», uno per voce | un «?» per le due viste | `pc-00-avvio` |
| Scheda dell'autopilota accanto alla chat (PC) | 8 linguette più «⧉ Stacca» su tre righe | in vista Domande, Sta facendo, Obiettivo, Criteri, Compiti; Istruzioni, File e Ha deciso dietro «⋯». Quella aperta resta sempre in vista; «⧉» senza parola | `pc-03-affiancate` |
| Impostazioni (PC) | a sinistra non si accendeva niente mentre scorri; una riga fissa «Riparti al login…: Autopiloti → Strumenti ▾» | si accende la sezione che stai leggendo (in fondo l'ultima). Il rimando sta nel «?» di «Chat e autopiloti» | `pc-05-impostazioni` |
| Dettaglio autopilota (pagina, app) | «■ fermo» e sotto di nuovo «fermo · da 22 min»; testo d'esempio del campo tagliato «(le sue domande sono nella linguetta…» | riga dal vivo senza la parola dello stato. Nell'app solo se la riga sopra dice la stessa parola. Testo d'esempio corto come sul PC | `pag-06b` |
| Elenco chat (pagina, app, notifiche) | sotto il nome di ogni chat ferma «❯» (il campo vuoto); poi, tolto quello, una riga di soli trattini (la cornice con il titolo tagliata a 160) | l'ultima riga vera della chat («● Faro, Vetrina, Nodo») | `pag-02-chat` |

## Dove sta nel codice
- `src/renderer/linguette-diario.ts` (`divisioneLinguette`, `LINGUETTE_RARE`), `DiarioAutopilota.tsx`.
- `RigaDalVivo senzaStato` (`DalVivoAutopilota.tsx`), `ChatAutopilota.tsx`, `WorkspacePanoramica.tsx`.
- `sezioneInVista` in `shared/impostazioni-struttura.ts`, `PannelloImpostazioni.tsx`.
- `.banda .banda__voce` in `console.css`.
- Pagina: `dalVivoHtml(v, senzaStato)`, `panoramicaRestoHtml`.
- App: `RegolePanoramica.mostraAdesso` / `rigaDalVivoSenzaStato`, `DalVivo(senzaStato)`.
- Righe delle chat: `RUMORE_DI_INTERFACCIA` (con «❯») e `CORNICE_CON_TITOLO` in `renderer/ultime-righe.ts`. Valgono anche per sottofondo e notifiche.
- Test: `tests/main/grafica-0-82-0.test.ts`, JUnit `GraficaMenoCaoticaTest`.

## Revisione (typescript-reviewer)
Nessun difetto grave. Corretto:
1. Impostazioni: in fondo le sezioni corte non si accendevano mai. Ora si accende l'ultima.
2. Impostazioni: con la ricerca la voce accesa non si aggiornava. Ora c'è un `ResizeObserver`.
3. App: «da 22 min» da solo si vedeva, PC e pagina no. Ora niente.
4. App: la parola colorata del PC spariva anche quando la testata diceva altro. Ora si toglie solo se è la stessa.
5. Il menu «⋯» si chiude anche toccando una linguetta.

## Lasciato, da proporre a Nicholas
- La linguetta «Panoramica» a sinistra e l'interruttore «Panoramica» a destra nella stessa riga. Toglierne una è uno spostamento, già proposto nella 0.80.0.
- Le due bande (trasformazione dei workspace, autopilota fermo) restano due righe. Unirle in una sola cambierebbe dove stanno i tasti.
- Progetti nella copia è vuoto (nessun progetto indicizzato): non giudicato dalle foto.

## Trappole viste
- Riavviando la copia con `avvia.ps1` riparte anche Edge su `about:blank`. Prima di mettere la chiave in `localStorage` bisogna aprire la pagina, altrimenti le foto vengono nere.
- La finestra ricorda vista e colonne fra un avvio e l'altro (Domande aperta, vista affiancata). Per confrontare prima e dopo, rimetterle uguali prima dello scatto.
- Il «prima» delle bande si misura con `getBoundingClientRect` via CDP: `.banda` era 51 px.
