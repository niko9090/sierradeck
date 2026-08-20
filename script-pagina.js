
// L'interprete dei colori del terminale. Vive in un modulo suo, con i suoi
// test, e qui dentro ci arriva per intero: quello che gira nel telefono e'
// esattamente il codice che e' stato verificato.
function ansiInHtml(grezzo) {
  const COLORI = [
    "#2b2f33",
    "#dc5f5f",
    "#54c07a",
    "#e0a33c",
    "#5b9bd5",
    "#b48ead",
    "#4db6ac",
    "#c8ced4",
    "#5a6169",
    "#e87d7d",
    "#7fd3a0",
    "#f0bc63",
    "#7fb8e8",
    "#cba6c3",
    "#6fd0c6",
    "#eef2f6"
  ];
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let colore = "";
  let sfondo = "";
  let grassetto = false;
  let tenue = false;
  let aperti = 0;
  let fuori = "";
  const stile = () => {
    const parti2 = [];
    if (colore !== "") parti2.push(`color:${colore}`);
    if (sfondo !== "") parti2.push(`background:${sfondo}`);
    if (grassetto) parti2.push("font-weight:600");
    if (tenue) parti2.push("opacity:.65");
    return parti2.join(";");
  };
  const apri = () => {
    const s = stile();
    if (s === "") return;
    fuori += `<span style="${s}">`;
    aperti += 1;
  };
  const chiudi = () => {
    while (aperti > 0) {
      fuori += "</span>";
      aperti -= 1;
    }
  };
  const parti = grezzo.split(/\[/);
  fuori += esc(parti[0] ?? "");
  for (let i = 1; i < parti.length; i += 1) {
    const pezzo = parti[i] ?? "";
    const fine = /[a-zA-Z]/.exec(pezzo);
    if (fine === null) {
      fuori += esc(pezzo);
      continue;
    };
    const comando = pezzo[fine.index];
    const codici = pezzo.slice(0, fine.index);
    const resto = pezzo.slice(fine.index + 1);
    if (comando === "m") {
      chiudi();
      const numeri = codici === "" ? [0] : codici.split(";").map((n) => Number.parseInt(n, 10) || 0);
      for (let k = 0; k < numeri.length; k += 1) {
        const n = numeri[k];
        if (n === 0) {
          colore = "";
          sfondo = "";
          grassetto = false;
          tenue = false;
        } else if (n === 1) grassetto = true;
        else if (n === 2) tenue = true;
        else if (n === 22) {
          grassetto = false;
          tenue = false;
        } else if (n === 39) colore = "";
        else if (n === 49) sfondo = "";
        else if (n >= 30 && n <= 37) colore = COLORI[n - 30];
        else if (n >= 90 && n <= 97) colore = COLORI[n - 90 + 8];
        else if (n >= 40 && n <= 47) sfondo = COLORI[n - 40];
        else if (n >= 100 && n <= 107) sfondo = COLORI[n - 100 + 8];
        else if ((n === 38 || n === 48) && numeri[k + 1] === 5) {
          const indice = numeri[k + 2] ?? 0;
          const scelto = indice < 16 ? COLORI[indice] : indice < 232 ? COLORI[8 + indice % 8] : indice < 244 ? COLORI[8] : COLORI[15];
          if (n === 38) colore = scelto;
          else sfondo = scelto;
          k += 2;
        }
      };
      apri();
    };
    fuori += esc(resto);
  };
  chiudi();
  return fuori;
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
  app.innerHTML = `
    <div class="ingresso">
      <img alt="" width="56" height="56" style="margin-bottom:10px" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20fill%3D%22%230b0c0e%22%2F%3E%3Cpath%20d%3D%22M268%2092%20L392%20306%20L268%20306%20Z%22%20fill%3D%22%23dfe3e7%22%2F%3E%3Cpath%20d%3D%22M268%2092%20L132%20306%20L268%20306%20Z%22%20fill%3D%22%237d858d%22%2F%3E%3Cpath%20d%3D%22M132%20306%20L268%20306%20L200%20412%20Z%22%20fill%3D%22%23525a62%22%2F%3E%3Cpath%20d%3D%22M268%20306%20L392%20306%20L326%20412%20Z%22%20fill%3D%22%23363d44%22%2F%3E%3Cpath%20d%3D%22M200%20412%20L326%20412%20L268%20306%20Z%22%20fill%3D%22%23252b31%22%2F%3E%3Cpath%20d%3D%22M268%2092%20L312%20168%20L268%20168%20Z%22%20fill%3D%22%2354c07a%22%2F%3E%3C%2Fsvg%3E">
      <div style="font-size:19px;margin-bottom:6px">SierraDeck</div>
      <div class="sotto">Sul computer apri <b>Impostazioni → Client</b> e leggi il codice.</div>
      <input id="codice" inputmode="numeric" maxlength="6" placeholder="······" aria-label="codice">
      <input id="nome" placeholder="nome di questo dispositivo" style="font-size:15px;letter-spacing:normal">
      <button class="primario" id="entra" style="margin-top:12px">Collega</button>
      <div class="errore" id="errore">${esc(messaggio || '')}</div>
    </div>`
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
  const trovata = /SierraDeck\/([0-9]+\.[0-9]+\.[0-9]+)/.exec(ua || '')
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
function impronta(s) {
  const chat = (s.chat || []).map((c) => c.id + '|' + c.titolo + '|' + (c.ultimaRiga || '')).join('~')
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
    righeDentro[righeDentro.length - 1] || '', giriFalliti >= 2
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
  if (nome === 'lavori') return chiede ? 'attesa' : fermi ? 'rosso' : moto ? 'lavoro' : ''
  if (nome === 'chat') return (s.chat || []).length > 0 ? 'lavoro' : ''
  // Il computer normalmente non ha LED, e lo accende solo quando c'e' qualcosa
  // che riguarda **la macchina**: un aggiornamento pronto, o il silenzio.
  return aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto' ? 'attesa' : ''
}

/** La fascia fissa, sempre visibile, mai nascosta dallo scorrimento. */
function fascia(s) {
  const voci = [
    ['adesso', 'ADESSO'], ['chat', 'CHAT'], ['lavori', 'LAVORI'], ['computer', 'COMPUTER']
  ]
  return '<nav class="fascia">' + voci.map((v) => {
    const l = ledDestinazione(v[0], s)
    return '<button class="fascia__voce' + (scheda === v[0] ? ' fascia__voce--qui' : '') + '"' +
      (scheda === v[0] ? ' aria-current="page"' : '') +
      ' onclick="vaiScheda(\'' + v[0] + '\')">' +
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
    '<button onclick="riprendiAp(\'' + esc(a.id) + '\')">Riprendi</button>' +
    '<button onclick="vaiScheda(\'lavori\')">Guarda</button></div></div>'
  ).join('')

  const panoramica = (s.domande || []).length > 0 || fermi.length > 0 || inMoto.length > 0 || (s.chat || []).length > 0
    ? ''
    : calma

  // Una domanda in attesa **e'** la prima schermata, non una piastrella fra le
  // altre: il suo testo e' la cosa piu' grande della pagina, e la risposta sta
  // in fondo, dove arriva il pollice. Con due domande cambia solo la
  // serigrafia — la seconda aspetta il suo turno.
  const quante = (s.domande || []).length
  const domande = (s.domande || []).slice(0, 1).map((d) => `
    <div class="piastrella chiede">
      <div class="serigrafia"><span class="led attesa"></span>TI STA CHIEDENDO${quante > 1 ? ' — 1 DI ' + quante : ''}</div>
      <div class="grande">${esc(d.testo)}</div>
      <div class="riga">
        <textarea id="r-${esc(d.id)}" rows="3" placeholder="la tua risposta"></textarea>
      </div>
      <div class="riga"><button class="primario" onclick="rispondi('${escJs(d.id)}')">Rispondi</button></div>
    </div>`).join('')

  const apAperto = (s.autopiloti || []).find((a) => a.id === dentroAp)
  const autopiloti = apAperto
    ? `
    <div class="testata-dentro">
      <button class="indietro" onclick="chiudiAp()" aria-label="Torna all elenco">‹</button>
      <div class="testata-dentro__nome"><span class="led ${led(apAperto)}"></span>${esc(apAperto.nome)}</div>
    </div>
    <div class="piastrella">
      <div class="sotto">${esc(apAperto.strategia ? 'bloccato, provo: ' + apAperto.strategia : (apAperto.motivo || apAperto.stato))}</div>
      <div class="misura-riga">${apAperto.fatti} criteri su ${apAperto.criteri} · ${apAperto.cicli} interventi</div>
      <div class="barra"><i style="width:${apAperto.criteri ? Math.round(apAperto.fatti / apAperto.criteri * 100) : 0}%"></i></div>
      ${apDettaglio ? vistaAutopilota(apDettaglio) : ''}
      <div class="riga">
        ${apAperto.stato === 'pronto'
          ? '<button class="primario" onclick="vaiAp(\'' + esc(apAperto.id) + '\')">Vai</button>'
          : apAperto.stato === 'lavoro' || apAperto.stato === 'attesa'
            ? '<button onclick="fermaAp(\'' + esc(apAperto.id) + '\')">Ferma</button>'
            : '<button onclick="riprendiAp(\'' + esc(apAperto.id) + '\')">Riprendi</button>'}
        <button onclick="leggiQuaderno(null)">Quaderno</button>
      </div>
    </div>`
    : (s.autopiloti || []).map((a) => `
    <button class="voce" onclick="guardaAp('${escJs(a.id)}')">
      <span class="led ${led(a)}"></span>
      <span class="voce__testo">
        <span class="voce__nome">${esc(a.nome)}</span>
        <span class="voce__sotto">${esc(a.strategia ? 'bloccato, provo: ' + a.strategia : (a.motivo || a.stato))} · ${a.fatti}/${a.criteri}</span>
      </span>
      <span class="voce__freccia">›</span>
    </button>`).join('')

  // ── Le chat ─────────────────────────────────────────────────────────────
  // Prima ogni chat portava sempre sei comandi: campo, Invia, Guarda dentro,
  // campo nome, Nome, Chiudi. Con sei chat erano **trenta bersagli** in una
  // colonna, e il campo per rinominare — cosa che si fa una volta nella vita —
  // occupava spazio permanente accanto al battito del terminale.
  // Adesso l'elenco e' un elenco: una riga densa per chat, e chi vuole entrare
  // entra.
  const aperta = (s.chat || []).find((c) => c.id === dentro)
  const chat = aperta
    ? `
    <div class="testata-dentro">
      <button class="indietro" onclick="chiudiDentro()" aria-label="Torna all elenco">‹</button>
      <div class="testata-dentro__nome">${esc(aperta.titolo)}</div>
      <button class="altro" onclick="apriAltro('${escJs(aperta.id)}')" aria-label="Altro">⋯</button>
    </div>
    <div class="sotto percorso">${esc(aperta.cwd)}</div>
    ${altroAperto === aperta.id ? `
      <div class="piastrella">
        <div class="riga">
          <input id="n-${esc(aperta.id)}" placeholder="dalle un nome">
          <button onclick="rinomina('${escJs(aperta.id)}')">Nome</button>
        </div>
        <div class="riga">
          <button class="${confermando === 'chat-' + aperta.id ? 'pericolo' : ''}"
            onclick="chiudiChat('${escJs(aperta.id)}')">${confermando === 'chat-' + aperta.id ? 'Sicuro? Chiudi' : 'Chiudi la chat'}</button>
        </div>
      </div>` : ''}
    <div class="dentro dentro--alto">${righeGrezze.length
        // Vestite: il verde di un test passato e il rosso di uno fallito sono
        // meta' di quello che dice come sta andando.
        ? ansiInHtml(righeGrezze.join(String.fromCharCode(10)))
        : righeDentro.length ? esc(righeDentro.join(String.fromCharCode(10)))
        : 'Ancora niente da mostrare.'}</div>
    <div class="riga ancorata">
      <input id="t-${esc(aperta.id)}" placeholder="scrivi qui e invia">
      <button onclick="scrivi('${escJs(aperta.id)}')">Invia</button>
    </div>`
    : (s.chat || []).map((c) => `
    <button class="voce" onclick="guarda('${escJs(c.id)}')">
      <span class="led ${giriFalliti >= 2 ? 'fermo' : 'lavoro'}"></span>
      <span class="voce__testo">
        <span class="voce__nome">${esc(c.titolo)}</span>
        ${c.ultimaRiga ? '<span class="voce__sotto">' + esc(c.ultimaRiga) + '</span>' : ''}
      </span>
      <span class="voce__freccia">›</span>
    </button>`).join('')

  // Aprire non distrugge niente: nel peggiore dei casi resta un riquadro in
  // piu' da chiudere al computer. Ed e' la differenza fra guardare da fuori e
  // poter cominciare qualcosa da fuori.
  const nuova = cartelle === null || delegando
    ? '<div class="piastrella"><div class="riga"><button onclick="scegliCartella()">Apri una chat nuova</button></div></div>'
    : `<div class="piastrella">
         <div class="titolo">In quale cartella?</div>
         <div class="sotto">Solo quelle che Claude Code conosce gia'.</div>
         ${cartelle.length === 0 ? '<div class="sotto" style="margin-top:8px">Nessuna cartella conosciuta.</div>' : ''}
         ${cartelle.map((c, i) =>
           // Per indice, non per percorso: un percorso di Windows dentro
           // un onclick vorrebbe dire raddoppiare i backslash e sperare che
           // non contenga apici. L'indice non ha niente da sfuggire.
           // Il nome della cartella e' quello che si cerca; il percorso e' il
           // dettaglio che lo distingue da un omonimo, e si taglia **da
           // sinistra**: la parte che distingue due cartelle sta in fondo.
           '<button class="cartella" onclick="apriIn(' + i + ')">' +
           '<span class="cartella__nome">' + esc(c.split(/[\\/]/).filter(Boolean).pop() || c) + '</span>' +
           '<span class="cartella__dove">' + esc(c) + '</span></button>').join('')}
         <div class="riga"><button onclick="cartelle = null; pannello(ultimoStato)">Lascia stare</button></div>
       </div>`

  // Affidare un lavoro. È il gesto che ha più senso da fermi, in piedi, con una
  // mano sola: si dice cosa si vuole e si va, e le domande della preparazione
  // arrivano qui sopra, dove si risponde. Un modulo con i criteri da compilare
  // sarebbe il modo più sicuro per non delegare mai niente da un telefono.
  const delega = !delegando
    ? '<div class="piastrella"><div class="riga"><button onclick="apriDelega()">Affida un lavoro</button></div></div>'
    : `<div class="piastrella chiede">
         <div class="titolo">Cosa vuoi che faccia?</div>
         <div class="sotto">Descrivilo con parole tue. Ti farà le domande che gli servono, qui.</div>
         <div class="riga">
           <textarea id="delega-obiettivo" rows="3" placeholder="es. trova e sistema i test che falliscono a caso"></textarea>
         </div>
         <div class="sotto" style="margin-top:10px">In quale cartella?</div>
         ${(cartelle || []).length === 0
           ? '<div class="sotto" style="margin-top:8px">Nessuna cartella conosciuta.</div>'
           : (cartelle || []).map((c, i) =>
               '<button class="cartella' + (delegaCartella === i ? ' attivo' : '') + '" onclick="scegliPer(' + i + ')">' + esc(c) + '</button>').join('')}
         <div class="riga">
           <button class="primario" onclick="affida()">Affida</button>
           <button onclick="delegando = false; delegaCartella = -1; pannello(ultimoStato)">Lascia stare</button>
         </div>
       </div>`

  const elencoSessioni = pannelloAperto !== 'sessioni' ? '' : `
    <div class="piastrella">
      <div class="titolo">Riprendi una conversazione</div>
      <div class="sotto">Quelle che il computer conosce, dalla piu' recente.</div>
      ${(sessioniViste || []).length === 0
        ? '<div class="sotto" style="margin-top:8px">Nessuna conversazione trovata.</div>'
        : (sessioniViste || []).slice(0, 20).map((x, i) =>
            '<button class="cartella" onclick="riprendiSessione(' + i + ')">' +
            esc(x.titolo) + '<br><span class="sotto">' + esc(x.cwd) + '</span></button>').join('')}
      <div class="riga"><button onclick="apriPannello('sessioni')">Chiudi</button></div>
    </div>`

  const elencoSalvataggi = pannelloAperto !== 'salvataggi' ? '' : `
    <div class="piastrella">
      <div class="titolo">Salvataggi</div>
      <div class="sotto">Rimettono in piedi un insieme di chat, tutte insieme.</div>
      ${(salvataggiVisti || []).length === 0
        ? '<div class="sotto" style="margin-top:8px">Nessun salvataggio.</div>'
        : (salvataggiVisti || []).map((x, i) =>
            '<button class="cartella ' + (confermando === 'sal-' + x.nome ? 'pericolo' : '') +
            '" onclick="caricaSalvataggio(' + i + ')">' +
            (confermando === 'sal-' + x.nome ? 'Sicuro? Sostituisce le chat aperte' : esc(x.nome)) +
            '<br><span class="sotto">' + x.chat + ' chat</span></button>').join('')}
      <div class="riga"><button onclick="apriPannello('salvataggi')">Chiudi</button></div>
    </div>`

  const vistaConsumi = pannelloAperto !== 'consumi' ? '' : `
    <div class="piastrella">
      <div class="titolo">Consumi</div>
      ${consumiVisti === null
        ? '<div class="sotto">Non sono riuscito a leggerli.</div>'
        : '<div class="numeri" style="margin-top:12px">' +
          '<div class="numero"><b>' + esc(token(consumiVisti.oggi)) + '</b><span>oggi</span></div>' +
          '<div class="numero"><b>' + esc(token(consumiVisti.settimana)) + '</b><span>7 giorni</span></div>' +
          '<div class="numero"><b>' + esc(token(consumiVisti.totale)) + '</b><span>totale</span></div>' +
          '</div>' +
          '<div class="sotto" style="margin-top:10px">Token, non denaro. Oggi: ' + esc(quote(consumiVisti.oggi)) + '.</div>'}
      <div class="riga"><button onclick="apriPannello('consumi')">Chiudi</button></div>
    </div>`

  const vistaQuaderno = pannelloAperto !== 'quaderno' ? '' : `
    <div class="piastrella">
      <div class="titolo">Quaderno</div>
      <div class="sotto">Le schede che l'autopilota lascia accanto al codice.</div>
      ${schedaAperta
        ? '<div class="dettaglio"><div class="titolo">' + esc(schedaAperta.titolo) + '</div>' +
          '<div class="dentro" style="max-height:50vh">' + esc(schedaAperta.corpo) + '</div>' +
          '<div class="riga"><button onclick="chiudiScheda()">Torna all elenco</button></div></div>'
        : ((schedeViste || []).length === 0
            ? '<div class="sotto" style="margin-top:8px">Nessuna scheda in questa cartella.</div>'
            : (schedeViste || []).map((x) =>
                '<button class="cartella" onclick="apriScheda(\'' + escJs(cartellaPrima()) + '\', \'' +
                escJs(x.file) + '\')">' + esc(x.titolo) + '</button>').join(''))}
      <div class="riga"><button onclick="apriPannello('quaderno')">Chiudi</button></div>
    </div>`

  const vistaImpostazioni = pannelloAperto !== 'impostazioni' ? '' : `
    <div class="piastrella">
      <div class="titolo">Impostazioni</div>
      ${prefViste === null ? '<div class="sotto">Non sono riuscito a leggerle.</div>' : `
        <div class="sotto" style="margin-top:10px">Stile della console</div>
        <div class="ws" style="margin-top:8px">
          <button class="${prefViste.stile === 'banco' ? 'attivo' : ''}" onclick="cambiaPref('stile', 'banco')">Banco</button>
          <button class="${prefViste.stile === 'foglio' ? 'attivo' : ''}" onclick="cambiaPref('stile', 'foglio')">Foglio</button>
        </div>
        <div class="sotto" style="margin-top:14px">Chiarore: ${prefViste.chiarore}</div>
        <input type="range" min="0" max="100" value="${prefViste.chiarore}" style="width:100%"
          onchange="cambiaPref('chiarore', Number(this.value))">
      `}
      <div class="sotto" style="margin-top:16px">Aggiornamento del computer</div>
      <div class="sotto">${esc(descriviAggiornamento())}</div>
      <div class="riga">
        ${aggiornamentoVisto && aggiornamentoVisto.fase === 'disponibile'
          ? '<button onclick="scaricaAggiornamento()">Scarica</button>' : ''}
        ${aggiornamentoVisto && aggiornamentoVisto.fase === 'pronto'
          ? '<button class="' + (confermando === 'agg' ? 'pericolo' : '') + '" onclick="installaAggiornamento()">' +
            (confermando === 'agg' ? 'Sicuro? Chiude le chat' : 'Installa') + '</button>' : ''}
        <button onclick="apriPannello('impostazioni')">Chiudi</button>
      </div>
    </div>`

  const ws = (s.workspace && s.workspace.nomi || []).map((n) => `
    <button class="${n === s.workspace.attivo ? 'attivo' : ''}" onclick="vaiA('${escJs(n)}')">${esc(n)}</button>`).join('')

  // Chi arriva da un telefono Android puo' avere l'app, che sa fare una cosa
  // che il browser non puo': avvisare quando e' chiusa. Si dice una volta e si
  // ricorda la risposta - un invito che torna a ogni apertura e' un fastidio.
  const invito = proponeApp(
    navigator.userAgent,
    appAndroid.versione,
    localStorage.getItem('sierradeck.nienteapp'),
    window.matchMedia('(display-mode: standalone)').matches
  )
    ? `<div class="piastrella chiede">
         <div class="titolo">${versioneApp(navigator.userAgent) ? 'C’è l’app ' + esc(appAndroid.versione) : 'C’è l’app per Android'}</div>
         <div class="sotto">${versioneApp(navigator.userAgent)
           ? 'Hai la ' + esc(versioneApp(navigator.userAgent)) + ': questa è più nuova.'
           : 'Avvisa anche quando è chiusa: il browser, su una rete di casa, non può farlo.'}</div>
         <div class="riga">
           <a class="tasto-link" href="${esc(appAndroid.url)}" download>Scarica l’app ${esc(appAndroid.versione)}</a>
           <button onclick="localStorage.setItem('sierradeck.nienteapp', appAndroid.versione || '1'); aggiorna()">No, grazie</button>
         </div>
       </div>`
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
    adesso: fermo + invito + domande + bloccati + panoramica +
      (domande
        ? '<div class="solco"></div><button class="riga-altro" onclick="vaiScheda(\'lavori\')">altre cose in moto ›</button>'
        : (inMoto.length + (s.chat || []).length > 0 ? polso : '')),
    chat:
      (chat || '<div class="vuoto">Nessuna chat aperta sul computer.</div>') + nuova +
      '<div class="riga"><button onclick="apriPannello(\'sessioni\')">Riprendi una conversazione</button></div>' +
      elencoSessioni,
    lavori:
      (autopiloti || '<div class="vuoto">Nessun lavoro affidato.</div>') + delega +
      '<div class="riga"><button onclick="apriPannello(\'quaderno\')">Quaderno</button></div>' +
      vistaQuaderno,
    computer:
      paneWorkspace +
      '<div class="riga"><button onclick="apriPannello(\'salvataggi\')">Salvataggi</button>' +
      '<button onclick="apriPannello(\'consumi\')">Consumi</button>' +
      '<button onclick="apriPannello(\'impostazioni\')">Impostazioni</button></div>' +
      elencoSalvataggi + vistaConsumi + vistaImpostazioni
  }

  app.innerHTML = `
    <main class="schermata">
      ${schermate[scheda] || schermate.adesso}
    </main>
    ${fascia(s)}`

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
function primaRigaUscita(uscita) {
  const riga = String(uscita || '').split(String.fromCharCode(10)).map((r) => r.trim()).find((r) => r !== '') || ''
  return riga.length > 60 ? riga.slice(0, 60) + '…' : riga
}

function vistaAutopilota(a) {
  const passi = (a.passaggi || []).map((p) => {
    const cl = 'passo passo--' + p.stato
    return '<span class="' + cl + '"><i class="passo-led"></i>' + esc(p.nome) + '</span>'
  }).join('<span class="passo-filo"></span>')
  const qui = (a.passaggi || []).find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')
  const m = a.misura || { percento: 0, dettaglio: '', di: '', tono: 'lavoro' }
  // Cosa gli hai chiesto, e cosa ne ha capito. La preparazione riscrive
  // l'obiettivo con parole sue: senza le tue accanto non c'e' modo di
  // accorgersi che sta andando a fare un'altra cosa.
  const capito = a.obiettivoTuo
    ? '<div class="serigrafia" style="margin-top:10px">Gli hai chiesto</div>' +
      '<div class="sotto tue-parole">' + esc(a.obiettivoTuo) + '</div>' +
      (a.obiettivo && a.obiettivo !== a.obiettivoTuo
        ? '<div class="serigrafia" style="margin-top:8px">Ha capito cosi</div>' +
          '<div class="sotto sue-parole">' + esc(a.obiettivo) + '</div>'
        : '')
    : ''
  // I criteri, con **quando** li ha raggiunti: una spunta senza ora non dice
  // se e' successo adesso o tre ore fa.
  const criteri = (a.criteri || []).map((c) =>
    '<li class="' + (c.soddisfatto ? 'fatto' : '') + '">' + (c.soddisfatto ? '✓ ' : '· ') + esc(c.descrizione) +
    (c.soddisfatto && c.raggiuntoIl
      ? '<span class="quando-criterio"> raggiunto alle ' + esc(String(c.raggiuntoIl).slice(11, 16)) + '</span>'
      : '') +
    (c.comando ? '<div class="prova-criterio">' + esc(c.comando) +
      (c.ultimaVerifica ? ' · ' + (c.ultimaVerifica.codice === 0 ? 'passato' : esc(primaRigaUscita(c.ultimaVerifica.uscita))) : '') +
      '</div>' : '') +
    '</li>'
  ).join('')
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
  const decisioni = (a.decisioni || []).slice(-6).reverse().map((d) =>
    '<div class="voce"><span class="quando">' + esc(String(d.quando || '').slice(11, 16)) + '</span>' +
    esc(senzaSigla(d.cosa)) + '</div>'
  ).join('')
  return '<div class="dettaglio">' +
    '<div class="passi">' + passi + '</div>' +
    (qui && qui.nota ? '<div class="sotto nota">' + esc(qui.nota) + '</div>' : '') +
    '<div class="misura misura--' + esc(m.tono) + '"><b>' + m.percento + '%</b>' +
      '<span class="sotto">' + esc(m.dettaglio) + ' · ' + esc(m.di) + '</span></div>' +
    capito +
    (criteri ? '<div class="serigrafia" style="margin-top:10px">Finisce quando</div><ul class="criteri">' + criteri + '</ul>' : '') +
    (decisioni ? '<div class="serigrafia" style="margin-top:10px">Sta ragionando cosi</div>' + decisioni : '') +
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
  if (a.fase === 'pronto') return 'La ' + (a.versione || 'nuova') + ' si installa da sola alla prossima chiusura.'
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
  const trovato = /codice=(\d{6})/.exec(location.hash)
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
    // Ha risposto: da qui in poi quello che si vede e' di adesso.
    ultimoContatto = Date.now()
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
