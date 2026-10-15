---
titolo: "Rapporto 0.75.1 per Nicholas: perché il telefono non si collega, e com'è andata la trasformazione dei workspace"
quando: 2026-10-16T00:10:00+02:00
tag: ["rapporto", "0.75.1", "per Nicholas", "migrazione"]
---

# La trasformazione dei workspace su questo PC (0.75.0 installata alle 21:50 UTC)
È andata bene, al primo avvio, da sola:
- **20 workspace** a elenco;
- **46 chat** lasciate com'erano;
- **nessun errore** nel registro `[migrazione]`;
- la copia di sicurezza è in `copie-di-versione/migrazione-elenco-20261015-215016`.

«Torna come prima» resta a disposizione: nella banda, in Impostazioni → Chat e autopiloti, sulla pagina e nell'app.

# 0.75.1: quando il telefono non si collega, dice perché
La 0.75.1 (app 2.75.1) è pubblicata con installer, latest.yml, APK firmato e app-android.json. **Non l'ho installata: la installi tu.**

**Nell'app,** dopo due giri senza risposta compare una banda con il motivo probabile e il rimedio:
- **«Tailscale è spento su questo telefono»**, con il tasto **«Apri Tailscale»** (se l'app non c'è, apre il Play Store). Succede quando il PC si raggiunge solo con Tailscale e sul telefono non c'è una VPN accesa né un indirizzo 100.x;
- **«Non sei sulla rete di casa: accendi Tailscale»**, anche questa con «Apri Tailscale»: il PC è sulla rete di casa e il telefono è sui dati mobili, o su un altro wifi;
- **«Il PC risponde ma non riconosce questo telefono»** (401 o 403), con **«Riprova»**; nel «?» c'è come ricollegarlo;
- **«Nessun PC risponde»**, con l'elenco degli indirizzi provati e cosa controllare.

**Sulla pagina del telefono** la VPN non si vede, quindi ci sono due casi: la chiave rifiutata, e nessuna risposta (con il rimedio giusto per un indirizzo di casa o Tailscale). Entrambi hanno «Riprova» e il «?».

**Provato con i test:**
- app: 5 test nuovi sulla regola, 332 in tutto, e la build;
- pagina: 3 test nuovi;
- programma: 3942 test verdi, TypeScript senza errori.

Non c'è un telefono collegato, quindi la prova vera la fai tu spegnendo Tailscale sul telefono.
