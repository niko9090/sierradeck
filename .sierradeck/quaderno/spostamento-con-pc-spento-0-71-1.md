---
titolo: "Spostamento con un PC spento: motivo in chiaro, «Aspetta» o «Vai avanti senza» (0.71.1)"
quando: 2026-10-13T18:30:00+02:00
tag: ["trasloco", "sposta su", "progetti", "0.71.1"]
---

Nicholas (13/10): «ho provato a spostare un progetto ma rimane fermo».

Il trasloco «SierraDeck» delle 15:07 UTC si era fermato a «Raccolgo le copie», perché il portatile è spento. Il motivo era tecnico e veniva tagliato sullo schermo: «LAPTOP-… non risponde (Con il collegamento lento via Drive non si può fare…)». **Quel trasloco è di Nicholas: non l'ho toccato.**

# Cosa fa adesso (`shared/trasloco.ts`, `main/trasloco.ts`)

- **Il fermo dice il PC.** `fermo.pc` indica quale PC non risponde. Nei traslochi di prima lo si ricava dal nome in testa al motivo (`pcFermo`).
- **Il motivo è scritto in chiaro.** `fermoChiaro` dice «"<nome scelto>" è spento o non si raggiunge da qui», cosa serve, le due scelte e «Niente si perde».
  - Il nome viene da `nomeDaMostrare` del battito.
  - Il PC lo aggiunge a ogni trasloco del pannello (`fermoChiaro`), così pagina e app non hanno logica propria.
- **«Aspetta quel PC»**: non fa niente, perché il trasloco riparte già da solo quando il PC torna (`riprovaDaSolo`).
- **«Vai avanti senza…»**, con conferma: azione `trasloco-senza`, rotta `/api/trasloco/senza`, `vaiAvantiSenza`.
  - Quel PC è segnato `senza` e il passo fermo riparte.
  - Per la raccolta si usa la sua copia già sul Drive.
  - Nel passo «Copie vecchie» quel PC, se è spento, diventa esito `dopo` e il trasloco finisce lo stesso.
  - Quando il PC torna, il giro (`sistemaDopo`) fa `/api/trasloco/togli`: quello che ha solo lui entra nei recuperati del residente e la sua copia va nel recupero di quel PC per 30 giorni.
- **Uguale su PC, pagina e app.** Sul PC è `TraslocoAvanzamento.tsx`, sulla pagina `pdTraslochiHtml` con `pdAspetta` e `pdSenza`, nell'app `PannelloDrive.kt` con `Api.traslocoSenza`.

# Trappola

Nella copia staccata dei dati veri il trasloco vero compare con «Aspetta / Vai avanti senza». **Non va confermato «Vai avanti senza»**: l'analisi e l'unione lavorerebbero sulle cartelle vere del disco.
