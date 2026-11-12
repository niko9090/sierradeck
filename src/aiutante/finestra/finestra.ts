/**
 * La finestra dell'Aiutante (12/11): HTML semplice, senza React. Rilegge lo
 * stato ogni pochi secondi e manda i cambi al processo principale.
 * Testi corti; la spiegazione completa dietro i tasti «?».
 */

type Voce = { chiave: string; nome: string; ok: boolean; dettaglio: string }
type Lavoro = { id: string; stato: string; ruolo: string; descrizione: string; perPc: string; inizio: string; attivita?: string }
type Stato = {
  versione: string
  nome: string
  host: string
  rete: { driveConnesso: boolean; driveConfigurato: boolean; email?: string; cassaforteAperta: boolean; inAscolto: boolean; errorePorta?: string; porta: number }
  altri: Array<{ pcId: string; nome: string; aiutante: boolean; battito: string }>
  posti: { liberi: number; tetto: number; perche: string }
  limiteFino?: number
  lavori: Lavoro[]
  requisiti: Voce[]
  aggiornamento?: { fase: string; versione?: string; errore?: string; ultimaRicerca?: number }
  preferenze: { postiChat: number; postiScelti: number | null; scaricaAggiornamentiAutomatico: boolean; avvioAlLogin: boolean; inPausa: boolean; portaClient: number; pcSviluppo: string | null }
}
type Api = {
  stato: () => Promise<Stato>
  cambia: (c: Record<string, unknown>) => Promise<Stato>
  collegaDrive: () => Promise<{ ok: boolean; messaggio?: string; cassaforteSulDrive?: boolean }>
  sblocca: (p: string) => Promise<{ ok: boolean; messaggio?: string }>
  mandaErrori: () => Promise<{ ok: boolean; messaggio: string }>
  cercaAggiornamenti: () => Promise<unknown>
  apriRegistro: () => Promise<unknown>
}

const api = (window as unknown as { aiutante: Api }).aiutante
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const testo = (id: string, t: string): void => { el(id).textContent = t }
const voce = (t: string, classe?: string): HTMLLIElement => {
  const li = document.createElement('li')
  li.textContent = t
  if (classe !== undefined) li.className = classe
  return li
}

for (const b of document.querySelectorAll<HTMLButtonElement>('button.aiuto')) {
  b.addEventListener('click', () => { const id = b.dataset.spiega; if (id !== undefined) el(id).classList.toggle('aperta') })
}

const PERCHE: Record<string, string> = {
  pronto: 'pronto per gli altri PC',
  pieno: 'tutti i posti occupati',
  requisiti: 'manca qualcosa (vedi «Cosa serve»)',
  aggiornamento: 'aspetta di installare un aggiornamento',
  limite: 'il piano di Claude ha finito la quota'
}

let primaVolta = true
function mostra(s: Stato): void {
  testo('versione', `Versione ${s.versione} · ${s.nome}`)
  const r = s.rete
  const righe = [
    r.driveConnesso ? `Drive collegato${r.email !== undefined ? ` (${r.email})` : ''}` : r.driveConfigurato ? 'Drive non collegato' : 'Drive non configurato in questa versione',
    r.cassaforteAperta ? 'Cassaforte aperta' : 'Cassaforte chiusa: serve la passphrase',
    r.inAscolto ? `In ascolto sulla porta ${r.porta}` : `Non in ascolto${r.errorePorta !== undefined ? `: ${r.errorePorta}` : ''}`,
    `${s.altri.length} altri PC visti`
  ]
  const rete = el('rete')
  rete.replaceChildren(...righe.map((t, i) => {
    const d = document.createElement('div')
    d.textContent = t
    d.className = [r.driveConnesso, r.cassaforteAperta, r.inAscolto, true][i] === true ? 'ok' : 'no'
    return d
  }))
  el('riga-drive').style.display = r.driveConnesso ? 'none' : 'flex'
  el('riga-cassaforte').style.display = r.driveConnesso && !r.cassaforteAperta ? 'flex' : 'none'

  const limite = s.limiteFino !== undefined ? ` fino alle ${new Date(s.limiteFino).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''
  testo('posti', `${s.lavori.length} lavori · ${s.posti.liberi} posti liberi su ${s.posti.tetto} · ${s.preferenze.inPausa ? 'in pausa' : (PERCHE[s.posti.perche] ?? s.posti.perche) + limite}`)
  el('lavori').replaceChildren(...(s.lavori.length === 0
    ? [voce('Nessun lavoro adesso.', 'nota')]
    : s.lavori.map((l) => voce(`${l.ruolo} per ${l.perPc}: ${l.descrizione}${l.attivita !== undefined ? ` — ${l.attivita}` : ''}`))))
  el('requisiti').replaceChildren(...(s.requisiti.length === 0
    ? [voce('Controllo in corso…', 'attesa')]
    : s.requisiti.map((v) => voce(`${v.ok ? '✓' : '✗'} ${v.nome}: ${v.dettaglio}`, v.ok ? 'ok' : 'no'))))

  const a = s.aggiornamento
  testo('aggiornamento', a === undefined || a.fase === 'niente'
    ? `Nessun aggiornamento in attesa${a?.errore !== undefined ? ` (ultimo errore: ${a.errore})` : ''}.`
    : a.fase === 'scarico' ? `Scarico la ${a.versione ?? 'nuova versione'}…` : `La ${a.versione ?? 'nuova versione'} è pronta: si installa appena finiscono i lavori in corso.`)

  // I campi si riempiono una volta: rileggere lo stato non deve cancellare quello che stai scrivendo.
  if (primaVolta) {
    primaVolta = false
    el<HTMLInputElement>('nome').value = s.nome
    const p = s.preferenze
    el<HTMLSelectElement>('posti-modo').value = p.postiScelti !== null ? 'scelto' : String(p.postiChat)
    el<HTMLInputElement>('posti-numero').value = String(p.postiScelti ?? s.posti.tetto)
    el<HTMLInputElement>('posti-numero').style.display = p.postiScelti !== null ? 'inline-block' : 'none'
    el<HTMLInputElement>('aggiornamenti').checked = p.scaricaAggiornamentiAutomatico
    el<HTMLInputElement>('avvio').checked = p.avvioAlLogin
    el<HTMLInputElement>('pausa').checked = p.inPausa
  }
  const sel = el<HTMLSelectElement>('pc-sviluppo')
  if (document.activeElement !== sel) {
    const scelte: Array<[string, string]> = [['', 'Di serie (chi tiene il progetto SierraDeck)'], ...s.altri.filter((b) => !b.aiutante).map((b): [string, string] => [b.pcId, b.nome])]
    sel.replaceChildren(...scelte.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o }))
    sel.value = s.preferenze.pcSviluppo ?? ''
  }
}

async function rileggi(): Promise<void> {
  try { mostra(await api.stato()) } catch { /* al prossimo giro */ }
}

const cambia = async (c: Record<string, unknown>): Promise<void> => { mostra(await api.cambia(c)) }

el('salva-nome').addEventListener('click', () => { void cambia({ nome: el<HTMLInputElement>('nome').value }) })
el('posti-modo').addEventListener('change', () => {
  const v = el<HTMLSelectElement>('posti-modo').value
  const numero = el<HTMLInputElement>('posti-numero')
  numero.style.display = v === 'scelto' ? 'inline-block' : 'none'
  void cambia(v === 'scelto' ? { postiScelti: Number(numero.value) } : { postiChat: Number(v), postiScelti: null })
})
el('posti-numero').addEventListener('change', () => { void cambia({ postiScelti: Number(el<HTMLInputElement>('posti-numero').value) }) })
el('aggiornamenti').addEventListener('change', () => { void cambia({ scaricaAggiornamentiAutomatico: el<HTMLInputElement>('aggiornamenti').checked }) })
el('avvio').addEventListener('change', () => { void cambia({ avvioAlLogin: el<HTMLInputElement>('avvio').checked }) })
el('pausa').addEventListener('change', () => { void cambia({ inPausa: el<HTMLInputElement>('pausa').checked }) })
el('pc-sviluppo').addEventListener('change', () => { void cambia({ pcSviluppo: el<HTMLSelectElement>('pc-sviluppo').value }) })
el('collega-drive').addEventListener('click', () => {
  testo('esito-rete', 'Si apre il browser: scegli l’account Google di sempre.')
  void api.collegaDrive().then((e) => { testo('esito-rete', e.ok ? (e.cassaforteSulDrive === true ? 'Drive collegato. Ora la passphrase della cassaforte.' : 'Drive collegato, ma senza cassaforte: è l’account giusto?') : `Non collegato: ${e.messaggio ?? ''}`); void rileggi() })
})
el('sblocca').addEventListener('click', () => {
  const campo = el<HTMLInputElement>('passphrase')
  void api.sblocca(campo.value).then((e) => { campo.value = ''; testo('esito-rete', e.ok ? 'Cassaforte aperta: l’Aiutante è nella rete.' : (e.messaggio ?? 'Non aperta.')); void rileggi() })
})
el('cerca').addEventListener('click', () => { void api.cercaAggiornamenti().then(() => testo('esito-azioni', 'Cerco: se c’è una versione nuova si scarica da sola.')) })
el('manda-errori').addEventListener('click', () => { void api.mandaErrori().then((e) => testo('esito-azioni', e.messaggio)) })
el('registro').addEventListener('click', () => { void api.apriRegistro() })

void rileggi()
setInterval(() => { void rileggi() }, 3000)
