/**
 * «Salute del sistema» (0.44.0): il pannello che dice com'è messo SierraDeck,
 * su PC e telefono, con ogni voce spiegata per esteso e l'azione per
 * rimediare. Nicholas (02/10) l'ha scelto dalla lista: un posto solo dove
 * vedere il Drive, gli altri PC, l'aggiornamento non riuscito, gli errori
 * delle ultime ore e le consegne non partite.
 *
 * Qui le regole pure: come si compone ogni voce, e come si leggono gli errori
 * dal registro (raggruppati: lo stesso errore cento volte è una voce).
 */

export type Tono = 'ok' | 'attenzione' | 'guasto'

/** Un'azione che chi guarda può fare da lì: il PC e il telefono sanno eseguirle per `id`. */
export type AzioneSalute =
  | { id: 'apri-drive'; testo: string }
  | { id: 'apri-registro'; testo: string }
  | { id: 'installa'; testo: string }
  | { id: 'scarica-a-mano'; testo: string; url: string }
  | { id: 'apri-autopilota'; testo: string; autopilota: string }
  | { id: 'riprova-pc'; testo: string; pc: string }

export type VoceSalute = {
  chiave: string
  gruppo: 'drive' | 'pc' | 'aggiornamento' | 'errori' | 'consegne'
  tono: Tono
  titolo: string
  /** Cosa guarda, cosa vuol dire, cosa succede se non si fa niente. */
  spiegazione: string
  /** Cosa fare, per esteso (anche quando non c'è un tasto). */
  cosaFare?: string
  azioni: AzioneSalute[]
}

export type Salute = { scritto: string; tono: Tono; riassunto: string; voci: VoceSalute[] }

export type PcPerSalute = {
  pcId: string
  nome: string
  versione: string
  /** L'ultimo battito sul Drive, ISO. */
  battito?: string
  /** Com'è adesso dopo il bussare: `acceso`, `non-so`, … (StatoPc). */
  stato?: string
  /** La strada con cui si raggiunge, in due parole («rete di casa», «Tailscale», «WebRTC», «Drive, lento»). */
  strada?: string
}

export type ConsegnaNonPartita = { autopilota: string; nome: string; quando: string; chat: string; esito: 'non-partita' | 'persa'; inizio: string }

export type ErroreLog = { messaggio: string; volte: number; ultimo: string; primo: string }

export type IngressiSalute = {
  adesso: number
  versione: string
  drive: { configurato: boolean; connesso: boolean; scollegatoDal?: string; motivoScollegato?: string; titolo?: string; testo?: string; ultimoSalvataggio?: string }
  pc: PcPerSalute[]
  tentativoFallito?: { titolo: string; motivo: string; strade: string[]; pagina: string; versione: string }
  errori: ErroreLog[]
  consegne: ConsegnaNonPartita[]
  /** Le chat ferme per un errore dell'API, dai segnali di Claude Code (0.45.0). */
  chatInErrore?: { titolo: string; errore: string }[]
  /** Da quante ore si leggono gli errori. */
  oreErrori: number
}

/** «3 ore fa», «2 giorni fa», «adesso». */
export function quantoFa(iso: string | undefined, adesso: number): string {
  if (iso === undefined) return 'mai'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'non si sa'
  const s = Math.max(0, Math.round((adesso - t) / 1000))
  if (s < 60) return 'adesso'
  if (s < 3600) return `${Math.round(s / 60)} minuti fa`
  if (s < 86_400) { const h = Math.round(s / 3600); return h === 1 ? '1 ora fa' : `${h} ore fa` }
  const g = Math.round(s / 86_400)
  return g === 1 ? '1 giorno fa' : `${g} giorni fa`
}

/** Confronta due versioni `x.y.z`. */
function prima(a: string, b: string): boolean {
  const x = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const y = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  return false
}

/**
 * Gli errori delle ultime `ore` dal registro: le righe `[ERRORE]` e quelle che
 * dicono «fallito», «non riuscito», «rifiutat…». Raggruppate per messaggio
 * (numeri, orari e id tolti), dalla più recente.
 */
export function erroriDalLog(righe: string[], adesso: number, ore: number): ErroreLog[] {
  const da = adesso - ore * 3_600_000
  const gruppi = new Map<string, ErroreLog>()
  for (const r of righe) {
    const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) \[([A-Za-z]+)\] (.*)$/.exec(r)
    if (m === null) continue
    const t = Date.parse(m[1] as string)
    if (Number.isNaN(t) || t < da) continue
    const livello = (m[2] as string).toUpperCase()
    const testo = (m[3] as string).trim()
    const grave = livello === 'ERRORE' || livello === 'ERROR'
    if (!grave && !/\b(fallit[oaie]|non riuscit[oaie]|rifiutat[oaie]|guasto|non partit[oaie])\b/i.test(testo)) continue
    const chiave = testo.replace(/\d+([.,:]\d+)*/g, '#').replace(/[0-9a-f]{8,}/gi, '#').slice(0, 160)
    const g = gruppi.get(chiave)
    if (g === undefined) gruppi.set(chiave, { messaggio: testo.slice(0, 400), volte: 1, ultimo: m[1] as string, primo: m[1] as string })
    else { g.volte += 1; if ((m[1] as string) > g.ultimo) { g.ultimo = m[1] as string; g.messaggio = testo.slice(0, 400) } }
  }
  return [...gruppi.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo))
}

/** Le voci del pannello, in ordine: Drive, PC, aggiornamento, errori, consegne. */
export function componiSalute(i: IngressiSalute): Salute {
  const voci: VoceSalute[] = []

  // ── Drive ──
  if (!i.drive.configurato) {
    voci.push({
      chiave: 'drive', gruppo: 'drive', tono: 'attenzione', titolo: 'Drive non configurato',
      spiegazione: 'Questo PC non ha un Drive collegato: le chat di qui non hanno un salvataggio, e gli altri PC non sanno che esiste (niente battiti). Tutto il resto funziona.',
      cosaFare: 'Se usi più PC o vuoi un salvataggio delle chat: Account → Drive → Collega.',
      azioni: [{ id: 'apri-drive', testo: 'Apri Account → Drive' }]
    })
  } else if (!i.drive.connesso) {
    voci.push({
      chiave: 'drive', gruppo: 'drive', tono: 'guasto',
      titolo: i.drive.titolo ?? 'Drive scollegato',
      spiegazione: i.drive.testo ?? 'Il Drive di questo PC non ha l’autorizzazione: le chat non si salvano e gli altri PC non si vedono.',
      cosaFare: 'Account → Drive → Collega, con lo stesso account Google, su ogni PC dove compare questa voce.',
      azioni: [{ id: 'apri-drive', testo: 'Ricollega il Drive' }]
    })
  } else {
    voci.push({
      chiave: 'drive', gruppo: 'drive', tono: 'ok', titolo: 'Drive collegato',
      spiegazione: `Le chat di qui salgono sul Drive come salvataggio, e gli altri PC si vedono dai loro battiti. Ultimo salvataggio: ${quantoFa(i.drive.ultimoSalvataggio, i.adesso)}.`,
      azioni: []
    })
  }

  // ── Gli altri PC ──
  if (i.pc.length === 0) {
    voci.push({
      chiave: 'pc', gruppo: 'pc', tono: 'ok', titolo: 'Nessun altro PC',
      spiegazione: 'Non c’è nessun altro PC con SierraDeck e lo stesso Drive. Se ne hai uno e non compare, su quel PC collega il Drive con lo stesso account e apri la stessa cassaforte.',
      azioni: []
    })
  }
  for (const p of i.pc) {
    const eta = quantoFa(p.battito, i.adesso)
    const vecchio = p.battito === undefined || i.adesso - Date.parse(p.battito) > 10 * 60_000
    const raggiungibile = p.stato === 'acceso'
    const indietro = prima(p.versione, i.versione)
    const tono: Tono = raggiungibile ? (indietro ? 'attenzione' : 'ok') : vecchio ? 'attenzione' : 'guasto'
    const strada = p.strada !== undefined ? `si raggiunge via ${p.strada}` : raggiungibile ? 'risponde' : 'non risponde a nessuna strada'
    voci.push({
      chiave: `pc:${p.pcId}`, gruppo: 'pc', tono,
      titolo: `${p.nome} · ${raggiungibile ? 'acceso' : 'non so se è acceso'} · ${p.versione}`,
      spiegazione: `Ultimo battito sul Drive: ${eta}. Adesso ${strada}. ${indietro ? `Ha la ${p.versione}, questo PC la ${i.versione}: alcune cose nuove (le chat dal vivo, lo spostamento dei progetti) là non ci sono ancora.` : 'Ha la stessa versione di questo PC, o più nuova.'}`,
      ...(raggiungibile
        ? (indietro ? { cosaFare: `Aggiorna ${p.nome}: dal suo schermo «Installa», oppure aspetta che lo faccia da solo alla prossima apertura.` } : {})
        : { cosaFare: `Accendi ${p.nome} con SierraDeck aperto e il Drive collegato. Se è acceso: stessa rete o Tailscale acceso su tutti e due; altrimenti il collegamento diretto via Internet parte da solo (serve il Drive).` }),
      azioni: raggiungibile ? [] : [{ id: 'riprova-pc', testo: 'Riprova adesso', pc: p.pcId }]
    })
  }

  // ── L'aggiornamento non riuscito ──
  if (i.tentativoFallito !== undefined) {
    const t = i.tentativoFallito
    voci.push({
      chiave: 'aggiornamento', gruppo: 'aggiornamento', tono: 'guasto', titolo: t.titolo,
      spiegazione: `${t.motivo} Finché non si installa resti sulla ${i.versione}, con i difetti che la ${t.versione} corregge.`,
      cosaFare: t.strade.join(' '),
      azioni: [{ id: 'installa', testo: 'Riprova «Installa»' }, { id: 'scarica-a-mano', testo: 'Scarica l’installer a mano', url: t.pagina }]
    })
  }

  // ── Gli errori delle ultime ore ──
  if (i.errori.length === 0) {
    voci.push({
      chiave: 'errori', gruppo: 'errori', tono: 'ok', titolo: `Nessun errore nelle ultime ${i.oreErrori} ore`,
      spiegazione: 'Il registro di questo PC non ha righe di errore né operazioni «non riuscite» nelle ultime ore.',
      azioni: [{ id: 'apri-registro', testo: 'Apri la cartella del registro' }]
    })
  }
  for (const [k, e] of i.errori.slice(0, 12).entries()) {
    voci.push({
      chiave: `errore:${k}`, gruppo: 'errori', tono: 'attenzione',
      titolo: `${e.volte > 1 ? `${e.volte} volte · ` : ''}${quantoFa(e.ultimo, i.adesso)}: ${e.messaggio.slice(0, 120)}${e.messaggio.length > 120 ? '…' : ''}`,
      spiegazione: `Dal registro di questo PC${e.volte > 1 ? `, la prima volta ${quantoFa(e.primo, i.adesso)}` : ''}: ${e.messaggio}`,
      cosaFare: 'Se si ripete e qualcosa non va, apri il registro e manda le righe di quell’ora a chi ti aiuta: dicono cosa è successo e in che ordine.',
      azioni: [{ id: 'apri-registro', testo: 'Apri la cartella del registro' }]
    })
  }

  // ── Le chat ferme per un errore dell'API (segnale StopFailure, 0.45.0) ──
  for (const c of i.chatInErrore ?? []) {
    voci.push({
      chiave: `chat-errore:${c.titolo}`, gruppo: 'errori', tono: 'guasto',
      titolo: `La chat «${c.titolo}» si è fermata per un errore: ${c.errore.slice(0, 100)}`,
      spiegazione: `Claude Code ha chiuso il turno per un errore dell’API (${c.errore}). Il lavoro fatto fin lì c’è; la chat aspetta. Se è il limite del piano, riparte quando il limite si azzera; se è l’accesso, va rifatto il login di Claude Code.`,
      cosaFare: 'Scrivi alla chat di riprendere quando il motivo è passato; se è l’accesso, apri una chat e fai /login.',
      azioni: []
    })
  }

  // ── Le consegne non partite ──
  for (const c of i.consegne) {
    voci.push({
      chiave: `consegna:${c.autopilota}:${c.quando}`, gruppo: 'consegne', tono: 'guasto',
      titolo: `«${c.nome}»: un’istruzione ${c.esito === 'persa' ? 'mai arrivata' : 'non partita'} nella chat «${c.chat}» (${quantoFa(c.quando, i.adesso)})`,
      spiegazione: c.esito === 'persa'
        ? `Il programma non è riuscito a scriverla nella chat dopo cinque tentativi (nessuna finestra, o la chat chiusa). L’autopilota aspetta una risposta a qualcosa che la chat non ha mai ricevuto. Comincia così: «${c.inizio}»`
        : `È stata scritta nella chat ma la chat non si è messa al lavoro, nemmeno dopo i tentativi automatici. Comincia così: «${c.inizio}»`,
      cosaFare: 'Apri l’autopilota: nella linguetta «Istruzioni» c’è il testo intero. Puoi rimandarla a mano nella chat, o scrivere all’autopilota cosa fare.',
      azioni: [{ id: 'apri-autopilota', testo: 'Apri l’autopilota', autopilota: c.autopilota }]
    })
  }

  const peggiore: Tono = voci.some((v) => v.tono === 'guasto') ? 'guasto' : voci.some((v) => v.tono === 'attenzione') ? 'attenzione' : 'ok'
  const guasti = voci.filter((v) => v.tono === 'guasto').length
  const attenzioni = voci.filter((v) => v.tono === 'attenzione').length
  const riassunto = peggiore === 'ok' ? 'Tutto a posto.'
    : [guasti > 0 ? `${guasti} ${guasti === 1 ? 'cosa da sistemare' : 'cose da sistemare'}` : '', attenzioni > 0 ? `${attenzioni} da guardare` : ''].filter((x) => x !== '').join(' · ')
  return { scritto: new Date(i.adesso).toISOString(), tono: peggiore, riassunto, voci }
}
