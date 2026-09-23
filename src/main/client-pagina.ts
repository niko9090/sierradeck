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

export function paginaClient(): string {
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
    --t0: 11px; --t1: 13px; --t2: 15px; --t3: 17px; --t4: 22px;
    --s1: 6px; --s2: 12px; --s3: 18px; --s4: 28px;
    /* Il raggio arriva come arriva: l'identita' non si adatta. I 14px di prima
       erano la ragione singola per cui questa pagina sembrava un modulo web
       invece del banco, che ha --raggio 2px. */
    --raggio: 2px;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; background: var(--fondo-cupo); color: var(--testo);
    font: 16px/1.5 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  header {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; background: var(--fondo); border-bottom: 1px solid var(--bordo);
  }
  header b { font-size: 15px; letter-spacing: .04em; }
  header span { margin-left: auto; font-size: 12px; color: var(--testo-quieto); }
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
    display: grid; grid-template-columns: repeat(4, 1fr);
    background: var(--fondo); border-top: 1px solid var(--bordo);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .fascia__voce {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    min-height: 56px; border: 0; border-radius: 0; background: none; color: var(--testo-quieto);
  }
  .fascia__voce--qui { color: var(--testo); background: var(--chassis); }
  .fascia__nome { font-size: var(--t0); letter-spacing: .1em; }
  .fascia .led { margin-right: 0; }
  /* Una destinazione senza niente da segnalare non porta un puntino grigio:
     porta il vuoto. Un LED spento acceso su tutto e' rumore. */
  .led.nessuno { background: transparent; box-shadow: none; }
  .led.rosso { background: var(--rosso); box-shadow: 0 0 6px color-mix(in srgb, var(--rosso) 70%, transparent); }
  .piastrella { min-width: 0; }
  .piastrella {
    background: var(--chassis); border: 1px solid var(--bordo);
    border-radius: var(--raggio); padding: var(--s3);
  }
  .titolo { font-size: var(--t3); font-weight: 600; margin-bottom: var(--s1); }
  .sotto { font-size: var(--t1); color: var(--testo-quieto); }
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
  }
  .voce__altrove { font-size: .72em; opacity: .55; margin-left: 6px; white-space: nowrap; }
  .voce__freccia { color: var(--testo-quieto); }
  /* Dentro qualcosa: una freccia sola in alto a sinistra, come si torna
     indietro dappertutto. */
  .testata-dentro { display: flex; align-items: center; gap: var(--s2); }
  .testata-dentro__nome { flex: 1; min-width: 0; font-size: var(--t3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .indietro, .altro {
    min-width: 44px; min-height: 44px; padding: 0; font-size: var(--t4);
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
    color: var(--testo-quieto); font-size: var(--t2); padding: var(--s2) 0; min-height: 44px;
  }
  /* Bersagli grandi: si usa in piedi, con una mano, e un tasto piccolo su un
     telefono e' un tasto che si sbaglia. */
  button, input, textarea {
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
  .ws { display: flex; gap: var(--s2); flex-wrap: wrap; }
  .ws button { padding: 10px 14px; min-height: 44px; }
  .ws button.attivo { border-color: var(--accento); color: var(--testo); }
  .vuoto { color: var(--testo-quieto); text-align: center; padding: var(--s4) var(--s2); font-size: var(--t2); }
  .ingresso { max-width: 380px; margin: 40px auto; padding: 0 18px; text-align: center; }
  .ingresso input { width: 100%; text-align: center; font-size: 26px; letter-spacing: .3em; margin: 16px 0; }
  .errore { color: var(--ambra); font-size: var(--t1); margin-top: var(--s2); }
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
     serve, «C:\\Users\\nikof\\Documents\\…» non dice niente. */
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
    font-size: 11px; letter-spacing: .09em; text-transform: uppercase;
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
  .misura b { font-size: 26px; font-variant-numeric: tabular-nums; }
  .misura--preparazione b { color: var(--accento) }
  .misura--lavoro b { color: var(--verde) }
  .misura--attesa b { color: var(--ambra) }
  .misura--fermo b { color: var(--rosso) }

  .criteri { list-style: none; margin: 12px 0 0; padding: 0; font-size: 13px; color: var(--testo-quieto); }
  .criteri li { padding: 3px 0; }
  .criteri li.fatto { color: var(--verde); }

  .serigrafia { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--testo-quieto); }
  .voce { font-size: 12px; color: var(--testo-quieto); padding: 4px 0; display: flex; gap: 8px; }
  /* Il dialogo con l'autopilota: le tue battute a destra, le sue a sinistra,
     come in ogni conversazione. */
  .battuta { display: flex; flex-direction: column; gap: 2px; max-width: 92%; margin: 6px 0; padding: 6px 10px; border-radius: 10px; font-size: 13px; color: var(--testo); white-space: pre-wrap; overflow-wrap: anywhere; }
  .battuta--tu { margin-left: auto; background: color-mix(in srgb, var(--accento) 12%, transparent); }
  .battuta--lui { margin-right: auto; background: color-mix(in srgb, var(--verde) 10%, transparent); }
  .battuta__chi, .battuta__esito { font-size: 11px; color: var(--testo-quieto); }
  .pensa { color: var(--ambra); }
  /* La chat con lui (0.29.0): in cima, scorre da sola e resta in fondo; le
     sue decisioni sono note quiete con il filo colorato a sinistra. */
  .flusso-ap { max-height: 46vh; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; padding-right: 2px; }
  .battuta--domanda, .battuta--pronto { border: 1px solid var(--ambra); background: color-mix(in srgb, var(--ambra) 10%, transparent); }
  .nota-ap { display: flex; gap: 8px; margin: 2px 0; padding-left: 8px; border-left: 2px solid var(--bordo); font-size: 11px; color: var(--testo-quieto); }
  .nota-ap .quando { font-family: ui-monospace, Consolas, monospace; color: var(--spento); flex: 0 0 auto; }
  .nota-ap--decisione { border-left-color: var(--accento); }
  .nota-ap--correzione { border-left-color: var(--ambra); }
  .nota-ap--fine { border-left-color: var(--verde); color: var(--testo); }
  .nota-ap--fermo { border-left-color: var(--rosso); color: var(--testo); }
  .info-ap { margin-left: auto; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--bordo); border-radius: 50%; }
  /* Le linguette sotto la chat: una cosa per volta. */
  .linguette { display: flex; gap: 4px; margin-top: 12px; border-bottom: 1px solid var(--bordo); overflow-x: auto; }
  .linguetta { flex: 0 0 auto; background: transparent; border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 8px 10px; font-size: 12px; color: var(--testo-quieto); min-height: 0; }
  .linguetta--attiva { color: var(--testo); border-bottom-color: var(--verde); }
  .linguetta small { color: var(--testo-quieto); font-size: 10px; }
  .tab-ap { padding-top: 10px; }
  .compiti-ap { margin: 4px 0 0; padding-left: 18px; font-size: 13px; color: var(--testo); }
  .voce .quando { font-family: ui-monospace, Consolas, monospace; color: var(--spento); }

  /* Il tasto che sta per disfare qualcosa lo dice, per un attimo: il secondo
     tocco e' la conferma, e il colore e' quello di uno stato, non un ornamento. */
  button.pericolo { border-color: var(--rosso); color: var(--rosso); }
  .spunta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--testo-quieto); }
  .spunta input { width: 20px; height: 20px; }

  .numeri { display: flex; gap: 6px; }
  .numero { flex: 1; text-align: center; }
  .numero b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
  .numero b.v { color: var(--verde) } .numero b.a { color: var(--ambra) }
  .numero span { font-size: 11px; color: var(--testo-quieto); }
</style>
</head>
<body>
<div id="app"></div>
<script>
// L'interprete dei colori del terminale. Vive in un modulo suo, con i suoi
// test, e qui dentro ci arriva per intero: quello che gira nel telefono e'
// esattamente il codice che e' stato verificato.
${ansiInHtml.toString()}

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
var righeDentro = []
var cartelle = null
// Le stesse righe con i loro colori: si vestono qui, nel telefono.
var righeGrezze = []
// Le scelte che il terminale sta aspettando, quando ne aspetta: le riconosce il
// computer e le manda gia' pronte. Senza, dal telefono un riquadro di scelta e'
// una cosa che si legge e basta.
var scelteDentro = null
// La scelta appena mandata (le sue opzioni) e quando: se il computer la
// rimanda uguale entro pochi secondi, e' il terminale che non si e' ancora
// ridisegnato, non una domanda nuova. Rimostrarla invitava al secondo tocco.
var sceltaRisposta = null
var SCELTA_RISPOSTA_MS = 8000
function firmaScelte(s) { return s ? s.opzioni.map((o) => o.testo).join('\\n') : '' }
// Quando una scelta non c'e' piu': una riga, e sparisce da sola alla lettura
// dopo. Senza, il tocco andrebbe a vuoto in silenzio e sembrerebbe un guasto.
var notaScelta = null
/** L'autopilota che si sta guardando dentro, e tutto quello che si sa di lui. */
var dentroAp = null
var apDettaglio = null
/** Quale linguetta e' aperta sotto la chat con l'autopilota. */
var apTab = 'obiettivo'
/** Cosa e' successo all'ultimo messaggio mandato all'autopilota, se non e' partito. */
var notaDialogo = ''
/** Il pannello aperto in fondo: le conversazioni, i salvataggi, o niente. */
var pannelloAperto = null
var sessioniViste = null
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
var schedaAperta = null
var prefViste = null
var aggiornamentoVisto = null
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
async function leggiDomande() {
  try {
    var d = await chiedi('/api/domande')
    domandeViste = (d && d.voci) || []
    domandeGuasto = (d && d.errore) ? String(d.errore) : null
  } catch (e) {
    domandeGuasto = 'Non riesco a leggere le domande: ' + (e && e.message ? e.message : 'il computer non risponde') + '. Se il computer e\u2019 alla 0.29 o prima, va aggiornato.'
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
    return '<div class="piastrella"><div class="grande">Niente da rispondere</div><div class="sotto">Qui compaiono, senza bloccare niente: le domande che un autopilota ti fa prima di partire o mentre lavora; le scelte che una chat aspetta (un permesso, \u00abvuoi procedere?\u00bb, un elenco numerato); e le chat che hanno finito e aspettano una tua istruzione. Ogni voce ha dentro il modo di rispondere e sparisce da sola quando il computer riceve la risposta.</div></div>'
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
            return '<button class="' + (o.scelta ? 'scelta scelta--qui' : 'scelta') + '" data-chat="' + esc(v.chat) + '" data-testo="' + esc(o.testo) + '" onclick="scegliIn(this.dataset.chat, this.dataset.testo)"><b>' + o.numero + '</b> ' + esc(o.testo) + '</button>'
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
var scheda = 'adesso'
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

async function chiedi(percorso, corpo) {
  const r = await fetch(percorso, {
    method: corpo ? 'POST' : 'GET',
    headers: chiave ? { 'x-sierradeck-chiave': chiave, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  })
  if (r.status === 401) {
    rifiuti401 += 1
    if (rifiuti401 >= RIFIUTI_PER_ARRENDERSI) { chiave = ''; localStorage.removeItem(CHIAVE); ingresso('Questo dispositivo non è più riconosciuto.') }
    throw new Error('il computer non riconosce questo dispositivo (401)')
  }
  rifiuti401 = 0
  // Un 4xx o 5xx non e' una risposta: prima tornava come oggetto e i tasti
  // procedevano come se fosse andata (il modulo «Affida» si chiudeva, il
  // campo del nome si svuotava). Il 409 no: e' una risposta con un motivo,
  // che le scelte e il Drive leggono da soli.
  if (!r.ok && r.status !== 409) {
    let motivo = ''
    try { motivo = (await r.json()).errore || '' } catch (e) { motivo = '' }
    throw new Error(motivo || ('il computer ha risposto ' + r.status))
  }
  return r.json()
}

// Un tasto che fallisce lo dice in cima alla pagina, invece di tacere.
var notaGlobale = ''
window.chiudiNota = () => { notaGlobale = ''; pannello(ultimoStato) }
window.addEventListener('unhandledrejection', (ev) => {
  const e = ev && ev.reason
  const testo = e && e.message ? e.message : String(e || 'errore')
  if (testo === '401') return
  notaGlobale = 'Non sono riuscito: ' + testo
  try { pannello(ultimoStato) } catch (err) { }
})

function ingresso(messaggio) {
  app.innerHTML = \`
    <div class="ingresso">
      ${LOGO}
      <div style="font-size:19px;margin-bottom:6px">SierraDeck</div>
      <div class="sotto">Sul computer apri <b>Impostazioni → Client</b> e leggi il codice.</div>
      <input id="codice" inputmode="numeric" maxlength="6" placeholder="······" aria-label="codice">
      <input id="nome" placeholder="nome di questo dispositivo" style="font-size:15px;letter-spacing:normal">
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
        const w = c.sessione ? dove[c.sessione] : undefined
        return (w && nomi.indexOf(w) >= 0 ? w : casa) === nome
      })
      .map((c) => ({ viva: c }))
      .concat(salvate.filter((c) => c.workspace === nome && !viveSess[c.sessione]).map((c) => ({ salvata: c })))
  }))
}

function impronta(s) {
  const chat = (s.chat || []).map((c) => c.id + '|' + c.titolo + '|' + (c.ultimaRiga || '')).join('~') +
    '#' + ((s.workspace && s.workspace.chat) || []).map((c) => c.sessione + '|' + c.workspace + '|' + c.titolo).join('~')
  const aps = (s.autopiloti || []).map((a) =>
    a.id + '|' + a.stato + '|' + a.cicli + '|' + a.fatti + '|' + a.criteri + '|' + (a.strategia || '')
  ).join('~')
  const dom = (s.domande || []).map((d) => d.id + '|' + d.testo).join('~')
  const ws = s.workspace ? (s.workspace.nomi || []).join(',') + '>' + s.workspace.attivo : ''
  // Anche quello che sta aperto **qui**: un pannello che si apre non cambia lo
  // stato del computer, ma cambia la pagina.
  const qui = [
    dentro, dentroAp, pannelloAperto, schedaAperta && schedaAperta.file,
    scheda, altroAperto, delegando, delegaCartella, confermando, righeDentro.length,
    righeDentro[righeDentro.length - 1] || '', giriFalliti >= 2,
    // Le scelte fanno comparire e sparire dei pulsanti: se non entrano
    // nell'impronta, il riquadro di scelta arriva e la pagina non si ridisegna.
    scelteDentro ? scelteDentro.corrente + ':' + scelteDentro.opzioni.map((o) => o.testo).join('/') : '',
    notaScelta || '',
    // **Anche cio' che si e' letto apposta.** Il dettaglio di un autopilota,
    // l'elenco delle cartelle, la coda, il Drive, le preferenze, le schede:
    // arrivano con una chiamata a parte e non stanno nello stato del PC. Senza
    // di loro nell'impronta, a computer fermo (nessuna chat che scrive) la
    // pagina restava com'era: si toccava un autopilota e il suo dettaglio non
    // compariva, si apriva il Drive e restava «Leggo il Drive…».
    apDettaglio ? apDettaglio.ultimoEvento + '/' + apDettaglio.stato + '/' + (apDettaglio.decisioni || []).length + '/' + (apDettaglio.chat || []).length + '/' + apDettaglio.domanda + '/' + apDettaglio.pensa + '/' + apDettaglio.riprendiAlRiavvio : '',
    apTab,
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
    prefViste ? prefViste.stile + '/' + prefViste.chiarore : '',
    aggiornamentoVisto ? aggiornamentoVisto.fase + '/' + (aggiornamentoVisto.percento || 0) + '/' + (aggiornamentoVisto.errore || '') : '',
    consumiVisti ? 'consumi' : '',
    schedeViste ? schedeViste.length : '',
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
  if (giriFalliti >= 2) return nome === 'computer' ? 'rosso' : 'fermo'
  const aps = s.autopiloti || []
  const chiede = (s.domande || []).length > 0 ||
    aps.some((a) => a.stato === 'attesa' || a.stato === 'pronto')
  const fermi = aps.some((a) => a.stato === 'sospeso' || a.stato === 'fallito')
  const moto = aps.some((a) => a.stato === 'lavoro')
  if (nome === 'adesso') return chiede ? 'attesa' : fermi ? 'rosso' : moto ? 'lavoro' : ''
  if (nome === 'domande') return ((s.domande || []).length + (s.chat || []).filter((c) => c.chiede).length) > 0 ? 'attesa' : ''
  if (nome === 'lavori') return chiede ? 'attesa' : fermi ? 'rosso' : moto ? 'lavoro' : ''
  if (nome === 'chat') return (s.chat || []).length > 0 ? 'lavoro' : ''
  // Il computer normalmente non ha LED, e lo accende solo quando c'e' qualcosa
  // che riguarda **la macchina**: un aggiornamento pronto, o il silenzio.
  return aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto' ? 'attesa' : ''
}

/** La fascia fissa, sempre visibile, mai nascosta dallo scorrimento. */
function fascia(s) {
  const chiedono = (s.domande || []).length + (s.chat || []).filter((c) => c.chiede).length
  const voci = [
    ['adesso', 'ADESSO'], ['domande', chiedono > 0 ? 'DOMANDE \u00b7 ' + chiedono : 'DOMANDE'], ['chat', 'CHAT'], ['lavori', 'LAVORI'], ['computer', 'COMPUTER']
  ]
  return '<nav class="fascia">' + voci.map((v) => {
    const l = ledDestinazione(v[0], s)
    return '<button class="fascia__voce' + (scheda === v[0] ? ' fascia__voce--qui' : '') + '"' +
      (scheda === v[0] ? ' aria-current="page"' : '') +
      ' onclick="vaiScheda(\\'' + v[0] + '\\')">' +
      '<span class="led ' + (l || 'nessuno') + '"></span>' +
      '<span class="fascia__nome">' + v[1] + '</span></button>'
  }).join('') + '</nav>'
}

function pannello(s) {
  ultimoStato = s
  const attivo = document.activeElement
  const staScrivendo = attivo && (attivo.tagName === 'INPUT' || attivo.tagName === 'TEXTAREA')
  // Chi sta scrivendo ha ragione: la pagina puo' aspettare due secondi.
  if (staScrivendo) return
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
    const classe = typeof a === 'object' && a ? a.led : undefined
    if (typeof classe === 'string' && classe.indexOf('led--') === 0) return classe.slice(5)
    const st = typeof a === 'object' && a ? a.stato : a
    return st === 'lavoro' ? 'lavoro' : (st === 'attesa' || st === 'pronto') ? 'attesa' : 'fermo'
  }
  // La panoramica: quello che si vuole sapere prima di leggere qualunque
  // dettaglio - sta lavorando qualcosa? qualcuno mi sta aspettando? A quale
  // punto siamo? Tre numeri, in cima, senza dover contare le piastrelle.
  const aps = s.autopiloti || []
  const alLavoro = aps.filter((a) => a.stato === 'lavoro').length
  const inAttesa = aps.filter((a) => a.stato === 'attesa' || a.stato === 'pronto').length
  const finiti = aps.filter((a) => a.stato === 'finito').length
  const criteriTot = aps.reduce((t, a) => t + (a.criteri || 0), 0)
  const criteriFatti = aps.reduce((t, a) => t + (a.fatti || 0), 0)
  const avanzamento = criteriTot ? Math.round(criteriFatti / criteriTot * 100) : 0
  // ── La gerarchia di Adesso ──────────────────────────────────────────────
  // Una cosa sola domina alla volta. Prima c'erano quattro numeri giganti che
  // rispondevano alla domanda sbagliata: «0 ti aspettano» e «2 ti aspettano»
  // differiscono di un carattere, mentre la domanda del colpo d'occhio e'
  // **serve qualcosa da me, si' o no**.
  const inMoto = (s.autopiloti || []).filter((a) => a.stato === 'lavoro')
  const fermi = (s.autopiloti || []).filter((a) => a.stato === 'sospeso' || a.stato === 'fallito')

  /** Il polso: una riga per cosa, non un cruscotto. */
  const polso =
    '<div class="solco"></div><div class="serigrafia riga-polso">IN MOTO<span>' +
    (inMoto.length + (s.chat || []).length) + '</span></div>' +
    inMoto.map((a) =>
      '<div class="polso"><span class="led ' + led(a) + '"></span>' +
      '<span class="polso__nome">' + esc(a.nome) + '</span>' +
      '<span class="polso__misura">' + (a.criteri ? Math.round(a.fatti / a.criteri * 100) : 0) + '%</span></div>'
    ).join('') +
    (s.chat || []).map((c) =>
      // Anche il LED di una chat si spegne quando il computer tace: scritto a
      // mano restava **verde** su dati di mezz'ora prima, che è esattamente
      // ciò che questo stato esiste per impedire. Visto in fotografia.
      '<div class="polso"><span class="led ' + (giriFalliti >= 2 ? 'fermo' : 'lavoro') + '"></span>' +
      '<span class="polso__nome">' + esc(c.titolo) + '</span></div>' +
      (c.ultimaRiga ? '<div class="battito">' + esc(c.ultimaRiga) + '</div>' : '')
    ).join('')

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
    '<button onclick="riprendiAp(\\'' + esc(a.id) + '\\')">Riprendi</button>' +
    '<button onclick="vaiScheda(\\'lavori\\')">Guarda</button></div></div>'
  ).join('')

  const panoramica = (s.domande || []).length > 0 || fermi.length > 0 || inMoto.length > 0 || (s.chat || []).length > 0
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
      <div class="grande">\${esc(d.testo)}</div>
      <div class="riga">
        <textarea id="r-\${esc(d.id)}" rows="3" placeholder="la tua risposta"></textarea>
      </div>
      <div class="riga"><button class="primario" onclick="rispondi('\${escJs(d.id)}')">Rispondi</button></div>
    </div>\`).join('')

  const apAperto = (s.autopiloti || []).find((a) => a.id === dentroAp)
  const autopiloti = apAperto
    ? \`
    <div class="testata-dentro">
      <button class="indietro" onclick="chiudiAp()" aria-label="Torna all elenco">‹</button>
      <div class="testata-dentro__nome"><span class="led \${led(apAperto)}"></span>\${esc(apAperto.nome)}</div>
    </div>
    <div class="piastrella">
      <div class="sotto">\${esc(apAperto.strategia ? 'bloccato, provo: ' + apAperto.strategia : (apAperto.motivo || apAperto.stato))}</div>
      <div class="misura-riga">\${apAperto.fatti} criteri su \${apAperto.criteri} · \${apAperto.cicli} interventi</div>
      <div class="barra"><i style="width:\${apAperto.criteri ? Math.round(apAperto.fatti / apAperto.criteri * 100) : 0}%"></i></div>
      \${apDettaglio ? vistaAutopilota(apDettaglio) : ''}
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
        <button onclick="apriPannello('quaderno')">Quaderno</button>
      </div>
      <div class="riga">
        <label class="spunta"><input type="checkbox" \${apDettaglio && apDettaglio.riprendiAlRiavvio === false ? '' : 'checked'} data-ap="\${esc(apAperto.id)}" onchange="riavvioAp(this.dataset.ap, this.checked)"> Riparte da solo al riavvio del computer</label>
        <button class="\${confermando === 'ap-' + apAperto.id ? 'pericolo' : ''}" data-ap="\${esc(apAperto.id)}" onclick="eliminaAp(this.dataset.ap)">\${confermando === 'ap-' + apAperto.id ? 'Sicuro? Elimina' : 'Elimina'}</button>
      </div>
    </div>\`
    : (s.autopiloti || []).map((a) => \`
    <button class="voce" onclick="guardaAp('\${escJs(a.id)}')">
      <span class="led \${led(a)}"></span>
      <span class="voce__testo">
        <span class="voce__nome">\${esc(a.nome)}</span>
        <span class="voce__sotto">\${esc(a.strategia ? 'bloccato, provo: ' + a.strategia : (a.motivo || a.stato))} · \${a.fatti}/\${a.criteri}</span>
      </span>
      <span class="voce__freccia">›</span>
    </button>\`).join('')

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
      <button class="indietro" onclick="chiudiDentro()" aria-label="Torna all elenco">‹</button>
      <div class="testata-dentro__nome">\${esc(aperta.titolo)}</div>
      <button class="altro" onclick="apriAltro('\${escJs(aperta.id)}')" aria-label="Altro">⋯</button>
    </div>
    <div class="sotto percorso">\${esc(aperta.cwd)}</div>
    \${altroAperto === aperta.id ? \`
      <div class="piastrella">
        <div class="riga">
          <input id="n-\${esc(aperta.id)}" placeholder="dalle un nome">
          <button onclick="rinomina('\${escJs(aperta.id)}')">Nome</button>
        </div>
        <div class="riga">
          <button class="\${confermando === 'chat-' + aperta.id ? 'pericolo' : ''}"
            onclick="chiudiChat('\${escJs(aperta.id)}')">\${confermando === 'chat-' + aperta.id ? 'Sicuro? Chiudi' : 'Chiudi la chat'}</button>
        </div>
      </div>\` : ''}
    <div class="dentro dentro--alto">\${righeGrezze.length
        // Vestite: il verde di un test passato e il rosso di uno fallito sono
        // meta' di quello che dice come sta andando.
        ? ansiInHtml(righeGrezze.join(String.fromCharCode(10)))
        : righeDentro.length ? esc(righeDentro.join(String.fromCharCode(10)))
        : 'Ancora niente da mostrare.'}</div>
    \${scelteDentro
      ? '<div class="scelte"><div class="serigrafia">sta aspettando che tu scelga</div>' +
        scelteDentro.opzioni.map((o) =>
          '<button class="scelta' + (o.scelta ? ' scelta--ora' : '') +
          '" onclick="scegli(\\'' + escJs(o.testo) + '\\')">' +
          '<span class="scelta__n">' + o.numero + '</span>' + esc(o.testo) + '</button>'
        ).join('') + '</div>'
      : ''}
    \${notaScelta ? '<div class="sotto">' + esc(notaScelta) + '</div>' : ''}
    <div class="riga ancorata">
      <input id="t-\${esc(aperta.id)}" placeholder="scrivi qui e invia">
      <button onclick="scrivi('\${escJs(aperta.id)}')">Invia</button>
    </div>\`
    : gruppiChat(s).map((g) =>
      '<div class="sotto" style="padding:10px 16px 2px;letter-spacing:.08em;text-transform:uppercase;font-size:11px">' +
        esc(g.workspace) + (g.attivo ? ' · davanti' : '') + ' · ' + g.voci.length + '</div>' +
      (g.voci.length === 0
        ? '<div class="sotto" style="padding:2px 24px 8px">nessuna chat</div>'
        : g.voci.map((v) => v.viva
          ? '<button class="voce" onclick="guarda(\\'' + escJs(v.viva.id) + '\\')">' +
            '<span class="led ' + (giriFalliti >= 2 ? 'fermo' : 'lavoro') + '"></span>' +
            '<span class="voce__testo"><span class="voce__nome">' + esc(v.viva.titolo) + (v.viva.altrove ? '<span class="voce__altrove">su ' + esc(v.viva.altrove) + '</span>' : '') + '</span>' +
            (v.viva.ultimaRiga ? '<span class="voce__sotto">' + esc(v.viva.ultimaRiga) + '</span>' : '') +
            '</span><span class="voce__freccia">›</span></button>'
          : '<button class="voce" onclick="riprendiSalvata(\\'' + escJs(v.salvata.cwd) + '\\',\\'' + escJs(v.salvata.sessione) + '\\')">' +
            '<span class="led"></span>' +
            '<span class="voce__testo"><span class="voce__nome" style="opacity:.7">' + esc(v.salvata.titolo || v.salvata.cwd) + (v.salvata.altrove ? '<span class="voce__altrove">su ' + esc(v.salvata.altrove) + '</span>' : '') + '</span>' +
            '<span class="voce__sotto">da riprendere · tocca per riaprirla</span></span>' +
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
         <div class="titolo">Cosa vuoi che faccia?</div>
         <div class="sotto">Descrivilo con parole tue. Ti farà le domande che gli servono, qui.</div>
         <div class="riga">
           <textarea id="delega-obiettivo" rows="8" placeholder="Tutto quello che serve: l’obiettivo, i vincoli (cosa non toccare), come si capisce che ha finito. Nessun limite: puoi incollare un documento."></textarea>
           <div class="sotto">Arriva a lui parola per parola, come mandato. Poi legge il progetto, ti fa al massimo un paio di domande (le trovi nella scheda Domande) e aspetta il tuo «Vai».</div>
         </div>
         <div class="sotto" style="margin-top:10px">In quale cartella?</div>
         \${(cartelle || []).length === 0
           ? '<div class="sotto" style="margin-top:8px">Nessuna cartella conosciuta.</div>'
           : (cartelle || []).map((c, i) =>
               '<button class="cartella' + (delegaCartella === i ? ' attivo' : '') + '" onclick="scegliPer(' + i + ')">' + esc(c) + '</button>').join('')}
         <div class="riga">
           <button class="primario" onclick="affida()">Affida</button>
           <button onclick="delegando = false; delegaCartella = -1; pannello(ultimoStato)">Lascia stare</button>
         </div>
       </div>\`

  const elencoSessioni = pannelloAperto !== 'sessioni' ? '' : \`
    <div class="piastrella">
      <div class="titolo">Riprendi una conversazione</div>
      <div class="sotto">Quelle che il computer conosce, dalla più recente.</div>
      \${(sessioniViste || []).length === 0
        ? '<div class="sotto" style="margin-top:8px">Nessuna conversazione trovata.</div>'
        : (sessioniViste || []).slice(0, 20).map((x, i) =>
            '<button class="cartella" onclick="riprendiSessione(' + i + ')">' +
            esc(x.titolo) + (x.altrove ? ' <span class="sotto">· su ' + esc(x.altrove) + '</span>' : '') +
            '<br><span class="sotto">' + esc(x.cwd) + (x.altrove ? ' (cartella di quel PC: qui non si apre, scrivile da «Altri PC»)' : '') + '</span></button>').join('')}
      <div class="riga"><button onclick="apriPannello('sessioni')">Chiudi</button></div>
    </div>\`

  // Gli altri computer, e le azioni da eseguire solo la'. Stessa forma della
  // coda: elenco, poi la cassetta di uno.
  const elencoPc = pannelloAperto !== 'pc' ? '' : (() => {
    const pc = pcVisti || []
    if (pcAperto === null) {
      return '<div class="piastrella"><div class="titolo">Altri computer</div>' +
        '<div class="sotto">I PC che usano questo stesso Drive. Un\\'azione scritta a un PC si esegue solo la\\', in una sua chat, quando e\\' acceso: e\\' la strada per una cartella che sta su quel PC (un disco di rete, un progetto che non viaggia).</div>' +
        (pcVisti === null ? '<div class="sotto" style="margin-top:8px">Leggo il Drive…</div>' : '') +
        (pcVisti !== null && pc.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessun altro PC ha ancora lasciato un segno sul Drive (serve la 0.27.0 su quel PC).</div>' : '') +
        pc.map((b) =>
          '<button class="cartella" data-pc="' + esc(b.pcId) + '" onclick="apriPc(this.dataset.pc)">' + esc(b.nome) +
          '<br><span class="sotto">' + (b.vivo ? 'acceso' : 'spento, ultimo segno ' + esc(String(b.battito || '').slice(0, 16).replace('T', ' '))) +
          ' · ' + (b.chat || []).length + ' chat aperte · ' + (b.cartelle || []).length + ' cartelle</span></button>').join('') +
        '<div class="riga"><button onclick="apriPannello(\\'pc\\')">Chiudi</button></div></div>'
    }
    const b = pc.find((x) => x.pcId === pcAperto) || { nome: pcAperto, cartelle: [], chat: [], vivo: false }
    const voci = postaVoci || []
    const attesa = voci.filter((v) => v.stato === 'attesa')
    const chiuse = voci.filter((v) => v.stato !== 'attesa')
    const cartelle = (b.cartelle || [])
    return '<div class="piastrella"><div class="titolo">Azioni su ' + esc(b.nome) + ' · ' + (b.vivo ? 'acceso' : 'spento') + '</div>' +
      '<div class="sotto">Quello che scrivi qui si esegue solo su ' + esc(b.nome) + ', nella cartella scelta, quando e\\' acceso: alla prima chat di quella cartella che aspetta, o a una nuova. Se la cartella la\\' non esiste, la voce fallisce e lo leggi qui.</div>' +
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

  const elencoCode = pannelloAperto !== 'code' ? '' : (() => {
    const progetti = (s.progetti || [])
    if (codaProgetto === null) {
      return '<div class="piastrella"><div class="titolo">Code dei progetti</div>' +
        '<div class="sotto">I comandi in fila per ogni progetto sul Drive: li consegna il PC che ha il testimone, appena una chat ha finito.</div>' +
        (progetti.length === 0
          ? '<div class="sotto" style="margin-top:8px">Nessun progetto sul Drive.</div>'
          : progetti.map((p) =>
              '<button class="cartella" onclick="apriCoda(\\'' + escJs(p.id) + '\\')">' + esc(p.nome) +
              '<br><span class="sotto">' + p.inCoda + ' in coda · ' +
              (p.chi === 'io' ? 'in lavoro qui' : p.chi === 'altro' ? 'in lavoro su ' + esc(p.pcNome || '?') : 'libero') +
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

  const vistaDrive = pannelloAperto !== 'drive' ? '' : (() => {
    const c = driveCatalogo
    const l = driveLavoro || {}
    const inc = l.inCorso
    const occupato = !!inc || driveInCorso !== null
    let testa = '<div class="piastrella"><div class="titolo">Drive · il magazzino dei tuoi PC</div>' +
      '<div class="sotto">Cosa c\\'è sul Drive e cosa il computer ha già. Un progetto è la cartella in cui le chat lavorano; un workspace è una fascia a schermo con dentro delle chat. «Porta qui» fa scaricare al computer la cartella se viaggia con le chat, le chat che gli mancano, e le mette nel loro workspace; poi il computer si riavvia da solo per mostrarle. Niente viene mai cancellato.</div>'
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
        testa += '<div class="sotto" style="margin-top:6px">Sono arrivate chat o cartelle: il computer si riavvia da solo fra pochi secondi per mostrarle. Se non lo fa, chiediglielo da qui.</div>' +
          '<div class="riga"><button class="primario" onclick="driveRiavvia()">Riavvia il computer ora</button></div>'
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
        '<div class="sotto" style="margin-top:6px">Leggere il Drive non tocca niente: il computer legge e basta. Quando ha finito compare il catalogo.</div></div>'
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

  const vistaConsumi = pannelloAperto !== 'consumi' ? '' : \`
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

  const vistaQuaderno = pannelloAperto !== 'quaderno' ? '' : \`
    <div class="piastrella">
      <div class="titolo">Quaderno</div>
      <div class="sotto">Le schede che l'autopilota lascia accanto al codice.</div>
      \${schedaAperta
        ? '<div class="dettaglio"><div class="titolo">' + esc(schedaAperta.titolo) + '</div>' +
          '<div class="dentro" style="max-height:50vh">' + esc(schedaAperta.corpo) + '</div>' +
          '<div class="riga"><button onclick="chiudiScheda()">Torna all elenco</button></div></div>'
        : ((schedeViste || []).length === 0
            ? '<div class="sotto" style="margin-top:8px">Nessuna scheda in questa cartella.</div>'
            : (schedeViste || []).map((x) =>
                '<button class="cartella" onclick="apriScheda(\\'' + escJs(cartellaPrima()) + '\\', \\'' +
                escJs(x.file) + '\\')">' + esc(x.titolo) + '</button>').join(''))}
      <div class="riga"><button onclick="apriPannello('quaderno')">Chiudi</button></div>
    </div>\`

  const vistaImpostazioni = pannelloAperto !== 'impostazioni' ? '' : \`
    <div class="piastrella">
      <div class="titolo">Impostazioni</div>
      \${prefViste === null ? '<div class="sotto">Non sono riuscito a leggerle.</div>' : \`
        <div class="sotto" style="margin-top:10px">Stile della console</div>
        <div class="ws" style="margin-top:8px">
          <button class="\${prefViste.stile === 'banco' ? 'attivo' : ''}" onclick="cambiaPref('stile', 'banco')">Banco</button>
          <button class="\${prefViste.stile === 'foglio' ? 'attivo' : ''}" onclick="cambiaPref('stile', 'foglio')">Foglio</button>
        </div>
        <div class="sotto" style="margin-top:14px">Chiarore: \${prefViste.chiarore}</div>
        <input type="range" min="0" max="100" value="\${prefViste.chiarore}" style="width:100%"
          onchange="cambiaPref('chiarore', Number(this.value))">
      \`}
      <div class="sotto" style="margin-top:16px">Aggiornamento del computer</div>
      <div class="sotto">\${esc(descriviAggiornamento())}</div>
      <div class="riga">
        \${aggiornamentoVisto && aggiornamentoVisto.fase === 'disponibile'
          ? '<button onclick="scaricaAggiornamento()">Scarica</button>' : ''}
        \${aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto'
          ? '<button class="' + (confermando === 'agg' ? 'pericolo' : '') + '" onclick="installaAggiornamento()">' +
            (confermando === 'agg' ? 'Sicuro? Aspetta le chat e riavvia' : 'Installa') + '</button>' : ''}
        \${aggiornamentoVisto && aggiornamentoVisto.fase === 'attendo'
          ? '<button disabled>' + (aggiornamentoVisto.attesa ? 'Aspetto il Drive…' : 'Aspetto le chat…') + '</button>' : ''}
        <button onclick="apriPannello('impostazioni')">Chiudi</button>
      </div>
    </div>\`

  const ws = (s.workspace && s.workspace.nomi || []).map((n) => \`
    <button class="\${n === s.workspace.attivo ? 'attivo' : ''}" onclick="vaiA('\${escJs(n)}')">\${esc(n)}</button>\`).join('')

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
  const fermo = giriFalliti >= 2
    ? '<div class="scollegato">Non parlo con il computer da ' + daQuando(ultimoContatto) +
      '.<br><span>Quello che vedi è di prima.</span></div>'
    : ''

  // ── Le quattro destinazioni ────────────────────────────────────────────
  // Gli stessi contenuti di prima, smistati. Il riquadro dei cinque bottoni
  // non c'e' piu': era un menu alla **fine** di uno scorrimento infinito, che
  // apriva i suoi pannelli ancora piu' sotto — con sei chat aperte, «Consumi»
  // era a dodici schermate dal pollice.
  const paneWorkspace = ws
    ? '<div class="piastrella"><div class="titolo">Workspace</div><div class="ws" style="margin-top:10px">' + ws + '</div>' +
      '<div class="riga"><input id="ws-nuovo" placeholder="un workspace nuovo">' +
      '<button onclick="creaWorkspace()">Crea</button></div></div>'
    : ''

  const schermate = {
    // Uno solo domina alla volta: una domanda, poi un lavoro fermo, poi il
    // polso, poi la calma. Quando domina una domanda tutto il resto collassa
    // in una riga: e' la ragione per cui questa schermata si legge in un
    // secondo e mezzo invece che scorrerla.
    domande: vistaDomande(s),
    adesso: fermo + invito + domande + bloccati + panoramica +
      (domande
        ? '<div class="solco"></div><button class="riga-altro" onclick="vaiScheda(\\'lavori\\')">altre cose in moto ›</button>'
        : (inMoto.length + (s.chat || []).length > 0 ? polso : '')),
    chat:
      (chat || '<div class="vuoto">Nessuna chat aperta sul computer.</div>') + nuova +
      '<div class="riga"><button onclick="apriPannello(\\'sessioni\\')">Riprendi una conversazione</button></div>' +
      elencoSessioni,
    lavori:
      (autopiloti || '<div class="vuoto">Nessun lavoro affidato.</div>') + delega +
      '<div class="riga"><button onclick="apriPannello(\\'quaderno\\')">Quaderno</button></div>' +
      vistaQuaderno,
    computer:
      paneWorkspace +
      '<div class="riga"><button onclick="apriPannello(\\'code\\')">Code' +
      ((s.progetti || []).reduce((n, p) => n + (p.inCoda || 0), 0) > 0 ? ' · ' + (s.progetti || []).reduce((n, p) => n + (p.inCoda || 0), 0) : '') + '</button>' +
      '<button onclick="apriPannello(\\'pc\\')">Altri PC</button>' +
      '<button onclick="apriPannello(\\'drive\\')">Drive</button>' +
      '<button onclick="apriPannello(\\'consumi\\')">Consumi</button>' +
      '<button onclick="apriPannello(\\'impostazioni\\')">Impostazioni</button></div>' +
      elencoCode + elencoPc + vistaDrive + vistaConsumi + vistaImpostazioni
  }

  app.innerHTML = \`
    <main class="schermata">
      \${notaGlobale ? '<div class="piastrella"><div class="errore">' + esc(notaGlobale) + '</div><div class="riga"><button onclick="chiudiNota()">Ok</button></div></div>' : ''}
      \${schermate[scheda] || schermate.adesso}
    </main>
    \${fascia(s)}\`

  for (const id in scritti) {
    const campo = document.getElementById(id)
    if (campo) campo.value = scritti[id]
  }
  rimettiScorrimento(dove)
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

async function leggiDentro() {
  if (!dentro) return
  try {
    const r = await chiedi('/api/dentro', { chat: dentro })
    righeDentro = r.righe || []
    righeGrezze = r.grezze || []
    scelteDentro = r.scelte || null
    if (scelteDentro && sceltaRisposta && sceltaRisposta.firma === firmaScelte(scelteDentro) &&
        Date.now() - sceltaRisposta.quando < SCELTA_RISPOSTA_MS) scelteDentro = null
    if (scelteDentro) notaScelta = null
  } catch (e) {
    // Una chat chiusa al computer mentre la si guardava: si torna all'elenco
    // invece di restare su un riquadro che non esiste piu'.
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
window.scegliPer = (i) => { delegaCartella = i; pannello(ultimoStato) }
window.affida = async () => {
  const campo = document.getElementById('delega-obiettivo')
  const obiettivo = campo && campo.value.trim()
  const cartella = (cartelle || [])[delegaCartella]
  if (!obiettivo || !cartella) return
  await chiedi('/api/autopilota/crea', { obiettivo: obiettivo, cartella: cartella })
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
window.guardaAp = async (id) => {
  dentroAp = id
  apDettaglio = null
  pannello(ultimoStato)
  await leggiAp()
  pannello(ultimoStato)
}
window.chiudiAp = () => { dentroAp = null; apDettaglio = null; pannello(ultimoStato) }

async function leggiAp() {
  if (!dentroAp) return
  try {
    apDettaglio = await chiedi('/api/autopilota', { autopilota: dentroAp })
  } catch (e) {
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

function vistaAutopilota(a) {
  const passi = (a.passaggi || []).map((p) => {
    const cl = 'passo passo--' + p.stato
    return '<span class="' + cl + '"><i class="passo-led"></i>' + esc(p.nome) + '</span>'
  }).join('<span class="passo-filo"></span>')
  const qui = (a.passaggi || []).find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')
  const m = a.misura || { percento: 0, dettaglio: '', di: '', tono: 'lavoro' }
  const ora = (iso) => esc(String(iso || '').slice(11, 16))

  // ── La chat con lui, in cima (0.29.0) ──
  // Arriva composta dal computer (la stessa della sezione sul PC): la tua
  // richiesta, l'intervista, le sue decisioni come note, il dialogo, la
  // domanda aperta. Qui si disegna e basta.
  const chat = (a.chat || []).map((b) => {
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
      : ''
  // La casella: con una domanda aperta e' la risposta (arriva subito alla
  // chat ferma); altrimenti si parla con lui, il supervisore, che risponde in
  // qualche minuto.
  const casella = '<div class="riga"><textarea id="dialogo-' + esc(a.id) + '" rows="2" placeholder="' +
      (a.domanda ? 'la tua risposta' : 'scrivigli: una domanda, un vincolo, un compito in più, «fermati», «riprendi»…') + '"></textarea></div>' +
    '<div class="riga">' +
      (a.domanda && a.domandaId
        ? '<button class="primario" data-ap="' + esc(a.id) + '" data-domanda="' + esc(a.domandaId) + '" onclick="rispondiAp(this.dataset.ap, this.dataset.domanda)">Rispondi</button>'
        : '<button class="primario" data-ap="' + esc(a.id) + '" onclick="dialogaAp(this.dataset.ap)">Manda</button>') +
      '<span class="sotto info-ap" title="Qui parli con l’autopilota, non con la chat che esegue. Risponde con parole sue; se è un’istruzione la applica e la consegna alla chat alla fine del turno che ha in mano. Se ha una domanda aperta, quello che scrivi è la risposta e arriva subito.">?</span>' +
    '</div>' +
    (notaDialogo ? '<div class="errore">' + esc(notaDialogo) + '</div>' : '')
  setTimeout(scorriChatAp, 0)

  // ── Le linguette, sotto ──
  const linguette = [['obiettivo', 'Obiettivo'], ['criteri', 'Criteri'], ['compiti', 'Compiti'], ['deciso', 'Ha deciso']]
  const conto = (id) => id === 'criteri' && (a.criteri || []).length
    ? ' <small>' + (a.criteri || []).filter((c) => c.soddisfatto).length + '/' + a.criteri.length + '</small>'
    : id === 'compiti' && (a.compitiDaFare || []).length ? ' <small>' + a.compitiDaFare.length + '</small>' : ''
  const barraLinguette = '<div class="linguette">' + linguette.map(([id, nome]) =>
    '<button class="linguetta' + (apTab === id ? ' linguetta--attiva' : '') + '" data-tab="' + id + '" onclick="apriTabAp(this.dataset.tab)">' + nome + conto(id) + '</button>'
  ).join('') + '</div>'

  let dentro = ''
  if (apTab === 'obiettivo') {
    // Cosa gli hai chiesto, e cosa ne ha capito. La preparazione riscrive
    // l'obiettivo con parole sue: senza le tue accanto non c'e' modo di
    // accorgersi che sta andando a fare un'altra cosa.
    const tue = a.obiettivoTuo || a.obiettivo || ''
    dentro = '<div class="serigrafia">Gli hai chiesto</div>' +
      '<div class="sotto tue-parole">' + esc(tue) + '</div>' +
      (a.obiettivo && a.obiettivo !== tue
        ? '<div class="serigrafia" style="margin-top:8px">Ha capito cosi</div>' +
          '<div class="sotto sue-parole">' + esc(a.obiettivo) + '</div>'
        : '') +
      '<div class="serigrafia" style="margin-top:10px">A che punto è</div>' +
      '<div class="misura misura--' + esc(m.tono) + '" style="margin-top:4px"><b>' + m.percento + '%</b>' +
        '<span class="sotto">' + esc(m.dettaglio) + ' · ' + esc(m.di) + '</span></div>' +
      (qui && qui.nota ? '<div class="sotto nota">' + esc(qui.nota) + '</div>' : '') +
      '<div class="sotto">' + (a.cicli || 0) + ' interventi del supervisore' +
        (a.strategia ? ' · sta provando un’altra strada: ' + esc(a.strategia) : '') + '</div>' +
      '<div class="serigrafia" style="margin-top:10px">' + ((a.chats || []).length > 1 ? 'Le sue chat' : 'La sua chat') + '</div>' +
      ((a.chats || []).length === 0
        ? '<div class="sotto">' + (a.stato === 'intervista' || a.stato === 'pronto' ? 'Non è ancora partita: nasce quando dai il via.' : 'Nessuna chat aperta adesso.') + '</div>'
        : (a.chats || []).map((ch, i) =>
          '<div class="sotto">' + (ch.stato === 'lavoro' ? '●' : ch.stato === 'bloccata' ? '◐' : '○') + ' chat ' + (i + 1) + ' · ' +
          (ch.stato === 'lavoro' ? 'al lavoro' : ch.stato === 'bloccata' ? 'ferma, aspetta una risposta' : 'finita') +
          ((a.chats || []).length > 1 ? ': ' + esc(ch.compito) : '') + '</div>').join(''))
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
    dentro = '<div class="serigrafia">Finisce quando</div>' +
      (criteri ? '<ul class="criteri">' + criteri + '</ul>' : '<div class="sotto">Ancora nessun criterio: li scrive lui alla fine della preparazione.</div>') +
      '<div class="sotto" style="margin-top:8px">Il comando sotto ogni criterio è quello che lo misura a ogni fermata. Per riscriverli usa il PC, o diglielo nella chat qui sopra.</div>'
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
      '<div class="voce"><span class="quando">' + ora(d.quando) + '</span>' +
      esc(senzaSigla(d.cosa)) + '</div>'
    ).join('')
    dentro = '<div class="serigrafia">Sta ragionando cosi</div>' +
      (decisioni || '<div class="sotto">' + (a.stato === 'intervista' ? 'Sta guardando il progetto per capire cosa serve.' : 'Ancora niente: il primo intervento arriva quando la chat si ferma.') + '</div>')
  }

  return '<div class="dettaglio">' +
    '<div class="passi">' + passi + '</div>' +
    '<div class="serigrafia" style="margin-top:10px">Chat con lui</div>' +
    '<div class="flusso-ap" id="flusso-ap">' + chat + pensa + '</div>' +
    casella +
    barraLinguette +
    '<div class="tab-ap">' + dentro + '</div>' +
    '</div>'
}

/** La chat con lui resta in fondo, come ogni chat: l'ultima cosa detta e' quella da leggere. */
function scorriChatAp() {
  const fl = document.getElementById('flusso-ap')
  if (fl) fl.scrollTop = fl.scrollHeight
}

window.apriTabAp = (t) => { apTab = t; pannello(ultimoStato) }

/**
 * Risponde alla domanda aperta dell'autopilota dalla stessa casella con cui
 * gli si parla: arriva subito alla chat ferma, non passa dal supervisore.
 */
window.rispondiAp = async (id, domanda) => {
  const campo = document.getElementById('dialogo-' + id)
  const testo = campo ? campo.value.trim() : ''
  if (!testo) return
  try {
    await chiedi('/api/rispondi', { domanda: domanda, risposta: testo })
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
    const r = await chiedi('/api/autopilota/dialogo', { autopilota: id, testo: testo })
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
  await chiedi('/api/autopilota/elimina', { autopilota: id })
  aggiorna()
}

window.riavvioAp = async (id, riprendi) => {
  await chiedi('/api/autopilota/riavvio', { autopilota: id, riprendi: riprendi })
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

window.apriPannello = async (quale) => {
  pannelloAperto = pannelloAperto === quale ? null : quale
  if (pannelloAperto === 'sessioni' && !sessioniViste) {
    try { sessioniViste = (await chiedi('/api/sessioni')).sessioni || [] } catch (e) { sessioniViste = [] }
  }
  if (pannelloAperto === 'consumi') await leggiConsumi()
  if (pannelloAperto === 'pc') { pcAperto = null; postaVoci = null; await leggiPc() }
  if (pannelloAperto === 'drive') { driveRiavviato = false; await leggiDrive() }
  if (pannelloAperto === 'impostazioni') { await leggiPreferenze(); await leggiAggiornamento() }
  if (pannelloAperto === 'quaderno') {
    schedaAperta = null
    // La stessa cartella da cui poi si aprono le schede (cartellaPrima):
    // prima l'elenco veniva dalla prima chat e la scheda si chiedeva alla
    // cartella dell'autopilota, e con due progetti diversi era un 404 muto.
    const c = cartellaPrima()
    if (c) await leggiQuaderno(c)
  }
  pannello(ultimoStato)
}

/** Riapre una chat salvata in un workspace: la si vede nell'elenco, la si tocca. */
window.riprendiSalvata = async (cwd, sessione) => {
  await chiedi('/api/sessioni/riprendi', { cartella: cwd, sessione: sessione })
  aggiorna()
}

/** Riprende **quella** conversazione, con la sua storia dentro. */
window.riprendiSessione = async (i) => {
  const s = (sessioniViste || [])[i]
  if (!s) return
  await chiedi('/api/sessioni/riprendi', { cartella: s.cwd, sessione: s.id })
  pannelloAperto = null
  aggiorna()
}

/** La coda condivisa di un progetto: si legge dal Drive attraverso il computer. */
async function leggiPc() {
  try {
    const r = await chiedi('/api/pc')
    pcVisti = r.pc || []
    if (r.disponibile === false) postaErrore = 'Questo computer non sa ancora mandare azioni a un altro PC: aggiornalo.'
  } catch (e) { pcVisti = []; postaErrore = 'Non sono riuscito a leggere gli altri PC.' }
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
// La cassetta cambia dal PC destinatario (consegnata, fallita): si rilegge.
setInterval(async () => {
  if (pannelloAperto !== 'pc' || !chiave) return
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
  if (pannelloAperto !== 'drive' || !chiave) return
  try { driveLavoro = await chiedi('/api/drive/lavoro') } catch (e) { return }
  const adesso = !!(driveLavoro && driveLavoro.inCorso)
  if (driveEraInCorso && !adesso) { driveInCorso = null; await leggiDrive() }
  driveEraInCorso = adesso
  pannello(ultimoStato)
}, 2000)

// La coda condivisa cambia dal computer (una voce consegnata): si rilegge
// ogni dieci secondi finche' e' aperta, come fa l'app.
setInterval(async () => {
  if (pannelloAperto !== 'code' || codaProgetto === null || !chiave) return
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

window.eliminaWorkspace = async (nome) => {
  if (confermando !== 'ws-' + nome) { chiedeConferma('ws-' + nome); return }
  confermando = null
  await chiedi('/api/workspace/elimina', { nome: nome })
  aggiorna()
}

/** Il pannello in fondo che si apre: uno per volta, e il tasto lo richiude. */
window.apriPannello = window.apriPannello

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

/** La cartella della prima chat aperta: e' quella di cui si guarda il quaderno. */
/**
 * Di quale cartella parla il Quaderno.
 *
 * Di quella dell'autopilota che stai guardando, quando ne stai guardando uno:
 * il quaderno e' cio' che **lui** produce, e sta accanto al lavoro che l'ha
 * scritto. Prima prendeva sempre la cartella della prima chat dell'elenco, che
 * con due progetti aperti e' semplicemente un'altra cosa.
 */
function cartellaPrima() {
  const suo = ((ultimoStato || {}).autopiloti || []).find((a) => a.id === dentroAp)
  if (suo && suo.cwd) return suo.cwd
  const prima = ((ultimoStato || {}).chat || [])[0]
  return prima ? prima.cwd : ''
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
  if (a.fase === 'aggiornato') return 'È all’ultima versione.'
  if (a.fase === 'fermo') return 'Controlla da sé ogni sei ore. Non ha ancora guardato: «Cerca ora» lo fa subito.'
  // Fra «Installa» e il computer che si chiude adesso c'e' un'attesa vera: le
  // chat che stanno lavorando devono finire quello che hanno in mano. Senza
  // dirlo, da qui si vede un tasto premuto e nient'altro.
  if (a.fase === 'attendo') {
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

function limitiHtml(c) {
  var l = c && c.limiti
  var barra = function (nome, f, spiega) {
    var p = f ? Math.round(f.percento) : 0
    var colore = p >= 95 ? '#dc5f5f' : p >= 80 ? '#e0a33c' : '#4aa3ff'
    var quando = f && f.resettaIl ? ' \u00b7 si azzera ' + new Date(f.resettaIl).toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
    return '<div style="margin-top:10px"><div class="sotto"><b>' + nome + '</b>: ' + (f ? p + '% usato' + quando : 'non ancora letta') + '</div>' +
      '<div class="barra"><i style="width:' + p + '%;background:' + colore + '"></i></div><div class="sotto">' + spiega + '</div></div>'
  }
  var spesa = c && c.costo
    ? '<div class="sotto" style="margin-top:10px"><b>Spesa stimata da Claude Code</b>: oggi ' + c.costo.oggi.toFixed(2) + ' $, 7 giorni ' + c.costo.settimana.toFixed(2) + ' $. Con un abbonamento \u00e8 un\u2019indicazione, non una fattura.</div>'
    : ''
  return '<div class="solco"></div><div class="serigrafia">LIMITI DEL PIANO</div>' +
    barra('Finestra di 5 ore', l && l.cinqueOre, 'Al 100% le chat si fermano fino all\u2019azzeramento.') +
    barra('Settimana', l && l.settimana, 'Il tetto settimanale su tutti i modelli.') +
    (l ? '<div class="sotto" style="margin-top:6px">Letti alle ' + new Date(l.letti).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ': sono gli stessi numeri di /usage.</div>'
      : '<div class="sotto" style="margin-top:6px">Arrivano dalla riga di stato di Claude Code dopo la prima risposta di una chat aperta dal computer (solo con abbonamento Pro o Max).</div>') +
    spesa
}

window.leggiConsumi = async () => {
  try { consumiVisti = await chiedi('/api/consumi') } catch (e) { consumiVisti = null }
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

window.scaricaAggiornamento = async () => {
  await chiedi('/api/aggiornamento/scarica', {})
  await leggiAggiornamento()
  pannello(ultimoStato)
}

/**
 * Installare chiude il programma sul computer, con le chat aperte dentro: e' la
 * cosa piu' invasiva che si possa chiedere da un telefono, e infatti si chiede
 * due volte.
 */
window.installaAggiornamento = async () => {
  if (confermando !== 'agg') { chiedeConferma('agg'); return }
  confermando = null
  await chiedi('/api/aggiornamento/installa', {})
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
window.scegliIn = async (chat, testo) => {
  const voce = (domandeViste || []).find((v) => v.tipo === 'scelta' && v.chat === chat)
  try {
    var esito = await chiedi('/api/scegli', { chat: chat, opzione: testo })
    if (esito && esito.errore) notaGlobale = String(esito.errore).indexOf('mandata') >= 0 ? 'Gi\u00e0 mandata: aspetta che lo schermo cambi.' : 'La scelta \u00e8 cambiata mentre toccavi: fra un attimo si aggiorna.'
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
    await chiedi('/api/scrivi', { chat: chat, testo: campo.value })
    if (voce) domandeMandate[chiaveVoce(voce)] = campo.value.slice(0, 80)
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
  try {
    await chiedi('/api/scrivi', { chat: id, testo: campo.value })
    campo.value = ''
    notaScelta = null
  } catch (e) {
    notaScelta = 'Non sono riuscito a mandarlo: il computer non risponde.'
    pannello(ultimoStato)
  }
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
        ? 'Gia mandata: aspetta che lo schermo cambi.'
        : 'La scelta e cambiata mentre toccavi: guarda di nuovo.'
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

window.vaiScheda = (nome) => {
  if (scheda === nome) return
  scheda = nome
  if (nome === 'domande') { domandeViste = null; leggiDomande() }
  // Un pannello aperto appartiene alla schermata in cui e' stato aperto: se lo
  // si lascia aperto cambiando destinazione, ricompare dove non c'entra.
  pannelloAperto = null
  dentro = null
  dentroAp = null
  try { history.pushState({ scheda: nome }, '') } catch (e) { /* niente cronologia, pazienza */ }
  pannello(ultimoStato)
}

window.addEventListener('popstate', (ev) => {
  // Indietro: prima si chiude quello che si sta guardando, poi si torna alla
  // destinazione precedente. Uscire dall'app resta l'ultima delle possibilita'.
  if (dentro || dentroAp || schedaAperta || pannelloAperto) {
    dentro = null; dentroAp = null; schedaAperta = null; pannelloAperto = null
    pannello(ultimoStato)
    return
  }
  const dove = (ev.state && ev.state.scheda) || 'adesso'
  scheda = dove
  pannello(ultimoStato)
})

window.vaiA = async (nome) => { await chiedi('/api/workspace', { nome }); aggiorna() }
window.fermaAp = async (id) => { await chiedi('/api/autopilota/ferma', { autopilota: id }); aggiorna() }
window.riprendiAp = async (id) => { await chiedi('/api/autopilota/riprendi', { autopilota: id }); aggiorna() }
// Il via a chi si e' preparato: dal telefono come dal computer, perche' e' li'
// che si scopre di averlo pronto mentre si e' altrove.
window.vaiAp = async (id) => { await chiedi('/api/autopilota/vai', { autopilota: id }); aggiorna() }

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
    '--t0': '11px', '--t1': '13px', '--t2': '15px', '--t3': '17px', '--t4': '22px',
    '--s1': '6px', '--s2': '12px', '--s3': '18px', '--s4': '28px'
  },
  // Il Foglio sale con lo stesso rapporto: la sua gerarchia e' il testo, non
  // avendo ne' rilievi ne' solchi, e comprimerla lo renderebbe illeggibile.
  foglio: {
    '--t0': '12px', '--t1': '14px', '--t2': '16px', '--t3': '19px', '--t4': '26px',
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

/**
 * Avvisa quando l'autopilota ha bisogno di te.
 *
 * Le stesse due cose che annuncia l'app Android: una domanda che aspetta, e un
 * lavoro che si e' fermato. Non «sta lavorando», che non richiede niente a
 * nessuno - un avviso che non chiede niente insegna a ignorare quelli che
 * chiedono.
 */
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
    for (const d of (stato.domande || [])) {
      if (avvisati['d-' + d.id]) continue
      avvisati['d-' + d.id] = true
      new Notification('SierraDeck ti sta chiedendo una cosa', { body: d.testo, tag: d.id })
    }
    const nuovo = !primoAvviso
    for (const a of (stato.autopiloti || [])) {
      if (a.stato !== 'sospeso' && a.stato !== 'fallito' && a.stato !== 'finito') continue
      if (avvisati['f-' + a.id + a.stato]) continue
      avvisati['f-' + a.id + a.stato] = true
      if (!nuovo) continue
      if (a.stato === 'finito') new Notification(a.nome + ' ha finito', { body: 'Il lavoro è concluso: puoi guardare il risultato.', tag: a.id })
      else new Notification(a.nome + ' si è fermato', { body: a.motivo || 'Serve una tua occhiata.', tag: a.id })
    }
    // Una chat tua che ha finito di scrivere e aspetta te: e' la sola notizia
    // di una chat che valga un avviso (l'app lo fa gia'). Si annuncia il
    // fronte, non lo stato: finche' resta ferma non si ripete.
    for (const c of (stato.chat || [])) {
      const chiaveChat = 'a-' + c.id
      if (c.aspetta === true && c.governata !== true) {
        if (avvisati[chiaveChat]) continue
        avvisati[chiaveChat] = true
        if (nuovo) new Notification((c.titolo || 'Una chat') + ' aspetta te', { body: c.ultimaRiga || 'Ha finito di scrivere.', tag: 'chat-' + c.id })
      } else {
        delete avvisati[chiaveChat]
      }
    }
    primoAvviso = false
  } catch (e) { }
}

async function aggiorna() {
  try {
    if (!chiave) { await accoppiaDalQr() }
    if (!chiave) { ingresso(); return }
    const stato = await chiedi('/api/stato')
    // Ha risposto: da qui in poi quello che si vede e' di adesso.
    ultimoContatto = Date.now()
    // L'aggiornamento viaggia con il polso apposta, e la pagina lo ignorava:
    // la percentuale non avanzava, il LED di «Computer» si accendeva solo
    // aprendo Impostazioni, un'installazione partita dal PC non si vedeva.
    if (stato && stato.aggiornamento) aggiornamentoVisto = stato.aggiornamento
    giriFalliti = 0
    avvisaSeServe(stato)
    if (dentroAp) await leggiAp()
    // Se si sta guardando dentro una chat, anche quelle righe si rinfrescano:
    // guardare qualcosa di fermo mentre il resto si muove sarebbe peggio che
    // non guardare.
    await leggiDentro()
    pannello(stato)
  } catch (e) {
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
  }
}

// Se qualcosa esplode prima ancora di disegnare - un errore di sintassi, una
// funzione che non c'e' - almeno si vede perche', invece di uno schermo nero.
window.addEventListener('error', (ev) => {
  if (!app.innerHTML.trim()) {
    app.innerHTML = '<div class="ingresso"><div style="font-size:19px">SierraDeck</div>' +
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
setInterval(() => { if (chiave && !document.hidden) aggiorna() }, 2000)
setInterval(() => { if (chiave && !document.hidden && scheda === 'domande') leggiDomande() }, 2000)
</script>
</body>
</html>`
}
