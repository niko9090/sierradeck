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
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; background: #0b0c0e; color: #dfe3e7;
    font: 16px/1.5 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  header {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; background: #141517; border-bottom: 1px solid #24272b;
  }
  header b { font-size: 15px; letter-spacing: .04em; }
  header span { margin-left: auto; font-size: 12px; color: #9aa1a9; }
  main { padding: 14px; display: grid; gap: 12px; }
  .piastrella {
    background: #16181b; border: 1px solid #24272b; border-radius: 14px; padding: 14px 16px;
  }
  .titolo { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .sotto { font-size: 13px; color: #9aa1a9; }
  .barra { height: 5px; border-radius: 3px; background: #24272b; margin-top: 10px; overflow: hidden; }
  .barra > i { display: block; height: 100%; background: #4aa3ff; }
  .led { width: 9px; height: 9px; border-radius: 50%; display: inline-block; margin-right: 7px; }
  .lavoro { background: #54c07a } .attesa { background: #e0a33c } .fermo { background: #4a5058 }
  .chiede { border-color: #e0a33c; }
  /* Bersagli grandi: si usa in piedi, con una mano, e un tasto piccolo su un
     telefono e' un tasto che si sbaglia. */
  button, input, textarea {
    font: inherit; border-radius: 10px; border: 1px solid #2f3439;
    background: #1d2023; color: inherit; padding: 12px 14px;
  }
  button { background: #23272b; min-height: 48px; }
  button.primario { background: #2f6fb5; border-color: #3d86d6; width: 100%; }
  .riga { display: flex; gap: 8px; margin-top: 10px; }
  .riga > input, .riga > textarea { flex: 1; min-width: 0; }
  .ws { display: flex; gap: 8px; flex-wrap: wrap; }
  .ws button { padding: 10px 14px; min-height: 44px; }
  .ws button.attivo { border-color: #4aa3ff; color: #fff; }
  .vuoto { color: #9aa1a9; text-align: center; padding: 30px 10px; }
  .ingresso { max-width: 380px; margin: 40px auto; padding: 0 18px; text-align: center; }
  .ingresso input { width: 100%; text-align: center; font-size: 26px; letter-spacing: .3em; margin: 16px 0; }
  .errore { color: #e0a33c; font-size: 13px; margin-top: 8px; }
  .panoramica { background: #131518; }
  .numeri { display: flex; gap: 6px; }
  .numero { flex: 1; text-align: center; }
  .numero b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
  .numero b.v { color: #54c07a } .numero b.a { color: #e0a33c }
  .numero span { font-size: 11px; color: #9aa1a9; }
</style>
</head>
<body>
<div id="app"></div>
<script>
const CHIAVE = 'sierradeck.chiave'
let chiave = localStorage.getItem(CHIAVE) || ''
const app = document.getElementById('app')
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
function pannello(s) {
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

  const autopiloti = (s.autopiloti || []).map((a) => \`
    <div class="piastrella">
      <div class="titolo"><span class="led \${led(a.stato)}"></span>\${esc(a.nome)}</div>
      <div class="sotto">\${esc(a.strategia ? 'bloccato, provo: ' + a.strategia : a.stato)} · \${a.fatti}/\${a.criteri} criteri · \${a.cicli} interventi</div>
      <div class="barra"><i style="width:\${a.criteri ? Math.round(a.fatti / a.criteri * 100) : 0}%"></i></div>
      <div class="riga">
        \${a.stato === 'lavoro' || a.stato === 'attesa'
          ? '<button onclick="fermaAp(\\'' + esc(a.id) + '\\')">Ferma</button>'
          : '<button onclick="riprendiAp(\\'' + esc(a.id) + '\\')">Riprendi</button>'}
      </div>
    </div>\`).join('')

  const chat = (s.chat || []).map((c) => \`
    <div class="piastrella">
      <div class="titolo">\${esc(c.titolo)}</div>
      <div class="sotto">\${esc(c.cwd)}</div>
      <div class="riga">
        <input id="t-\${esc(c.id)}" placeholder="scrivi qui e invia">
        <button onclick="scrivi('\${esc(c.id)}')">Invia</button>
      </div>
    </div>\`).join('')

  const ws = (s.workspace && s.workspace.nomi || []).map((n) => \`
    <button class="\${n === s.workspace.attivo ? 'attivo' : ''}" onclick="vaiA('\${esc(n)}')">\${esc(n)}</button>\`).join('')

  // Chi arriva da un telefono Android puo' avere l'app, che sa fare una cosa
  // che il browser non puo': avvisare quando e' chiusa. Si dice una volta e si
  // ricorda la risposta - un invito che torna a ogni apertura e' un fastidio.
  const suAndroid = /Android/i.test(navigator.userAgent)
  const inApp = /SierraDeck/i.test(navigator.userAgent) || window.matchMedia('(display-mode: standalone)').matches
  const invito = suAndroid && !inApp && !localStorage.getItem('sierradeck.nienteapp')
    ? \`<div class="piastrella chiede">
         <div class="titolo">C’è l’app per Android</div>
         <div class="sotto">Avvisa anche quando è chiusa: il browser, su una rete di casa, non può farlo.</div>
         <div class="riga">
           <button class="primario" onclick="window.open('https://github.com/niko9090/sierradeck/releases/latest','_blank')">Scarica</button>
           <button onclick="localStorage.setItem('sierradeck.nienteapp','1'); aggiorna()">No, grazie</button>
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
      \${ws ? '<div class="piastrella"><div class="titolo">Workspace</div><div class="ws" style="margin-top:10px">' + ws + '</div></div>' : ''}
      \${autopiloti || ''}
      \${chat || (autopiloti ? '' : '<div class="vuoto">Nessuna chat aperta sul computer.</div>')}
    </main>\`

  for (const id in scritti) {
    const campo = document.getElementById(id)
    if (campo) campo.value = scritti[id]
  }
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
async function aggiorna() {
  try {
    if (!chiave) { await accoppiaDalQr() }
    if (!chiave) { ingresso(); return }
    pannello(await chiedi('/api/stato'))
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

aggiorna()
// Due secondi: abbastanza da sembrare vivo, abbastanza poco da non tenere sveglia
// la radio del telefono per niente.
setInterval(() => { if (chiave && !document.hidden) aggiorna() }, 2000)
</script>
</body>
</html>`
}
