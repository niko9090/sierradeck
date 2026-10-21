/**
 * Il Client: una pagina sola, servita da SierraDeck.
 *
 * Niente da installare, niente APK, quindi niente avviso «questa app potrebbe
 * essere dannosa» — quello Android lo mette a ogni installazione fuori dal Play
 * Store e nessuna firma lo toglie. Si apre nel browser del telefono e si
 * aggiunge alla schermata iniziale: da lì ha icona, schermo intero e si comporta
 * come un'app, perché per chi la usa lo è.
 *
 * Tutto in un file, senza dipendenze: una pagina che deve funzionare su una rete
 * di casa mentre il computer sta lavorando non è il posto per un framework da
 * scaricare.
 *
 * Il disegno è pensato per il pollice: piastrelle grandi, poche cose per
 * schermata, e le due azioni che contano — rispondere a una domanda, mandare
 * due parole a una chat — raggiungibili senza cercare.
 */

import { FASI_CATALOGO } from '../shared/catalogo-progresso'
import { ansiInHtml } from '@shared/ansi-html'
import { avvisiDaMostrare, sceltaDaAnnunciare } from '@shared/avvisi-raggruppati'
import { ricomponiSchermo } from '@shared/ricomponi-schermo'
import { testoAvvio } from '@shared/sottofondo'
import {
  AIUTO_ELIMINA_WORKSPACE, PARTENZE, ULTIMO_WORKSPACE, rigaEliminato, confermaChiudi, confermaDormi, confermaEliminaAutopilota, confermaEliminaWorkspace, confermaSposta
} from '@shared/azioni-telefono'
import { REGOLE_PUBBLICAZIONE } from '@shared/harness'
import { normalizza as normalizzaImp, sezioniDi } from '@shared/impostazioni-struttura'
import { MENU_PRINCIPALE, MENU_TELEFONO, type IdTelefono } from '@shared/menu-principale'
import { apriSezioneAltro, indietroTelefono, linguettaDi, pannelliDelPosto, postoIniziale, scegliLinguetta, SEZIONI_ALTRO, toccaVoce, versoDestinazione } from '@shared/navigazione-telefono'
import { azioniMenuWorkspace, gruppiMenuWorkspace } from '@shared/menu-workspace'
import { FRASE_SVUOTA, motivoNonChiude, TESTI_AZIONI_CHAT } from '@shared/gestione-chat'
import { confermaArchiviaChat, confermaChiediSvuota, confermaChiudiChat, confermaEliminaChat, ORDINI_SPAZIO, SPIEGA_ELIMINA_DRIVE, SPIEGA_SVUOTA_DRIVE } from '@shared/gestione-chat-vista'
import { testoEsito } from '@shared/quaderno-personale'
import { ATTIVITA, ATTIVITA_ORDINE, COLORI, TITOLO_LEGENDA } from '@shared/colori-attivita'

/** I segni delle quattro voci nella fascia (0.83.0): si leggono anche in piccolo, mai emoji. */
const ICONE_TELEFONO: Record<IdTelefono, string> = { adesso: '◉', chat: '▭', progetti: '▦', altro: '☰' }

/** Il cristallo, per la scheda del browser e per la schermata Home. */
export const ICONA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<rect width="512" height="512" fill="#0b0c0e"/>' +
  '<path d="M268 92 L392 306 L268 306 Z" fill="#dfe3e7"/>' +
  '<path d="M268 92 L132 306 L268 306 Z" fill="#7d858d"/>' +
  '<path d="M132 306 L268 306 L200 412 Z" fill="#525a62"/>' +
  '<path d="M268 306 L392 306 L326 412 Z" fill="#363d44"/>' +
  '<path d="M200 412 L326 412 L268 306 Z" fill="#252b31"/>' +
  '<path d="M268 92 L312 168 L268 168 Z" fill="#54c07a"/>' +
  '</svg>'

export const MANIFESTO = {
  name: 'SierraDeck Client',
  short_name: 'SierraDeck',
  start_url: '/',
  display: 'standalone',
  background_color: '#0b0c0e',
  theme_color: '#0b0c0e',
  icons: [
    {
      // Il cristallo in SVG: nessun file da servire, nessuna dimensione da
      // sbagliare, e resta nitido su qualunque schermo.
      src: `data:image/svg+xml,${encodeURIComponent(ICONA_SVG)}`,
      sizes: 'any',
      type: 'image/svg+xml'
    }
  ]
}

/**
 * Il cristallo dentro la pagina, come immagine incorporata.
 *
 * Nella schermata del codice non c'era: si arrivava da un QR o da un link e la
 * prima cosa che si vedeva era un campo con sei puntini, senza un segno che
 * dicesse **dove si è finiti**. Un logo lì è la differenza fra «cos'è questa
 * pagina» e «ci sono».
 */
const LOGO =
  '<img alt="" width="56" height="56" style="margin-bottom:10px" ' +
  `src="data:image/svg+xml,${encodeURIComponent(ICONA_SVG)}">`

/**
 * La pagina si compone una volta (0.80.0): sono 400 KB fatti solo di costanti,
 * e si rimontavano a ogni apertura. Una sola stringa permette anche di tenere
 * pronta la sua versione compressa (vedi `rispondi` in client-server).
 */
let paginaPronta: string | undefined
export function paginaClient(): string {
  paginaPronta ??= componiPagina()
  return paginaPronta
}

function componiPagina(): string {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0c0e">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/favicon.ico">
<title>SierraDeck</title>
<style>
  /* I colori arrivano dal computer — sono gli stessi della console, con il
     chiarore e lo stile che hai scelto lì. Questi sono il ripiego per
     l'istante prima che la risposta arrivi: senza, la prima schermata sarebbe
     senza fondo. */
  :root {
    --fondo: #141517; --fondo-cupo: #0b0c0e; --chassis: #16181b;
    --chassis-alto: #23272b; --chassis-premuto: #1d2023; --bordo: #24272b;
    --luce-incisione: #2f3439; --testo: #dfe3e7; --testo-quieto: #9aa1a9;
    --verde: #54c07a; --ambra: #e0a33c; --rosso: #dc5f5f; --spento: #4a5058;
    --accento: #4aa3ff; --primario: #3a4046; --primario-alto: #4a5057;
    --incisione: #0e1013; --rilievo: inset 0 1px 0 rgba(255,255,255,.06);
    /* Le misure sono token, non numeri scritti a mano. Arrivavano dal computer
       e venivano buttate: il foglio di stile aveva i pixel a mano, e scegliere
       il Foglio sul computer non cambiava niente qui. Questi sono i valori del
       telefono - piu' grandi, perche' 10px a braccio teso non si leggono - e
       vestiti() li rimette sopra quelli del computer, sugli stessi nomi. */
    --t0: 0.75rem; --t1: 0.8125rem; --t2: 0.9375rem; --t3: 1.0625rem; --t4: 1.375rem;
    --s1: 6px; --s2: 12px; --s3: 18px; --s4: 28px;
    /* Il raggio arriva come arriva: l'identita' non si adatta. I 14px di prima
       erano la ragione singola per cui questa pagina sembrava un modulo web
       invece del banco, che ha --raggio 2px. */
    --raggio: 2px;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; background: var(--fondo-cupo); color: var(--testo);
    font: 100%/1.5 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  header {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; background: var(--fondo); border-bottom: 1px solid var(--bordo);
  }
  header b { font-size: 0.9375rem; letter-spacing: .04em; }
  header span { margin-left: auto; font-size: 0.75rem; color: var(--testo-quieto); }
  /* «minmax(0, 1fr)» e non «1fr»: in una griglia la colonna cresce fino al
     contenuto piu' largo, e basta una riga di terminale che non va a capo
     perche' **tutte** le piastrelle diventino piu' larghe dello schermo. Cosi'
     invece la colonna resta quella del telefono, e chi ha bisogno di piu'
     spazio scorre dentro di se'. */
  main { padding: var(--s3); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s2); }
  /* Lo spazio per la fascia: senza, l'ultima piastrella finisce **sotto** i
     tasti, ed e' proprio quella che si stava andando a leggere. */
  main.schermata { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
  /* La fascia: fissa, sempre visibile, mai nascosta dallo scorrimento. E' anche
     la fila dei LED — la navigazione **e'** il display di stato: sei dentro una
     chat e vedi lampeggiare in fondo che qualcuno ti aspetta. */
  .fascia {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
    /* Le quattro voci dell'app (0.83.0), quattro colonne: il nome sta su una
       riga, grande quanto il testo che il telefono ha scelto. */
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    background: var(--fondo); border-top: 1px solid var(--bordo);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .fascia__voce {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    min-height: 56px; border: 0; border-radius: 0; background: none; color: var(--testo-quieto);
  }
  .fascia__voce--qui { color: var(--testo); background: var(--chassis); }
  .fascia__voce--qui .fascia__icona { color: var(--accento); }
  /* Il pallino di una voce (0.83.0), come il Badge dell'app: il colore dalla
     tabella del PC (ambra aspetta te, rosso fermo), il numero in nero sopra. */
  .fascia__pallino {
    position: absolute; top: -6px; left: calc(100% + 2px); min-width: 18px; height: 18px; padding: 0 5px;
    border-radius: 9px; color: #000; font-size: 0.75rem; font-weight: 700; line-height: 18px; text-align: center;
  }
  .fascia__pallino:empty { min-width: 10px; width: 10px; height: 10px; padding: 0; top: -2px; }
  /* Le linguette in cima a Chat e Progetti (0.83.0): tasti alti 48 px. */
  .linguette { display: flex; gap: 4px; border-bottom: 1px solid var(--bordo); }
  .linguetta { flex: 1 1 0; min-height: 48px; border: 0; border-radius: 0; background: none; color: var(--testo-quieto); font-size: var(--t2); }
  .linguetta--qui { color: var(--testo); font-weight: 700; box-shadow: inset 0 -3px 0 var(--accento); }
  /* L'elenco di Altro (0.83.0): una voce per riga, alta almeno 48 px. */
  .cartella.voce-altro { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; width: 100%; min-height: 56px; text-align: left; }
  .voce-altro .sotto { margin: 0; }
  /* La Panoramica sul telefono (0.77.0): schede alte 96 px, 2 righe dal vivo. */
  .pan-tel { margin: 8px 0; }
  .pan-tel-riga { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .pan-tel-stato--verde { color: var(--verde); } .pan-tel-stato--ambra { color: var(--ambra); } .pan-tel-stato--rosso { color: var(--rosso); } .pan-tel-stato--blu { color: var(--blu); } .pan-tel-stato--quieto { color: var(--testo-quieto); }
  .pan-tel-banda { margin-top: 6px; padding: 6px 10px; border-radius: 6px; color: var(--ambra); border: 1px solid var(--ambra); }
  .pan-tel-scheda { display: flex; flex-direction: column; gap: 3px; width: 100%; min-height: 96px; margin-top: 8px; padding: 8px 10px; text-align: left; border: 1px solid var(--bordo, #2a2f3a); border-left: 4px solid var(--bordo, #2a2f3a); border-radius: 8px; background: var(--chassis); color: var(--testo); }
  .pan-tel-scheda--chiede { border-left-color: var(--ambra); }
  .pan-tel-scheda--lavora { border-left-color: var(--verde); }
  .pan-tel-scheda:disabled { opacity: 0.65; }
  .pan-tel-testa { display: flex; gap: 6px; align-items: baseline; overflow: hidden; white-space: nowrap; }
  .pan-tel-scheda--chiede .pan-tel-pallino { color: var(--ambra); } .pan-tel-scheda--lavora .pan-tel-pallino { color: var(--verde); }
  .segno-attivita { font-weight: 700; flex: none; } /* 0.82.0: il simbolo di cosa fa una chat, nel suo colore fisso */
  .pan-tel-azione { font-size: 0.8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pan-tel-righe { display: flex; flex-direction: column; font-family: var(--mono, monospace); font-size: 0.75rem; color: var(--testo-quieto); }
  .pan-tel-righe span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Panoramica 2 (0.78.0): situazione, adesso, piano a liste, chat, finite; tocchi da 48 px. */
  .pan-tel2 .serigrafia { margin-top: 12px; }
  /* Il riassunto accanto alla conversazione (0.79.0): una riga per chat al lavoro, tocchi da 48 px. */
  .pan-tel-aspettano { color: var(--ambra); }
  .pan-tel-al-lavoro { display: flex; gap: 8px; align-items: flex-start; width: 100%; min-height: 48px; margin-top: 6px; padding: 8px 10px; text-align: left; border: 1px solid var(--incisione); border-left: 3px solid var(--verde); border-radius: 8px; background: none; color: var(--testo); font: inherit; }
  .pan-tel-al-lavoro--chiede { border-left-color: var(--ambra); }
  .pan-tel-al-lavoro__testo { display: flex; flex-direction: column; min-width: 0; }
  .nota-ap.nota-ap--traguardo { font-size: 0.8125rem; color: var(--testo); border-left-color: var(--verde); }
  /* Il campo per scrivere all'autopilota resta in fondo allo schermo, sopra la fascia (0.79.0, con .ancorata). */
  .casella-ap { z-index: 2; }
  /* Compatto (prova dal vero del 18/10): alto 190 px copriva la fine della conversazione. */
  .casella-ap { border-top: 1px solid var(--bordo, #2a2f3a); }
  .casella-ap .riga { margin: 4px 0; }
  .casella-ap textarea { min-height: 52px; max-height: 30vh; }
  .casella-ap button { min-height: 48px; padding: 4px 12px; }
  .pan-tel-situazione { display: flex; flex-direction: column; gap: 4px; }
  .pan-tel-obiettivo { font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pan-tel-apri { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; margin-top: 4px; padding: 0 8px; text-align: left; background: none; border: 0; border-top: 1px solid var(--bordo, #2a2f3a); color: var(--testo); }
  .pan-tel-barra { display: inline-flex; gap: 2px; width: 90px; height: 6px; }
  .pan-tel-barra i { flex: 1; border-radius: 2px; background: var(--bordo, #2a2f3a); }
  .pan-tel-barra .pan-tel-pezzo--si { background: var(--verde); } .pan-tel-barra .pan-tel-pezzo--no { background: var(--ambra); }
  .pan-tel-criterio { display: flex; gap: 8px; padding: 6px 8px; }
  .pan-tel-criterio > span { display: flex; flex-direction: column; }
  .pan-tel-segno--si { color: var(--verde); } .pan-tel-segno--no { color: var(--ambra); } .pan-tel-segno--mai { color: var(--testo-quieto); }
  .pan-tel-compito { display: flex; flex-direction: column; gap: 2px; width: 100%; min-height: 48px; margin-top: 6px; padding: 8px 10px; text-align: left; border: 1px solid var(--bordo, #2a2f3a); border-radius: 8px; background: var(--chassis); color: var(--testo); }
  .pan-tel-compito--chiuso { color: var(--testo-quieto); }
  .pan-tel-compito__testo { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pan-tel-eventi .nota-ap { font-size: 0.75rem; }
  .fascia__nome { font-size: 0.8125rem; line-height: 1.15; letter-spacing: .02em; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; padding: 0 2px; }
  .fascia__icona { position: relative; font-size: 1.125rem; line-height: 1; }
  .fascia__icona .led { position: absolute; top: -3px; right: -9px; width: 7px; height: 7px; }
  .fascia .led { margin-right: 0; }
  /* Una destinazione senza niente da segnalare non porta un puntino grigio:
     porta il vuoto. Un LED spento acceso su tutto e' rumore. */
  .led.nessuno { background: transparent; box-shadow: none; }
  .led.rosso { background: var(--rosso); box-shadow: 0 0 6px color-mix(in srgb, var(--rosso) 70%, transparent); }
  .piastrella { min-width: 0; }
  /* Il Drive scollegato (0.56.3): una riga, mai sopra il contenuto, si chiude. */
  .drive-riga { display: flex; align-items: flex-start; gap: var(--s2); padding: 4px var(--s2); border-left: 3px solid var(--rosso); font-size: var(--t1); color: var(--testo); }
  .drive-riga .led { margin-top: 4px; flex: 0 0 auto; }
  .drive-riga__testo { flex: 1 1 auto; min-width: 0; line-height: 1.4; }
  .drive-riga summary { color: var(--testo-quieto); cursor: pointer; margin-top: 2px; }
  .drive-riga__chiudi { flex: 0 0 auto; min-width: 48px; min-height: 48px; background: none; border: 0; color: var(--testo-quieto); font-size: 1.125rem; }
  .piastrella {
    background: var(--chassis); border: 1px solid var(--bordo);
    border-radius: var(--raggio); padding: var(--s3);
  }
  .titolo { font-size: var(--t3); font-weight: 600; margin-bottom: var(--s1); }
  .sotto { font-size: var(--t1); color: var(--testo-quieto); }
  /* Il tasto «?» (0.62.0, decisione di Nicholas): a vista restano i tasti e i
     numeri; la spiegazione completa si apre sotto, a tutta larghezza, solo a
     chi la tocca. Resta aperta anche quando la pagina si ridisegna. */
  .aiuto {
    display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;
    width: 24px; height: 24px; min-width: 24px; min-height: 24px; padding: 0; margin-left: 6px;
    border-radius: 50%; font-size: var(--t1); font-weight: 700; line-height: 1;
    color: var(--testo-quieto); background: var(--chassis); border: 1px solid var(--luce-incisione);
    position: relative;
  }
  /* Il «?» resta piccolo da vedere ma si tocca su 48px (0.83.0). */
  .aiuto::after { content: ''; position: absolute; inset: -12px; }
  .aiuto--aperto { color: var(--testo); border-color: var(--testo-quieto); }
  .aiuto-testo {
    display: block; width: 100%; flex-basis: 100%; box-sizing: border-box; margin: 6px 0;
    padding: var(--s2) var(--s3); border-left: 3px solid var(--testo-quieto); border-radius: var(--raggio);
    background: var(--chassis-alto, var(--chassis)); color: var(--testo);
    font-size: var(--t1); font-weight: 400; line-height: 1.45; letter-spacing: normal; text-transform: none; text-align: left; white-space: normal;
  }
  .aiuto-testo p { margin: 0 0 6px; }
  .aiuto-testo p:last-child { margin-bottom: 0; }
  /* «N di M chat» (0.82.0): in cima agli autopiloti; ambra quando il PC è pieno. */
  .posti-chat { display: flex; flex-wrap: wrap; align-items: center; margin: 0 0 var(--s2); font-size: var(--t1); color: var(--testo-quieto); }
  .posti-chat--pieno .posti-chat__riga { color: var(--ambra); }
  /* La serigrafia: le lettere incise sotto i LED di un banco. E' la sola
     struttura di questa pagina, e non si usa da nessun'altra parte. */
  .serigrafia {
    font-size: var(--t0); letter-spacing: .12em; text-transform: uppercase;
    color: var(--testo-quieto);
  }
  /* Il solco al posto del bordo piatto: due pixel, scuro con un filo di luce
     sotto. E' quello che separa le cose sul banco. */
  .solco {
    height: 2px; margin: var(--s3) 0;
    background: linear-gradient(180deg, var(--incisione) 50%, var(--luce-incisione) 50%);
  }
  .barra { height: 5px; border-radius: 3px; background: var(--bordo); margin-top: 10px; overflow: hidden; }
  .barra > i { display: block; height: 100%; background: var(--verde); }
  .led { width: 9px; height: 9px; border-radius: 50%; display: inline-block; margin-right: 7px; }
  .lavoro { background: var(--verde); box-shadow: 0 0 5px color-mix(in srgb, var(--verde) 70%, transparent); }
  /* L'ambra **pulsa**, e pulsa qui: nell'elenco, dove si guarda da lontano. Il
     lampeggio esisteva solo dentro il dettaglio — cioe' mancava proprio dove
     serve. In tutto il programma significa una cosa sola: aspetta te. */
  .attesa { background: var(--ambra); box-shadow: 0 0 6px var(--ambra); animation: pulsa 1.6s ease-in-out infinite; }
  /* Un lavoro concluso non chiama l'attenzione come uno in corso: si spegne. */
  .finito { background: var(--spento); opacity: .6 }
  .fermo { background: var(--spento) }
  .led.ferma { background: var(--spento) }
  /* Una chat guidata da un autopilota: in moto, ma non per conto tuo. */
  .guidata { background: var(--accento); box-shadow: 0 0 5px color-mix(in srgb, var(--accento) 60%, transparent); }
  /* Una chat senza terminale acceso: il contorno, non il pieno. */
  .spenta { background: transparent; box-shadow: inset 0 0 0 1px var(--spento); }
  @keyframes pulsa { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
  @media (prefers-reduced-motion: reduce) { .attesa { animation: none } }
  /* ── La stessa pagina, aperta da un computer ────────────────────────────
     Il Client non e' solo per il telefono: si apre dal browser di un portatile
     sulla stessa rete, e li' una colonna larga quanto lo schermo con i tasti
     in fondo e' sbagliata due volte — le righe diventano illeggibili e il
     pollice non c'entra piu' niente.
     **La struttura non cambia**: quattro destinazioni, un livello di
     profondita', gli stessi token. Cambia dove sta la fascia — a sinistra,
     dove sta un menu quando c'e' un puntatore — e quanto e' larga la colonna
     del contenuto. Nessuna schermata nuova, nessun contenuto diverso: la
     stessa pagina, seduta invece che in piedi. */
  @media (min-width: 900px) {
    body { display: flex; }
    /* La fascia diventa una colonna: stesse voci, stessi LED, stesso ordine.
       Chi passa dal telefono al portatile ritrova le stesse quattro parole. */
    .fascia {
      position: sticky; top: 0; bottom: auto; left: 0; right: auto;
      width: 200px; height: 100vh; align-content: start;
      grid-template-columns: 1fr; border-top: 0; border-right: 1px solid var(--bordo);
      padding-bottom: 0;
    }
    .fascia__voce { flex-direction: row; justify-content: flex-start; gap: var(--s2); padding: 0 var(--s3); }
    /* Una riga di testo larga mezzo metro non si legge: la colonna si ferma
       dove finisce la lettura comoda, come sul telefono. */
    main.schermata { flex: 1; max-width: 760px; padding-bottom: var(--s4); }
    /* Il campo ancorato non ha piu' una fascia sotto da scavalcare. */
    .ancorata { bottom: 0; }
    /* Con il puntatore torna il sorvolo, che su un telefono non esiste. */
    .voce:hover, button:hover { border-color: var(--luce-incisione); background: var(--chassis-acceso, var(--chassis-alto)); }
  }

  /* Quando il computer non risponde. Non un avviso fra gli altri: cambia il
     significato di tutto quello che sta sotto, quindi sta sopra tutto. */
  .linea-pagina { margin: 6px 16px 0; font-size: 0.75rem; opacity: .8; cursor: pointer; letter-spacing: .5px; }
  .linea-pagina--giu { color: #dc5f5f; opacity: 1; }
  .linea-pagina--ambra { color: #e0a33c; }
  .schermata--giu .dentro, .schermata--giu .voce, .schermata--giu .piastrella:not(.linea-fascia) { opacity: .5; filter: grayscale(.6); }
  .scollegato {
    padding: var(--s2) var(--s3); border: 1px solid var(--rosso); border-radius: var(--raggio);
    background: color-mix(in srgb, var(--rosso) 12%, transparent); font-size: var(--t2);
  }
  .scollegato span { font-size: var(--t1); color: var(--testo-quieto); }
  /* Una domanda in attesa non e' una piastrella fra le altre: e' la
     schermata. Bordo ambra di due pixel, e il suo testo alla misura piu'
     grande della pagina. */
  .chiede { border-color: var(--ambra); border-width: 2px; }
  /* Un elenco e' un elenco: una riga densa per cosa, e chi vuole entrare
     entra. Prima ogni chat portava sempre sei comandi — trenta bersagli con
     sei chat aperte. */
  .voce {
    display: flex; align-items: center; gap: var(--s2); width: 100%; text-align: left;
    padding: var(--s2) var(--s3); min-height: 56px; background: var(--chassis);
    border: 1px solid var(--bordo); border-radius: var(--raggio);
  }
  .voce__testo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .voce__nome { font-size: var(--t3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .voce__sotto {
    font-size: var(--t1); color: var(--testo-quieto);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    /* Una riga sua (0.74.0): nella scheda dell'autopilota le due righe del
       «dal vivo» stavano attaccate («5 h 24 minsupervisore») e allargavano
       la pagina oltre lo schermo. */
    display: block; max-width: 100%;
  }
  .voce__altrove { font-size: .72em; opacity: .55; margin-left: 6px; white-space: nowrap; }
  /* La parola dello stato accanto al nome: si legge da lontano quanto il LED. */
  .voce__stato { font-size: var(--t0); letter-spacing: .06em; color: var(--testo-quieto); white-space: nowrap; }
  .voce__stato--attesa { color: var(--ambra); }
  .voce__stato--ferma { color: var(--testo-quieto); }
  .voce__stato--lavoro { color: var(--verde); }
  .voce__stato--guidata { color: var(--accento); }
  .voce__freccia { color: var(--testo-quieto); }
  /* Dentro qualcosa: una freccia sola in alto a sinistra, come si torna
     indietro dappertutto. */
  .testata-dentro { display: flex; align-items: center; gap: var(--s2); }
  .testata-dentro__nome { flex: 1; min-width: 0; font-size: var(--t3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .indietro, .altro {
    min-width: 48px; min-height: 48px; padding: 0; font-size: var(--t4);
    background: none; border: 0; box-shadow: none; color: var(--testo-quieto);
  }
  /* Il percorso e' un dettaglio, non un titolo: tagliato **da sinistra**,
     perche' la parte che distingue due cartelle sta in fondo. */
  .percorso {
    font-family: ui-monospace, Consolas, monospace; direction: rtl; text-align: left;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* Il terminale a tutta altezza: qui si legge, non si sbircia. */
  .dentro--alto { max-height: none; height: 58vh; }
  /* Il campo di risposta e' l'unico testo che si scrive da un telefono, e sta
     dove arriva il pollice. */
  /* 0.83.0 (c-509, Nicholas: «troppe info che occupano tutto lo schermo»): una
     riga riassuntiva; chiusa, sotto ci sono solo la conversazione e la casella. */
  .riassunto-ap { display: flex; width: 100%; min-height: 48px; align-items: center; gap: 8px; text-align: left; margin: 6px 0; }
  .riassunto-ap span { flex: 1; }
  .riassunto-ap b { color: var(--accento); font-weight: 600; white-space: nowrap; }
  .riassunto-ap--domande span { color: var(--ambra); }
  .riassunto-chiuso .solo-riassunto { display: none; }
  .ancorata {
    position: sticky; bottom: calc(60px + env(safe-area-inset-bottom));
    background: var(--fondo-cupo); padding: var(--s2) 0;
  }
  .grande { font-size: var(--t4); line-height: 1.35; margin: var(--s2) 0; }
  /* Un riquadro di scelta del terminale, reso toccabile.
     Un elenco disegnato con le cornici si legge benissimo e non si puo'
     premere: da un telefono non ci sono ne' frecce ne' invio. Qui ogni opzione
     diventa un bersaglio alto abbastanza per un pollice, e sta sopra al campo
     di testo perche' quando c'e' una scelta aperta e' quella la risposta. */
  .contesto { background: var(--fondo, #0b0c0e); border-radius: 8px; padding: 8px 10px; font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; margin: 8px 0; }
  .scelte {
    display: flex; flex-direction: column; gap: var(--s1);
    border: 2px solid var(--ambra); border-radius: var(--raggio);
    padding: var(--s2); margin-top: var(--s2); background: var(--chassis);
  }
  .scelta {
    display: flex; align-items: center; gap: var(--s2); width: 100%; text-align: left;
    min-height: 52px; padding: var(--s2) var(--s3); font-size: var(--t2);
  }
  /* Quella dove il cursore e' fermo adesso: e' anche quella che si prenderebbe
     premendo invio e basta, quindi si vede da lontano quale sarebbe. */
  .scelta--ora { border-color: var(--ambra); }
  .scelta__descr { display: block; font-size: var(--t1); color: var(--testo-quieto); margin-top: 2px; }
  .scelta__n {
    font-family: ui-monospace, Consolas, monospace; font-size: var(--t1);
    color: var(--testo-quieto); min-width: 1.4em;
  }
  /* Si e' fermato: rosso, e il LED **non** pulsa. Il lampeggio in tutto il
     programma significa una cosa sola — aspetta te — e «si e' fermato» non lo
     sta dicendo. */
  .si-e-fermato { border-color: var(--rosso); border-width: 2px; }
  .misura-riga {
    font-family: ui-monospace, Consolas, monospace; font-size: var(--t1);
    color: var(--spento); margin-top: var(--s1);
  }
  /* La calma. Il lavoro del disegno qui e' farti rimettere via il telefono in
     un secondo e mezzo: lo spazio vuoto **e'** il messaggio. */
  .calma { padding: var(--s4) 0; }
  .calma__grande { font-size: var(--t4); line-height: 1.4; }
  /* Il polso: una riga per cosa, non un cruscotto di numeri. */
  .riga-polso { display: flex; justify-content: space-between; margin-bottom: var(--s2); }
  .polso { display: flex; align-items: center; gap: var(--s2); padding: var(--s1) 0; font-size: var(--t2); }
  .polso__nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .polso__misura { font-family: ui-monospace, Consolas, monospace; font-size: var(--t1); color: var(--testo-quieto); }
  /* Quando domina una domanda, tutto il resto collassa qui dentro. */
  .riga-altro {
    width: 100%; text-align: left; background: none; border: 0; box-shadow: none;
    color: var(--testo-quieto); font-size: var(--t2); padding: var(--s2) 0; min-height: 48px;
  }
  /* Bersagli grandi: si usa in piedi, con una mano, e un tasto piccolo su un
     telefono e' un tasto che si sbaglia. */
  button, input, textarea, select {
    font: inherit; font-size: var(--t2); border-radius: var(--raggio);
    border: 1px solid var(--luce-incisione);
    background: var(--chassis-premuto); color: inherit; padding: var(--s2) var(--s3);
  }
  /* Un tasto che si sente. Su un telefono non c'e' hover: il rilievo e la
     pressione sono tutto il ritorno che si puo' dare, e senza non erano tasti
     - erano rettangoli con dentro una parola. */
  button {
    background: var(--chassis-alto); min-height: 48px;
    border-top-color: var(--chassis-acceso, var(--luce-incisione));
    box-shadow: var(--rilievo), 0 1px 0 var(--incisione);
  }
  button:active {
    background: var(--chassis-premuto); box-shadow: none; transform: translateY(1px);
  }
  button.primario {
    background: var(--primario, #3a4046); border-color: var(--primario-alto, #4a5057);
    color: var(--testo); font-weight: 600; width: 100%;
  }
  /* Il fuoco da tastiera: chi arriva con una tastiera collegata, o con
     l'accessibilita', deve sapere dov'e'. */
  button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible {
    outline: 2px solid var(--accento); outline-offset: 2px;
  }
  .riga { display: flex; gap: var(--s2); margin-top: var(--s2); }
  .riga > input, .riga > textarea { flex: 1; min-width: 0; }
  /* Un menu a tendina non allarga mai la pagina (0.71.1): con le voci lunghe di «Sposta su…» la pagina
     diventava larga 537 px su un telefono da 390, e il «?» e i tasti a destra finivano fuori schermo. */
  select { max-width: 100%; min-width: 0; }
  .ws { display: flex; gap: var(--s2); flex-wrap: wrap; }
  .ws button { padding: 10px 14px; min-height: 48px; }
  .ws button.attivo { border-color: var(--accento); color: var(--testo); }
  /* Il menu dei workspace (0.82.0): la ricerca in cima, i gruppi, «⋯» per riga.
     L'elenco ha un'altezza massima e scorre dentro: con 30 workspace la pagina non diventa lunghissima. */
  .ws-cerca { width: 100%; box-sizing: border-box; margin-top: var(--s2); }
  .ws-elenco { max-height: 60vh; overflow-y: auto; overscroll-behavior: contain; margin-top: var(--s2); }
  .ws-gruppo + .ws-gruppo { margin-top: var(--s2); }
  .ws-titolo { font-size: 0.75rem; letter-spacing: .06em; text-transform: uppercase; color: var(--testo-quieto); padding: 4px 2px; }
  .ws-riga { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--incisione); }
  .ws-riga.attivo { background: var(--chassis-premuto); border-radius: var(--raggio); }
  .ws-riga.attivo .ws-segno { color: var(--accento); }
  .ws-riga .ws-va, .ws-riga .ws-altro { border: 0; background: transparent; box-shadow: none; }
  .ws-riga .ws-va { flex: 1; min-width: 0; text-align: left; min-height: 48px; padding: 8px 10px; display: flex; gap: 8px; align-items: center; }
  .ws-riga .ws-segno { width: 14px; flex: none; }
  .ws-riga .ws-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ws-riga .ws-conta { margin-left: auto; font-size: 0.75rem; color: var(--testo-quieto); white-space: nowrap; }
  .ws-riga .ws-altro { min-width: 48px; min-height: 48px; padding: 0; font-size: 1.125rem; color: var(--testo-quieto); }
  .ws-riga .ws-altro[aria-expanded="true"] { color: var(--accento); }
  .ws-azioni { flex-wrap: wrap; margin: 0 0 var(--s2) 0; padding-left: 26px; }
  /* La cartella scelta per un lavoro: prima la classe c'era e la regola no. */
  .cartella.attivo { border-color: var(--accento); color: var(--testo); }
  .vuoto { color: var(--testo-quieto); text-align: center; padding: var(--s4) var(--s2); font-size: var(--t2); }
  .nota-chiusa { margin: var(--s2); padding: var(--s2); border-radius: 8px; background: var(--fondo-alto, rgba(127,127,127,.12)); font-size: var(--t2); }
  .ingresso { max-width: 380px; margin: 40px auto; padding: 0 18px; text-align: center; }
  .ingresso input { width: 100%; text-align: center; font-size: 1.625rem; letter-spacing: .3em; margin: 16px 0; }
  .errore { color: var(--ambra); font-size: var(--t1); margin-top: var(--s2); }
  /* Il negozio (0.53.0): una voce per riga, lo stato col colore che decide il computer. */
  .neg-voce { border-top: 1px solid var(--bordo); padding: 8px 0; }
  .neg-stato { display: inline-block; margin-left: 6px; padding: 0 6px; border: 1px solid; border-radius: 999px; font-size: var(--t0); font-weight: 600; }
  .neg-spiega { margin-top: 3px; line-height: 1.45; }
  .neg-prog { height: 4px; margin-top: 6px; border-radius: 999px; background: var(--chassis-alto); overflow: hidden; }
  .neg-prog span { display: block; width: 40%; height: 100%; background: var(--verde); animation: neg-scorre 1.1s ease-in-out infinite; }
  @keyframes neg-scorre { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
  .neg-conferma { border-left: 3px solid var(--ambra); padding: 4px 8px; margin-top: 6px; }
  .panoramica { background: #131518; }
  /* Un collegamento che sembra un tasto: l'attributo download fa partire il
     file invece di aprire una pagina, e da un telefono e' la differenza fra
     scaricare l'app e trovarsi davanti a un elenco di file da capire. */
  .tasto-link {
    display: inline-flex; align-items: center; justify-content: center;
    /* Largo quanto il suo testo, come tutti gli altri tasti: con flex: 1
       prendeva tutto lo spazio che il tasto accanto non voleva, e diventava
       una fascia azzurra larga quanto lo schermo. */
    flex: 0 1 auto; min-width: 0; min-height: 48px; padding: var(--s2) var(--s3);
    border-radius: var(--raggio);
    /* Niente riempimento di accento: il colore e' riservato allo stato. Un
       tasto pieno d'azzurro per scaricare un file diceva "urgente" a una cosa
       che non lo e', e toglieva forza all'ambra che significa "tocca a te". */
    background: var(--chassis-alto); border: 1px solid var(--luce-incisione);
    color: var(--testo); text-decoration: none;
    box-shadow: var(--rilievo), 0 1px 0 var(--incisione);
  }
  /* L'ultima riga del terminale: si guarda passando, quindi carattere fisso e
     una riga sola - se andasse a capo diventerebbe una lettura. */
  .battito {
    margin-top: var(--s2); padding: var(--s2); border-radius: var(--raggio); background: var(--fondo-cupo);
    font-family: ui-monospace, Consolas, monospace; font-size: var(--t1); color: var(--testo-quieto);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* Le ultime righe, quando si chiede di guardare dentro. Qui il testo va a
     capo davvero: non e' piu' un colpo d'occhio, e' la cosa che si sta
     leggendo per decidere se serve intervenire. */
  /* 0.52.6: il testo va a capo sulla larghezza del telefono, una riga per
     paragrafo; le griglie (tabelle, riquadri) restano allineate e scorrono. */
  .r-t { white-space: pre-wrap; word-break: break-word; padding-left: 2ch; text-indent: -2ch; }
  .r-v { height: 0.6em; }
  .r-g { white-space: pre; overflow-x: auto; word-break: normal; margin: 2px 0; }
  .dentro {
    margin-top: var(--s2); padding: var(--s2); border-radius: var(--raggio); background: var(--fondo-cupo);
    font-family: ui-monospace, Consolas, monospace; font-size: var(--t1); color: var(--testo);
    white-space: pre-wrap; word-break: break-word; max-height: 45vh; overflow-y: auto; margin-bottom: 0;
  }
  /* Le cartelle in cui aprire: bersagli larghi, uno per riga - si sceglie con
     il pollice, non con il mouse. */
  .cartella {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    width: 100%; text-align: left; margin-top: var(--s1); min-height: 56px;
  }
  .cartella__nome { font-size: var(--t2); }
  /* Il percorso tagliato da sinistra: «…\\progetti\\sierradeck» dice quello che
     serve, «C:\\Users\\nome\\Documents\\…» non dice niente. */
  .cartella__dove {
    font-family: ui-monospace, Consolas, monospace; font-size: var(--t0);
    color: var(--testo-quieto); direction: rtl; text-align: left;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* L'unico momento autoriale: il dettaglio entra da destra. Il cambio di
     scheda no, e niente si anima intorno al terminale. */
  .testata-dentro { animation: entra 180ms ease-out; }
  @keyframes entra { from { transform: translateX(12px); opacity: 0 } to { transform: none; opacity: 1 } }
  @media (prefers-reduced-motion: reduce) {
    .testata-dentro { animation: none }
    button:active { transform: none }
  }
  /* ── il pannello dell'autopilota, come al computer ── */

  .dettaglio { margin-top: 12px; border-top: 1px solid var(--bordo); padding-top: 12px; }

  /* I passaggi: gli stessi tre del pannello sul PC, con i loro LED. Da un
     telefono si guardano di sfuggita, quindi i nomi restano leggibili anche
     senza toccarli. */
  .passi { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .passo {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 0.75rem; letter-spacing: .09em; text-transform: uppercase;
    color: var(--testo-quieto);
  }
  .passo-led {
    width: 9px; height: 9px; border-radius: 50%; display: inline-block;
    background: var(--spento);
  }
  .passo-filo { width: 12px; height: 1px; background: var(--bordo); }
  .passo--davanti .passo-led { background: transparent; box-shadow: inset 0 0 0 1px var(--luce-incisione); }
  .passo--davanti { opacity: .55; }
  .passo--corrente .passo-led { background: var(--verde); box-shadow: 0 0 5px var(--verde); }
  .passo--attesa .passo-led { background: var(--ambra); box-shadow: 0 0 5px var(--ambra); animation: pulsa 1.6s ease-in-out infinite; }
  .passo--fermo .passo-led { background: var(--rosso); box-shadow: 0 0 5px var(--rosso); }
  .passo--corrente, .passo--attesa, .passo--fermo { color: var(--testo); }
  @keyframes pulsa { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }

  .nota { margin-top: 8px; }
  /* Le tue parole e le sue: distinte, perche' la differenza fra le due e' il
     dato piu' utile della scheda. */
  .tue-parole { color: var(--testo); font-size: var(--t2); }
  .sue-parole {
    padding-left: var(--s2); border-left: 2px solid var(--bordo);
    color: var(--testo-quieto);
  }
  .quando-criterio { color: var(--verde); font-size: var(--t0); }
  .prova-criterio {
    font-family: ui-monospace, Consolas, monospace; font-size: var(--t0);
    color: var(--testo-quieto); opacity: .8; padding-left: var(--s2);
  }

  /* La percentuale, con il colore di cio' che misura: i giri della
     preparazione non sono i criteri del lavoro. */
  .misura { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; }
  .misura b { font-size: 1.625rem; font-variant-numeric: tabular-nums; }
  .misura--preparazione b { color: var(--accento) }
  .misura--lavoro b { color: var(--verde) }
  .misura--attesa b { color: var(--ambra) }
  .misura--fermo b { color: var(--rosso) }

  .criteri { list-style: none; margin: 12px 0 0; padding: 0; font-size: 0.8125rem; color: var(--testo-quieto); }
  .criteri li { padding: 3px 0; }
  .criteri li.fatto { color: var(--verde); }

  .serigrafia { font-size: 0.75rem; letter-spacing: .12em; text-transform: uppercase; color: var(--testo-quieto); }
  /* Una riga fitta dentro un dettaglio (le decisioni). Prima si chiamava
     «.voce» come le righe degli elenchi, e scritta dopo le sovrascriveva: chat
     e autopiloti in elenco perdevano il margine e diventavano grigio chiaro. */
  .voce--riga { font-size: 0.75rem; color: var(--testo-quieto); padding: 4px 0; display: flex; gap: 8px; min-height: 0; background: none; border: 0; }
  /* Il dialogo con l'autopilota: le tue battute a destra, le sue a sinistra,
     come in ogni conversazione. */
  .battuta { display: flex; flex-direction: column; gap: 2px; max-width: 92%; margin: 6px 0; padding: 6px 10px; border-radius: 10px; font-size: 0.8125rem; color: var(--testo); white-space: pre-wrap; overflow-wrap: anywhere; }
  .battuta--tu { margin-left: auto; background: color-mix(in srgb, var(--accento) 12%, transparent); }
  .battuta--lui { margin-right: auto; background: color-mix(in srgb, var(--verde) 10%, transparent); }
  .battuta__chi, .battuta__esito { font-size: 0.75rem; color: var(--testo-quieto); }
  .adesso-ap { margin: 6px 0; padding: 6px 0; border-top: 1px solid var(--bordo); border-bottom: 1px solid var(--bordo); }
  .adesso-ap__riga { font-size: var(--t1); line-height: 1.35; overflow-wrap: anywhere; }
  .adesso-ap__compito { color: var(--testo-quieto); }
  .pensa { color: var(--ambra); }
  /* La chat con lui (0.29.0): in cima, scorre da sola e resta in fondo; le
     sue decisioni sono note quiete con il filo colorato a sinistra. */
  .flusso-ap { max-height: 56vh; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; padding-right: 2px; }
  .battuta--domanda, .battuta--pronto { border: 1px solid var(--ambra); background: color-mix(in srgb, var(--ambra) 10%, transparent); }
  .nota-ap { display: flex; gap: 8px; margin: 2px 0; padding-left: 8px; border-left: 2px solid var(--bordo); font-size: 0.75rem; color: var(--testo-quieto); }
  /* La linguetta «File» e il diff (0.38.0). */
  .file-ap { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .file-ap--scelto { border-color: var(--ambra); }
  .file-ap__nome { font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
  .file-ap__piu { color: var(--verde); }
  .file-ap__meno { color: var(--rosso); }
  .file-ap__stato--nuovo { color: var(--verde); }
  .file-ap__stato--cancellato { color: var(--rosso); }
  /* La linguetta «Istruzioni» (0.41.0). */
  .istr-ap { border: 1px solid var(--bordo); border-radius: 8px; padding: 6px 8px; margin-top: 8px; }
  .istr-ap summary { cursor: pointer; }
  .istr-ap__testo { margin-top: 6px; user-select: text; -webkit-user-select: text; overflow-wrap: anywhere; font-size: 0.8125rem; line-height: 1.45; }
  .istr-ap__esito { font-size: 0.75rem; padding: 0 6px; border-radius: 999px; border: 1px solid currentColor; }
  .istr-ap__esito--partita, .istr-ap__esito--consegnata { color: var(--verde); }
  .istr-ap__esito--in-coda { color: #e0a33c; }
  .istr-ap__esito--non-partita, .istr-ap__esito--persa { color: #dc5f5f; }
  .md-titolo { font-weight: 700; margin-top: 6px; }
  .md-voce { padding-left: 8px; }
  .md-vuota { height: 6px; }
  .md-blocco { background: rgba(127,127,127,.12); padding: 6px; overflow: auto; font-size: 0.75rem; }
  .diff-ap { margin: 6px 0 0; max-height: 60vh; overflow: auto; font-family: ui-monospace, Consolas, monospace; font-size: 0.75rem; }
  .diff-ap__riga { white-space: pre; padding: 0 4px; }
  .diff-ap__riga--piu { background: rgba(84, 192, 122, .18); }
  .diff-ap__riga--meno { background: rgba(220, 95, 95, .18); }
  .diff-ap__riga--blocco, .diff-ap__riga--testa { color: var(--spento); }
  .conto-domande { background: var(--ambra); color: #111; border-radius: 8px; padding: 0 5px; }
  /* Il testo di una domanda: sempre intero, con i suoi a capo (0.39.1). Se e'
     lungo scorre lui, non si taglia mai. */
  /* Una chat di un altro PC (0.39.3): il segno «SU <PC>», nel colore del remoto. */
  .segno-remoto { color: #a77bf3; font-weight: 700; }
  .domanda-ap { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 60vh; overflow-y: auto; overscroll-behavior: contain; }
  .nota-ap .quando { font-family: ui-monospace, Consolas, monospace; color: var(--spento); flex: 0 0 auto; }
  .nota-ap--decisione { border-left-color: var(--accento); }
  .nota-ap--correzione { border-left-color: var(--ambra); }
  .nota-ap--fine { border-left-color: var(--verde); color: var(--testo); }
  .nota-ap--fermo { border-left-color: var(--rosso); color: var(--testo); }
  .info-ap { margin-left: auto; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--bordo); border-radius: 50%; }
  /* Le linguette sotto la chat: una cosa per volta. */
  .linguette { display: flex; gap: 4px; margin-top: 12px; border-bottom: 1px solid var(--bordo); overflow-x: auto; }
  .linguetta { flex: 0 0 auto; background: transparent; border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 8px 10px; font-size: 0.75rem; color: var(--testo-quieto); min-height: 0; }
  .linguetta--attiva { color: var(--testo); border-bottom-color: var(--verde); }
  .linguetta small { color: var(--testo-quieto); font-size: 0.75rem; }
  .tab-ap { padding-top: 10px; }
  .compiti-ap { margin: 4px 0 0; padding-left: 18px; font-size: 0.8125rem; color: var(--testo); }
  .voce .quando { font-family: ui-monospace, Consolas, monospace; color: var(--spento); }

  /* Il tasto che sta per disfare qualcosa lo dice, per un attimo: il secondo
     tocco e' la conferma, e il colore e' quello di uno stato, non un ornamento. */
  button.pericolo { border-color: var(--rosso); color: var(--rosso); }
  .spunta { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: var(--testo-quieto); }
  .spunta input { width: 20px; height: 20px; }

  /* La gestione delle chat (0.79.0). */
  .gc-riga { flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .gc-tasto { display: inline-flex; align-items: center; gap: 2px; }
  .gc-voce { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--incisione, #2a2e33); }
  .gc-voce input { width: 20px; height: 20px; flex: 0 0 auto; margin-top: 2px; }
  .gc-voce__testo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
  .gc-no { font-size: var(--t1); color: var(--ambra); }
  .gc-rifiuti { margin: 6px 0 0; padding-left: 18px; font-size: var(--t1); color: var(--ambra); }
  .numeri { display: flex; gap: 6px; }
  .numero { flex: 1; text-align: center; }
  .numero b { display: block; font-size: 1.625rem; font-variant-numeric: tabular-nums; }
  .numero b.v { color: var(--verde) } .numero b.a { color: var(--ambra) }
  .numero span { font-size: 0.75rem; color: var(--testo-quieto); }
</style>
</head>
<body>
<div id="app"></div>
<script>
// L'interprete dei colori del terminale. Vive in un modulo suo, con i suoi
// test, e qui dentro ci arriva per intero: quello che gira nel telefono e'
// esattamente il codice che e' stato verificato.
${ansiInHtml.toString()}
${avvisiDaMostrare.toString()}
${sceltaDaAnnunciare.toString()}
// Il testo ricomposto per la larghezza del telefono (0.52.6): stesso codice
// del modulo condiviso, con i suoi test.
${ricomponiSchermo.toString()}
${testoAvvio.toString()}
// Le conferme, le partenze e le regole (0.55.0): gli stessi testi del PC e
// dell'app, da src/shared/azioni-telefono.ts. §N è il nome, §W il workspace.
var CONFERME = ${JSON.stringify({
  dormi: confermaDormi('§N'), chiudi: confermaChiudi('§N'), sposta: confermaSposta('§N', '§W'),
  eliminaWorkspace: confermaEliminaWorkspace('§N'), eliminaAutopilota: confermaEliminaAutopilota('§N')
})}
var PARTENZE = ${JSON.stringify(PARTENZE)}
// Il recupero dei workspace (0.81.0): il «?» e la riga sotto il nome, come sul PC e nell'app.
var AIUTO_ELIMINA_WS = ${JSON.stringify(AIUTO_ELIMINA_WORKSPACE)}
${rigaEliminato.toString()}
// Il menu dei workspace (0.82.0): i gruppi e le azioni dietro «⋯», gli stessi del PC (src/shared/menu-workspace.ts).
${gruppiMenuWorkspace.toString()}
${azioniMenuWorkspace.toString()}
var REGOLE = ${JSON.stringify(REGOLE_PUBBLICAZIONE)}
var ULTIMO_WORKSPACE = ${JSON.stringify(ULTIMO_WORKSPACE)}
// La gestione delle chat (0.79.0): i testi del PC, da src/shared/gestione-chat-vista.ts. §N è il nome, §B lo spazio.
var GC = ${JSON.stringify({
  testi: TESTI_AZIONI_CHAT, frase: FRASE_SVUOTA, ordini: ORDINI_SPAZIO, nonAperta: motivoNonChiude({ sessione: '', titolo: '§N' }), spiegaDrive: { elimina: SPIEGA_ELIMINA_DRIVE, svuota: SPIEGA_SVUOTA_DRIVE },
  conferme: {
    chiudi: confermaChiudiChat('§N'), archivia: confermaArchiviaChat('§N'), archiviaN: confermaArchiviaChat('§N', 2),
    elimina: confermaEliminaChat('§N', '§B', false), eliminaDrive: confermaEliminaChat('§N', '§B', true),
    eliminaN: confermaEliminaChat('§N', '§B', false, 2), eliminaDriveN: confermaEliminaChat('§N', '§B', true, 2),
    svuota: confermaChiediSvuota(false), svuotaDrive: confermaChiediSvuota(true)
  }
})}
// I colori fissi di cosa fa una chat (0.82.0), la stessa tabella del PC e dell'app: src/shared/colori-attivita.ts.
var ATT = ${JSON.stringify({ attivita: ATTIVITA, ordine: ATTIVITA_ORDINE, colori: COLORI, titolo: TITOLO_LEGENDA })}
function coloreNome(c) { return ATT.colori[c] || ATT.colori.quieto }
// Il simbolo di un'attività nel suo colore: mai il colore da solo (0.82.0).
function segnoAttivita(id) {
  var a = ATT.attivita[id]
  if (!a) return ''
  return '<span class="segno-attivita" style="color:' + coloreNome(a.colore) + '" title="' + esc(a.nome + ': ' + a.spiega) + '" aria-label="' + esc(a.nome) + '">' + a.icona + '</span>'
}
// «al lavoro» per i ruoli, altrimenti «aspetta te», «ferma», «finita»: come parolaStato del PC.
function parolaStatoAtt(id) {
  var a = ATT.attivita[id]
  if (!a) return ''
  return ['aspetta', 'ferma', 'finita'].indexOf(id) >= 0 ? a.parola : 'al lavoro'
}
// La legenda dei colori dietro «?».
function legendaAttivita(id) {
  return aiuto(id, '<b>' + esc(ATT.titolo) + '</b>' + ATT.ordine.map(function (k) {
    var a = ATT.attivita[k]
    return '<div><span style="color:' + coloreNome(a.colore) + '">' + a.icona + ' <b>' + esc(a.nome) + '</b></span> — ' + esc(a.spiega) + '</div>'
  }).join(''), ATT.titolo.toLowerCase())
}
// Il menu principale (0.61.0), lo stesso del PC e dell'app: src/shared/menu-principale.ts.
var MENU = ${JSON.stringify(MENU_PRINCIPALE.map((v) => ({ id: v.id, breve: v.breve, icona: v.icona, spiega: v.spiega })))}
// Le quattro voci del telefono (0.83.0), le stesse dell'app: MENU_TELEFONO in
// src/shared/menu-principale.ts; le regole di dove si va (e di «indietro»)
// sono quelle di src/shared/navigazione-telefono.ts, uguali a Navigazione.kt.
var VOCI = ${JSON.stringify(MENU_TELEFONO.map((v) => ({ id: v.id, nome: v.nome, linguette: v.linguette, icona: ICONE_TELEFONO[v.id], spiega: v.contiene.map((id) => MENU_PRINCIPALE.find((m) => m.id === id)?.nome ?? id).join(', ') })))}
var SEZIONI_ALTRO = ${JSON.stringify(SEZIONI_ALTRO)}
${postoIniziale.toString()}
${toccaVoce.toString()}
${scegliLinguetta.toString()}
${linguettaDi.toString()}
${apriSezioneAltro.toString()}
${indietroTelefono.toString()}
${versoDestinazione.toString()}
${pannelliDelPosto.toString()}
// Le sezioni e le voci delle impostazioni per la pagina (0.56.0), da src/shared/impostazioni-struttura.ts.
var IMPOSTAZIONI_PAGINA = ${JSON.stringify(sezioniDi('pagina').map((g) => ({ sezione: g.sezione, voci: g.voci.map((v) => ({ id: v.id, titolo: v.titolo, spiega: v.spiega, chiave: normalizzaImp([v.titolo, v.spiega, ...(v.parole ?? []), g.sezione.titolo].join(' ')) })) })))}
/** La ricerca: le sezioni con almeno una voce che contiene tutte le parole (senza accenti). Aspetto si cerca per titolo. */
function filtraImpostazioni(q) {
  const parole = q.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().split(/\\s+/).filter(Boolean)
  for (const el of document.querySelectorAll('[data-sezione]')) {
    const id = el.getAttribute('data-sezione')
    const g = IMPOSTAZIONI_PAGINA.find((x) => x.sezione.id === id)
    // Le voci di Altro (0.83.0) portano anche il loro titolo, senza accenti come le parole cercate.
    const proprie = (el.getAttribute('data-chiavi') || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    const chiavi = (g ? g.voci.map((v) => v.chiave) : id === 'aspetto' ? ['aspetto stile colore chiarore banco foglio tema'] : []).concat(proprie ? [proprie] : [])
    const vede = parole.length === 0 || chiavi.some((c) => parole.every((p) => c.indexOf(p) >= 0))
    el.style.display = vede ? '' : 'none'
  }
}
// Il tasto «?» (0.62.0): aiuto(id, testoHtml) disegna il tondino e, se è
// aperto, la spiegazione sotto. Lo stato sta in aiutiAperti, non nel DOM: la
// pagina si ridisegna di continuo, e un <details> si richiuderebbe da solo.
var aiutiAperti = {}
// di (0.81.0): di che cosa parla, per il lettore dello schermo, come il «?» del PC.
function aiuto(id, testoHtml, di) {
  const aperto = aiutiAperti[id] === true
  return '<button class="aiuto' + (aperto ? ' aiuto--aperto' : '') + '" data-aiuto="' + esc(id) + '" aria-expanded="' + aperto + '" aria-label="' + (di ? 'Spiegazione: ' + esc(di) : 'Spiegazione') + '" title="' + (di ? 'Cos’è «' + esc(di) + '»?' : 'Cos’è?') + '" onclick="commutaAiuto(this.dataset.aiuto)">?</button>' +
    (aperto ? '<div class="aiuto-testo" role="note">' + testoHtml + '</div>' : '')
}
window.commutaAiuto = (id) => { aiutiAperti[id] = aiutiAperti[id] !== true; pannello(ultimoStato) }
// Il microfono (0.75.0): il riconoscimento vocale del browser (Web Speech API),
// in italiano, con i risultati parziali dal vivo. Il testo va nel campo; lo
// manda sempre Nicholas. La pagina non registra e non salva l'audio.
var dettaturaAttiva = null
var notaDettatura = ''
function dettaturaDelBrowser() { return window.SpeechRecognition || window.webkitSpeechRecognition || null }
// Il testo nel campo: quello che c'era, poi il dettato finale, poi il parziale.
function testoDettatoJs(base, finale, parziale) {
  var pezzi = [base.replace(/\\s+$/, ''), (finale + ' ' + parziale).replace(/\\s+/g, ' ').trim()].filter(function (x) { return x !== '' })
  return pezzi.join(' ')
}
function micHtml(id) {
  var spiega = 'Tocca 🎤 e parla in italiano: il testo compare nel campo mentre parli. Tocca di nuovo per fermare. Non parte niente da solo: lo rileggi e premi tu il tasto per mandare. La pagina non registra e non salva l’audio: lo riconosce il browser del telefono, con le sue impostazioni.'
  if (!dettaturaDelBrowser()) return '<span class="sotto">🎤 il riconoscimento vocale non c’è in questo browser' + aiuto('mic-no', 'Questo browser non ha il riconoscimento vocale (Web Speech API). Su Android usa Chrome, oppure l’app SierraDeck, che ha il microfono. ' + spiega, 'dettatura non disponibile') + '</span>'
  var attivo = dettaturaAttiva && dettaturaAttiva.campo === id
  return '<button data-campo="' + esc(id) + '" onclick="detta(this.dataset.campo)" title="Detta con la voce" aria-label="Detta con il microfono">' + (attivo ? '■ ferma' : '🎤') + '</button>' +
    aiuto('mic-' + id, spiega, 'la dettatura con il microfono') + (notaDettatura && attivo === false && dettaturaUltimoCampo === id ? '<span class="sotto">' + esc(notaDettatura) + '</span>' : '')
}
var dettaturaUltimoCampo = ''
window.detta = function (id) {
  if (dettaturaAttiva) { var era = dettaturaAttiva.campo; dettaturaAttiva.r.stop(); if (era === id) return }
  var R = dettaturaDelBrowser()
  var campo = document.getElementById(id)
  if (!R || !campo) return
  var base = campo.value || ''
  var r = new R()
  r.lang = 'it-IT'
  r.interimResults = true
  r.continuous = true
  notaDettatura = ''
  dettaturaUltimoCampo = id
  r.onresult = function (e) {
    var fin = '', par = ''
    for (var i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' '; else par += e.results[i][0].transcript }
    // Il campo si ricerca ogni volta: la pagina si ridisegna e lo rifà.
    var c = document.getElementById(id)
    if (c) c.value = testoDettatoJs(base, fin, par)
  }
  r.onerror = function (e) {
    notaDettatura = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Il browser non ha il permesso del microfono: dallo nelle impostazioni del sito.' : e.error === 'no-speech' ? 'Non ho sentito niente: riprova.' : 'Dettatura interrotta (' + e.error + ').'
  }
  r.onend = function () { dettaturaAttiva = null; pannello(ultimoStato) }
  dettaturaAttiva = { r: r, campo: id }
  try { r.start() } catch (err) { dettaturaAttiva = null; notaDettatura = 'Il microfono non è partito: ' + err.message }
  pannello(ultimoStato)
}
// Lo storico degli errori (0.81.0). Gli errori di questa pagina vanno al PC,
// che li tiene nel suo storico con «pagina» come posto e toglie i segreti.
// La voce «Errori» delle impostazioni mostra lo storico del PC, con «Copia» e
// «Manda al PC di sviluppo» (il PC lo sceglie nelle sue Impostazioni).
var erroriDaMandare = []
function annotaErrore(testo) {
  if (!testo || testo.indexOf('(401)') >= 0) return
  var cosa = 'voce ' + posto.voce + (posto.sezione ? ' › ' + posto.sezione : '') + (dentro ? ', dentro una chat' : '')
  if (erroriDaMandare.length < 20) erroriDaMandare.push({ testo: String(testo).slice(0, 2600), cosa: cosa })
}
setInterval(function () {
  if (!chiave || erroriDaMandare.length === 0) return
  var errori = erroriDaMandare.splice(0, 20)
  chiedi('/api/errori/aggiungi', { dove: 'pagina', errori: errori }).catch(function () {
    // Il PC non risponde: si riprova al prossimo giro, senza superare i venti.
    erroriDaMandare = errori.concat(erroriDaMandare).slice(0, 20)
  })
}, 10000)
var erroriPc = null
var notaErrori = ''
window.leggiErrori = async () => {
  try { erroriPc = await chiedi('/api/errori', {}); notaErrori = '' }
  catch (e) { notaErrori = 'Lo storico non si legge adesso: ' + (e && e.message ? e.message : 'riprova') }
  pannello(ultimoStato)
}
window.copiaErrori = async () => {
  if (!erroriPc) return
  try { await navigator.clipboard.writeText(erroriPc.testo); notaErrori = 'Copiato: incollalo nella chat che deve correggerli.' }
  catch (e) { notaErrori = 'Non riesco a copiare da qui.' }
  pannello(ultimoStato)
}
window.mandaErrori = async () => {
  notaErrori = 'Mando…'
  pannello(ultimoStato)
  try { var e = await chiedi('/api/errori/manda', {}); notaErrori = e.messaggio }
  catch (err) { notaErrori = 'Non mandati: ' + (err && err.message ? err.message : 'il computer non ha risposto') }
  pannello(ultimoStato)
}
function oraErrore(iso) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  var due = function (n) { return (n < 10 ? '0' : '') + n }
  return due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' ' + due(d.getHours()) + ':' + due(d.getMinutes())
}
function sezioneErroriPagina() {
  var testa = '<div class="riga con-aiuto"><b>Errori</b>' + aiuto('errori', 'Gli errori del computer, del servizio degli autopiloti, di questa pagina e dell’app: quando, dove, cosa si stava facendo, il messaggio e il punto del codice. Gli stessi errori ripetuti sono una riga sola. Password, chiavi e gettoni sono tolti prima di salvare.', 'Errori') + '</div>'
  if (!erroriPc) return testa + '<div class="riga"><button onclick="leggiErrori()">Vedi gli errori</button></div>' + (notaErrori ? '<div class="sotto">' + esc(notaErrori) + '</div>' : '')
  var voci = erroriPc.voci || []
  var volte = voci.reduce(function (s, v) { return s + (v.volte || 1) }, 0)
  var conto = voci.length === 0 ? 'Nessun errore registrato' : voci.length + (voci.length === 1 ? ' errore, ' : ' errori diversi, ') + volte + (volte === 1 ? ' volta' : ' volte')
  var elenco = voci.slice(0, 5).map(function (v) {
    return '<div class="sotto">' + esc(oraErrore(v.ultima)) + (v.volte > 1 ? ' · ' + v.volte + ' volte' : '') + ' · ' + esc(v.messaggio) + '</div>'
  }).join('')
  var dove = erroriPc.pcSviluppo ? 'PC di sviluppo: ' + esc(erroriPc.pcSviluppo) : 'Il PC di sviluppo si sceglie sul computer, in Impostazioni → Errori.'
  return testa + '<div class="sotto">' + esc(conto) + '</div>' + elenco +
    '<div class="riga"><button onclick="leggiErrori()">Aggiorna</button><button onclick="copiaErrori()"' + (voci.length === 0 ? ' disabled' : '') + '>Copia</button>' +
    '<button onclick="mandaErrori()"' + (voci.length === 0 || !erroriPc.pcSviluppo ? ' disabled' : '') + '>Manda al PC di sviluppo</button>' +
    aiuto('errori-manda', 'Il computer manda lo storico al PC di sviluppo, firmato con la chiave di casa. Là arriva nella cartella di SierraDeck, in .sierradeck/errori-arrivati, che non va mai su GitHub.', 'Manda al PC di sviluppo') + '</div>' +
    '<div class="sotto">' + dove + '</div>' + (erroriPc.arrivi ? '<div class="sotto">' + esc(erroriPc.arrivi) + '</div>' : '') + (notaErrori ? '<div class="sotto">' + esc(notaErrori) + '</div>' : '')
}
/** «Copia i dettagli» (0.56.0): versioni e collegamento in un testo solo, per chiedere aiuto. Niente chiavi. */
window.copiaDettagli = async () => {
  const st = ultimoStato || {}
  const q = qualitaLinea(linea.misure)
  const righe = ['SierraDeck — dettagli per l’aiuto (pagina)', 'Computer: ' + ((st.computer && st.computer.nome) || 'non letto') + ', SierraDeck ' + ((st.computer && st.computer.versione) || 'versione non letta'),
    'Collegamento: ' + linea.fase + ', qualità ' + q.parola + (q.ritardoMs !== undefined ? ', ' + q.ritardoMs + ' ms' : ''), 'Browser: ' + navigator.userAgent]
  for (const e of linea.storia.slice(-8)) righe.push('  ' + rigaStoriaLinea(e))
  try { await navigator.clipboard.writeText(righe.join(String.fromCharCode(10))); notaGlobale = 'Dettagli copiati: incollali dove chiedi aiuto. Non ci sono chiavi né password.' }
  catch (e) { notaGlobale = 'Non riesco a copiare da qui: ' + righe.join(' · ') }
  pannello(ultimoStato)
}
function testoConferma(tipo, nome, ws) {
  var c = CONFERME[tipo]
  var metti = function (t) { return t.split('§N').join(nome || '').split('§W').join(ws || '') }
  return { titolo: metti(c.titolo), testo: metti(c.testo), azione: metti(c.azione) }
}

const CHIAVE = 'sierradeck.chiave'
let chiave = localStorage.getItem(CHIAVE) || ''
// Quella che l app si ricorda per questo indirizzo: e cio che permette di
// tornare su un computer gia accoppiato senza rifare niente.
if (!chiave) {
  try {
    chiave = (window.SierraDeckApp && window.SierraDeckApp.chiaveSalvata()) || ''
    if (chiave) localStorage.setItem(CHIAVE, chiave)
  } catch (e) { /* nel browser il ponte non c e, ed e normale */ }
}
const app = document.getElementById('app')
// Quello che si sta guardando adesso. Con var e non let: i tasti della pagina
// sono attributi onclick, e cercano i nomi su window.
var dentro = null
// Una chat chiusa da te sul computer mentre la guardavi da qui (0.60.9): lo si dice, una riga.
var notaChiusa = ''
/** «Apri cartella» (0.82.0): perché la cartella non si è aperta. */
var notaCartella = ''
var righeDentro = []
var cartelle = null
// Le stesse righe con i loro colori: si vestono qui, nel telefono.
var righeGrezze = []
// Le continuazioni di xterm e le colonne del PC (0.52.6): un PC vecchio non le manda.
var continuaDentro = null
var colonneDentro = 0
/*
 * Lo schermo della chat per il telefono (0.52.6): il testo unito e a capo
 * sulla larghezza di qui; tabelle, riquadri e colonne allineate in un blocco
 * a griglia, in monospazio, che scorre di lato invece di andare a capo.
 */
function schermoHtml(grezze, continua, colonne) {
  var righe = ricomponiSchermo({ grezze: grezze, continua: continua || undefined, colonne: colonne || undefined })
  var html = ''
  var griglia = []
  function chiudi() {
    if (griglia.length) html += '<div class="r-g">' + griglia.map(function (g) { return '<div>' + ansiInHtml(g) + '</div>' }).join('') + '</div>'
    griglia = []
  }
  righe.forEach(function (r) {
    if (r.tipo === 'griglia') { griglia.push(r.vestita); return }
    chiudi()
    html += r.tipo === 'vuota' ? '<div class="r-v"></div>' : '<div class="r-t">' + ansiInHtml(r.vestita) + '</div>'
  })
  chiudi()
  return html
}
// Le scelte che il terminale sta aspettando, quando ne aspetta: le riconosce il
// computer e le manda gia' pronte. Senza, dal telefono un riquadro di scelta e'
// una cosa che si legge e basta.
var scelteDentro = null
// La scelta appena mandata (le sue opzioni) e quando: se il computer la
// rimanda uguale entro pochi secondi, e' il terminale che non si e' ancora
// ridisegnato, non una domanda nuova. Rimostrarla invitava al secondo tocco.
var sceltaRisposta = null
var SCELTA_RISPOSTA_MS = 8000
function firmaScelte(s) { return s ? s.opzioni.map((o) => (o.spuntata ? '[x] ' : '') + o.testo).join('\\n') : '' }
/*
 * Un'opzione da toccare (0.52.5): il numero, la casella di una scelta
 * multipla, il testo e, piccola sotto, la spiegazione che Claude Code mette a
 * ogni opzione. «Type something.» dice di scrivere la risposta nel campo;
 * «Submit» manda le caselle spuntate.
 */
function etichettaOpzione(o) {
  var num = o.invio ? '↵' : String(o.numero)
  var casella = o.spuntata === true ? '☑ ' : o.spuntata === false ? '☐ ' : ''
  var testo = o.invio ? 'Manda le scelte spuntate (Submit)' : o.libera ? 'Rispondi con parole tue: scrivile nel campo qui sotto e mandale' : o.testo
  var sotto = o.libera ? 'arriva a Claude come risposta libera («' + o.testo + '»)' : (o.descrizione || '')
  return '<span class="scelta__n">' + esc(num) + '</span>' + esc(casella + testo) + (sotto ? '<small class="scelta__descr">' + esc(sotto) + '</small>' : '')
}
// Quando una scelta non c'e' piu': una riga, e sparisce da sola alla lettura
// dopo. Senza, il tocco andrebbe a vuoto in silenzio e sembrerebbe un guasto.
var notaScelta = null
/** L'autopilota che si sta guardando dentro, e tutto quello che si sa di lui. */
var dentroAp = null
/**
 * Gli autopiloti degli altri PC (0.59.0): l'elenco PC per PC
 * (\`/api/autopiloti/altri\`), e il PC dell'autopilota aperto. Con \`apPc\`
 * ogni chiamata della scheda passa dal ponte e arriva al PC dove gira.
 */
var apPc = null
var apPcNome = ''
var altriAp = null
var altriApLetto = 0
async function chiediAp(percorso, corpo) {
  if (!apPc) return chiedi(percorso, corpo)
  return chiedi('/api/ponte', { pc: apPc, percorso: percorso, corpo: corpo })
}
/**
 * Si vede sempre chi lavora (0.69.0): le parole le decide il PC («al lavoro ·
 * da 12 min», l'ultima azione, «nessun segno da 10 min»); qui si mostrano.
 */
/** I colori degli stati in una parola (0.70.0), come sul PC. */
const COLORE_VISTA = { verde: 'var(--verde,#3c9)', ambra: 'var(--ambra,#e0a33c)', rosso: 'var(--rosso,#dc5f5f)', blu: 'var(--blu,#4aa3ff)', quieto: 'var(--testo-quieto,#9aa1a9)' }
/**
 * Il riquadro «Adesso» (0.81.0, come sul PC): una riga per chat, cosa fa, da
 * quanto, e se è ferma perché. Le righe arrivano calcolate dal computer.
 */
function adessoHtml(x) {
  if (!x || !Array.isArray(x.righe) || (x.righe.length === 0 && !x.finite)) return ''
  var tinta = { ferma: 'var(--rosso,#dc5f5f)', aspetta: 'var(--ambra,#e0a33c)', pausa: 'var(--testo-quieto,#8b949e)', lavoro: 'var(--verde)' }
  return '<div class="adesso-ap"><div class="serigrafia">Adesso' + aiuto('ap-adesso', x.aiuto || '') + '</div>' +
    x.righe.map(function (r) {
      return '<div class="adesso-ap__riga"><b style="color:' + (tinta[r.tono] || 'inherit') + '">' + esc(r.chi) + '</b> ' +
        '<span class="adesso-ap__compito">' + esc(r.compito) + '</span> ' +
        '<span' + (r.tono === 'lavoro' ? '' : ' style="color:' + (tinta[r.tono] || 'inherit') + '"') + '>' + esc(r.testo) + '</span></div>'
    }).join('') +
    (x.finite ? '<div class="sotto">' + (x.finite === 1 ? '1 chat finita' : x.finite + ' chat finite') + '</div>' : '') + '</div>'
}
function dalVivoHtml(v, senzaStato) {
  if (!v || typeof v !== 'object') return ''
  // 0.82.0, come sul PC: sotto la situazione della Panoramica la parola dello stato c'è già,
  // qui resta una riga sola con l'ultima azione, da quanto e l'avviso ⚠.
  if (senzaStato) {
    if (!v.ultimaAzione && !v.senzaSegni) return ''
    return '<span class="voce__sotto" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(v.ultimaAzione || '') + (v.da ? ' · da ' + esc(v.da) : '') +
      (v.senzaSegni ? ' · <span style="color:var(--ambra,#e0a33c)">⚠ ' + esc(v.senzaSegni) + '</span>' : '') + '</span>'
  }
  // I colori di COLORE_DAL_VIVO (0.80.0): «fermo» rosso come sul PC e nell'app.
  var colore = v.etichetta === 'al lavoro' ? 'var(--verde)' : v.etichetta === 'aspetta te' ? 'var(--ambra,#e0a33c)' : v.etichetta === 'fermo' ? 'var(--rosso,#dc5f5f)' : 'var(--testo-quieto,#8b949e)'
  return '<span class="voce__sotto"><b style="color:' + colore + '">' + esc(v.etichetta || '') + '</b>' + (v.da ? ' · da ' + esc(v.da) : '') +
    (v.senzaSegni ? ' · <span style="color:var(--ambra,#e0a33c)">⚠ ' + esc(v.senzaSegni) + '</span>' : '') + '</span>' +
    (v.ultimaAzione ? '<span class="voce__sotto" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(v.ultimaAzione) + '</span>' : '')
}
/**
 * I messaggi verso la chat (0.72.1, come \`messaggiCompatti\` sul PC): una
 * spunta ✓ per ogni messaggio arrivato (l'ora e il testo toccandola), un
 * puntino per quello in consegna, e una riga sola, solo se qualcosa è fermo:
 * «in attesa da N min» con «Manda adesso».
 */
function messaggiCompattiJs(m) {
  var segni = []
  var inAttesa = m.filter(function (x) { return x.stato === 'in attesa' })
  m.slice().reverse().forEach(function (x) {
    if (x.stato === 'consegnato' || x.stato === 'in consegna') segni.push({ id: x.id, tipo: x.stato, titolo: (x.dettaglio || '') + ': ' + (x.testo || '') })
  })
  var primo = inAttesa[0]
  return { segni: segni, fermo: primo ? { dettaglio: primo.dettaglio || '', quanti: inAttesa.length, testo: primo.testo || '', mandaAdesso: inAttesa.some(function (x) { return x.mandaAdesso }) } : null }
}
function messaggiApHtml(m) {
  if (!Array.isArray(m) || m.length === 0) return ''
  var c = messaggiCompattiJs(m)
  return '<div class="titolo-sezione" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">Messaggi per la chat' + aiuto('ap-messaggi', 'Ogni ✓ è un messaggio tuo o dell’autopilota arrivato alla chat: toccalo per l’ora e il testo. Entrano alla fine del turno; se aspettano più di due minuti se ne scrive uno anche durante il turno, mai più di uno: gli altri partono alla fine, uniti. Se uno è fermo compare la sua riga con «Manda adesso».') +
    c.segni.map(function (s) {
      return '<span class="segno-msg" title="' + esc(s.titolo) + '" onclick="notaGlobale=this.title;aggiorna()" style="cursor:pointer;color:' + (s.tipo === 'consegnato' ? 'var(--verde)' : 'var(--testo-quieto,#8b949e)') + '">' + (s.tipo === 'consegnato' ? '✓' : '⋯') + '</span>'
    }).join('') + '</div>' +
    (c.fermo ? '<div class="sotto" style="display:flex;gap:8px;align-items:baseline"><span style="color:var(--ambra,#e0a33c);white-space:nowrap">' + esc(c.fermo.dettaglio) + (c.fermo.quanti > 1 ? ' · ' + c.fermo.quanti + ' messaggi' : '') + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.fermo.testo) + '</span>' +
      (c.fermo.mandaAdesso ? '<button onclick="mandaAdessoAp()">Manda adesso</button>' : '') + '</div>' : '')
}
window.mandaAdessoAp = async () => {
  if (!dentroAp) return
  try {
    const r = await chiediAp('/api/autopilota/manda-adesso', { autopilota: dentroAp })
    // Già un messaggio in questo turno (PC 0.72.0): il PC dice perché non manda.
    if (r && r.mandate === 0 && r.messaggio) notaGlobale = r.messaggio
  } catch (e) { /* lo dice lo stato al giro dopo */ }
  await leggiAp()
}

function altriApHtml() {
  if (altriAp === null) return '<div class="sotto" style="margin-top:8px">Chiedo agli altri PC i loro autopiloti…</div>'
  if (altriAp.length === 0) return ''
  return '<div class="titolo-sezione" style="margin-top:12px">Su altri PC' + aiuto('ap-altri', 'Gli autopiloti che girano sugli altri PC della tua stessa chiave di casa: lavorano là, con i file di là. Da qui li guardi e li governi; ogni azione va al PC dove girano.') + '</div>' +
    // Un PC che non risponde: una riga sola, il perché dietro il «?» (0.70.0).
    altriAp.map((p) => (p.errore ? '<div class="sotto" style="margin-top:6px;color:var(--ambra,#e0a33c)">● ' + esc(p.nome) + ' · non risponde' + aiuto('ap-muto-' + p.pcId, esc(p.errore)) + '</div>' : '') +
      (p.autopiloti || []).map((a) =>
        '<button class="voce" onclick="guardaAp(\\'' + escJs(a.id) + '\\', \\'' + escJs(p.pcId) + '\\', \\'' + escJs(p.nome) + '\\')">' +
          '<span class="led ' + led(a) + '"></span>' +
          '<span class="voce__testo"><span class="voce__nome">' + esc(a.nome) + '</span>' +
          // 0.73.0: le stesse parole delle righe di questo PC (la vista calcolata là); le vecchie solo per un PC che non la manda.
          (a.vista
            ? '<span class="voce__sotto"><b style="color:' + COLORE_VISTA[a.vista.stato.colore] + '">' + esc(a.vista.stato.parola) + '</b>' + (a.vista.da ? ' · da ' + esc(a.vista.da) : '') + ' · criteri ' + esc(a.vista.criteri.testo) + ' · gira su ' + esc(p.nome) + '</span>' + (a.vista.ultima ? '<span class="voce__sotto">' + esc(a.vista.ultima) + '</span>' : '')
            : '<span class="voce__sotto">gira su ' + esc(p.nome) + ' · ' + esc(a.strategia ? 'bloccato, provo: ' + a.strategia : (a.motivo || a.stato)) + (a.criteri !== undefined ? ' · ' + a.fatti + '/' + a.criteri : '') + '</span>' + dalVivoHtml(a.dalVivo)) + '</span>' +
          '<span class="voce__freccia">›</span></button>').join('')).join('')
}
var apDettaglio = null
/** Quale linguetta e' aperta sotto la chat con l'autopilota. */
var apTab = 'obiettivo'
/** Dove si era prima che una domanda portasse alla linguetta «Domande» (0.38.0). */
var apTabPrima = 'obiettivo'
/** La riga riassuntiva dell'autopilota (0.83.0): chiusa, sotto solo la conversazione. */
var apRiassunto = false
/** Quale domanda si guarda (una per volta) e quali si sono gia' viste. */
var apDomandaI = 0
var apDomandeViste = null
/** La linguetta «File» (0.38.0): l'elenco, il file scelto e il suo diff. */
var apFile = null
/** La linguetta «Istruzioni» (0.41.0): le consegne alle sue chat, intere; quale si corregge. */
var apIstr = null
var apIstrCorreggi = null
var notaIstrAp = ''
var apFileScelto = null
var apDiff = null
var notaDomandaAp = ''
/** Cosa e' successo all'ultimo messaggio mandato all'autopilota, se non e' partito. */
var notaDialogo = ''
/** Il pannello aperto in fondo: le conversazioni, gli altri computer, le code, il Drive, i consumi, le impostazioni, il quaderno, o niente. */
var pannelloAperto = null
/** Le azioni della Salute che il telefono sa fare; le altre si fanno dal computer. */
const AZIONI_DAL_TELEFONO = ['scarica-a-mano', 'installa', 'apri-autopilota', 'riprova-pc']
/** I nomi delle azioni da fare dal computer, una volta sola ciascuno (0.81.0). */
function azioniSoloDalComputer(voci) {
  const nomi = []
  for (const v of voci) for (const a of (v.azioni || [])) if (AZIONI_DAL_TELEFONO.indexOf(a.id) < 0 && nomi.indexOf(a.testo) < 0) nomi.push(a.testo)
  return nomi
}
/** «Salute del sistema» (0.44.0): letta dal computer quando si apre. */
var saluteVista = null
var saluteErrore = ''
var sessioniViste = null
// Le chat senza nome (0.60.0): fuori dall'elenco, contate; la casella le rimette.
var sessioniNascoste = 0
var sessioniSenzaNome = false
async function leggiSessioni() {
  try {
    const r = await chiedi('/api/sessioni', sessioniSenzaNome ? { senzaNome: true } : undefined)
    sessioniViste = (r && r.sessioni) || []
    sessioniNascoste = (r && r.nascoste) || 0
  } catch (e) { sessioniViste = []; notaGlobale = 'Non riesco a leggere le conversazioni: ' + (e && e.message ? e.message : 'il computer non risponde') }
}
window.mostraSenzaNome = async () => { sessioniSenzaNome = !sessioniSenzaNome; await leggiSessioni(); pannello(ultimoStato) }
/**
 * Scrivere a una chat chiusa su un altro PC (0.58.4): quel PC la avvia in
 * sottofondo, senza finestre, e il testo parte appena è pronta. Qui: quale
 * conversazione, lo stato e l'eventuale errore con Riprova.
 */
var sfScelta = -1
var sfStato = null
var sfGiro = null
/** La coda condivisa aperta dal telefono: quale progetto, e le sue voci. */
var codaProgetto = null
var codaVoci = null
var codaErrore = ''
/** Gli altri PC sul Drive, e la cassetta di quello aperto. */
var pcVisti = null
var pcAperto = null
var postaVoci = null
var postaErrore = ''
/** Il Drive: il catalogo letto dal computer, la vista, il lavoro in corso. */
var driveCatalogo = null
var driveVista = 'progetti'
var driveErrore = ''
var driveLavoro = null
var driveAperti = {}
var driveInCorso = null
var driveEraInCorso = false
var driveRiavviato = false
var driveLeggo = false
var driveProgresso = null
var driveLetturaTimer = null
// Le fasi della lettura del Drive, le stesse della finestra sul PC.
var FASI_CATALOGO = ${JSON.stringify(FASI_CATALOGO)}
var consumiVisti = null
var schedeViste = null
// Account e Drive del computer (0.70.0): la catena delle quattro tessere, decisa dal PC.
var accountVisto = null
// Il tag scelto nel Quaderno (0.70.0); la ricerca nasconde le righe senza ridisegnare.
var quadernoTag = ''
var quadernoQ = ''
var schedaAperta = null
var prefViste = null
var aggiornamentoVisto = null
/** Le note della finestra di «Installa»: null chiusa, { leggo: true } mentre arrivano. */
var noteAgg = null
// Il modulo per affidare un lavoro: aperto o no, e quale cartella e' scelta.
var delegando = false
var delegaCartella = -1
// L'ultimo stato ricevuto: serve a ridisegnare subito quando si apre o si
// chiude qualcosa, senza aspettare il prossimo giro da due secondi.
var ultimoStato = { chat: [], autopiloti: [], domande: [] }
// La scheda «Domande»: l'elenco arriva da /api/domande, letto solo mentre la
// scheda e' aperta (ogni due secondi) e al primo ingresso.
var domandeViste = null
var domandeGuasto = null
var domandeMandate = {}
// Le stesse domande come conversazioni a messaggi (0.36.0), composte dal
// computer con la funzione del PC e dell'app. Null con un computer vecchio:
// allora si mostra la vista di prima.
var domandeConversazioni = null
var domandaAperta = null
async function leggiDomande() {
  try {
    var d = await chiedi('/api/domande')
    domandeViste = (d && d.voci) || []
    domandeConversazioni = (d && Array.isArray(d.conversazioni)) ? d.conversazioni : null
    domandeGuasto = (d && d.errore) ? String(d.errore) : null
  } catch (e) {
    domandeGuasto = 'Non riesco a leggere le domande: ' + (e && e.message ? e.message : 'il computer non risponde') + '. Se il computer è più vecchio della 0.30, va aggiornato.'
  }
  pannello(ultimoStato)
}
function chiaveVoce(v) {
  return v.tipo === 'autopilota' ? 'd:' + v.id : v.tipo === 'scelta' ? 's:' + v.chat + ':' + v.opzioni.map(function (o) { return o.testo }).join('|') : 'c:' + v.chat
}
function vistaDomande(s) {
  if (domandeGuasto && !domandeViste) return '<div class="piastrella"><div class="errore">' + esc(domandeGuasto) + '</div></div>'
  if (!domandeViste) return '<div class="vuoto">Leggo dal computer\u2026</div>'
  var vive = {}
  domandeViste.forEach(function (v) { vive[chiaveVoce(v)] = true })
  Object.keys(domandeMandate).forEach(function (k) { if (!vive[k]) delete domandeMandate[k] })
  if (domandeViste.length === 0) {
    return '<div class="piastrella"><div class="grande">Niente da rispondere' + aiuto('domande-vuote', 'Qui compaiono, senza bloccare niente: le domande che un autopilota ti fa prima di partire o mentre lavora; le scelte che una chat aspetta (un permesso, \u00abvuoi procedere?\u00bb, un elenco numerato); e le chat che hanno finito e aspettano una tua istruzione. Ogni voce ha dentro il modo di rispondere e sparisce da sola quando il computer riceve la risposta.') + '</div></div>'
  }
  var contesto = function (righe) {
    return righe && righe.length ? '<pre class="contesto">' + righe.map(esc).join(String.fromCharCode(10)) + '</pre>' : ''
  }
  var chiedono = domandeViste.filter(function (v) { return v.tipo !== 'chat' })
  var ferme = domandeViste.filter(function (v) { return v.tipo === 'chat' })
  var html = chiedono.map(function (v) {
    var k = chiaveVoce(v)
    var mandata = domandeMandate[k]
    if (v.tipo === 'autopilota') {
      return '<div class="piastrella chiede"><div class="serigrafia"><span class="led attesa"></span>' +
        esc('\u00ab' + v.autopilota + '\u00bb ti chiede' + (v.origine === 'intervista' ? ', prima di partire' : '')) + '</div>' +
        '<div class="grande">' + esc(v.testo) + '</div>' +
        (mandata ? '<div class="sotto">Mandata: \u00ab' + esc(mandata) + '\u00bb. Sparisce appena il computer la riceve.</div>'
          : '<div class="riga"><textarea id="r-' + esc(v.id) + '" rows="3" placeholder="la tua risposta"></textarea></div>' +
            '<div class="riga"><button class="primario" data-id="' + esc(v.id) + '" onclick="rispondiVoce(this.dataset.id)">Rispondi</button></div>') +
        '</div>'
    }
    return '<div class="piastrella chiede"><div class="serigrafia"><span class="led attesa"></span>' + esc('\u00ab' + (v.titolo || v.cwd) + '\u00bb aspetta che tu scelga') + '</div>' +
      '<div class="sotto">' + esc(v.cwd) + '</div>' + contesto(v.righe) +
      (mandata ? '<div class="sotto">Scelta mandata: \u00ab' + esc(mandata) + '\u00bb. Sparisce appena lo schermo cambia.</div>'
        : '<div class="scelte">' + v.opzioni.map(function (o) {
            return '<button class="' + (o.scelta ? 'scelta scelta--ora' : 'scelta') + '" data-chat="' + esc(v.chat) + '" data-testo="' + esc(o.testo) + '" onclick="scegliIn(this.dataset.chat, this.dataset.testo)">' + etichettaOpzione(o) + '</button>'
          }).join('') + '</div>' +
          '<div class="riga"><textarea id="t-' + esc(v.chat) + '" rows="2" placeholder="oppure scrivile qualcosa"></textarea></div>' +
          '<div class="riga"><button data-chat="' + esc(v.chat) + '" onclick="scriviIn(this.dataset.chat)">Manda</button></div>') +
      '</div>'
  }).join('')
  if (ferme.length) {
    html += '<div class="serigrafia">CHAT CHE HANNO FINITO E ASPETTANO TE</div><div class="sotto">Non sono domande: hanno chiuso il turno e aspettano la prossima istruzione.</div>' +
      ferme.map(function (v) {
        var mandata = domandeMandate[chiaveVoce(v)]
        return '<div class="piastrella"><div class="grande">' + esc('\u00ab' + (v.titolo || v.cwd) + '\u00bb ha finito') + '</div><div class="sotto">' + esc(v.cwd) + '</div>' + contesto(v.righe) +
          (mandata ? '<div class="sotto">Mandato: \u00ab' + esc(mandata) + '\u00bb.</div>'
            : '<div class="riga"><textarea id="t-' + esc(v.chat) + '" rows="2" placeholder="scrivi alla chat"></textarea></div>' +
              '<div class="riga"><button data-chat="' + esc(v.chat) + '" onclick="scriviIn(this.dataset.chat)">Manda</button></div>') +
          '</div>'
      }).join('')
  }
  return html
}
/**
 * Come si risponde a una conversazione: la stessa regola di
 * \`richiestaRisposta\` in \`shared/domande-conversazioni.ts\` (un test le confronta).
 */
/**
 * Ore e minuti di un istante ISO, gia' scappati, nell'ora del telefono
 * (0.79.0): gli istanti arrivano in UTC («…Z») e tagliarli dava le 09:10 dove
 * il PC dice 11:10.
 */
function oraDi(iso) {
  const d = new Date(String(iso || ''))
  if (isNaN(d.getTime())) return esc(String(iso || '').slice(11, 16))
  return esc(d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))
}

function richiestaDi(r, testo) {
  if (r.via === 'rispondi') return { percorso: '/api/rispondi', corpo: { domanda: r.domanda, risposta: testo } }
  if (r.via === 'dialogo') return { percorso: '/api/autopilota/dialogo', corpo: { autopilota: r.autopilota, testo: testo } }
  return { percorso: '/api/scrivi', corpo: { chat: r.chat, testo: testo } }
}

/**
 * Una domanda essenziale (0.72.1, \`scheda\` calcolata dal PC): chi chiede in
 * piccolo, la domanda in una frase, le scelte come tasti (la consigliata con
 * ★), il campo «Scrivi tu», e il resto dietro il «?». Nessuna cronologia.
 * \`tasto(c)\` fa il tasto di una scelta; \`campo\` il campo e il tasto per mandare.
 */
function schedaDomandaHtml(s, k, tasto, campo) {
  var dettagli = (s.dettagli || []).map(function (d) {
    return '<div class="serigrafia" style="margin-top:6px">' + esc(d.etichetta) + '</div><div style="white-space:pre-wrap">' + esc(d.testo) + '</div>'
  }).join('')
  return '<div class="sotto" style="display:flex;gap:6px;align-items:center">' + esc(s.chi) +
      (s.poi ? ' · poi ' + (s.poi === 1 ? 'un’altra' : 'altre ' + s.poi) : '') + (dettagli ? aiuto('sd-' + k, dettagli) : '') + '</div>' +
    '<div class="grande domanda-ap" style="font-weight:600">' + esc(s.domanda) + '</div>' +
    (s.risposta ? '<div class="sotto" style="color:var(--verde)">risposta dall’autopilota: ' + esc(s.risposta) + '</div>' : '') +
    ((s.scelte || []).length ? '<div class="scelte">' + s.scelte.map(tasto).join('') + '</div>' : '') +
    '<div class="riga"><textarea id="' + campo.id + '" rows="2" placeholder="' + esc(s.segnaposto || 'Scrivi tu') + '"></textarea></div>' +
    '<div class="riga"><button class="primario" ' + campo.attributi + '>' + esc(campo.etichetta) + '</button>' + micHtml(campo.id) + '</div>'
}
/**
 * La domanda breve (0.76.0), la stessa regola del PC e dell'app
 * (\`domandaBreve\` in src/shared/domande-conversazioni.ts): al massimo 200
 * caratteri e 4 scelte («Scrivi tu» non conta), niente di tagliato.
 */
function domandaBreveJs(c) {
  var s = c && c.scheda
  if (!c || !c.chiede || !s || s.risposta) return false
  var scelte = (s.scelte || []).filter(function (x) { return !x.libera }).length
  var dettagli = (s.dettagli || []).reduce(function (n, d) { return n + String(d.testo || '').length }, 0)
  return String(s.domanda).length <= 200 && String(s.domanda).slice(-1) !== '…' && scelte <= 4 && dettagli <= 1500
}
/** La domanda breve della chat aperta, in cima alla chat: tasti e «Scrivi tu» (0.76.0). */
function domandaALatoHtml(idChat) {
  var conv = (domandeConversazioni || []).find(function (c) { return c.chiave === 'chat:' + idChat })
  if (!domandaBreveJs(conv)) return ''
  var mandata = domandeMandate[conv.chiave]
  return '<div class="piastrella chiede domanda-a-lato">' +
    schedaDomandaHtml(conv.scheda, conv.chiave, function (c) {
      return c.libera
        ? '<button class="scelta" onclick="document.getElementById(\\'conv-testo\\').focus()">' + etichettaScelta(c) + '</button>'
        : conv.scelte
          ? '<button class="scelta' + (c.consigliata ? ' scelta--ora' : '') + '" data-chat="' + esc(conv.scelte.chat) + '" data-testo="' + esc(c.testo) + '" onclick="scegliIn(this.dataset.chat, this.dataset.testo)">' + etichettaScelta(c) + '</button>'
          : '<button class="scelta' + (c.consigliata ? ' scelta--ora' : '') + '" data-k="' + esc(conv.chiave) + '" data-testo="' + esc(c.testo) + '" onclick="rispondiOpzione(this.dataset.k, this.dataset.testo)">' + etichettaScelta(c) + '</button>'
    }, { id: 'conv-testo', attributi: 'data-k="' + esc(conv.chiave) + '" onclick="rispondiConv(this.dataset.k)"', etichetta: conv.risposta.via === 'rispondi' ? 'Rispondi' : 'Manda' }) +
    (mandata ? '<div class="sotto">mandato: «' + esc(mandata) + '», aspetto il computer</div>' : '') +
    '</div>'
}
function etichettaScelta(c) {
  return (c.spuntata === true ? '☑ ' : c.spuntata === false ? '☐ ' : '') + (c.consigliata ? '★ ' : '') + esc(c.testo)
}

/**
 * La scheda Domande come conversazioni (0.36.0): a sinistra (o sopra, sul
 * telefono) chi ti scrive, sotto la conversazione aperta. Con un autopilota si
 * parla con lui; con una chat che aspetta, e' lei a scrivere la domanda o il
 * permesso, con le opzioni da toccare.
 */
// «Aspettano te» di partenza (0.70.0): le chat che hanno solo finito il turno stanno in «Tutte».
var domandeFiltro = 'aspettano'
var saluteGruppo = ''
var saluteMappa = false
window.gruppoSalute = function (g) { saluteGruppo = g; pannello(ultimoStato) }
window.mappaSalute = function () { saluteMappa = !saluteMappa; pannello(ultimoStato) }
window.filtroDomande = function (f) { domandeFiltro = f; pannello(ultimoStato) }
function vistaConversazioni() {
  function aspettaTeConv(c) { return c.vista ? c.vista.id !== 'finito' : (c.chiede || c.tipo === 'autopilota') }
  var filtro = typeof domandeFiltro === 'string' ? domandeFiltro : 'aspettano'
  var tutte = domandeConversazioni || []
  // 0.73.1: nel numero solo chi aspetta davvero; le risposte già date dall'autopilota no.
  var nAspettano = tutte.filter(function (c) { return c.vista ? (c.vista.id !== 'finito' && c.vista.id !== 'risposta') : c.chiede }).length
  var elenco = filtro === 'aspettano' ? tutte.filter(aspettaTeConv) : tutte
  var filtri = tutte.length === 0 ? '' : '<div class="riga" style="gap:6px;flex-wrap:wrap">' +
    '<button' + (filtro === 'aspettano' ? ' class="primario"' : '') + ' onclick="filtroDomande(\\'aspettano\\')" style="flex:none;width:auto;min-height:48px;padding:6px 12px">Aspettano te ' + nAspettano + '</button>' +
    '<button' + (filtro === 'tutte' ? ' class="primario"' : '') + ' onclick="filtroDomande(\\'tutte\\')" style="flex:none;width:auto;min-height:48px;padding:6px 12px">Tutte ' + tutte.length + '</button></div>'
  if (elenco.length === 0 && tutte.length > 0) {
    return filtri + '<div class="piastrella"><div class="sotto">Niente ti aspetta. Le chat che hanno finito il turno sono in «Tutte».</div></div>'
  }
  if (elenco.length === 0) {
    return '<div class="piastrella"><div class="grande">Niente da rispondere' + aiuto('domande-vuote', 'Qui compaiono, come conversazioni e senza bloccare niente: gli autopiloti che ti chiedono qualcosa (prima di partire o mentre lavorano) — ci parli come nella loro scheda; le chat che aspettano una scelta o un permesso — scrivono qui la domanda con le opzioni da toccare; e le chat che hanno finito il turno e aspettano la tua istruzione. La stessa cosa che vedi sul PC e nell’app.') + '</div></div>'
  }
  var aperta = elenco.find(function (c) { return c.chiave === domandaAperta }) || elenco[0]
  var voci = elenco.map(function (c) {
    return '<button class="voce" data-k="' + esc(c.chiave) + '" onclick="apriConv(this.dataset.k)"' + (c.chiave === aperta.chiave ? ' aria-current="true"' : '') + '>' +
      '<span class="led ' + (c.chiede ? 'attesa' : 'spenta') + '"></span>' +
      '<span class="voce__testo"><span class="voce__nome">' + (c.suPc ? '<b class="segno-remoto">SU ' + esc(c.suPc) + (c.viaPc ? ' (' + esc(c.viaPc) + ')' : '') + '</b> · ' : '') + esc(c.nome || c.titolo) + '</span>' +
      // Il tipo in una parola (0.70.0), deciso dal PC: permesso, scelta, domanda, autopilota, ha finito.
      '<span class="voce__sotto">' + (c.vista ? '<b style="color:' + ({ verde: 'var(--verde,#3c9)', ambra: 'var(--ambra,#e0a33c)', rosso: 'var(--rosso,#dc5f5f)', blu: 'var(--blu,#4aa3ff)', quieto: 'var(--testo-quieto,#9aa1a9)' })[c.vista.colore] + '">' + esc(c.vista.parola) + '</b>' + (c.tipo === 'autopilota' && c.chiede ? ' · ti aspetta (' + (c.quante || 1) + ') → apri' : '') : (c.tipo === 'autopilota' ? 'ti aspetta (' + (c.quante || 1) + ') → apri' : c.chiede ? 'chat · aspetta che tu scelga' : 'chat · ha finito il turno')) + '</span></span>' +
      '<span class="voce__freccia">›</span></button>'
  }).join('')
  var messaggi = aperta.messaggi.map(function (m) {
    if (m.da === 'nota') return '<div class="nota-ap"><span class="quando">' + oraDi(m.quando) + '</span><span>' + esc(m.testo) + '</span></div>'
    // Le opzioni: di una chat si scelgono nell'elenco del terminale; di un
    // autopilota (domande iniziali, «Pubblico adesso?») toccarne una e'
    // rispondere con quel testo.
    var opzioni = (m.opzioni && m.opzioni.length)
      ? '<div class="scelte">' + m.opzioni.map(function (o) {
          return aperta.scelte
            ? '<button class="scelta' + (o.scelta ? ' scelta--ora' : '') + '" data-chat="' + esc(aperta.scelte.chat) + '" data-testo="' + esc(o.testo) + '" onclick="scegliIn(this.dataset.chat, this.dataset.testo)">' + etichettaOpzione(o) + '</button>'
            : '<button class="scelta" data-k="' + esc(aperta.chiave) + '" data-testo="' + esc(o.testo) + '" onclick="rispondiOpzione(this.dataset.k, this.dataset.testo)">' + etichettaOpzione(o) + '</button>'
        }).join('') + '</div>'
      : ''
    return '<div class="battuta battuta--' + (m.da === 'tu' ? 'tu' : 'lui') + (m.tono === 'domanda' ? ' battuta--domanda' : '') + '">' +
      '<span class="battuta__chi">' + (m.da === 'tu' ? 'tu' : esc(aperta.titolo)) + (m.quando ? ' · ' + oraDi(m.quando) : '') + '</span>' +
      '<span>' + esc(m.testo) + '</span>' + opzioni + '</div>'
  }).join('')
  // Le domande di un autopilota non si rispondono qui (0.38.0): si rispondono
  // nella sua scheda, linguetta «Domande», una per volta.
  // Una risposta data dall'autopilota (0.71.1) si legge qui, con la domanda: non aspetta te.
  if (aperta.tipo === 'autopilota' && aperta.autopilota && aperta.chiede) {
    return filtri + '<div class="piastrella">' + voci + '</div>' +
      '<div class="piastrella chiede"><div class="serigrafia">' + esc(aperta.titolo) + '</div>' +
      '<div class="sotto">Ti aspetta con ' + ((aperta.quante || 1) === 1 ? 'una domanda' : (aperta.quante + ' domande')) + '.' + aiuto('domande-ap', 'Le domande di un autopilota si rispondono nella sua scheda, linguetta «Domande», una per volta, con le opzioni da toccare; dopo la risposta domanda e risposta restano nella chat con lui.') + '</div>' +
      '<div class="riga"><button class="primario" data-ap="' + esc(aperta.autopilota) + '" onclick="apriDomandeAp(this.dataset.ap)">Apri la sua linguetta Domande</button></div></div>'
  }
  var mandata = domandeMandate[aperta.chiave]
  // 0.72.1: la domanda essenziale, senza la conversazione intorno.
  if (aperta.scheda) {
    return filtri + '<div class="piastrella">' + voci + '</div>' +
      '<div class="piastrella' + (aperta.chiede ? ' chiede' : '') + '">' +
      schedaDomandaHtml(aperta.scheda, aperta.chiave, function (c) {
        return c.libera
          ? '<button class="scelta" onclick="document.getElementById(\\'conv-testo\\').focus()">' + etichettaScelta(c) + '</button>'
          : aperta.scelte
            ? '<button class="scelta' + (c.consigliata ? ' scelta--ora' : '') + '" data-chat="' + esc(aperta.scelte.chat) + '" data-testo="' + esc(c.testo) + '" onclick="scegliIn(this.dataset.chat, this.dataset.testo)">' + etichettaScelta(c) + '</button>'
            : '<button class="scelta' + (c.consigliata ? ' scelta--ora' : '') + '" data-k="' + esc(aperta.chiave) + '" data-testo="' + esc(c.testo) + '" onclick="rispondiOpzione(this.dataset.k, this.dataset.testo)">' + etichettaScelta(c) + '</button>'
      }, { id: 'conv-testo', attributi: 'data-k="' + esc(aperta.chiave) + '" onclick="rispondiConv(this.dataset.k)"', etichetta: aperta.risposta.via === 'rispondi' ? 'Rispondi' : 'Manda' }) +
      (mandata ? '<div class="sotto">mandato: «' + esc(mandata) + '», aspetto il computer</div>' : '') +
      '</div>'
  }
  return filtri + '<div class="piastrella">' + voci + '</div>' +
    '<div class="piastrella' + (aperta.chiede ? ' chiede' : '') + '">' +
    '<div class="serigrafia">' + esc(aperta.titolo) + '</div><div class="sotto">' + esc(aperta.sotto) + '</div>' +
    '<div class="flusso-ap">' + messaggi +
    (mandata ? '<div class="battuta battuta--tu"><span class="battuta__chi">tu · mandato, aspetto il computer</span><span>' + esc(mandata) + '</span></div>' : '') +
    '</div>' +
    '<div class="riga"><textarea id="conv-testo" rows="3" placeholder="' + esc(aperta.segnaposto) + '"></textarea></div>' +
    '<div class="riga"><button class="primario" data-k="' + esc(aperta.chiave) + '" onclick="rispondiConv(this.dataset.k)">' + (aperta.risposta.via === 'rispondi' ? 'Rispondi' : 'Manda') + '</button>' + micHtml('conv-testo') + '</div>' +
    '<div class="sotto">' + (aperta.risposta.via === 'rispondi' ? 'La risposta arriva subito alla chat ferma.' : 'Arriva nella chat come se l’avessi scritto lì.') + '</div>' +
    '</div>'
}

/**
 * Quando il computer ha risposto l'ultima volta, e da quanti giri non risponde.
 *
 * Senza questi due numeri la pagina puo' **mentire**: se il computer va in
 * sospensione o cade il wi-fi, il catch non faceva niente e restavi a guardare
 * LED verdi di mezz'ora prima. Un LED verde su dati vecchi e' peggio di nessun
 * LED: e' la differenza fra uno strumento e una fotografia.
 */
var ultimoContatto = 0
var giriFalliti = 0
/**
 * L'impronta dell'ultimo disegno.
 *
 * La pagina si rifaceva **tutta** ogni due secondi, anche quando non era
 * cambiato niente: lo scorrimento di una chat tornava a zero due volte al
 * secondo, e leggere l'output dal telefono era materialmente impossibile.
 */
var ultimaImpronta = ''
/**
 * Dove sei: adesso, chat, lavori, computer.
 *
 * La barra in basso non era il problema — **quella** barra lo era: un riquadro
 * di bottoni alla fine di uno scorrimento infinito, che apriva i suoi pannelli
 * ancora piu' sotto. In basso e' il posto giusto, e' dove arriva il pollice.
 * La cura e' una fascia fissa, non una fascia in meno.
 */
// Dove si è (0.83.0): la voce, la linguetta di ogni voce, la sezione di Altro.
// Si parte da Adesso: in cima le domande che aspettano te, sotto gli autopiloti.
var posto = postoIniziale()
/** Si vede adesso quello che prima era la destinazione «nome» delle sette voci? */
function inVista(nome) {
  if (nome === 'domande' || nome === 'autopiloti') return posto.voce === 'adesso'
  if (nome === 'chat') return posto.voce === 'chat'
  if (nome === 'progetti') return posto.voce === 'progetti' && linguettaDi(posto) === 0
  if (nome === 'file') return posto.voce === 'progetti' && linguettaDi(posto) === 1
  if (nome === 'salute') return posto.voce === 'altro' && posto.sezione === 'salute'
  if (nome === 'impostazioni') return posto.voce === 'altro' && SEZIONI_ALTRO.some((x) => x.impostazioni && x.id === posto.sezione)
  return false
}
/** Un pannello è aperto: a mano, o perché la linguetta (o la sezione) in cui sei lo mostra. */
function aperto(nome) { return pannelloAperto === nome || pannelliDelPosto(posto).indexOf(nome) >= 0 }
/**
 * La chat di cui e' aperto il menu «altro».
 *
 * Rinominare e chiudere una chat si fanno una volta nella vita: tenerne i
 * comandi sempre a schermo, accanto al battito del terminale, voleva dire sei
 * bersagli per chat — trenta con sei chat aperte.
 */
var altroAperto = null
/** Il tasto che sta chiedendo conferma, se ce n'e' uno. */
const esc = (t) => String(t == null ? '' : t).replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))
// Per un valore che finisce dentro una stringa JS a apici singoli, dentro un
// attributo HTML a doppi apici: gli onclick di questa pagina, tipo
// onclick="vaiA('...')". Sono due contesti annidati e servono due fughe. Solo
// esc non basta: HTML-scappare l'apice non protegge, perche' il browser decodifica
// l'attributo PRIMA che il JS lo legga, e l'apice torna apice — cioe' il valore
// torna a essere codice. Era la radice dell'XSS via nome workspace (un dispositivo
// accoppiato piantava un nome col payload, e al clic girava nell'origine della
// pagina, con la chiave a portata). Qui prima la fuga JS — barra e apice, o il
// valore esce dalla stringa — poi quella HTML di esc, per non uscire
// dall'attributo. La barra si prende da fromCharCode(92) per non scriverne
// nessuna nel sorgente: questa pagina vive dentro un template JavaScript, dove una
// barra letterale verrebbe mangiata e la fuga arriverebbe rotta al browser.
const escJs = (t) => { const b = String.fromCharCode(92); return esc(String(t == null ? '' : t).split(b).join(b + b).split("'").join(b + "'")) }

// Quanti 401 di fila prima di buttare la chiave: uno solo era «un colpo e
// via», e un rifiuto transitorio (il computer che riparte con i dispositivi
// non ancora letti) faceva ricominciare l'accoppiamento. L'app fa lo stesso.
var RIFIUTI_PER_ARRENDERSI = 5
var rifiuti401 = 0
var chiaveRifiutataIl = 0
/**
 * Perché non si collega (0.75.1), come l'app: il motivo probabile e il
 * rimedio. La pagina non vede la VPN del telefono, quindi due casi: il PC
 * risponde ma rifiuta la chiave, oppure non risponde nessuno (con cosa si è
 * provato). Pura, per i test.
 */
function motivoNonCollegoJs(chiaveRifiutata, host) {
  if (chiaveRifiutata) return {
    titolo: 'Il PC risponde ma non riconosce questo telefono',
    rimedio: 'Riprova: se continua, ricollega il telefono.',
    dettagli: 'Il computer c’è e risponde, ma rifiuta la chiave di questo telefono (401 o 403): il telefono è stato tolto dal computer, o il computer è stato reinstallato. Per ricollegarlo: sul computer apri Impostazioni → Client e accoppia di nuovo con il codice.'
  }
  var tailscale = /^100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\./.test(host || '')
  return {
    titolo: 'Nessun PC risponde',
    rimedio: tailscale ? 'Controlla che Tailscale sia acceso sul telefono e sul PC.' : 'Controlla che il PC sia acceso con SierraDeck aperto.',
    dettagli: 'Ho provato: ' + (tailscale ? 'Tailscale ' : 'questo indirizzo ') + (host || '?') + ', senza risposta. ' +
      (tailscale
        ? 'È un indirizzo Tailscale: serve Tailscale acceso sul telefono e sul PC, con lo stesso account. '
        : 'Se è un indirizzo di casa (192.168…), fuori casa non si raggiunge: usa l’indirizzo Tailscale (100.x) del PC. ') +
      'Altrimenti il PC è spento o in sospensione, SierraDeck è chiuso, o il firewall di Windows blocca la porta.'
  }
}

async function chiedi(percorso, corpo) {
  const t0 = Date.now()
  const r = await fetch(percorso, {
    method: corpo ? 'POST' : 'GET',
    headers: chiave ? { 'x-sierradeck-chiave': chiave, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  })
  // La chiave rifiutata (0.75.1): 401, o 403 sullo stato. Il filo rosso lo dice.
  if (r.status === 401 || (r.status === 403 && percorso === '/api/stato')) chiaveRifiutataIl = Date.now()
  else if (r.ok && percorso === '/api/stato') chiaveRifiutataIl = 0
  if (r.status === 401) {
    rifiuti401 += 1
    if (rifiuti401 >= RIFIUTI_PER_ARRENDERSI) { chiave = ''; localStorage.removeItem(CHIAVE); ingresso('Questo dispositivo non è più riconosciuto.') }
    throw new Error('il computer non riconosce questo dispositivo (401)')
  }
  rifiuti401 = 0
  // Ogni risposta del computer è un segno di vita (0.56.0): la storia della
  // chat, lo scrivere, i file. Lo stato lo conta già il giro di «aggiorna».
  if (percorso !== '/api/stato' && typeof linea !== 'undefined' && linea.fase !== 'cerco') {
    linea = passoLinea(linea, { tipo: 'ok', il: Date.now(), ritardoMs: Date.now() - t0 })
  }
  // Un 4xx o 5xx non e' una risposta: prima tornava come oggetto e i tasti
  // procedevano come se fosse andata (il modulo «Affida» si chiudeva, il
  // campo del nome si svuotava). Il 409 no: e' una risposta con un motivo,
  // che le scelte e il Drive leggono da soli.
  if (!r.ok && r.status !== 409) {
    let motivo = ''
    let corpoErr = {}
    try { corpoErr = (await r.json()) || {}; motivo = corpoErr.errore || '' } catch (e) { motivo = '' }
    const err = new Error(motivo || ('il computer ha risposto ' + r.status))
    err.stato = r.status
    err.corpo = corpoErr
    throw err
  }
  return r.json()
}

// Un tasto che fallisce lo dice in cima alla pagina, invece di tacere.
var notaGlobale = ''
window.chiudiNota = () => { notaGlobale = ''; pannello(ultimoStato) }
window.addEventListener('unhandledrejection', (ev) => {
  const e = ev && ev.reason
  const testo = e && e.message ? e.message : String(e || 'errore')
  // Anche nello storico degli errori del PC (0.81.0); il 401 no.
  annotaErrore(testo + (e && e.stack ? String.fromCharCode(10) + e.stack : ''))
  // Il 401 ha la sua strada (dopo cinque di fila si torna al codice): non e'
  // «Non sono riuscito». Il confronto era con '401' esatto, che non arriva mai.
  if (testo.indexOf('(401)') >= 0) return
  notaGlobale = 'Non sono riuscito: ' + testo
  try { pannello(ultimoStato) } catch (err) { }
})

function ingresso(messaggio) {
  app.innerHTML = \`
    <div class="ingresso">
      ${LOGO}
      <div style="font-size:1.1875rem;margin-bottom:6px">SierraDeck</div>
      <div class="sotto">Sul computer apri <b>Impostazioni → Client</b> e leggi il codice.</div>
      <input id="codice" inputmode="numeric" maxlength="6" placeholder="······" aria-label="codice">
      <input id="nome" placeholder="nome di questo dispositivo" style="font-size:0.9375rem;letter-spacing:normal">
      <button class="primario" id="entra" style="margin-top:12px">Collega</button>
      <div class="errore" id="errore">\${esc(messaggio || '')}</div>
    </div>\`
  document.getElementById('entra').onclick = async () => {
    const codice = document.getElementById('codice').value.trim()
    const nome = document.getElementById('nome').value.trim() || 'telefono'
    const r = await fetch('/api/accoppia', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codice, nome })
    })
    const dati = await r.json()
    if (!dati.chiave) { document.getElementById('errore').textContent = 'Codice non valido o scaduto.'; return }
    chiave = dati.chiave
    localStorage.setItem(CHIAVE, chiave)
    // E la sa anche l app, che la conserva per questo indirizzo: reinstallare
    // o cambiare rete non deve costare di nuovo sei cifre.
    try { window.SierraDeckApp && window.SierraDeckApp.ricorda(chiave) } catch (e) {}
    aggiorna()
  }
}

/**
 * Ridisegna, ma **non mentre stai scrivendo**.
 *
 * Il giro ogni due secondi rifaceva la pagina da capo, e con lei i campi: due
 * parole scritte in una chat sparivano prima di poterle mandare. Qui si salta
 * il ridisegno se hai un campo sotto le dita, e in ogni caso quello che c'era
 * scritto torna al suo posto.
 */
// Qual e' l'app da scaricare: si chiede una volta all'apertura e si tiene, che
// e' la stessa cosa che fa chi la scarica - una volta sola. Il nome non e'
// «app» perche' quello e' gia' il riquadro della pagina, e due dichiarazioni
// con lo stesso nome fermano tutto lo script.
let appAndroid = {}
fetch('/api/app').then((r) => r.json()).then((a) => { appAndroid = a || {} }).catch(() => undefined)

/**
 * La versione dell'app che sta guardando questa pagina, se e' l'app.
 *
 * La WebView si dichiara nel proprio user agent — «SierraDeck/1.3.0» — e senza
 * quella dichiarazione la pagina non aveva **nessun** modo di sapere di girare
 * dentro l'app: una WebView non e' mai in display-mode standalone. Cosi'
 * l'invito «C'e' l'app per Android» compariva proprio a chi l'app ce l'aveva
 * gia' aperta davanti.
 */
function versioneApp(ua) {
  const trovata = /SierraDeck\\/([0-9]+\\.[0-9]+\\.[0-9]+)/.exec(ua || '')
  return trovata ? trovata[1] : ''
}

/** Confronto numero per numero: «0.9.0» viene dopo «0.10.0» in ordine alfabetico. */
function piuNuovaApp(mia, trovata) {
  const a = String(mia || '').split('.').map(Number)
  const b = String(trovata || '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = Number.isFinite(a[i]) ? a[i] : 0
    const y = Number.isFinite(b[i]) ? b[i] : 0
    if (x !== y) return y > x
  }
  return false
}

/**
 * Si propone l'app? Solo se serve davvero.
 *
 * Tre no, e ognuno e' un difetto visto: non su un telefono Android; a chi ha
 * gia' detto no; e — questo e' il nuovo — a chi ha **gia' installata** una
 * versione che non e' piu' vecchia di quella pubblicata. Prima l'invito
 * compariva dentro l'app stessa, offrendo di scaricare la versione che stavi
 * usando: si preme, non succede niente, e si smette di credere agli
 * aggiornamenti.
 */
function proponeApp(ua, disponibile, rifiutato, comeApp) {
  if (!/Android/i.test(ua || '')) return false
  if (!disponibile) return false
  // Chi ha detto no ha detto no **a quella versione**: si tace finche' non ne
  // esce una piu' nuova. Il vecchio «1» valeva per sempre, e chi l'aveva
  // premuto una volta non avrebbe piu' saputo di nessun aggiornamento.
  if (rifiutato === '1') return false
  if (rifiutato && !piuNuovaApp(rifiutato, disponibile)) return false
  const mia = versioneApp(ua)
  // Dentro l'app la versione installata la sappiamo: si propone solo il
  // sorpasso vero.
  if (mia) return piuNuovaApp(mia, disponibile)
  // Fuori dall'app: se e' una pagina installata come app web l'invito e' gia'
  // stato accolto a modo suo, altrimenti l'app non c'e' e vale la pena dirlo.
  return !comeApp
}

/**
 * Cosa c'e' a schermo, ridotto a una stringa.
 *
 * Serve a rispondere a una domanda sola: e' cambiato qualcosa? Se no, non si
 * tocca il documento — e uno scorrimento a meta' di una chat resta dov'e'.
 * Delle righe del terminale bastano quante sono e l'ultima: se ne arriva una
 * nuova l'impronta cambia comunque.
 */
/**
 * Le chat raggruppate per workspace: prima quello davanti, poi gli altri.
 *
 * Dentro ogni gruppo prima le chat vive (un terminale acceso in una finestra),
 * poi quelle salvate nell'archivio che nessuna finestra mostra: si riaprono
 * con un tocco. Una chat viva la cui conversazione l'archivio non conosce sta
 * nel workspace davanti, che e' dove e' nata.
 */
function gruppiChat(s) {
  const vive = s.chat || []
  const ws = s.workspace || { nomi: [], attivo: '' }
  const salvate = ws.chat || []
  const nomi = ws.nomi || []
  if (nomi.length === 0) {
    return vive.length === 0 ? [] : [{ workspace: 'Chat', attivo: true, voci: vive.map((c) => ({ viva: c })) }]
  }
  const casa = nomi.indexOf(ws.attivo) >= 0 ? ws.attivo : nomi[0]
  const ordine = [casa].concat(nomi.filter((n) => n !== casa))
  const dove = {}
  salvate.forEach((c) => { if (c.sessione) dove[c.sessione] = c.workspace })
  const viveSess = {}
  vive.forEach((c) => { if (c.sessione) viveSess[c.sessione] = true })
  return ordine.map((nome) => ({
    workspace: nome,
    attivo: nome === ws.attivo,
    voci: vive
      .filter((c) => {
        // 0.82.0: prima il workspace che la chat dichiara (quelle dei workspace
        // tenuti vivi dietro arrivano con il loro), poi dove è salvata.
        const w = c.workspace && nomi.indexOf(c.workspace) >= 0 ? c.workspace : c.sessione ? dove[c.sessione] : undefined
        return (w && nomi.indexOf(w) >= 0 ? w : casa) === nome
      })
      .map((c) => ({ viva: c }))
      .concat(salvate.filter((c) => c.workspace === nome && !viveSess[c.sessione]).map((c) => ({ salvata: c })))
  }))
}

/**
 * Lo stato di una chat in un tono e una parola: la stessa regola dell'app
 * Android (StatoChat.kt). Prima ogni chat viva aveva il LED verde, e una chat
 * ferma su un permesso sembrava al lavoro.
 */
function statoChat(c) {
  if (c.chiede) return { tono: 'attesa', parola: 'aspetta che tu scelga' }
  if (c.aspetta && c.governata) return { tono: 'guidata', parola: 'ferma · ci pensa l’autopilota' }
  // 0.80.0: ha finito il turno = «ferma», come sul PC (chat-vista.ts) e nelle Domande,
  // dove sta fra le «Tutte». «Aspetta te» solo per una domanda o una scelta.
  if (c.aspetta) return { tono: 'ferma', parola: 'ferma' }
  if (c.viva === false) return { tono: 'spenta', parola: 'spenta' }
  if (c.governata) return { tono: 'guidata', parola: 'al lavoro · la guida un autopilota' }
  return { tono: 'lavoro', parola: 'al lavoro' }
}

/** Tutte le chat in una riga: prima chi aspetta te, e solo i casi che ci sono. */
function riassuntoChat(chat) {
  if (!chat || chat.length === 0) return 'nessuna chat aperta sul computer'
  var scelgono = 0, lavorano = 0, guidate = 0, ferme = 0, spente = 0
  chat.forEach(function (c) {
    var st = statoChat(c)
    if (st.parola === 'aspetta che tu scelga') scelgono++
    else if (st.tono === 'lavoro') lavorano++
    else if (st.tono === 'guidata') guidate++
    else if (st.tono === 'ferma') ferme++
    else spente++
  })
  var pezzi = []
  if (scelgono) pezzi.push(scelgono === 1 ? '1 aspetta che tu scelga' : scelgono + ' aspettano che tu scelga')
  if (lavorano) pezzi.push(lavorano + ' al lavoro')
  if (ferme) pezzi.push(ferme === 1 ? '1 ferma' : ferme + ' ferme')
  if (guidate) pezzi.push(guidate === 1 ? '1 con l’autopilota' : guidate + ' con gli autopiloti')
  if (spente) pezzi.push(spente === 1 ? '1 spenta' : spente + ' spente')
  return pezzi.join(' · ')
}

/**
 * Il LED di un autopilota, dalla classe che manda il computer: «led--fermo» e'
 * **rosso**, come sulla console. La pagina tagliava il prefisso e finiva sulla
 * classe «fermo», che qui e' il grigio del «non so» (computer muto): un
 * autopilota arreso sembrava spento.
 */
function ledAutopilota(a, scollegato) {
  if (scollegato) return 'fermo'
  var classe = a && typeof a === 'object' ? a.led : undefined
  if (typeof classe === 'string' && classe.indexOf('led--') === 0) {
    var c = classe.slice(5)
    return c === 'fermo' ? 'rosso' : c
  }
  var st = a && typeof a === 'object' ? a.stato : a
  if (st === 'lavoro') return 'lavoro'
  if (st === 'attesa' || st === 'pronto' || st === 'intervista') return 'attesa'
  if (st === 'finito') return 'finito'
  return 'rosso'
}

/** Quando sono stati letti i limiti: oggi solo l'ora, altrimenti anche il giorno. */
function quandoLetti(letti, adesso) {
  if (!letti) return ''
  var d = new Date(letti), a = new Date(adesso)
  var ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === a.toDateString()) return 'alle ' + ora
  var ieri = new Date(adesso - 86400000)
  if (d.toDateString() === ieri.toDateString()) return 'ieri alle ' + ora
  return 'il ' + d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' alle ' + ora + ' (da allora nessuna chat aperta dal computer ha risposto)'
}

/** C'e' del testo selezionato? Allora non si ridisegna: si perderebbe la selezione. */
function selezioneAttiva(sel) {
  return !!sel && sel.isCollapsed === false && String(sel).trim() !== ''
}

function impronta(s) {
  // Anche lo stato delle chat (sceglie, aspetta, guidata, spenta, altrove):
  // prima l'impronta ne guardava solo nome e ultima riga, e una chat che si
  // fermava su un permesso non ridisegnava niente — ne' il suo LED ne' il
  // numero sulla voce «Domande».
  const chat = (s.chat || []).map((c) => c.id + '|' + c.titolo + '|' + (c.ultimaRiga || '') + '|' + (c.chiede ? 1 : 0) + (c.aspetta ? 1 : 0) + (c.governata ? 1 : 0) + (c.viva === false ? 0 : 1) + '|' + (c.altrove || '')).join('~') +
    '#' + ((s.workspace && s.workspace.chat) || []).map((c) => c.sessione + '|' + c.workspace + '|' + c.titolo + '|' + (c.altrove || '')).join('~')
  const aps = (s.autopiloti || []).map((a) =>
    a.id + '|' + a.stato + '|' + a.cicli + '|' + a.fatti + '|' + a.criteri + '|' + (a.strategia || '') + '|' + (a.led || '') + '|' + (a.motivo || '') + '|' + (a.nome || '') + '|' + JSON.stringify(a.dalVivo || '')
  ).join('~') + '#' + (s.progetti || []).map((p) => p.id + ':' + p.inCoda + ':' + p.chi).join(',')
  const dom = (s.domande || []).map((d) => d.id + '|' + d.testo).join('~')
  const ws = s.workspace ? (s.workspace.nomi || []).join(',') + '>' + s.workspace.attivo : ''
  // Anche quello che sta aperto **qui**: un pannello che si apre non cambia lo
  // stato del computer, ma cambia la pagina.
  const qui = [
    dentro, dentroAp, pannelloAperto, schedaAperta && schedaAperta.file,
    JSON.stringify(posto), altroAperto, delegando, delegaCartella, confermando, righeDentro.length,
    righeDentro[righeDentro.length - 1] || '', giriFalliti >= 2,
    // Le scelte fanno comparire e sparire dei pulsanti: se non entrano
    // nell'impronta, il riquadro di scelta arriva e la pagina non si ridisegna.
    scelteDentro ? scelteDentro.corrente + ':' + scelteDentro.opzioni.map((o) => o.testo).join('/') : '',
    notaScelta || '', notaCartella,
    // Il menu dei workspace (0.82.0): il «⋯» aperto, la rinomina, la ricerca.
    wsAperto + '|' + wsRinomina + '|' + wsFiltro,
    // I «?» aperti (0.71.0): senza, il tocco cambiava aiutiAperti e la pagina non si ridisegnava.
    JSON.stringify(aiutiAperti),
    // **Anche cio' che si e' letto apposta.** Il dettaglio di un autopilota,
    // l'elenco delle cartelle, la coda, il Drive, le preferenze, le schede:
    // arrivano con una chiamata a parte e non stanno nello stato del PC. Senza
    // di loro nell'impronta, a computer fermo (nessuna chat che scrive) la
    // pagina restava com'era: si toccava un autopilota e il suo dettaglio non
    // compariva, si apriva il Drive e restava «Leggo il Drive…».
    panoramicaAp ? JSON.stringify(panoramicaAp) : '',
    // I «▸» aperti della Panoramica 2 (0.78.0): senza, il tocco non ridisegnava (provato in Edge il 16/10).
    JSON.stringify(panAperte),
    // La gestione delle chat (0.79.0): linguette, scelte, conferme, svuota.
    gcImpronta(),
    apDettaglio ? JSON.stringify(apDettaglio.dalVivo || '') + JSON.stringify(apDettaglio.adesso || '') + JSON.stringify(apDettaglio.messaggi || []) + apDettaglio.ultimoEvento + '/' + apDettaglio.stato + '/' + (apDettaglio.decisioni || []).length + '/' + (apDettaglio.chat || []).length + '/' + apDettaglio.domanda + '/' + apDettaglio.pensa + '/' + apDettaglio.riprendiAlRiavvio : '',
    apTab,
    // Salute e Impostazioni sono destinazioni (0.61.0): quello che leggono entrando ridisegna la pagina.
    saluteVista ? saluteVista.riassunto + '/' + (saluteVista.voci || []).length : '', saluteErrore || '', saluteGruppo, saluteMappa,
    notaDialogo || '', notaGlobale || '',
    cartelle ? cartelle.length : '',
    codaProgetto || '', codaErrore || '',
    pcVisti ? pcVisti.map((b) => b.pcId + b.vivo + b.battito).join(',') : '', pcAperto || '', postaErrore || '',
    postaVoci ? postaVoci.map((v) => v.id + v.stato).join(',') : '',
    codaVoci ? codaVoci.map((v) => v.id + v.stato).join(',') : '',
    driveLeggo, driveVista, driveErrore || '', driveInCorso || '', driveRiavviato,
    driveProgresso ? driveProgresso.fase + '/' + (driveProgresso.fatto || 0) : '',
    driveCatalogo ? (driveCatalogo.letto || '') + '/' + (driveCatalogo.progetti || []).length : '',
    driveLavoro ? JSON.stringify(driveLavoro) : '',
    JSON.stringify(driveAperti || {}),
    // «Progetti» (0.69.0): mancava, e la pagina restava su «Leggo…» o non apriva il dettaglio finché non cambiava altro.
    pdDati ? (pdDati.letto || '') + '/' + pdDati.progetti.length + '/' + JSON.stringify((pdDati.progetti || []).map((r) => r.vista ? r.vista.stato : '')) + JSON.stringify(pdDati.residenza || []) + JSON.stringify((pdDati.rimozione || {}).stati || []) + JSON.stringify(pdDati.traslochi || []) : '',
    pdErrore || '', pdVista, pdFiltro, pdDaConfermare, pdSenzaNome, pdGruppo, pdOrdine, pdScelto, pdStrumento, pdSpostaVerso,
    prefViste ? prefViste.stile + '/' + prefViste.chiarore : '',
    aggiornamentoVisto ? aggiornamentoVisto.fase + '/' + (aggiornamentoVisto.percento || 0) + '/' + (aggiornamentoVisto.errore || '') + '/' + (aggiornamentoVisto.attesa || '') + '/' + (aggiornamentoVisto.chatOccupate || 0) + '/' + (aggiornamentoVisto.testo || '') + '/' + (aggiornamentoVisto.tentativoFallito ? aggiornamentoVisto.tentativoFallito.quando : '') : '',
    cercatoAlle || '',
    consumiVisti ? JSON.stringify(consumiVisti) : '',
    // La scheda Domande: la sua lista arriva da una chiamata a parte. Senza
    // questi, aprendola si restava su «Leggo dal computer…» finche' qualcosa
    // d'altro non cambiava, e «Mandata» dopo una risposta non compariva.
    domandeViste ? JSON.stringify(domandeViste) : '', domandeGuasto || '', Object.keys(domandeMandate).join(','),
    // Il negozio: cosa si e' letto, cosa sta lavorando (coi secondi), i guasti e le conferme.
    aperto('negozio') ? JSON.stringify([negozioVisto, negozioErrore, negozioErroreMcp, negozioFamiglia, negozioTrovati, negozioParola, negozioNota, negozioProvoMcp, negozioGuasti, negozioConferme, Object.keys(negozioLavoro).map(function (k) { return k + Math.round((Date.now() - negozioLavoro[k].da) / 1000) })]) : '',
    domandeConversazioni ? JSON.stringify(domandeConversazioni) : '', domandaAperta || '', domandeFiltro,
    // La sezione File (0.54.0): dove si è, cosa si guarda, l'avanzamento.
    (pannelloAperto === 'file' || inVista('file')) ? JSON.stringify([fileProgetti ? fileProgetti.length : -1, fileDove, fileElenco ? fileElenco.voci.length + fileElenco.percorso : '', fileVista ? fileVista.nome + fileVista.tipo : '', fileNota, fileErrore, filePin]) : '',
    (function () { try { return localStorage.getItem('sierradeck.nienteapp') || '' } catch (e) { return '' } })(),
    schedeViste ? schedeViste.length + quadernoTag : '',
    sessioniViste ? sessioniViste.length : '',
    ''
  ].join('|')
  return chat + '#' + aps + '#' + dom + '#' + ws + '#' + qui
}

/** Dov'era arrivato lo scorrimento, prima di rifare il documento. */
function segnaScorrimento() {
  const dove = { finestra: window.scrollY }
  const d = app.querySelector('.dentro')
  if (d) dove.dentro = d.scrollTop
  return dove
}

function rimettiScorrimento(dove) {
  window.scrollTo(0, dove.finestra)
  const d = app.querySelector('.dentro')
  // «dentro» puo' essere assente: si stava guardando dentro qualcosa e adesso
  // no. In quel caso non c'e' niente da rimettere.
  if (d && dove.dentro !== undefined) d.scrollTop = dove.dentro
}

/**
 * Il LED di una destinazione: il piu' urgente di quello che contiene.
 *
 * L'idea che tiene insieme tutta la pagina: **la fascia in basso e' la fila di
 * LED**, quindi la navigazione e' anche il display di stato. Sei dentro una
 * chat e vedi lampeggiare in fondo che qualcuno ti aspetta.
 */
function ledDestinazione(nome, s) {
  if (giriFalliti >= 2) return nome === 'salute' || nome === 'altro' ? 'rosso' : 'fermo'
  // Le quattro voci del telefono (0.83.0): il LED più urgente delle voci del PC che contengono.
  if (nome === 'adesso') {
    const l = [ledDestinazione('autopiloti', s), ledDestinazione('domande', s)]
    return l.indexOf('rosso') >= 0 ? 'rosso' : l.indexOf('attesa') >= 0 ? 'attesa' : l.indexOf('lavoro') >= 0 ? 'lavoro' : ''
  }
  if (nome === 'altro') return ledDestinazione('impostazioni', s)
  const aps = s.autopiloti || []
  // Dal LED deciso dal computer, come ogni altro LED della pagina: chi si
  // prepara e fa una domanda chiede, chi si prepara in silenzio e' in moto.
  const chatCheChiedono = (s.chat || []).filter((c) => statoChat(c).tono === 'attesa').length
  const chiede = (s.domande || []).length > 0 || chatCheChiedono > 0 ||
    aps.some((a) => ledAutopilota(a, false) === 'attesa')
  const fermi = aps.some((a) => ledAutopilota(a, false) === 'rosso')
  const moto = aps.some((a) => ledAutopilota(a, false) === 'lavoro')
  if (nome === 'domande') return domandeInAttesa(s) > 0 || chiede ? 'attesa' : ''
  if (nome === 'autopiloti') return aps.some((a) => ledAutopilota(a, false) === 'attesa') ? 'attesa' : fermi ? 'rosso' : moto ? 'lavoro' : ''
  if (nome === 'chat') return chatCheChiedono > 0 ? 'attesa' : (s.chat || []).some((c) => statoChat(c).tono === 'lavoro' || statoChat(c).tono === 'guidata') ? 'lavoro' : ''
  // Le impostazioni normalmente non hanno LED, e lo accendono solo quando c'e'
  // qualcosa che riguarda **la macchina**: un aggiornamento pronto.
  if (nome === 'impostazioni') return aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto' ? 'attesa' : ''
  return ''
}

/**
 * Quante domande aspettano te: il numero del computer (0.37.2), lo stesso del
 * tasto «Domande» del PC e della sua colonna. Da un computer piu' vecchio si
 * conta come prima.
 */
function domandeInAttesa(s) {
  if (typeof s.domandeInAttesa === 'number') return s.domandeInAttesa
  return (s.domande || []).length + (s.chat || []).filter((c) => c.chiede).length
}

/**
 * «N di M chat» (0.82.0): quante chat degli autopiloti lavorano sul computer e
 * quante ne lascia lavorare insieme, con il perché dietro «?». I testi li
 * scrive il computer, uguali al PC e all'app. Niente da un computer più vecchio.
 */
function postiChatHtml(s) {
  const p = s && s.postiChat
  if (!p || typeof p.riga !== 'string') return ''
  const pieno = p.attive >= p.posti
  return '<div class="posti-chat' + (pieno ? ' posti-chat--pieno' : '') + '" role="status"><span class="posti-chat__riga">' + esc(p.riga) + '</span>' +
    aiuto('posti-chat', esc(p.spiega || '').split(String.fromCharCode(10)).join('<br>'), 'Chat al lavoro insieme') + '</div>'
}

/**
 * Il pallino di una voce della fascia (0.83.0), come nell'app: rosso se un
 * autopilota \u00e8 fermo, ambra se qualcosa aspetta te, con il numero; i colori
 * dalla tabella del PC (ATT), e sempre una parola per chi non vede il colore.
 */
function pallinoVoce(id, s) {
  const chiedono = domandeInAttesa(s)
  if (id === 'adesso') {
    const fermi = (s.autopiloti || []).some((a) => ledAutopilota(a, false) === 'rosso')
    if (fermi) return { colore: 'rosso', numero: chiedono, dice: 'un autopilota \u00e8 fermo' }
    if (chiedono > 0) return { colore: 'ambra', numero: chiedono, dice: chiedono === 1 ? 'una domanda per te' : chiedono + ' domande per te' }
    if ((s.autopiloti || []).some((a) => ledAutopilota(a, false) === 'attesa')) return { colore: 'ambra', numero: 0, dice: 'un autopilota aspetta il via' }
    return null
  }
  if (id === 'chat') {
    const n = (s.chat || []).filter((c) => statoChat(c).tono === 'attesa').length
    return n > 0 ? { colore: 'ambra', numero: n, dice: n === 1 ? 'una chat aspetta una scelta' : n + ' chat aspettano una scelta' } : null
  }
  if (id === 'altro' && giriFalliti >= 2) return { colore: 'rosso', numero: 0, dice: 'il computer non risponde' }
  if (id === 'altro' && aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto') return { colore: 'ambra', numero: 0, dice: 'un aggiornamento \u00e8 pronto' }
  return null
}

/** La fascia fissa, sempre visibile, mai nascosta dallo scorrimento: le quattro voci dell'app (0.83.0). */
function fascia(s) {
  return '<nav class="fascia" aria-label="Menu principale">' + VOCI.map((v) => {
    const l = ledDestinazione(v.id, s)
    const p = pallinoVoce(v.id, s)
    const qui = posto.voce === v.id
    const fondo = p ? coloreNome(p.colore) : ''
    return '<button class="fascia__voce' + (qui ? ' fascia__voce--qui' : '') + '"' +
      (qui ? ' aria-current="page"' : '') + ' title="' + esc(v.spiega) + '"' +
      ' aria-label="' + esc(v.nome + (p ? ', ' + p.dice : '')) + '"' +
      ' onclick="vaiVoce(\\'' + v.id + '\\')">' +
      '<span class="fascia__icona" aria-hidden="true">' + v.icona +
      (p ? '<span class="fascia__pallino" style="background:' + fondo + '">' + (p.numero > 0 ? p.numero : '') + '</span>' : '<span class="led ' + (l === 'lavoro' ? 'lavoro' : 'nessuno') + '"></span>') +
      '</span>' +
      '<span class="fascia__nome">' + esc(v.nome) + '</span></button>'
  }).join('') + '</nav>'
}

/** Le linguette in cima a Chat e Progetti (0.83.0): tasti alti 48 px, la scelta in accento. */
function linguetteHtml() {
  const v = VOCI.find((x) => x.id === posto.voce)
  if (!v || v.linguette.length === 0) return ''
  const scelta = linguettaDi(posto)
  return '<div class="linguette" role="tablist">' + v.linguette.map((nome, i) =>
    '<button role="tab" class="linguetta' + (i === scelta ? ' linguetta--qui' : '') + '" aria-selected="' + (i === scelta) + '" onclick="vaiLinguetta(' + i + ')">' + esc(nome) + '</button>'
  ).join('') + '</div>'
}

/**
 * Di tutte le piastrelle delle impostazioni, quella della sezione «id» (0.83.0):
 * ognuna comincia con il suo data-sezione, e stanno una dopo l'altra.
 */
function sezioneImpostazioni(tutte, id) {
  const inizio = '<div class="piastrella" data-sezione="'
  const pezzo = tutte.split(inizio).find((p) => p.indexOf(id + '"') === 0)
  return pezzo ? inizio + pezzo : ''
}

/**
 * Altro (0.83.0): un elenco, una sezione per tocco, con \u00abCerca\u00bb in cima. Prima
 * erano Salute e Impostazioni, una pagina lunga ciascuna.
 */
function elencoAltroHtml() {
  return '<div class="piastrella"><div class="titolo">Altro' + aiuto('altro', 'La salute del sistema, gli altri computer, i consumi e le impostazioni. Tocca una voce per aprirla; \u00abindietro\u00bb torna qui. \u00abCerca\u00bb trova anche le singole impostazioni.') + '</div>' +
    '<div class="riga"><input id="cerca-impostazioni" type="search" placeholder="Cerca: aggiornamento, colore…" aria-label="Cerca nelle impostazioni" oninput="filtraImpostazioni(this.value)"></div>' +
    SEZIONI_ALTRO.map((x) =>
      '<button class="cartella voce-altro" data-sezione="' + esc(x.id) + '" data-chiavi="' + esc((x.titolo + ' ' + x.sotto).toLowerCase()) + '" onclick="apriSezione(this.dataset.sezione)">' +
      '<b>' + esc(x.titolo) + '</b><span class="sotto">' + esc(x.sotto) + '</span></button>'
    ).join('') + '</div>'
}

function pannello(s) {
  ultimoStato = s
  // Il nome scelto del computer nel titolo della scheda del browser (0.52.4).
  if (nomeDaMostrare(s.computer)) document.title = 'SierraDeck · ' + nomeDaMostrare(s.computer)
  const attivo = document.activeElement
  // Una casella spuntata non è scrivere (0.79.0: il totale dello Spazio restava vecchio).
  const staScrivendo = attivo && ((attivo.tagName === 'INPUT' && attivo.type !== 'checkbox' && attivo.type !== 'radio') || attivo.tagName === 'TEXTAREA')
  // Chi sta scrivendo ha ragione: la pagina puo' aspettare due secondi.
  if (staScrivendo) return
  // E anche chi sta selezionando per copiare: il ridisegno rifaceva il
  // documento e la selezione spariva sotto il dito, cosi' dalla chat con
  // l'autopilota non si copiava niente (30/09).
  if (selezioneAttiva(window.getSelection())) return
  // Niente e' cambiato: non si tocca il documento. E' questa riga a rendere
  // leggibile una chat dal telefono.
  const adesso = impronta(s)
  if (adesso === ultimaImpronta && app.innerHTML.trim()) return
  ultimaImpronta = adesso

  /**
   * Il LED di un autopilota: **quello che ha deciso il computer**.
   *
   * Il colore arriva gia' calcolato (a.led), dalla stessa funzione che lo
   * decide nella console. Qui c'era una seconda mappatura scritta a mano, e
   * sbagliava dove conta: un autopilota **fallito** aveva lo stesso puntino
   * grigio di uno **finito**. Due copie della stessa regola divergono al primo
   * ritocco — e questa era gia' divergente.
   *
   * Quando il computer non risponde sono tutti spenti: meglio nessuna
   * informazione che una vecchia spacciata per fresca.
   */
  const led = (a) => {
    if (giriFalliti >= 2) return 'fermo'
    // La classe arriva dal computer (a.led, controllata con classe.indexOf('led--')
    // dentro ledAutopilota): qui non c'e' una seconda mappatura.
    return ledAutopilota(a, false)
  }
  /** Il LED di una chat: spento quando il computer tace, come quelli degli autopiloti. */
  const ledChat = (c) => giriFalliti >= 2 ? 'fermo' : statoChat(c).tono
  // La panoramica: quello che si vuole sapere prima di leggere qualunque
  // dettaglio - sta lavorando qualcosa? qualcuno mi sta aspettando? A quale
  // punto siamo? Tre numeri, in cima, senza dover contare le piastrelle.
  const aps = s.autopiloti || []
  // ── La gerarchia di Adesso ──────────────────────────────────────────────
  // Una cosa sola domina alla volta. Prima c'erano quattro numeri giganti che
  // rispondevano alla domanda sbagliata: «0 ti aspettano» e «2 ti aspettano»
  // differiscono di un carattere, mentre la domanda del colpo d'occhio e'
  // **serve qualcosa da me, si' o no**.
  const inMoto = (s.autopiloti || []).filter((a) => a.stato === 'lavoro')
  const fermi = (s.autopiloti || []).filter((a) => a.stato === 'sospeso' || a.stato === 'fallito')
  // Chi aspetta te senza essere una domanda: un autopilota pronto (il via),
  // una chat su una scelta. Prima Adesso diceva «Nessuno ti aspetta» anche
  // con uno di questi davanti. 0.80.0: una chat che ha finito il turno è
  // «ferma», come sul PC, e qui non conta più.
  const pronti = (s.autopiloti || []).filter((a) => a.stato === 'pronto')
  const chatAttesa = (s.chat || []).filter((c) => statoChat(c).tono === 'attesa')

  // 0.82.0: «IN MOTO» conta chi lavora davvero, dallo stato della chat: prima
  // sommava tutte le chat, e con quattro ferme diceva «IN MOTO 4». Le altre
  // restano in vista, sotto la loro riga.
  const chatInMoto = (s.chat || []).filter((c) => !c.chiede && !c.aspetta && c.viva !== false)
  const chatAltre = (s.chat || []).filter((c) => chatInMoto.indexOf(c) < 0)
  const rigaChatPolso = (c) =>
      // Anche il LED di una chat si spegne quando il computer tace: scritto a
      // mano restava **verde** su dati di mezz'ora prima, che è esattamente
      // ciò che questo stato esiste per impedire. Visto in fotografia. E dice
      // lo stato vero (aspetta te, sceglie, guidata), non «verde» per tutte.
      '<div class="polso"><span class="led ' + ledChat(c) + '"></span>' +
      '<span class="polso__nome">' + esc(c.nome || c.titolo) + '</span><span class="voce__stato voce__stato--' + statoChat(c).tono + '">' + esc(statoChat(c).parola) + '</span>' +
      // Al lavoro in sottofondo (0.69.0): si vede sempre, e «Guarda» mostra lo schermo dal vivo senza cambiare niente sul PC.
      (c.sottofondo ? '<span class="sotto" style="margin-left:6px">in sottofondo</span><button style="margin-left:6px" data-chat="' + esc(c.id) + '" onclick="guarda(this.dataset.chat)">Guarda</button>' : '') + '</div>' +
      (c.ultimaRiga ? '<div class="battito">' + esc(c.ultimaRiga) + '</div>' : '')

  /** Il polso: una riga per cosa, non un cruscotto. */
  const polso =
    '<div class="solco"></div><div class="serigrafia riga-polso">IN MOTO<span>' +
    (inMoto.length + chatInMoto.length) + '</span></div>' +
    inMoto.map((a) =>
      '<div class="polso"><span class="led ' + led(a) + '"></span>' +
      '<span class="polso__nome">' + esc(a.nome) + '</span>' +
      '<span class="polso__misura">' + (a.criteri ? Math.round(a.fatti / a.criteri * 100) : 0) + '%</span></div>'
    ).join('') +
    chatInMoto.map(rigaChatPolso).join('') +
    (chatAltre.length > 0 ? '<div class="serigrafia riga-polso" style="margin-top:var(--s2)">ALTRE CHAT<span>' + chatAltre.length + '</span></div>' + chatAltre.map(rigaChatPolso).join('') : '')

  /** Quando non c'e' niente da fare: il vuoto **e'** il messaggio. */
  const calma =
    '<div class="calma"><div class="calma__grande">Tutto in moto.<br>Nessuno ti aspetta.</div></div>'

  /** Qualcosa si e' fermato: rosso, e il LED **non** pulsa. */
  const bloccati = fermi.map((a) =>
    '<div class="piastrella si-e-fermato">' +
    '<div class="serigrafia"><span class="led rosso"></span>SI È FERMATO</div>' +
    '<div class="grande">' + esc(a.nome) + '</div>' +
    '<div class="sotto">' + esc(a.strategia ? 'bloccato, provo: ' + a.strategia : (a.motivo || 'fermo')) + '</div>' +
    '<div class="misura-riga">' + a.fatti + ' criteri su ' + a.criteri + ' · ' + a.cicli + ' interventi</div>' +
    '<div class="riga">' +
    '<button data-ap="' + esc(a.id) + '" onclick="riprendiAp(this.dataset.ap)">Riprendi</button>' +
    '<button onclick="vaiScheda(\\'autopiloti\\')">Guarda</button></div></div>'
  ).join('')

  /** Chi aspetta te senza essere una domanda: si vede qui, con il gesto. */
  const aspettanoTe = (pronti.length + chatAttesa.length) === 0 ? '' :
    '<div class="piastrella chiede"><div class="serigrafia"><span class="led attesa"></span>ASPETTANO TE</div>' +
    pronti.map((a) =>
      '<div class="polso"><span class="polso__nome">' + esc(a.nome) + '</span><span class="voce__stato voce__stato--attesa">' +
      (a.stato === 'pronto' ? 'pronto: aspetta il via' : 'ti ha fatto una domanda') + '</span></div>' +
      (a.stato === 'pronto' ? '<div class="riga"><button class="primario" data-ap="' + esc(a.id) + '" onclick="vaiAp(this.dataset.ap)">Vai</button></div>' : '')
    ).join('') +
    chatAttesa.map((c) =>
      '<div class="polso"><span class="polso__nome">' + esc(c.nome || c.titolo || c.cwd) + '</span><span class="voce__stato voce__stato--attesa">' + esc(statoChat(c).parola) + '</span></div>'
    ).join('') +
    (chatAttesa.length ? '<div class="riga"><button onclick="window.scrollTo(0, 0)">Rispondi qui in cima</button></div>' : '') +
    '</div>'

  const panoramica = (s.domande || []).length > 0 || fermi.length > 0 || inMoto.length > 0 || (s.chat || []).length > 0 || pronti.length > 0
    ? ''
    : calma

  // Una domanda in attesa **e'** la prima schermata, non una piastrella fra le
  // altre: il suo testo e' la cosa piu' grande della pagina, e la risposta sta
  // in fondo, dove arriva il pollice. Con due domande cambia solo la
  // serigrafia — la seconda aspetta il suo turno.
  const quante = (s.domande || []).length
  const domande = (s.domande || []).slice(0, 1).map((d) => \`
    <div class="piastrella chiede">
      <div class="serigrafia"><span class="led attesa"></span>TI STA CHIEDENDO\${quante > 1 ? ' — 1 DI ' + quante : ''}</div>
      <div class="grande domanda-ap">\${esc(d.testo)}</div>
      <div class="riga">
        <textarea id="r-\${esc(d.id)}" rows="3" placeholder="la tua risposta"></textarea>
      </div>
      <div class="riga"><button class="primario" onclick="rispondi('\${escJs(d.id)}')">Rispondi</button></div>
    </div>\`).join('')

  const apAperto = apPc
    ? (((altriAp || []).find((p) => p.pcId === apPc) || {}).autopiloti || []).find((a) => a.id === dentroAp)
    : (s.autopiloti || []).find((a) => a.id === dentroAp)
  const autopiloti = apAperto
    ? \`
    <div class="testata-dentro">
      <button class="indietro" onclick="chiudiAp()" aria-label="Torna all’elenco">‹</button>
      <div class="testata-dentro__nome"><span class="led \${led(apAperto)}"></span>\${esc(apAperto.nome)}\${apPc ? ' <span class="sotto">· gira su ' + esc(apPcNome) + '</span>' : ''}</div>
    </div>
    <button class="riassunto-ap\${apDettaglio && (apDettaglio.domandeScheda || []).length ? ' riassunto-ap--domande' : ''}" aria-expanded="\${apRiassunto}" onclick="giraRiassuntoAp()"><span>\${esc(riassuntoApTesto(apAperto, apDettaglio))}</span><b>\${apRiassunto ? 'Chiudi ▴' : 'Dettagli ▾'}</b></button>
    <div class="piastrella \${apRiassunto ? 'riassunto-aperto' : 'riassunto-chiuso'}">
      <div class="solo-riassunto">
      <div style="\${panoramicaAp && panoramicaAp.situazione ? 'display:none' : ''}">
      <div class="sotto">\${apAperto.vista ? '<b style="color:' + COLORE_VISTA[apAperto.vista.stato.colore] + '">' + esc(apAperto.vista.stato.parola) + '</b>' + (apAperto.vista.da ? ' · da ' + esc(apAperto.vista.da) : '') + (apAperto.vista.stato.ragione ? ' · ' + esc(apAperto.vista.stato.ragione) : '') : esc(apAperto.strategia ? 'bloccato, provo: ' + apAperto.strategia : (apAperto.motivo || apAperto.stato))}</div>
      <div class="misura-riga">criteri \${apAperto.fatti}/\${apAperto.criteri}</div>
      <div class="barra"><i style="width:\${apAperto.criteri ? Math.round(apAperto.fatti / apAperto.criteri * 100) : 0}%"></i></div>
      </div>
      \${apDettaglio ? panoramicaHtml(panoramicaAp, 'testa') : ''}
      \${apDettaglio ? dalVivoHtml(apDettaglio.dalVivo, !!(panoramicaAp && panoramicaAp.situazione)) + adessoHtml(apDettaglio.adesso) + messaggiApHtml(apDettaglio.messaggi) : ''}
      </div>
      \${apDettaglio ? vistaAutopilota(apDettaglio) : ''}
      <div class="solo-riassunto">
      \${apDettaglio ? panoramicaHtml(panoramicaAp, 'resto') : ''}
      <div class="riga">
        \${apAperto.stato === 'pronto'
          ? '<button class="primario" data-ap="' + esc(apAperto.id) + '" onclick="vaiAp(this.dataset.ap)">Vai</button>'
          : apAperto.stato === 'lavoro' || apAperto.stato === 'attesa'
            ? '<button data-ap="' + esc(apAperto.id) + '" onclick="fermaAp(this.dataset.ap)">Ferma</button>'
            : apAperto.stato === 'intervista'
              ? '<span class="sotto">si sta preparando: legge il progetto e, se serve, ti fa una domanda</span>'
              : apAperto.stato === 'finito'
                ? '<span class="sotto">ha finito: non c’è altro da fare</span>'
                : '<button data-ap="' + esc(apAperto.id) + '" onclick="riprendiAp(this.dataset.ap)">Riprendi</button>'}
        \${apAperto.stato === 'sospeso' || apAperto.stato === 'fallito' ? '<button data-ap="' + esc(apAperto.id) + '" onclick="archiviaAp(this.dataset.ap)" title="Esce dall’elenco dei lavori; non si cancella niente">Archivia</button>' : ''}
        <button onclick="apriPannello('quaderno')">Quaderno</button>
      </div>
      \${!apPc && ((s.workspace && s.workspace.nomi) || []).some((n) => n !== apAperto.workspace) ? \`
      <div class="riga">
        <select id="ap-sposta" style="flex:1" aria-label="Sposta in un altro workspace">
          \${(s.workspace.nomi || []).filter((n) => n !== apAperto.workspace).map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('')}
        </select>
        <button data-ap="\${esc(apAperto.id)}" onclick="spostaAp(this.dataset.ap)">Sposta lì</button>\${aiuto('ap-sposta', 'Cambia il workspace dove compare il suo lavoro' + (apAperto.workspace ? ' (adesso «' + esc(apAperto.workspace) + '»)' : '') + '. La cartella e le chat già aperte restano dove sono. Dopo, il workspace di prima si può eliminare.')}
      </div>\` : ''}
      <div class="riga">
        <label class="spunta"><input type="checkbox" \${apDettaglio && apDettaglio.riprendiAlRiavvio === false ? '' : 'checked'} data-ap="\${esc(apAperto.id)}" onchange="riavvioAp(this.dataset.ap, this.checked)"> Riparte da solo al riavvio del computer</label>
        <label class="spunta"><input type="checkbox" \${apDettaglio && apDettaglio.sottofondo === true ? 'checked' : ''} data-ap="\${esc(apAperto.id)}" onchange="sottofondoAp(this.dataset.ap, this.checked)"> Lavora in sottofondo\${aiuto('ap-sottofondo', 'Di serie la sua chat sta in un riquadro del suo workspace sul computer, e quando l’autopilota le scrive il computer va in quel workspace (mai mentre stai scrivendo lì). Accesa, la chat lavora senza riquadro: la vedi in «in sottofondo» con Guarda.')}</label>
        <button class="\${confermando === 'ap-' + apAperto.id ? 'pericolo' : ''}" data-ap="\${esc(apAperto.id)}" onclick="eliminaAp(this.dataset.ap)">\${confermando === 'ap-' + apAperto.id ? 'Sicuro? Elimina' : 'Elimina'}</button>
      </div>
      </div>
    </div>\`
    : (s.autopiloti || []).map((a) => \`
    <button class="voce" onclick="guardaAp('\${escJs(a.id)}')">
      <span class="led \${led(a)}"></span>
      <span class="voce__testo">
        <span class="voce__nome">\${esc(a.nome)}</span>
        \${a.vista
          ? '<span class="voce__sotto"><b style="color:' + COLORE_VISTA[a.vista.stato.colore] + '">' + esc(a.vista.stato.parola) + '</b>' + (a.vista.da ? ' · da ' + esc(a.vista.da) : '') + ' · criteri ' + esc(a.vista.criteri.testo) + '</span>' + (a.vista.ultima ? '<span class="voce__sotto">' + esc(a.vista.ultima) + '</span>' : '')
          : '<span class="voce__sotto">' + esc(a.strategia ? 'bloccato, provo: ' + a.strategia : (a.motivo || a.stato)) + ' · ' + a.fatti + '/' + a.criteri + '</span>' + dalVivoHtml(a.dalVivo)}
      </span>
      <span class="voce__freccia">›</span>
    </button>\`).join('') + altriApHtml()

  // ── Le chat ─────────────────────────────────────────────────────────────
  // Prima ogni chat portava sempre sei comandi: campo, Invia, Guarda dentro,
  // campo nome, Nome, Chiudi. Con sei chat erano **trenta bersagli** in una
  // colonna, e il campo per rinominare — cosa che si fa una volta nella vita —
  // occupava spazio permanente accanto al battito del terminale.
  // Adesso l'elenco e' un elenco: una riga densa per chat, e chi vuole entrare
  // entra.
  const aperta = (s.chat || []).find((c) => c.id === dentro)
  const chat = aperta
    ? \`
    <div class="testata-dentro">
      <button class="indietro" onclick="chiudiDentro()" aria-label="Torna all’elenco">‹</button>
      <div class="testata-dentro__nome"><span class="led \${ledChat(aperta)}"></span>\${esc(aperta.titolo)}</div>
      <button class="altro" onclick="apriAltro('\${escJs(aperta.id)}')" aria-label="Altro">⋯</button>
    </div>
    <div class="sotto"><span class="voce__stato voce__stato--\${statoChat(aperta).tono}">\${esc(statoChat(aperta).parola)}</span></div>
    \${domandaALatoHtml(aperta.id)}
    <div class="sotto percorso">\${esc(aperta.cwd)}</div>
    \${altroAperto === aperta.id ? \`
      <div class="piastrella">
        <div class="riga">
          <input id="n-\${esc(aperta.id)}" placeholder="dalle un nome">
          <button onclick="rinomina('\${escJs(aperta.id)}')">Nome</button>
        </div>
        <div class="riga">
          \${aperta.viva === false
            ? '<button onclick="azioneChat(\\'sveglia\\', \\'' + escJs(aperta.id) + '\\')">Svegliala</button>'
            : '<button onclick="chiediAzione(\\'dormi\\', \\'' + escJs(aperta.id) + '\\')">Metti a dormire</button>'}
          <button class="pericolo" onclick="chiediAzione('chiudi', '\${escJs(aperta.id)}')">Chiudi la chat…</button>
        </div>
        <div class="riga"><button onclick="apriCartella({ chat: '\${escJs(aperta.id)}' })">📁 Apri cartella</button></div>
        \${aperta.sessione ? '<div class="riga gc-riga">' + gcTastiHtml(aperta.sessione, aperta.titolo || aperta.cwd, 'c-' + aperta.id) + '</div>' : ''}
        \${((s.workspace && s.workspace.nomi) || []).length > 1 ? \`
        <div class="riga">
          <select id="sposta-\${esc(aperta.id)}" style="flex:1">
            \${(s.workspace.nomi || []).filter((n) => n !== aperta.workspace).map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('')}
          </select>
          <button onclick="chiediAzione('sposta', '\${escJs(aperta.id)}')">Sposta lì</button>
        </div>\` : ''}
        \${confermaHtml(aperta.id)}
      </div>\` : ''}
    \${pinDentro ? \`
    <div class="piastrella" style="text-align:center">
      <div style="font-size:2.375rem">🔒</div>
      <div><b>Questa chat è protetta dal PIN</b>\${aiuto('pin', 'Continua a lavorare sul computer: qui non si vede e non si scrive finché non metti il PIN. Lo controlla il computer, e la chat si richiude da sola dopo il tempo di inattività scelto là.')}</div>
      <div class="riga">
        <input id="pin-dentro" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" autocomplete="off">
        <button onclick="sbloccaPin()">Apri</button>
      </div>
      \${pinNota ? '<div class="sotto" style="color:#e0a33c">' + esc(pinNota) + '</div>' : ''}
    </div>\` : \`
    <div class="dentro dentro--alto">\${righeGrezze.length
        // Vestite: il verde di un test passato e il rosso di uno fallito sono
        // meta' di quello che dice come sta andando.
        ? schermoHtml(righeGrezze, continuaDentro, colonneDentro)
        : righeDentro.length ? esc(righeDentro.join(String.fromCharCode(10)))
        : 'Ancora niente da mostrare.'}</div>
    \${scelteDentro
      ? '<div class="scelte"><div class="serigrafia">sta aspettando che tu scelga</div>' +
        scelteDentro.opzioni.map((o) =>
          '<button class="scelta' + (o.scelta ? ' scelta--ora' : '') +
          '" onclick="scegli(\\'' + escJs(o.testo) + '\\')">' +
          etichettaOpzione(o) + '</button>'
        ).join('') + '</div>'
      : ''}
    \${notaScelta ? '<div class="sotto">' + esc(notaScelta) + '</div>' : ''}
    \${allegatoNota ? '<div class="sotto">' + esc(allegatoNota) + '</div>' : ''}
    <div class="riga ancorata">
      <input id="t-\${esc(aperta.id)}" placeholder="scrivi qui e invia">
      <button data-chat="\${esc(aperta.id)}" onclick="scegliFileChat(this.dataset.chat)" title="Scegli file: lo mandi a questa chat (fino a 100 MB). Finisce nella cartella del progetto, in .sierradeck/allegati, fuori da git. Se nella casella hai scritto qualcosa, va come nota." aria-label="Scegli file">📎</button>
      <button onclick="scrivi('\${escJs(aperta.id)}')">Invia</button>
    </div>\`}\`
    : '<div class="sotto" style="padding:6px 16px 0">' + esc(riassuntoChat(s.chat || [])) + '</div>' + gruppiChat(s).map((g) =>
      '<div class="sotto" style="padding:10px 16px 2px;letter-spacing:.08em;text-transform:uppercase;font-size:0.75rem">' +
        esc(g.workspace) + (g.attivo ? ' · davanti' : '') + ' · ' + g.voci.length + '</div>' +
      (g.voci.length === 0
        ? '<div class="sotto" style="padding:2px 24px 8px">nessuna chat</div>'
        : g.voci.map((v) => v.viva
          ? '<button class="voce" onclick="guarda(\\'' + escJs(v.viva.id) + '\\')">' +
            '<span class="led ' + ledChat(v.viva) + '"></span>' +
            '<span class="voce__testo"><span class="voce__nome">' + esc(v.viva.nome || v.viva.titolo) + (v.viva.altrove ? '<span class="voce__altrove">progetto su ' + esc(v.viva.altrove) + '</span>' : '') + '</span>' +
            '<span class="voce__stato voce__stato--' + statoChat(v.viva).tono + '">' + esc(statoChat(v.viva).parola) + '</span>' +
            (v.viva.ultimaRiga ? '<span class="voce__sotto">' + esc(v.viva.ultimaRiga) + '</span>' : '') +
            '</span><span class="voce__freccia">›</span></button>'
          : '<button class="voce" onclick="riprendiSalvata(\\'' + escJs(v.salvata.cwd) + '\\',\\'' + escJs(v.salvata.sessione) + '\\',\\'' + escJs(v.salvata.altrove || '') + '\\')">' +
            '<span class="led spenta"></span>' +
            '<span class="voce__testo"><span class="voce__nome" style="opacity:.7">' + esc(v.salvata.titolo || v.salvata.cwd) + (v.salvata.altrove ? '<span class="voce__altrove">progetto su ' + esc(v.salvata.altrove) + '</span>' : '') + '</span>' +
            '<span class="voce__sotto">' + (v.salvata.altrove ? 'la cartella è su ' + esc(v.salvata.altrove) + ': qui non si riapre' : v.salvata.ibernata ? 'ibernata · tocca per risvegliarla sul computer' : 'chiusa · tocca per riaprirla sul computer, con la sua storia') + '</span></span>' +
            '<span class="voce__freccia">›</span></button>'
        ).join(''))
    ).join('')

  // Aprire non distrugge niente: nel peggiore dei casi resta un riquadro in
  // piu' da chiudere al computer. Ed e' la differenza fra guardare da fuori e
  // poter cominciare qualcosa da fuori.
  const nuova = cartelle === null || delegando
    ? '<div class="piastrella"><div class="riga"><button onclick="scegliCartella()">Apri una chat nuova</button></div></div>'
    : \`<div class="piastrella">
         <div class="titolo">In quale cartella?</div>
         <div class="sotto">Solo quelle che Claude Code conosce già: le cartelle delle chat che ha nell’elenco.</div>
         \${cartelle.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessuna cartella conosciuta.</div>' : ''}
         \${cartelle.map((c, i) =>
           // Per indice, non per percorso: un percorso di Windows dentro
           // un onclick vorrebbe dire raddoppiare i backslash e sperare che
           // non contenga apici. L'indice non ha niente da sfuggire.
           // Il nome della cartella e' quello che si cerca; il percorso e' il
           // dettaglio che lo distingue da un omonimo, e si taglia **da
           // sinistra**: la parte che distingue due cartelle sta in fondo.
           '<button class="cartella" onclick="apriIn(' + i + ')">' +
           '<span class="cartella__nome">' + esc(c.split(/[\\\\/]/).filter(Boolean).pop() || c) + '</span>' +
           '<span class="cartella__dove">' + esc(c) + '</span></button>').join('')}
         <div class="riga"><button onclick="cartelle = null; pannello(ultimoStato)">Lascia stare</button></div>
       </div>\`

  // Affidare un lavoro. È il gesto che ha più senso da fermi, in piedi, con una
  // mano sola: si dice cosa si vuole e si va, e le domande della preparazione
  // arrivano qui sopra, dove si risponde. Un modulo con i criteri da compilare
  // sarebbe il modo più sicuro per non delegare mai niente da un telefono.
  const delega = !delegando
    ? '<div class="piastrella"><div class="riga"><button onclick="apriDelega()">Affida un lavoro</button></div></div>'
    : \`<div class="piastrella chiede">
         <div class="titolo">Cosa vuoi che faccia?\${aiuto('delega', 'Descrivilo con parole tue. Arriva a lui parola per parola, come mandato. Poi legge il progetto, ti fa al massimo un paio di domande (le trovi in cima ad Adesso) e aspetta il tuo «Vai».')}</div>
         <div class="riga">
           <textarea id="delega-obiettivo" rows="8" placeholder="Tutto quello che serve: l’obiettivo, i vincoli (cosa non toccare), come si capisce che ha finito. Nessun limite: puoi incollare un documento."></textarea>
         </div>
         <div class="sotto" style="margin-top:10px">In quale cartella lavora? Scegline una o scrivi il percorso intero.</div>
         <div class="riga"><input id="delega-cwd" placeholder="per esempio C:\\\\Progetti\\\\Esempio"></div>
         \${(cartelle || []).length === 0
           ? '<div class="sotto" style="margin-top:8px">Nessuna cartella conosciuta.</div>'
           : (cartelle || []).map((c, i) =>
               '<button class="cartella' + (delegaCartella === i ? ' attivo' : '') + '" onclick="scegliPer(' + i + ')">' +
               '<span class="cartella__nome">' + (delegaCartella === i ? '✓ ' : '') + esc(c.split(/[\\\\/]/).filter(Boolean).pop() || c) + '</span>' +
               '<span class="cartella__dove">' + esc(c) + '</span></button>').join('')}
         \${((s.workspace && s.workspace.nomi) || []).length > 0 ? \`
         <div class="sotto" style="margin-top:10px">In quale workspace nascono le sue chat</div>
         <select id="delega-workspace" style="width:100%;margin-top:6px">
           \${s.workspace.nomi.map((n) => '<option value="' + esc(n) + '"' + (n === s.workspace.attivo ? ' selected' : '') + '>' + esc(n) + '</option>').join('')}
         </select>\` : ''}
         <div class="riga"><input id="delega-nome" placeholder="Nome (facoltativo): se vuoto, le prime parole dell’obiettivo"></div>
         <div class="sotto" style="margin-top:10px">Pubblicazione del progetto\${aiuto('delega-regole', REGOLE.map((r) => '<b>' + esc(r.etichetta) + '</b>: ' + esc(r.spiega)).join('<br>'))}</div>
         <select id="delega-pubblicazione" style="width:100%;margin-top:6px">
           \${REGOLE.map((r) => '<option value="' + r.valore + '"' + (r.valore === 'stabile' ? ' selected' : '') + '>' + esc(r.etichetta) + '</option>').join('')}
         </select>
         <div class="sotto" style="margin-top:10px">Partenza\${aiuto('delega-partenze', PARTENZE.map((p) => '<b>' + esc(p.etichetta) + '</b>: ' + esc(p.spiega)).join('<br>'))}</div>
         <select id="delega-partenza" style="width:100%;margin-top:6px">
           \${PARTENZE.map((p) => '<option value="' + p.valore + '">' + esc(p.etichetta) + '</option>').join('')}
         </select>
         <div class="riga"><textarea id="delega-criteri" rows="3" placeholder="Come si capisce che ha finito (facoltativo, uno per riga). Se vuoto se li ricava lui."></textarea></div>
         <label class="spunta" style="display:block;margin-top:8px"><input type="checkbox" id="delega-cloud"> va sul cloud: le chat stanno sul Drive</label>\${aiuto('delega-cloud', 'Il «cloud» è il Drive di SierraDeck, dove si salvano le chat. Se le chat di questo progetto stanno sul Drive (questa spunta, oppure la sincronizzazione Drive del progetto già accesa) lavora in autonomia completa, senza farti domande: commit, unione dei suoi rami, push e pubblicazione secondo la regola qui accanto. Il remoto git e gli script di pubblicazione del progetto servono solo a sapere dove mandare su e con quale comando pubblicare. Senza Drive fa commit sui suoi rami e li unisce, e basta: niente push, niente pubblicazione. Quante chat apre lo decide lui, dentro il freno sui limiti del piano.')}
         <div class="riga">
           <button class="primario" onclick="affida()">Affida</button>
           <button onclick="delegando = false; delegaCartella = -1; cartelle = null; pannello(ultimoStato)">Lascia stare</button>
         </div>
       </div>\`

  const elencoSessioni = pannelloAperto !== 'sessioni' ? '' : \`
    <div class="piastrella">
      <div class="titolo">Riprendi una conversazione\${aiuto('sessioni', 'Le conversazioni di Claude Code su questo computer, dalla più recente: toccandone una si riapre sul computer con tutta la sua storia, nel workspace dove era salvata. Quelle «su un altro PC» vivono là: toccandone una le scrivi da qui, e quel PC la avvia in sottofondo — là non si apre nessuna finestra e non cambia niente sullo schermo — e il messaggio parte appena è pronta.')}</div>
      \${sfScelta >= 0 ? sottofondoHtml() : ''}
      \${sessioniNascoste > 0 || sessioniSenzaNome ? '<div class="riga"><label class="sotto"><input type="checkbox"' + (sessioniSenzaNome ? ' checked' : '') + ' onchange="mostraSenzaNome()"> mostra anche le senza nome' + (sessioniNascoste > 0 ? ' (' + sessioniNascoste + ', nascoste: non sono cancellate)' : '') + '</label></div>' : ''}
      \${(sessioniViste || []).length === 0
        ? '<div class="sotto" style="margin-top:8px">Nessuna conversazione trovata.</div>'
        : (sessioniViste || []).slice(0, 20).map((x, i) =>
            '<button class="cartella" onclick="riprendiSessione(' + i + ')">' +
            esc(x.titolo) + (x.altrove ? ' <span class="sotto">· su ' + esc(x.altrove) + (x.altroveAcceso === true ? ' · acceso' : x.altroveAcceso === false ? ' · spento' : '') + '</span>' : '') +
            '<br><span class="sotto">' + esc(x.cwd) + (x.altrove ? (x.altrovePc ? ' (vive su quel PC: tocca per scriverle, parte là in sottofondo)' : ' (cartella di quel PC: qui non si apre, scrivile da Computer → Altri computer)') : '') + '</span></button>' +
            (x.altrove ? '' : '<div class="riga gc-riga"><button class="riga-altro" data-s="' + esc(x.id) + '" onclick="gcApriAzioni(this.dataset.s)" aria-expanded="' + (gcAzioniDi === x.id) + '" aria-label="Chiudi, archivia o elimina">⋯ ' + (gcAzioniDi === x.id ? 'meno' : 'gestisci') + '</button>' + (gcAzioniDi === x.id ? gcTastiHtml(x.id, x.titolo, 's' + i) : '') + '</div>')).join('')}
      <div class="riga"><button onclick="apriPannello('sessioni')">Chiudi</button></div>
    </div>\`

  // Gli altri computer, e le azioni da eseguire solo la'. Stessa forma della
  // coda: elenco, poi la cassetta di uno.
  const elencoPc = !aperto('pc') ? '' : (() => {
    const pc = pcVisti || []
    if (pcAperto === null) {
      return '<div class="piastrella"><div class="titolo">Altri computer' + aiuto('altri-pc', 'I PC che usano questo stesso Drive, con le chat che hanno aperte (dal loro battito, ogni pochi minuti): pallino ambra = aspetta te. Per comandarli dal vivo apri la loro pagina (stesso indirizzo, sul loro IP). Toccandone uno lasci un’azione nella sua cassetta: si esegue solo là, in una sua chat, quando è acceso — è la strada per una cartella che sta su quel PC (un disco di rete, un progetto che non viaggia).') + '</div>' +
        (postaErrore ? '<div class="errore" style="margin-top:6px">' + esc(postaErrore) + '</div>' : '') +
        (pcVisti === null ? '<div class="sotto" style="margin-top:8px">Leggo il Drive…</div>' : '') +
        (pcVisti !== null && pc.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessun altro PC ha ancora lasciato un segno sul Drive: serve SierraDeck 0.27.0 o più nuovo su quel PC, con la cassaforte sbloccata e il Drive collegato.</div>' : '') +
        pc.map((b) =>
          '<button class="cartella" data-pc="' + esc(b.pcId) + '" onclick="apriPc(this.dataset.pc)">' + esc(nomeDaMostrare(b)) + hostPiccolo(b) +
          '<br><span class="sotto">' + (b.vivo ? 'acceso' : 'spento, ultimo segno ' + esc(String(b.battito || '').slice(0, 16).replace('T', ' '))) +
          ' · ' + (b.chat || []).length + ' chat aperte · ' + (b.cartelle || []).length + ' cartelle</span>' +
          (b.chat || []).slice(0, 8).map((c) =>
            '<span class="sotto" style="display:flex;gap:6px;align-items:center"><span class="led ' + (!b.vivo ? 'spenta' : c.aspetta ? 'ferma' : 'lavoro') + '"></span>' +
            esc(c.titolo || c.cwd) + ' · ' + (!b.vivo ? 'ultimo stato noto' : c.aspetta ? 'ferma' : 'al lavoro') + '</span>').join('') +
          '</button>').join('') +
        '<div class="riga"><button onclick="apriPannello(\\'pc\\')">Chiudi</button></div></div>'
    }
    const b = pc.find((x) => x.pcId === pcAperto) || { nome: pcAperto, cartelle: [], chat: [], vivo: false }
    const voci = postaVoci || []
    const attesa = voci.filter((v) => v.stato === 'attesa')
    const chiuse = voci.filter((v) => v.stato !== 'attesa')
    const cartelle = (b.cartelle || [])
    return '<div class="piastrella"><div class="titolo">Azioni su ' + esc(nomeDaMostrare(b)) + hostPiccolo(b) + ' · ' + (b.vivo ? 'acceso' : 'spento') + aiuto('posta', 'Quello che scrivi qui si esegue solo su ' + esc(nomeDaMostrare(b)) + ', nella cartella scelta, quando e\\' acceso: alla prima chat di quella cartella che aspetta, o a una nuova. Se la cartella la\\' non esiste, la voce fallisce e lo leggi qui.') + '</div>' +
      (postaErrore ? '<div class="errore" style="margin-top:6px">' + esc(postaErrore) + '</div>' : '') +
      (attesa.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessuna azione in attesa.</div>' : '') +
      attesa.map((v, i) =>
        '<div class="voce" style="display:block;padding:8px 10px">' +
        '<div style="white-space:pre-wrap">' + (i + 1) + '. ' + esc(v.testo) + '</div>' +
        '<div class="sotto">in ' + esc(v.cwd) + ' · da ' + esc(v.daNome) + (v.apertaIl ? ' · chat aperta, aspetto che sia pronta' : '') + '</div>' +
        '<div class="riga" style="margin-top:6px"><button data-v="' + esc(v.id) + '" onclick="togliPosta(this.dataset.v)">Togli</button></div></div>').join('') +
      (chiuse.length > 0
        ? '<div class="sotto" style="margin-top:8px">' + chiuse.map((v) => (v.stato === 'fallita' ? '✗ ' : '✓ ') + esc(v.testo.slice(0, 60)) + ' — ' + esc(v.esito || v.stato)).join('<br>') +
          ' <button onclick="pulisciPosta()" style="margin-left:6px">Pulisci</button></div>'
        : '') +
      '<select id="posta-cwd" style="width:100%;margin-top:10px;box-sizing:border-box">' +
        cartelle.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('') +
        (cartelle.length === 0 ? '<option value="">nessuna cartella nota: scrivila sotto</option>' : '') +
      '</select>' +
      '<input id="posta-cwd-libera" placeholder="oppure il percorso com\\'e\\' su quel PC (per esempio Z:/progetti/x)" style="width:100%;margin-top:6px;box-sizing:border-box">' +
      '<textarea id="posta-testo" rows="3" placeholder="L\\'azione, come la scriveresti nella chat di quel PC" style="width:100%;margin-top:6px;box-sizing:border-box"></textarea>' +
      '<div class="riga"><button onclick="chiudiPc()">Indietro</button>' +
      '<button class="primario" onclick="mandaPosta()">Manda a ' + esc(b.nome) + '</button></div></div>'
  })()

  const elencoCode = !aperto('code') ? '' : (() => {
    const progetti = (s.progetti || [])
    if (codaProgetto === null) {
      return '<div class="piastrella"><div class="titolo">Code dei progetti' + aiuto('code', 'Una fila di istruzioni per progetto, sul Drive: le consegna il PC che ha il progetto in mano, una per volta, alla prima chat del progetto che ha finito il turno. Serve a lasciare il lavoro dopo quello di adesso senza stare a guardare.') + '</div>' +
        (progetti.length === 0
          ? '<div class="sotto" style="margin-top:8px">Nessun progetto sul Drive: le code esistono solo per i progetti portati sul Drive (sul computer: Account → Progetti).</div>'
          : progetti.map((p) =>
              '<button class="cartella" onclick="apriCoda(\\'' + escJs(p.id) + '\\')">' + esc(p.nome) +
              '<br><span class="sotto">' + p.inCoda + ' in coda · ' +
              (p.chi === 'io' ? 'in lavoro qui' : p.chi === 'altro' ? 'in mano a ' + esc(p.pcNome || 'un altro PC') : 'libero: nessun PC lo sta usando') +
              '</span></button>').join('')) +
        '<div class="riga"><button onclick="apriPannello(\\'code\\')">Chiudi</button></div></div>'
    }
    const p = progetti.find((x) => x.id === codaProgetto) || { nome: codaProgetto }
    const voci = codaVoci || []
    const attesa = voci.filter((v) => v.stato === 'attesa')
    const consegnate = voci.filter((v) => v.stato === 'consegnata')
    return '<div class="piastrella"><div class="titolo">Coda · ' + esc(p.nome) + '</div>' +
      (codaErrore ? '<div class="sotto" style="margin-top:6px">' + esc(codaErrore) + '</div>' : '') +
      (attesa.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessun comando in attesa.</div>' : '') +
      attesa.map((v, i) =>
        '<div class="voce" style="display:block;padding:8px 10px">' +
        '<div style="white-space:pre-wrap">' + (i + 1) + '. ' + esc(v.testo) + '</div>' +
        '<div class="sotto">da ' + esc(v.daNome) + (v.sessione ? ' · per una chat precisa' : ' · alla prima chat libera') + '</div>' +
        '<div class="riga" style="margin-top:6px"><button onclick="togliDallaCoda(\\'' + escJs(v.id) + '\\')">Togli</button></div></div>').join('') +
      (consegnate.length > 0
        ? '<div class="sotto" style="margin-top:8px">' + consegnate.length + ' consegnate' +
          ' <button onclick="pulisciCoda()" style="margin-left:6px">Pulisci</button></div>'
        : '') +
      '<textarea id="coda-testo" rows="3" placeholder="Il comando da mettere in fila, come lo scriveresti nella chat" style="width:100%;margin-top:10px;box-sizing:border-box"></textarea>' +
      '<div class="riga"><button onclick="chiudiCoda()">Indietro</button>' +
      '<button class="primario" onclick="mettiInCoda()">Metti in coda</button></div></div>'
  })()

  // «Salute del sistema» (0.44.0): le stesse voci del PC, con spiegazione e cosa fare.
  const vistaSalute = !inVista('salute') ? '' : (() => {
    const testa = '<div class="piastrella"><div class="titolo">Salute del sistema' + aiuto('salute', 'Com’è messo il computer: il Drive, gli altri PC (ultimo segno, strada, versione), un aggiornamento non riuscito, gli errori delle ultime ore, le istruzioni degli autopiloti non partite. Ogni voce dice cosa vuol dire e cosa fare.') + '</div>'
    if (saluteErrore) return testa + '<div class="errore">' + esc(saluteErrore) + '</div></div>'
    if (!saluteVista) return testa + '<div class="sotto">Guardo…</div></div>'
    const colore = (t) => t === 'ok' ? 'var(--verde)' : t === 'attenzione' ? '#e0a33c' : '#dc5f5f'
    const nomi = { drive: 'Drive', pc: 'Gli altri PC', aggiornamento: 'Aggiornamento', errori: 'Errori delle ultime ore', consegne: 'Istruzioni non partite' }
    const azione = (a) => a.id === 'scarica-a-mano' ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.testo) + '</a>'
      : a.id === 'installa' ? '<button onclick="installaAggiornamento()">' + esc(a.testo) + '</button>'
      : a.id === 'apri-autopilota' ? '<button onclick="vaiScheda(\\'autopiloti\\')">' + esc(a.testo) + '</button>'
      : a.id === 'riprova-pc' ? '<button onclick="rileggiSalute()">' + esc(a.testo) + '</button>'
      : ''
    // 0.70.0: i gruppi come sul PC (Da sistemare · Computer · Drive · Errori · Tutto), una riga per voce con la sua parola.
    const tutte = saluteVista.voci || []
    const gruppiDi = (v) => [v.tono !== 'ok' ? 'sistemare' : '', v.gruppo === 'pc' ? 'computer' : '', v.gruppo === 'drive' ? 'drive' : '', (v.gruppo === 'errori' || v.gruppo === 'consegne' || v.gruppo === 'aggiornamento') ? 'errori' : ''].filter(Boolean)
    const conti = { sistemare: 0, computer: 0, drive: 0, errori: 0, tutto: tutte.length }
    for (const v of tutte) for (const g of gruppiDi(v)) conti[g] += 1
    const gruppo = saluteGruppo || (conti.sistemare > 0 ? 'sistemare' : 'computer')
    let corpo = '<div class="sotto" style="margin-top:6px;color:' + colore(saluteVista.tono) + '"><b>' + esc(saluteVista.riassunto) + '</b></div>' +
      '<div class="riga" style="gap:6px;flex-wrap:wrap">' + [['sistemare', 'Da sistemare'], ['computer', 'Computer'], ['drive', 'Drive'], ['errori', 'Errori'], ['tutto', 'Tutto']].map((g) =>
        '<button' + (gruppo === g[0] ? ' class="primario"' : '') + ' onclick="gruppoSalute(\\'' + g[0] + '\\')" style="flex:none;width:auto;min-height:48px;padding:6px 12px' + (g[0] === 'sistemare' && conti.sistemare > 0 ? ';color:var(--ambra,#e0a33c)' : '') + '">' + g[1] + ' ' + conti[g[0]] + '</button>').join('') + '</div>'
    const voci = tutte.filter((v) => gruppo === 'tutto' || gruppiDi(v).indexOf(gruppo) >= 0)
    // 0.81.0: le azioni che si fanno solo dal computer, dette una volta qui in cima, non riga per riga.
    const soloPc = azioniSoloDalComputer(voci)
    if (soloPc.length > 0) corpo += '<div class="sotto" style="margin-top:6px">Dal computer: ' + soloPc.map((t) => '«' + esc(t) + '»').join(', ') + '.</div>'
    if (voci.length === 0) corpo += '<div class="sotto" style="margin-top:8px">' + (gruppo === 'sistemare' ? '<span style="color:var(--verde)">Tutto a posto</span>' : 'Niente in questo gruppo.') + '</div>'
    corpo += voci.map((v) => {
      const st = v.stato || { parola: v.tono === 'ok' ? 'a posto' : v.tono === 'attenzione' ? 'da guardare' : 'da sistemare', colore: v.tono === 'ok' ? 'verde' : v.tono === 'attenzione' ? 'ambra' : 'rosso' }
      const tinta = { verde: 'var(--verde)', ambra: '#e0a33c', rosso: '#dc5f5f', blu: '#4aa3ff', quieto: 'var(--testo-quieto,#9aa1a9)' }[st.colore]
      return '<div class="salute-voce" style="border-left:3px solid ' + tinta + ';padding:4px 8px;margin-top:6px">' +
        '<div><b style="color:' + tinta + '">' + esc(st.parola) + '</b> · ' + esc(v.breve || v.titolo) +
        aiuto('salute:' + v.chiave, esc(v.titolo) + (v.spiegazione ? '<br><br>' + esc(v.spiegazione) : '') + (v.cosaFare ? '<br><br><b>Cosa fare:</b> ' + esc(v.cosaFare) : '')) + '</div>' +
        ((v.azioni || []).filter((a) => AZIONI_DAL_TELEFONO.indexOf(a.id) >= 0).length > 0 ? '<div class="riga">' + v.azioni.map(azione).join('') + '</div>' : '') +
        '</div>'
    }).join('')
    // La mappa dei PC (0.70.0): in fondo, a richiesta.
    if (saluteVista.mappa) corpo += '<div class="riga" style="margin-top:10px"><button onclick="mappaSalute()" style="flex:none;width:auto">' + (saluteMappa ? 'Nascondi la mappa' : 'Mappa dei PC') + '</button></div>' + (saluteMappa ? mappaHtml(saluteVista.mappa) : '')
    return testa + corpo + '<div class="riga"><button onclick="rileggiSalute()">Aggiorna</button></div></div>'
  })()

  const vistaDrive = !aperto('drive') ? '' : (() => {
    const c = driveCatalogo
    const l = driveLavoro || {}
    const inc = l.inCorso
    const occupato = !!inc || driveInCorso !== null
    let testa = '<div class="piastrella"><div class="titolo">Drive · il magazzino dei tuoi PC' + aiuto('drive', 'Cosa c\\'è sul Drive e cosa il computer ha già. Un progetto è la cartella in cui le chat lavorano; un workspace è una fascia a schermo con dentro delle chat. «Porta qui» fa scaricare al computer la cartella se viaggia con le chat, le chat che gli mancano, e le mette nel loro workspace; poi il computer si riavvia da solo per mostrarle. Niente viene mai cancellato.') + '</div>'
    if (inc) {
      const perc = (inc.totale || 0) > 0 ? Math.round((inc.fatto || 0) * 100 / inc.totale) : 0
      testa += '<div style="margin-top:10px"><b>' + esc(etichettaLavoro(inc.tipo)) + '</b> — ' +
        ((inc.totale || 0) > 0 ? (inc.fatto || 0) + ' di ' + inc.totale + ' file (' + perc + '%)' : 'preparo…') + (inc.annullamento ? ' · mi fermo…' : '') +
        (inc.dettaglio ? '<div class="sotto">' + (inc.verso === 'giu' ? '↓ ' : '↑ ') + esc(inc.dettaglio) + '</div>' : '') +
        '<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.12);margin-top:6px;overflow:hidden"><div style="height:100%;width:' + perc + '%;background:var(--accento,#e0a33c)"></div></div>' +
        '<div class="riga"><button onclick="driveAnnulla()"' + (inc.annullamento ? ' disabled' : '') + '>' + (inc.annullamento ? 'Mi fermo…' : 'Annulla') + '</button></div></div>'
    } else if (l.ultimo && l.ultimo.tipo !== 'salvataggio' && l.ultimo.tipo !== 'arrivo') {
      const u = l.ultimo
      testa += '<div class="sotto" style="margin-top:8px">' + esc(etichettaLavoro(u.tipo)) + ': ' + (u.esito === 'ok' ? 'fatto' : u.esito === 'annullato' ? 'annullato' : 'non riuscito') + (u.messaggio ? ' — ' + esc(u.messaggio) : '') + '</div>'
      if (u.riavvioConsigliato && !driveRiavviato) {
        testa += '<div class="sotto" style="margin-top:6px">Sono arrivate chat o cartelle: SierraDeck sul computer si riavvia da solo fra pochi secondi per mostrarle. Se non lo fa, chiediglielo da qui.</div>' +
          '<div class="riga"><button class="primario" onclick="driveRiavvia()">Riavvia SierraDeck sul computer</button></div>'
      }
    }
    if (driveErrore) testa += '<div class="sotto" style="margin-top:6px">' + esc(driveErrore) + '</div>'
    if (driveLeggo) {
      // La finestra di attesa: barra, fase in corso e cosa sta facendo, le
      // sei fasi. Sul telefono e' una piastrella, ma con le stesse parole.
      const p = driveProgresso
      let i = p ? FASI_CATALOGO.findIndex((f) => f.fase === p.fase) : 0
      if (i < 0) i = 0
      let prima = 0
      for (let k = 0; k < i; k++) prima += FASI_CATALOGO[k].quota
      const dentro = p && p.totale > 0 ? Math.min(1, (p.fatto || 0) / p.totale) : 0
      const perc = Math.round(prima + FASI_CATALOGO[i].quota * dentro)
      const f = FASI_CATALOGO[i]
      const conteggio = p && p.fase === 'impronte' && p.totale != null ? ' <span class="sotto">· ' + (p.totale === 0 ? 'nessun file da controllare' : (p.fatto || 0) + ' di ' + p.totale + ' file') + '</span>' : ''
      testa += '<div style="margin-top:10px"><b><span class="led attesa"></span>Leggo il Drive…</b> <span class="sotto">' + perc + '%</span>' +
        '<div class="barra"><i style="width:' + perc + '%"></i></div>' +
        '<div style="margin-top:8px"><b>Fase ' + (i + 1) + ' di ' + FASI_CATALOGO.length + ' · ' + esc(f.nome) + '</b>' + conteggio + '</div>' +
        '<div class="sotto">' + esc(f.spiegazione) + '</div>' +
        '<div class="sotto" style="margin-top:6px">' + FASI_CATALOGO.map((g, k) => (k < i ? '✓ ' : k === i ? '▶ ' : '○ ') + esc(g.nome)).join(' · ') + '</div>' +
        '<div class="sotto" style="margin-top:6px">Leggere il Drive non tocca niente.' + aiuto('drive-leggo', 'Leggere il Drive non tocca niente: il computer legge e basta. Quando ha finito compare il catalogo.') + '</div></div>'
      if (!c) return testa + '<div class="riga"><button onclick="apriPannello(\\'drive\\')">Chiudi</button></div></div>'
    }
    if (!c) return testa + '<div class="sotto" style="margin-top:8px">Il Drive non è stato letto: «Aggiorna» riprova.</div><div class="riga"><button onclick="leggiDrive()">Aggiorna</button><button onclick="apriPannello(\\'drive\\')">Chiudi</button></div></div>'
    testa += '<div class="riga" style="margin-top:8px"><button' + (driveVista === 'progetti' ? ' class="primario"' : '') + ' onclick="driveVistaCambia(\\'progetti\\')">Per progetto</button>' +
      '<button' + (driveVista === 'workspace' ? ' class="primario"' : '') + ' onclick="driveVistaCambia(\\'workspace\\')">Per workspace (' + c.workspace.length + ')</button>' +
      '<button onclick="leggiDrive()">Aggiorna</button></div>' +
      '<div class="sotto">' + c.totali.progetti + ' progetti · ' + c.totali.chat + ' chat · ' + c.totali.daPortare + ' da portare sul computer · ' + c.totali.uguali + ' uguali</div>'
    const statoChat = (ch) => ch.altroveQui ? 'già sul computer' : ch.stato === 'uguale' ? 'uguale' : ch.stato === 'indietro' ? 'da aggiornare' : ch.stato === 'avanti' ? 'più avanti sul computer' : ch.stato === 'soloDrive' ? 'solo sul Drive' : 'solo sul computer'
    let corpo = ''
    if (driveVista === 'progetti') {
      if (c.progetti.length === 0) corpo += '<div class="sotto" style="margin-top:8px">Sul Drive non c\\'è ancora niente.</div>'
      corpo += c.progetti.map((g) => {
        const n = g.conti.soloDrive + g.conti.indietro + g.file.soloDrive + g.file.indietro
        const k = 'p:' + g.chiave
        const stato = g.stato === 'allineato' ? 'allineato: il computer ha già tutto' : g.stato === 'daPortare' ? n + ' da portare sul computer' : g.stato === 'daAggiornare' ? n + ' da aggiornare sul computer' : g.stato === 'soloQui' ? 'solo sul computer: sale al prossimo salvataggio' : n + ' da portare · ' + (g.conti.soloQui + g.conti.avanti + g.file.soloQui + g.file.avanti) + ' da mandare su'
        return '<div class="voce" style="display:block;padding:8px 10px"><div><b>' + esc(g.nome) + '</b> <span class="sotto">· ' + g.chat.length + ' chat' + (g.cartellaSulDrive ? ' · cartella sul Drive' : '') + ' · ' + (g.origine === 'qui' ? 'di questo PC' : g.origine === 'altrove' ? 'nata su un altro PC' : 'di più PC') + '</span></div>' +
          '<div class="sotto">' + esc(stato) + '</div>' +
          '<div class="riga" style="margin-top:6px">' +
          (n > 0 ? '<button class="primario" onclick="drivePorta(\\'' + escJs(g.chiave) + '\\')"' + (occupato ? ' disabled' : '') + '>' + (driveInCorso === k ? 'Porto…' : (g.stato === 'daAggiornare' ? 'Aggiorna' : 'Porta qui') + ' (' + n + ')') + '</button>' : '') +
          '<button onclick="driveCommuta(\\'' + escJs(k) + '\\')">' + (driveAperti[k] ? 'Nascondi le chat' : 'Vedi le ' + g.chat.length + ' chat') + '</button></div>' +
          (driveAperti[k] ? g.chat.map((ch) => '<div class="sotto" style="padding-left:8px">' + esc(ch.titolo) + ' · ' + esc(statoChat(ch)) + '</div>').join('') : '') +
          '</div>'
      }).join('')
    } else {
      if (c.workspace.length === 0) corpo += '<div class="sotto" style="margin-top:8px">Sul Drive non ci sono workspace salvati.</div>'
      corpo += c.workspace.map((w) => {
        const k = 'w:' + w.nome
        const stato = w.daPortare > 0 ? w.daPortare + ' chat da portare sul computer' : w.quiEsiste ? 'allineato' : 'chat già sul computer: manca solo il workspace'
        return '<div class="voce" style="display:block;padding:8px 10px"><div><b>' + esc(w.nome) + '</b> <span class="sotto">· ' + w.chat.length + ' chat in ' + w.progetti.length + (w.progetti.length === 1 ? ' progetto' : ' progetti') + (w.quiEsiste ? ' · esiste già sul computer' : ' · non esiste ancora sul computer') + '</span></div>' +
          '<div class="sotto">' + esc(stato) + '</div>' +
          '<div class="riga" style="margin-top:6px">' +
          (w.daPortare > 0 || !w.quiEsiste ? '<button class="primario" onclick="drivePortaWs(\\'' + escJs(w.nome) + '\\')"' + (occupato ? ' disabled' : '') + '>' + (driveInCorso === k ? 'Porto…' : w.daPortare > 0 ? 'Porta qui (' + w.daPortare + ')' : 'Crea qui') + '</button>' : '') +
          '<button onclick="driveCommuta(\\'' + escJs(k) + '\\')">' + (driveAperti[k] ? 'Nascondi le chat' : 'Vedi le ' + w.chat.length + ' chat') + '</button></div>' +
          (driveAperti[k] ? w.chat.map((ch) => '<div class="sotto" style="padding-left:8px">' + esc(ch.titolo) + ' · ' + esc(ch.progetto || '') + ' · ' + esc(statoChat(ch)) + '</div>').join('') : '') +
          '</div>'
      }).join('')
    }
    return testa + corpo + '<div class="riga"><button onclick="apriPannello(\\'drive\\')">Chiudi</button></div></div>'
  })()

  const vistaConsumi = !aperto('consumi') ? '' : \`
    <div class="piastrella">
      <div class="titolo">Consumi</div>
      \${consumiVisti === null
        ? '<div class="sotto">Non sono riuscito a leggerli.</div>'
        : '<div class="numeri" style="margin-top:12px">' +
          '<div class="numero"><b>' + esc(token(consumiVisti.oggi)) + '</b><span>oggi</span></div>' +
          '<div class="numero"><b>' + esc(token(consumiVisti.settimana)) + '</b><span>7 giorni</span></div>' +
          '<div class="numero"><b>' + esc(token(consumiVisti.totale)) + '</b><span>totale</span></div>' +
          '</div>' +
          '<div class="sotto" style="margin-top:10px">Token letti dalle trascrizioni. Oggi: ' + esc(quote(consumiVisti.oggi)) + '.</div>' +
          limitiHtml(consumiVisti)}
      <div class="riga"><button onclick="apriPannello('consumi')">Chiudi</button></div>
    </div>\`

  // Il Quaderno (0.70.0): i tag con quante schede, la ricerca, la data corta e i tag su ogni riga.
  const vistaQuaderno = pannelloAperto !== 'quaderno' ? '' : quadernoHtml(schedeViste, schedaAperta, quadernoTag, cartellaPrima(), Date.now())

  // Le impostazioni rifatte (0.56.0), in versione semplice: la ricerca in alto,
  // «Aggiornamenti» in cima, poi le sezioni del PC e dell'app con la loro spiegazione.
  // 0.62.0: la sezione e le sue voci si spiegano tutte nel «?» del titolo.
  // Sotto restano solo i comandi: le voci in fila con il loro «?» ripetevano
  // i titoli di quello che c'era già sopra.
  const intestaImp = (id) => {
    const g = IMPOSTAZIONI_PAGINA.find((x) => x.sezione.id === id)
    if (!g) return ''
    const testo = (g.sezione.spiega ? '<p>' + esc(g.sezione.spiega) + '</p>' : '') + g.voci.map((v) => '<p><b>' + esc(v.titolo) + '</b>: ' + esc(v.spiega) + '</p>').join('')
    return '<div class="titolo">' + esc(g.sezione.titolo) + (testo ? aiuto('imp:' + id, testo) : '') + '</div>'
  }
  const vociImp = () => ''
  // 0.83.0: ogni sezione è una voce di Altro, e se ne mostra una sola: la
  // piastrella con il suo data-sezione (la ricerca sta nell'elenco di Altro).
  const tutteImpostazioni = !inVista('impostazioni') ? '' : \`
    <div class="piastrella" data-sezione="aggiornamenti">
      \${intestaImp('aggiornamenti')}
      <div class="sotto" style="margin-top:10px">Versione del computer: \${esc((s.computer && s.computer.versione) || 'non ancora letta')}\${aiuto('imp-versioni', 'Questa pagina la serve quel computer: è sempre della sua stessa versione.')}</div>
      <div class="sotto" style="margin-top:10px"><b>Aggiornamento del computer</b></div>
      <div class="sotto">\${esc(descriviAggiornamento())}</div>
      \${fallitoHtml(aggiornamentoVisto)}
      <div class="riga">
        \${aggiornamentoVisto && aggiornamentoVisto.fase === 'disponibile'
          ? '<button onclick="scaricaAggiornamento()">Scarica</button>' : ''}
        \${aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto' && !noteAgg
          ? '<button onclick="installaAggiornamento()">Cosa cambia e installa</button>' : ''}
        \${aggiornamentoVisto && aggiornamentoVisto.fase === 'attendo'
          ? '<button disabled>' + (aggiornamentoVisto.attesa ? 'Aspetto il Drive…' : 'Aspetto le chat…') + '</button>' : ''}
        \${!aggiornamentoVisto || ['fermo', 'aggiornato', 'errore', 'pronto', 'disponibile'].indexOf(aggiornamentoVisto.fase) >= 0
          ? '<button onclick="cercaAggiornamento()">Cerca ora</button>' : ''}
      </div>
      \${noteAggHtml(noteAgg)}
      \${vociImp('aggiornamenti')}
    </div>
    <div class="piastrella" data-sezione="drive">
      \${intestaImp('drive')}
      \${catenaAccountHtml(accountVisto)}
      \${vociImp('drive')}
      <div class="sotto">Il contenuto del Drive, «Porta qui» e il salvataggio stanno in PROGETTI.</div>
    </div>
    <div class="piastrella" data-sezione="chat">
      \${intestaImp('chat')}
      \${migrazioneHtml()}
      \${vociImp('chat')}
      \${quadernoPersonaleHtml()}
    </div>
    <div class="piastrella" data-sezione="aspetto">
      <div class="titolo">Aspetto</div>
      \${prefViste === null ? '<div class="sotto">Non sono riuscito a leggerle.</div>' : \`
        <div class="sotto" style="margin-top:10px">Stile della console\${aiuto('imp-stile', '«Banco»: cornici sottili, più righe; «Foglio»: più aria, angoli morbidi. Vale anche per il computer.')}</div>
        <div class="ws" style="margin-top:8px">
          <button class="\${prefViste.stile === 'banco' ? 'attivo' : ''}" onclick="cambiaPref('stile', 'banco')">Banco</button>
          <button class="\${prefViste.stile === 'foglio' ? 'attivo' : ''}" onclick="cambiaPref('stile', 'foglio')">Foglio</button>
        </div>
        <div class="sotto" style="margin-top:14px">Chiarore del fondo: \${prefViste.chiarore}\${aiuto('imp-chiarore', '0 è nero, 100 chiaro. Vale anche per il computer e l’app.')}</div>
        <input type="range" min="0" max="100" value="\${prefViste.chiarore}" style="width:100%"
          onchange="cambiaPref('chiarore', Number(this.value))">
      \`}
    </div>
    <div class="piastrella" data-sezione="notifiche">
      \${intestaImp('notifiche')}
      \${vociImp('notifiche')}
    </div>
    <div class="piastrella" data-sezione="info">
      \${intestaImp('info')}
      \${vociImp('info')}
      <div class="riga"><button onclick="copiaDettagli()">Copia i dettagli</button></div>
      \${sezioneErroriPagina()}
    </div>\`

  const ws = (s.workspace && s.workspace.nomi || []).length > 0

  // Chi arriva da un telefono Android puo' avere l'app, che sa fare una cosa
  // che il browser non puo': avvisare quando e' chiusa. Si dice una volta e si
  // ricorda la risposta - un invito che torna a ogni apertura e' un fastidio.
  const invito = proponeApp(
    navigator.userAgent,
    appAndroid.versione,
    localStorage.getItem('sierradeck.nienteapp'),
    window.matchMedia('(display-mode: standalone)').matches
  )
    ? \`<div class="piastrella chiede">
         <div class="titolo">\${versioneApp(navigator.userAgent) ? 'C’è l’app ' + esc(appAndroid.versione) : 'C’è l’app per Android'}</div>
         <div class="sotto">\${versioneApp(navigator.userAgent)
           ? 'Hai la ' + esc(versioneApp(navigator.userAgent)) + ': questa è più nuova.'
           : 'Avvisa anche quando è chiusa: il browser, su una rete di casa, non può farlo.'}</div>
         <div class="riga">
           <a class="tasto-link" href="\${esc(appAndroid.url)}" download>Scarica l’app \${esc(appAndroid.versione)}</a>
           <button onclick="localStorage.setItem('sierradeck.nienteapp', appAndroid.versione || '1'); aggiorna()">No, grazie</button>
         </div>
       </div>\`
    : ''

  // Quello che c'era nei campi si conserva e si rimette: un ridisegno che
  // arriva un istante prima dell'invio non deve portarsi via il testo.
  const scritti = {}
  for (const campo of app.querySelectorAll('input, textarea')) {
    if (campo.id && campo.value) scritti[campo.id] = campo.value
  }
  // Dov'era lo scorrimento: si rimette appena il documento e' rifatto.
  const dove = segnaScorrimento()

  // Il filo rosso: quello che stai guardando non e' di adesso. Sta in cima
  // perche' cambia il significato di tutto quello che c'e' sotto.
  const motivoNC = motivoNonCollegoJs(chiaveRifiutataIl > 0, location.hostname)
  const fermo = giriFalliti >= 2
    ? '<div class="scollegato">' + esc(motivoNC.titolo) + aiuto('non-collego', esc(motivoNC.dettagli)) +
      '<br><span>' + esc(motivoNC.rimedio) + ' Non parlo con il computer da ' + daQuando(ultimoContatto) + ': quello che vedi è di prima.</span>' +
      '<div class="riga"><button onclick="aggiorna()">Riprova</button></div></div>'
    : ''

  // ── Le quattro destinazioni ────────────────────────────────────────────
  // Gli stessi contenuti di prima, smistati. Il riquadro dei cinque bottoni
  // non c'e' piu': era un menu alla **fine** di uno scorrimento infinito, che
  // apriva i suoi pannelli ancora piu' sotto — con sei chat aperte, «Consumi»
  // era a dodici schermate dal pollice.
  // Il menu dei workspace (0.82.0): ricerca, gruppi e «⋯» per riga, come sul PC
  // (rinominare ed eliminare valgono per ogni workspace, non solo quello davanti).
  const paneWorkspace = ws
    ? '<div class="piastrella"><div class="titolo">Workspace' + aiuto('ws-menu', 'Tocca un workspace per metterlo davanti sul computer. «⋯» ha le altre azioni: rinomina, Apri cartella (la sezione File sulla cartella del suo progetto), Elimina. «Recenti» sono gli ultimi dove sei andato; sotto, uno per PC: quelli degli altri PC qui non ci sono, e «Porta qui» li copia dal Drive.') + '</div>' +
      '<input id="ws-cerca" class="ws-cerca" type="search" placeholder="Cerca fra ' + (s.workspace.nomi || []).length + ' workspace" aria-label="Cerca un workspace per nome" oninput="wsCerca(this.value)" value="' + esc(wsFiltro) + '">' +
      '<div id="ws-lista" class="ws-elenco">' + wsListaHtml(s) + '</div>' +
      '<div class="riga"><input id="ws-nuovo" placeholder="un workspace nuovo">' +
      '<button onclick="creaWorkspace()">Crea</button></div>' +
      eliminatiWsHtml() +
      '</div>'
    : ''

  // In moto adesso (era la scheda «Adesso»): sta sotto le Domande (0.61.0).
  const inMotoAdesso = driveScollegatoHtml(s) + fermo + invito + bloccati + aspettanoTe + panoramica +
    (inMoto.length + (s.chat || []).length > 0 ? polso : '')
  const inCoda = (s.progetti || []).reduce((n, p) => n + (p.inCoda || 0), 0)
  // Le quattro voci del telefono (0.83.0), come nell'app: ogni voce del PC
  // finisce in una sola (MENU_TELEFONO), con le sue linguette o il suo elenco.
  const lingua = linguettaDi(posto)
  // Le note che una chat o «Apri cartella» lasciano: in cima a Chat, in ogni linguetta.
  const noteChat = driveScollegatoHtml(s) +
    (notaChiusa ? '<div class="nota-chiusa" role="status">' + esc(notaChiusa) + ' <button class="riga-altro" onclick="notaChiusa=\\'\\';pannello(ultimoStato)">ok</button></div>' : '') +
    (notaCartella ? '<div class="nota-chiusa" role="status">' + esc(notaCartella) + ' <button class="riga-altro" onclick="notaCartella=\\'\\';pannello(ultimoStato)">ok</button></div>' : '')
  const schermate = {
    // «Adesso»: in cima le domande per te, sotto gli autopiloti e quello che è
    // in moto. Con un autopilota aperto c'è solo lui: la casella in fondo e,
    // sopra, la sua conversazione.
    adesso: apAperto
      ? autopiloti
      : (domandeConversazioni ? vistaConversazioni() : vistaDomande(s)) +
        '<div class="solco"></div><div class="titolo">Autopiloti</div>' + postiChatHtml(s) +
        (autopiloti || '<div class="vuoto">Nessun autopilota su questo computer.</div>') + delega +
        (inMotoAdesso ? '<div class="solco"></div><div class="titolo">In moto adesso</div>' + inMotoAdesso : ''),
    // «Chat»: Chat · Workspace · Negozio.
    chat: noteChat + (lingua === 1
      ? (paneWorkspace || '<div class="vuoto">Nessun workspace sul computer.</div>')
      : lingua === 2
        ? negozioHtml()
        : (pannelloAperto !== 'chatgestione' ? gcNotaHtml() + gcConfermaHtml() : '') +
          (chat || '<div class="vuoto">Nessuna chat aperta sul computer.</div>') + nuova +
          '<div class="riga"><button onclick="apriPannello(\\'sessioni\\')">Riprendi una conversazione</button>' +
          '<button onclick="apriPannello(\\'chatgestione\\')">Spazio delle chat</button></div>' +
          elencoSessioni + (pannelloAperto === 'chatgestione' ? gestioneChatHtml() : '')),
    // «Progetti»: Progetti · File · Drive (con le code dei progetti).
    progetti: lingua === 1
      ? fileHtml()
      : lingua === 2
        ? vistaDrive + elencoCode
        : pannelloDriveHtml() +
          '<div class="riga"><button onclick="apriPannello(\\'quaderno\\')">Quaderno</button>' +
          '<button onclick="vaiLinguetta(2)">Code dei progetti' + (inCoda > 0 ? ' \u00b7 ' + inCoda : '') + '</button></div>' +
          vistaQuaderno,
    // «Altro»: l'elenco, o la sezione aperta.
    altro: posto.sezione === null
      ? elencoAltroHtml()
      : posto.sezione === 'salute' ? vistaSalute
      : posto.sezione === 'pc' ? elencoPc
      : posto.sezione === 'consumi' ? vistaConsumi
      : sezioneImpostazioni(tutteImpostazioni, posto.sezione)
  }

  app.innerHTML = \`
    <main class="schermata\${linea.fase === 'ricollego' ? ' schermata--giu' : ''}">
      \${lineaHtml()}
      \${notaGlobale ? '<div class="piastrella"><div class="errore">' + esc(notaGlobale) + '</div><div class="riga"><button onclick="chiudiNota()">Ok</button></div></div>' : ''}
      \${linguetteHtml()}
      \${schermate[posto.voce] || schermate.adesso}
    </main>
    \${fascia(s)}\`

  for (const id in scritti) {
    const campo = document.getElementById(id)
    if (campo) campo.value = scritti[id]
  }
  // La ricerca di Altro resta applicata anche dopo un ridisegno (0.83.0).
  if (scritti['cerca-impostazioni']) filtraImpostazioni(scritti['cerca-impostazioni'])
  rimettiScorrimento(dove)
  armaIndietro()
}

/**
 * Guardare dentro una chat.
 *
 * Le righe si chiedono per **una** chat sola, quella che si sta guardando:
 * mandarle tutte con l'elenco vorrebbe dire decine di kilobyte al minuto sulla
 * rete del telefono per righe che nessuno legge.
 */
window.guarda = async (id) => {
  dentro = id
  righeDentro = []
  righeGrezze = []
  scelteDentro = null
  notaScelta = null
  await leggiDentro()
  pannello(ultimoStato)
}
window.chiudiDentro = () => { dentro = null; righeDentro = []; righeGrezze = []; scelteDentro = null; notaScelta = null; pannello(ultimoStato) }

// Il PIN delle chat (0.49.0): la chat aperta e' protetta e non sbloccata da questo telefono.
var pinDentro = false
var pinNota = ''
window.sbloccaPin = async () => {
  const campo = document.getElementById('pin-dentro')
  const pin = campo ? campo.value : ''
  if (!dentro || pin === '') return
  try {
    await chiedi('/api/pin/sblocca', { chat: dentro, pin })
    pinNota = ''
    await leggiDentro()
  } catch (e) {
    pinNota = String(e && e.message ? e.message : e)
  }
  pannello(ultimoStato)
}

/*
 * I file dal telefono (0.50.0): «Scegli file» nella chat e nell'autopilota.
 * Il file va a pezzi da 96 KB (il computer ne dice la misura), con
 * l'avanzamento; se la rete cade si chiede al computer dove era arrivato e si
 * riparte da li'. Arriva nella cartella del progetto, in .sierradeck/allegati,
 * e la chat (o l'autopilota) riceve una riga che glielo dice. Il PIN della
 * chat vale come per scrivere: 423 mostra il lucchetto.
 */
var allegatoNota = ''
var allegatoDest = null
const ALLEGATO_MAX = 100 * 1024 * 1024
const sceltaFile = document.createElement('input')
sceltaFile.type = 'file'
sceltaFile.multiple = true
sceltaFile.style.display = 'none'
function apriScelta() { if (!sceltaFile.isConnected) document.body.appendChild(sceltaFile); sceltaFile.value = ''; sceltaFile.click() }
// Come misura() di file-telefono e inMb() di allegati: «40 byte», «12 KB», «3,4 MB», «12 MB» (mai «0,0 MB»).
function inMb(b) { if (b < 1024) return b + ' byte'; if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB'; const mb = b / 1048576; return mb >= 10 ? Math.round(mb) + ' MB' : mb.toFixed(1).replace('.', ',') + ' MB' }
function nuovoIdInvio() {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return 'p' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('')
}
function inBase64(buf) {
  const u = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000))
  return btoa(s)
}
const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms))
async function mandaUnFile(file, dest, nota) {
  const id = nuovoIdInvio()
  const i = await chiedi('/api/allegati/inizia', Object.assign({ id: id, nome: file.name, byte: file.size }, dest, nota ? { nota: nota } : {}))
  if (i && i.errore) throw new Error(i.errore)
  const pezzo = i.pezzo || 98304
  var da = i.ricevuti || 0
  var tentativi = 0
  while (da < file.size) {
    try {
      const p = await chiedi('/api/allegati/pezzo', { id: id, da: da, dati: inBase64(await file.slice(da, da + pezzo).arrayBuffer()) })
      // Anche il 409 (pezzo fuori posto) dice dove riprendere.
      if (p && typeof p.ricevuti === 'number') da = p.ricevuti
      else throw new Error((p && p.errore) || 'risposta inattesa dal computer')
      tentativi = 0
    } catch (e) {
      // Un rifiuto vero (PIN, invio sparito, troppo grande) non si riprova; la rete caduta si'.
      if (e && e.stato && e.stato < 500) throw e
      tentativi += 1
      if (tentativi > 8) throw e
      allegatoNota = file.name + ': la rete è caduta, riprovo fra poco (' + tentativi + ')…'
      pannello(ultimoStato)
      await aspetta(Math.min(15000, 1000 * tentativi * tentativi))
      try { const s = await chiedi('/api/allegati/stato', { id: id }); if (s && typeof s.ricevuti === 'number') da = s.ricevuti } catch (x) { }
    }
    allegatoNota = file.name + ': ' + Math.floor(da * 100 / Math.max(1, file.size)) + '% (' + inMb(da) + ' di ' + inMb(file.size) + ')'
    pannello(ultimoStato)
  }
  const f = await chiedi('/api/allegati/fine', { id: id })
  if (f && f.errore) throw new Error(f.errore)
  return f
}
sceltaFile.onchange = async () => {
  const file = Array.from(sceltaFile.files || [])
  const dest = allegatoDest
  if (!dest || file.length === 0) return
  const campo = document.getElementById(dest.chat ? 't-' + dest.chat : 'dialogo-' + dest.autopilota)
  const nota = campo ? campo.value.trim() : ''
  const fatti = []
  for (const f of file) {
    if (f.size > ALLEGATO_MAX) { allegatoNota = f.name + ' è di ' + inMb(f.size) + ': il limite è 100 MB.'; pannello(ultimoStato); continue }
    try {
      const r = await mandaUnFile(f, dest, nota)
      fatti.push('✓ arrivato: ' + r.nome + ' in ' + r.percorso + (r.avviso ? ' — ' + r.avviso : r.avvisata === 'chat' ? ' (la chat è avvisata)' : r.avvisata === 'autopilota' ? ' (è nel suo dialogo)' : ''))
      allegatoNota = fatti.join(' · ')
      if (campo) campo.value = ''
    } catch (e) {
      if (e && e.stato === 423 && dest.chat) pinDentro = true
      allegatoNota = 'Non è arrivato ' + f.name + ': ' + (e && e.message ? e.message : 'il computer non risponde')
    }
    pannello(ultimoStato)
  }
}
window.scegliFileChat = (id) => { allegatoDest = { chat: id }; allegatoNota = ''; apriScelta() }
window.scegliFileAp = (id) => { allegatoDest = { autopilota: id }; allegatoNota = ''; apriScelta() }

async function leggiDentro(nuovo) {
  if (!dentro) return
  try {
    const r = await chiedi('/api/dentro', { chat: dentro })
    righeDentro = r.righe || []
    righeGrezze = r.grezze || []
    continuaDentro = Array.isArray(r.continua) && r.continua.length === righeGrezze.length ? r.continua : null
    colonneDentro = typeof r.colonne === 'number' ? r.colonne : 0
    scelteDentro = r.scelte || null
    if (scelteDentro && sceltaRisposta && sceltaRisposta.firma === firmaScelte(scelteDentro) &&
        Date.now() - sceltaRisposta.quando < SCELTA_RISPOSTA_MS) scelteDentro = null
    if (scelteDentro) notaScelta = null
    pinDentro = false
  } catch (e) {
    // Protetta dal PIN (0.49.0): si resta sulla chat, con il lucchetto.
    if (e && e.stato === 423) {
      pinDentro = true
      righeDentro = []
      righeGrezze = []
      scelteDentro = null
      return
    }
    // Una chat chiusa al computer mentre la si guardava: si torna all'elenco
    // invece di restare su un riquadro che non esiste piu'. Chiusa da te là
    // (0.60.9, \`chiuse\` in /api/stato): lo si dice, con l'ora.
    var vista = ((ultimoStato && ultimoStato.chat) || []).filter(function (c) { return c.id === dentro })[0]
    var chiusa = vista && vista.sessione ? (((nuovo || ultimoStato || {}).chiuse) || []).filter(function (c) { return c.sessione === vista.sessione })[0] : null
    if (chiusa) notaChiusa = '«' + (vista.titolo || 'La chat') + '» l’hai chiusa sul computer alle ' + new Date(chiusa.il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ': si chiude anche qui. La conversazione non è cancellata: la ritrovi in «Riprendi una conversazione».'
    dentro = null
    righeDentro = []
    righeGrezze = []
    scelteDentro = null
  }
}

window.scegliCartella = async () => {
  try {
    const r = await chiedi('/api/cartelle')
    cartelle = r.cartelle || []
  } catch (e) {
    cartelle = []
  }
  pannello(ultimoStato)
}
window.apriIn = async (i) => {
  const scelta = (cartelle || [])[i]
  if (!scelta) return
  await chiedi('/api/apri', { cartella: scelta })
  cartelle = null
  // La chat nuova compare nell'elenco appena il computer la annuncia: un paio
  // di secondi, il tempo del prossimo giro.
  aggiorna()
}

window.apriDelega = async () => {
  delegando = true
  delegaCartella = -1
  try {
    const r = await chiedi('/api/cartelle')
    cartelle = r.cartelle || []
  } catch (e) {
    cartelle = []
  }
  // Una sola cartella conosciuta e' gia' la scelta: chiedere di toccarla
  // sarebbe un gesto per niente.
  if (cartelle.length === 1) delegaCartella = 0
  pannello(ultimoStato)
}
window.scegliPer = (i) => {
  delegaCartella = i
  const c = document.getElementById('delega-cwd')
  if (c && (cartelle || [])[i]) c.value = cartelle[i]
  pannello(ultimoStato)
}
window.affida = async () => {
  const val = (id) => { const e = document.getElementById(id); return e ? e.value : '' }
  // La validazione è quella del PC (0.55.0): la fa il computer con la stessa
  // funzione della sua finestra, e il perché torna qui per esteso.
  const corpo = {
    obiettivo: val('delega-obiettivo'), cartella: val('delega-cwd').trim() || (cartelle || [])[delegaCartella] || '',
    nome: val('delega-nome'), criteri: val('delega-criteri'),
    pubblicazione: val('delega-pubblicazione') || 'stabile', partenza: val('delega-partenza') || 'via',
    vaSulCloud: !!(document.getElementById('delega-cloud') || {}).checked
  }
  if (val('delega-workspace')) corpo.workspace = val('delega-workspace')
  try {
    await chiedi('/api/autopilota/crea', corpo)
  } catch (e) {
    notaGlobale = 'Non l’ho affidato: ' + ((e && e.message) || 'il computer non risponde')
    pannello(ultimoStato)
    return
  }
  delegando = false
  delegaCartella = -1
  cartelle = null
  // Compare fra gli autopiloti al prossimo giro, e comincia a prepararsi.
  aggiorna()
}

/**
 * Guardare dentro un autopilota: tutto quello che il pannello mostra al
 * computer - dove si trova nel suo percorso, quanto manca, i criteri che si e'
 * dato, cosa ha deciso finora.
 *
 * Si chiede quando si apre, non nell'elenco: l'elenco viaggia ogni due secondi
 * e mandare tutto sarebbe spedire un libro per leggerne il titolo.
 */
/** Dalla scheda Domande alla linguetta «Domande» dell'autopilota (0.38.0). */
window.apriDomandeAp = async (id) => {
  apTabPrima = apTab === 'domande' ? apTabPrima : apTab
  apTab = 'domande'
  apDomandaI = 0
  vaiScheda('autopiloti')
  await guardaAp(id)
}
window.guardaAp = async (id, pc, nomePc) => {
  // Un autopilota di un altro PC (0.59.0): da qui ogni chiamata passa dal ponte.
  apPc = pc || null
  apPcNome = nomePc || ''
  dentroAp = id
  apDettaglio = null
  pannello(ultimoStato)
  await leggiAp()
  pannello(ultimoStato)
  // All'apertura in vista chi lavora, la conversazione e il campo, non solo la situazione (prova del 18/10).
  const alLavoro = document.getElementById('al-lavoro-ap')
  if (alLavoro && alLavoro.scrollIntoView) alLavoro.scrollIntoView({ block: 'start' })
}
window.chiudiAp = () => { apRiassunto = false; apPc = null; apPcNome = ''; dentroAp = null; apDettaglio = null; apDomandeViste = null; apFile = null; apIstr = null; apIstrCorreggi = null; apFileScelto = null; apDiff = null; pannello(ultimoStato) }

async function leggiAp() {
  if (!dentroAp) return
  try {
    apDettaglio = await chiediAp('/api/autopilota', { autopilota: dentroAp })
    // La Panoramica del suo workspace (0.77.0); un PC più vecchio non la ha: niente.
    if (apDettaglio && apDettaglio.workspace) {
      try { panoramicaAp = await chiediAp('/api/panoramica', { workspace: apDettaglio.workspace }) } catch (e) { panoramicaAp = null }
    } else panoramicaAp = null
    // Le domande della linguetta (0.38.0): una nuova la fa avanti; finite, si
    // torna alla linguetta di prima.
    const chiavi = (apDettaglio.domandeScheda || []).map((d) => d.chiave)
    const nuova = apDomandeViste !== null && chiavi.some((k) => apDomandeViste.indexOf(k) < 0)
    if ((nuova || (apDomandeViste === null && chiavi.length > 0)) && apTab !== 'domande') { apTabPrima = apTab; apTab = 'domande' }
    if (chiavi.length === 0 && apTab === 'domande') apTab = apTabPrima
    if (apDomandaI >= chiavi.length) apDomandaI = 0
    apDomandeViste = chiavi
    if (apTab === 'file') {
      try { apFile = await chiediAp('/api/autopilota/file', { autopilota: dentroAp }) } catch (e) { apFile = { errore: String(e && e.message ? e.message : e) } }
    }
    if (apTab === 'istruzioni') {
      try { apIstr = await chiediAp('/api/autopilota/istruzioni', { autopilota: dentroAp }) } catch (e) { apIstr = { errore: String(e && e.message ? e.message : e) } }
    }
  } catch (e) {
    // Un autopilota di un altro PC (0.59.0): quel PC non risponde. Lo si dice,
    // con il perché e le strade provate, e la scheda resta: riprova da sola.
    if (apPc) { notaGlobale = (e && e.message) ? e.message : (apPcNome + ' non risponde'); return }
    // Eliminato mentre lo si guardava: si torna all'elenco invece di restare
    // su un pannello che non descrive piu' niente.
    dentroAp = null
    apDettaglio = null
  }
}

/**
 * Il pannello dell'autopilota, come al computer.
 *
 * I passaggi e la percentuale non si ricalcolano qui: arrivano gia' fatti
 * dalle stesse funzioni che disegnano il pannello sul PC. Due copie della
 * stessa regola divergono al primo ritocco, e allora il telefono racconta un
 * programma diverso da quello che hai davanti.
 */
function primaRigaUscita(uscita) {
  const riga = String(uscita || '').split(String.fromCharCode(10)).map((r) => r.trim()).find((r) => r !== '') || ''
  return riga.length > 60 ? riga.slice(0, 60) + '\u2026' : riga
}

/**
 * La Panoramica 2 sul telefono (0.78.0), come al PC e dalla revisione UI/UX:
 * Situazione (obiettivo su 2 righe, stato coerente con i criteri, «Criteri
 * 1/2 ▸» con l'elenco), Adesso (solo chi lavora o aspetta te, 3 righe dal
 * vivo), Piano (una lista per fase: «In corso» e «In revisione» aperte, «Da
 * fare» e «Fatto» chiuse), le altre chat del workspace, «Finite: N ▸». La
 * conversazione segue sotto, con gli eventi tecnici in «Cosa è successo ▸».
 * Un PC della 0.77.0 non manda situazione e piano: allora la lista di prima.
 */
var panoramicaAp = null
var panAperte = { criteri: false, finite: false, 'da-fare': false, 'in-corso': true, 'in-revisione': true, fatto: false, eventi: false }
window.panApri = (k) => { panAperte[k] = !panAperte[k]; pannello(ultimoStato) }
const RUOLO_NOME = { sviluppo: 'Sviluppo', interfaccia: 'Interfaccia', collaudo: 'Collaudo', revisione: 'Revisione', rilascio: 'Rilascio' }
const SIMBOLO_SCHEDA = { chiede: '◆', lavora: '●', ferma: '■', finita: '✓' }
const PAROLA_SCHEDA = { chiede: 'aspetta te', lavora: 'al lavoro', ferma: 'ferma', finita: 'finita' }
function rigaApri(k, testo) {
  return '<button class="pan-tel-apri" aria-expanded="' + (panAperte[k] ? 'true' : 'false') + '" data-k="' + esc(k) + '" onclick="panApri(this.dataset.k)">' + (panAperte[k] ? '▾ ' : '▸ ') + testo + '</button>'
}
function schedaTelHtml(s, quante) {
  const ruolo = s.ruolo ? (RUOLO_NOME[s.ruolo] || s.ruolo) : 'Chat'
  const righe = (s.righe || []).slice(-quante).map((x) => '<span>' + esc(x) + '</span>').join('')
  const apribile = String(s.id).indexOf('fine-') !== 0 && !apPc
  return '<button class="pan-tel-scheda pan-tel-scheda--' + esc(s.stato) + '"' + (apribile ? ' data-chat="' + esc(s.id) + '" onclick="apriDaPanoramica(this.dataset.chat)"' : ' disabled') + '>' +
    '<span class="pan-tel-testa"><span class="pan-tel-pallino" aria-label="' + esc(PAROLA_SCHEDA[s.stato] || s.stato) + '">' + (SIMBOLO_SCHEDA[s.stato] || '') + '</span><b>' + esc(ruolo) + '</b> <span class="sotto">' + esc(String(s.titolo || '').replace(/^[^·]+ · /, '')) + '</span>' + (s.soloMia ? ' <span class="sotto">· solo tua</span>' : '') + '</span>' +
    (quante > 0 ? '<span class="pan-tel-righe">' + (righe || '<span>in attesa di output…</span>') + '</span>' : '') +
    '<span class="pan-tel-azione">' + esc(s.domanda ? 'Ti chiede: ' + ((s.domanda.scheda && s.domanda.scheda.domanda) || '') : (s.ultimaAzione || '')) + '</span>' +
    '</button>'
}
/**
 * Il riassunto accanto alla conversazione (0.79.0, Nicholas): una riga per
 * chat al lavoro, già composta dal PC (chi, cosa fa, da quanto, se aspetta te).
 */
function alLavoroHtml(righe) {
  const aspettano = righe.filter((r) => r.aspettaTe).length
  return '<div class="serigrafia" id="al-lavoro-ap">Al lavoro · ' + righe.length + (aspettano ? ' <span class="pan-tel-aspettano">· ◆ ' + (aspettano === 1 ? '1 aspetta te' : aspettano + ' aspettano te') + '</span>' : '') +
    aiuto('al-lavoro', 'Una riga per chat al lavoro: chi è, cosa fa adesso, da quanto. ◆ vuol dire che aspetta una tua risposta. Si aggiorna da sola; tocca una riga per aprire la sua chat.') + legendaAttivita('al-lavoro-colori') + '</div>' +
    (righe.length ? righe.slice(0, panAperte['al-lavoro'] ? righe.length : 3).map((r) => {
      // 0.82.0: il simbolo nel colore fisso di cosa fa; da un PC più vecchio il pallino di prima.
      const corpo = (r.attivita ? segnoAttivita(r.attivita) : '<span class="pan-tel-pallino">' + (r.aspettaTe ? '◆' : '●') + '</span>') + '<span class="pan-tel-al-lavoro__testo"><b>' + esc(r.chi) + '</b> ' + esc(r.cosa) +
        // «adesso» (0.79.0): cosa fa in questo momento, dai segnali; come sottoAlLavoro del PC.
        '<span class="sotto">' + (r.aspettaTe ? '<b class="pan-tel-stato--ambra">' + esc(r.adesso || 'aspetta te') + '</b>' : esc(r.adesso || '')) + ((r.aspettaTe || r.adesso) && r.quanto ? ' · ' : '') + esc(r.quanto || '') + '</span></span>'
      return apPc
        ? '<div class="pan-tel-al-lavoro' + (r.aspettaTe ? ' pan-tel-al-lavoro--chiede' : '') + '">' + corpo + '</div>'
        : '<button class="pan-tel-al-lavoro' + (r.aspettaTe ? ' pan-tel-al-lavoro--chiede' : '') + '" data-chat="' + esc(r.id) + '" onclick="apriDaPanoramica(this.dataset.chat)">' + corpo + '</button>'
    }).join('') + (righe.length > 3 ? rigaApri('al-lavoro', panAperte['al-lavoro'] ? 'meno' : 'e altre ' + (righe.length - 3)) : '') : '<div class="sotto">Nessuna chat al lavoro.</div>')
}
/**
 * La Panoramica in due parti (0.79.0): la «testa» (situazione e chi lavora)
 * sta sopra la conversazione con l'autopilota, il «resto» (Adesso, Piano,
 * Chat, Finite) sotto: la conversazione e il suo campo restano in vista.
 */
function panoramicaHtml(p, parte) {
  if (!p || !Array.isArray(p.schede)) return ''
  if (!p.situazione) return parte === 'testa' ? panoramicaVecchiaHtml(p) : ''
  if (parte === 'testa') return panoramicaTestaHtml(p)
  return panoramicaRestoHtml(p)
}
function panoramicaTestaHtml(p) {
  const st = p.situazione
  const criteri = st.criteri.totali > 0
    ? rigaApri('criteri', 'Criteri ' + esc(st.criteri.testo) + ' <span class="pan-tel-barra">' + st.criteri.elenco.map((c) => '<i class="pan-tel-pezzo--' + esc(c.esito) + '"></i>').join('') + '</span>') +
      (panAperte.criteri ? '<div class="pan-tel-criteri">' + st.criteri.elenco.map((c) =>
        '<div class="pan-tel-criterio"><b class="pan-tel-segno--' + esc(c.esito) + '">' + (c.esito === 'si' ? '✓' : c.esito === 'no' ? '✗' : '○') + '</b> <span>' + esc(c.descrizione) +
        '<span class="sotto">' + (c.quando ? 'controllato alle ' + esc(String(new Date(c.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))) : 'mai controllato') + (c.prova ? ' · ' + esc(c.prova) : '') + '</span></span></div>').join('') + '</div>' : '')
    : '<div class="sotto">nessun criterio di fine</div>'
  const situazione = '<div class="pan-tel-situazione"><div class="pan-tel-obiettivo">' + esc(st.obiettivo) + '</div>' +
    '<div><b class="pan-tel-stato--' + esc(st.stato.colore) + '">' + esc(st.stato.simbolo + ' ' + st.stato.parola) + '</b>' + (st.stato.ragione ? ' <span class="sotto">· ' + esc(st.stato.ragione) + '</span>' : '') + '</div>' + criteri + '</div>'
  // Un PC della 0.78 non manda il riassunto: allora solo la situazione.
  return '<div class="pan-tel pan-tel2">' + situazione + (Array.isArray(p.alLavoro) ? alLavoroHtml(p.alLavoro) : '') + '</div>'
}
function panoramicaRestoHtml(p) {
  const adesso = p.schede.filter((s) => s.stato === 'chiede' || s.stato === 'lavora')
  const ferme = p.schede.filter((s) => s.stato !== 'chiede' && s.stato !== 'lavora')
  const chat = ferme.filter((s) => !s.specialista)
  const finite = ferme.filter((s) => s.specialista)
  // 0.82.0: vuoto, «Adesso» ripeteva «Nessuna chat al lavoro» di «Al lavoro» più sopra.
  const sezAdesso = adesso.length === 0 && Array.isArray(p.alLavoro) ? '' : '<div class="serigrafia">Adesso · ' + adesso.length + '</div>' + (adesso.length ? adesso.map((s) => schedaTelHtml(s, 3)).join('') : '<div class="sotto">Nessuna chat al lavoro.</div>')
  const piano = (p.piano || []).filter((c) => c.compiti.length > 0)
  const sezPiano = piano.length ? '<div class="serigrafia">Piano</div>' + piano.map((c) =>
    rigaApri(c.fase, esc(c.nome) + ' · ' + c.compiti.length) + (panAperte[c.fase] ? c.compiti.map((x) => {
      const chi = x.ruolo ? (RUOLO_NOME[x.ruolo] || x.ruolo) : x.fase === 'da-fare' ? 'da assegnare' : 'Chat'
      const corpo = '<b>' + esc(chi) + '</b>' + (x.autore ? ' <span class="sotto">di ' + esc(RUOLO_NOME[x.autore] || x.autore) + '</span>' : '') + (x.giri ? ' <span class="sotto">↺ ' + x.giri + '</span>' : '') +
        '<span class="pan-tel-compito__testo">' + esc(x.testo) + '</span>' + (x.nota ? '<span class="sotto">' + esc(x.nota) + '</span>' : '')
      return x.chat && !apPc
        ? '<button class="pan-tel-compito" data-chat="' + esc(x.chat) + '" onclick="apriDaPanoramica(this.dataset.chat)">' + corpo + '</button>'
        : '<div class="pan-tel-compito pan-tel-compito--chiuso">' + corpo + '</div>'
    }).join('') : '')).join('') : ''
  const sezChat = chat.length ? '<div class="serigrafia">Chat · ' + chat.length + '</div>' + chat.map((s) => schedaTelHtml(s, 0)).join('') : ''
  const sezFinite = finite.length ? rigaApri('finite', 'Finite: ' + finite.length) + (panAperte.finite ? finite.map((s) => schedaTelHtml(s, 0)).join('') : '') : ''
  return '<div class="pan-tel pan-tel2">' + sezAdesso + sezPiano + sezChat + sezFinite +
    '<div class="sotto" style="margin-top:10px">Come si legge' + aiuto('panoramica', 'In alto la situazione: lo stato dice «finito» solo se i criteri sono tutti soddisfatti; tocca «Criteri» per vederli uno per uno. «Al lavoro»: chi lavora adesso, in una riga. Poi la conversazione con l’autopilota, con il campo per scrivergli sempre in fondo allo schermo; quello che ha fatto da solo è in «Cosa è successo». Sotto: «Adesso» con le righe dal vivo, il «Piano» per fase, le altre chat, le finite. Tocca una riga, una scheda o un compito per aprire la sua chat.') + '</div></div>'
}
/** La Panoramica della 0.77.0, per un PC che non manda ancora situazione e piano. */
function panoramicaVecchiaHtml(p) {
  const r = p.riassunto
  const riga = r ? '<div class="pan-tel-riga"><b>' + esc(r.obiettivo) + '</b><span class="pan-tel-stato pan-tel-stato--' + esc(r.stato.colore) + '">' + esc(r.stato.parola) + '</span><span class="sotto">criteri ' + esc(r.criteri.testo) + '</span></div>' : ''
  return '<div class="pan-tel">' + riga + '<div class="serigrafia" style="margin-top:8px">Panoramica</div>' + (p.schede.map((s) => schedaTelHtml(s, 2)).join('') || '<div class="sotto">Nessuna chat: l’autopilota le apre quando serve.</div>') + '</div>'
}
window.apriDaPanoramica = async (id) => {
  dentroAp = null
  apDettaglio = null
  panoramicaAp = null
  vaiScheda('chat')
  await guarda(id)
}

/** La riga riassuntiva (0.83.0, uguale all'app): prima le domande, poi stato, criteri, chat e giri. */
function riassuntoApTesto(ap, d) {
  const pezzi = []
  const dom = d && d.domandeScheda ? d.domandeScheda.length : 0
  if (dom > 0) pezzi.push(dom === 1 ? '1 domanda per te' : dom + ' domande per te')
  pezzi.push(ap.vista ? ap.vista.stato.parola : ap.stato)
  if (ap.criteri) pezzi.push('criteri ' + ap.fatti + '/' + ap.criteri)
  const chat = d && d.chats ? d.chats.length : 0
  if (chat > 0) pezzi.push(chat + ' chat')
  const giri = (d && d.cicli) || 0
  pezzi.push(giri === 1 ? '1 giro' : giri + ' giri')
  return pezzi.join(' · ')
}
window.giraRiassuntoAp = () => { apRiassunto = !apRiassunto; pannello(ultimoStato) }

function vistaAutopilota(a) {
  const passi = (a.passaggi || []).map((p) => {
    const cl = 'passo passo--' + p.stato
    return '<span class="' + cl + '"><i class="passo-led"></i>' + esc(p.nome) + '</span>'
  }).join('<span class="passo-filo"></span>')
  const qui = (a.passaggi || []).find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')
  const m = a.misura || { percento: 0, dettaglio: '', di: '', tono: 'lavoro' }
  const ora = (iso) => oraDi(iso)

  // ── La chat con lui, in cima (0.29.0) ──
  // Arriva composta dal computer (la stessa della sezione sul PC): la tua
  // richiesta, l'intervista, le sue decisioni come note, il dialogo, la
  // domanda aperta. Qui si disegna e basta.
  // Con la Panoramica 2 (0.78.0) solo la conversazione; gli eventi in «Cosa è successo ▸».
  const conPan = !!(panoramicaAp && panoramicaAp.situazione)
  // Le righe corte dei traguardi (0.79.0: «Revisione: ha approvato …, unito.») restano nella conversazione.
  // 0.81.0: anche «Ha finito.» e «Si è fermato.».
  const inConversazione = (b) => b.da !== 'nota' || b.tono === 'traguardo' || b.tono === 'fine' || b.tono === 'fermo'
  const eventi = conPan ? (a.chat || []).filter((b) => !inConversazione(b)).reverse() : []
  const eventiHtml = eventi.length ? rigaApri('eventi', 'Cosa è successo · ' + eventi.length) + (panAperte.eventi ? '<div class="pan-tel-eventi">' + eventi.slice(0, 50).map((b) => '<div class="nota-ap"><span class="quando">' + ora(b.quando) + '</span><span>' + esc(b.testo) + (b.volte ? ' ×' + b.volte : '') + '</span></div>').join('') + '</div>' : '') : ''
  // Senza la Panoramica 2 il diario è intero: le righe corte dei traguardi sarebbero un doppione.
  const chat = eventiHtml + (a.chat || []).filter((b) => conPan ? inConversazione(b) : b.tono !== 'traguardo').map((b) => {
    if (b.da === 'nota') {
      return '<div class="nota-ap' + (b.tono ? ' nota-ap--' + esc(b.tono) : '') + '">' +
        '<span class="quando">' + ora(b.quando) + '</span>' +
        '<span>' + esc(b.testo) + (b.volte ? ' <b>×' + b.volte + '</b>' : '') +
        (b.dettaglio ? ' — ' + esc(b.dettaglio) : '') + '</span></div>'
    }
    return '<div class="battuta battuta--' + (b.da === 'lui' ? 'lui' : 'tu') + (b.tono ? ' battuta--' + esc(b.tono) : '') + '">' +
      '<span class="battuta__chi">' + (b.da === 'lui' ? esc(a.nome || 'lui') : 'tu') + ' · ' + ora(b.quando) + '</span>' +
      '<span>' + esc(b.testo) + '</span>' +
      (b.dettaglio ? '<span class="battuta__esito">' + esc(b.dettaglio) + '</span>' : '') +
      (b.tono === 'pronto' ? '<div class="riga"><button class="primario" data-ap="' + esc(a.id) + '" onclick="vaiAp(this.dataset.ap)">Vai</button></div>' : '') +
      '</div>'
  }).join('')
  const pensa = a.pensa
    ? '<div class="sotto pensa">● sta pensando alla risposta… di solito entro qualche minuto. Puoi scrivergli altro: risponde in ordine.</div>'
    : a.stato === 'intervista' && !a.domanda
      ? '<div class="sotto pensa">● sta guardando il progetto per capire cosa serve: se ha un dubbio te lo chiede qui.</div>'
      : a.fermoConPromessa
        // 0.75.4: ha promesso lavoro ed è fermo.
        ? '<div class="sotto pensa fermo-promessa">● L’autopilota è fermo (' + esc(a.stato) + '). <button class="primario" data-ap="' + esc(a.id) + '" onclick="riprendiAp(this.dataset.ap)">Riprendi</button></div>'
        : ''
  // La casella: con una domanda aperta e' la risposta (arriva subito alla
  // chat ferma); altrimenti si parla con lui, il supervisore, che risponde in
  // qualche minuto.
  // Il campo resta in fondo allo schermo mentre si scorre (0.79.0: «sempre pronto»).
  const casella = '<div class="casella-ap ancorata"><div class="riga"><textarea id="dialogo-' + esc(a.id) + '" rows="2" placeholder="' +
      // 0.82.0, come sul PC dalla 0.81.0: corto, la parte fra parentesi veniva tagliata; dove stanno le domande lo dice il «?».
      'scrivigli: una domanda, un vincolo, un compito in più, «fermati», «riprendi»…' + '"></textarea></div>' +
    '<div class="riga">' +
      // Le sue domande non si rispondono da qui (0.38.0): stanno nella
      // linguetta «Domande», una per volta.
      '<button class="primario" data-ap="' + esc(a.id) + '" onclick="dialogaAp(this.dataset.ap)">Manda</button>' +
      micHtml('dialogo-' + a.id) +
      // I file dal telefono (0.50.0): nella sua cartella, e il messaggio nel suo dialogo.
      '<button data-ap="' + esc(a.id) + '" onclick="scegliFileAp(this.dataset.ap)" title="Scegli file: lo mandi a questo autopilota (fino a 100 MB). Finisce nella sua cartella di lavoro, in .sierradeck/allegati, fuori da git, e lui lo trova nel dialogo. Se nella casella hai scritto qualcosa, va come nota.">📎 Allega</button>' +
      '<span class="sotto info-ap" role="note" tabindex="0" aria-label="Spiegazione: come parlare all’autopilota" title="Qui parli con l’autopilota, non con la chat che esegue. Risponde con parole sue; se è un’istruzione la applica e la consegna alla chat alla fine del turno che ha in mano. Se ha una domanda aperta, quello che scrivi è la risposta e arriva subito.">?</span>' +
    '</div>' +
    (notaDialogo ? '<div class="errore">' + esc(notaDialogo) + '</div>' : '') +
    (allegatoNota ? '<div class="sotto">' + esc(allegatoNota) + '</div>' : '') + '</div>'
  setTimeout(scorriChatAp, 0)

  // ── Le linguette, sotto ──
  const schede = a.domandeScheda || []
  const linguette = (schede.length > 0 ? [['domande', 'Domande']] : []).concat([['istruzioni', 'Istruzioni'], ['file', 'File'], ['obiettivo', 'Obiettivo'], ['criteri', 'Criteri'], ['compiti', 'Compiti'], ['deciso', 'Ha deciso']])
  const conto = (id) => id === 'domande' ? ' <small class="conto-domande">' + schede.length + '</small>' : id === 'criteri' && (a.criteri || []).length
    ? ' <small>' + (a.criteri || []).filter((c) => c.soddisfatto).length + '/' + a.criteri.length + '</small>'
    : id === 'compiti' && (a.compitiDaFare || []).length ? ' <small>' + a.compitiDaFare.length + '</small>' : ''
  const barraLinguette = '<div class="linguette">' + linguette.map(([id, nome]) =>
    '<button class="linguetta' + (apTab === id ? ' linguetta--attiva' : '') + '" data-tab="' + id + '" onclick="apriTabAp(this.dataset.tab)">' + nome + conto(id) + '</button>'
  ).join('') + '</div>'

  let dentro = ''
  if (apTab === 'domande' && schede.length > 0) {
    // Una domanda per volta (0.38.0): il testo intero, le opzioni da toccare,
    // la casella, «1 di N». Dopo la risposta domanda e risposta entrano nella
    // chat qui sopra; finite, la linguetta si chiude.
    const i = Math.min(apDomandaI, schede.length - 1)
    const d = schede[i]
    const origine = d.origine === 'preparazione' ? 'domanda iniziale: si sta preparando, e senza la tua risposta non comincia'
      : d.origine === 'pubblica' ? 'il lavoro è finito e verificato: chiede se pubblicare'
      : d.origine === 'via' ? 'si è preparato: aspetta il tuo via' : 'domanda durante il lavoro: la chat è ferma su questa'
    dentro = d.scheda
      // 0.72.1: la domanda essenziale (la frase, i tasti, il resto nel «?»).
      ? (schede.length > 1 ? '<div class="riga"><button data-d="-1" onclick="spostaDomandaAp(+this.dataset.d)"' + (i === 0 ? ' disabled' : '') + '>‹ prima</button><span class="sotto">' + (i + 1) + ' di ' + schede.length + '</span><button data-d="1" onclick="spostaDomandaAp(+this.dataset.d)"' + (i >= schede.length - 1 ? ' disabled' : '') + '>dopo ›</button></div>' : '') +
        schedaDomandaHtml(d.scheda, d.chiave, function (c) {
          return '<button class="scelta' + (c.consigliata ? ' scelta--ora' : '') + '" data-o="' + esc(c.testo) + '" onclick="rispondiSchedaAp(this.dataset.o)">' + etichettaScelta(c) + '</button>'
        }, { id: 'risposta-scheda-ap', attributi: 'onclick="rispondiSchedaAp()"', etichetta: d.tipo === 'via' ? 'Manda' : 'Rispondi' }) +
        (notaDomandaAp ? '<div class="errore">' + esc(notaDomandaAp) + '</div>' : '')
      : '<div class="sotto">' + esc(origine) + (schede.length > 1 ? ' · ' + (i + 1) + ' di ' + schede.length : '') + '</div>' +
      (schede.length > 1 ? '<div class="riga"><button data-d="-1" onclick="spostaDomandaAp(+this.dataset.d)"' + (i === 0 ? ' disabled' : '') + '>‹ prima</button><button data-d="1" onclick="spostaDomandaAp(+this.dataset.d)"' + (i >= schede.length - 1 ? ' disabled' : '') + '>dopo ›</button></div>' : '') +
      '<div class="grande domanda-ap">' + esc(d.testo) + '</div>' +
      ((d.opzioni || []).length > 0 ? '<div class="riga">' + d.opzioni.map((o) => '<button class="primario" data-o="' + esc(o) + '" onclick="rispondiSchedaAp(this.dataset.o)">' + esc(o) + '</button>').join('') + '</div>' : '') +
      '<div class="riga"><textarea id="risposta-scheda-ap" rows="3" placeholder="' + (d.tipo === 'via' ? 'oppure scrivigli cosa cambiare prima di partire' : 'la tua risposta, con parole tue') + '"></textarea></div>' +
      '<div class="riga"><button class="primario" onclick="rispondiSchedaAp()">' + (d.tipo === 'via' ? 'Manda' : 'Rispondi') + '</button>' + micHtml('risposta-scheda-ap') + '</div>' +
      (notaDomandaAp ? '<div class="errore">' + esc(notaDomandaAp) + '</div>' : '') +
      '<div class="sotto">' + (d.tipo === 'via' ? '«Vai» lo fa partire; se scrivi altro gli arriva come messaggio.' : 'La risposta arriva subito all’autopilota; nella chat qui sopra restano domanda e risposta. Poi la prossima, o la linguetta si chiude.') + '</div>'
  } else if (apTab === 'file') {
    dentro = vistaFileAp(apFile, apFileScelto, apDiff)
  } else if (apTab === 'istruzioni') {
    dentro = vistaIstruzioniAp(apIstr)
  } else if (apTab === 'obiettivo') {
    // Cosa gli hai chiesto, e cosa ne ha capito. La preparazione riscrive
    // l'obiettivo con parole sue: senza le tue accanto non c'e' modo di
    // accorgersi che sta andando a fare un'altra cosa.
    const tue = a.obiettivoTuo || a.obiettivo || ''
    dentro = '<div class="serigrafia">Gli hai chiesto</div>' +
      '<div class="sotto tue-parole">' + esc(tue) + '</div>' +
      (a.obiettivo && a.obiettivo !== tue
        ? '<div class="serigrafia" style="margin-top:8px">Ha capito così</div>' +
          '<div class="sotto sue-parole">' + esc(a.obiettivo) + '</div>'
        : '') +
      '<div class="serigrafia" style="margin-top:10px">A che punto è</div>' +
      '<div class="misura misura--' + esc(m.tono) + '" style="margin-top:4px"><b>' + m.percento + '%</b>' +
        '<span class="sotto">' + esc(m.dettaglio) + ' · ' + esc(m.di) + '</span></div>' +
      (qui && qui.nota ? '<div class="sotto nota">' + esc(qui.nota) + '</div>' : '') +
      '<div class="sotto">' + (a.cicli || 0) + ' interventi del supervisore' +
        (a.strategia ? ' · sta provando un’altra strada: ' + esc(a.strategia) : '') + '</div>' +
      (a.tempi ? '<div class="sotto">Tempi: ' + esc(a.tempi) + '</div>' : '') +
      (a.specialisti ? specialistiHtml(a.specialisti) : '<div class="serigrafia" style="margin-top:10px">Il coordinatore e le sue chat</div>' + alberoHtml(a))
  } else if (apTab === 'criteri') {
    // I criteri, con **quando** li ha raggiunti: una spunta senza ora non dice
    // se e' successo adesso o tre ore fa. Si riscrivono dal PC.
    const criteri = (a.criteri || []).map((c) =>
      '<li class="' + (c.soddisfatto ? 'fatto' : '') + '">' + (c.soddisfatto ? '✓ ' : '· ') + esc(c.descrizione) +
      (c.soddisfatto && c.raggiuntoIl
        ? '<span class="quando-criterio"> raggiunto alle ' + ora(c.raggiuntoIl) + '</span>'
        : '') +
      '<div class="prova-criterio">' + (c.comando ? esc(c.comando) : 'lo giudica lui, guardando il lavoro') +
        (c.ultimaVerifica ? ' · ' + (c.ultimaVerifica.codice === 0 ? 'passato' : esc(primaRigaUscita(c.ultimaVerifica.uscita)) || 'non passato') : ' · mai misurato') +
      '</div></li>'
    ).join('')
    dentro = '<div class="serigrafia">Finisce quando' + aiuto('ap-criteri', 'Il comando sotto ogni criterio è quello che lo misura a ogni fermata. Per riscriverli usa il PC, o diglielo nella chat qui sopra.') + '</div>' +
      (criteri ? '<ul class="criteri">' + criteri + '</ul>' : '<div class="sotto">Ancora nessun criterio: li scrive lui alla fine della preparazione.</div>') +
      ''
  } else if (apTab === 'compiti') {
    const compiti = (a.compitiDaFare || []).map((c) => '<li>' + esc(c) + '</li>').join('')
    dentro = '<div class="serigrafia">Prima fa</div>' +
      (compiti ? '<ol class="compiti-ap">' + compiti + '</ol>' : '<div class="sotto">Niente in coda: lavora sull’obiettivo. Per aggiungere un compito diglielo nella chat qui sopra.</div>')
  } else {
    // «supervisore →» e' come il servizio marca le proprie decisioni per
    // ritrovarle: e' una sigla interna, e letta da fuori sembra un errore. Qui
    // resta la sola cosa che conta — cosa ha deciso, e perche'.
    const senzaSigla = (cosa) => {
      // Senza espressioni regolari: dentro questo template le barre si perdono, e
      // una regex mangiata a meta' non fallisce — smette semplicemente di
      // trovare, in silenzio. Successo, e si vedeva in fotografia.
      const t = String(cosa || '')
      const freccia = t.indexOf(String.fromCharCode(8594))
      return freccia === -1 || freccia > 20 ? t : t.slice(freccia + 1).trim()
    }
    const decisioni = (a.decisioni || []).slice(-30).reverse().map((d) =>
      '<div class="voce--riga"><span class="quando">' + ora(d.quando) + '</span>' +
      esc(senzaSigla(d.cosa)) + '</div>'
    ).join('')
    dentro = '<div class="serigrafia">Sta ragionando così</div>' +
      (decisioni || '<div class="sotto">' + (a.stato === 'intervista' ? 'Sta guardando il progetto per capire cosa serve.' : 'Ancora niente: il primo intervento arriva quando la chat si ferma.') + '</div>')
  }

  return '<div class="dettaglio">' +
    '<div class="passi solo-riassunto">' + passi + '</div>' +
    '<div class="serigrafia solo-riassunto" style="margin-top:10px">Chat con lui</div>' +
    '<div class="flusso-ap" id="flusso-ap">' + chat + pensa + '</div>' +
    casella +
    '<div class="solo-riassunto">' + barraLinguette +
    '<div class="tab-ap">' + dentro + '</div></div>' +
    '</div>'
}

/** La chat con lui resta in fondo, come ogni chat: l'ultima cosa detta e' quella da leggere. */
function scorriChatAp() {
  const fl = document.getElementById('flusso-ap')
  if (fl) fl.scrollTop = fl.scrollHeight
}

window.apriTabAp = async (t) => {
  if (t === 'domande' && apTab !== 'domande') apTabPrima = apTab
  apTab = t
  pannello(ultimoStato)
  if (t === 'file' || t === 'istruzioni') { await leggiAp(); pannello(ultimoStato) }
}

/** Come si risponde a una domanda della linguetta: la stessa regola del PC (richiestaScheda). */
function richiestaSchedaAp(d, autopilota, testo) {
  if (d.tipo === 'domanda') return { percorso: '/api/rispondi', corpo: { domanda: d.idDomanda || '', risposta: testo } }
  if (testo.trim().toLowerCase() === 'vai') return { percorso: '/api/autopilota/vai', corpo: { autopilota: autopilota } }
  return { percorso: '/api/autopilota/dialogo', corpo: { autopilota: autopilota, testo: testo } }
}
window.spostaDomandaAp = (d) => { apDomandaI = Math.max(0, apDomandaI + d); pannello(ultimoStato) }
window.rispondiSchedaAp = async (opzione) => {
  const schede = (apDettaglio && apDettaglio.domandeScheda) || []
  const d = schede[Math.min(apDomandaI, schede.length - 1)]
  if (!d) return
  const campo = document.getElementById('risposta-scheda-ap')
  const testo = typeof opzione === 'string' ? opzione : (campo ? campo.value.trim() : '')
  if (!testo) return
  try {
    const q = richiestaSchedaAp(d, apDettaglio.id, testo)
    const r = await chiedi(q.percorso, q.corpo)
    if (r && r.errore) { notaDomandaAp = r.errore; pannello(ultimoStato); return }
    notaDomandaAp = ''
    apDomandaI = 0
    await leggiAp()
    aggiorna()
  } catch (e) {
    notaDomandaAp = 'Non sono riuscito a rispondere: ' + (e && e.message ? e.message : e)
    pannello(ultimoStato)
  }
}

/**
 * Il Markdown di un'istruzione, **senza HTML che arrivi dal testo** (0.41.0):
 * ogni riga passa prima da esc(), poi si aggiungono solo tag nostri — titoli,
 * elenchi, grassetto, codice. Senza espressioni regolari: in questo template
 * le barre si perdono.
 */
function mdSicuro(testo) {
  const ACAPO = String.fromCharCode(10)
  const APICE = String.fromCharCode(96)
  const inRiga = (r) => {
    // Codice in riga fra apici inversi, poi il grassetto fra doppi asterischi.
    const pezzi = esc(r).split(APICE)
    return pezzi.map((p, i) => i % 2 === 1 && i < pezzi.length - 1 ? '<code>' + p + '</code>' : p.split('**').map((q, j, tutti) => j % 2 === 1 && j < tutti.length - 1 ? '<b>' + q + '</b>' : q).join('')).join('')
  }
  let fuori = ''
  let blocco = false
  for (const r of String(testo || '').split(ACAPO)) {
    const t = r.trim()
    if (t.startsWith(APICE + APICE + APICE)) { blocco = !blocco; fuori += blocco ? '<pre class="md-blocco">' : '</pre>'; continue }
    if (blocco) { fuori += esc(r) + ACAPO; continue }
    if (t === '') { fuori += '<div class="md-vuota"></div>'; continue }
    if (t.startsWith('#')) { let n = 0; while (t[n] === '#') n += 1; fuori += '<div class="md-titolo">' + inRiga(t.slice(n).trim()) + '</div>'; continue }
    if (t.startsWith('- ') || t.startsWith('* ')) { fuori += '<div class="md-voce">• ' + inRiga(t.slice(2)) + '</div>'; continue }
    fuori += '<div>' + inRiga(r) + '</div>'
  }
  if (blocco) fuori += '</pre>'
  return fuori
}

/** La linguetta «Istruzioni» (0.41.0): cosa ha scritto alle sue chat, intero, dalla più recente. */
function vistaIstruzioniAp(x) {
  const intro = '<div class="sotto">Le istruzioni date alle sue chat' + aiuto('ap-istruzioni', 'Quello che l’autopilota ha scritto alle sue chat, per intero e dalla più recente. Nella chat spesso si vede solo «Leggi ed esegui le istruzioni in …»: il testo vero è questo. Per ognuna: l’ora, la chat, il perché della mossa e com’è andata. Se qualcosa è sbagliato, «Correggi» gli scrive una nota legata a quell’istruzione. Il testo si seleziona e si copia.') + '</div>'
  if (!x) return intro + '<div class="sotto">Leggo le istruzioni…</div>'
  if (x.errore) return intro + '<div class="errore">' + esc(x.errore) + '</div>'
  const lista = x.istruzioni || []
  if (lista.length === 0) return intro + '<div class="sotto">Ancora nessuna istruzione salvata: si salvano dalla 0.41.0 in poi, quando l’autopilota le decide.</div>'
  const esiti = { 'in-coda': 'in coda', consegnata: 'consegnata', partita: 'partita', 'non-partita': 'non partita', persa: 'mai arrivata' }
  return intro + (notaIstrAp ? '<div class="sotto nota">' + esc(notaIstrAp) + '</div>' : '') + lista.map((i, k) =>
    '<details class="istr-ap"' + (k === 0 ? ' open' : '') + '><summary>' +
      '<span class="sotto">' + esc(new Date(i.quando).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</span> ' +
      '<b>→ ' + esc(i.chatTitolo || i.chatId) + '</b> ' +
      '<span class="istr-ap__esito istr-ap__esito--' + esc(i.esito) + '">' + esc(esiti[i.esito] || i.esito) + '</span></summary>' +
      (i.perche ? '<div class="sotto"><b>Perché:</b> ' + esc(i.perche) + '</div>' : '') +
      (i.cosa === 'interrompi' ? '<div class="sotto">Ha interrotto la chat (nessun testo).</div>' : i.cosa === 'chiudi' ? '<div class="sotto">Ha chiuso la chat finita, per liberare il posto (la conversazione resta).</div>' : '<div class="istr-ap__testo">' + mdSicuro(i.testo) + '</div>') +
      (apIstrCorreggi === i.id
        ? '<div class="riga"><textarea id="correggi-istr-ap" rows="3" placeholder="Cosa c’è di sbagliato, o cosa doveva scrivere invece"></textarea></div>' +
          '<div class="riga"><button class="primario" data-i="' + esc(i.id) + '" onclick="mandaCorrezioneAp(this.dataset.i)">Manda la correzione</button><button onclick="correggiIstrAp(null)">Annulla</button></div>'
        : '<div class="riga"><button data-i="' + esc(i.id) + '" onclick="correggiIstrAp(this.dataset.i)">Correggi</button></div>') +
    '</details>'
  ).join('')
}
window.correggiIstrAp = (id) => { apIstrCorreggi = id; notaIstrAp = ''; pannello(ultimoStato) }
window.mandaCorrezioneAp = async (id) => {
  const campo = document.getElementById('correggi-istr-ap')
  const nota = campo ? campo.value.trim() : ''
  if (!nota) return
  try {
    await chiediAp('/api/autopilota/correggi', { autopilota: dentroAp, istruzione: id, nota: nota })
    apIstrCorreggi = null
    notaIstrAp = 'Correzione mandata: la trovi nella chat con lui, qui sopra, con la sua risposta.'
  } catch (e) { notaIstrAp = 'Non mandata: ' + (e && e.message ? e.message : e) }
  pannello(ultimoStato)
}

/** La linguetta «File» (0.38.0): l'elenco per chat e il diff del file scelto, in sola lettura. */
function vistaFileAp(f, scelto, diff) {
  if (!f) return '<div class="sotto">Leggo i file da git…</div>'
  if (f.errore) return '<div class="errore">' + esc(f.errore) + '</div>'
  const intro = '<div class="sotto">I file che ha cambiato' + aiuto('ap-file', 'I file che ha cambiato, per la cartella del progetto e per il worktree di ogni sua chat: com’è cambiato, righe aggiunte (+) e tolte (−), e se è già in un commit o ancora da salvare. Toccando un file vedi le righe. Qui si guarda soltanto.') + '</div>'
  const gruppi = (f.gruppi || []).map((g) =>
    '<div class="serigrafia" style="margin-top:8px">' + esc(g.nome) + (g.ramo ? ' · ' + esc(g.ramo) : '') + '</div>' +
    '<div class="sotto">Confronto ' + esc(g.base) + '</div>' +
    (g.errore ? '<div class="sotto">⚠ ' + esc(g.errore) + '</div>' : '') +
    ((g.file || []).length === 0 && !g.errore ? '<div class="sotto">Nessun file cambiato.</div>' : '') +
    (g.file || []).map((x) =>
      '<button class="voce file-ap' + (scelto && scelto.percorso === x.percorso && scelto.chat === g.chiave ? ' file-ap--scelto' : '') + '" data-c="' + esc(g.chiave) + '" data-p="' + esc(x.percorso) + '" onclick="apriFileAp(this.dataset.c, this.dataset.p)">' +
      '<span class="file-ap__stato file-ap__stato--' + esc(x.stato) + '">' + esc(x.stato) + '</span> ' +
      '<span class="file-ap__nome">' + esc(x.percorso) + '</span> ' +
      (x.binario ? '<span class="sotto">binario</span>' : '<span class="file-ap__piu">+' + x.piu + '</span> <span class="file-ap__meno">−' + x.meno + '</span>') +
      ' <span class="sotto">' + (x.salvato ? 'in commit' : 'da salvare') + '</span></button>'
    ).join('')
  ).join('')
  const vistaDiff = scelto
    ? '<div class="serigrafia" style="margin-top:8px">' + esc(scelto.percorso) + '</div>' +
      (diff === null ? '<div class="sotto">Leggo il diff…</div>' : '<pre class="diff-ap">' + String(diff).split(String.fromCharCode(10)).slice(0, 2000).map((r) => {
        const t = r.startsWith('+++') || r.startsWith('---') || r.startsWith('diff ') || r.startsWith('index ') ? 'testa' : r.startsWith('@@') ? 'blocco' : r.startsWith('+') ? 'piu' : r.startsWith('-') ? 'meno' : 'contesto'
        return '<div class="diff-ap__riga diff-ap__riga--' + t + '">' + esc(r) + '</div>'
      }).join('') + '</pre>')
    : ''
  return intro + gruppi + vistaDiff
}
window.apriFileAp = async (chat, percorso) => {
  apFileScelto = { chat: chat, percorso: percorso }
  apDiff = null
  pannello(ultimoStato)
  try {
    const r = await chiediAp('/api/autopilota/diff', { autopilota: dentroAp, chat: chat, percorso: percorso })
    apDiff = r && r.diff !== undefined ? r.diff : '⚠ ' + (r && r.errore ? r.errore : 'diff non disponibile')
  } catch (e) { apDiff = '⚠ ' + (e && e.message ? e.message : e) }
  pannello(ultimoStato)
}

/**
 * Risponde alla domanda aperta dell'autopilota dalla stessa casella con cui
 * gli si parla: arriva subito alla chat ferma, non passa dal supervisore.
 */
window.rispondiAp = async (id, domanda) => {
  const campo = document.getElementById('dialogo-' + id)
  const testo = campo ? campo.value.trim() : ''
  if (!testo) return
  try {
    await chiediAp('/api/rispondi', { domanda: domanda, risposta: testo })
    notaDialogo = ''
    if (campo) campo.value = ''
    await leggiAp()
    aggiorna()
  } catch (e) {
    notaDialogo = 'Non sono riuscito a rispondere: ' + (e && e.message ? e.message : e)
    pannello(ultimoStato)
  }
}

/**
 * Manda una battuta all'autopilota. Il computer risponde subito «ricevuto»;
 * la risposta di lui arriva nel dettaglio, che si rilegge da solo. Un
 * computer con una versione precedente risponde 409 e lo si dice.
 */
window.dialogaAp = async (id) => {
  const campo = document.getElementById('dialogo-' + id)
  const testo = campo ? campo.value.trim() : ''
  if (!testo) return
  try {
    const r = await chiediAp('/api/autopilota/dialogo', { autopilota: id, testo: testo })
    if (r && r.errore) { notaDialogo = r.errore; pannello(ultimoStato); return }
    notaDialogo = ''
    if (campo) campo.value = ''
    await leggiAp()
    pannello(ultimoStato)
  } catch (e) {
    notaDialogo = 'Non sono riuscito a mandarlo: ' + (e && e.message ? e.message : e)
    pannello(ultimoStato)
  }
}

/**
 * Le cose che si disfano si chiedono due volte.
 *
 * Non un dialogo di sistema - che blocca la pagina e su un telefono compare
 * dove capita - ma il tasto stesso che cambia parola: il secondo tocco e' la
 * conferma. Un tocco sbagliato in tram non deve buttare via il lavoro della
 * notte, e questo e' il muro giusto: sta nel gesto, non nell'assenza del
 * comando.
 */
var confermando = null
window.chiedeConferma = (chiave) => {
  confermando = confermando === chiave ? null : chiave
  pannello(ultimoStato)
  // Chi ci ripensa non deve restare con un tasto rosso addosso: dopo qualche
  // secondo la domanda decade da sola.
  setTimeout(() => { if (confermando === chiave) { confermando = null; pannello(ultimoStato) } }, 6000)
}

window.eliminaAp = async (id) => {
  if (confermando !== 'ap-' + id) { chiedeConferma('ap-' + id); return }
  confermando = null
  if (dentroAp === id) { dentroAp = null; apDettaglio = null }
  await chiediAp('/api/autopilota/elimina', { autopilota: id })
  aggiorna()
}

// Archiviare un autopilota fermo (0.56.0), come dal pannello del PC: esce dall'elenco, non si cancella niente.
window.archiviaAp = async (id) => {
  try { await chiediAp('/api/autopilota/archivia', { autopilota: id, archivia: true }); if (dentroAp === id) { dentroAp = null; apDettaglio = null } }
  catch (e) { notaGlobale = 'Non l’ho archiviato: ' + ((e && e.message) || 'il computer non risponde') }
  aggiorna()
}

// «Sposta in un altro workspace» (0.81.0), come dal pannello del PC.
window.spostaAp = async (id) => {
  const scelta = document.getElementById('ap-sposta')
  if (!scelta || !scelta.value) return
  try { await chiediAp('/api/autopilota/sposta', { autopilota: id, workspace: scelta.value }); notaGlobale = 'Spostato in «' + scelta.value + '».' }
  catch (e) { notaGlobale = 'Non l’ho spostato: ' + ((e && e.message) || 'il computer non risponde') }
  aggiorna()
}

window.sottofondoAp = async (id, si) => {
  try { await chiediAp('/api/autopilota/sottofondo', { autopilota: id, si: si }) }
  catch (e) { notaGlobale = 'Non l’ho cambiato: ' + ((e && e.message) || 'il computer non risponde') }
  if (dentroAp === id) await leggiAp()
  aggiorna()
}

window.riavvioAp = async (id, riprendi) => {
  await chiediAp('/api/autopilota/riavvio', { autopilota: id, riprendi: riprendi })
  if (dentroAp === id) await leggiAp()
  aggiorna()
}

window.chiudiChat = async (id) => {
  if (confermando !== 'chat-' + id) { chiedeConferma('chat-' + id); return }
  confermando = null
  if (dentro === id) { dentro = null; righeDentro = []; righeGrezze = [] }
  await chiedi('/api/chat/chiudi', { chat: id })
  aggiorna()
}

window.rinomina = async (id) => {
  const campo = document.getElementById('n-' + id)
  if (!campo || !campo.value.trim()) return
  await chiedi('/api/chat/nome', { chat: id, nome: campo.value.trim() })
  campo.value = ''
  aggiorna()
}

/*
 * Il negozio dalla pagina (0.53.0): la stessa vetrina dell'app, con gli
 * stati, le spiegazioni e i «cosa cambia» scritti dal computer
 * (shared/negozio). Si installa, si aggiorna, si accende e si spegne; quello
 * che chiede percorsi o chiavi (aggiungere un MCP, una skill) resta al PC.
 */
var negozioVisto = null
var negozioErrore = ''
var negozioErroreMcp = ''
var negozioFamiglia = 'plugin'
var negozioTrovati = null
var negozioParola = ''
var negozioLavoro = {}
var negozioGuasti = {}
var negozioConferme = {}
var negozioNota = ''
var negozioProvoMcp = false
async function leggiNegozio() {
  negozioErrore = ''
  try { negozioVisto = await chiedi('/api/negozio') } catch (e) { negozioErrore = 'Non riesco a leggere il negozio: ' + (e && e.message ? e.message : 'il computer non risponde') }
}
window.rileggiNegozio = async () => { negozioVisto = null; pannello(ultimoStato); await leggiNegozio(); pannello(ultimoStato) }
async function negozioCercaOra() {
  if (!negozioParola) { negozioTrovati = null; return }
  try { negozioTrovati = await chiedi('/api/negozio/cerca', { q: negozioParola }) } catch (e) {
    negozioTrovati = { plugin: [], totale: 0, errore: e && e.stato === 404 ? 'Questo computer non sa ancora cercare nel catalogo: arriva aggiornandolo alla 0.53.0.' : 'Ricerca non riuscita: ' + (e && e.message ? e.message : 'il computer non risponde') }
  }
}
window.negozioCerca = async () => {
  var c = document.getElementById('neg-cerca')
  negozioParola = c ? c.value.trim() : ''
  if (c) c.blur()
  await negozioCercaOra()
  pannello(ultimoStato)
}
async function negozioProvaMcp() {
  negozioProvoMcp = true
  negozioErroreMcp = ''
  pannello(ultimoStato)
  try {
    var r = await chiedi('/api/negozio/salute-mcp')
    if (negozioVisto && r && Array.isArray(r.mcp) && (r.mcp.length > 0 || !r.errore)) negozioVisto.mcp = r.mcp
    if (r && r.errore) negozioErroreMcp = r.errore
  } catch (e) {
    negozioErroreMcp = e && e.stato === 404 ? 'Provare i collegamenti da qui arriva aggiornando il computer alla 0.53.0.' : 'Non ho potuto provare i collegamenti: ' + (e && e.message ? e.message : 'il computer non risponde')
  }
  negozioProvoMcp = false
  pannello(ultimoStato)
}
window.negozioProvaMcp = () => negozioProvaMcp()
window.negozioFamigliaScegli = (f) => {
  negozioFamiglia = f
  pannello(ultimoStato)
  if (f === 'mcp') negozioProvaMcp()
}
/* Ogni azione: la voce occupata coi secondi, poi cosa cambia, o il motivo con «Riprova». */
async function negozioFai(chiave, testo, percorso, corpo) {
  delete negozioGuasti[chiave]
  delete negozioConferme[chiave]
  negozioLavoro[chiave] = { testo: testo, da: Date.now() }
  negozioNota = ''
  pannello(ultimoStato)
  var giro = setInterval(function () { pannello(ultimoStato) }, 1000)
  try {
    var r = await chiedi(percorso, corpo)
    if (r && r.ok) {
      negozioNota = '✓ ' + (r.fatto || 'Fatto.')
      await leggiNegozio()
      await negozioCercaOra()
    } else if (r && r.conferma) {
      negozioConferme[chiave] = { comando: r.conferma.comando, testo: testo, percorso: percorso, corpo: Object.assign({}, corpo, { accetta: r.conferma.sha256 }) }
    } else {
      negozioGuasti[chiave] = { messaggio: (r && r.messaggio) || 'Non è riuscito, e il computer non ha detto perché.', testo: testo, percorso: percorso, corpo: corpo }
    }
  } catch (e) {
    negozioGuasti[chiave] = { messaggio: e && e.message ? e.message : 'il computer non risponde', testo: testo, percorso: percorso, corpo: corpo }
  } finally {
    clearInterval(giro)
    delete negozioLavoro[chiave]
    pannello(ultimoStato)
  }
}
window.negozioRiprova = (k) => { var g = negozioGuasti[k]; if (g) negozioFai(k, g.testo, g.percorso, g.corpo) }
window.negozioConferma = (k) => { var c = negozioConferme[k]; if (c) negozioFai(k, c.testo, c.percorso, c.corpo) }
window.negozioAnnulla = (k) => { delete negozioConferme[k]; pannello(ultimoStato) }
window.negozioInstalla = (id) => negozioFai('p:' + id, 'Installo…', '/api/negozio/installa', { id: id })
window.negozioAggiorna = (id) => negozioFai('p:' + id, 'Aggiorno…', '/api/negozio/aggiorna', { id: id })
window.negozioCommuta = (cosa, nome, attivo) => negozioFai(cosa + ':' + nome, attivo ? 'Accendo…' : 'Spengo…', '/api/negozio/commuta', { cosa: cosa, nome: nome, attivo: attivo })
function negozioTono(t) { return t === 'ok' ? 'var(--verde)' : t === 'attesa' ? 'var(--ambra)' : t === 'errore' ? 'var(--rosso)' : 'var(--testo-quieto)' }
/* Lo stato lo scrive il computer; uno di prima della 0.53.0 non lo manda, e lo si dice come allora. */
function negozioStatoDi(v, cosa) {
  if (v.stato) return v.stato
  if (cosa === 'plugin') return !v.installato ? { etichetta: 'da installare', tono: 'neutro', spiegazione: '' } : v.abilitato ? { etichetta: 'attivo', tono: 'ok', spiegazione: '' } : { etichetta: 'disattivato', tono: 'spento', spiegazione: '' }
  if (cosa === 'skill') return v.abilitata === false ? { etichetta: 'disattivata', tono: 'spento', spiegazione: '' } : { etichetta: 'attiva', tono: 'ok', spiegazione: '' }
  return v.abilitato === false ? { etichetta: 'disattivato', tono: 'spento', spiegazione: '' } : { etichetta: 'attivo', tono: 'neutro', spiegazione: '' }
}
function negozioTesta(nome, st, sotto) {
  // 0.70.0: la parola con il colore decisi dal PC; con un PC di prima l'etichetta e il tono.
  var tinta = st.colore ? ({ verde: 'var(--verde,#3c9)', ambra: 'var(--ambra,#e0a33c)', rosso: 'var(--rosso,#dc5f5f)', blu: 'var(--blu,#4aa3ff)', quieto: 'var(--testo-quieto,#9aa1a9)' })[st.colore] : negozioTono(st.tono)
  return '<div><b>' + esc(nome) + '</b> <span class="neg-stato" style="color:' + tinta + ';border-color:' + tinta + '" title="' + esc(st.etichetta) + '">' + esc(st.parola || st.etichetta) + '</span>' +
    (sotto ? ' <span class="sotto">' + esc(sotto) + '</span>' : '') + '</div>'
}
function negozioSotto(chiave) {
  var l = negozioLavoro[chiave]
  if (l) return '<div class="sotto">' + esc(l.testo) + ' ' + Math.max(0, Math.round((Date.now() - l.da) / 1000)) + ' s</div><div class="neg-prog"><span></span></div>'
  var c = negozioConferme[chiave]
  if (c) return '<div class="neg-conferma"><div class="sotto">Per installarlo, il marketplace chiede di eseguire questo comando sul computer, con i tuoi permessi. Confermalo solo se ti fidi di chi lo pubblica.</div>' +
    '<pre class="contesto">' + esc(c.comando || '(il computer non ha il testo del comando)') + '</pre>' +
    '<div class="riga"><button data-k="' + esc(chiave) + '" onclick="negozioConferma(this.dataset.k)">Mi fido: esegui e installa</button><button data-k="' + esc(chiave) + '" onclick="negozioAnnulla(this.dataset.k)">Annulla</button></div></div>'
  var g = negozioGuasti[chiave]
  if (g) return '<div class="errore">⚠ ' + esc(g.messaggio) + '</div><div class="riga"><button data-k="' + esc(chiave) + '" onclick="negozioRiprova(this.dataset.k)">Riprova</button></div>'
  return ''
}
function negozioRigaPlugin(p) {
  var k = 'p:' + p.id
  var st = negozioStatoDi(p, 'plugin')
  var tasti = negozioLavoro[k] ? '' : !p.installato
    ? '<button class="primario" data-id="' + esc(p.id) + '" onclick="negozioInstalla(this.dataset.id)">Installa</button>'
    : '<button' + (p.aggiornamento ? ' class="primario"' : '') + ' data-id="' + esc(p.id) + '" onclick="negozioAggiorna(this.dataset.id)">Aggiorna</button>' +
      '<button data-id="' + esc(p.id) + '" data-on="' + (p.abilitato ? '0' : '1') + '" onclick="negozioCommuta(\\'plugin\\', this.dataset.id, this.dataset.on === \\'1\\')">' + (p.abilitato ? 'Disattiva' : 'Attiva') + '</button>'
  return '<div class="neg-voce">' + negozioTesta(p.nome, st, p.marketplace + (p.versione ? ' · v ' + p.versione : '') + (p.installazioni ? ' · ↧ ' + p.installazioni : '')) +
    (p.descrizione ? '<div class="sotto">' + esc(p.descrizione) + '</div>' : '') +
    (st.spiegazione ? '<div class="sotto neg-spiega">' + esc(st.spiegazione) + '</div>' : '') +
    (tasti ? '<div class="riga">' + tasti + '</div>' : '') + negozioSotto(k) + '</div>'
}
function negozioRigaSkill(x) {
  var k = 'skill:' + x.nome
  var st = negozioStatoDi(x, 'skill')
  var origine = x.origine === 'utente' ? 'personale' : x.origine === 'progetto' ? 'del progetto' : 'dal plugin ' + (x.plugin || '')
  var tasti = negozioLavoro[k] || x.origine === 'plugin' ? '' :
    '<button data-n="' + esc(x.nome) + '" data-on="' + (x.abilitata ? '0' : '1') + '" onclick="negozioCommuta(\\'skill\\', this.dataset.n, this.dataset.on === \\'1\\')">' + (x.abilitata ? 'Disattiva' : 'Attiva') + '</button>'
  return '<div class="neg-voce">' + negozioTesta(x.nome, st, origine) +
    (x.descrizione ? '<div class="sotto">' + esc(x.descrizione) + '</div>' : '') +
    (st.spiegazione ? '<div class="sotto neg-spiega">' + esc(st.spiegazione) + '</div>' : '') +
    (tasti ? '<div class="riga">' + tasti + '</div>' : '') + negozioSotto(k) + '</div>'
}
function negozioRigaMcp(m) {
  var k = 'mcp:' + m.nome
  var st = negozioStatoDi(m, 'mcp')
  var dove = m.ambito === 'locale' ? 'solo questa cartella' : m.ambito === 'utente' ? 'tutti i progetti' : m.ambito === 'progetto' ? 'file .mcp.json del progetto' : m.ambito === 'altro' ? 'da un plugin o da claude.ai' : ''
  var chiavi = (m.tipo === 'stdio' ? m.variabili : m.intestazioni) || []
  var daApprovare = m.config === 'da-approvare' || m.config === 'rifiutato'
  var acceso = m.config ? m.config === 'attivo' : m.abilitato !== false
  var tasti = negozioLavoro[k] || m.ambito === 'altro' ? '' : daApprovare
    ? '<button class="primario" data-n="' + esc(m.nome) + '" onclick="negozioCommuta(\\'mcp-approva\\', this.dataset.n, true)">Approva</button>' +
      (m.config === 'da-approvare' ? '<button data-n="' + esc(m.nome) + '" onclick="negozioCommuta(\\'mcp-approva\\', this.dataset.n, false)">Rifiuta</button>' : '')
    : '<button data-n="' + esc(m.nome) + '" data-on="' + (acceso ? '0' : '1') + '" onclick="negozioCommuta(\\'mcp\\', this.dataset.n, this.dataset.on === \\'1\\')">' + (acceso ? 'Disattiva' : 'Attiva') + '</button>'
  return '<div class="neg-voce">' + negozioTesta(m.nome, st, [dove, m.tipo].filter(Boolean).join(' · ')) +
    '<div class="sotto" style="font-family:var(--mono, monospace)">' + esc(m.come || '') + '</div>' +
    (chiavi.length ? '<div class="sotto">' + (m.tipo === 'stdio' ? 'variabili' : 'intestazioni') + ': ' + esc(chiavi.join(', ')) + ' (i valori restano sul computer)</div>' : '') +
    (st.spiegazione ? '<div class="sotto neg-spiega">' + esc(st.spiegazione) + '</div>' : '') +
    (tasti ? '<div class="riga">' + tasti + '</div>' : '') + negozioSotto(k) + '</div>'
}
function negozioHtml() {
  var testa = '<div class="piastrella"><div class="titolo">Negozio' + aiuto('negozio', 'Plugin, skill e server MCP di Claude Code su questo computer: cosa c’è, se è acceso, e cosa vuol dire. Da qui installi, aggiorni, accendi e spegni. Aggiungere o togliere una skill o un MCP, cambiarne le chiavi e rimuovere un plugin si fa dal computer, dove si vedono i percorsi.') + '</div>'
  var chiudi = '<div class="riga"><button onclick="rileggiNegozio()">Aggiorna</button><button onclick="apriPannello(\\'negozio\\')">Chiudi</button></div></div>'
  if (negozioErrore) return testa + '<div class="errore">' + esc(negozioErrore) + '</div><div class="riga"><button onclick="rileggiNegozio()">Riprova</button></div>' + chiudi
  if (!negozioVisto) return testa + '<div class="sotto">Leggo dal computer… (il catalogo ci mette qualche secondo)</div><div class="neg-prog"><span></span></div>' + chiudi
  var d = negozioVisto
  var fam = [['plugin', 'Plugin'], ['skill', 'Skill'], ['mcp', 'MCP'], ['agenti', 'Agenti']]
  var tab = '<div class="riga">' + fam.map(function (f) {
    return '<button' + (negozioFamiglia === f[0] ? ' class="primario"' : '') + ' onclick="negozioFamigliaScegli(\\'' + f[0] + '\\')">' + f[1] + '</button>'
  }).join('') + '</div>'
  var avvisi = (d.errore ? '<div class="errore">⚠ Il catalogo non risponde: ' + esc(d.errore) + '</div>' : '') +
    (d.nota ? '<div class="sotto">' + esc(d.nota) + '</div>' : '') +
    (negozioNota ? '<div class="sotto" style="color:var(--verde)">' + esc(negozioNota) + '</div>' : '')
  var corpo = ''
  if (negozioFamiglia === 'plugin') {
    var elenco = negozioTrovati ? negozioTrovati.plugin || [] : d.plugin || []
    var spiega = negozioTrovati
      ? (negozioTrovati.errore ? '<div class="errore">' + esc(negozioTrovati.errore) + '</div>' : '<div class="sotto">' + negozioTrovati.totale + ' trovati con «' + esc(negozioParola) + '»' + (negozioTrovati.totale > elenco.length ? ', qui i primi ' + elenco.length : '') + '.</div>')
      : '<div class="sotto">Gli installati e i più installati' + (d.totalePlugin ? ' dei ' + d.totalePlugin + ' del catalogo' : '') + '. Cerca una parola per trovare gli altri.</div>'
    corpo = '<div class="riga"><input id="neg-cerca" placeholder="cerca nel catalogo (per esempio: documenti)" value="' + esc(negozioParola) + '" onkeydown="if (event.key === \\'Enter\\') negozioCerca()"><button onclick="negozioCerca()">Cerca</button></div>' +
      spiega + (elenco.length ? elenco.map(negozioRigaPlugin).join('') : '<div class="vuoto">Nessun plugin.</div>')
  } else if (negozioFamiglia === 'skill') {
    corpo = (d.skill || []).length ? d.skill.map(negozioRigaSkill).join('') : '<div class="vuoto">Nessuna skill. Si aggiungono dal computer.</div>'
  } else if (negozioFamiglia === 'mcp') {
    corpo = '<div class="riga"><button onclick="negozioProvaMcp()"' + (negozioProvoMcp ? ' disabled' : '') + '>' + (negozioProvoMcp ? 'Provo i collegamenti…' : 'Verifica i collegamenti') + '</button></div>' +
      (negozioProvoMcp ? '<div class="neg-prog"><span></span></div>' : '') +
      (negozioErroreMcp ? '<div class="errore">' + esc(negozioErroreMcp) + '</div>' : '') +
      ((d.mcp || []).length ? d.mcp.map(negozioRigaMcp).join('') : '<div class="vuoto">Nessun MCP per la cartella della prima chat aperta. Si aggiungono dal computer.</div>')
  } else {
    corpo = (d.agenti || []).length ? d.agenti.map(function (a) {
      return '<div class="neg-voce"><div><b>' + esc(a.nome) + '</b> <span class="sotto">' + esc(a.origine === 'utente' ? 'personale' : 'del progetto') + '</span></div>' + (a.descrizione ? '<div class="sotto">' + esc(a.descrizione) + '</div>' : '') + '</div>'
    }).join('') + '<div class="sotto">Gli agenti non si accendono: Claude li chiama quando servono.</div>' : '<div class="vuoto">Nessun agente.</div>'
  }
  return testa + (d.cartella ? '<div class="sotto">Cartella guardata: ' + esc(d.cartella) + '</div>' : '') + tab + avvisi + corpo + chiudi
}

/*
 * La sezione File (0.54.0), in versione semplice: i progetti di questo
 * computer, solo dentro le loro cartelle. Si sfoglia, si guarda un testo
 * (con il carattere a larghezza fissa), un'immagine o un PDF, si scarica, e
 * si carica un file nella cartella aperta (gli stessi pezzi dei file per le
 * chat). Un progetto con una chat protetta dal PIN si apre solo con il PIN.
 * I file che il PC manda al telefono si ricevono con l'app.
 */
var fileProgetti = null
var fileErrore = ''
var fileDove = null
var fileElenco = null
var fileVista = null
var fileNota = ''
var filePin = null
function fileMotivo(e) { return e && e.message ? e.message : 'il computer non risponde' }
async function leggiFileProgetti() {
  fileErrore = ''
  try {
    const r = await chiedi('/api/file/progetti', {})
    fileProgetti = (r && r.progetti) || []
    if (r && r.errore) fileErrore = r.errore
  } catch (e) {
    fileProgetti = []
    fileErrore = e && (e.stato === 404 || e.stato === 409) ? 'Questo computer non sa ancora mostrare i file dei progetti: arriva aggiornandolo alla 0.54.0.' : 'Non riesco a leggere i progetti: ' + fileMotivo(e)
  }
}
async function fileVai(progetto, percorso) {
  if (fileVista && fileVista.url) URL.revokeObjectURL(fileVista.url)
  fileVista = null; filePin = null; fileErrore = ''
  try {
    fileElenco = await chiedi('/api/file/elenco', { progetto: progetto, percorso: percorso })
    fileDove = { progetto: progetto, percorso: fileElenco.percorso || '' }
  } catch (e) {
    if (e && e.stato === 423) filePin = { progetto: progetto, percorso: percorso, chat: e.corpo && e.corpo.chat, errore: fileMotivo(e) }
    else fileErrore = fileMotivo(e)
  }
  pannello(ultimoStato)
}
/**
 * «Apri cartella» (0.82.0): il PC trova la cartella del progetto del workspace
 * o della chat e il progetto della sezione File che la contiene; qui si apre
 * File lì. Se non si può (la cartella è su un altro PC, non c'è) lo si dice.
 */
window.apriCartella = async (q) => {
  notaCartella = ''
  var r
  try { r = await chiedi('/api/file/cartella', q) } catch (e) {
    notaCartella = e && e.stato === 404 ? 'Questo computer non sa ancora aprire le cartelle: arriva aggiornandolo alla 0.82.0.' : fileMotivo(e)
    pannello(ultimoStato)
    return
  }
  // Il 409 non solleva: torna con il motivo (la cartella è su un altro PC, non c'è).
  if (!r || r.errore || !r.progetto) { notaCartella = (r && r.errore) || 'Il computer non ha detto dove sta la cartella.'; pannello(ultimoStato); return }
  await leggiFileProgetti()
  if (!inVista('file')) vaiScheda('file')
  fileNota = ''
  await fileVai(r.progetto, r.percorso || '')
}
window.fileApri = (el) => { fileNota = ''; fileVai(el.dataset.p, el.dataset.r || '') }
window.fileProgettiTutti = () => { if (fileVista && fileVista.url) URL.revokeObjectURL(fileVista.url); fileDove = null; fileElenco = null; fileVista = null; filePin = null; fileNota = ''; pannello(ultimoStato) }
window.fileSblocca = async () => {
  const c = document.getElementById('file-pin')
  if (!filePin || !filePin.chat || !c) return
  try { await chiedi('/api/pin/sblocca', { chat: filePin.chat, pin: c.value.trim() }); const p = filePin; await fileVai(p.progetto, p.percorso) } catch (e) { filePin.errore = fileMotivo(e); pannello(ultimoStato) }
}
/** Il file a pezzi, fino a massimo byte: con la ripresa se la rete cade. */
async function fileLeggiTutto(percorso, massimo) {
  const parti = []
  var da = 0, byte = 0, mime = 'application/octet-stream', tentativi = 0
  do {
    try {
      const r = await chiedi('/api/file/leggi', { progetto: fileDove.progetto, percorso: percorso, da: da })
      byte = r.byte; mime = r.mime || mime
      const bin = atob(r.dati || '')
      const u = new Uint8Array(bin.length)
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
      parti.push(u); da += u.length; tentativi = 0
      fileNota = percorso + ': ' + Math.floor(da * 100 / Math.max(1, byte)) + '% (' + inMb(da) + ' di ' + inMb(byte) + ')'
      pannello(ultimoStato)
      if (u.length === 0) break
    } catch (e) {
      if (e && e.stato && e.stato < 500) throw e
      tentativi += 1
      if (tentativi > 8) throw e
      fileNota = percorso + ': la rete è caduta, riprovo fra poco (' + tentativi + ')…'
      pannello(ultimoStato)
      await aspetta(Math.min(15000, 1000 * tentativi * tentativi))
    }
  } while (da < byte && da < massimo)
  return { parti: parti, byte: byte, mime: mime, tagliato: da < byte }
}
window.fileGuarda = async (el) => {
  const percorso = el.dataset.r, tipo = el.dataset.t, nome = el.dataset.n
  if (fileVista && fileVista.url) URL.revokeObjectURL(fileVista.url)
  fileVista = null
  try {
    const t = await fileLeggiTutto(percorso, tipo === 'testo' ? 524288 : 20971520)
    if (tipo === 'testo') {
      fileVista = { nome: nome, tipo: tipo, testo: new TextDecoder('utf-8').decode(await new Blob(t.parti).arrayBuffer()), tagliato: t.tagliato }
    } else if (t.tagliato) {
      fileNota = nome + ' è troppo grande per vederlo qui (oltre 20 MB): scaricalo.'
    } else {
      fileVista = { nome: nome, tipo: tipo, url: URL.createObjectURL(new Blob(t.parti, { type: t.mime })) }
    }
    if (fileVista) fileNota = ''
  } catch (e) { fileNota = 'Non riesco ad aprire ' + nome + ': ' + fileMotivo(e) }
  pannello(ultimoStato)
}
window.fileScarica = async (el) => {
  const percorso = el.dataset.r, nome = el.dataset.n
  try {
    const t = await fileLeggiTutto(percorso, Infinity)
    const url = URL.createObjectURL(new Blob(t.parti, { type: t.mime }))
    const a = document.createElement('a')
    a.href = url; a.download = nome
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 60000)
    fileNota = '✓ ' + nome + ' scaricato (' + inMb(t.byte) + '): lo trovi nei download del browser.'
  } catch (e) { fileNota = 'Non riesco a scaricare ' + nome + ': ' + fileMotivo(e) }
  pannello(ultimoStato)
}
window.fileChiudiVista = () => { if (fileVista && fileVista.url) URL.revokeObjectURL(fileVista.url); fileVista = null; pannello(ultimoStato) }
const sceltaCarica = document.createElement('input')
sceltaCarica.type = 'file'
sceltaCarica.multiple = true
sceltaCarica.style.display = 'none'
window.fileCarica = () => { if (!sceltaCarica.isConnected) document.body.appendChild(sceltaCarica); sceltaCarica.value = ''; sceltaCarica.click() }
sceltaCarica.onchange = async () => {
  const dove = fileDove
  if (!dove) return
  const fatti = []
  for (const f of Array.from(sceltaCarica.files || [])) {
    if (f.size > ALLEGATO_MAX) { fatti.push(f.name + ' è di ' + inMb(f.size) + ': il limite è 100 MB.'); continue }
    try {
      const r = await mandaUnFile(f, { progetto: dove.progetto, cartella: dove.percorso }, '')
      fatti.push('✓ caricato ' + r.nome + ' in ' + (r.percorso || r.nome))
    } catch (e) { fatti.push('Non è arrivato ' + f.name + ': ' + fileMotivo(e)) }
    fileNota = fatti.join(' · ')
    pannello(ultimoStato)
  }
  allegatoNota = ''
  await fileVai(dove.progetto, dove.percorso)
  fileNota = fatti.join(' · ')
  pannello(ultimoStato)
}
function fileHtml() {
  var testa = '<div class="piastrella"><div class="titolo">File' + aiuto('file', 'I progetti di questo computer (le cartelle dove hai lavorato con Claude Code, le chat aperte, gli autopiloti), solo dentro le loro cartelle. Tocca una cartella per entrarci; un file di testo, un’immagine o un PDF si guardano qui, tutto il resto si scarica. «Carica qui» mette un file del telefono nella cartella aperta. I file che il computer ti manda («📱 Manda al telefono») arrivano nell’app SierraDeck.') + '</div>'
  // File è una destinazione del menu (0.61.0): niente «Chiudi», che non chiuderebbe niente.
  var chiudi = '</div>'
  var nota = fileNota ? '<div class="sotto"' + (fileNota.indexOf('✓') === 0 ? ' style="color:var(--verde)"' : '') + '>' + esc(fileNota) + '</div>' : ''
  if (fileErrore) testa += '<div class="errore">⚠ ' + esc(fileErrore) + '</div>'
  if (!fileProgetti) return testa + '<div class="sotto">Leggo i progetti dal computer…</div>' + chiudi
  if (filePin) {
    return testa + '<div class="errore">🔒 ' + esc(filePin.errore) + '</div>' +
      (filePin.chat ? '<div class="riga"><input id="file-pin" type="password" inputmode="numeric" placeholder="PIN" onkeydown="if (event.key === \\'Enter\\') fileSblocca()"><button class="primario" onclick="fileSblocca()">Sblocca</button></div>' : '') +
      '<div class="riga"><button onclick="fileProgettiTutti()">‹ Progetti</button></div>' + chiudi
  }
  if (!fileDove || !fileElenco) {
    var elenco = fileProgetti.length ? fileProgetti.map(function (p) {
      return '<div class="neg-voce"><button class="riga-altro" data-p="' + esc(p.percorso) + '" data-r="" onclick="fileApri(this)">' + (p.chiuso ? '🔒 ' : '📁 ') + esc(p.nome) + '</button>' +
        (p.doppio || p.chiuso ? '<div class="sotto">' + esc(p.percorso) + (p.chiuso ? ' · protetto dal PIN di una sua chat' : '') + '</div>' : '') + '</div>'
    }).join('') : '<div class="vuoto">Nessun progetto su questo computer: si vedono le cartelle dove hai già aperto una chat.</div>'
    return testa + nota + elenco + chiudi
  }
  var pezzi = (fileDove.percorso || '').split('/').filter(function (x) { return x !== '' })
  var progetto = (fileProgetti.find(function (p) { return p.percorso === fileDove.progetto }) || { nome: fileDove.progetto }).nome
  var briciole = '<div class="riga" style="flex-wrap:wrap"><button onclick="fileProgettiTutti()">‹ Progetti</button>' +
    '<button data-p="' + esc(fileDove.progetto) + '" data-r="" onclick="fileApri(this)">' + esc(progetto) + '</button>' +
    pezzi.map(function (x, i) { return '<button data-p="' + esc(fileDove.progetto) + '" data-r="' + esc(pezzi.slice(0, i + 1).join('/')) + '" onclick="fileApri(this)">' + esc(x) + '</button>' }).join('') +
    '<button class="primario" onclick="fileCarica()">Carica qui</button></div>'
  var vista = ''
  if (fileVista) {
    var corpo = fileVista.tipo === 'testo'
      ? '<pre class="contesto" style="max-height:60vh;overflow:auto;white-space:pre;font-family:var(--mono, monospace)">' + esc(fileVista.testo) + '</pre>' + (fileVista.tagliato ? '<div class="sotto">Qui ci sono i primi 512 KB: il resto si vede scaricandolo.</div>' : '')
      : fileVista.tipo === 'immagine'
        ? '<img src="' + fileVista.url + '" alt="' + esc(fileVista.nome) + '" style="max-width:100%;height:auto;display:block">'
        : '<iframe src="' + fileVista.url + '" title="' + esc(fileVista.nome) + '" style="width:100%;height:60vh;border:0"></iframe><div class="sotto"><a href="' + fileVista.url + '" target="_blank" rel="noopener">Apri il PDF a tutto schermo</a> (se qui non si vede, il browser del telefono lo apre a parte).</div>'
    vista = '<div class="piastrella"><div class="riga"><b style="flex:1">' + esc(fileVista.nome) + '</b><button onclick="fileChiudiVista()">Chiudi</button></div>' + corpo + '</div>'
  }
  var voci = fileElenco.voci.length ? fileElenco.voci.map(function (v) {
    if (v.cartella) return '<div class="neg-voce"><button class="riga-altro" data-p="' + esc(fileDove.progetto) + '" data-r="' + esc(v.percorso) + '" onclick="fileApri(this)">📁 ' + esc(v.nome) + '</button></div>'
    var attr = ' data-r="' + esc(v.percorso) + '" data-n="' + esc(v.nome) + '" data-t="' + esc(v.tipo) + '"'
    return '<div class="neg-voce"><div><b>' + esc(v.nome) + '</b> <span class="sotto">' + inMb(v.byte) + (v.quando ? ' · ' + new Date(v.quando).toLocaleString('it-IT') : '') + '</span></div>' +
      '<div class="riga">' + (v.tipo !== 'altro' ? '<button' + attr + ' onclick="fileGuarda(this)">Guarda</button>' : '') + '<button' + attr + ' onclick="fileScarica(this)">Scarica</button></div></div>'
  }).join('') : '<div class="vuoto">Cartella vuota.</div>'
  return testa + briciole + nota + vista + (fileElenco.tagliato ? '<div class="sotto">Ci sono più di 2000 voci: qui le prime.</div>' : '') + voci + chiudi
}

window.apriPannello = async (quale) => {
  // Il pannello che la linguetta o la sezione mostra già aperto (0.83.0): il
  // suo «Chiudi» torna indietro, alla prima linguetta o all'elenco di Altro.
  if (pannelloAperto !== quale && pannelliDelPosto(posto).indexOf(quale) >= 0) {
    const dove = indietroTelefono(posto)
    if (dove) vaiAlPosto(dove)
    return
  }
  pannelloAperto = pannelloAperto === quale ? null : quale
  // A ogni apertura, non solo la prima: letto una volta, l'elenco restava
  // quello di quando la pagina era stata aperta.
  if (pannelloAperto === 'sessioni') {
    await leggiSessioni()
  }
  if (pannelloAperto === 'consumi') await leggiConsumi()
  if (pannelloAperto === 'chatgestione') { gcNota = null; gcConfermaAp = null; gcSvuota = null; await gcLeggi() }
  if (pannelloAperto === 'salute') await leggiSalute()
  if (pannelloAperto === 'negozio') { negozioNota = ''; await leggiNegozio(); if (negozioFamiglia === 'mcp') negozioProvaMcp() }
  if (pannelloAperto === 'file') { fileDove = null; fileElenco = null; fileVista = null; fileNota = ''; filePin = null; await leggiFileProgetti() }
  if (pannelloAperto === 'pc') { pcAperto = null; postaVoci = null; await leggiPc() }
  if (pannelloAperto === 'drive') { driveRiavviato = false; await leggiDrive() }
  if (pannelloAperto === 'pannellodrive') { pdDati = null; pdErrore = ''; pdDaConfermare = ''; await leggiPannelloDrive() }
  if (pannelloAperto === 'impostazioni') { await leggiPreferenze(); await leggiAggiornamento(); await leggiQuadernoPersonale(); await leggiAccount() }
  if (pannelloAperto === 'quaderno') {
    schedaAperta = null
    quadernoTag = ''
    quadernoQ = ''
    // La stessa cartella da cui poi si aprono le schede (cartellaPrima):
    // prima l'elenco veniva dalla prima chat e la scheda si chiedeva alla
    // cartella dell'autopilota, e con due progetti diversi era un 404 muto.
    const c = cartellaPrima()
    if (c) await leggiQuaderno(c)
  }
  pannello(ultimoStato)
}

/** Riapre una chat salvata in un workspace: la si vede nell'elenco, la si tocca. */
window.riprendiSalvata = async (cwd, sessione, altrove) => {
  // La cartella e' su un altro PC: si dice qui, invece di chiedere al computer
  // una cosa che rifiutera' comunque.
  if (altrove) { notaGlobale = 'Questa chat lavora su ' + altrove + ': la sua cartella qui non c’è. Riaprila da quel PC, o scrivile da Computer → Altri computer.'; pannello(ultimoStato); return }
  await chiedi('/api/sessioni/riprendi', { cartella: cwd, sessione: sessione })
  aggiorna()
}

/** Riprende **quella** conversazione, con la sua storia dentro. */
/** Il riquadro per scrivere a una chat chiusa su un altro PC (0.58.4). */
function sottofondoHtml() {
  const s = (sessioniViste || [])[sfScelta]
  if (!s) return ''
  const st = sfStato || {}
  const fase = st.fase || ''
  return '<div class="piastrella" style="margin-top:8px">' +
    '<div class="titolo">Scrivi a «' + esc(s.titolo) + '» su ' + esc(s.altrove) + aiuto('sottofondo', 'Quel PC la avvia in sottofondo (claude --resume nella sua cartella, senza riquadro e senza finestre: là non si vede niente e non cambia il workspace). Il messaggio aspetta in coda e parte appena la chat è pronta; poi la trovi fra le chat di ' + esc(s.altrove) + ' e la segui da lì.') + '</div>' +
    (fase ? '<div class="' + (fase === 'errore' ? 'errore' : 'sotto') + '" style="margin-top:6px">' + esc(testoAvvio(fase, s.altrove, !!st.testo)) + (st.messaggio ? ' — ' + esc(fase === 'errore' ? 'Perché: ' + st.messaggio : 'Da ' + s.altrove + ': ' + st.messaggio) : '') + '</div>' : '') +
    (st.testo && fase && fase !== 'fatto' ? '<div class="sotto">Il tuo messaggio, in attesa: «' + esc(st.testo.slice(0, 160)) + '». Non si perde: Riprova lo rimanda una volta sola.</div>' : '') +
    (fase === 'fatto' ? '<div class="sotto">Messaggio consegnato: la chat gira su ' + esc(s.altrove) + ' in sottofondo.</div>' : '') +
    '<div class="riga"><textarea id="sf-testo" rows="3" placeholder="Il messaggio per questa chat: parte appena è pronta là"></textarea></div>' +
    '<div class="riga">' +
      '<button class="primario" onclick="sfManda(true)">Manda</button>' +
      '<button onclick="sfManda(false)">Avvia senza scrivere</button>' +
      (fase === 'errore' ? '<button onclick="sfRiprova()">Riprova</button>' : '') +
      '<button onclick="sfChiudi()">Chiudi</button>' +
    '</div></div>'
}

window.sfChiudi = () => { sfScelta = -1; sfStato = null; if (sfGiro) { clearInterval(sfGiro); sfGiro = null } pannello(ultimoStato) }

async function sfChiedi(s, corpo) {
  return chiedi('/api/ponte', { pc: s.altrovePc, percorso: '/api/sottofondo/avvia', corpo: corpo })
}

window.sfManda = async (conTesto) => {
  const s = (sessioniViste || [])[sfScelta]
  if (!s) return
  const el = document.getElementById('sf-testo')
  const testo = conTesto && el ? el.value.trim() : ''
  if (conTesto && testo === '') return
  const id = testo ? 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) : ''
  sfStato = { fase: 'chiedo', testo: testo, id: id }
  pannello(ultimoStato)
  await sfInvia(s)
}

window.sfRiprova = async () => {
  const s = (sessioniViste || [])[sfScelta]
  if (!s || !sfStato) return
  sfStato = { fase: 'chiedo', testo: sfStato.testo, id: sfStato.id }
  pannello(ultimoStato)
  await sfInvia(s)
}

async function sfInvia(s) {
  const st = sfStato
  try {
    const r = await sfChiedi(s, { cartella: s.cwd, sessione: s.id, titolo: s.titolo, ...(st.testo ? { testo: st.testo, idMessaggio: st.id } : {}) })
    if (r && r.errore) { sfStato = { ...st, fase: 'errore', messaggio: r.errore }; pannello(ultimoStato); return }
    sfStato = { ...st, fase: r.fase || 'avvio', messaggio: r.messaggio || '' }
    if (st.id && (r.consegnati || []).includes(st.id)) sfStato.fase = 'fatto'
  } catch (e) {
    const m = e && e.message ? e.message : 'quel PC non risponde'
    sfStato = { ...st, fase: 'errore', messaggio: /404|non trovat/.test(m) ? s.altrove + ' va aggiornato alla 0.58.4 per avviare le chat in sottofondo' : m }
  }
  pannello(ultimoStato)
  if (sfStato.fase === 'errore' || sfStato.fase === 'fatto') return
  if (sfGiro) clearInterval(sfGiro)
  const inizio = Date.now()
  sfGiro = setInterval(async () => {
    if (!sfStato || sfStato.fase === 'errore' || sfStato.fase === 'fatto') { clearInterval(sfGiro); sfGiro = null; return }
    try {
      const r = await chiedi('/api/ponte', { pc: s.altrovePc, percorso: '/api/sottofondo/stato', corpo: { sessione: s.id } })
      if (r && r.fase) {
        sfStato = { ...sfStato, fase: r.fase, messaggio: r.messaggio || '' }
        if (sfStato.id && (r.consegnati || []).includes(sfStato.id)) sfStato.fase = 'fatto'
        else if (!sfStato.id && (r.fase === 'pronta' || r.fase === 'aspetta' || r.fase === 'lavora')) sfStato.fase = 'fatto'
        if (r.fase === 'chiusa') sfStato.fase = 'errore'
      }
    } catch (e) { /* al giro dopo */ }
    if (Date.now() - inizio > 240000 && sfStato.fase !== 'fatto') sfStato = { ...sfStato, fase: 'errore', messaggio: 'dopo quattro minuti il messaggio non risulta ancora consegnato' }
    pannello(ultimoStato)
  }, 2000)
}

window.riprendiSessione = async (i) => {
  const s = (sessioniViste || [])[i]
  if (!s) return
  // Vive su un altro PC (0.58.4): si scrive da qui, quel PC la avvia in sottofondo.
  if (s.altrove && s.altrovePc) { sfScelta = i; sfStato = null; pannello(ultimoStato); return }
  if (s.altrove) { notaGlobale = 'Questa conversazione lavora su ' + s.altrove + ': la sua cartella qui non c’è. Riaprila da quel PC, o scrivile da Computer → Altri computer.'; pannello(ultimoStato); return }
  await chiedi('/api/sessioni/riprendi', { cartella: s.cwd, sessione: s.id })
  pannelloAperto = null
  aggiorna()
}

/** La coda condivisa di un progetto: si legge dal Drive attraverso il computer. */
async function leggiPc() {
  try {
    const r = await chiedi('/api/pc')
    pcVisti = r.pc || []
    postaErrore = r.disponibile === false ? 'Questo computer non sa ancora mandare azioni a un altro PC: aggiornalo.' : ''
  } catch (e) { pcVisti = []; postaErrore = 'Non sono riuscito a leggere gli altri PC: ' + (e && e.message ? e.message : 'il computer non risponde') }
}
async function leggiPosta() {
  if (pcAperto === null) return
  try {
    const r = await chiedi('/api/posta', { pc: pcAperto })
    postaVoci = r.voci || []
    postaErrore = r.disponibile === false ? 'La posta sta sul Drive: sul computer serve la cassaforte sbloccata e il Drive collegato.' : ''
  } catch (e) { postaVoci = []; postaErrore = 'Non sono riuscito a leggere la cassetta.' }
}
window.apriPc = async (id) => {
  pcAperto = id; postaVoci = null; postaErrore = ''
  await leggiPosta()
  pannello(ultimoStato)
}
window.chiudiPc = () => { pcAperto = null; postaVoci = null; pannello(ultimoStato) }
window.mandaPosta = async () => {
  const testo = (document.getElementById('posta-testo') || {}).value || ''
  const libera = ((document.getElementById('posta-cwd-libera') || {}).value || '').trim()
  const scelta = (document.getElementById('posta-cwd') || {}).value || ''
  const cwd = libera || scelta
  if (!testo.trim() || !cwd || pcAperto === null) { postaErrore = 'Servono la cartella e il testo.'; pannello(ultimoStato); return }
  try {
    const r = await chiedi('/api/posta/aggiungi', { pc: pcAperto, cwd: cwd, testo: testo.trim() })
    postaVoci = r.voci || postaVoci; postaErrore = ''
    const campo = document.getElementById('posta-testo'); if (campo) campo.value = ''
  } catch (e) { postaErrore = 'Non sono riuscito a mandare: ' + (e && e.message ? e.message : e) }
  pannello(ultimoStato)
}
window.togliPosta = async (voce) => {
  if (pcAperto === null) return
  try { const r = await chiedi('/api/posta/togli', { pc: pcAperto, voce: voce }); postaVoci = r.voci || postaVoci }
  catch (e) { postaErrore = 'Non sono riuscito a togliere la voce.' }
  pannello(ultimoStato)
}
window.pulisciPosta = async () => {
  if (pcAperto === null) return
  try { const r = await chiedi('/api/posta/pulisci', { pc: pcAperto }); postaVoci = r.voci || postaVoci }
  catch (e) { postaErrore = 'Non sono riuscito a pulire.' }
  pannello(ultimoStato)
}
// I consumi si rileggono mentre il pannello e' aperto: i limiti del piano
// salgono mentre guardi, ed e' proprio quello che si vuole vedere.
setInterval(async () => {
  if (!aperto('consumi') || !chiave || document.hidden) return
  await leggiConsumi()
  pannello(ultimoStato)
}, 30000)

// La cassetta cambia dal PC destinatario (consegnata, fallita): si rilegge.
setInterval(async () => {
  if (!aperto('pc') || !chiave || document.hidden) return
  try { if (pcAperto !== null) await leggiPosta(); else await leggiPc() } catch (e) { return }
  pannello(ultimoStato)
}, 10000)

async function leggiCoda() {
  if (codaProgetto === null) return
  try {
    const r = await chiedi('/api/coda', { progetto: codaProgetto })
    codaVoci = r.voci || []
    codaErrore = r.disponibile === false ? 'La coda sta sul Drive: sul computer serve la cassaforte sbloccata e il Drive collegato.' : ''
  } catch (e) { codaVoci = []; codaErrore = 'Non sono riuscito a leggere la coda.' }
}
window.apriCoda = async (id) => {
  codaProgetto = id; codaVoci = null; codaErrore = ''
  await leggiCoda()
  pannello(ultimoStato)
}
window.chiudiCoda = () => { codaProgetto = null; codaVoci = null; pannello(ultimoStato) }
window.mettiInCoda = async () => {
  const campo = document.getElementById('coda-testo')
  const testo = campo ? campo.value.trim() : ''
  if (!testo || codaProgetto === null) return
  try {
    const r = await chiedi('/api/coda/aggiungi', { progetto: codaProgetto, testo: testo })
    codaVoci = r.voci || codaVoci; codaErrore = ''
  } catch (e) { codaErrore = 'Non sono riuscito a mettere in coda.' }
  pannello(ultimoStato)
}
window.togliDallaCoda = async (voce) => {
  if (codaProgetto === null) return
  try {
    const r = await chiedi('/api/coda/togli', { progetto: codaProgetto, voce: voce })
    codaVoci = r.voci || codaVoci
  } catch (e) { codaErrore = 'Non sono riuscito a togliere la voce.' }
  pannello(ultimoStato)
}
window.pulisciCoda = async () => {
  if (codaProgetto === null) return
  try {
    const r = await chiedi('/api/coda/pulisci', { progetto: codaProgetto })
    codaVoci = r.voci || codaVoci
  } catch (e) { codaErrore = 'Non sono riuscito a pulire.' }
  pannello(ultimoStato)
}

function etichettaLavoro(tipo) { return tipo === 'fusione' ? 'Fondo con il Drive' : tipo === 'ripristino' ? 'Ripristino dal Drive' : tipo === 'salvataggio' ? 'Salvo sul Drive' : tipo === 'arrivo' ? 'Arrivo dal Drive' : tipo }
async function leggiDrive() {
  driveLeggo = true; driveProgresso = null; pannello(ultimoStato)
  // Mentre il computer legge, ogni mezzo secondo si chiede a che fase sta:
  // la pagina non riceve eventi, chiede. Un computer vecchio non ha la rotta:
  // la barra resta all'inizio, e basta.
  if (driveLetturaTimer) clearInterval(driveLetturaTimer)
  driveLetturaTimer = setInterval(async () => {
    try { const s = await chiedi('/api/drive/catalogoStato'); if (driveLeggo && s && s.inCorso) { driveProgresso = s.inCorso; pannello(ultimoStato) } } catch (e) {}
  }, 500)
  try {
    const r = await chiedi('/api/drive/catalogo')
    if (r.disponibile === false) { driveErrore = 'Questo computer non sa ancora mostrare il Drive: aggiornalo.'; driveCatalogo = null }
    else if (r.ok && r.catalogo) { driveCatalogo = r.catalogo; driveErrore = '' }
    else { driveErrore = r.messaggio || 'Non riesco a leggere il Drive.'; driveCatalogo = null }
  } catch (e) { driveErrore = 'Non riesco a leggere il Drive: il computer non risponde.' }
  finally { if (driveLetturaTimer) clearInterval(driveLetturaTimer); driveLetturaTimer = null; driveLeggo = false; driveProgresso = null }
  pannello(ultimoStato)
}
window.leggiDrive = leggiDrive
window.driveVistaCambia = (v) => { driveVista = v; pannello(ultimoStato) }
window.driveCommuta = (k) => { driveAperti[k] = !driveAperti[k]; pannello(ultimoStato) }
window.drivePorta = async (chiave) => {
  driveInCorso = 'p:' + chiave; driveErrore = ''; pannello(ultimoStato)
  try {
    const r = await chiedi('/api/drive/porta', { progetto: chiave })
    if (!r.ok) { driveErrore = r.messaggio || r.errore || 'Non riuscito.'; driveInCorso = null }
  } catch (e) { driveErrore = 'Non riuscito: il computer non risponde.'; driveInCorso = null }
  pannello(ultimoStato)
}
window.drivePortaWs = async (nome) => {
  driveInCorso = 'w:' + nome; driveErrore = ''; pannello(ultimoStato)
  try {
    const r = await chiedi('/api/drive/portaWorkspace', { workspace: nome })
    if (!r.ok) { driveErrore = r.messaggio || r.errore || 'Non riuscito.'; driveInCorso = null }
  } catch (e) { driveErrore = 'Non riuscito: il computer non risponde.'; driveInCorso = null }
  pannello(ultimoStato)
}
window.driveAnnulla = async () => { try { await chiedi('/api/drive/annulla', {}) } catch (e) {} }
window.driveRiavvia = async () => {
  try { const r = await chiedi('/api/drive/riavvia', {}); driveRiavviato = !!r.ok; if (!r.ok) driveErrore = r.messaggio || r.errore || 'Non riavviato.' } catch (e) { driveErrore = 'Non riesco a chiedere il riavvio.' }
  pannello(ultimoStato)
}
// Il lavoro sul computer, ogni due secondi finche' il pannello Drive e' aperto;
// quando finisce, il catalogo e' cambiato e si rilegge.
setInterval(async () => {
  if (!aperto('drive') || !chiave || document.hidden) return
  try { driveLavoro = await chiedi('/api/drive/lavoro') } catch (e) { return }
  const adesso = !!(driveLavoro && driveLavoro.inCorso)
  if (driveEraInCorso && !adesso) { driveInCorso = null; await leggiDrive() }
  driveEraInCorso = adesso
  pannello(ultimoStato)
}, 2000)

// La coda condivisa cambia dal computer (una voce consegnata): si rilegge
// ogni dieci secondi finche' e' aperta, come fa l'app.
setInterval(async () => {
  if (!aperto('code') || codaProgetto === null || !chiave || document.hidden) return
  try { await leggiCoda() } catch (e) { return }
  pannello(ultimoStato)
}, 10000)

window.creaWorkspace = async () => {
  const campo = document.getElementById('ws-nuovo')
  if (!campo || !campo.value.trim()) return
  await chiedi('/api/workspace/crea', { nome: campo.value.trim() })
  campo.value = ''
  aggiorna()
}

/**
 * Il menu dei workspace (0.82.0), come sul PC: la ricerca in cima, i gruppi
 * «Recenti» e uno per PC (gruppiMenuWorkspace), le azioni di ogni riga dietro
 * «⋯» (azioniMenuWorkspace). Scrivere nella ricerca ridisegna solo l'elenco,
 * così la casella non perde il fuoco.
 */
var wsFiltro = ''
/** La riga con il «⋯» aperto: 'q:nome' (di qui) o 'a:pc:nome' (di un altro PC). */
var wsAperto = ''
/** Il workspace che si sta rinominando. */
var wsRinomina = ''
function wsChiave(v) { return v.qui ? 'q:' + v.nome : 'a:' + (v.pc ? v.pc.id : '') + ':' + v.nome }
function wsListaHtml(s) {
  const w = s.workspace || { nomi: [], attivo: '' }
  const nomi = w.nomi || []
  const conti = {}
  ;(w.chat || []).forEach((c) => { conti[c.workspace] = (conti[c.workspace] || 0) + 1 })
  const gruppi = gruppiMenuWorkspace({ nomi: nomi, attivo: w.attivo, recenti: w.recenti || [], filtro: wsFiltro, altrove: w.altrove || [] })
  if (gruppi.length === 0) return '<div class="vuoto">Nessun workspace con «' + esc(wsFiltro) + '».</div>'
  return gruppi.map((g) => '<div class="ws-gruppo"><div class="ws-titolo">' + esc(g.titolo) + '</div>' + g.voci.map((v) => {
    const k = wsChiave(v)
    const davanti = v.qui && v.nome === w.attivo
    const dati = ' data-k="' + esc(k) + '" data-n="' + esc(v.nome) + '" data-pc="' + esc(v.pc ? v.pc.id : '') + '"'
    const quante = conti[v.nome] || 0
    let h = '<div class="ws-riga' + (davanti ? ' attivo' : '') + '">' +
      '<button class="ws-va"' + dati + ' onclick="wsTocca(this.dataset.k)"' + (davanti ? ' aria-current="true"' : '') + '>' +
        '<span class="ws-segno" aria-hidden="true">' + (davanti ? '✓' : '') + '</span><span class="ws-nome">' + esc(v.nome) + '</span>' +
        '<span class="ws-conta">' + (v.qui ? (quante === 1 ? '1 chat' : quante + ' chat') : esc(v.pc ? v.pc.nome : '')) + '</span></button>' +
      '<button class="ws-altro"' + dati + ' aria-label="Altre azioni per «' + esc(v.nome) + '»" aria-expanded="' + (wsAperto === k) + '" onclick="wsApriAzioni(this.dataset.k)">⋯</button></div>'
    if (v.qui && wsRinomina === v.nome) {
      h += '<div class="riga ws-azioni"><input id="ws-rinomina" value="' + esc(v.nome) + '" aria-label="Nome nuovo per «' + esc(v.nome) + '»" onkeydown="if (event.key === \\'Enter\\') rinominaWorkspace(this.dataset.n)" data-n="' + esc(v.nome) + '">' +
        '<button class="primario"' + dati + ' onclick="rinominaWorkspace(this.dataset.n)">Rinomina</button><button onclick="wsRinomina = \\'\\'; pannello(ultimoStato)">Annulla</button></div>'
    } else if (wsAperto === k) {
      // La pagina non apre dal vivo un workspace di un altro PC (lo fa il PC): lì resta «Porta qui».
      const az = azioniMenuWorkspace(v, { attivo: w.attivo, quanti: nomi.length }).filter((a) => v.qui || a.azione !== 'apri')
      h += '<div class="riga ws-azioni">' + az.map((a) => '<button' + dati + ' data-a="' + a.azione + '"' + (a.pericolo ? ' class="pericolo"' : '') +
        (a.spenta ? ' disabled title="' + esc(a.spenta) + '"' : ' title="' + esc(a.spiega) + '"') + ' onclick="wsFai(this)">' + esc(a.etichetta) + '</button>').join('') +
        (v.qui ? aiuto('elimina-ws', esc(AIUTO_ELIMINA_WS)) : '') + '</div>'
    }
    if (v.qui) h += confermaHtml('ws:' + v.nome)
    return h
  }).join('') + '</div>').join('')
}
window.wsCerca = (testo) => {
  wsFiltro = testo || ''
  wsAperto = ''
  const lista = document.getElementById('ws-lista')
  if (lista && ultimoStato) lista.innerHTML = wsListaHtml(ultimoStato)
}
window.wsApriAzioni = (k) => { wsAperto = wsAperto === k ? '' : k; wsRinomina = ''; pannello(ultimoStato) }
window.wsTocca = (k) => {
  if (k.indexOf('q:') === 0) { wsAperto = ''; vaiA(k.slice(2)); return }
  window.wsApriAzioni(k)
}
window.wsFai = (el) => {
  const nome = el.dataset.n
  const a = el.dataset.a
  wsAperto = ''
  if (a === 'apri') { vaiA(nome); return }
  if (a === 'rinomina') { wsRinomina = nome; pannello(ultimoStato); setTimeout(() => { const c = document.getElementById('ws-rinomina'); if (c) { c.focus(); c.select() } }, 0); return }
  if (a === 'cartella') { apriCartella({ workspace: nome }); return }
  if (a === 'elimina') { chiediAzione('eliminaWorkspace', nome); return }
  if (a === 'portaQui') { drivePortaWs(nome); return }
  pannello(ultimoStato)
}
window.rinominaWorkspace = async (vecchio) => {
  const campo = document.getElementById('ws-rinomina')
  const nuovo = campo && campo.value.trim()
  if (!nuovo || !vecchio) return
  wsRinomina = ''
  // La casella ha il fuoco e con il fuoco in una casella la pagina non si ridisegna: va tolto.
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
  if (nuovo === vecchio) { pannello(ultimoStato); return }
  try {
    // Il 409 è una risposta con il motivo («esiste già»): si dice.
    const r = await chiedi('/api/workspace/rinomina', { nome: vecchio, nuovo: nuovo })
    if (r && r.errore) notaGlobale = r.errore
  } catch (e) { notaGlobale = 'Non l’ho rinominato: ' + ((e && e.message) || 'il computer non risponde') }
  aggiorna()
}

/**
 * La gestione delle chat (0.79.0): Chiudi, Archivia, Elimina dal PC per ogni
 * chat, «Spazio delle chat» con la scelta di più chat e il totale, le
 * Archiviate e il Recupero (30 giorni) con Ripristina, «Svuota il recupero
 * adesso» in due passi. Gli stessi testi del PC (GC, da
 * src/shared/gestione-chat-vista.ts) e le stesse risposte
 * (/api/chat/gestione/…): le regole le decide il PC.
 */
var gcScheda = 'spazio'
var gcVista = null
var gcArch = null
var gcRec = null
var gcErrore = ''
var gcOrdine = 'spazio'
var gcScelte = []
var gcTitoli = {}
var gcConfermaAp = null
var gcNota = null
var gcAzioniDi = ''
/** Per le chat col menu aperto: lo spazio e, se non si può eliminare, il motivo del PC (Elimina spento). */
var gcMisure = {}
var gcSvuota = null
var gcSvuotaDrive = false
var gcFrase = ''
var gcInCorso = false
/** Come byteLeggibili del PC: 1,2 GB, 340 MB, 12 KB. */
function gcByte(n) {
  var u = ['byte', 'KB', 'MB', 'GB', 'TB']
  var x = n
  var i = 0
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i += 1 }
  return (i === 0 ? String(x) : x.toFixed(x < 10 ? 1 : 0).replace('.', ',')) + ' ' + u[i]
}
function gcQuando(iso, adesso) {
  if (!iso) return 'mai usata'
  var t = Date.parse(iso)
  if (isNaN(t)) return 'mai usata'
  var g = Math.floor((adesso - t) / 86400000)
  if (g <= 0) return 'usata oggi'
  if (g === 1) return 'usata ieri'
  if (g < 60) return 'usata ' + g + ' giorni fa'
  if (g < 730) return 'usata ' + Math.floor(g / 30) + ' mesi fa'
  return 'usata ' + Math.floor(g / 365) + ' anni fa'
}
function gcData(iso) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
}
function gcRigaVoce(v, adesso) {
  return [gcByte(v.byte), gcQuando(v.ultimaAttivita, adesso)].concat(v.archiviata ? ['archiviata'] : [], v.aperta ? ['aperta'] : []).join(' · ')
}
function gcQuante(n) { return n === 1 ? '1 chat' : n + ' chat' }
function gcRiepilogo(v) {
  return gcQuante(v.chat.length) + ' · ' + gcByte(v.totale) + ' · si possono liberare ' + gcByte(v.eliminabili) +
    (v.recupero.chat > 0 ? ' · nel recupero ' + gcQuante(v.recupero.chat) + ' (' + gcByte(v.recupero.byte) + ')' : '')
}
function gcTotale(voci, scelte) {
  var sel = voci.filter(function (v) { return scelte.indexOf(v.sessione) >= 0 })
  var ok = sel.filter(function (v) { return !v.nonEliminabile })
  var somma = function (l) { return l.reduce(function (t, v) { return t + v.byte }, 0) }
  return { chat: sel.length, byte: somma(sel), eliminabili: ok.length, byteEliminabili: somma(ok), escluse: sel.filter(function (v) { return !!v.nonEliminabile }).map(function (v) { return { sessione: v.sessione, motivo: v.nonEliminabile } }), chiuse: sel.filter(function (v) { return !v.aperta }).map(function (v) { return v.sessione }) }
}
function gcRiepilogoSel(s) {
  if (s.chat === 0) return 'Nessuna chat scelta.'
  var no = s.escluse.length === 0 ? '' : ' · ' + (s.escluse.length === 1 ? '1 non si può eliminare' : s.escluse.length + ' non si possono eliminare')
  return (s.chat === 1 ? '1 chat scelta' : s.chat + ' chat scelte') + ' · ' + gcByte(s.byte) + no + ' · eliminandole liberi ' + gcByte(s.byteEliminabili)
}
function gcRigaRecupero(c, adesso) {
  var g = Math.max(0, Math.ceil((Date.parse(c.scadeIl) - adesso) / 86400000))
  return gcByte(c.byte) + ' · eliminata il ' + gcData(c.quando) + ' · ' + (g === 0 ? 'si svuota oggi' : g === 1 ? 'si svuota domani' : 'si svuota fra ' + g + ' giorni') + (c.drive ? ' · anche dal Drive' : '')
}
function gcOrdina(voci, ordine) {
  var l = voci.slice()
  if (ordine === 'spazio') l.sort(function (a, b) { return b.byte - a.byte || (a.ultimaAttivita || '').localeCompare(b.ultimaAttivita || '') || a.sessione.localeCompare(b.sessione) })
  else l.sort(function (a, b) { return (a.ultimaAttivita || '').localeCompare(b.ultimaAttivita || '') || b.byte - a.byte || a.sessione.localeCompare(b.sessione) })
  return l
}
function gcNome(titoli) { return titoli.length === 1 ? '«' + titoli[0] + '»' : titoli.length + ' chat' }
/** Le scelte che la conferma nomina: per Elimina solo quelle che si possono eliminare (scelteDaConfermare del PC). */
function gcDaConfermare(azione, scelte, voci) {
  if (azione !== 'elimina') return scelte.slice()
  var no = {}
  voci.forEach(function (v) { if (v.nonEliminabile) no[v.sessione] = true })
  return scelte.filter(function (s) { return !no[s] })
}
/** La conferma del PC con il nome (§N) e lo spazio (§B) al loro posto; più chat, i verbi al plurale. */
function gcConferma(tipo, nome, spazio, quante) {
  var t = GC.conferme[tipo + ((quante || 1) > 1 && GC.conferme[tipo + 'N'] ? 'N' : '')]
  var r = function (x) { return x.split('§N').join(nome).split('§B').join(spazio || '') }
  return { titolo: r(t.titolo), testo: r(t.testo), azione: t.azione }
}
function gcImpronta() {
  return JSON.stringify([gcScheda, gcOrdine, gcScelte, gcConfermaAp, gcNota, gcAzioniDi, gcSvuota && gcSvuota.passo, gcSvuotaDrive, gcInCorso, gcErrore,
    gcVista ? gcVista.chat.map(function (v) { return v.sessione + v.byte + (v.nonEliminabile || '') }).join(',') : '',
    gcArch ? gcArch.length : -1, gcRec ? gcRec.chat.map(function (c) { return c.id }).join(',') : ''])
}
/** Un PC più vecchio della 0.79.0 non conosce le rotte: lo si dice così, anche quando si tocca un'azione. */
function gcVecchio(e) {
  return e && e.message && e.message.indexOf('non trovato') >= 0 ? 'Questo computer non sa ancora gestire le chat da qui: aggiornalo alla 0.79.0.' : ''
}
async function gcLeggi() {
  gcErrore = ''
  try {
    var r = await Promise.all([chiedi('/api/chat/gestione/spazio', {}), chiedi('/api/chat/gestione/archiviate', {}), chiedi('/api/chat/gestione/recupero', {})])
    gcVista = r[0]; gcArch = (r[1] && r[1].archiviate) || []; gcRec = r[2]
    ;(gcVista.chat || []).forEach(function (v) { gcTitoli[v.sessione] = v.titolo })
    gcArch.forEach(function (a) { if (a.titolo) gcTitoli[a.sessione] = a.titolo })
    var ci = {}; gcVista.chat.forEach(function (v) { ci[v.sessione] = true })
    gcScelte = gcScelte.filter(function (s) { return ci[s] })
  } catch (e) {
    gcErrore = gcVecchio(e) || 'Non riesco a leggere le chat: ' + ((e && e.message) || 'il computer non risponde')
  }
}
/** I tre tasti di una chat, ognuno con il suo «?». */
function gcTastiHtml(sessione, titolo, chiave) {
  gcTitoli[sessione] = titolo
  return ['chiudi', 'archivia', 'elimina'].map(function (a) {
    var t = GC.testi[a]
    if (a === 'elimina') gcMisura(sessione)
    var no = gcMisure[sessione] && (a === 'elimina' ? gcMisure[sessione].motivo : a === 'chiudi' ? gcMisure[sessione].chiusa : undefined)
    return '<span class="gc-tasto"><button' + (a === 'elimina' ? ' class="pericolo"' : '') + (no ? ' disabled' : '') + ' data-a="' + a + '" data-s="' + esc(sessione) + '" onclick="gcChiedi(this.dataset.a, this.dataset.s)">' + esc(t.etichetta) + '</button>' +
      aiuto('gc-' + a + '-' + chiave, esc(t.spiega)) + (no ? '<span class="gc-no">' + esc(no) + '</span>' : '') + '</span>'
  }).join('')
}
window.gcApriAzioni = (s) => { gcAzioniDi = gcAzioniDi === s ? '' : s; delete gcMisure[s]; pannello(ultimoStato) }
/**
 * Si chiede al PC se una chat si può eliminare (al più ogni 10 s): una chat al lavoro, in attesa,
 * guidata da un autopilota attivo o di un altro PC mostra «Elimina dal PC» spento con il motivo.
 */
async function gcMisura(s) {
  var m = gcMisure[s]
  if (m && (m.chiede || Date.now() - m.il < 10000)) return
  // Mentre si rilegge resta quella di prima: «Elimina» non si riaccende per un attimo.
  gcMisure[s] = Object.assign({}, m || {}, { chiede: true, il: Date.now() })
  var prima = m ? m.motivo : undefined
  var primaChiusa = m ? m.chiusa : undefined
  try {
    var r = await chiedi('/api/chat/gestione/spazio', { sessioni: [s] })
    gcMisure[s] = r && r.selezione ? { byte: r.selezione.byte, motivo: (r.selezione.escluse[0] || {}).motivo, chiusa: gcChiusa(r.selezione, s), il: Date.now() } : Object.assign({}, m || {}, { chiede: false, il: Date.now() })
  } catch (e) { gcMisure[s] = Object.assign({}, m || {}, { chiede: false, il: Date.now() }); return }
  if (gcMisure[s].motivo !== prima || gcMisure[s].chiusa !== primaChiusa) pannello(ultimoStato)
}
/** Come motivoNonChiudeScelta del PC: «Chiudi» spento se qui la chat non è aperta (un PC più vecchio non manda chiuse). */
function gcChiusa(sel, s) {
  return sel && sel.chiuse && sel.chiuse.indexOf(s) >= 0 ? GC.nonAperta.split('§N').join(gcTitoli[s] || s.slice(0, 8)) : undefined
}
var gcChiesta = 0
window.gcChiedi = async (azione, sessione) => {
  var nome = gcNome([gcTitoli[sessione] || sessione.slice(0, 8)])
  var n = ++gcChiesta
  var dove = pannelloAperto
  gcNota = null
  if (azione !== 'elimina') { gcConfermaAp = { azione: azione, sessioni: [sessione], nome: nome, drive: false, conferma: gcConferma(azione, nome, '') }; pannello(ultimoStato); gcMostraConferma(); return }
  var spazio = 'lo spazio di questa chat'
  var no
  try {
    var r = await chiedi('/api/chat/gestione/spazio', { sessioni: [sessione] })
    if (r && r.selezione) { spazio = gcByte(r.selezione.byte); no = (r.selezione.escluse[0] || {}).motivo; gcMisure[sessione] = { byte: r.selezione.byte, motivo: no, chiusa: gcChiusa(r.selezione, sessione), il: Date.now() } }
  } catch (e) { }
  // Nel frattempo si è chiesto altro, o cambiato pannello: questa conferma non serve più.
  if (n !== gcChiesta || dove !== pannelloAperto) return
  // Toccato prima che arrivasse il motivo: niente conferma, il tasto si spegne con il motivo del PC.
  if (no) { pannello(ultimoStato); return }
  gcConfermaAp = { azione: 'elimina', sessioni: [sessione], nome: nome, spazio: spazio, drive: false, conferma: gcConferma('elimina', nome, spazio) }
  pannello(ultimoStato)
  gcMostraConferma()
}
window.gcChiediScelte = (azione) => {
  gcChiesta++
  var voci = (gcVista && gcVista.chat) || []
  var nome = gcNome(gcDaConfermare(azione, gcScelte, voci).map(function (s) { return gcTitoli[s] || s.slice(0, 8) }))
  var spazio = gcByte(gcTotale(voci, gcScelte).byteEliminabili)
  gcNota = null
  var quante = azione === 'elimina' ? gcTotale(voci, gcScelte).eliminabili : gcScelte.length
  gcConfermaAp = { azione: azione, sessioni: gcScelte.slice(), nome: nome, spazio: spazio, quante: quante, drive: false, conferma: gcConferma(azione, nome, spazio, quante) }
  pannello(ultimoStato)
  gcMostraConferma()
}
function gcMostraConferma() { setTimeout(function () { var e = document.getElementById('gc-conferma'); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'center' }) }, 0) }
window.gcDrive = (si) => {
  if (!gcConfermaAp) return
  gcConfermaAp.drive = si
  gcConfermaAp.conferma = gcConferma(si ? 'eliminaDrive' : 'elimina', gcConfermaAp.nome, gcConfermaAp.spazio, gcConfermaAp.quante)
  pannello(ultimoStato)
}
function gcConfermaHtml() {
  if (!gcConfermaAp) return ''
  var c = gcConfermaAp.conferma
  return '<div class="piastrella chiede" id="gc-conferma"><div class="titolo">' + esc(c.titolo) + '</div><div class="sotto">' + esc(c.testo) + '</div>' +
    (gcConfermaAp.azione === 'elimina' ? '<label class="spunta" style="margin-top:6px"><input type="checkbox"' + (gcConfermaAp.drive ? ' checked' : '') + ' onchange="gcDrive(this.checked)"> anche dal Drive</label>' + aiuto('gc-drive', esc(GC.spiegaDrive.elimina)) : '') +
    '<div class="riga"><button class="' + (gcConfermaAp.azione === 'elimina' ? 'pericolo' : 'primario') + '"' + (gcInCorso ? ' disabled' : '') + ' onclick="gcFai()">' + esc(gcInCorso ? 'Un momento…' : c.azione) + '</button>' +
    '<button onclick="gcConfermaAp = null; pannello(ultimoStato)">Annulla</button></div></div>'
}
function gcNotaHtml() {
  if (!gcNota) return ''
  return '<div class="piastrella" role="status"><div class="sotto">' + esc(gcNota.messaggio) + '</div>' +
    (gcNota.rifiuti.length ? '<ul class="gc-rifiuti">' + gcNota.rifiuti.map(function (m) { return '<li>' + esc(m) + '</li>' }).join('') + '</ul>' : '') +
    '<div class="riga"><button onclick="gcNota = null; pannello(ultimoStato)">Ok</button></div></div>'
}
window.gcFai = async () => {
  var a = gcConfermaAp
  if (!a || gcInCorso) return
  gcInCorso = true
  pannello(ultimoStato)
  try {
    var e = await chiedi('/api/chat/gestione/azione', { azione: a.azione, sessioni: a.sessioni, ancheDalDrive: a.drive === true })
    gcNota = { messaggio: e.messaggio || 'Fatto.', rifiuti: (e.esiti || []).filter(function (x) { return !x.ok }).map(function (x) { return x.motivo || ((gcTitoli[x.sessione] || x.sessione) + ': non si è potuta toccare.') }) }
    if (a.sessioni.length > 1) gcScelte = []
  } catch (err) {
    gcNota = { messaggio: gcVecchio(err) || 'Non è andata: ' + ((err && err.message) || 'il computer non risponde'), rifiuti: [] }
  }
  gcConfermaAp = null
  gcInCorso = false
  gcAzioniDi = ''
  if (pannelloAperto === 'chatgestione') await gcLeggi()
  if (pannelloAperto === 'sessioni') await leggiSessioni()
  aggiorna()
}
window.gcLinguetta = (s) => { gcChiesta++; gcScheda = s; gcNota = null; gcSvuota = null; pannello(ultimoStato) }
window.gcCambiaOrdine = (o) => { gcOrdine = o; pannello(ultimoStato) }
window.gcScegli = (s) => { var i = gcScelte.indexOf(s); if (i >= 0) gcScelte.splice(i, 1); else gcScelte.push(s); pannello(ultimoStato) }
window.gcTutte = () => {
  if (gcScelte.length > 0) gcScelte = []
  else gcScelte = ((gcVista && gcVista.chat) || []).filter(function (v) { return !v.nonEliminabile }).map(function (v) { return v.sessione })
  pannello(ultimoStato)
}
window.gcRipristinaArch = async (s) => {
  if (gcInCorso) return
  gcInCorso = true
  pannello(ultimoStato)
  try { var e = await chiedi('/api/chat/gestione/azione', { azione: 'ripristina', sessioni: [s] }); gcNota = { messaggio: e.messaggio, rifiuti: (e.esiti || []).filter(function (x) { return !x.ok }).map(function (x) { return x.motivo || x.sessione }) } }
  catch (err) { gcNota = { messaggio: 'Non è andata: ' + ((err && err.message) || 'il computer non risponde'), rifiuti: [] } }
  gcInCorso = false
  await gcLeggi(); pannello(ultimoStato)
}
window.gcRipristinaRec = async (id) => {
  if (gcInCorso) return
  gcInCorso = true
  pannello(ultimoStato)
  try { var e = await chiedi('/api/chat/gestione/ripristina', { id: id }); gcNota = { messaggio: e.messaggio, rifiuti: [] } }
  catch (err) { gcNota = { messaggio: 'Non è andata: ' + ((err && err.message) || 'il computer non risponde'), rifiuti: [] } }
  gcInCorso = false
  await gcLeggi(); pannello(ultimoStato)
}
window.gcSvuotaChiedi = () => { gcSvuota = { passo: 'chiedi' }; gcNota = null; pannello(ultimoStato) }
window.gcSvuotaDriveSi = (si) => { gcSvuotaDrive = si; pannello(ultimoStato) }
/** Primo passo: il PC dà la conferma (un gettone di 2 minuti) e dice cosa si perde. */
window.gcSvuotaContinua = async () => {
  if (gcInCorso) return
  gcInCorso = true
  pannello(ultimoStato)
  try {
    var r = await chiedi('/api/chat/gestione/svuota', { ancheDalDrive: gcSvuotaDrive })
    // Annullato mentre il PC rispondeva: «Scrivi SVUOTA» non deve comparire lo stesso.
    if (!gcSvuota || gcSvuota.passo !== 'chiedi') { gcInCorso = false; pannello(ultimoStato); return }
    if (r && r.ok && r.gettone) { gcSvuota = { passo: 'scrivi', gettone: r.gettone, messaggio: r.messaggio }; gcFrase = '' }
    else { gcSvuota = null; gcNota = { messaggio: (r && r.messaggio) || 'Il recupero è vuoto.', rifiuti: [] } }
  } catch (err) { gcSvuota = null; gcNota = { messaggio: 'Non è andata: ' + ((err && err.message) || 'il computer non risponde'), rifiuti: [] } }
  gcInCorso = false
  pannello(ultimoStato)
}
/** La parola scritta abilita il tasto: la pagina non si ridisegna mentre si scrive. */
window.gcFraseCambia = (v) => { gcFrase = v; var b = document.getElementById('gc-svuota-si'); if (b) b.disabled = gcInCorso || v.trim().toUpperCase() !== GC.frase }
/** Secondo passo: il gettone e la parola. Il PC la ricontrolla. */
window.gcSvuotaDavvero = async () => {
  var s = gcSvuota
  if (!s || s.passo !== 'scrivi' || gcInCorso) return
  gcInCorso = true
  var b = document.getElementById('gc-svuota-si')
  if (b) b.disabled = true
  try { var r = await chiedi('/api/chat/gestione/svuota', { ancheDalDrive: gcSvuotaDrive, gettone: s.gettone, frase: gcFrase }); gcNota = { messaggio: r.messaggio || r.errore || 'Fatto.', rifiuti: [] } }
  catch (err) { gcNota = { messaggio: 'Non è andata: ' + ((err && err.message) || 'il computer non risponde'), rifiuti: [] } }
  gcSvuota = null; gcFrase = ''; gcInCorso = false
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
  await gcLeggi(); pannello(ultimoStato)
}
function gcSvuotaHtml() {
  if (!gcSvuota) return ''
  if (gcSvuota.passo === 'chiedi') {
    var c = GC.conferme[gcSvuotaDrive ? 'svuotaDrive' : 'svuota']
    return '<div class="piastrella chiede"><div class="titolo">' + esc(c.titolo) + '</div><div class="sotto">' + esc(c.testo) + '</div>' +
      '<label class="spunta" style="margin-top:6px"><input type="checkbox"' + (gcSvuotaDrive ? ' checked' : '') + ' onchange="gcSvuotaDriveSi(this.checked)"> anche dal Drive</label>' + aiuto('gc-svuota-drive', esc(GC.spiegaDrive.svuota)) +
      '<div class="riga"><button class="pericolo"' + (gcInCorso ? ' disabled' : '') + ' onclick="gcSvuotaContinua()">' + esc(gcInCorso ? 'Un momento…' : c.azione) + '</button><button onclick="gcSvuota = null; pannello(ultimoStato)">Annulla</button></div></div>'
  }
  return '<div class="piastrella chiede"><div class="titolo">Scrivi ' + esc(GC.frase) + ' per confermare</div><div class="sotto">' + esc(gcSvuota.messaggio) + '</div>' +
    '<div class="riga"><input id="gc-frase" autocomplete="off" autocapitalize="characters" placeholder="' + esc(GC.frase) + '" value="' + esc(gcFrase) + '" oninput="gcFraseCambia(this.value)" style="flex:1"></div>' +
    '<div class="riga"><button class="pericolo" id="gc-svuota-si"' + (gcInCorso || gcFrase.trim().toUpperCase() !== GC.frase ? ' disabled' : '') + ' onclick="gcSvuotaDavvero()">Svuota per sempre</button><button onclick="gcSvuota = null; gcFrase = \\'\\'; pannello(ultimoStato)">Annulla</button></div></div>'
}
/** «Spazio delle chat», le Archiviate e il Recupero. */
function gestioneChatHtml() {
  var adesso = Date.now()
  var ling = function (id, nome, n) { return '<button class="' + (gcScheda === id ? 'primario' : '') + '" onclick="gcLinguetta(\\'' + id + '\\')">' + esc(nome) + (n > 0 ? ' (' + n + ')' : '') + '</button>' }
  var h = '<div class="piastrella"><div class="titolo">Spazio delle chat' + aiuto('gc-spazio', 'Le chat di questo computer con lo spazio che occupano. Scegline una o più e tocca Archivia (escono dagli elenchi, non si cancella niente) o Elimina dal PC (liberi spazio; per 30 giorni restano nel recupero). Le chat al lavoro, che aspettano una tua risposta, guidate da un autopilota attivo o che vivono su un altro PC non si toccano: lo dice la riga sotto il nome.') + '</div>' +
    '<div class="riga">' + ling('spazio', 'Spazio', 0) + ling('archiviate', 'Archiviate', gcArch ? gcArch.length : 0) + ling('recupero', 'Recupero', gcRec ? gcRec.chat.length : 0) + '</div>' +
    (gcErrore ? '<div class="errore">' + esc(gcErrore) + '</div>' : '') + gcNotaHtml() + gcConfermaHtml()
  if (gcScheda === 'spazio') {
    if (!gcVista) h += '<div class="sotto">Misuro le chat…</div>'
    else {
      var voci = gcOrdina(gcVista.chat || [], gcOrdine)
      var sel = gcTotale(voci, gcScelte)
      h += '<div class="sotto">' + esc(gcRiepilogo(gcVista)) + '</div>' +
        '<div class="riga"><select onchange="gcCambiaOrdine(this.value)">' + GC.ordini.map(function (o) { return '<option value="' + o.id + '"' + (o.id === gcOrdine ? ' selected' : '') + '>' + esc(o.nome) + '</option>' }).join('') + '</select>' +
        '<button onclick="gcTutte()">' + (gcScelte.length > 0 ? 'Nessuna' : 'Scegli tutte') + '</button></div>' +
        '<div class="sotto">' + esc(gcRiepilogoSel(sel)) + '</div>' +
        '<div class="riga"><button' + (gcScelte.length === 0 || gcInCorso ? ' disabled' : '') + ' onclick="gcChiediScelte(\\'archivia\\')">Archivia</button>' +
        '<button class="pericolo"' + (sel.eliminabili === 0 || gcInCorso ? ' disabled' : '') + ' onclick="gcChiediScelte(\\'elimina\\')">Elimina dal PC</button></div>' +
        (voci.length === 0 ? '<div class="sotto">Nessuna chat su questo PC.</div>' : voci.map(function (v) {
          return '<label class="gc-voce"><input type="checkbox"' + (gcScelte.indexOf(v.sessione) >= 0 ? ' checked' : '') + ' data-s="' + esc(v.sessione) + '" onchange="gcScegli(this.dataset.s)">' +
            '<span class="gc-voce__testo"><b>' + esc(v.titolo) + '</b><span class="sotto">' + esc(gcRigaVoce(v, adesso)) + '</span>' +
            (v.nonEliminabile ? '<span class="gc-no">' + esc(v.nonEliminabile) + '</span>' : '') + '</span></label>'
        }).join(''))
    }
  } else if (gcScheda === 'archiviate') {
    h += !gcArch ? '<div class="sotto">Leggo…</div>' : gcArch.length === 0 ? '<div class="sotto">Nessuna chat archiviata.</div>' : gcArch.map(function (a) {
      return '<div class="gc-voce"><span class="gc-voce__testo"><b>' + esc(a.titolo || a.sessione.slice(0, 8)) + '</b><span class="sotto">archiviata il ' + esc(gcData(a.il)) + '</span></span>' +
        '<button data-s="' + esc(a.sessione) + '"' + (gcInCorso ? ' disabled' : '') + ' onclick="gcRipristinaArch(this.dataset.s)">Ripristina</button></div>'
    }).join('')
  } else {
    if (!gcRec) h += '<div class="sotto">Leggo…</div>'
    else {
      h += '<div class="sotto">' + (gcRec.chat.length === 0 ? 'Il recupero è vuoto.' : esc(gcQuante(gcRec.chat.length) + ' · ' + gcByte(gcRec.byte) + ' · si svuota da solo dopo 30 giorni')) +
        aiuto('gc-recupero', 'Le chat eliminate dal PC restano qui 30 giorni, poi si cancellano da sole. «Ripristina» rimette la chat al suo posto con il suo nome. Lo spazio sul disco si libera davvero quando il recupero si svuota: da solo, o con «Svuota il recupero adesso», che chiede una conferma forte.') + '</div>' +
        gcSvuotaHtml() +
        (gcRec.chat.length > 0 && !gcSvuota ? '<div class="riga"><button class="pericolo" onclick="gcSvuotaChiedi()">Svuota il recupero adesso</button></div>' : '') +
        gcRec.chat.map(function (c) {
          return '<div class="gc-voce"><span class="gc-voce__testo"><b>' + esc(c.titolo) + '</b><span class="sotto">' + esc(gcRigaRecupero(c, adesso)) + '</span></span>' +
            '<button data-id="' + esc(c.id) + '"' + (gcInCorso ? ' disabled' : '') + ' onclick="gcRipristinaRec(this.dataset.id)">Ripristina</button></div>'
        }).join('')
    }
  }
  return h + '<div class="riga"><button onclick="apriPannello(\\'chatgestione\\')">Chiudi</button></div></div>'
}

/**
 * Le azioni con la conferma del PC (0.55.0): la prima pressione mostra cosa
 * succede e cosa no, per esteso; la seconda la fa.
 */
var confermaPg = null
window.chiediAzione = (tipo, id) => {
  const st = ultimoStato || {}
  const c = (st.chat || []).find((x) => x.id === id)
  const ws = tipo === 'sposta' ? ((document.getElementById('sposta-' + id) || {}).value || '') : ''
  const nome = tipo === 'eliminaWorkspace' ? id : (c ? (c.titolo || c.cwd) : id)
  confermaPg = { tipo: tipo, id: id, ws: ws, chiave: tipo === 'eliminaWorkspace' ? 'ws:' + id : id, testo: testoConferma(tipo, nome, ws) }
  pannello(ultimoStato)
}
function confermaHtml(chiave) {
  if (!confermaPg || confermaPg.chiave !== chiave) return ''
  const t = confermaPg.testo
  return '<div class="piastrella chiede"><div class="titolo">' + esc(t.titolo) + '</div><div class="sotto">' + esc(t.testo) + '</div>' +
    '<div class="riga"><button class="pericolo" onclick="faiAzione()">' + esc(t.azione) + '</button>' +
    '<button onclick="confermaPg = null; pannello(ultimoStato)">Annulla</button></div></div>'
}
window.faiAzione = async () => {
  const a = confermaPg
  confermaPg = null
  if (!a) return
  try {
    // Il 409 è una risposta con il motivo (0.81.0): «Non elimino …: la chat … sta lavorando». Si dice.
    if (a.tipo === 'eliminaWorkspace') { const r = await chiedi('/api/workspace/elimina', { nome: a.id }); if (r && r.errore) notaGlobale = r.errore; else caricaEliminatiWs(true) }
    else if (a.tipo === 'sposta') await chiedi('/api/chat/sposta', { chat: a.id, workspace: a.ws })
    else if (a.tipo === 'dormi') await chiedi('/api/chat/dormi', { chat: a.id })
    else if (a.tipo === 'chiudi') { await chiedi('/api/chat/chiudi', { chat: a.id }); if (dentro === a.id) { dentro = null; righeDentro = []; righeGrezze = [] } }
    if (a.tipo === 'sposta' && dentro === a.id) { dentro = null; righeDentro = []; righeGrezze = [] }
  } catch (e) {
    notaGlobale = 'Non è andata: ' + ((e && e.message) || 'il computer non risponde')
  }
  aggiorna()
}
/**
 * I workspace eliminati negli ultimi 30 giorni (0.81.0), con «Ripristina».
 * Si rileggono al più ogni 30 s mentre la scheda si ridisegna, e subito dopo
 * un'eliminazione o un ripristino.
 */
var wsEliminati = []
var wsEliminatiIl = 0
function caricaEliminatiWs(subito) {
  if (!subito && Date.now() - wsEliminatiIl < 30000) return
  wsEliminatiIl = Date.now()
  chiedi('/api/workspace/recupero').then(function (r) {
    var prima = JSON.stringify(wsEliminati)
    wsEliminati = (r && r.voci) || []
    if (JSON.stringify(wsEliminati) !== prima) pannello(ultimoStato)
  }).catch(function () { })
}
function eliminatiWsHtml() {
  caricaEliminatiWs(false)
  if (wsEliminati.length === 0) return ''
  return '<div class="sotto" style="margin-top:10px"><b>Eliminati</b>' + aiuto('eliminati-ws', esc(AIUTO_ELIMINA_WS)) + '</div>' +
    wsEliminati.map(function (v) {
      return '<div class="riga"><span>' + esc(v.nome) + ' <span class="sotto">' + esc(rigaEliminato(v)) + '</span></span>' +
        '<button onclick="ripristinaWs(\\'' + escJs(v.nome) + '\\', \\'' + escJs(v.eliminatoIl) + '\\')">Ripristina</button></div>'
    }).join('')
}
// Per nome e momento, non per posizione: l'elenco può cambiare fra il disegno e il tocco.
window.ripristinaWs = async (nome, eliminatoIl) => {
  const v = { nome: nome, eliminatoIl: eliminatoIl }
  try {
    const r = await chiedi('/api/workspace/ripristina', { nome: v.nome, eliminatoIl: v.eliminatoIl })
    if (r && r.errore) notaGlobale = 'Non è andata: ' + r.errore
  } catch (e) {
    notaGlobale = 'Non è andata: ' + ((e && e.message) || 'il computer non risponde')
  }
  caricaEliminatiWs(true)
  aggiorna()
}
window.azioneChat = async (azione, id) => {
  try { await chiedi('/api/chat/' + azione, { chat: id }) }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || 'il computer non risponde') }
  aggiorna()
}

window.eliminaWorkspace = async (nome) => {
  if (confermando !== 'ws-' + nome) { chiedeConferma('ws-' + nome); return }
  confermando = null
  await chiedi('/api/workspace/elimina', { nome: nome })
  aggiorna()
}

/** Da quanto tempo, detto come lo direbbe una persona. */
function daQuando(quando) {
  if (!quando) return 'un po’'
  const s = Math.round((Date.now() - quando) / 1000)
  if (s < 90) return s + ' secondi'
  const m = Math.round(s / 60)
  return m < 60 ? m + ' minuti' : Math.round(m / 60) + ' ore'
}

/**
 * I token consumati in una quota, in forma leggibile.
 *
 * Sono token e non denaro: con un abbonamento il costo di una chat non e' una
 * moltiplicazione, e una cifra in euro sarebbe falsa con l'aria di essere vera.
 * Si conta l'ingresso piu' l'uscita — le due parti che pesano — e si separano
 * le migliaia, cosi' «12.400» si legge a colpo d'occhio.
 */
function token(q) {
  if (!q) return '—'
  const n = typeof q === 'object' ? (q.ingresso || 0) + (q.uscita || 0) : q
  if (typeof n !== 'number') return '—'
  return n.toLocaleString('it-IT')
}

/** Le quote di una giornata in una riga: ingresso, uscita, cache e chat. */
function quote(q) {
  if (!q) return '—'
  const num = (n) => (n || 0).toLocaleString('it-IT')
  const chat = q.chat === 1 ? '1 chat' : num(q.chat) + ' chat'
  return num(q.ingresso) + ' in ingresso · ' + num(q.uscita) + ' in uscita · ' +
    num(q.cache) + ' dalla cache · ' + chat
}

/**
 * Di quale cartella parla il Quaderno.
 *
 * Di quella dell'autopilota che stai guardando, quando ne stai guardando uno:
 * il quaderno e' cio' che **lui** produce, e sta accanto al lavoro che l'ha
 * scritto. Prima prendeva sempre la cartella della prima chat dell'elenco, che
 * con due progetti aperti e' semplicemente un'altra cosa.
 */
/**
 * L'albero delle chat di un autopilota (T7, 0.36.0): il coordinatore e sotto
 * le sue chat, con il compito, lo stato, il ramo del worktree e i giri. Dal
 * campo \`albero\` che il computer compone con la stessa funzione del PC.
 */
/** Il colore del ruolo di una chat (0.71.0), come sul PC e nell'app. */
function coloreRuolo(c) {
  // 0.82.0: dalla tabella unica (ATT); un nome sconosciuto resta grigio.
  return coloreNome(c)
}
/**
 * Gli specialisti (PC 0.73.0): come è organizzato il lavoro, poi uno per chat
 * con il ruolo, lo stato, l'ultima cosa detta e «Guarda», che apre la sua chat.
 */
function specialistiHtml(s) {
  return '<div class="serigrafia" style="margin-top:10px">' + ((s.elenco || []).length > 1 ? 'Specialisti (' + s.elenco.length + ')' : 'La sua chat') +
      aiuto('ap-specialisti', 'Quando parte, l’autopilota decide se dividere il lavoro: ogni specialista (Sviluppo, Interfaccia, Collaudo, Revisione, Rilascio) lavora in una chat sua, con il ruolo nel nome, nel workspace del progetto. Il lavoro di una chat entra solo dopo l’ok della Revisione. Per un lavoro piccolo resta una chat sola. «Guarda» apre la sua chat.') + legendaAttivita('ap-colori') + '</div>' +
    '<div class="sotto">' + esc(s.riga || '') + '</div>' +
    (s.elenco || []).map(function (x) {
      return '<div class="sotto" style="border-top:1px solid var(--incisione,#2a2a2a);padding-top:4px;margin-top:4px">' +
        // 0.82.0: il colore fisso di cosa fa, con il simbolo; un PC più vecchio non manda «attivita».
        (x.attivita
          ? segnoAttivita(x.attivita) + ' <b style="color:' + coloreNome((ATT.attivita[x.attivita] || {}).colore) + '">' + esc(x.ruolo) + '</b> · <span>' + esc([parolaStatoAtt(x.attivita), x.quanto || ''].filter(Boolean).join(' · ')) + '</span>'
          : '<b style="color:' + coloreNome(x.colore) + '">' + esc(x.ruolo) + '</b> · <span style="color:' + (x.attivo ? 'var(--verde,#3c9)' : 'var(--testo-quieto,#9aa1a9)') + '">' + esc(x.stato) + '</span>') +
        // 0.74.0: chi ha finito ha chiuso la sua chat: niente «Guarda».
        (x.chiusa ? ' <span style="color:var(--testo-quieto,#9aa1a9)">· chat chiusa</span>' : x.sessionId ? ' <button style="margin-left:6px" data-s="' + esc(x.sessionId) + '" onclick="guardaSpecialista(this.dataset.s)">Guarda</button>' : '') +
        '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(x.compito || '') + '">' + esc(x.cosa || x.compito || '') + '</div>' +
        (x.ultimaAzione ? '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--testo-quieto,#9aa1a9)">' + esc(x.ultimaAzione) + '</div>' : '') +
        '</div>'
    }).join('')
}
window.guardaSpecialista = function (sessione) {
  var c = ((ultimoStato && ultimoStato.chat) || []).find(function (x) { return x.sessione === sessione })
  if (!c) { notaGlobale = 'La sua chat non è aperta su questo computer adesso.'; aggiorna(); return }
  // Si esce dalla scheda dell'autopilota e si va nella sezione Chat, dentro quella chat.
  chiudiAp()
  vaiScheda('chat')
  guarda(c.id)
}
function alberoHtml(a) {
  var t = a && a.albero
  var figli = (t && t.figli) || []
  if (figli.length === 0) {
    return '<div class="sotto">' + (a.stato === 'intervista' || a.stato === 'pronto'
      ? 'Non è ancora partita: nasce quando dai il via.'
      : 'Una chat sola, nella cartella del progetto.') + '</div>'
  }
  return '<div class="sotto">coordinatore · ' + esc(t.parola) + (a.ramoBase ? ' · ramo principale ' + esc(a.ramoBase) : '') + '</div>' +
    figli.map(function (f) {
      var led = f.stato === 'lavoro' ? 'lavoro' : f.stato === 'bloccata' ? 'attesa' : 'spenta'
      return '<div class="sotto" style="margin-left:6px;padding-left:12px;border-left:1px solid var(--bordo)">' +
        '<span class="led ' + led + '"></span>' +
        (f.ruolo ? '<span class="ruolo-chat" style="color:' + coloreRuolo(f.ruolo.colore) + ';border:1px solid ' + coloreRuolo(f.ruolo.colore) + ';border-radius:999px;padding:0 6px;margin-right:4px;font-size:0.75rem">' + esc(f.ruolo.parola) + '</span>' : '') +
        esc(f.titolo) + ' · ' + esc(f.parola) + (f.approvata ? ' · approvato e unito' : '') + ' · ' + f.cicli + (f.cicli === 1 ? ' giro' : ' giri') +
        (f.ramo ? ' · <span class="percorso" style="display:inline">' + esc(f.ramo) + '</span>' : '') + '</div>'
    }).join('')
}

function cartellaPrima() {
  const suo = ((ultimoStato || {}).autopiloti || []).find((a) => a.id === dentroAp)
  if (suo && suo.cwd) return suo.cwd
  const prima = ((ultimoStato || {}).chat || [])[0]
  return prima ? prima.cwd : ''
}

/**
 * L'ultima installazione sul computer non e' riuscita (0.39.2): il perche' e le
 * strade, con il link alla pagina della versione (solo se e' su github.com).
 */
/**
 * Il Drive del computer scollegato (0.39.3). Dalla 0.56.3 una riga sola in
 * cima, che si chiude: chiusa resta chiusa finché il problema è lo stesso
 * (\`chiave\` = il momento dello scollegamento). La spiegazione intera si apre
 * con «Perché e come si sistema».
 */
function driveChiuso() { try { return localStorage.getItem('sierradeck.driveChiuso') || '' } catch (e) { return '' } }
function chiudiDrive(k) { try { localStorage.setItem('sierradeck.driveChiuso', k) } catch (e) {} ; aggiorna() }
function driveScollegatoHtml(s) {
  var d = s && s.driveScollegato
  if (!d) return ''
  if (d.chiave && d.chiave === driveChiuso()) return ''
  return '<div class="drive-riga">' +
    '<span class="led attesa"></span>' +
    '<div class="drive-riga__testo">' + esc(d.breve || d.titolo || 'Google Drive scollegato') +
      '<details><summary>Perché e come si sistema</summary>' +
        '<div class="sotto">' + esc(d.testo || '') + '</div>' +
        '<div class="sotto" style="margin-top:6px"><b>Si ricollega dal computer</b>: Impostazioni → Account → Drive → «Collega» (si apre il browser per il consenso di Google). Dal telefono non si può: il consenso di Google si dà sul PC.</div>' +
      '</details>' +
    '</div>' +
    (d.chiave ? '<button class="drive-riga__chiudi" data-k="' + esc(d.chiave) + '" onclick="chiudiDrive(this.dataset.k)" aria-label="Chiudi l’avviso del Drive" title="Ricompare solo se il Drive si scollega un’altra volta">×</button>' : '') +
    '</div>'
}

function fallitoHtml(a) {
  var f = a && a.tentativoFallito
  if (!f) return ''
  var pagina = typeof f.pagina === 'string' && f.pagina.indexOf('https://github.com/') === 0 ? f.pagina : ''
  return '<div class="piastrella chiede fallito-agg" style="margin-top:8px">' +
    '<div class="serigrafia"><span class="led attesa"></span>L’ULTIMA INSTALLAZIONE NON È RIUSCITA</div>' +
    '<div class="sotto"><b>' + esc(f.titolo || '') + '</b> ' + esc(f.motivo || '') + '</div>' +
    '<div class="sotto" style="margin-top:6px">Cosa puoi fare: ' + (f.strade || []).map(function (x, i) { return (i + 1) + '. ' + esc(x) }).join(' ') + '</div>' +
    (pagina ? '<div class="riga"><a class="tasto-link" href="' + esc(pagina) + '" target="_blank" rel="noopener">Pagina della versione</a></div>' : '') +
    '</div>'
}

/** A che punto e' l'aggiornamento del computer, detto in italiano. */
function descriviAggiornamento() {
  const a = aggiornamentoVisto
  if (!a) return 'Non lo so.'
  if (a.fase === 'disponibile') return 'C’è la ' + (a.versione || 'versione nuova') + '.'
  if (a.fase === 'scarico') return 'Sto scaricando… ' + (a.percento || 0) + '%'
  if (a.fase === 'pronto') return (a.errore ? a.errore + ' ' : '') + 'La ' + (a.versione || 'nuova') + ' si installa da sola alla prossima chiusura.'
  // Le tre fasi che finivano nel ripiego «Sei alla versione più recente»:
  // durante l'installazione era una bugia, e a computer appena acceso pure.
  if (a.fase === 'installo') return a.testo || ('Sto installando la ' + (a.versione || 'versione nuova') + ': il computer si chiude e riparte da solo. Questa pagina non risponde per un minuto o due.')
  if (a.fase === 'aggiornato') return 'È all’ultima versione.' + (cercatoAlle ? ' Ho cercato alle ' + cercatoAlle + '.' : '')
  if (a.fase === 'fermo') return 'Controlla da sé ogni dieci minuti. Non ha ancora guardato: «Cerca ora» lo fa subito.' + (cercatoAlle ? ' Ho chiesto alle ' + cercatoAlle + '.' : '')
  // Fra «Installa» e il computer che si chiude adesso c'e' un'attesa vera: le
  // chat che stanno lavorando devono finire quello che hanno in mano. Senza
  // dirlo, da qui si vede un tasto premuto e nient'altro.
  if (a.fase === 'attendo') {
    if (a.attesaChat && !a.attesa) return a.attesaChat.charAt(0).toUpperCase() + a.attesaChat.slice(1) + '.'
    if (a.attesa) return 'Aspetto che finisca ' + a.attesa + ', poi installo.'
    var quante = a.chatOccupate || 0
    return quante === 1
      ? 'Aspetto che una chat finisca quello che ha in mano, poi installo.'
      : 'Aspetto che ' + quante + ' chat finiscano quello che hanno in mano, poi installo.'
  }
  if (a.fase === 'errore') return 'Qualcosa non ha funzionato: ' + (a.errore || '')
  if (a.fase === 'cerco') return 'Sto guardando se ce n’è una nuova…'
  return 'Sei alla versione più recente.'
}

/**
 * Un pezzo delle note, gia' scomposto dal computer (note-aggiornamento.ts):
 * qui non si interpreta niente, si scrive testo con esc. Un link e' cliccabile
 * solo se porta a https://github.com/ (lo controlla il computer, e di nuovo qui).
 */
function pezzoNoteHtml(p) {
  var t = esc(p && p.testo)
  if (p && p.codice) t = '<code>' + t + '</code>'
  if (p && p.corsivo) t = '<i>' + t + '</i>'
  if (p && p.grassetto) t = '<b>' + t + '</b>'
  if (p && typeof p.link === 'string' && p.link.indexOf('https://github.com/') === 0) {
    t = '<a href="' + esc(p.link) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>'
  }
  return t
}

function bloccoNoteHtml(b) {
  var pezzi = function (lista) { return (lista || []).map(pezzoNoteHtml).join('') }
  if (!b) return ''
  if (b.tipo === 'titolo') return '<div style="margin-top:8px"><b>' + pezzi(b.pezzi) + '</b></div>'
  if (b.tipo === 'paragrafo') return '<div class="sotto" style="margin-top:6px">' + pezzi(b.pezzi) + '</div>'
  if (b.tipo === 'codice') return '<pre style="white-space:pre-wrap;font-size:0.75rem">' + esc(b.testo) + '</pre>'
  if (b.tipo === 'elenco') return '<ul style="margin:6px 0 0 0;padding-left:18px">' + (b.voci || []).map(function (v) { return '<li class="sotto" style="margin-top:6px">' + pezzi(v) + '</li>' }).join('') + '</ul>'
  return ''
}

/** La finestra di «Installa» sul telefono: le note, poi i due tasti. */
function noteAggHtml(n) {
  if (!n) return ''
  if (n.leggo) return '<div class="solco"></div><div class="sotto">Leggo dal computer cosa cambia…</div>'
  var note = n.note || []
  var avviso = n.avviso ? '<div class="sotto" style="margin-top:8px"><b>' + (n.avviso ? (bloccoNoteHtml({ tipo: 'paragrafo', pezzi: [{ testo: n.avviso }] })) : '') + '</b></div>' : ''
  var versioni = note.map(function (v, i) {
    var etichetta = i === 0 && v.versione === n.versione ? 'LA NUOVA · ' + esc(v.versione) : 'SALTATA · ' + esc(v.versione)
    return '<div class="serigrafia" style="margin-top:12px">' + etichetta + '</div>' + (v.blocchi || []).map(bloccoNoteHtml).join('')
  }).join('')
  return '<div class="solco"></div>' +
    '<div class="titolo">Cosa cambia con la ' + esc(n.versione || 'versione nuova') + '</div>' +
    fallitoHtml(aggiornamentoVisto) +
    (n.installata ? '<div class="sotto">Sul computer adesso c’è la ' + esc(n.installata) + (note.length > 1 ? ': qui sotto la nuova e le ' + (note.length - 1) + ' che aveva saltato.' : '.') + '</div>' : '') +
    avviso + versioni +
    '<div class="sotto" style="margin-top:12px">Cosa fanno i due tasti' + aiuto('installa', '<b>Installa e riavvia</b>: il computer aspetta che le chat finiscano quello che hanno in mano, le avvisa, si chiude, installa e riparte da solo; chat e autopiloti riprendono da dove erano. Questa pagina non risponde per un minuto o due. <b>Più tardi</b>: non installa niente adesso; si installa da sola quando chiudi SierraDeck sul computer.') + '</div>' +
    '<div class="riga"><button class="pericolo" onclick="confermaInstalla()">Installa e riavvia</button><button onclick="piuTardiAggiornamento()">Più tardi</button></div>'
}

function limitiHtml(c) {
  var l = c && c.limiti
  // La frase di ogni finestra la scrive il computer (0.37.0, limiti-piano.ts):
  // percentuale, azzeramento, da quanto e' letta, «azzerata, in attesa» o
  // «lettura vecchia» — la stessa del PC e dell'app.
  var barra = function (nome, f, spiega) {
    var p = f ? Math.round(f.percento) : 0
    var colore = f && f.stato === 'azzerata' ? '#4a5058' : p >= 95 ? '#dc5f5f' : p >= 80 ? '#e0a33c' : '#4aa3ff'
    var quando = f && f.resettaIl ? ' \u00b7 si azzera ' + new Date(f.resettaIl).toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
    var frase = f ? (f.etichetta ? esc(f.etichetta) : p + '% usato' + quando) : 'non ancora letta'
    // 0.70.0: la parola del PC (libero, attento, pieno, vecchia, attesa) prima della frase.
    if (f && f.vista) frase = '<b style="color:' + ({ verde: 'var(--verde,#3c9)', ambra: '#e0a33c', rosso: '#dc5f5f', blu: '#4aa3ff', quieto: 'var(--testo-quieto,#9aa1a9)' })[f.vista.colore] + '">' + esc(f.vista.parola) + '</b> · ' + frase
    return '<div style="margin-top:10px"><div class="sotto"><b>' + nome + '</b>: ' + frase + '</div>' +
      '<div class="barra"><i style="width:' + p + '%;background:' + colore + '"></i></div><div class="sotto">' + spiega + '</div></div>'
  }
  var chatAperte = (c && c.chatAperte) || []
  var contesti = chatAperte.length === 0 ? '' :
    '<div class="serigrafia" style="margin-top:12px">CONTESTO DELLE CHAT APERTE</div>' +
    chatAperte.map(function (x) {
      var cp = x.contesto ? x.contesto.percento : 0
      return '<div style="margin-top:8px"><div class="sotto"><b>' + esc(x.titolo || String(x.sessione || '').slice(0, 8)) + '</b>' + (x.modello ? ' \u00b7 ' + esc(x.modello) : '') + ': ' + (x.vista ? '<b style="color:' + ({ verde: 'var(--verde,#3c9)', ambra: '#e0a33c', rosso: '#dc5f5f', blu: '#4aa3ff', quieto: 'var(--testo-quieto,#9aa1a9)' })[x.vista.colore] + '">' + esc(x.vista.parola) + '</b> · ' : '') + esc(x.contestoEtichetta || 'contesto non ancora letto') + '</div>' +
        '<div class="barra"><i style="width:' + cp + '%;background:' + (cp >= 90 ? '#e0a33c' : '#4aa3ff') + '"></i></div></div>'
    }).join('') +
    '<div class="sotto" style="margin-top:6px">Cos\u2019\u00e8 il contesto' + aiuto('contesto', 'Il contesto \u00e8 la memoria di lavoro della chat: si conta come Claude Code, solo con i token in ingresso. Al 90% conviene farle riassumere dove \u00e8 arrivata, prima che lo compatti da sola.') + '</div>'
  var freno = c && c.freno
    ? '<div class="serigrafia" style="margin-top:12px">FRENO DEGLI AUTOPILOTI</div><div class="sotto" style="margin-top:6px"><b>' + esc(c.freno.titolo || '') + '</b>: ' + esc(c.freno.spiegazione || c.freno.motivo || '') + '</div>'
    : ''
  var spesa = c && c.costo
    ? '<div class="sotto" style="margin-top:10px"><b>Spesa stimata da Claude Code</b>: oggi ' + Number(c.costo.oggi || 0).toFixed(2) + ' $, 7 giorni ' + Number(c.costo.settimana || 0).toFixed(2) + ' $.' + aiuto('spesa', 'Con un abbonamento \u00e8 un\u2019indicazione, non una fattura.') + '</div>'
    : ''
  return '<div class="solco"></div><div class="serigrafia">LIMITI DEL PIANO</div>' +
    barra('Finestra di 5 ore', l && l.cinqueOre, 'Al 100% le chat si fermano fino all\u2019azzeramento.') +
    barra('Settimana', l && l.settimana, 'Il tetto settimanale su tutti i modelli.') +
    (l ? '<div class="sotto" style="margin-top:6px">Letti ' + (quandoLetti(l.letti, Date.now()) || 'di recente') + '.' + aiuto('limiti', 'Sono gli stessi numeri di /usage in Claude Code. Fra tutte le chat aperte dal computer vale la lettura pi\u00f9 recente; si aggiornano a ogni risposta, e qui ogni mezzo minuto. Una lettura di pi\u00f9 di 20 minuti \u00e8 segnata vecchia: il valore vero pu\u00f2 essere pi\u00f9 alto.') + '</div>'
      : '<div class="sotto" style="margin-top:6px">Arrivano dalla riga di stato di Claude Code dopo la prima risposta di una chat aperta dal computer (solo con abbonamento Pro o Max).</div>') +
    contesti + freno + spesa
}

window.leggiConsumi = async () => {
  try { consumiVisti = await chiedi('/api/consumi') } catch (e) { consumiVisti = null }
}

// Il Quaderno della pagina (0.70.0), come quello del PC: i tag con quante
// schede li portano, la ricerca (nasconde le righe), la data corta. Le regole
// sono quelle di src/shared/quaderno-vista.ts, copiate qui.
function quandoBreveQ(iso, ora) {
  const t = Date.parse(iso)
  if (isNaN(t)) return String(iso || '').slice(0, 10)
  const d = new Date(t), oggi = new Date(ora)
  const due = (n) => (n < 10 ? '0' : '') + n
  const inizio = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const giorni = Math.round((inizio(oggi) - inizio(d)) / 86400000)
  if (giorni === 0) return 'oggi ' + due(d.getHours()) + ':' + due(d.getMinutes())
  if (giorni === 1) return 'ieri'
  if (giorni > 1 && giorni < 7) return giorni + ' giorni fa'
  const data = due(d.getDate()) + '/' + due(d.getMonth() + 1)
  return d.getFullYear() === oggi.getFullYear() ? data : data + '/' + d.getFullYear()
}
function quadernoHtml(schede, aperta, tag, cartella, ora) {
  const tutte = schede || []
  let h = '<div class="piastrella"><div class="titolo">Quaderno</div>'
  if (aperta) {
    h += '<div class="dettaglio"><div class="titolo">' + esc(aperta.titolo) + '</div>' +
      '<div class="sotto">' + esc(quandoBreveQ(aperta.quando, ora)) + ((aperta.tag || []).length ? ' · ' + (aperta.tag || []).map(esc).join(' · ') : '') + '</div>' +
      '<div class="dentro" style="max-height:60vh;white-space:pre-wrap">' + esc(aperta.corpo) + '</div>' +
      '<div class="riga"><button onclick="chiudiScheda()">Torna all’elenco</button></div></div>'
    return h + '<div class="riga"><button onclick="apriPannello(\\'quaderno\\')">Chiudi</button></div></div>'
  }
  if (tutte.length === 0) return h + '<div class="sotto" style="margin-top:8px">Nessuna scheda in questa cartella.</div><div class="riga"><button onclick="apriPannello(\\'quaderno\\')">Chiudi</button></div></div>'
  const conti = {}
  for (const x of tutte) for (const t of (x.tag || []).filter((v, i, a) => a.indexOf(v) === i)) conti[t] = (conti[t] || 0) + 1
  const tags = Object.keys(conti).sort((a, b) => conti[b] - conti[a] || a.localeCompare(b, 'it'))
  h += '<div class="riga" style="gap:6px"><input placeholder="Cerca fra le schede" value="' + esc(quadernoQ) + '" oninput="quadernoCerca(this.value)" style="flex:1;min-width:0"></div>'
  if (tags.length) {
    h += '<div class="riga" style="gap:4px;flex-wrap:wrap">' +
      '<button' + (tag ? '' : ' class="primario"') + ' style="flex:none;width:auto;min-height:48px;padding:6px 12px" onclick="quadernoSceltaTag(\\'\\')">Tutte ' + tutte.length + '</button>' +
      tags.map((t) => '<button' + (tag === t ? ' class="primario"' : '') + ' style="flex:none;width:auto;min-height:48px;padding:6px 12px" onclick="quadernoSceltaTag(\\'' + escJs(t) + '\\')">' + esc(t) + ' ' + conti[t] + '</button>').join('') + '</div>'
  }
  const viste = tutte.filter((x) => !tag || (x.tag || []).indexOf(tag) >= 0).slice().sort((a, b) => (b.quando > a.quando ? 1 : b.quando < a.quando ? -1 : 0))
  h += viste.map((x) => {
    const dove = (x.titolo + ' ' + (x.tag || []).join(' ') + ' ' + (x.assaggio || x.corpo || '')).toLowerCase()
    return '<button class="cartella" data-quaderno-cerca="' + esc(dove) + '" onclick="apriScheda(\\'' + escJs(cartella) + '\\', \\'' + escJs(x.file) + '\\')">' +
      '<b>' + esc(x.titolo) + '</b>' + (x.assaggio ? '<span class="sotto" style="display:block">' + esc(x.assaggio) + '</span>' : '') + '<span class="sotto" style="display:block">' + esc(quandoBreveQ(x.quando, ora)) + ((x.tag || []).length ? ' · ' + (x.tag || []).map(esc).join(' · ') : '') + '</span></button>'
  }).join('')
  return h + '<div class="riga"><button onclick="apriPannello(\\'quaderno\\')">Chiudi</button></div></div>'
}
window.quadernoSceltaTag = (t) => { quadernoTag = t; pannello(ultimoStato) }
window.quadernoCerca = (q) => {
  quadernoQ = q
  const parole = String(q).toLowerCase().split(' ').filter(Boolean)
  for (const el of document.querySelectorAll('[data-quaderno-cerca]')) el.style.display = parole.every((p) => el.getAttribute('data-quaderno-cerca').indexOf(p) >= 0) ? '' : 'none'
}

// La catena di Account e Drive (0.70.0), come sul PC: quattro tessere con la
// parola e il colore che manda il PC; il prossimo passo si fa sul computer.
window.leggiAccount = async () => {
  try { accountVisto = await chiedi('/api/account') } catch (e) { accountVisto = null }
  // La trasformazione dei workspace (0.74.1): letta insieme, per «Torna come prima».
  try { migrazioneVista = (await chiedi('/api/migrazione')).stato || null } catch (e) { migrazioneVista = null }
}
var migrazioneVista = null
var notaMigrazione = ''
function migrazioneHtml() {
  var s = migrazioneVista
  if (!s) return ''
  // 0.80.0: la riga corta di testoMigrazione (shared/migrazione-elenco), la spiegazione nel «?».
  var n = (s.dormienti || []).length
  var testo = s.stato === 'fatta'
    ? (n === 0 ? 'Fatta: ogni workspace aveva già il suo autopilota.' : 'Fatta: Panoramica nuova in ' + n + ' workspace, parte quando le scrivi.')
    : s.stato === 'annullata' ? 'Workspace tornati come prima.'
      : s.stato === 'fallita' ? 'La trasformazione non è riuscita, tutto è com’era: ' + (s.motivo || '')
        : 'Trasformazione a metà: si completa al prossimo avvio del computer.'
  return '<div class="sotto" style="margin-top:10px"><b>Panoramica in tutti i workspace</b> ' + aiuto('migrazione', 'Ogni workspace del computer ha la Panoramica, con il suo autopilota. Quelle nuove partono solo al primo messaggio: fino ad allora non compaiono fra gli Autopiloti. Le chat non sono state toccate. «Torna come prima» rimette tutto com’era.') + '</div><div class="sotto">' + esc(notaMigrazione || testo) + '</div>' +
    '<div class="riga">' + (s.stato === 'fatta'
      ? '<button onclick="cambiaMigrazione(\\'torna\\')">Torna come prima</button>'
      : '<button onclick="cambiaMigrazione(\\'rifai\\')">Trasforma tutti</button>') + '</div>'
}
window.cambiaMigrazione = async (come) => {
  try {
    var e = await chiedi('/api/migrazione/' + (come === 'torna' ? 'torna' : 'rifai'), {})
    notaMigrazione = (e && e.messaggio) || ''
  } catch (err) { notaMigrazione = String(err && err.message || err) }
  await leggiAccount()
  pannello(ultimoStato)
}
function catenaAccountHtml(a) {
  if (!a || !a.catena) return ''
  const colori = { verde: '#3fb950', ambra: '#e0a33c', rosso: '#f85149', blu: '#4aa3ff', quieto: '#8b949e' }
  let h = '<div class="riga" style="gap:6px;flex-wrap:wrap;margin-top:8px">'
  h += (a.catena.tessere || []).map((t) =>
    '<div style="flex:1 1 40%;min-width:0;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:8px"' + (t.vista && t.vista.ragione ? ' title="' + esc(t.vista.ragione) + '"' : '') + '>' +
    '<div class="sotto">' + esc(t.titolo) + '</div>' +
    '<b style="color:' + (colori[(t.vista && t.vista.colore) || 'quieto'] || colori.quieto) + '">' + esc((t.vista && t.vista.parola) || '') + '</b>' +
    (t.sotto ? '<div class="sotto" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.sotto) + '</div>' : '') + '</div>').join('')
  h += '</div>'
  const scade = (a.catena.tessere || []).find((t) => t.vista && t.vista.id === 'scade')
  if (scade) h += '<div class="sotto" style="color:#e0a33c;margin-top:6px">⚠ ' + esc(scade.vista.ragione || '') + '</div>'
  if (a.catena.prossimo) h += '<div class="sotto" style="margin-top:6px">Prossimo passo, sul computer: <b>' + esc(a.catena.prossimo.testo) + '</b></div>'
  return h
}

window.leggiQuaderno = async (cartella) => {
  try { schedeViste = (await chiedi('/api/quaderno', { cartella: cartella })).schede || [] }
  catch (e) { schedeViste = [] }
}

window.apriScheda = async (cartella, file) => {
  try { schedaAperta = await chiedi('/api/quaderno/scheda', { cartella: cartella, file: file }) }
  catch (e) { schedaAperta = null }
  pannello(ultimoStato)
}
window.chiudiScheda = () => { schedaAperta = null; pannello(ultimoStato) }

window.leggiPreferenze = async () => {
  try { prefViste = (await chiedi('/api/preferenze')).preferenze } catch (e) { prefViste = null }
}

// Il Quaderno personale (0.57.0): i dati riservati di Nicholas, gestiti anche
// da qui. Le regole e i testi sono quelli di src/shared/quaderno-personale.ts.
var qpStato = null
var qpErrore = ''
var qpVisti = {}
var qpBozza = { id: '', nome: '', valore: '', nota: '' }
var qpDaTogliere = ''
var QP_ESITI = ${JSON.stringify(Object.fromEntries((['una-volta', 'sempre', 'gia-consentita', 'negato', 'nessuna-risposta', 'voce-assente'] as const).map((e) => [e, testoEsito(e)])))}
window.leggiQuadernoPersonale = async () => {
  try {
    const r = await chiedi('/api/quaderno-personale', {})
    if (r && r.errore) { qpStato = null; qpErrore = r.errore } else { qpStato = r; qpErrore = '' }
  } catch (e) { qpStato = null; qpErrore = (e && e.message) || String(e) }
}
function qpNascosto(v) { return v.length <= 4 ? '••••' : v.slice(0, 2) + '•'.repeat(Math.min(12, v.length - 4)) + v.slice(-2) }
function qpQuando(iso) { try { return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) } catch (e) { return iso } }
window.qpMostra = (id) => { qpVisti[id] = !qpVisti[id]; pannello(ultimoStato) }
window.qpModifica = (id) => {
  const v = qpStato && qpStato.voci.find((x) => x.id === id)
  if (!v) return
  qpBozza = { id: v.id, nome: v.nome, valore: v.valore, nota: v.nota || '' }
  for (const k of ['qp-nome', 'qp-valore', 'qp-nota']) { const el = document.getElementById(k); if (el) el.value = '' }
  pannello(ultimoStato)
}
window.qpAnnulla = () => { qpBozza = { id: '', nome: '', valore: '', nota: '' }; for (const k of ['qp-nome', 'qp-valore', 'qp-nota']) { const el = document.getElementById(k); if (el) el.value = '' } pannello(ultimoStato) }
window.qpSalva = async () => {
  const val = (k) => { const el = document.getElementById(k); return el ? el.value : '' }
  const corpo = { nome: val('qp-nome'), valore: val('qp-valore'), nota: val('qp-nota') }
  if (qpBozza.id) corpo.id = qpBozza.id
  try {
    await chiedi('/api/quaderno-personale/salva', corpo)
    notaGlobale = (qpBozza.id ? 'Cambiata: «' : 'Aggiunta: «') + corpo.nome.trim() + '».'
    qpBozza = { id: '', nome: '', valore: '', nota: '' }
    for (const k of ['qp-nome', 'qp-valore', 'qp-nota']) { const el = document.getElementById(k); if (el) el.value = '' }
    await leggiQuadernoPersonale()
  } catch (e) { notaGlobale = 'Non salvata: ' + ((e && e.message) || e) }
  pannello(ultimoStato)
}
window.qpTogli = async (id) => {
  if (qpDaTogliere !== id) { qpDaTogliere = id; pannello(ultimoStato); return }
  qpDaTogliere = ''
  try { await chiedi('/api/quaderno-personale/togli', { id }); notaGlobale = 'Voce tolta, con i suoi «sempre».'; await leggiQuadernoPersonale() }
  catch (e) { notaGlobale = 'Non tolta: ' + ((e && e.message) || e) }
  pannello(ultimoStato)
}
window.qpRevoca = async (sessione, voce) => {
  try { await chiedi('/api/quaderno-personale/revoca', { sessione, voce }); notaGlobale = 'Revocato: quella chat dovrà chiedere ogni volta.'; await leggiQuadernoPersonale() }
  catch (e) { notaGlobale = 'Non revocato: ' + ((e && e.message) || e) }
  pannello(ultimoStato)
}
function quadernoPersonaleHtml() {
  let h = '<div class="sotto" style="margin-top:12px"><b>Quaderno personale</b>' + aiuto('quaderno-personale', 'I tuoi dati riservati (email di contatto, sede, partita IVA…) che una chat a volte deve scrivere. Stanno solo su questo computer, cifrati: non nel codice, non nei progetti, non nel Drive. Nessuna chat li legge da sola: li chiede, e tu scegli nelle Domande «Consenti una volta», «Sempre per questa chat» o «No». Senza risposta in due minuti vale no.') + '</div>'
  if (qpErrore) return h + '<div class="sotto" style="color:var(--ambra)">' + esc(qpErrore) + '</div>'
  if (!qpStato) return h + '<div class="sotto">Leggo…</div>'
  if (!qpStato.disponibile) return h + '<div class="sotto" style="color:var(--ambra)">' + esc(qpStato.perche || 'Non disponibile su questo computer.') + '</div>'
  if (qpStato.voci.length === 0) h += '<div class="sotto" style="margin-top:6px">Il quaderno è vuoto. Aggiungi la prima voce qui sotto: il nome è quello che la chat chiederà («Email di contatto», «Sede legale», «Partita IVA»).</div>'
  for (const v of qpStato.voci) {
    h += '<div class="sotto" style="margin-top:8px"><b>' + esc(v.nome) + '</b>' + (v.nota ? ' · ' + esc(v.nota) : '') + '<br><code>' + esc(qpVisti[v.id] ? v.valore : qpNascosto(v.valore)) + '</code></div>' +
      '<div class="riga"><button onclick="qpMostra(\\'' + escJs(v.id) + '\\')">' + (qpVisti[v.id] ? 'Nascondi' : 'Mostra') + '</button>' +
      '<button onclick="qpModifica(\\'' + escJs(v.id) + '\\')">Modifica</button>' +
      '<button onclick="qpTogli(\\'' + escJs(v.id) + '\\')">' + (qpDaTogliere === v.id ? 'Sicuro? Tocca ancora per togliere' : 'Togli') + '</button></div>'
  }
  h += '<div class="sotto" style="margin-top:10px">' + (qpBozza.id ? 'Modifica «' + esc(qpBozza.nome) + '»' : 'Nuova voce') + '</div>' +
    '<div class="riga"><input id="qp-nome" maxlength="80" placeholder="nome, es. Email di contatto" value="' + esc(qpBozza.nome) + '"></div>' +
    '<div class="riga"><input id="qp-valore" maxlength="2000" placeholder="valore" value="' + esc(qpBozza.valore) + '"></div>' +
    '<div class="riga"><input id="qp-nota" maxlength="300" placeholder="nota facoltativa: a cosa serve" value="' + esc(qpBozza.nota) + '"></div>' +
    '<div class="riga"><button onclick="qpSalva()">' + (qpBozza.id ? 'Salva' : 'Aggiungi') + '</button>' + (qpBozza.id ? '<button onclick="qpAnnulla()">Annulla</button>' : '') + '</div>'
  h += '<div class="sotto" style="margin-top:10px"><b>Consensi «sempre per questa chat»</b></div>'
  if (qpStato.consensi.length === 0) h += '<div class="sotto">Nessuno: ogni richiesta passa dalle Domande.</div>'
  for (const k of qpStato.consensi) {
    h += '<div class="sotto">«' + esc(k.chat) + '» può avere <b>' + esc(k.voce) + '</b> senza chiedere, dal ' + esc(qpQuando(k.dal)) + '</div>' +
      '<div class="riga"><button onclick="qpRevoca(\\'' + escJs(k.sessione) + '\\', \\'' + escJs(k.voceId) + '\\')">Revoca</button></div>'
  }
  h += '<div class="sotto" style="margin-top:10px"><b>Chi li ha chiesti</b></div>'
  if (qpStato.usi.length === 0) h += '<div class="sotto">Ancora nessuna richiesta.</div>'
  for (const u of qpStato.usi.slice(0, 15)) {
    h += '<div class="sotto">' + esc(qpQuando(u.quando)) + ' · «' + esc(u.chat) + '» ha chiesto <b>' + esc(u.voce) + '</b> — ' + esc(QP_ESITI[u.esito] || u.esito) + '. Motivo: «' + esc(u.motivo) + '»</div>'
  }
  return h
}

// Il pannello delle chat e dei progetti del Drive (0.58.0): gli stessi dati e
// le stesse azioni del PC, con i testi già scritti dal PC. Le conferme in due tocchi.
var pdDati = null
var pdErrore = ''
var pdVista = 'progetti'
var pdFiltro = 'tutti'
var pdDaConfermare = ''
var pdSenzaNome = false
window.pdMostraSenzaNome = () => { pdSenzaNome = !pdSenzaNome; pannello(ultimoStato) }
// «Rendi residente» (0.60.0): l'analisi e l'unione lavorano sul PC; la pagina rilegge finché finiscono.
var pdGiro = null
function pdSegui() {
  const lavora = pdDati && (pdDati.residenza || []).some((s) => s.fase === 'analisi' || s.fase === 'unisco')
  if (lavora && !pdGiro) pdGiro = setInterval(async () => { await leggiPannelloDrive(); pannello(ultimoStato); pdSegui() }, 2500)
  if (!lavora && pdGiro) { clearInterval(pdGiro); pdGiro = null }
}
window.leggiPannelloDrive = async () => {
  try {
    const r = await chiedi('/api/drive/pannello', {})
    if (r && r.errore) { pdDati = null; pdErrore = r.errore } else { pdDati = r; pdErrore = '' }
  } catch (e) { pdDati = null; pdErrore = (e && e.message) || String(e) }
}
// Apre una chat dal pannello «Progetti» (0.67.0): sul computer, qui o dal vivo sul PC dove vive.
window.pdApriChat = async (sessione, cwd, pc, titolo) => {
  try { await chiedi('/api/sessioni/riprendi', pc ? { cartella: cwd, sessione: sessione, dalVivo: true, pc: pc, titolo: titolo } : { cartella: cwd, sessione: sessione }); notaGlobale = 'Aperta sul computer: la trovi fra le sue chat.' }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || e) }
  aggiorna()
}
window.pdCambia = (cosa, valore) => { if (cosa === 'vista') pdVista = valore; else pdFiltro = valore; pdDaConfermare = ''; pannello(ultimoStato) }
window.pdAzione = async (azione, progetto, conferma, id) => {
  const chiave = azione + ':' + progetto + ':' + (id || '')
  if (conferma && pdDaConfermare !== chiave) { pdDaConfermare = chiave; pannello(ultimoStato); return }
  pdDaConfermare = ''
  try { const r = await chiedi('/api/drive/azione', { azione: azione, progetto: progetto, id: id || '' }); notaGlobale = (r && r.messaggio) || 'Fatto.' }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || e) }
  await leggiPannelloDrive(); pannello(ultimoStato); pdSegui()
}
// «Aspetta quel PC» (0.71.1): niente da fare, riparte da solo; lo si dice e basta.
window.pdAspetta = (id) => { pdDaConfermare = 'trasloco-aspetta::' + id; pannello(ultimoStato) }
// «Vai avanti senza» (0.71.1), con conferma: la sua copia resta dov'è e si sistema quando torna.
window.pdSenza = async (id, pc) => {
  const chiave = 'trasloco-senza::' + id
  if (pdDaConfermare !== chiave) { pdDaConfermare = chiave; pannello(ultimoStato); return }
  pdDaConfermare = ''
  try { const r = await chiedi('/api/drive/azione', { azione: 'trasloco-senza', id: id, pc: pc }); notaGlobale = (r && r.messaggio) || 'Fatto.' }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || e) }
  await leggiPannelloDrive(); pannello(ultimoStato); pdSegui()
}
window.pdResidente = async (progetto, sessione, pcId) => {
  if (!pdDati || !pcId) return
  // Questo PC per un progetto (0.60.0): prima l'analisi delle copie e il riassunto («Rendi residente qui»).
  if (progetto && pcId === pdDati.io.id) { pdDaConfermare = 'residente-qui:' + progetto + ':'; pannello(ultimoStato); return }
  const pc = [pdDati.io].concat(pdDati.pc).find((x) => x.id === pcId)
  if (!pc) return
  const sessioni = progetto ? pdDati.chat.filter((c) => c.progetto === progetto).map((c) => c.sessione).concat(['progetto:' + progetto]) : [sessione]
  const chiave = 'residente:' + (progetto || sessione) + ':' + pcId
  if (pdDaConfermare !== chiave) { pdDaConfermare = chiave; pannello(ultimoStato); return }
  pdDaConfermare = ''
  try { const r = await chiedi('/api/drive/azione', { azione: 'residente', sessioni: sessioni, pc: { id: pc.id, nome: pc.nome } }); notaGlobale = (r && r.messaggio) || 'Fatto.' }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || e) }
  await leggiPannelloDrive(); pannello(ultimoStato)
}
// Il trasloco (0.65.0): «Sposta progetto» e «Rendi residente» passo per passo, come sul PC.
const PD_PASSI = [['raccolta', 'Raccolgo le copie'], ['analisi', 'Confronto i file'], ['unione', 'Unisco qui'], ['vecchie', 'Copie vecchie nel recupero'], ['fine', 'Riassunto']]
function pdTraslochiHtml() {
  let h = ''
  for (const t of pdDati.traslochi || []) {
    const fatti = PD_PASSI.filter((x) => t.passi[x[0]] && t.passi[x[0]].stato === 'fatto').length
    const attuale = PD_PASSI.find((x) => !t.passi[x[0]] || t.passi[x[0]].stato !== 'fatto')
    const pa = attuale ? t.passi[attuale[0]] : null
    const frazione = pa && pa.stato === 'in-corso' && pa.totale ? Math.min(1, (pa.fatto || 0) / pa.totale) : 0
    const percento = Math.round(((fatti + frazione) / PD_PASSI.length) * 100)
    const stato = t.annullatoIl ? 'annullato' : t.finitoIl ? 'fatto' : t.fermo ? 'fermo' : 'in corso'
    h += '<div class="sotto" style="margin-top:10px"><b>Trasloco di «' + esc(t.nome) + '» su ' + esc(t.verso.nome) + '</b> · ' + stato + aiuto('trasloco', '«Sposta progetto» e «Rendi residente» sono lo stesso passaggio: raccolgo le copie, le confronto, unisco qui quello che serve e solo alla fine metto le copie vecchie nel recupero dei loro PC. Se un PC non risponde mi fermo e riprendo da dove ero. «Annulla tutto» per 30 giorni.') + '</div>'
    h += '<div style="height:8px;background:#333;border-radius:4px;overflow:hidden;margin:4px 0"><div style="height:100%;width:' + percento + '%;background:' + (t.fermo ? 'var(--ambra,#e0a33c)' : 'var(--verde,#3c9)') + '"></div></div>'
    if (attuale && !t.finitoIl && !t.annullatoIl) h += '<div class="sotto"><b>' + esc(attuale[1]) + '</b>' + (pa && pa.dettaglio ? ': ' + esc(pa.dettaglio) : '…') + '</div>'
    // Un PC spento (0.71.1): il motivo in chiaro, con il nome scelto, e le due scelte.
    const chiaro = t.fermoChiaro
    if (t.fermo && chiaro && chiaro.pc) {
      h += '<div class="sotto" style="color:var(--ambra,#e0a33c)">Fermo: ' + esc(chiaro.testo) + '</div>'
      if (chiaro.scelte) {
        const ka = 'trasloco-aspetta::' + t.id
        const ks = 'trasloco-senza::' + t.id
        h += '<div class="riga"><button onclick="pdAspetta(\\'' + escJs(t.id) + '\\')">Aspetta ' + esc(chiaro.pc.nome) + '</button>' +
          '<button onclick="pdSenza(\\'' + escJs(t.id) + '\\', \\'' + escJs(chiaro.pc.pc) + '\\')">' + (pdDaConfermare === ks ? 'Tocca ancora: vai avanti senza' : 'Vai avanti senza…') + '</button>' +
          aiuto('pc-spento', '«Aspetta»: non devi fare niente, il trasloco riparte da solo quando quel PC si riaccende. «Vai avanti senza»: uso la sua copia che è già sul Drive; la sua copia sul PC resta dov’è e, quando torna, quello che ha solo lui entra nei recuperati e la sua copia va nel recupero di quel PC per 30 giorni. Niente si cancella.') + '</div>'
        if (pdDaConfermare === ka) h += '<div class="sotto">Aspetto ' + esc(chiaro.pc.nome) + ': riparto da solo quando si riaccende.</div>'
      }
    } else if (t.fermo) h += '<div class="sotto" style="color:var(--ambra,#e0a33c)">Fermo: ' + esc(chiaro ? chiaro.testo : t.fermo.motivo) + (t.fermo.riprovaDaSolo ? ' Riprendo da solo quando passa.' : '') + '</div>'
    for (const a of (t.altrove || []).filter((x) => x.esito === 'dopo')) h += '<div class="sotto">' + esc(a.nome) + ' era spento: la sua copia la sistemo quando torna.</div>'
    for (const x of PD_PASSI) { const s = t.passi[x[0]] || { stato: 'da-fare' }; h += '<div class="sotto" style="opacity:' + (s.stato === 'da-fare' ? '0.6' : '1') + '">' + (s.stato === 'fatto' ? '✓' : s.stato === 'fermo' ? '!' : s.stato === 'in-corso' ? '…' : '·') + ' ' + esc(x[1]) + (s.stato === 'fatto' && s.dettaglio ? ' — ' + esc(s.dettaglio) : '') + '</div>' }
    if (t.finitoIl) for (const r of t.riassunto || []) h += '<div class="sotto">• ' + esc(r) + '</div>'
    if (t.annullatoIl) for (const r of t.annullamento || []) h += '<div class="sotto">• ' + esc(r) + '</div>'
    let tasti = ''
    if (t.fermo) tasti += '<button onclick="pdAzione(\\'trasloco-riprendi\\', \\'\\', false, \\'' + escJs(t.id) + '\\')">Riprendi</button>'
    const annullabile = !t.annullatoIl && (!t.scadeIl || Date.parse(t.scadeIl) > Date.now()) && (t.unione || (t.altrove || []).some((a) => a.esito === 'nel-recupero')) && (t.finitoIl || t.fermo)
    if (annullabile) tasti += '<button onclick="pdAzione(\\'trasloco-annulla\\', \\'\\', true, \\'' + escJs(t.id) + '\\')">' + (pdDaConfermare === 'trasloco-annulla::' + t.id ? 'Tocca ancora: annulla tutto' : 'Annulla tutto…') + '</button>'
    if (tasti) h += '<div class="riga">' + tasti + '</div>'
  }
  return h
}
// Lo spazio sul Drive (0.65.0): misura per tipo e pulizie confermate, nel recupero e annullabili.
const PD_TIPI = [['chat', 'Chat'], ['progetti', 'Progetti'], ['battiti', 'Battiti e posta dei PC'], ['recupero', 'Recupero e copie di sicurezza'], ['sistema', 'Indice, chiavi e workspace'], ['orfani', 'File senza voce nell’indice']]
function pdByte(n) { const u = ['byte', 'KB', 'MB', 'GB', 'TB']; let x = n; let i = 0; while (x >= 1024 && i < u.length - 1) { x /= 1024; i++ } return (i === 0 ? String(x) : x.toFixed(x < 10 ? 1 : 0).replace('.', ',')) + ' ' + u[i] }
window.pdSpazio = async (azione, tipo, id) => {
  const chiave = 'spazio:' + azione + ':' + (tipo || id || '')
  if (azione !== 'spazio-annulla' && azione !== 'spazio-misura' && pdDaConfermare !== chiave) { pdDaConfermare = chiave; pannello(ultimoStato); return }
  pdDaConfermare = ''
  try { const r = await chiedi('/api/drive/azione', { azione: azione, tipo: tipo || '', id: id || '' }); notaGlobale = (r && r.messaggio) || 'Fatto.' }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || e) }
  await leggiPannelloDrive(); pannello(ultimoStato)
}
function pdSpazioHtml() {
  const sp = pdDati.spazio
  let h = '<div class="sotto" style="margin-top:10px"><b>Spazio sul Drive</b>' + aiuto('spazio', 'Quanto occupa SierraDeck nella sua cartella privata del tuo Drive, per tipo, e lo spazio del tuo account Google. Le pulizie non cancellano subito: tengono i file 30 giorni nel recupero, «Annulla» li rimette. Una chat tolta che riprende a lavorare risale da sola.') + '</div>'
  if (!sp) return h + '<div class="sotto">Misuro il Drive…</div>'
  if (sp.errore) h += '<div class="sotto" style="color:var(--ambra,#e0a33c)">' + esc(sp.errore) + '</div>'
  const m = sp.misura
  if (m) {
    h += '<div class="sotto" style="margin-top:4px">SierraDeck usa <b>' + pdByte(m.totale.byte) + '</b> in ' + m.totale.file + ' file' + (m.quota ? ' · account: ' + pdByte(m.quota.usato) + (m.quota.limite ? ' di ' + pdByte(m.quota.limite) : '') : '') + (m.inRecupero.byte > 0 ? ' · nel recupero ' + pdByte(m.inRecupero.byte) : '') + '</div>'
    for (const t of PD_TIPI) { const v = m.perTipo[t[0]]; if (v && v.file > 0) h += '<div class="sotto">' + esc(t[1]) + ': ' + pdByte(v.byte) + ' · ' + v.file + ' file</div>' }
  }
  for (const p of sp.proposte || []) {
    const c = pdDaConfermare === 'spazio:spazio-pulisci:' + p.tipo
    h += '<div class="sotto" style="margin-top:6px"><b>' + esc(p.titolo) + '</b> · ' + esc(p.breve) + ' · libera ' + pdByte(p.byte) + aiuto('pulizia-' + p.tipo, p.spiega) + '</div><div class="riga"><button' + (c ? ' class="primario"' : '') + ' onclick="pdSpazio(\\'spazio-pulisci\\', \\'' + escJs(p.tipo) + '\\', \\'\\')">' + (c ? 'Tocca ancora: nel recupero' : 'Pulisci…') + '</button></div>'
  }
  if (m && (sp.proposte || []).length === 0) h += '<div class="sotto">Niente da pulire.</div>'
  for (const x of (sp.pulizie || []).filter((x) => !x.annullataIl && !x.svuotataIl)) {
    const c = pdDaConfermare === 'spazio:spazio-svuota:' + x.id
    h += '<div class="sotto" style="margin-top:6px"><b>' + esc(x.titolo) + '</b> · ' + x.voci.length + ' file, ' + pdByte(x.byte) + ' · nel recupero fino al ' + esc(pdQuando(x.scadeIl)) + '</div><div class="riga"><button onclick="pdSpazio(\\'spazio-annulla\\', \\'\\', \\'' + escJs(x.id) + '\\')">Annulla</button><button' + (c ? ' class="primario"' : '') + ' onclick="pdSpazio(\\'spazio-svuota\\', \\'\\', \\'' + escJs(x.id) + '\\')">' + (c ? 'Tocca ancora: cancella per sempre' : 'Svuota adesso…') + '</button></div>'
  }
  return h + '<div class="riga"><button onclick="pdSpazio(\\'spazio-misura\\', \\'\\', \\'\\')">Misura adesso</button></div>'
}
function pdQuando(iso) { if (!iso) return 'mai'; try { return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) } catch (e) { return iso } }
function pdStato(s) { return s === 'residente' ? '<span style="color:var(--verde,#3c9)">● residente</span>' : s === 'conflitto' ? '<span style="color:var(--ambra,#e0a33c)">● in conflitto</span>' : '<span class="sotto">● solo cloud</span>' }
function pdProblemi(r) {
  return (r.problemi || []).map((x) => '<div class="sotto" style="border-left:3px solid var(--ambra,#e0a33c);padding-left:6px;margin-top:4px"><b>' + esc(x.titolo) + '.</b> ' + esc(x.spiega) + ' <i>Cosa fare:</i> ' + esc(x.cosaFare) + '</div>').join('')
}
function pdFiltra(righe, progetti) {
  return righe.filter((r) => {
    if (!progetti && r.senzaNome && !pdSenzaNome) return false
    if (pdFiltro === 'sbagliati') return (r.problemi || []).length > 0
    if (pdFiltro === 'questo-pc') return r.residente && r.residente.qui
    if (pdFiltro === 'solo-cloud') return progetti ? !(r.cartellaQui || (r.residente && r.residente.qui)) : !(r.copiaQui || (r.residente && r.residente.qui))
    return true
  })
}
function pdScegliPc(progetto, sessione, attuale) {
  const tutti = [pdDati.io].concat(pdDati.pc)
  let h = '<select onchange="pdResidente(\\'' + escJs(progetto) + '\\', \\'' + escJs(sessione) + '\\', this.value)"><option value="">Rendi residente…</option>'
  for (const p of tutti) h += '<option value="' + esc(p.id) + '"' + (p.id === attuale ? ' disabled' : '') + '>' + esc(p.nome) + (p.id === pdDati.io.id ? ' (questo PC)' : '') + '</option>'
  h += '</select>'
  const chiave = pdDaConfermare.indexOf('residente:' + (progetto || sessione) + ':') === 0 ? pdDaConfermare : ''
  if (chiave) {
    const pcId = chiave.split(':').slice(2).join(':')
    const pc = tutti.find((x) => x.id === pcId)
    h += '<div class="sotto" style="margin-top:6px">' + esc(pc ? pc.nome : pcId) + ' diventa il residente: le chat lavorano lì, sugli altri PC si aprono dal vivo, e le copie degli altri PC vanno nella cartella di recupero a fine turno. Non si cancella niente; si torna indietro scegliendo di nuovo il PC di prima.' +
      (progetto ? ' Il progetto diventa «solo cloud» sugli altri PC: lì si toglie solo dopo il confronto con il residente e la tua conferma.' : '') +
      '</div><div class="riga"><button class="primario" onclick="pdResidente(\\'' + escJs(progetto) + '\\', \\'' + escJs(sessione) + '\\', \\'' + escJs(pcId) + '\\')">Conferma</button><button onclick="pdCambia(\\'filtro\\', pdFiltro)">Annulla</button></div>'
  }
  return h
}
// «Progetti» rifatto (0.69.0): «rifai il menu Progetti!! non si capisce nulla» (Nicholas, 12/10).
// Come sul PC: un elenco con lo stato in una parola, i gruppi, la ricerca e l'ordine; il tocco apre
// il dettaglio a tutto schermo. Lo stato, i gruppi e i testi li calcola il PC (r.vista).
var pdGruppo = 'tutti'
var pdQ = ''
var pdOrdine = 'stato'
var pdScelto = ''
var pdStrumento = ''
const PD_GRUPPI = [['questo-pc', 'Su questo PC'], ['altri-pc', 'Su altri PC'], ['da-sistemare', 'Da sistemare'], ['tutti', 'Tutti']]
const PD_ORDINI = [['stato', 'Stato'], ['nome', 'Nome'], ['chat', 'Chat'], ['spazio', 'Spazio']]
const PD_COLORE = { verde: 'var(--verde,#3c9)', ambra: 'var(--ambra,#e0a33c)', rosso: 'var(--rosso,#dc5f5f)', blu: 'var(--blu,#4aa3ff)' }
const PD_RANGO = { spostamento: 0, 'da-sistemare': 1, 'al-lavoro': 2, 'a-posto': 3 }
function pdPiano(t) { return String(t || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase() }
/** La vista di una riga: dal PC; da un PC di prima della 0.69 si ricava il minimo. */
function pdVistaDi(r) {
  if (r.vista) return r.vista
  const da = (r.problemi || []).length > 0
  const qui = r.residente ? r.residente.qui : r.cartellaQui
  return {
    stato: da ? { id: 'da-sistemare', parola: 'da sistemare', colore: 'ambra', ragione: (r.problemi[0].titolo || '').toLowerCase() } : { id: 'a-posto', parola: 'a posto', colore: 'verde' },
    gruppi: [qui ? 'questo-pc' : 'altri-pc'].concat(da ? ['da-sistemare'] : []),
    dove: r.residente ? (r.residente.qui ? 'Questo PC' : r.residente.nome) : '—', doveQui: !!(r.residente && r.residente.qui),
    copie: { testo: '', nomi: [] }, chat: { testo: String(r.chat - (r.chatSenzaNome || 0)), totali: r.chat - (r.chatSenzaNome || 0), alLavoro: 0 },
    spazio: r.spazioDrive ? { testo: pdByte(r.spazioDrive.byte), byte: r.spazioDrive.byte, avviso: r.spazioDrive.grandi.length > 0 } : { testo: '—', avviso: false }
  }
}
window.pdGruppoScegli = (g) => { pdGruppo = g; pdScelto = ''; pannello(ultimoStato) }
window.pdOrdina = (o) => { pdOrdine = o; pannello(ultimoStato) }
window.pdApri = (id) => { pdScelto = id; pdStrumento = ''; pdDaConfermare = ''; pannello(ultimoStato); window.scrollTo(0, 0) }
window.pdIndietro = () => { pdSpostaVerso = ''; pdScelto = ''; pdStrumento = ''; pdDaConfermare = ''; pannello(ultimoStato) }
window.pdStrumentoScegli = (s) => { pdStrumento = pdStrumento === s ? '' : s; pdScelto = ''; pannello(ultimoStato) }
// La ricerca nasconde le righe senza ridisegnare: il campo non perde il cursore.
window.pdCerca = (q) => {
  pdQ = q
  const parole = pdPiano(q).split(/\\s+/).filter(Boolean)
  for (const el of document.querySelectorAll('[data-pd-cerca]')) el.style.display = parole.every((p) => el.getAttribute('data-pd-cerca').indexOf(p) >= 0) ? '' : 'none'
}
function pdOrdinate(righe) {
  const k = (r) => {
    const v = pdVistaDi(r)
    if (pdOrdine === 'nome') return pdPiano(r.nome)
    if (pdOrdine === 'chat') return -v.chat.totali
    if (pdOrdine === 'spazio') return v.spazio.byte === undefined ? undefined : -v.spazio.byte
    return PD_RANGO[v.stato.id]
  }
  return righe.map((r, i) => ({ r: r, i: i, k: k(r) })).sort((a, b) => {
    if (a.k === undefined || b.k === undefined) return a.k === b.k ? a.i - b.i : a.k === undefined ? 1 : -1
    const c = typeof a.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'it')
    if (c !== 0) return c
    if (pdOrdine === 'stato') { const u = String(b.r.ultimoUso || '').localeCompare(String(a.r.ultimoUso || '')); if (u !== 0) return u }
    return a.i - b.i
  }).map((x) => x.r)
}
function pdPillola(v) {
  return '<span style="color:' + PD_COLORE[v.stato.colore] + ';white-space:nowrap">● ' + esc(v.stato.parola) + '</span>'
}
function pdElencoHtml() {
  const righe = pdDati.progetti.map((r) => ({ r: r, v: pdVistaDi(r) }))
  const conti = { 'questo-pc': 0, 'altri-pc': 0, 'da-sistemare': 0, tutti: righe.length }
  for (const x of righe) for (const g of x.v.gruppi) conti[g] = (conti[g] || 0) + 1
  if (pdGruppo === 'da-sistemare' && conti['da-sistemare'] === 0) pdGruppo = 'tutti'
  let h = '<div class="riga" style="flex-wrap:wrap;gap:6px;margin-top:6px">' +
    PD_GRUPPI.filter((g) => g[0] !== 'da-sistemare' || conti['da-sistemare'] > 0).map((g) => '<button' + (pdGruppo === g[0] ? ' class="primario"' : '') + ' onclick="pdGruppoScegli(\\'' + g[0] + '\\')" style="flex:none;width:auto;min-height:48px;padding:6px 12px;font-size:0.9375rem' + (g[0] === 'da-sistemare' ? ';color:var(--ambra,#e0a33c)' : '') + '">' + g[1] + ' ' + conti[g[0]] + '</button>').join('') + '</div>' +
    '<div class="riga" style="gap:6px"><input placeholder="Cerca progetto o PC" title="Cerca per progetto, PC o cartella" value="' + esc(pdQ) + '" oninput="pdCerca(this.value)" style="flex:1;min-width:0">' +
    '<select onchange="pdOrdina(this.value)" title="Ordina">' + PD_ORDINI.map((o) => '<option value="' + o[0] + '"' + (pdOrdine === o[0] ? ' selected' : '') + '>⇅ ' + o[1] + '</option>').join('') + '</select></div></div>'
  const scelte = pdOrdinate(righe.filter((x) => pdGruppo === 'tutti' || x.v.gruppi.indexOf(pdGruppo) >= 0).map((x) => x.r))
  if (scelte.length === 0) h += '<div class="piastrella"><div class="sotto">' + (pdGruppo === 'da-sistemare' ? '<span style="color:var(--verde,#3c9)">Tutto a posto</span>' : 'Nessun progetto in questo gruppo.') + '</div></div>'
  const parole = pdPiano(pdQ).split(/\\s+/).filter(Boolean)
  for (const r of scelte.slice(0, 300)) {
    const v = pdVistaDi(r)
    const cerca = pdPiano([r.nome, v.dove].concat(v.copie.nomi || [], (r.cartelle || []).map((c) => c.nome + ' ' + c.percorso)).join(' '))
    const sotto = v.stato.id === 'da-sistemare' && v.stato.ragione
      ? '<span style="color:var(--ambra,#e0a33c)">' + esc(v.stato.ragione) + '</span>'
      : esc(v.dove) + ' · ' + v.chat.totali + ' chat' + (v.chat.alLavoro > 0 ? ' · <span style="color:var(--blu,#4aa3ff)">' + v.chat.alLavoro + ' al lavoro</span>' : '') + (v.spazio.byte !== undefined ? ' · ' + esc(v.spazio.testo) + (v.spazio.avviso ? ' ⚠' : '') : '') + (v.stato.id === 'spostamento' && v.stato.ragione ? ' · ' + esc(v.stato.ragione) : '')
    h += '<div class="piastrella" data-pd-cerca="' + esc(cerca) + '" onclick="pdApri(\\'' + escJs(r.id) + '\\')" style="cursor:pointer' + (parole.length > 0 && !parole.every((p) => cerca.indexOf(p) >= 0) ? ';display:none' : '') + '">' +
      '<div style="display:flex;gap:8px;align-items:baseline"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.nome) + '</b>' + pdPillola(v) + '</div>' +
      '<div class="sotto">' + sotto + '</div></div>'
  }
  return h
}
// «Sposta su» (0.71.0): da qualsiasi PC verso qualsiasi PC, come sul PC. I PC di
// arrivo e la conferma li scrive il computer (r.spostaSu, con il riassunto).
var pdSpostaVerso = ''
function pdSpostaHtml(r, v) {
  const dest = r.spostaSu || []
  let h = '<div class="riga" style="gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap"><span class="sotto" style="flex:none">Dove vive: <b>' + esc(v.dove || (r.residente ? r.residente.nome : 'nessun PC')) + '</b></span>'
  if (dest.length > 1) {
    h += '<select aria-label="Sposta su" style="flex:1 1 140px;min-width:0;max-width:100%" onchange="pdSpostaScegli(this.value)"><option value="">Sposta su…</option>' +
      dest.map((x) => '<option value="' + esc(x.pc) + '"' + (x.attuale ? ' disabled' : '') + (pdSpostaVerso === x.pc ? ' selected' : '') + '>' + (x.acceso ? '● ' : '○ ') + esc(x.testo) + '</option>').join('') + '</select>'
  }
  h += aiuto('pd-sposta-' + r.id, 'Il progetto va a vivere sul PC che scegli: là girano le sue chat, gli altri le guardano dal vivo. Il trasloco gira sul PC di arrivo (la richiesta gli arriva per il ponte): confronta le copie, prende quello che c’è solo altrove, unisce, e solo alla fine mette le copie vecchie nel recupero. Lo segui qui passo per passo. Niente si cancella: «Annulla tutto» per 30 giorni.') + '</div>'
  const scelta = dest.find((x) => x.pc === pdSpostaVerso)
  if (scelta && scelta.riassunto) {
    const c = scelta.riassunto
    h += '<div class="piastrella" role="alertdialog" style="margin:6px 0"><b>' + esc(c.titolo) + '</b>' + c.righe.map((x) => '<div class="sotto">' + esc(x) + '</div>').join('') +
      (c.avviso ? '<div class="sotto" style="color:var(--ambra,#e0a33c)">⚠ ' + esc(c.avviso) + '</div>' : '') +
      '<div class="riga"><button class="primario" onclick="pdSpostaConferma()">' + esc(c.conferma) + '</button><button onclick="pdSpostaScegli(&quot;&quot;)">Annulla</button></div></div>'
  }
  return h
}
window.pdSpostaScegli = (pc) => { pdSpostaVerso = pc || ''; pannello(ultimoStato) }
window.pdSpostaConferma = async () => {
  const verso = pdSpostaVerso
  pdSpostaVerso = ''
  if (!verso || !pdScelto) return
  try { const r = await chiedi('/api/drive/azione', { azione: 'sposta-su', progetto: pdScelto, pc: verso }); notaGlobale = (r && r.messaggio) || 'Fatto.' }
  catch (e) { notaGlobale = 'Non è andata: ' + ((e && e.message) || e) }
  await leggiPannelloDrive(); pannello(ultimoStato); pdSegui()
}
function pdDettaglioHtml(r) {
  const v = pdVistaDi(r)
  const ids = r.ids || [r.id]
  let h = '<div class="riga" style="margin-top:6px"><button onclick="pdIndietro()">‹ Progetti</button></div>' +
    '<div class="titolo" style="margin-top:8px">' + esc(r.nome) + '</div>' +
    '<div style="margin:4px 0 6px"><span style="border:1px solid ' + PD_COLORE[v.stato.colore] + ';color:' + PD_COLORE[v.stato.colore] + ';border-radius:999px;padding:1px 8px;font-size:0.8125rem">' + esc(v.stato.parola) + (v.stato.ragione ? ' · ' + esc(v.stato.ragione) : '') + '</span></div>'
  h += pdSpostaHtml(r, v)
  // Le azioni in vista, prima di tutto: la principale piena, «Togli da questo PC» in rosso, ognuna con il «?».
  const pericolo = r.azioni.find((a) => a.id === 'solo-cloud-qui')
  const resto = r.azioni.filter((a) => a !== pericolo)
  const primaria = resto.find((a) => a.id === 'apri') || resto[0]
  const ordinate = (primaria ? [primaria] : []).concat(resto.filter((a) => a !== primaria), pericolo ? [pericolo] : [])
  if (ordinate.length > 0) {
    // Ogni tasto con il suo «?» accanto, sulla stessa riga.
    h += ordinate.map((a) => '<div class="riga" style="gap:6px;align-items:center"><button' + (a === primaria ? ' class="primario"' : '') + ' style="flex:1' + (a === pericolo ? ';color:var(--rosso,#dc5f5f);border-color:var(--rosso,#dc5f5f)' : '') + '" onclick="pdAzione(\\'' + a.id + '\\', \\'' + escJs(r.id) + '\\', ' + (a.conferma ? 'true' : 'false') + ')">' + esc(a.titolo) + '</button>' + aiuto('pd-az-' + a.id + '-' + r.id, esc(a.testo)) + '</div>').join('')
    for (const a of r.azioni) {
      if (pdDaConfermare === a.id + ':' + r.id + ':') h += '<div class="sotto" style="margin-top:6px">' + esc(a.testo) + '</div><div class="riga"><button class="primario"' + (a === pericolo ? ' style="background:var(--rosso,#dc5f5f)"' : '') + ' onclick="pdAzione(\\'' + a.id + '\\', \\'' + escJs(r.id) + '\\', true)">' + esc(a.conferma || a.titolo) + '</button><button onclick="pdIndietro();pdApri(\\'' + escJs(r.id) + '\\')">Annulla</button></div>'
    }
  }
  const res = (pdDati.residenza || []).find((x) => ids.indexOf(x.progetto) >= 0 && x.fase !== 'annullata')
  if (res && (res.fase === 'attesa-conferma' || res.fase === 'in-uso')) {
    h += '<div class="sotto" style="color:var(--ambra,#e0a33c);margin-top:8px"><b>Aspetta la tua conferma: unione delle copie</b>' + aiuto('pd-res-' + r.id, (res.riassunto ? res.riassunto.righe.map((x) => '• ' + esc(x)).join('<br>') : esc(res.messaggio))) + '</div>' +
      '<div class="riga"><button class="primario" onclick="pdAzione(\\'conferma-residenza\\', \\'' + escJs(r.id) + '\\', true)">' + (pdDaConfermare === 'conferma-residenza:' + r.id + ':' ? 'Tocca ancora: conferma' : 'Conferma') + '</button><button onclick="pdAzione(\\'annulla-residenza\\', \\'' + escJs(r.id) + '\\', false)">Annulla</button></div>'
  } else if (res) h += '<div class="sotto" style="margin-top:8px">' + esc(res.messaggio) + '</div>'
  const st = ((pdDati.rimozione || {}).stati || []).find((x) => ids.indexOf(x.progetto) >= 0)
  if (st) {
    h += '<div class="sotto" style="margin-top:8px"><b>Togliere da questo PC</b>' + aiuto('pd-rim-' + r.id, esc(st.messaggio)) + '</div>'
    if (st.fase === 'attesa-conferma' || st.fase === 'in-uso') h += '<div class="riga"><button class="primario" style="background:var(--rosso,#dc5f5f)" onclick="pdAzione(\\'conferma\\', \\'' + escJs(st.progetto) + '\\', false)">Togli da questo PC</button><button onclick="pdAzione(\\'annulla\\', \\'' + escJs(st.progetto) + '\\', false)">Annulla</button></div>'
  }
  if ((r.problemi || []).length > 0) {
    h += '<div class="sotto" style="margin-top:10px"><b>Da sistemare</b></div>'
    for (const x of r.problemi) h += '<div class="sotto" style="color:var(--ambra,#e0a33c)">' + esc(x.titolo) + aiuto('pd-pr-' + x.tipo + '-' + r.id, esc(x.spiega) + ' <b>Cosa fare:</b> ' + esc(x.cosaFare)) + '</div>'
  }
  const tras = (pdDati.traslochi || []).filter((t) => ids.indexOf(t.progetto) >= 0)
  if (tras.length > 0) { const tutti = pdDati.traslochi; pdDati.traslochi = tras; h += pdTraslochiHtml(); pdDati.traslochi = tutti }
  // Le chat (0.67.0): «Apri» qui, o «Guarda su <PC>» dal vivo dove vive; il pallino blu = al lavoro.
  const sue = (pdDati.chat || []).filter((c) => c.progetto && ids.indexOf(c.progetto) >= 0 && !c.senzaNome).sort((a, b) => String(b.ultimoUso || '').localeCompare(String(a.ultimoUso || '')))
  h += '<div class="sotto" style="margin-top:10px"><b>Chat (' + sue.length + ')</b>' + aiuto('pd-chat', 'Si aprono dove vivono: qui con la loro storia, o dal vivo sul PC residente. Pallino blu: sta lavorando.') + '</div>'
  if (sue.length === 0) h += '<div class="sotto">Nessuna chat con nome.</div>'
  for (const c of sue.slice(0, 30)) {
    const cr = c.residente
    const qui = !cr || cr.qui
    const cwd = qui ? (c.cwd || '') : (((r.cartelle || []).find((x) => x.pc === cr.pc) || {}).percorso || c.cwd || '')
    const lavora = (c.alLavoroSu || []).length > 0
    h += '<div class="riga" style="gap:6px;align-items:center"><span style="color:' + (lavora ? 'var(--blu,#4aa3ff)' : 'var(--testo-spento,#6f767e)') + '">●</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.titolo) + '</span>' +
      (cwd ? '<button onclick="pdApriChat(\\'' + escJs(c.sessione) + '\\', \\'' + escJs(cwd) + '\\', \\'' + escJs(qui ? '' : cr.pc) + '\\', \\'' + escJs(c.titolo) + '\\')">' + (qui ? 'Apri' : 'Guarda su ' + esc(cr.nome)) + '</button>' : '') + '</div>'
  }
  h += '<div class="sotto" style="margin-top:10px"><b>Cartelle</b></div>'
  for (const c of r.cartelle || []) h += '<div class="sotto"><b>' + esc(c.nome) + (c.pc === pdDati.io.id ? ' (qui)' : '') + '</b> ' + esc(c.percorso) + '</div>'
  if (r.cartellaTrovata) h += '<div class="sotto"><b>' + esc(pdDati.io.nome) + ' (qui, per nome)</b> ' + esc(r.cartellaTrovata) + '</div>'
  if ((r.cartelle || []).length === 0 && !r.cartellaTrovata) h += '<div class="sotto">Su nessun PC.</div>'
  h += '<div class="sotto" style="margin-top:10px"><b>Spazio sul Drive</b></div>'
  if (!r.spazioDrive) h += '<div class="sotto">Non ancora misurato.</div>'
  else {
    h += '<div class="sotto">' + esc(pdByte(r.spazioDrive.byte)) + ' in ' + r.spazioDrive.file + ' file</div>'
    for (const g of r.spazioDrive.grandi.slice().sort((a, b) => b.byte - a.byte).slice(0, 5)) h += '<div class="sotto" style="color:var(--ambra,#e0a33c)">⚠ ' + esc(g.percorso) + ' · ' + esc(pdByte(g.byte)) + '</div>'
  }
  const unioni = (pdDati.unioni || []).filter((u) => ids.indexOf(u.progetto) >= 0)
  if (unioni.length > 0) {
    h += '<div class="sotto" style="margin-top:10px"><b>Storia</b></div>'
    for (const u of unioni) h += '<div class="sotto">Unito il ' + esc(pdQuando(u.quando)) + ' · fino al ' + esc(pdQuando(u.scadeIl)) + '</div><div class="riga"><button onclick="pdAzione(\\'annulla-unione\\', \\'' + escJs(u.progetto) + '\\', true, \\'' + escJs(u.id) + '\\')">' + (pdDaConfermare === 'annulla-unione:' + u.progetto + ':' + u.id ? 'Tocca ancora: annulla l’unione' : 'Annulla l’unione') + '</button></div>'
  }
  return h + '</div>'
}
/** Gli strumenti rari, come «Strumenti ▾» sul PC: tutte le chat, spazio, recupero, spostamenti, piano. */
function pdStrumentiHtml() {
  const rim = pdDati.rimozione || { stati: [], inRecupero: [] }
  const inRec = (rim.inRecupero || []).filter((c) => !c.ripristinataIl)
  const voci = [['chat', 'Tutte le chat'], ['spazio', 'Spazio sul Drive']]
    .concat(inRec.length > 0 ? [['recupero', 'Cartelle in recupero (' + inRec.length + ')']] : [], (pdDati.traslochi || []).length > 0 ? [['traslochi', 'Spostamenti']] : [], pdDati.piano && pdDati.piano.azioni.length > 0 ? [['piano', 'Piano di allineamento']] : [])
  let h = '<div class="piastrella"><div class="sotto"><b>Strumenti</b></div><div class="riga" style="flex-wrap:wrap;gap:6px">' +
    voci.map((x) => '<button' + (pdStrumento === x[0] ? ' class="primario"' : '') + ' onclick="pdStrumentoScegli(\\'' + x[0] + '\\')">' + x[1] + '</button>').join('') + '</div>'
  if (pdStrumento === 'spazio') h += pdSpazioHtml()
  if (pdStrumento === 'traslochi') h += pdTraslochiHtml()
  if (pdStrumento === 'recupero') {
    for (const c of inRec) h += '<div class="sotto" style="margin-top:4px"><b>' + esc(c.nome) + '</b> · tolta il ' + esc(pdQuando(c.quando)) + ' · fino al ' + esc(pdQuando(c.scadeIl)) + '</div><div class="riga"><button onclick="pdAzione(\\'ripristina\\', \\'\\', true, \\'' + escJs(c.id) + '\\')">' + (pdDaConfermare === 'ripristina::' + c.id ? 'Tocca ancora: rimetti in ' + esc(c.percorsoOriginale) : 'Ripristina') + '</button></div>'
  }
  if (pdStrumento === 'piano') for (const a of pdDati.piano.azioni) h += '<div class="sotto" style="margin-top:4px">' + (a.tipo === 'porta-qui' ? '↓ ' : '☁ ') + esc(a.perche) + '</div>'
  if (pdStrumento === 'chat') {
    const righe = pdFiltra(pdDati.chat, false)
    h += '<div class="riga" style="flex-wrap:wrap">' + [['tutti', 'Tutte'], ['sbagliati', 'Da sistemare'], ['questo-pc', 'Su questo PC'], ['solo-cloud', 'Solo cloud']].map((f) => '<button' + (pdFiltro === f[0] ? ' class="primario"' : '') + ' onclick="pdCambia(\\'filtro\\', \\'' + f[0] + '\\')">' + f[1] + '</button>').join('') + '</div>'
    for (const r of righe.slice(0, 150)) {
      h += '<div style="margin-top:8px"><div><b>' + esc(r.titolo) + '</b> ' + pdStato(r.stato) + '</div>' +
        '<div class="sotto">' + (r.residente ? esc(r.residente.nome) + (r.residente.qui ? ' (questo PC)' : '') : 'senza casa') + ' · ' + esc(pdQuando(r.ultimoUso)) + '</div>' +
        pdProblemi(r) + pdScegliPc('', r.sessione, r.residente ? r.residente.pc : '') + '</div>'
    }
    if (righe.length > 150) h += '<div class="sotto">E altre ' + (righe.length - 150) + ': usa i filtri.</div>'
  }
  return h + '</div>'
}
function pannelloDriveHtml() {
  let h = '<div class="piastrella"><div class="titolo">Progetti' + aiuto('progetti', 'Ogni progetto vive su un PC (il residente): lì girano le sue chat; gli altri PC le guardano dal vivo. Stato: <span style="color:var(--verde,#3c9)">a posto</span>, <span style="color:var(--blu,#4aa3ff)">al lavoro</span>, <span style="color:var(--ambra,#e0a33c)">da sistemare</span> (con il motivo), <span style="color:var(--blu,#4aa3ff)">spostamento in corso</span>. Tocca un progetto per il dettaglio e le azioni. Niente si cancella: le copie tolte vanno nel recupero per 30 giorni.') + '</div>'
  if (pdErrore) return h + '<div class="sotto" style="color:var(--ambra,#e0a33c)">' + esc(pdErrore) + '</div></div>'
  if (!pdDati) return h + '<div class="sotto">Leggo…</div></div>'
  if ((pdDati.pcDaAggiornare || []).length > 0) h += '<div class="sotto" style="color:var(--ambra,#e0a33c);margin-top:6px">' + esc(pdDati.pcDaAggiornare.join(', ')) + (pdDati.pcDaAggiornare.length === 1 ? ': va aggiornato' : ': vanno aggiornati') + aiuto('pd-agg', 'Finché non è aggiornato, di quel PC si vedono solo le copie caricate sul Drive.') + '</div>'
  const scelto = pdScelto ? pdDati.progetti.find((r) => r.id === pdScelto) : undefined
  if (scelto) return h + pdDettaglioHtml(scelto)
  h += pdElencoHtml()
  h += pdStrumentiHtml()
  return h + '<div class="riga"><button onclick="leggiPannelloDrive().then(() => pannello(ultimoStato))">Aggiorna</button></div>'
}

/** Cambiare una preferenza: il computer la mescola con quelle che ha gia'. */
window.cambiaPref = async (nome, valore) => {
  const parziale = {}
  parziale[nome] = valore
  await chiedi('/api/preferenze', parziale)
  await leggiPreferenze()
  // I colori sono cambiati anche qui: la pagina si riveste subito, altrimenti
  // si vedrebbe il computer cambiato e il telefono no.
  await vestiti()
  pannello(ultimoStato)
}

window.leggiAggiornamento = async () => {
  try { aggiornamentoVisto = await chiedi('/api/aggiornamento') } catch (e) { aggiornamentoVisto = null }
}

/** L'ora dell'ultima ricerca chiesta da qui: se il PC e' gia' aggiornato, e' l'unico segno che il tasto ha fatto qualcosa. */
var cercatoAlle = ''
window.cercaAggiornamento = async () => {
  try {
    await chiedi('/api/aggiornamento/cerca', {})
    cercatoAlle = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    notaGlobale = 'Il computer non sa ancora cercare a comando: aggiornalo dal suo schermo.'
  }
  await leggiAggiornamento()
  pannello(ultimoStato)
}

window.scaricaAggiornamento = async () => {
  await chiedi('/api/aggiornamento/scarica', {})
  await leggiAggiornamento()
  pannello(ultimoStato)
}

/**
 * «Installa» dal telefono (0.39.0): prima le note di cosa cambia, le stesse
 * della finestra del PC, poi la conferma. Installare chiude il programma sul
 * computer con le chat aperte dentro: e' la cosa piu' invasiva che si possa
 * chiedere da qui, e si chiede dopo aver visto cosa cambia.
 */
/** «Salute del sistema» (0.44.0). */
async function leggiSalute() {
  saluteVista = null
  saluteErrore = ''
  try { saluteVista = await chiedi('/api/salute') } catch (e) { saluteErrore = 'Il computer non sa ancora dire la sua salute (arriva aggiornandolo alla 0.44.0), o non risponde: ' + (e && e.message ? e.message : e) }
}
window.rileggiSalute = async () => { await leggiSalute(); pannello(ultimoStato) }

window.installaAggiornamento = async () => {
  noteAgg = { leggo: true }
  pannello(ultimoStato)
  try {
    noteAgg = await chiedi('/api/aggiornamento/note')
  } catch (e) {
    noteAgg = { note: [], avviso: 'Non sono riuscito a leggere le note dal computer: le trovi scritte per esteso su https://github.com/niko9090/sierradeck/releases. Puoi installare lo stesso.' }
  }
  pannello(ultimoStato)
}
window.piuTardiAggiornamento = () => { noteAgg = null; pannello(ultimoStato) }
window.confermaInstalla = async () => {
  noteAgg = null
  await chiedi('/api/aggiornamento/installa', {})
  await leggiAggiornamento()
  pannello(ultimoStato)
}

window.rispondiVoce = async (id) => {
  const campo = document.getElementById('r-' + id)
  if (!campo || !campo.value.trim()) return
  try {
    await chiedi('/api/rispondi', { domanda: id, risposta: campo.value })
    domandeMandate['d:' + id] = campo.value.slice(0, 80)
  } catch (e) {
    notaGlobale = 'Non sono riuscito a mandare la risposta: ' + (e && e.message ? e.message : 'il computer non risponde')
  }
  pannello(ultimoStato)
}
window.apriConv = (chiave) => { domandaAperta = chiave; pannello(ultimoStato) }
window.rispondiOpzione = async (chiave, testo) => {
  const conv = (domandeConversazioni || []).find((c) => c.chiave === chiave)
  if (!conv) return
  const r = richiestaDi(conv.risposta, testo)
  try {
    await chiedi(r.percorso, r.corpo)
    domandeMandate[conv.chiave] = testo
  } catch (e) {
    notaGlobale = 'Non sono riuscito a mandarla: ' + (e && e.message ? e.message : 'il computer non risponde')
  }
  await leggiDomande()
}
window.rispondiConv = async (chiave) => {
  const conv = (domandeConversazioni || []).find((c) => c.chiave === chiave)
  const campo = document.getElementById('conv-testo')
  if (!conv || !campo || !campo.value.trim()) return
  const r = richiestaDi(conv.risposta, campo.value.trim())
  try {
    await chiedi(r.percorso, r.corpo)
    domandeMandate[conv.chiave] = campo.value.trim().slice(0, 200)
    campo.value = ''
  } catch (e) {
    notaGlobale = 'Non sono riuscito a mandarlo: ' + (e && e.message ? e.message : 'il computer non risponde')
  }
  await leggiDomande()
}
window.scegliIn = async (chat, testo) => {
  const voce = (domandeViste || []).find((v) => v.tipo === 'scelta' && v.chat === chat)
  try {
    var esito = await chiedi('/api/scegli', { chat: chat, opzione: testo })
    if (esito && esito.errore) notaGlobale = String(esito.errore).indexOf('mandata') >= 0 ? 'Gi\u00e0 mandata: aspetta che lo schermo cambi.' : String(esito.errore).indexOf('cambiata') >= 0 ? 'La scelta \u00e8 cambiata mentre toccavi: fra un attimo si aggiorna.' : String(esito.errore)
    else if (voce) domandeMandate[chiaveVoce(voce)] = testo
  } catch (e) {
    notaGlobale = 'Non sono riuscito a mandare la scelta: ' + (e && e.message ? e.message : 'il computer non risponde')
  }
  pannello(ultimoStato)
}
window.scriviIn = async (chat) => {
  const campo = document.getElementById('t-' + chat)
  if (!campo || !campo.value.trim()) return
  const voce = (domandeViste || []).find((v) => v.chat === chat)
  try {
    var esito = await chiedi('/api/scrivi', { chat: chat, testo: campo.value })
    // Una chat ferma su una scelta (0.52.5): il testo diventa la scelta, o il computer dice perché no.
    if (esito && esito.errore) { notaGlobale = String(esito.errore); pannello(ultimoStato); return }
    if (voce) domandeMandate[chiaveVoce(voce)] = esito && esito.comeScelta ? 'scelto: ' + esito.comeScelta : campo.value.slice(0, 80)
    campo.value = ''
  } catch (e) {
    notaGlobale = 'Non sono riuscito a mandarlo: ' + (e && e.message ? e.message : 'il computer non risponde')
  }
  pannello(ultimoStato)
}
window.rispondi = async (id) => {
  const campo = document.getElementById('r-' + id)
  if (!campo || !campo.value.trim()) return
  await chiedi('/api/rispondi', { domanda: id, risposta: campo.value })
  aggiorna()
}
window.scrivi = async (id) => {
  const campo = document.getElementById('t-' + id)
  if (!campo || !campo.value.trim()) return
  // Il campo si svuota **solo se e' partito**, e un guasto si dice: prima, se
  // la richiesta cadeva, non succedeva niente di visibile — si restava a
  // guardare un pulsante premuto senza sapere se il messaggio fosse andato.
  // Dalla 0.51.0 passa dalla coda: parte subito se la linea c'e', al ritorno
  // se e' caduta, con il suo id (il computer non lo scrive mai due volte).
  codaPagina.push({ id: nuovoIdMessaggio(), chat: id, testo: campo.value, stato: 'attesa' })
  campo.value = ''
  notaScelta = null
  ridisegnaLinea()
  await mandaCoda()
}
/**
 * Rispondere a un riquadro di scelta con un dito.
 *
 * Si manda **il testo** dell'opzione toccata, non la sua posizione: la
 * posizione la ricalcola il computer sullo schermo di adesso. Fra quando la
 * pagina ha letto le opzioni e quando il pollice arriva possono passare
 * secondi, e in quei secondi la domanda puo' essere cambiata — contare le
 * frecce sulla vecchia vorrebbe dire dare un permesso che nessuno ha dato.
 *
 * Se non torna piu', si dice e si rilegge: mai tirare a indovinare su una
 * scelta.
 */
window.scegli = async (testo) => {
  if (!dentro) return
  const chat = dentro
  // Sparisce subito: un pulsante che resta li' invita a premerlo due volte, e
  // il secondo tocco andrebbe a finire nella domanda dopo. E resta sparita
  // finche' lo schermo non cambia davvero.
  sceltaRisposta = { firma: firmaScelte(scelteDentro), quando: Date.now() }
  scelteDentro = null
  notaScelta = null
  pannello(ultimoStato)
  try {
    // **L'esito sta nel corpo, non in un'eccezione.** chiedi() solleva solo sul
    // 401: un 409 — «la scelta e' cambiata» — tornava indietro come un oggetto
    // con dentro errore, e il catch non scattava. Cioe' il messaggio giusto
    // non compariva **mai** nel caso per cui era stato scritto, e compariva
    // invece quando il computer non rispondeva, mandando a guardare lo schermo
    // per un guasto di rete.
    var esito = await chiedi('/api/scegli', { chat: chat, opzione: testo })
    if (esito && esito.errore) {
      notaScelta = String(esito.errore).indexOf('mandata') >= 0
        ? 'Già mandata: aspetta che lo schermo cambi.'
        : String(esito.errore).indexOf('cambiata') >= 0 ? 'La scelta è cambiata mentre toccavi: guarda di nuovo.'
        : String(esito.errore)
      // «Type something.»: la scelta resta, si scrive nel campo qui sotto.
      sceltaRisposta = null
    }
  } catch (e) {
    notaScelta = 'Non sono riuscito a mandarla: il computer non risponde.'
  }
  await leggiDentro()
  pannello(ultimoStato)
}
/**
 * Cambia destinazione.
 *
 * Ogni cambio lascia una traccia nella cronologia: senza, il tasto indietro di
 * Android **esce dall'app**, che da una WebView e' brutale — si perde quello
 * che si stava guardando per un gesto che tutti fanno per «torna su».
 */
window.apriAltro = (id) => { altroAperto = altroAperto === id ? null : id; pannello(ultimoStato) }

/**
 * Va in un posto nuovo (0.83.0): chiude quello che era aperto nella schermata
 * di prima e legge dal computer quello che la nuova mostra.
 */
function vaiAlPosto(nuovo) {
  const prima = posto
  posto = nuovo
  // Un pannello aperto appartiene alla schermata in cui e' stato aperto: se lo
  // si lascia aperto cambiando destinazione, ricompare dove non c'entra.
  pannelloAperto = null
  dentro = null
  dentroAp = null; apPc = null; apPcNome = ''; apDettaglio = null; apRiassunto = false
  // Anche il menu «altro» di una chat, la scheda del quaderno, la coda e il
  // PC aperti: restavano aperti e ricomparivano tornando, fuori contesto.
  altroAperto = null; schedaAperta = null; codaProgetto = null; pcAperto = null
  pdScelto = ''; pdStrumento = ''
  const entra = (cosa, quando) => { if (quando && JSON.stringify(prima) !== JSON.stringify(nuovo)) cosa() }
  const ridisegna = () => pannello(ultimoStato)
  // Si legge entrando, come prima con le sette destinazioni.
  entra(() => { domandeViste = null; leggiDomande() }, nuovo.voce === 'adesso' && prima.voce !== 'adesso')
  entra(() => { pdDati = null; pdErrore = ''; pdDaConfermare = ''; leggiPannelloDrive().then(ridisegna) }, inVista('progetti'))
  entra(() => { fileDove = null; fileElenco = null; fileVista = null; fileNota = ''; filePin = null; leggiFileProgetti().then(ridisegna) }, inVista('file'))
  entra(() => { driveRiavviato = false; leggiDrive().then(ridisegna) }, aperto('drive'))
  entra(() => { negozioNota = ''; leggiNegozio().then(() => { if (negozioFamiglia === 'mcp') negozioProvaMcp(); ridisegna() }) }, aperto('negozio'))
  entra(() => { leggiSalute().then(ridisegna) }, inVista('salute'))
  entra(() => { postaVoci = null; leggiPc().then(ridisegna) }, aperto('pc'))
  entra(() => { leggiConsumi().then(ridisegna) }, aperto('consumi'))
  entra(() => { Promise.all([leggiPreferenze(), leggiAggiornamento(), leggiQuadernoPersonale(), leggiAccount()]).then(ridisegna) }, inVista('impostazioni') || (nuovo.voce === 'altro' && prima.voce !== 'altro'))
  pannello(ultimoStato)
  window.scrollTo(0, 0)
}

/** Il tocco su una voce della fascia: sulla voce in cui sei già, torna al suo inizio. */
window.vaiVoce = (id) => vaiAlPosto(toccaVoce(posto, id))
window.vaiLinguetta = (i) => { if (i !== linguettaDi(posto)) vaiAlPosto(scegliLinguetta(posto, i)) }
window.apriSezione = (id) => vaiAlPosto(apriSezioneAltro(posto, id))
/** Le destinazioni di prima (domande, autopiloti, chat, file…): i salti da dentro la pagina. */
window.vaiScheda = (nome) => {
  const nuovo = versoDestinazione(posto, nome)
  if (JSON.stringify(nuovo) !== JSON.stringify(posto)) vaiAlPosto(nuovo)
}

/**
 * C'è qualcosa da chiudere con «indietro» prima di cambiare posto? I passi 1
 * e 2 della regola: il dialogo o il menu aperto, poi il dettaglio aperto.
 * Restituisce la funzione che lo chiude, o null.
 */
function daChiudere() {
  // 1. Il menu «⋯» di una chat o di un workspace, una conferma in corso.
  if (altroAperto) return () => { altroAperto = null }
  if (wsAperto) return () => { wsAperto = '' }
  if (confermando) return () => { confermando = null }
  // 2. Il dettaglio: la chat, l'autopilota, la scheda del quaderno, il file
  // guardato, la cartella (si risale di una), il progetto, la coda, il PC.
  if (dentro) return () => { window.chiudiDentro() }
  if (dentroAp) return () => { window.chiudiAp() }
  if (schedaAperta) return () => { schedaAperta = null }
  if (fileVista) return () => { window.fileChiudiVista() }
  if (filePin) return () => { window.fileProgettiTutti() }
  if (fileDove && inVista('file')) {
    const pezzi = (fileDove.percorso || '').split('/').filter((x) => x !== '')
    return pezzi.length > 0 ? () => { fileVai(fileDove.progetto, pezzi.slice(0, -1).join('/')) } : () => { window.fileProgettiTutti() }
  }
  if (pdScelto || pdStrumento) return () => { window.pdIndietro() }
  if (codaProgetto) return () => { window.chiudiCoda() }
  if (pcAperto) return () => { window.chiudiPc() }
  // Un pannello aperto a mano (Riprendi, Spazio delle chat, Quaderno…), non quello della linguetta.
  if (pannelloAperto && pannelliDelPosto(posto).indexOf(pannelloAperto) < 0) return () => { pannelloAperto = null }
  return null
}

/**
 * «Indietro» (0.83.0), uguale all'app in tutte e quattro le voci: 1. chiude il
 * dialogo o il menu, 2. il dettaglio, 3. torna all'elenco di Altro o alla
 * prima linguetta, 4. torna ad Adesso, 5. da Adesso esce.
 *
 * Il tasto indietro del telefono (e del browser) consuma una voce della
 * cronologia: davanti ce ne teniamo tante quanti sono i passi indietro
 * possibili, spinte **al tocco**. Chrome salta, con il tasto indietro, le
 * voci aggiunte senza un tocco: rimetterle dentro popstate farebbe uscire
 * dalla pagina al secondo indietro. Lì se ne rimette una solo se sono finite.
 * Da Adesso, con niente di aperto, non ne resta nessuna e indietro esce.
 */
var entrateIndietro = 0
var ignoraPopstate = false
/** Quanti indietro servono per uscire: le cose aperte, i livelli di cartella, i passi fino ad Adesso. */
function passiIndietro() {
  let n = [altroAperto || wsAperto || confermando, dentro, dentroAp, schedaAperta, fileVista, filePin, pdScelto || pdStrumento, codaProgetto, pcAperto,
    pannelloAperto && pannelliDelPosto(posto).indexOf(pannelloAperto) < 0].filter(Boolean).length
  if (fileDove && inVista('file')) n += (fileDove.percorso || '').split('/').filter((x) => x !== '').length + 1
  for (let p = indietroTelefono(posto); p; p = indietroTelefono(p)) n += 1
  return n
}
function armaIndietro() {
  const servono = passiIndietro()
  try {
    while (entrateIndietro < servono) { history.pushState({ sierradeck: 'indietro' }, ''); entrateIndietro += 1 }
    // Tornati ad Adesso con i tasti: le voci in più si tolgono, così indietro esce subito.
    if (servono === 0 && entrateIndietro > 0) { ignoraPopstate = true; history.go(-entrateIndietro); entrateIndietro = 0 }
  } catch (e) { /* niente cronologia, pazienza */ }
}
window.addEventListener('popstate', () => {
  if (ignoraPopstate) { ignoraPopstate = false; return }
  entrateIndietro = Math.max(0, entrateIndietro - 1)
  const chiudi = daChiudere()
  if (chiudi) {
    chiudi()
    pannello(ultimoStato)
  } else {
    const dove = indietroTelefono(posto)
    if (dove) vaiAlPosto(dove)
  }
  // Solo se le voci sono finite prima dei passi (una cartella aperta senza tocchi).
  if (entrateIndietro === 0 && passiIndietro() > 0) {
    try { history.pushState({ sierradeck: 'indietro' }, ''); entrateIndietro = 1 } catch (e) { /* pazienza */ }
  }
})

window.vaiA = async (nome) => { await chiedi('/api/workspace', { nome }); aggiorna() }
window.fermaAp = async (id) => { await chiediAp('/api/autopilota/ferma', { autopilota: id }); aggiorna() }
window.riprendiAp = async (id) => { await chiediAp('/api/autopilota/riprendi', { autopilota: id }); aggiorna() }
// Il via a chi si e' preparato: dal telefono come dal computer, perche' e' li'
// che si scopre di averlo pronto mentre si e' altrove.
window.vaiAp = async (id) => { await chiediAp('/api/autopilota/vai', { autopilota: id }); aggiorna() }

/**
 * Il codice arrivato inquadrando il QR.
 *
 * Sta dopo il cancelletto, quindi non e' mai uscito dal telefono: il server non
 * lo ha visto passare. Si consuma subito e si toglie dall'indirizzo, cosi' non
 * resta nella cronologia del browser.
 */
async function accoppiaDalQr() {
  // Il backslash va raddoppiato: questo testo vive dentro un template
  // JavaScript, e scritto una volta sola arriverebbe alla pagina come la
  // lettera «d» — la scansione del QR non accoppierebbe niente.
  const trovato = /codice=(\\d{6})/.exec(location.hash)
  if (!trovato) return false
  history.replaceState(null, '', location.pathname)
  const r = await fetch('/api/accoppia', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codice: trovato[1], nome: 'telefono' })
  })
  const dati = await r.json().catch(() => ({}))
  if (!dati.chiave) return false
  chiave = dati.chiave
  localStorage.setItem(CHIAVE, chiave)
  return true
}

/**
 * Disegna quello che c'e' da disegnare, qualunque cosa succeda.
 *
 * Il nero e' il peggior esito possibile: non dice se manca la rete, se la
 * chiave non vale piu' o se c'e' un difetto, e non lascia niente da premere.
 * Qui dentro **ogni** strada finisce con qualcosa a schermo - anche solo la
 * schermata di collegamento con scritto cosa non ha funzionato.
 */
/**
 * I colori del computer, addosso alla pagina.
 *
 * Non una tavolozza scritta qui dentro - che invecchierebbe da sola e
 * mostrerebbe un programma diverso da quello che hai davanti - ma la stessa,
 * con il chiarore e lo stile scelti nelle impostazioni.
 */
/**
 * Le misure del telefono, sugli stessi nomi del computer.
 *
 * I colori arrivano e si applicano come sono - verde e' verde, e il chiarore
 * che hai scelto vale per tutt'e due gli schermi. Le **misure** no: 10px di
 * serigrafia a braccio teso non si leggono, e senza puntatore serve piu' aria
 * fra le cose. Stessi nomi, valori rimappati: il foglio di stile resta scritto
 * in token e non sa niente di questa differenza.
 */
const MISURE = {
  banco: {
    '--t0': '0.75rem', '--t1': '0.8125rem', '--t2': '0.9375rem', '--t3': '1.0625rem', '--t4': '1.375rem',
    '--s1': '6px', '--s2': '12px', '--s3': '18px', '--s4': '28px'
  },
  // Il Foglio sale con lo stesso rapporto: la sua gerarchia e' il testo, non
  // avendo ne' rilievi ne' solchi, e comprimerla lo renderebbe illeggibile.
  foglio: {
    '--t0': '0.75rem', '--t1': '0.875rem', '--t2': '1rem', '--t3': '1.1875rem', '--t4': '1.625rem',
    '--s1': '6px', '--s2': '12px', '--s3': '18px', '--s4': '28px'
  }
}

async function vestiti() {
  try {
    const s = await chiedi('/api/stile')
    for (const nome in (s.token || {})) {
      document.documentElement.style.setProperty(nome, s.token[nome])
    }
    // Le misure del telefono **dopo** quelle del computer, sugli stessi nomi.
    // Il raggio no: quello arriva come arriva, perche' l'identita' non si
    // adatta - ed e' il token che fa la differenza fra un banco e un modulo.
    const mie = MISURE[s.stile === 'foglio' ? 'foglio' : 'banco']
    for (const nome in mie) document.documentElement.style.setProperty(nome, mie[nome])
  } catch (e) {
    // Senza risposta restano i colori di ripiego: identici a quelli del banco.
  }
}

/**
 * Il permesso di avvisare, chiesto quando serve davvero.
 *
 * Nel browser una notifica arriva solo se la pagina e' aperta - per gli avvisi
 * ad app chiusa c'e' l'app Android, che ha una guardia sua - ma anche cosi'
 * cambia tutto: il telefono sul tavolo che si illumina mentre guardi altrove.
 */
/**
 * Non si chiede piu' niente all'apertura.
 *
 * Il permesso di avvisare lo chiede avvisaSeServe, alla prima domanda vera:
 * la richiesta arriva quando c'e' un motivo per accettarla, e non come dazio
 * d'ingresso di una pagina appena aperta.
 */
function chiediDiAvvisare() { }

/** Gli avvisi gia' dati: la stessa domanda non si annuncia due volte. */
var avvisati = {}
/** Al primo stato non si annuncia niente: e' il passato, non una novita'. */
var primoAvviso = true
/** Quando si è mostrato l'ultimo avviso (0.80.0): quelli vicini si raggruppano. */
var ultimoAvvisoIl = undefined

/**
 * Avvisa quando l'autopilota ha bisogno di te.
 *
 * Le stesse due cose che annuncia l'app Android: una domanda che aspetta, e un
 * lavoro che si e' fermato. Non «sta lavorando», che non richiede niente a
 * nessuno - un avviso che non chiede niente insegna a ignorare quelli che
 * chiedono.
 */
/** Una chat che ha finito il turno avvisa solo se aspetta te da almeno tanto (0.74.0). */
var ATTESA_CHAT_MS = 3 * 60000
function avvisaSeServe(stato) {
  try {
    if (typeof Notification === 'undefined') return
    // Il permesso si chiede alla **prima domanda vera**, non al primo disegno.
    // Chiederlo appena aperta la pagina significa chiederlo prima che esista un
    // motivo per dire di si' - e chi dice di no, dice di no per sempre.
    if (Notification.permission === 'default' && (stato.domande || []).length > 0) {
      Notification.requestPermission()
      return
    }
    if (Notification.permission !== 'granted') return
    const nuovo = !primoAvviso
    const ora = Date.now()
    // 0.80.0: si raccoglie, poi avvisiDaMostrare raggruppa quelli vicini e
    // ognuno mostrato va nel registro del computer.
    const nuovi = []
    // Una domanda già aperta quando si apre la pagina si vede nella pagina:
    // non si riannuncia a ogni ricarica (0.80.0).
    for (const d of (stato.domande || [])) {
      if (avvisati['d-' + d.id]) continue
      avvisati['d-' + d.id] = true
      if (nuovo) nuovi.push({ tipo: 'domanda', titolo: 'SierraDeck ti sta chiedendo una cosa', corpo: d.testo, tag: d.id, causa: 'domanda ' + (d.autopilotaId || d.id) + ': ' + String(d.testo || '').slice(0, 60) })
    }
    for (const c of (stato.chat || [])) {
      // Una chat ferma su una scelta (un permesso): e' una domanda a tutti gli
      // effetti, e fino alla 0.34 non si annunciava. Anche per le governate,
      // come nell'app: l'autopilota non concede permessi al posto tuo. Una
      // scelta che va e viene in meno di un minuto si annuncia una volta
      // (0.80.0, sceltaDaAnnunciare): ogni ritorno era una notifica nuova.
      const r = sceltaDaAnnunciare(c.chiede === true, avvisati['k-' + c.id], ora)
      if (r.visto === undefined) delete avvisati['k-' + c.id]
      else avvisati['k-' + c.id] = r.visto
      // Una per chat (0.74.0): la stessa etichetta della sua attesa, così si sostituiscono.
      if (r.annuncia && nuovo) nuovi.push({ tipo: 'scelta', titolo: (c.titolo || 'Una chat') + ' aspetta che tu scelga', corpo: 'Sullo schermo c’è un elenco di scelte: rispondi da Adesso.', tag: 'chat-' + c.id, causa: 'la chat ' + c.id + ' è ferma su una scelta' + (c.governata === true ? ' (governata da un autopilota)' : '') })
    }
    // Il servizio degli autopiloti non ha risposto: l'elenco vuoto non vuol
    // dire «nessuno», e non si deve ne' dimenticare ne' riannunciare niente.
    for (const a of (stato.autopilotiLetti === false ? [] : (stato.autopiloti || []))) {
      // Un annuncio del programma (0.81.0, il riepilogo di «Errori arrivati»): una volta per id.
      if (a.annuncio && a.annuncio.id && !avvisati['n-' + a.annuncio.id]) {
        avvisati['n-' + a.annuncio.id] = true
        if (nuovo && a.archiviato !== true) nuovi.push({ tipo: 'annuncio', titolo: a.annuncio.titolo || a.nome, corpo: 'Il riepilogo è nella conversazione di «' + a.nome + '».', tag: 'n-' + a.id, causa: 'annuncio ' + a.annuncio.id + ' di «' + a.nome + '»: un riepilogo che aspetta te' })
      }
      if (a.stato === 'pronto') {
        if (avvisati['p-' + a.id]) continue
        avvisati['p-' + a.id] = true
        if (nuovo) nuovi.push({ tipo: 'pronto', titolo: a.nome + ' aspetta il tuo via', corpo: 'Ha letto il progetto e capito l’obiettivo: apri Lavori e premi «Vai».', tag: a.id, causa: 'autopilota ' + a.id + ' pronto, aspetta il via' })
        continue
      }
      // Chi riparte torna annunciabile: se si ferma di nuovo e' una notizia.
      if (a.stato !== 'sospeso' && a.stato !== 'fallito' && a.stato !== 'finito') { delete avvisati['f-' + a.id + 'finito']; continue }
      // Un fermo si annuncia **una volta**, con la sua chiave (id, momento,
      // motivo: 0.37.0); uno nuovo ha una chiave nuova. Un archiviato tace.
      const chiaveF = a.stato === 'finito' ? 'f-' + a.id + 'finito' : 'f-' + (a.fermo || (a.id + a.stato))
      // Un fermo che riparte da solo (limiti del piano, aggiornamento) non chiede niente a te (0.81.0).
      // Non si segna come visto: se poi resta fermo davvero, con la stessa chiave, si annuncia.
      if (a.stato !== 'finito' && a.riparteDaSolo === true) continue
      if (avvisati[chiaveF]) continue
      avvisati[chiaveF] = true
      if (!nuovo || a.archiviato === true) continue
      if (a.stato === 'finito') nuovi.push({ tipo: 'finito', titolo: a.nome + ' ha finito', corpo: 'Il lavoro è concluso: puoi guardare il risultato.', tag: a.id, causa: 'autopilota ' + a.id + ' finito' })
      else nuovi.push({ tipo: 'fermo', titolo: a.nome + ' si è fermato', corpo: a.motivo || 'Serve una tua occhiata.', tag: a.id, causa: 'autopilota ' + a.id + ' ' + a.stato + ': ' + (a.motivo || 'senza motivo') })
    }
    // Una chat tua che aspetta te: solo dopo ATTESA_CHAT_MS (0.74.0, come
    // l'app). Le pause brevi fra un turno e l'altro erano la maggior parte
    // degli avvisi, e non chiedevano niente. Finché resta ferma non si ripete.
    for (const c of (stato.chat || [])) {
      const chiaveChat = 'a-' + c.id
      if (c.aspetta === true && c.governata !== true && !c.chiede) {
        if (avvisati[chiaveChat]) continue
        if (!avvisati['t-' + c.id]) avvisati['t-' + c.id] = ora
        if (ora - avvisati['t-' + c.id] < ATTESA_CHAT_MS) continue
        avvisati[chiaveChat] = true
        if (nuovo) nuovi.push({ tipo: 'aspetta', titolo: (c.titolo || 'Una chat') + ' ha finito il turno', corpo: 'Ferma da ' + Math.round((ora - avvisati['t-' + c.id]) / 60000) + ' min. ' + (c.ultimaRiga || 'Ha finito di scrivere.'), tag: 'chat-' + c.id, causa: 'la chat ' + c.id + ' ha finito il turno e aspetta da ' + Math.round((ora - avvisati['t-' + c.id]) / 60000) + ' min' })
      } else {
        delete avvisati[chiaveChat]
        delete avvisati['t-' + c.id]
      }
    }
    // La versione pronta non è più una notifica (0.81.0): solo domande che
    // aspettano te, lavori finiti ed errori che bloccano. La banda nella pagina resta.
    // Vicini = uno solo (0.80.0); ognuno mostrato nel registro del computer.
    // Nel registro va ogni avviso, anche dentro un gruppo, con la sua causa (0.81.0).
    for (const m of avvisiDaMostrare(nuovi, ultimoAvvisoIl, ora)) {
      new Notification(m.titolo, { body: m.corpo, tag: m.tag })
      ultimoAvvisoIl = ora
    }
    for (const n of nuovi) {
      chiedi('/api/avviso-mostrato', { da: 'pagina', tipo: n.tipo, titolo: n.titolo, causa: n.causa, gruppo: nuovi.length > 1 ? nuovi.length : undefined }).catch(function () { })
    }
    primoAvviso = false
  } catch (e) { }
}

/*
 * Il collegamento con il computer (0.51.0). La stessa macchina degli stati
 * del PC e dell'app (src/shared/collegamento.ts: i test le confrontano):
 * keepalive ogni due secondi con un tempo massimo di sei, attese crescenti
 * 1, 2, 5, 10, 30 secondi dopo una caduta (mai una resa), la qualita' dalle
 * ultime chiamate, la storia delle cadute e dei ritorni, e la coda di
 * quello che scrivi a linea giu': parte al ritorno, una volta sola (id per
 * messaggio, che il computer ricorda).
 */
const ATTESE_LINEA = [1000, 2000, 5000, 10000, 30000]
const KEEPALIVE_MS = 2000
const SCADE_MS = 6000
function attesaPrima(n) { return ATTESE_LINEA[Math.max(0, Math.min(n - 1, ATTESE_LINEA.length - 1))] }
var linea = { fase: 'cerco', tentativo: 0, misure: [], storia: [] }
var ultimaChiesta = 0
var inVolo = false
var storiaLineaAperta = false
var firmaLineaVista = ''
// «Linea lenta» prima di «non connesso» (0.56.0): giù solo dopo 20 s senza
// nessun dato e 3 fallimenti di fila; da giù si torna verdi con 2 risposte.
const LENTA_DOPO_MS = 8000
const GIU_DOPO_MS = 20000
const GIU_DOPO_FALLITI = 3
const TORNA_DOPO_OK = 2
function passoLinea(l, e) {
  if (e.tipo === 'riprova-adesso') return l.fase === 'ricollego' ? Object.assign({}, l, { prossimoIl: e.il }) : l
  const misura = (ok) => l.misure.concat([ok ? { ok: true, ritardoMs: Math.max(0, Math.round(e.ritardoMs)), il: e.il } : { ok: false, il: e.il }]).slice(-12)
  if (e.tipo === 'ok') {
    const okDiFila = (l.okDiFila || 0) + 1
    if (l.fase === 'ricollego' && okDiFila < TORNA_DOPO_OK) {
      return Object.assign({}, l, { fase: 'lenta', ultimoOk: e.il, falliti: 0, okDiFila: okDiFila, prossimoIl: undefined, misure: misura(true) })
    }
    let storia = l.storia
    if (l.cadutaIl !== undefined) storia = storia.concat([{ tipo: 'tornato', il: e.il, dopoMs: e.il - l.cadutaIl, tentativi: l.tentativo }])
    else if (l.fase === 'cerco') storia = storia.concat([{ tipo: 'collegato', il: e.il }])
    return { fase: 'collegato', tentativo: 0, misure: misura(true), storia: storia.slice(-30), ultimoOk: e.il, falliti: 0, okDiFila: okDiFila }
  }
  const falliti = (l.falliti || 0) + 1
  if (l.fase !== 'ricollego' && l.ultimoOk !== undefined && (falliti < GIU_DOPO_FALLITI || e.il - l.ultimoOk < GIU_DOPO_MS)) {
    return Object.assign({}, l, { fase: 'lenta', falliti: falliti, okDiFila: 0, motivo: e.motivo, messaggio: e.messaggio === undefined ? l.messaggio : e.messaggio, misure: misura(false) })
  }
  const tentativo = l.fase === 'ricollego' ? l.tentativo + 1 : 1
  const storia = l.fase === 'ricollego' ? l.storia : l.storia.concat([{ tipo: 'caduta', il: e.il, motivo: e.motivo, messaggio: e.messaggio }]).slice(-30)
  return {
    fase: 'ricollego', tentativo: tentativo, storia: storia, misure: misura(false), falliti: falliti, okDiFila: 0, ultimoOk: l.ultimoOk,
    cadutaIl: l.fase === 'ricollego' ? (l.cadutaIl === undefined ? e.il : l.cadutaIl) : (l.ultimoOk === undefined ? e.il : l.ultimoOk),
    prossimoIl: e.il + attesaPrima(tentativo), motivo: e.motivo, messaggio: e.messaggio
  }
}
/** La fase da mostrare: collegati ma muti da 8 s è «linea lenta» (come faseVista del PC). */
function faseVistaLinea(l, adesso) {
  return l.fase === 'collegato' && l.ultimoOk !== undefined && adesso - l.ultimoOk >= LENTA_DOPO_MS ? 'lenta' : l.fase
}
function qualitaLinea(misure) {
  const ultime = misure.slice(-12)
  if (ultime.length === 0) return { tacche: 0, perdite: 0, parola: 'non ancora misurata' }
  const riuscite = ultime.filter((m) => m.ok && m.ritardoMs !== undefined).map((m) => m.ritardoMs).sort((a, b) => a - b)
  const perdite = (ultime.length - ultime.filter((m) => m.ok).length) / ultime.length
  if (riuscite.length === 0) return { tacche: 0, perdite: perdite, parola: 'non arriva niente' }
  const meta = Math.floor(riuscite.length / 2)
  const ritardoMs = Math.round(riuscite.length % 2 === 1 ? riuscite[meta] : (riuscite[meta - 1] + riuscite[meta]) / 2)
  let tacche = ritardoMs < 150 ? 4 : ritardoMs < 400 ? 3 : ritardoMs < 1000 ? 2 : 1
  if (perdite > 0) tacche -= 1
  if (perdite > 0.25) tacche -= 1
  tacche = Math.max(1, Math.min(4, tacche))
  return { tacche: tacche, ritardoMs: ritardoMs, perdite: perdite, parola: tacche === 4 ? 'ottima' : tacche === 3 ? 'buona' : tacche === 2 ? 'incerta' : 'debole' }
}
function eOraLinea(l, ultima, adesso) {
  if (l.fase === 'ricollego') return adesso >= (l.prossimoIl || 0)
  return adesso - ultima >= KEEPALIVE_MS
}
function fraSecondiLinea(l, adesso) { return l.prossimoIl === undefined ? 0 : Math.max(0, Math.ceil((l.prossimoIl - adesso) / 1000)) }
function oraBreve(il) { const d = new Date(il); const due = (x) => String(x).padStart(2, '0'); return due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds()) }
function durataBreve(ms) { const s = Math.round(ms / 1000); return s < 90 ? s + ' s' : Math.round(s / 60) + ' min' }
function rigaStoriaLinea(e) {
  if (e.tipo === 'collegato') return oraBreve(e.il) + ' · collegato'
  if (e.tipo === 'caduta') return oraBreve(e.il) + ' · caduta: ' + (e.messaggio || e.motivo)
  if (e.tipo === 'tornato') return oraBreve(e.il) + ' · tornato dopo ' + durataBreve(e.dopoMs) + ' e ' + e.tentativi + (e.tentativi === 1 ? ' tentativo' : ' tentativi')
  return oraBreve(e.il) + ' · ' + e.tipo
}
/** Quello che cambia a schermo: se cambia, si ridisegna anche senza dati nuovi. */
function firmaLinea() {
  const q = qualitaLinea(linea.misure)
  return linea.fase + '|' + linea.tentativo + '|' + fraSecondiLinea(linea, Date.now()) + '|' + q.tacche + '|' + codaPagina.map((v) => v.id + v.stato).join(',') + '|' + storiaLineaAperta + '|' + tentativiVisibili(vistaTentativi())
}
function ridisegnaLinea() {
  const f = firmaLinea()
  if (f === firmaLineaVista) return
  firmaLineaVista = f
  ultimaImpronta = ''
  pannello(ultimoStato)
}
window.riprovaLinea = () => { linea = passoLinea(linea, { tipo: 'riprova-adesso', il: Date.now() }); ridisegnaLinea() }
window.apriStoriaLinea = () => { storiaLineaAperta = !storiaLineaAperta; ridisegnaLinea() }
/* «Mi collego a…» (0.52.1): i passi dei tentativi, copia di passiCollegamento e eventiDaLinea. */
const STRADE_TENTATIVI = ['lan', 'tailscale', 'webrtc', 'drive']
var inizioPagina = Date.now()
function nomeTentativo(s) { return s === 'lan' ? 'rete di casa' : s === 'tailscale' ? 'Tailscale' : s === 'webrtc' ? 'WebRTC / ponte' : s === 'drive' ? 'Drive (lento)' : s }
function iconaTentativo(s) { return s === 'lan' ? '🏠' : s === 'tailscale' ? '🔐' : s === 'webrtc' ? '🌐' : s === 'drive' ? '☁️' : '…' }
function passiCollegamento(nomePc, eventi) {
  const passi = STRADE_TENTATIVI.map((s) => ({ strada: s, nome: nomeTentativo(s), icona: iconaTentativo(s), stato: 'attesa' }))
  const di = (s) => passi.find((p) => p.strada === s)
  let fase = 'provo'
  let strada
  let ritardoMs
  let motivo
  for (const e of eventi) {
    if (e.tipo === 'provo') {
      for (const p of passi) if (p.stato === 'provo' && p.strada !== e.strada) { p.stato = 'fallita'; p.motivo = 'non ha risposto' }
      const p = di(e.strada)
      if (p !== undefined) { p.stato = 'provo'; delete p.motivo }
      fase = 'provo'
    } else if (e.tipo === 'fallita' || e.tipo === 'salta') {
      const p = di(e.strada)
      if (p !== undefined) { p.stato = e.tipo === 'fallita' ? 'fallita' : 'salta'; p.motivo = e.motivo }
    } else if (e.tipo === 'riuscita') {
      const i = passi.findIndex((p) => p.strada === e.strada)
      passi.forEach((p, j) => {
        if (j === i) { p.stato = 'ok'; p.ms = e.ritardoMs; delete p.motivo; return }
        if (j < i && (p.stato === 'attesa' || p.stato === 'provo')) { p.stato = p.stato === 'provo' ? 'fallita' : 'salta'; p.motivo = p.stato === 'fallita' ? 'non ha risposto' : 'non provata' }
        if (j > i && p.stato === 'attesa') { p.stato = 'inutile'; p.motivo = 'non serve' }
      })
      fase = 'collegato'; strada = e.strada; ritardoMs = e.ritardoMs; motivo = undefined
    } else {
      for (const p of passi) {
        if (p.stato === 'provo') { p.stato = 'fallita'; p.motivo = 'non ha risposto' }
        if (p.stato === 'attesa') { p.stato = 'salta'; p.motivo = 'non disponibile' }
      }
      fase = 'fallito'; motivo = e.motivo
    }
  }
  const ora = passi.find((p) => p.stato === 'provo')
  const titolo = fase === 'collegato' ? 'Collegato a ' + nomePc : fase === 'fallito' ? 'Non riesco a collegarmi a ' + nomePc : 'Mi collego a ' + nomePc + '…'
  const sotto = fase === 'collegato'
    ? nomeTentativo(strada === undefined ? '' : strada) + ' · ' + (ritardoMs === undefined ? 0 : ritardoMs) + ' ms'
    : fase === 'fallito'
      ? (motivo === undefined ? 'nessuna strada ha risposto' : motivo)
      : ora !== undefined ? 'provo ' + ora.nome : 'cerco la strada'
  const fuori = { fase: fase, titolo: titolo, sotto: sotto, passi: passi }
  if (strada !== undefined) fuori.strada = strada
  if (ritardoMs !== undefined) fuori.ritardoMs = ritardoMs
  if (motivo !== undefined) fuori.motivo = motivo
  return fuori
}
function eventiDaLinea(l, inizio) {
  const fuori = [{ tipo: 'provo', strada: 'lan', il: inizio }]
  const primo = l.storia.find((e) => e.tipo === 'collegato' || e.tipo === 'tornato')
  const misura = l.misure.find((m) => m.ok)
  if (primo === undefined && l.motivo === 'collegando') {
    fuori.push({ tipo: 'fallita', strada: 'lan', il: l.cadutaIl === undefined ? inizio : l.cadutaIl, motivo: 'non risponde' })
    fuori.push({ tipo: 'fallita', strada: 'tailscale', il: l.cadutaIl === undefined ? inizio : l.cadutaIl, motivo: 'non risponde' })
    fuori.push({ tipo: 'provo', strada: 'webrtc', il: l.cadutaIl === undefined ? inizio : l.cadutaIl })
    return fuori
  }
  if (primo !== undefined) {
    fuori.push({ tipo: 'riuscita', strada: primo.strada === undefined ? 'lan' : primo.strada, il: primo.il, ritardoMs: misura === undefined || misura.ritardoMs === undefined ? 0 : misura.ritardoMs })
    return fuori
  }
  if (l.fase === 'ricollego') fuori.push({ tipo: 'fallito', il: l.cadutaIl === undefined ? inizio : l.cadutaIl, motivo: l.messaggio || l.motivo || 'non risponde' })
  return fuori
}
/** La strada di questa pagina, dall'indirizzo con cui è aperta: solo intervalli standard. */
function stradaPagina(host) {
  const p = String(host || '').split('.').map((x) => Number.parseInt(x, 10))
  if (p.length !== 4 || p.some((x) => Number.isNaN(x))) return undefined
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return 'tailscale'
  if (p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || p[0] === 127) return 'lan'
  return undefined
}
function rovesciaLinea(l, adesso) {
  if (l.fase !== 'ricollego') return undefined
  const s = fraSecondiLinea(l, adesso)
  return { testo: s > 0 ? 'riprovo fra ' + s + ' s' : 'riprovo adesso', colore: l.tentativo <= 2 ? 'ambra' : 'rosso' }
}
function vistaTentativi() {
  const nome = (ultimoStato && nomeDaMostrare(ultimoStato.computer)) || 'il computer'
  const strada = stradaPagina(location.hostname)
  const eventi = eventiDaLinea(linea, inizioPagina).map((e) => (e.tipo === 'riuscita' && strada !== undefined && e.strada === 'lan' ? Object.assign({}, e, { strada: strada }) : e))
  return passiCollegamento(nome, eventi)
}
function tentativiVisibili(v) {
  if (v.fase !== 'collegato') return true
  const primo = linea.storia.find((e) => e.tipo === 'collegato' || e.tipo === 'tornato')
  return primo !== undefined && Date.now() - primo.il < 2500
}
function tentativiHtml() {
  const v = vistaTentativi()
  if (!tentativiVisibili(v)) return ''
  const segno = (s) => (s === 'ok' ? '✓' : s === 'fallita' ? '✗' : s === 'provo' ? '●' : s === 'attesa' ? '○' : '–')
  const colore = v.fase === 'collegato' ? 'var(--verde)' : v.fase === 'fallito' ? '#dc5f5f' : 'inherit'
  return '<div class="piastrella"><div class="titolo" style="color:' + colore + '">' + esc(v.titolo) + '</div><div class="sotto">' + esc(v.sotto) + '</div>' +
    v.passi.map((p) => '<div class="sotto"' + (p.stato === 'provo' ? ' style="animation:pulsa 1.1s ease-in-out infinite"' : '') + '>' + segno(p.stato) + ' ' + p.icona + ' ' + esc(p.nome) +
      (p.ms !== undefined ? ' · ' + p.ms + ' ms' : p.motivo !== undefined ? ' · ' + esc(p.motivo) : p.stato === 'provo' ? ' · provo…' : '') + '</div>').join('') +
    (v.fase === 'fallito' ? '<div class="sotto">Controlla che il computer sia acceso con SierraDeck aperto e che il telefono sia sulla stessa rete o su Tailscale. Riprovo da solo con attese crescenti.</div><div class="riga"><button onclick="riprovaLinea()">Riprova</button></div>' : '') +
    '</div>'
}
function lineaHtml() {
  const q = qualitaLinea(linea.misure)
  const giu = linea.fase === 'ricollego'
  // «Linea lenta» (0.56.0): qualcosa non arriva, ma non è caduta. Giallo, senza la fascia rossa.
  // 0.80.0: «linea ottima/buona», non «collegamento ottima» (le parole sono femminili).
  const lenta = !giu && faseVistaLinea(linea, Date.now()) === 'lenta'
  const tacche = ['▂', '▄', '▆', '█'].map((c, i) => '<span style="opacity:' + (i < (giu ? 0 : q.tacche) ? 1 : 0.25) + '">' + c + '</span>').join('')
  const rov = rovesciaLinea(linea, Date.now())
  let h = tentativiHtml() + '<div class="linea-pagina' + (giu ? ' linea-pagina--giu linea-pagina--' + rov.colore : '') + '" onclick="apriStoriaLinea()" title="Il collegamento con il computer: le tacche dicono la qualità delle ultime chiamate, il numero il ritardo tipico. Tocca per la storia.">' +
    '📶 ' + tacche + ' ' + (giu ? 'giù · ' + rov.testo : q.ritardoMs !== undefined ? q.ritardoMs + ' ms' : '…') + ' · ' + (giu ? 'non connesso' : lenta ? '<span style="color:#e0a33c">linea lenta</span>' : 'linea ' + q.parola) + '</div>'
  if (giu) {
    const fra = fraSecondiLinea(linea, Date.now())
    h += '<div class="piastrella chiede linea-fascia"><b>Collegamento con il computer caduto da ' + durataBreve(Date.now() - (linea.cadutaIl || Date.now())) +
      ' · tentativo ' + linea.tentativo + ' · ' + (fra > 0 ? 'riprovo fra ' + fra + ' s' : 'riprovo adesso') + '.</b>' +
      '<div class="sotto">' + (linea.messaggio ? esc(linea.messaggio) + '. ' : '') + 'Riprovo da solo.' + aiuto('linea-giu', 'Quello che vedi è l’ultimo arrivato, attenuato: al ritorno si aggiorna da solo. Riprovo con attese che crescono (1, 2, 5, 10, 30 secondi, poi ogni 30), senza arrendermi. Quello che scrivi intanto resta in coda e parte al ritorno, una volta sola.') + '</div>' +
      '<div class="riga"><button onclick="riprovaLinea()">Riprova adesso</button></div></div>'
  }
  if (storiaLineaAperta) {
    h += '<div class="piastrella"><div class="titolo">Storia del collegamento' + aiuto('storia-linea', 'Le cadute e i ritorni di questa pagina con il computer, con l’ora e il motivo (gli ultimi trenta). Le tacche: 4 = ritardo sotto 150 ms e niente perso; ne tolgono una le chiamate perse e il ritardo che sale (400 ms, 1 s).') + '</div>' +
      (linea.storia.length === 0 ? '<div class="sotto">Ancora niente da raccontare.</div>' : linea.storia.slice().reverse().map((e) => '<div class="sotto" style="color:' + (e.tipo === 'caduta' ? '#dc5f5f' : 'var(--verde)') + '">' + esc(rigaStoriaLinea(e)) + '</div>').join('')) +
      '<div class="riga"><button onclick="apriStoriaLinea()">Chiudi</button></div></div>'
  }
  if (codaPagina.length > 0) {
    h += '<div class="piastrella">' + codaPagina.map((v) => '<div class="sotto" style="color:#e0a33c">' + (v.stato === 'invio' ? '↗ sto mandando' : '⏳ in attesa di invio') + ': «' + esc(v.testo.slice(0, 120)) + '»' +
      (v.stato === 'attesa' ? ' <button data-id="' + esc(v.id) + '" onclick="togliDallaCoda(this.dataset.id)">Togli</button>' : '') + '</div>').join('') + '</div>'
  }
  return h
}

/* La coda di quello che scrivi (0.51.0). */
var codaPagina = []
function nuovoIdMessaggio() {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return 'm' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('')
}
window.togliDallaCoda = (id) => { codaPagina = codaPagina.filter((v) => v.id !== id); ridisegnaLinea() }
async function mandaCoda() {
  // Con la linea lenta si manda lo stesso: le risposte arrivano (0.56.0).
  if (linea.fase === 'ricollego' || linea.fase === 'cerco' || codaPagina.some((v) => v.stato === 'invio')) return
  const v = codaPagina.find((x) => x.stato === 'attesa')
  if (!v) return
  v.stato = 'invio'
  ridisegnaLinea()
  try {
    var esito = await chiedi('/api/scrivi', { chat: v.chat, testo: v.testo, idMessaggio: v.id })
    codaPagina = codaPagina.filter((x) => x.id !== v.id)
    notaScelta = null
    // La chat aspettava una scelta e il testo non si capisce (0.52.5): non è
    // partito niente, il computer dice quali sono le opzioni.
    if (esito && esito.errore) {
      notaScelta = 'Non mandato: ' + esito.errore
      const campo = document.getElementById('t-' + v.chat)
      if (campo && !campo.value) campo.value = v.testo
    } else if (esito && esito.comeScelta) notaScelta = 'Mandato come risposta alla domanda: ' + esito.comeScelta
  } catch (e) {
    if (e && e.stato && e.stato < 500) {
      // Un rifiuto vero (il PIN, la chat chiusa): non si riprova, si dice.
      codaPagina = codaPagina.filter((x) => x.id !== v.id)
      if (e.stato === 423) pinDentro = true
      notaScelta = 'Non mandato: ' + (e.message || 'rifiutato dal computer')
      // Il testo torna nella casella: non si perde.
      const campo = document.getElementById('t-' + v.chat)
      if (campo && !campo.value) campo.value = v.testo
    } else {
      v.stato = 'attesa'
      linea = passoLinea(linea, { tipo: 'errore', il: Date.now(), motivo: 'irraggiungibile', messaggio: 'il messaggio non è partito' })
    }
  }
  ridisegnaLinea()
  if (codaPagina.some((x) => x.stato === 'attesa') && linea.fase !== 'ricollego' && linea.fase !== 'cerco') return mandaCoda()
}

/*
 * Il nome di un PC da mostrare (0.52.4): quello scelto da Nicholas, poi quello
 * che dice il PC, poi l'hostname, che altrimenti va solo piccolo accanto.
 * Copia di src/shared/nome-pc.ts: tests/shared/nome-pc.test.ts le confronta.
 */
function pulitoPc(s) {
  if (typeof s !== 'string') return ''
  let t = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    t += c < 32 || c === 127 ? ' ' : ch
  }
  return t.split(' ').filter((x) => x !== '').join(' ')
}
function nomeDaMostrare(pc) {
  if (pc === null || pc === undefined) return ''
  return pulitoPc(pc.nomeScelto) || pulitoPc(pc.nome) || pulitoPc(pc.host)
}
function sottotitoloPc(pc) {
  if (pc === null || pc === undefined) return undefined
  const h = pulitoPc(pc.host)
  if (h === '') return undefined
  return h.toLowerCase() === nomeDaMostrare(pc).toLowerCase() ? undefined : h
}
function hostPiccolo(pc) {
  const h = sottotitoloPc(pc)
  return h ? ' <small style="opacity:.6;font-weight:400">' + esc(h) + '</small>' : ''
}

/* La mappa dei PC nella Salute (0.51.0): le posizioni le decide il computer. */
function mappaHtml(m) {
  if (!m || !m.nodi || m.nodi.length < 2) return ''
  const c = m.nodi[0]
  let svg = '<svg viewBox="0 0 100 100" style="width:100%;max-width:360px;display:block;margin:8px auto" role="img" aria-label="Mappa dei collegamenti fra i PC">'
  for (const l of m.linee) {
    const n = m.nodi.find((x) => x.id === l.a)
    if (!n) continue
    svg += '<g><title>' + esc(l.testo) + '</title><line x1="' + c.x + '" y1="' + c.y + '" x2="' + n.x + '" y2="' + n.y + '" stroke="' + esc(l.colore) + '" stroke-width="1.2"' + (l.stato === 'giu' ? ' stroke-dasharray="2 2"' : l.stato === 'lento' ? ' stroke-dasharray="4 1.5"' : '') + '/>' +
      '<text x="' + ((c.x + n.x) / 2) + '" y="' + ((c.y + n.y) / 2 - 1.5) + '" text-anchor="middle" font-size="4" fill="' + esc(l.colore) + '">' + esc(l.strada || (l.stato === 'giu' ? 'giù' : '')) + '</text></g>'
  }
  for (const n of m.nodi) {
    svg += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + (n.io ? 6 : 4.5) + '" fill="' + (n.io ? '#a77bf3' : n.stato === 'acceso' ? '#3fb950' : n.stato === 'incerto' ? '#6f767e' : '#f85149') + '"/>' +
      '<text x="' + n.x + '" y="' + (n.y + (n.io ? 10 : 8.5)) + '" text-anchor="middle" font-size="4" fill="currentColor">' + esc(n.io ? n.nome + ' (questo)' : n.nome) + '</text>' +
      (n.host ? '<text x="' + n.x + '" y="' + (n.y + (n.io ? 13.5 : 12)) + '" text-anchor="middle" font-size="2.8" fill="currentColor" opacity=".6">' + esc(n.host) + '</text>' : '')
  }
  return '<div class="serigrafia" style="margin-top:10px">Mappa dei PC' + aiuto('mappa', 'Il computer al centro, gli altri intorno. Linea verde piena: si raggiunge direttamente (la strada è scritta sopra). Ambra tratteggiata: solo via Drive, lento. Rossa a puntini: adesso non risponde.') + '</div>' + svg + '</svg>' +
    ''
}

async function aggiorna() {
  try {
    if (!chiave) { await accoppiaDalQr() }
    if (!chiave) { ingresso(); return }
    inVolo = true
    ultimaChiesta = Date.now()
    const t0 = Date.now()
    // Il keepalive (0.51.0): una risposta che non arriva in sei secondi vuol dire linea caduta.
    const stato = await Promise.race([chiedi('/api/stato'), new Promise((_ok, ko) => setTimeout(() => ko(new Error('il computer non ha risposto in ' + Math.round(SCADE_MS / 1000) + ' secondi')), SCADE_MS))])
    linea = passoLinea(linea, { tipo: 'ok', il: Date.now(), ritardoMs: Date.now() - t0 })
    // Ha risposto: da qui in poi quello che si vede e' di adesso.
    ultimoContatto = Date.now()
    // L'aggiornamento viaggia con il polso apposta, e la pagina lo ignorava:
    // la percentuale non avanzava, il LED di «Computer» si accendeva solo
    // aprendo Impostazioni, un'installazione partita dal PC non si vedeva.
    if (stato && stato.aggiornamento) aggiornamentoVisto = stato.aggiornamento
    // Gli autopiloti degli altri PC (0.59.0): ogni 15 secondi, senza fermare il giro.
    if (Date.now() - altriApLetto > 15000) {
      altriApLetto = Date.now()
      chiedi('/api/autopiloti/altri').then((r) => { altriAp = (r && r.pc) || []; if (apPc && dentroAp) leggiAp().then(() => pannello(ultimoStato)); else pannello(ultimoStato) }).catch(() => { if (altriAp === null) altriAp = [] })
    }
    giriFalliti = 0
    avvisaSeServe(stato)
    if (dentroAp) await leggiAp()
    // Se si sta guardando dentro una chat, anche quelle righe si rinfrescano:
    // guardare qualcosa di fermo mentre il resto si muove sarebbe peggio che
    // non guardare.
    await leggiDentro(stato)
    firmaLineaVista = firmaLinea()
    pannello(stato)
    // Quello scritto a linea giu' parte adesso, una volta sola.
    void mandaCoda()
  } catch (e) {
    // La linea e' caduta (0.51.0): non un 401, che ha la sua strada.
    if (!(e && e.message && e.message.indexOf('(401)') >= 0) && !(e && e.stato && e.stato < 500)) {
      linea = passoLinea(linea, { tipo: 'errore', il: Date.now(), motivo: 'irraggiungibile', messaggio: e && e.message ? e.message : 'il computer non risponde' })
      ridisegnaLinea()
    }
    // Se non c'e' niente a schermo si mostra l'ingresso con il motivo: una
    // pagina vuota lascia solo la scelta di chiudere e riprovare alla cieca.
    if (!app.innerHTML.trim()) {
      ingresso('Non riesco a parlare con il computer: ' + (e && e.message ? e.message : e))
      return
    }
    // C'e' gia' qualcosa a schermo, ed e' **vecchio**. Prima non succedeva
    // niente: restavi a guardare LED verdi di mezz'ora prima, senza un segno
    // che dicesse che quella era una fotografia. Due giri di tolleranza — una
    // richiesta persa capita — e poi lo si dice.
    giriFalliti += 1
    if (giriFalliti === 2) ultimaImpronta = ''
    if (giriFalliti >= 2) pannello(ultimoStato)
  } finally {
    inVolo = false
  }
}

// Se qualcosa esplode prima ancora di disegnare - un errore di sintassi, una
// funzione che non c'e' - almeno si vede perche', invece di uno schermo nero.
window.addEventListener('error', (ev) => {
  // Anche nello storico degli errori del PC (0.81.0).
  annotaErrore((ev && ev.message ? ev.message : 'errore') + (ev && ev.error && ev.error.stack ? String.fromCharCode(10) + ev.error.stack : ''))
  if (!app.innerHTML.trim()) {
    app.innerHTML = '<div class="ingresso"><div style="font-size:1.1875rem">SierraDeck</div>' +
      '<div class="errore">' + esc(ev.message) + '</div></div>'
  }
})

// I colori del computer prima di tutto: la prima schermata deve gia' essere
// quella giusta, non assestarsi sotto gli occhi.
vestiti()
chiediDiAvvisare()
aggiorna()
// Due secondi: abbastanza da sembrare vivo, abbastanza poco da non tenere sveglia
// la radio del telefono per niente.
// Il ritmo lo decide il collegamento (0.51.0): ogni due secondi da collegati,
// con le attese crescenti da caduti; la fascia conta i secondi.
setInterval(() => {
  if (!chiave || document.hidden) return
  if (!inVolo && eOraLinea(linea, ultimaChiesta, Date.now())) { aggiorna(); return }
  if (linea.fase === 'ricollego') ridisegnaLinea()
}, 250)
setInterval(() => {
  if (!chiave || document.hidden) return
  // 0.76.0: anche dentro una chat che chiede qualcosa, per la domanda breve a lato.
  const ferma = dentro !== null && (ultimoStato.chat || []).some((c) => c.id === dentro && (c.chiede || c.aspetta))
  if (inVista('domande') || ferma) leggiDomande()
}, 2000)
</script>
</body>
</html>`
}
