---
titolo: "Rapporto 0.77.0 per Nicholas: la Panoramica, tutto in una vista"
quando: 2026-10-16T13:00:00+02:00
tag: ["rapporto", "0.77.0", "per Nicholas", "panoramica", "linguette"]
---

La 0.77.0 (app 2.77.0) è pubblicata con installer, latest.yml, APK firmato e app-android.json. **Non l'ho installata: la installi tu.** Le foto sono in `note/foto-0-77-0/`.

## Cosa vedi
- **Linguetta «Panoramica»**, la prima di ogni workspace dell'autopilota (foto `pan-1-panoramica`):
  - **in alto:** l'obiettivo, lo stato in una parola con il colore e «Criteri 1/2»;
  - **a sinistra:** il dialogo con l'autopilota e il microfono;
  - **al centro:** una scheda per chat, specialisti con il ruolo e chat normali. Ogni scheda ha il pallino dello stato (con il simbolo: ◆ aspetta te, ● al lavoro, ■ ferma, ✓ finita), l'ultima azione, le ultime righe dal vivo e da quanto tempo. Le schede di chi aspetta te stanno in cima e hanno il bordo arancio. Gli specialisti si riconoscono dal loro compito;
  - **a destra:** le domande brevi, con i tasti e «Scrivi tu».
- **Una linguetta per chat**, a tutta larghezza, con il pallino (foto `pan-2-chat-aperta`). Con molte chat le altre vanno in «Altre ▾», ma chi lavora o aspetta te resta sempre in vista. Il tasto «Autopilota ⟩» apre e chiude la colonna sottile dell'autopilota (foto `pan-3`).
- **Telefono (pagina e app):** la Panoramica è in cima alla scheda dell'autopilota, come lista di schede con 2 righe dal vivo. Il tocco apre la chat a tutto schermo.

## Come l'ho fatta
- **Revisione UI/UX prima del codice:** l'ha fatta un agente. Ho preso le sue misure:
  - dialogo largo 320 px, domande 300 px;
  - schede alte fisse, 148 px, in una griglia da 280 px;
  - fra 4 e 10 linguette;
  - il simbolo accanto al colore;
  - 8 secondi di quiete prima che una scheda cambi gruppo, tranne «aspetta te»;
  - la domanda solo nella colonna di destra;
  - sul telefono 2 righe dal vivo invece di 4.
- **Le regole sono pure, con i test**, uguali in TypeScript e in Kotlin: l'ordine e i gruppi, gli 8 secondi di quiete, le linguette e «Altre», le righe dal vivo pulite. Lo stato viene dall'indicatore unico della 0.76.0.
- **Nessuna chat si riavvia** passando da Panoramica a chat: i terminali restano montati sotto.

## Prova con clic veri
Su una copia di prova dei dati di questo PC: un autopilota con i suoi specialisti, due chat normali al lavoro.
- **Primo giro, 4 minuti:** 56 clic su una scheda, 56 hanno aperto la linguetta giusta, 56 ritorni alla Panoramica riusciti.
  - **Difetto trovato:** due Revisioni avevano schede identiche. Ora mostrano il compito.
  - **Difetto trovato:** nelle righe dal vivo comparivano la riga di stato di Claude Code e pezzi di codici colore. Ora non più.
- **Secondo giro, 2,5 minuti:** 30 clic, 30 aperture giuste, 30 ritorni, **0 inversioni d'ordine** dentro un gruppo, **0 doppioni**.
- **«Altre ▾»** non si vede nelle foto: nella prova c'erano solo 3 chat aperte, che stanno anche nella finestra stretta. La regola (chi lavora o aspetta resta in vista) è provata dai test, fino a 12 chat.

## Test
4001 test del programma e 340 dell'app, tutti verdi; TypeScript senza errori; l'app compila.

## Ancora in attesa di te
Come prima: «Chat delle prove» in Spazio sul Drive, le 4 cartelle di storie di prova da rimettere nel recupero, e il portatile da pulire quando lo accendi.
