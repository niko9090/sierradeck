---
titolo: "Rapporto 0.75.0 per Nicholas: il microfono per parlare all'autopilota"
quando: 2026-10-15T23:35:00+02:00
tag: ["rapporto", "0.75.0", "per Nicholas"]
---

# In breve
La 0.75.0 (app 2.75.0) è pubblicata con installer, latest.yml, APK firmato e app-android.json. **Non l'ho installata: la installi tu.** Contiene anche la 0.74.1, con la trasformazione dei workspace, se non l'hai ancora installata.

# Cosa c'è
Il tasto **🎤** sta accanto a:
- il campo della chat con l'autopilota;
- «Scrivi tu» delle Domande e la risposta alle domande dell'autopilota;
- il primo messaggio dell'autopilota di un workspace.

Parli in italiano e il testo compare nel campo mentre parli. **Non parte niente da solo**: lo rileggi e premi tu «Manda».

- **Sul PC** il tasto apre la dettatura di Windows (quella di Win+H) sul campo. Se non c'è, o se il microfono è bloccato nella privacy di Windows, il tasto dice «dettatura non disponibile su questo PC», e il «?» spiega come attivarla. SierraDeck non scarica e non installa niente.
- **Sulla pagina del telefono** usa il riconoscimento vocale del browser (Chrome su Android). Se il browser non ce l'ha, il tasto lo dice.
- **Nell'app** usa il riconoscimento di Android, senza rete se il telefono ha l'italiano scaricato. Alla prima volta chiede il permesso del microfono, con il motivo in una riga.
- **L'audio non passa da SierraDeck:** non si registra, non si salva e non si manda a nessuno. Lo ascolta il sistema (Windows, il browser o Android), con le sue impostazioni. Lo dice anche il «?».

# Provato
- **Sul PC, dal vero su Windows 11** (copia di prova): il 🎤 porta davanti la finestra, mette il cursore in «Scrivi tu» e apre il pannello della digitazione vocale di Windows.
  - Su questo PC adesso il microfono non risponde (Windows dice «Verifica che il microfono sia acceso»): il testo dettato vero lo vedi tu, con un microfono collegato.
  - Alla prima volta Windows mostra la sua informativa sui servizi vocali e può proporre di installare il riconoscimento sul PC: lo decidi tu, da lì.
- **Pagina e app:** non c'è un telefono collegato, quindi bastano test e build.
  - Pagina: lingua it-IT, risultati parziali nel campo, niente invio, il tasto che spiega quando il browser non ce l'ha.
  - App: ascolto, parziale, finale, errore, permesso negato. 327 test verdi e la build.
- Test del programma: 3939 verdi; TypeScript senza errori.

# Punti aperti
1. Il messaggio con il motivo quando il telefono non si collega (c-19) resta da fare.
2. Prova del microfono vero sul telefono: alla prima occasione, dimmi se il testo compare bene in italiano.
