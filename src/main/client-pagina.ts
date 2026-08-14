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
    --accento: #4aa3ff;
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
  main { padding: 14px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .piastrella { min-width: 0; }
  .piastrella {
    background: var(--chassis); border: 1px solid var(--bordo); border-radius: 14px; padding: 14px 16px;
  }
  .titolo { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .sotto { font-size: 13px; color: var(--testo-quieto); }
  .barra { height: 5px; border-radius: 3px; background: var(--bordo); margin-top: 10px; overflow: hidden; }
  .barra > i { display: block; height: 100%; background: var(--verde); }
  .led { width: 9px; height: 9px; border-radius: 50%; display: inline-block; margin-right: 7px; }
  .lavoro { background: var(--verde) } .attesa { background: var(--ambra) } .fermo { background: var(--spento) }
  .chiede { border-color: var(--ambra); }
  /* Bersagli grandi: si usa in piedi, con una mano, e un tasto piccolo su un
     telefono e' un tasto che si sbaglia. */
  button, input, textarea {
    font: inherit; border-radius: 10px; border: 1px solid var(--luce-incisione);
    background: var(--chassis-premuto); color: inherit; padding: 12px 14px;
  }
  button { background: var(--chassis-alto); min-height: 48px; }
  button.primario {
    background: var(--primario, #3a4046); border-color: var(--primario-alto, #4a5057);
    color: var(--testo); font-weight: 600; width: 100%;
  }
  .riga { display: flex; gap: 8px; margin-top: 10px; }
  .riga > input, .riga > textarea { flex: 1; min-width: 0; }
  .ws { display: flex; gap: 8px; flex-wrap: wrap; }
  .ws button { padding: 10px 14px; min-height: 44px; }
  .ws button.attivo { border-color: var(--accento); color: #fff; }
  .vuoto { color: var(--testo-quieto); text-align: center; padding: 30px 10px; }
  .ingresso { max-width: 380px; margin: 40px auto; padding: 0 18px; text-align: center; }
  .ingresso input { width: 100%; text-align: center; font-size: 26px; letter-spacing: .3em; margin: 16px 0; }
  .errore { color: var(--ambra); font-size: 13px; margin-top: 8px; }
  .panoramica { background: #131518; }
  /* Un collegamento che sembra un tasto: l'attributo download fa partire il
     file invece di aprire una pagina, e da un telefono e' la differenza fra
     scaricare l'app e trovarsi davanti a un elenco di file da capire. */
  .tasto-link {
    display: inline-flex; align-items: center; justify-content: center;
    /* Largo quanto il suo testo, come tutti gli altri tasti: con flex: 1
       prendeva tutto lo spazio che il tasto accanto non voleva, e diventava
       una fascia azzurra larga quanto lo schermo. */
    flex: 0 1 auto; min-width: 0; min-height: 48px; padding: 12px 14px; border-radius: 10px;
    background: var(--accento); border: 1px solid var(--accento); color: #fff; text-decoration: none;
  }
  /* L'ultima riga del terminale: si guarda passando, quindi carattere fisso e
     una riga sola - se andasse a capo diventerebbe una lettura. */
  .battito {
    margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: var(--fondo-cupo);
    font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--testo-quieto);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* Le ultime righe, quando si chiede di guardare dentro. Qui il testo va a
     capo davvero: non e' piu' un colpo d'occhio, e' la cosa che si sta
     leggendo per decidere se serve intervenire. */
  .dentro {
    margin-top: 8px; padding: 10px; border-radius: 8px; background: var(--fondo-cupo);
    font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--testo);
    white-space: pre-wrap; word-break: break-word; max-height: 45vh; overflow-y: auto; margin-bottom: 0;
  }
  /* Le cartelle in cui aprire: bersagli larghi, uno per riga - si sceglie con
     il pollice, non con il mouse. */
  .cartella {
    display: block; width: 100%; text-align: left; margin-top: 6px;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px;
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
/** L'autopilota che si sta guardando dentro, e tutto quello che si sa di lui. */
var dentroAp = null
var apDettaglio = null
/** Il pannello aperto in fondo: le conversazioni, i salvataggi, o niente. */
var pannelloAperto = null
var sessioniViste = null
var salvataggiVisti = null
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
const esc = (t) => String(t == null ? '' : t).replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))

async function chiedi(percorso, corpo) {
  const r = await fetch(percorso, {
    method: corpo ? 'POST' : 'GET',
    headers: chiave ? { 'x-sierradeck-chiave': chiave, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  })
  if (r.status === 401) { chiave = ''; localStorage.removeItem(CHIAVE); ingresso('Questo dispositivo non è più riconosciuto.'); throw new Error('401') }
  return r.json()
}

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

function pannello(s) {
  ultimoStato = s
  const attivo = document.activeElement
  const staScrivendo = attivo && (attivo.tagName === 'INPUT' || attivo.tagName === 'TEXTAREA')
  // Chi sta scrivendo ha ragione: la pagina puo' aspettare due secondi.
  if (staScrivendo) return

  // «pronto» e' ambra come l'attesa, ed e' la stessa cosa: la macchina e' ferma
  // e aspetta te. Verde direbbe che sta lavorando, e non ha ancora scritto una
  // riga.
  const led = (st) =>
    st === 'lavoro' ? 'lavoro' : (st === 'attesa' || st === 'pronto') ? 'attesa' : 'fermo'
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
  const panoramica = \`
    <div class="piastrella panoramica">
      <div class="numeri">
        <div class="numero"><b>\${(s.chat || []).length}</b><span>chat</span></div>
        <div class="numero"><b class="v">\${alLavoro}</b><span>al lavoro</span></div>
        <div class="numero"><b class="\${inAttesa ? 'a' : ''}">\${inAttesa}</b><span>ti aspettano</span></div>
        <div class="numero"><b>\${finiti}</b><span>finiti</span></div>
      </div>
      \${criteriTot ? '<div class="barra"><i style="width:' + avanzamento + '%"></i></div>' +
        '<div class="sotto" style="margin-top:6px">' + criteriFatti + ' criteri su ' + criteriTot + ' — ' + avanzamento + '%</div>' : ''}
    </div>\`

  const domande = (s.domande || []).map((d) => \`
    <div class="piastrella chiede">
      <div class="titolo">Ti stanno chiedendo una cosa</div>
      <div class="sotto">\${esc(d.testo)}</div>
      <div class="riga">
        <textarea id="r-\${esc(d.id)}" rows="2" placeholder="la tua risposta"></textarea>
      </div>
      <div class="riga"><button class="primario" onclick="rispondi('\${esc(d.id)}')">Rispondi</button></div>
    </div>\`).join('')

  const autopiloti = (s.autopiloti || []).map((a) => {
    const dentro = dentroAp === a.id && apDettaglio ? vistaAutopilota(apDettaglio) : ''
    return \`
    <div class="piastrella">
      <div class="titolo"><span class="led \${led(a.stato)}"></span>\${esc(a.nome)}</div>
      <div class="sotto">\${esc(a.strategia ? 'bloccato, provo: ' + a.strategia : a.stato)} · \${a.fatti}/\${a.criteri} criteri · \${a.cicli} interventi</div>
      <div class="barra"><i style="width:\${a.criteri ? Math.round(a.fatti / a.criteri * 100) : 0}%"></i></div>
      \${dentro}
      <div class="riga">
        \${a.stato === 'pronto'
          ? '<button onclick="vaiAp(\\'' + esc(a.id) + '\\')">Vai</button>'
          : a.stato === 'lavoro' || a.stato === 'attesa'
            ? '<button onclick="fermaAp(\\'' + esc(a.id) + '\\')">Ferma</button>'
            : '<button onclick="riprendiAp(\\'' + esc(a.id) + '\\')">Riprendi</button>'}
        \${dentroAp === a.id
          ? '<button onclick="chiudiAp()">Basta guardare</button>'
          : '<button onclick="guardaAp(\\'' + esc(a.id) + '\\')">Guarda dentro</button>'}
      </div>
    </div>\`
  }).join('')

  const chat = (s.chat || []).map((c) => \`
    <div class="piastrella">
      <div class="titolo">\${esc(c.titolo)}</div>
      <div class="sotto">\${esc(c.cwd)}</div>
      \${dentro === c.id
        ? '<div class="dentro">' + (righeGrezze.length
            // Vestite: il verde di un test passato e il rosso di uno fallito
            // sono meta' di quello che dice come sta andando.
            ? ansiInHtml(righeGrezze.join(String.fromCharCode(10)))
            : righeDentro.length ? esc(righeDentro.join(String.fromCharCode(10)))
            : 'Ancora niente da mostrare.') + '</div>'
        : (c.ultimaRiga ? '<div class="battito">' + esc(c.ultimaRiga) + '</div>' : '')}
      <div class="riga">
        <input id="t-\${esc(c.id)}" placeholder="scrivi qui e invia">
        <button onclick="scrivi('\${esc(c.id)}')">Invia</button>
      </div>
      <div class="riga">
        \${dentro === c.id
          ? '<button onclick="chiudiDentro()">Basta guardare</button>'
          : '<button onclick="guarda(\\'' + esc(c.id) + '\\')">Guarda dentro</button>'}
      </div>
      <div class="riga">
        <input id="n-\${esc(c.id)}" placeholder="dalle un nome">
        <button onclick="rinomina('\${esc(c.id)}')">Nome</button>
        <button class="\${confermando === 'chat-' + c.id ? 'pericolo' : ''}"
          onclick="chiudiChat('\${esc(c.id)}')">\${confermando === 'chat-' + c.id ? 'Sicuro? Chiudi' : 'Chiudi'}</button>
      </div>
    </div>\`).join('')

  // Aprire non distrugge niente: nel peggiore dei casi resta un riquadro in
  // piu' da chiudere al computer. Ed e' la differenza fra guardare da fuori e
  // poter cominciare qualcosa da fuori.
  const nuova = cartelle === null || delegando
    ? '<div class="piastrella"><div class="riga"><button onclick="scegliCartella()">Apri una chat nuova</button></div></div>'
    : \`<div class="piastrella">
         <div class="titolo">In quale cartella?</div>
         <div class="sotto">Solo quelle che Claude Code conosce gia'.</div>
         \${cartelle.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessuna cartella conosciuta.</div>' : ''}
         \${cartelle.map((c, i) =>
           // Per indice, non per percorso: un percorso di Windows dentro
           // un onclick vorrebbe dire raddoppiare i backslash e sperare che
           // non contenga apici. L'indice non ha niente da sfuggire.
           '<button class="cartella" onclick="apriIn(' + i + ')">' + esc(c) + '</button>').join('')}
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
           <textarea id="delega-obiettivo" rows="3" placeholder="es. trova e sistema i test che falliscono a caso"></textarea>
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
      <div class="sotto">Quelle che il computer conosce, dalla piu' recente.</div>
      \${(sessioniViste || []).length === 0
        ? '<div class="sotto" style="margin-top:8px">Nessuna conversazione trovata.</div>'
        : (sessioniViste || []).slice(0, 20).map((x, i) =>
            '<button class="cartella" onclick="riprendiSessione(' + i + ')">' +
            esc(x.titolo) + '<br><span class="sotto">' + esc(x.cwd) + '</span></button>').join('')}
      <div class="riga"><button onclick="apriPannello('sessioni')">Chiudi</button></div>
    </div>\`

  const elencoSalvataggi = pannelloAperto !== 'salvataggi' ? '' : \`
    <div class="piastrella">
      <div class="titolo">Salvataggi</div>
      <div class="sotto">Rimettono in piedi un insieme di chat, tutte insieme.</div>
      \${(salvataggiVisti || []).length === 0
        ? '<div class="sotto" style="margin-top:8px">Nessun salvataggio.</div>'
        : (salvataggiVisti || []).map((x, i) =>
            '<button class="cartella ' + (confermando === 'sal-' + x.nome ? 'pericolo' : '') +
            '" onclick="caricaSalvataggio(' + i + ')">' +
            (confermando === 'sal-' + x.nome ? 'Sicuro? Sostituisce le chat aperte' : esc(x.nome)) +
            '<br><span class="sotto">' + x.chat + ' chat</span></button>').join('')}
      <div class="riga"><button onclick="apriPannello('salvataggi')">Chiudi</button></div>
    </div>\`

  const vistaConsumi = pannelloAperto !== 'consumi' ? '' : \`
    <div class="piastrella">
      <div class="titolo">Consumi</div>
      \${consumiVisti === null
        ? '<div class="sotto">Non sono riuscito a leggerli.</div>'
        : '<div class="numeri" style="margin-top:12px">' +
          '<div class="numero"><b>' + esc(soldi(consumiVisti.oggi)) + '</b><span>oggi</span></div>' +
          '<div class="numero"><b>' + esc(soldi(consumiVisti.settimana)) + '</b><span>7 giorni</span></div>' +
          '<div class="numero"><b>' + esc(soldi(consumiVisti.mese)) + '</b><span>30 giorni</span></div>' +
          '</div>'}
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
                '<button class="cartella" onclick="apriScheda(\\'' + esc(cartellaPrima()) + '\\', \\'' +
                esc(x.file) + '\\')">' + esc(x.titolo) + '</button>').join(''))}
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
            (confermando === 'agg' ? 'Sicuro? Chiude le chat' : 'Installa') + '</button>' : ''}
        <button onclick="apriPannello('impostazioni')">Chiudi</button>
      </div>
    </div>\`

  const ws = (s.workspace && s.workspace.nomi || []).map((n) => \`
    <button class="\${n === s.workspace.attivo ? 'attivo' : ''}" onclick="vaiA('\${esc(n)}')">\${esc(n)}</button>\`).join('')

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

  app.innerHTML = \`
    <header><b>SIERRADECK</b><span>\${(s.chat || []).length} chat · \${(s.autopiloti || []).length} autopiloti</span></header>
    <main>
      \${invito}
      \${panoramica}
      \${domande}
      \${ws ? '<div class="piastrella"><div class="titolo">Workspace</div><div class="ws" style="margin-top:10px">' + ws + '</div>' +
        '<div class="riga"><input id="ws-nuovo" placeholder="un workspace nuovo">' +
        '<button onclick="creaWorkspace()">Crea</button></div></div>' : ''}
      \${autopiloti || ''}
      \${chat || (autopiloti ? '' : '<div class="vuoto">Nessuna chat aperta sul computer.</div>')}
      \${nuova}
      \${delega}
      <div class="piastrella">
        <div class="riga">
          <button onclick="apriPannello('sessioni')">Riprendi</button>
          <button onclick="apriPannello('salvataggi')">Salvataggi</button>
          <button onclick="apriPannello('consumi')">Consumi</button>
        </div>
        <div class="riga">
          <button onclick="apriPannello('quaderno')">Quaderno</button>
          <button onclick="apriPannello('impostazioni')">Impostazioni</button>
        </div>
      </div>
      \${elencoSessioni}
      \${elencoSalvataggi}
      \${vistaConsumi}
      \${vistaQuaderno}
      \${vistaImpostazioni}
    </main>\`

  for (const id in scritti) {
    const campo = document.getElementById(id)
    if (campo) campo.value = scritti[id]
  }
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
  await leggiDentro()
  pannello(ultimoStato)
}
window.chiudiDentro = () => { dentro = null; righeDentro = []; righeGrezze = []; pannello(ultimoStato) }

async function leggiDentro() {
  if (!dentro) return
  try {
    const r = await chiedi('/api/dentro', { chat: dentro })
    righeDentro = r.righe || []
    righeGrezze = r.grezze || []
  } catch (e) {
    // Una chat chiusa al computer mentre la si guardava: si torna all'elenco
    // invece di restare su un riquadro che non esiste piu'.
    dentro = null
    righeDentro = []
    righeGrezze = []
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
function vistaAutopilota(a) {
  const passi = (a.passaggi || []).map((p) => {
    const cl = 'passo passo--' + p.stato
    return '<span class="' + cl + '"><i class="passo-led"></i>' + esc(p.nome) + '</span>'
  }).join('<span class="passo-filo"></span>')
  const qui = (a.passaggi || []).find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')
  const m = a.misura || { percento: 0, dettaglio: '', di: '', tono: 'lavoro' }
  const criteri = (a.criteri || []).map((c) =>
    '<li class="' + (c.soddisfatto ? 'fatto' : '') + '">' + (c.soddisfatto ? '✓ ' : '· ') + esc(c.descrizione) + '</li>'
  ).join('')
  const decisioni = (a.decisioni || []).slice(-6).reverse().map((d) =>
    '<div class="voce"><span class="quando">' + esc(String(d.quando || '').slice(11, 16)) + '</span>' + esc(d.cosa) + '</div>'
  ).join('')
  return '<div class="dettaglio">' +
    '<div class="passi">' + passi + '</div>' +
    (qui && qui.nota ? '<div class="sotto nota">' + esc(qui.nota) + '</div>' : '') +
    '<div class="misura misura--' + esc(m.tono) + '"><b>' + m.percento + '%</b>' +
      '<span class="sotto">' + esc(m.dettaglio) + ' · ' + esc(m.di) + '</span></div>' +
    (criteri ? '<ul class="criteri">' + criteri + '</ul>' : '') +
    (decisioni ? '<div class="serigrafia" style="margin-top:10px">Ha deciso</div>' + decisioni : '') +
    '</div>'
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
  if (pannelloAperto === 'salvataggi' && !salvataggiVisti) {
    try { salvataggiVisti = (await chiedi('/api/salvataggi')).salvataggi || [] } catch (e) { salvataggiVisti = [] }
  }
  if (pannelloAperto === 'consumi') await leggiConsumi()
  if (pannelloAperto === 'impostazioni') { await leggiPreferenze(); await leggiAggiornamento() }
  if (pannelloAperto === 'quaderno') {
    schedaAperta = null
    const prima = (ultimoStato.chat || [])[0]
    if (prima) await leggiQuaderno(prima.cwd)
  }
  pannello(ultimoStato)
}

/** Riprende **quella** conversazione, con la sua storia dentro. */
window.riprendiSessione = async (i) => {
  const s = (sessioniViste || [])[i]
  if (!s) return
  await chiedi('/api/sessioni/riprendi', { cartella: s.cwd, sessione: s.id })
  pannelloAperto = null
  aggiorna()
}

window.caricaSalvataggio = async (i) => {
  const s = (salvataggiVisti || [])[i]
  if (!s) return
  if (confermando !== 'sal-' + s.nome) { chiedeConferma('sal-' + s.nome); return }
  confermando = null
  await chiedi('/api/salvataggi/carica', { nome: s.nome })
  pannelloAperto = null
  aggiorna()
}

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

/** Una cifra in euro, o un trattino se non c'e' niente da dire. */
function soldi(v) {
  if (!v && v !== 0) return '—'
  const n = typeof v === 'object' ? (v.costo != null ? v.costo : v.totale) : v
  if (typeof n !== 'number') return '—'
  return '$' + (n < 10 ? n.toFixed(2) : Math.round(n))
}

/** La cartella della prima chat aperta: e' quella di cui si guarda il quaderno. */
function cartellaPrima() {
  const prima = ((ultimoStato || {}).chat || [])[0]
  return prima ? prima.cwd : ''
}

/** A che punto e' l'aggiornamento del computer, detto in italiano. */
function descriviAggiornamento() {
  const a = aggiornamentoVisto
  if (!a) return 'Non lo so.'
  if (a.fase === 'disponibile') return 'C’è la ' + (a.versione || 'versione nuova') + '.'
  if (a.fase === 'scarico') return 'Sto scaricando… ' + (a.percento || 0) + '%'
  if (a.fase === 'pronto') return 'Pronta da installare: ' + (a.versione || '') + '.'
  if (a.fase === 'errore') return 'Qualcosa non ha funzionato: ' + (a.errore || '')
  if (a.fase === 'cerco') return 'Sto guardando se ce n’è una nuova…'
  return 'Sei alla versione più recente.'
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

window.rispondi = async (id) => {
  const campo = document.getElementById('r-' + id)
  if (!campo || !campo.value.trim()) return
  await chiedi('/api/rispondi', { domanda: id, risposta: campo.value })
  aggiorna()
}
window.scrivi = async (id) => {
  const campo = document.getElementById('t-' + id)
  if (!campo || !campo.value.trim()) return
  await chiedi('/api/scrivi', { chat: id, testo: campo.value })
  campo.value = ''
}
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
async function vestiti() {
  try {
    const s = await chiedi('/api/stile')
    for (const nome in (s.token || {})) {
      document.documentElement.style.setProperty(nome, s.token[nome])
    }
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
function chiediDiAvvisare() {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') Notification.requestPermission()
  } catch (e) { }
}

/** Gli avvisi gia' dati: la stessa domanda non si annuncia due volte. */
var avvisati = {}

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
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const d of (stato.domande || [])) {
      if (avvisati['d-' + d.id]) continue
      avvisati['d-' + d.id] = true
      new Notification('SierraDeck ti sta chiedendo una cosa', { body: d.testo, tag: d.id })
    }
    for (const a of (stato.autopiloti || [])) {
      if (a.stato !== 'sospeso' && a.stato !== 'fallito') continue
      if (avvisati['f-' + a.id + a.stato]) continue
      avvisati['f-' + a.id + a.stato] = true
      new Notification(a.nome + ' si e fermato', { body: 'Serve una tua occhiata.', tag: a.id })
    }
  } catch (e) { }
}

async function aggiorna() {
  try {
    if (!chiave) { await accoppiaDalQr() }
    if (!chiave) { ingresso(); return }
    const stato = await chiedi('/api/stato')
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
    if (!app.innerHTML.trim()) ingresso('Non riesco a parlare con il computer: ' + (e && e.message ? e.message : e))
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
</script>
</body>
</html>`
}
