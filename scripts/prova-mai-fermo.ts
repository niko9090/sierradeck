// Prova di 2 ore del «mai fermo» (0.84.1 di c-72, adattata alla 0.84.3 da c-93). Non va nel programma.
// Si compila e si lancia SOLO su dati di prova, mai sul servizio vero:
//   node_modules/.bin/esbuild scripts/prova-mai-fermo.ts --bundle --platform=node --format=cjs --alias:@src=./src --alias:@shared=./src/shared --external:electron --outfile=<cartella temporanea>/prova.cjs
//   SIERRADECK_PROVA=1 APPDATA=<prova>/AppData LOCALAPPDATA=<prova>/AppData PROVA_DIR=<prova> PROVA_MINUTI=120 node <cartella temporanea>/prova.cjs
// Esito in <prova>/esito-prova.json, diario in <prova>/diario-prova.log.
/**
 * Prova di 2 ore (0.84.3, adattata da c-93 dalla prova 0.84.1 di c-72): il servizio vero (`creaServer`, i suoi orologi veri,
 * il guardiano ogni minuto) su dati isolati in una cartella di prova, con il
 * Gestore e le chat simulati. Le chat si comportano come quelle della notte del
 * 21-22/10: lavorano, si zittiscono su un comando che non finisce, restano
 * ferme al prompt, a volte non rispondono più nemmeno se riprese.
 *
 * Misura ogni 15 s: quante chat lavorano davvero; il tratto più lungo con
 * l'autopilota «al lavoro», il lavoro da finire e nessuna chat che lavora.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '@src/autopilot-host/server'
import { apriArchivio } from '@src/autopilot-host/archivio'
import { creaRegistroDomande } from '@src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

const RADICE = process.env.PROVA_DIR as string
const DURATA_MS = Number(process.env.PROVA_MINUTI ?? '120') * 60_000
const CRITERI_VERDI_DOPO_MS = DURATA_MS - 8 * 60_000
const RIAVVIO_DOPO_MS = DURATA_MS / 2
const PORTA = 47_683
const MIN = 60_000
// Il generatore pseudo-casuale con seme fisso: la prova si può ripetere.
let seme = 841
const caso = (): number => { seme = (seme * 1_103_515_245 + 12_345) % 2_147_483_648; return seme / 2_147_483_648 }

mkdirSync(RADICE, { recursive: true })
const diario = join(RADICE, 'diario-prova.log')
const scrivi = (riga: string): void => { appendFileSync(diario, `${new Date().toISOString()} ${riga}\n`) }

const archivio = apriArchivio(join(RADICE, 'autopiloti'))
const inizio = Date.now()

// ── Le chat simulate ──
type Comportamento = 'lavora' | 'muta' | 'morta' | 'ferma'
type ChatSim = { chat: string; sessione: string; stato: Comportamento; fineTurno?: number; chiusa: boolean; turni: number; mutaDa?: number }
const muteDurate: number[] = []
let mutaFraSorelle = 0
const chats = new Map<string, ChatSim>()
const conti = { turni: 0, mute: 0, morte: 0, ferme: 0, interrotte: 0, chiuse: 0, messaggi: 0 }

function nuovoTurno(c: ChatSim): void {
  // Una chat «morta» non risponde a niente finché non la chiudono.
  if (c.chiusa || c.stato === 'morta') return
  const r = caso()
  c.turni += 1
  if (r < 0.62) { c.stato = 'lavora'; c.fineTurno = Date.now() + (2 + Math.floor(caso() * 10)) * MIN }
  else if (r < 0.80) { c.stato = 'muta'; c.mutaDa = Date.now(); conti.mute += 1 }
  else if (r < 0.88) { c.stato = 'morta'; conti.morte += 1 }
  else { c.stato = 'ferma'; conti.ferme += 1 }
  scrivi(`[chat] ${c.chat} turno ${c.turni}: ${c.stato}`)
}

let server: ServerAutopiloti
let id = ''

function deps(): Parameters<typeof creaServer>[0] {
  const verdi = (): boolean => Date.now() - inizio >= CRITERI_VERDI_DOPO_MS
  return {
    archivio,
    esegui: () => Promise.resolve(verdi() ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '1 test rosso' }),
    interroga: () => Promise.resolve({
      testo: verdi()
        ? '{"azione": "finito", "perche": "criteri verdi"}'
        : '{"azione": "prosegui", "istruzioni": "Continua con il tuo compito: manca ancora il test rosso.", "perche": "un criterio rosso"}',
      sessionId: 'sup-prova'
    }),
    avviaLavoro: (_a, _messaggio, chat) => {
      conti.messaggi += 1
      if (chat === undefined) return Promise.resolve()
      let c = chats.get(chat.id)
      if (c === undefined || c.sessione !== (chat.sessionId ?? chat.id)) {
        c = { chat: chat.id, sessione: chat.sessionId ?? chat.id, stato: 'ferma', chiusa: false, turni: 0 }
        chats.set(chat.id, c)
        scrivi(`[chat] ${chat.id} nasce (sessione ${c.sessione.slice(0, 8)})`)
      }
      // Un testo scritto a una chat che lavora non cambia niente: lo legge dopo.
      if (c.stato !== 'lavora') nuovoTurno(c)
      return Promise.resolve()
    },
    fermaLavoro: (_id, chatId) => {
      const c = chatId === undefined ? undefined : chats.get(chatId)
      // L'interruzione sblocca il comando che non finisce; la chat morta resta morta.
      if (c !== undefined && c.stato === 'muta') { c.stato = 'ferma'; conti.interrotte += 1; if (c.mutaDa !== undefined) { muteDurate.push(Date.now() - c.mutaDa); scrivi(`[chat] ${c.chat} interrotta dopo ${((Date.now() - c.mutaDa) / MIN).toFixed(1)} min muta`); c.mutaDa = undefined } }
    },
    chiudiChat: (_id, chatId) => {
      const c = chatId === undefined ? undefined : chats.get(chatId)
      if (c !== undefined && !c.chiusa) { c.chiusa = true; conti.chiuse += 1; scrivi(`[chat] ${chatId} chiusa (nel recupero)`) }
    },
    avvisa: (tipo, _a, testo) => { scrivi(`[avviso] ${tipo}: ${testo ?? ''}`); return Promise.resolve() },
    frenoPiano: false,
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5 * MIN,
    scadenzaInterviataMs: 30 * MIN,
    adesso: () => new Date().toISOString()
  }
}

async function chiama(percorso: string, corpo: unknown): Promise<any> {
  const r = await fetch(`http://127.0.0.1:${PORTA}${percorso}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const t = await r.text()
  return t === '' ? {} : JSON.parse(t)
}

function accendi(): Promise<void> {
  server = creaServer(deps())
  return new Promise((ok) => { server.listen(PORTA, '127.0.0.1', () => { ok() }) })
}

// ── Il Gestore simulato: battiti, fine turno, ferme ──
const inStop = new Set<string>()
async function battito(): Promise<void> {
  const segni: unknown[] = []
  const ferme: unknown[] = []
  for (const c of chats.values()) {
    if (c.chiusa) continue
    if (c.stato === 'lavora') segni.push({ autopilota: id, chat: c.chat })
    if (c.stato === 'ferma') ferme.push({ autopilota: id, chat: c.chat })
  }
  await chiama('/battiti', { segni, ferme }).catch(() => undefined)
  for (const c of chats.values()) {
    if (c.chiusa || c.stato !== 'lavora' || c.fineTurno === undefined || Date.now() < c.fineTurno || inStop.has(c.chat)) continue
    inStop.add(c.chat)
    conti.turni += 1
    chiama(`/hook/stop?ap=${id}&chat=${c.chat}`, {
      session_id: c.sessione, stop_hook_active: false, hook_event_name: 'Stop', cwd: RADICE, transcript_path: 'x.jsonl',
      last_assistant_message: 'Ho fatto un pezzo del mio compito.\nSEGNALE: avanti — continuo'
    }).then((r) => {
      inStop.delete(c.chat)
      if (r?.decision === 'block') { c.stato = 'ferma'; nuovoTurno(c) } else c.stato = 'ferma'
    }).catch(() => { inStop.delete(c.chat); c.stato = 'ferma' })
  }
}

// ── La misura ──
let fermoDa: number | undefined
let fermoPiuLungo = 0
const tratti: number[] = []
let doppioni = 0
let finitoConAperte = 0
function misura(): void {
  const a = archivio.leggi(id)
  if (a === undefined) return
  const aperte = a.chats.filter((x) => x.stato === 'lavoro')
  // Il compito di ogni chat al lavoro è di una sola: niente doppioni.
  const compiti = aperte.map((x) => x.compito)
  if (new Set(compiti).size !== compiti.length) { doppioni += 1; scrivi(`[DOPPIONE] ${compiti.join(' | ')}`) }
  if (a.stato === 'finito' && a.chats.some((x) => x.stato === 'bloccata')) { finitoConAperte += 1; scrivi('[ERRORE] finito con chat aperte') }
  const lavorano = aperte.filter((x) => { const c = chats.get(x.id); return c !== undefined && !c.chiusa && c.stato === 'lavora' }).length
  if (lavorano > 0 && [...chats.values()].some((c) => !c.chiusa && c.stato === 'muta' && c.mutaDa !== undefined && Date.now() - c.mutaDa > 17 * MIN)) mutaFraSorelle += 1
  const fermo = a.stato === 'lavoro' && lavorano === 0
  if (fermo && fermoDa === undefined) fermoDa = Date.now()
  if (!fermo && fermoDa !== undefined) { const d = Date.now() - fermoDa; tratti.push(d); fermoPiuLungo = Math.max(fermoPiuLungo, d); fermoDa = undefined }
  if (fermoDa !== undefined) fermoPiuLungo = Math.max(fermoPiuLungo, Date.now() - fermoDa)
}

async function main(): Promise<void> {
  const ora = new Date().toISOString()
  const a: Autopilota = {
    ...nuovoAutopilota({ id: 'ap-prova-mai-fermo', nome: 'Prova mai fermo', obiettivo: 'Prova di 2 ore: l’autopilota non resta mai fermo', cwd: RADICE, criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: ora }),
    stato: 'lavoro',
    ultimoEvento: ora,
    chats: ['c-1', 'c-2', 'c-3', 'c-4'].map((c) => ({ id: c, compito: `pezzo ${c} della prova`, stato: 'lavoro' as const, cicli: 0, sessionId: `s-${c}`, dal: ora }))
  }
  archivio.scrivi(a)
  id = a.id
  await accendi()
  for (const c of a.chats) { const s: ChatSim = { chat: c.id, sessione: c.sessionId as string, stato: 'ferma', chiusa: false, turni: 0 }; chats.set(c.id, s); nuovoTurno(s) }
  scrivi(`[prova] partita: ${DURATA_MS / MIN} minuti, riavvio del servizio a ${RIAVVIO_DOPO_MS / MIN}, criteri verdi da ${CRITERI_VERDI_DOPO_MS / MIN}`)

  let guardia = setInterval(() => { server.controllaChatFerme() }, MIN)
  const batti = setInterval(() => { void battito() }, MIN)
  const misure = setInterval(misura, 15_000)
  let riavviato = false

  await new Promise<void>((fine) => {
    const ogni = setInterval(() => {
      const passato = Date.now() - inizio
      if (!riavviato && passato >= RIAVVIO_DOPO_MS) {
        riavviato = true
        clearInterval(guardia)
        scrivi('[prova] riavvio del servizio: la memoria dei segnali si perde')
        server.close()
        void accendi().then(() => {
          server.riprendiLavori({ servizioAppenaPartito: true })
          guardia = setInterval(() => { server.controllaChatFerme() }, MIN)
        })
      }
      if (passato >= DURATA_MS || archivio.leggi(id)?.stato === 'finito') { clearInterval(ogni); fine() }
    }, 5_000)
  })
  clearInterval(guardia); clearInterval(batti); clearInterval(misure)
  misura()
  const fin = archivio.leggi(id)
  const righe = (fin?.decisioni ?? []).map((d) => d.cosa)
  const giri = righe.filter((r) => r.startsWith('giro da solo'))
  const esito = {
    minuti: Math.round((Date.now() - inizio) / MIN),
    statoFinale: fin?.stato,
    fermoPiuLungoMin: +(fermoPiuLungo / MIN).toFixed(1),
    trattiSenzaNessunoAlLavoro: tratti.length,
    trattiOltre15Min: tratti.filter((d) => d > 15 * MIN).length,
    giriDaSoli: giri.length,
    riprese: giri.reduce((n, r) => n + (r.match(/le riscrivo l’ultima istruzione/g) ?? []).length, 0),
    sostituzioni: righe.filter((r) => r.includes('il suo compito passa a')).length,
    messeDaParte: righe.filter((r) => r.startsWith('messa da parte')).length,
    doppioni,
    mutaPiuLungaMin: +(Math.max(0, ...muteDurate, ...[...chats.values()].filter((c) => !c.chiusa && c.mutaDa !== undefined).map((c) => Date.now() - (c.mutaDa as number))) / MIN).toFixed(1),
    misureConMutaOltre17MinFraSorelleAlLavoro: mutaFraSorelle,
    righeFerma: righe.filter((r) => /ferma da|rimetto al lavoro|la riprendo/i.test(r)).length,
    giriConAproMaNienteAperto: giri.filter((r) => /apro/.test(r) && /non apro niente/.test(r)).length,
    motiviDeiGiri: [...new Set(giri.map((r) => r.slice(0, 160)))],
    finitoConAperte,
    chatTotali: fin?.chats.length,
    chatAperteAllaFine: fin?.chats.filter((x) => x.stato !== 'finita').length,
    simulate: conti
  }
  writeFileSync(join(RADICE, 'esito-prova.json'), JSON.stringify(esito, null, 2))
  scrivi(`[prova] finita: ${JSON.stringify(esito)}`)
  server.close()
  process.exit(0)
}

void main()
