---
titolo: "Progetti provata tasto per tasto con una copia staccata dei dati veri (0.71.1)"
quando: 2026-10-13T19:40:00+02:00
tag: ["progetti", "collaudo", "clic veri", "pagina", "0.71.1"]
---

Nicholas (13/10): «nella pagina Progetti ci sono ancora errori e pulsanti che non vanno». Con i dati di prova gli errori non uscivano.

# Come si fa (ricetta)

1. **Copia staccata.** Si copiano in sola lettura `progetti-drive.json`, `case-chat.json`, `workspaces.json`, `pc-altrui.json`, `pc.json`, `traslochi/`, `unioni/`, `riordini/`, `sync-manifesto.json` e `index.db*` dentro `note/vero-copia/appdata/SierraDeck`.
   - Non si copiano mai: token del Drive, cassaforte (cioè chiave di casa), `dispositivi.json` vero, `sottofondo.json`, finestre e autopiloti.
   - Le porte vanno messe in `preferenze`: 47650 per il client e 47651 per il servizio.
   - Il workspace attivo deve essere uno nuovo e vuoto, così nessun riquadro fa ripartire una chat vera.
2. **Dove metterla.** Sta in `note/`, che è ignorata da git: l'hook dell'autopilota non lascia cancellare file fuori dalle sue cartelle, nemmeno nello scratchpad.
3. **Clic veri.** Sul PC si usa CDP 9333 (`Input.dispatchMouseEvent`); sulla pagina Edge senza finestra su 9444, a 390 px con `mobile: true`.
4. **Sui progetti veri** ci si ferma alla conferma e si preme «No» o «Annulla». Le azioni vere si fanno solo sui «SierraDeck-prova-…». **Mai confermare «Vai avanti senza» sul trasloco vero**: lavorerebbe sulle cartelle vere.
5. Alla fine si ferma la copia, si ferma Edge e si cancella `note/vero-copia`.

# Esiti

**PC.** 547 controlli: testa, gruppi, ricerca, ordinamenti, Strumenti e i suoi fogli, poi per ognuno dei 29 progetti i «?», «Sposta su ▾» con conferma e «Annulla», le azioni, il Quaderno e la chiusura.
- I falsi errori erano del mio giro: scorrimento, nomi con la data, il Quaderno che ha classi `.progetti`. Li ho ricontrollati a mano.

**Pagina.** 341 controlli, di cui 339 riusciti.
- I 2 restanti, ricontrollati a mano, funzionano: erano tocchi caduti mentre arrivavano dati nuovi.

# Errori trovati e corretti (ognuno con un test)

| Errore | Causa | Dove |
|---|---|---|
| «DESKTOP…, LAPTOP…: vanno aggiornati» sempre | dalla 0.58.0 i battiti arrivavano al pannello senza `locali` | `pcPerPannello` |
| 14 progetti su 29 «da sistemare · registrato N volte» | un doppione nel registro con una sola cartella per PC non è un problema | `pannello-drive.ts` |
| «Quaderno del progetto» apre il quaderno della chat davanti | l'evento non portava la cartella | `cartellaDelQuaderno`, `sierradeck:apri-quaderno` |
| «Dove vive ogni chat…» sembra non fare niente | la finestra si apriva sotto la schermata a tutta finestra | dentro `VistaProgetti` |
| «Annulla l'unione» senza conferma sul PC | pagina e app la chiedevano, il PC no | `Dettaglio` |
| Pagina: i «?» e i tasti a destra del dettaglio non si toccano | il `select` «Sposta su…» allargava la pagina a 537 px | regola `select { max-width:100% }` |
| Pagina: «va aggiornato» con più PC | singolare fisso | `client-pagina.ts` |

# Limiti della copia

- Senza Drive non si vedono lo spazio sul Drive né le copie solo-Drive.
- Senza chiave di casa «Guarda su <PC>» non si collega: è giusto così.
- L'app Android non l'ho provata con questi dati: non c'è un telefono collegato. La sua parte di Progetti legge lo stesso pannello del PC.
