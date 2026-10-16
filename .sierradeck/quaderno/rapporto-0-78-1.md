---
titolo: "Rapporto 0.78.1 per Nicholas: niente più «Mosaico», un interruttore fra le due viste"
quando: 2026-10-16T19:20:00+02:00
tag: ["rapporto", "0.78.1", "per Nicholas", "panoramica", "interruttore"]
---

La 0.78.1 (app 2.78.1) è pubblicata. **Non l'ho installata: la installi tu.** Foto in `note/foto-0-78-1/`.

## Cosa cambia
- **Un interruttore sempre in alto a destra, in tutte e due le viste:** «Panoramica» | «Tutte le chat affiancate».
  - La voce accesa è in blu, e ognuna ha un «?» corto.
  - Si passa nei due sensi con un clic, e ogni workspace si ricorda la sua scelta.
  - Prima, dalle chat affiancate si tornava solo da Strumenti.
- **«Mosaico» e «a elenco» tolti** da tutti i testi che vedi: tasti, «?», menu Strumenti (ora «Panoramica di questo workspace»), banda e Impostazioni, scorciatoie, novità, pagina e app.
- **Telefono:** solo la Panoramica, senza interruttore.

## Giro con clic veri (copia di prova dei dati di questo PC)
| Tasto | Cosa fa | Strada per tornare | Parole tecniche |
|---|---|---|---|
| «Tutte le chat affiancate» (Predefinito, 29 chat) | chat affiancate | l'interruttore resta in alto a destra | nessuna |
| «Panoramica» (Predefinito) | torna alla Panoramica | sì, un clic | nessuna |
| «Tutte le chat affiancate» e ritorno (workspace di prova) | come sopra | sì | nessuna |
| Ricordo per workspace | prova su «affiancate», Predefinito resta «Panoramica»; tornando, la prova è ancora «affiancate» | sì | nessuna |
| «?» di «Panoramica» | «Tutto il workspace in una vista…» | si chiude | nessuna |
| «?» di «Tutte le chat affiancate» | «…Sono le stesse chat: per tornare tocca «Panoramica».» | si chiude | nessuna |
| «Criteri», «Cosa è successo», «Finite», «solo mia» | si aprono / si accendono | lo stesso tasto | nessuna |
| scheda di una chat | apre la chat; «Autopilota ⟩» apre e chiude la colonna | «Panoramica» nell'interruttore | nessuna |
| linguetta di una chat | la chat a tutta larghezza | la linguetta «Panoramica» | nessuna |

**PID:** 29 chat vive, gli stessi PID dopo «Tutte le chat affiancate» e dopo «Panoramica», in tutti e due i workspace.

Al momento del giro non c'erano schede in «Adesso», compiti apribili né «Mostra tutto»: erano già stati provati con la 0.78.0.

## La verifica, messa in dubbio
- **Il mio conteggio dei PID misurava troppo.** Contava anche i supervisori temporanei (`claude -p`) che il servizio degli autopiloti apre e chiude a ogni giro, e così sembrava che i PID cambiassero. Ora conta solo le chat: con questo, uguali.
- **Anche il controllo delle parole tecniche misurava troppo.** Leggeva anche i terminali sotto la Panoramica, dove Claude Code scrive «hook». Ora legge solo la vista nuova.
- **Perché i criteri dell'autopilota non cambiano da 4 giri.** I 9 criteri «no» non hanno un comando: li giudica il supervisore a parole, e nessun giro di codice li fa passare. Il criterio della release dice ancora «0.78.0», mentre ora la release è 0.78.1. Propongo questi comandi:
  - «Mosaico»/interruttore: `npx vitest run tests/renderer/interruttore-vista.test.tsx`;
  - adozione e conversione: `npx vitest run tests/shared/adozione.test.ts tests/main/adozione-chat.test.ts`;
  - Panoramica 2: `npx vitest run tests/shared/panoramica-2.test.ts tests/main/client-pagina-domande-a-lato.test.ts`;
  - release: `gh release view v0.78.1 --json isDraft,assets` con: non bozza, `latest.yml`, `app-android.json` e `.apk` presenti.

## Test
4051 del programma (2 saltati come sempre) e 345 dell'app verdi; TypeScript senza errori; l'app compila.

## Fuori da questo giro
Nella vista con le chat affiancate la vecchia scheda dell'autopilota a destra mostra ancora righe tecniche: «chat 1 · ap/…», «trascrizione non leggibile: ENOENT». Non l'ho toccata (consegna: SOLO l'interruttore).
