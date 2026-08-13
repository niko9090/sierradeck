
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

function pannello(s) {
  ultimoStato = s
  const attivo = document.activeElement
  const staScrivendo = attivo && (attivo.tagName === 'INPUT' || attivo.tagName === 'TEXTAREA')
  // Chi sta scrivendo ha ragione: la pagina puo' aspettare due secondi.
  if (staScrivendo) return

  const led = (st) => st === 'lavoro' ? 'lavoro' : st === 'attesa' ? 'attesa' : 'fermo'
  // La panoramica: quello che si vuole sapere prima di leggere qualunque
  // dettaglio - sta lavorando qualcosa? qualcuno mi sta aspettando? A quale
  // punto siamo? Tre numeri, in cima, senza dover contare le piastrelle.
  const aps = s.autopiloti || []
  const alLavoro = aps.filter((a) => a.stato === 'lavoro').length
  const inAttesa = aps.filter((a) => a.stato === 'attesa').length
  const finiti = aps.filter((a) => a.stato === 'finito').length
  const criteriTot = aps.reduce((t, a) => t + (a.criteri || 0), 0)
  const criteriFatti = aps.reduce((t, a) => t + (a.fatti || 0), 0)
  const avanzamento = criteriTot ? Math.round(criteriFatti / criteriTot * 100) : 0
  const panoramica = `
    <div class="piastrella panoramica">
      <div class="numeri">
        <div class="numero"><b>${(s.chat || []).length}</b><span>chat</span></div>
        <div class="numero"><b class="v">${alLavoro}</b><span>al lavoro</span></div>
        <div class="numero"><b class="${inAttesa ? 'a' : ''}">${inAttesa}</b><span>ti aspettano</span></div>
        <div class="numero"><b>${finiti}</b><span>finiti</span></div>
      </div>
      ${criteriTot ? '<div class="barra"><i style="width:' + avanzamento + '%"></i></div>' +
        '<div class="sotto" style="margin-top:6px">' + criteriFatti + ' criteri su ' + criteriTot + ' — ' + avanzamento + '%</div>' : ''}
    </div>`

  const domande = (s.domande || []).map((d) => `
    <div class="piastrella chiede">
      <div class="titolo">Ti stanno chiedendo una cosa</div>
      <div class="sotto">${esc(d.testo)}</div>
      <div class="riga">
        <textarea id="r-${esc(d.id)}" rows="2" placeholder="la tua risposta"></textarea>
      </div>
      <div class="riga"><button class="primario" onclick="rispondi('${esc(d.id)}')">Rispondi</button></div>
    </div>`).join('')

  const autopiloti = (s.autopiloti || []).map((a) => {
    const dentro = dentroAp === a.id && apDettaglio ? vistaAutopilota(apDettaglio) : ''
    return `
    <div class="piastrella">
      <div class="titolo"><span class="led ${led(a.stato)}"></span>${esc(a.nome)}</div>
      <div class="sotto">${esc(a.strategia ? 'bloccato, provo: ' + a.strategia : a.stato)} · ${a.fatti}/${a.criteri} criteri · ${a.cicli} interventi</div>
      <div class="barra"><i style="width:${a.criteri ? Math.round(a.fatti / a.criteri * 100) : 0}%"></i></div>
      ${dentro}
      <div class="riga">
        ${a.stato === 'lavoro' || a.stato === 'attesa'
          ? '<button onclick="fermaAp(\'' + esc(a.id) + '\')">Ferma</button>'
          : '<button onclick="riprendiAp(\'' + esc(a.id) + '\')">Riprendi</button>'}
        ${dentroAp === a.id
          ? '<button onclick="chiudiAp()">Basta guardare</button>'
          : '<button onclick="guardaAp(\'' + esc(a.id) + '\')">Guarda dentro</button>'}
      </div>
    </div>`
  }).join('')

  const chat = (s.chat || []).map((c) => `
    <div class="piastrella">
      <div class="titolo">${esc(c.titolo)}</div>
      <div class="sotto">${esc(c.cwd)}</div>
      ${dentro === c.id
        ? '<div class="dentro">' + (righeGrezze.length
            // Vestite: il verde di un test passato e il rosso di uno fallito
            // sono meta' di quello che dice come sta andando.
            ? ansiInHtml(righeGrezze.join(String.fromCharCode(10)))
            : righeDentro.length ? esc(righeDentro.join(String.fromCharCode(10)))
            : 'Ancora niente da mostrare.') + '</div>'
        : (c.ultimaRiga ? '<div class="battito">' + esc(c.ultimaRiga) + '</div>' : '')}
      <div class="riga">
        <input id="t-${esc(c.id)}" placeholder="scrivi qui e invia">
        <button onclick="scrivi('${esc(c.id)}')">Invia</button>
      </div>
      <div class="riga">
        ${dentro === c.id
          ? '<button onclick="chiudiDentro()">Basta guardare</button>'
          : '<button onclick="guarda(\'' + esc(c.id) + '\')">Guarda dentro</button>'}
      </div>
      <div class="riga">
        <input id="n-${esc(c.id)}" placeholder="dalle un nome">
        <button onclick="rinomina('${esc(c.id)}')">Nome</button>
        <button class="${confermando === 'chat-' + c.id ? 'pericolo' : ''}"
          onclick="chiudiChat('${esc(c.id)}')">${confermando === 'chat-' + c.id ? 'Sicuro? Chiudi' : 'Chiudi'}</button>
      </div>
    </div>`).join('')

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
           '<button class="cartella" onclick="apriIn(' + i + ')">' + esc(c) + '</button>').join('')}
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

  const ws = (s.workspace && s.workspace.nomi || []).map((n) => `
    <button class="${n === s.workspace.attivo ? 'attivo' : ''}" onclick="vaiA('${esc(n)}')">${esc(n)}</button>`).join('')

  // Chi arriva da un telefono Android puo' avere l'app, che sa fare una cosa
  // che il browser non puo': avvisare quando e' chiusa. Si dice una volta e si
  // ricorda la risposta - un invito che torna a ogni apertura e' un fastidio.
  const suAndroid = /Android/i.test(navigator.userAgent)
  const inApp = /SierraDeck/i.test(navigator.userAgent) || window.matchMedia('(display-mode: standalone)').matches
  const invito = suAndroid && !inApp && !localStorage.getItem('sierradeck.nienteapp') && appAndroid.versione
    ? `<div class="piastrella chiede">
         <div class="titolo">C’è l’app per Android</div>
         <div class="sotto">Avvisa anche quando è chiusa: il browser, su una rete di casa, non può farlo.</div>
         <div class="riga">
           <a class="tasto-link" href="${esc(appAndroid.url)}" download>Scarica l’app ${esc(appAndroid.versione)}</a>
           <button onclick="localStorage.setItem('sierradeck.nienteapp','1'); aggiorna()">No, grazie</button>
         </div>
       </div>`
    : ''

  // Quello che c'era nei campi si conserva e si rimette: un ridisegno che
  // arriva un istante prima dell'invio non deve portarsi via il testo.
  const scritti = {}
  for (const campo of app.querySelectorAll('input, textarea')) {
    if (campo.id && campo.value) scritti[campo.id] = campo.value
  }

  app.innerHTML = `
    <header><b>SIERRADECK</b><span>${(s.chat || []).length} chat · ${(s.autopiloti || []).length} autopiloti</span></header>
    <main>
      ${invito}
      ${panoramica}
      ${domande}
      ${ws ? '<div class="piastrella"><div class="titolo">Workspace</div><div class="ws" style="margin-top:10px">' + ws + '</div>' +
        '<div class="riga"><input id="ws-nuovo" placeholder="un workspace nuovo">' +
        '<button onclick="creaWorkspace()">Crea</button></div></div>' : ''}
      ${autopiloti || ''}
      ${chat || (autopiloti ? '' : '<div class="vuoto">Nessuna chat aperta sul computer.</div>')}
      ${nuova}
      ${delega}
      <div class="piastrella">
        <div class="riga">
          <button onclick="apriPannello('sessioni')">Riprendi una conversazione</button>
          <button onclick="apriPannello('salvataggi')">Salvataggi</button>
        </div>
      </div>
      ${elencoSessioni}
      ${elencoSalvataggi}
    </main>`

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
