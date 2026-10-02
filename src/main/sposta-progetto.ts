import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { improntaDi } from './cassaforte/incrementale'
import {
  controlliSposta, sipuoSpostare, verificaSposta, type CasaChat, type Controllo, type RegistroRiordino, type StatoPerSposta
} from '@shared/una-casa'
import type { ChatLocale, UnaCasa } from './una-casa'

/**
 * «Sposta progetto da un PC all'altro» (0.42.0): la procedura a passi, dal
 * lato del PC dove il progetto sta adesso. I testi dei passi stanno in
 * `PASSI_SPOSTA` (`src/shared/una-casa.ts`); qui il lavoro di ognuno.
 *
 * Il PC di destinazione riceve con tre rotte del Client, solo per gli altri
 * PC con la chiave di casa: `/api/sposta/pronto` (versione e nome),
 * `/api/sposta/ricevi` (il suo «Porta qui» del progetto, e la casa) e
 * `/api/sposta/verifica` (dimensione e impronta delle chat ricevute).
 */

export type ProgettoSpostabile = { cwd: string; nome: string; sessioni: string[]; titoli: string[] }

export type DipendenzeSposta = {
  io: () => { id: string; nome: string }
  unaCasa: UnaCasa
  chatLocali: () => ChatLocale[]
  /** Le chat aperte qui: la sessione, la cartella, se lavora adesso. */
  aperte: () => { sessione?: string; cwd: string; alLavoro: boolean }[]
  autopilotiAlLavoro: (cwd: string) => Promise<number>
  driveCollegato: () => boolean
  cassaforteAperta: () => boolean
  /** I PC noti (dai battiti). */
  altriPc: () => { pcId: string; nome: string }[]
  /** Una rotta del PC di destinazione, per la strada che c'è. */
  chiamaPc: (pcId: string, percorso: string, corpo?: unknown) => Promise<unknown>
  stradaDi: (pcId: string) => string | undefined
  /** Il progetto sul Drive per quella cartella (id), mettendocelo se serve. */
  progettoSulDrive: (cwd: string, mettiSeManca: boolean) => { id?: string; appenaMesso?: boolean }
  salva: () => Promise<{ ok: boolean; messaggio?: string }>
  adesso?: () => string
  log?: (m: string) => void
}

const stessa = (a: string, b: string): boolean => a.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() === b.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
const dentroO = (cwd: string, radice: string): boolean => {
  const n = (x: string): string => x.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return n(cwd) === n(radice) || n(cwd).startsWith(`${n(radice)}\\`)
}

/** Quanti file git ha fuori da un commit; `undefined` se non è un repository. */
function modificheGit(cwd: string): Promise<{ repo: boolean; modifiche: number }> {
  return new Promise((ok) => {
    if (!existsSync(join(cwd, '.git'))) { ok({ repo: false, modifiche: 0 }); return }
    execFile('git', ['status', '--porcelain'], { cwd, windowsHide: true, timeout: 15_000 }, (err, out) => {
      if (err !== null) { ok({ repo: true, modifiche: 0 }); return }
      ok({ repo: true, modifiche: String(out).split('\n').filter((r) => r.trim() !== '').length })
    })
  })
}

export function creaSpostaProgetto(deps: DipendenzeSposta): {
  progetti: () => ProgettoSpostabile[]
  controlli: (cwd: string, destinazione: string) => Promise<Controllo[]>
  trasferisci: (cwd: string, destinazione: string, mettiSulDrive: boolean) => Promise<{ ok: boolean; messaggio: string; serveDrive?: boolean }>
  verifica: (cwd: string, destinazione: string) => Promise<{ ok: boolean; messaggio: string; diverse?: string[] }>
  cambiaCasa: (cwd: string, destinazione: string) => Promise<{ ok: boolean; messaggio: string }>
  archivia: (cwd: string, destinazione: string) => Promise<{ ok: boolean; messaggio: string; registro?: RegistroRiordino }>
} {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const log = deps.log ?? ((): void => {})
  const nomeDi = (pcId: string): string => deps.altriPc().find((p) => p.pcId === pcId)?.nome ?? 'l’altro PC'
  /** Le chat di qui nella cartella del progetto, con casa qui (o senza casa). */
  const chatDi = (cwd: string): ChatLocale[] => deps.chatLocali().filter((c) => c.cwd !== undefined && dentroO(c.cwd, cwd)).filter((c) => {
    const casa = deps.unaCasa.casaDi(c.sessione)
    return casa === undefined || casa.pc === deps.io().id
  })
  const casaVerso = (destinazione: string): CasaChat => ({
    pc: destinazione, pcNome: nomeDi(destinazione), decisaIl: adesso(), da: 'sposta',
    motivo: `spostata da ${deps.io().nome} a ${nomeDi(destinazione)} con «Sposta progetto» il ${adesso().slice(0, 10)}`
  })

  return {
    progetti() {
      const g = new Map<string, ProgettoSpostabile>()
      for (const c of deps.chatLocali()) {
        if (c.cwd === undefined) continue
        const casa = deps.unaCasa.casaDi(c.sessione)
        if (casa !== undefined && casa.pc !== deps.io().id) continue
        const chiave = [...g.keys()].find((k) => stessa(k, c.cwd as string)) ?? c.cwd
        const p = g.get(chiave) ?? { cwd: c.cwd, nome: c.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? c.cwd, sessioni: [], titoli: [] }
        p.sessioni.push(c.sessione)
        p.titoli.push(c.titolo)
        g.set(chiave, p)
      }
      return [...g.values()].filter((p) => existsSync(p.cwd)).sort((a, b) => a.nome.localeCompare(b.nome))
    },
    async controlli(cwd, destinazione) {
      const chat = chatDi(cwd)
      const sessioni = new Set(chat.map((c) => c.sessione))
      const aperte = deps.aperte().filter((a) => (a.sessione !== undefined && sessioni.has(a.sessione)) || dentroO(a.cwd, cwd))
      let destinazioneInfo: StatoPerSposta['destinazione']
      if (destinazione !== '') {
        try {
          const r = await deps.chiamaPc(destinazione, '/api/sposta/pronto') as { versione?: unknown; nome?: unknown }
          const strada = deps.stradaDi(destinazione)
          destinazioneInfo = { raggiungibile: true, nome: typeof r.nome === 'string' ? r.nome : nomeDi(destinazione), ...(typeof r.versione === 'string' ? { versione: r.versione } : {}), ...(strada !== undefined ? { strada } : {}) }
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err)
          // Risponde ma la rotta non c'è: una versione prima della 0.42.0.
          destinazioneInfo = /404|non è aperta|chat/.test(m) ? { raggiungibile: true, nome: nomeDi(destinazione), versione: 'prima della 0.42.0' } : { raggiungibile: false, nome: nomeDi(destinazione) }
        }
      }
      const stato: StatoPerSposta = {
        chatDaSpostare: chat.length,
        chatAperte: aperte.length,
        chatAlLavoro: aperte.filter((a) => a.alLavoro).length,
        autopilotiAlLavoro: await deps.autopilotiAlLavoro(cwd).catch(() => 0),
        git: await modificheGit(cwd),
        driveCollegato: deps.driveCollegato(),
        cassaforteAperta: deps.cassaforteAperta(),
        ...(destinazioneInfo !== undefined ? { destinazione: destinazioneInfo } : {})
      }
      return controlliSposta(stato)
    },
    async trasferisci(cwd, destinazione, mettiSulDrive) {
      const ctrl = await this.controlli(cwd, destinazione)
      if (!sipuoSpostare(ctrl)) return { ok: false, messaggio: `I controlli non sono più tutti a posto: ${ctrl.filter((c) => !c.ok).map((c) => c.titolo).join('; ')}.` }
      const p = deps.progettoSulDrive(cwd, mettiSulDrive)
      if (p.id === undefined) return { ok: false, serveDrive: true, messaggio: 'La cartella del progetto non è sul Drive, ed è il modo in cui viaggia: spunta «Metti la cartella sul Drive» e riprova.' }
      log(`[sposta] «${cwd}» verso ${nomeDi(destinazione)}: salvo sul Drive${p.appenaMesso === true ? ' (cartella appena messa sul Drive)' : ''}`)
      const s = await deps.salva()
      if (!s.ok) return { ok: false, messaggio: `Il salvataggio sul Drive non è riuscito (${s.messaggio ?? 'motivo sconosciuto'}): non chiedo niente a ${nomeDi(destinazione)}. Riprova fra poco.` }
      const sessioni = chatDi(cwd).map((c) => c.sessione)
      try {
        const r = await deps.chiamaPc(destinazione, '/api/sposta/ricevi', { progetto: p.id, sessioni, daPc: deps.io().id, daNome: deps.io().nome, cwdOrigine: cwd }) as { ok?: unknown; messaggio?: unknown; cartella?: unknown }
        if (r.ok !== true) return { ok: false, messaggio: `${nomeDi(destinazione)} non è riuscito a portarlo da sé: ${typeof r.messaggio === 'string' ? r.messaggio : 'nessun motivo'}. Qui non è cambiato niente.` }
        return { ok: true, messaggio: `${nomeDi(destinazione)} ha portato il progetto da sé${typeof r.cartella === 'string' ? `, nella cartella ${r.cartella}` : ''}. Adesso verifico che sia arrivato tutto.` }
      } catch (err) {
        return { ok: false, messaggio: `Non riesco a chiederlo a ${nomeDi(destinazione)}: ${err instanceof Error ? err.message : String(err)}. Qui non è cambiato niente.` }
      }
    },
    async verifica(cwd, destinazione) {
      const chat = chatDi(cwd)
      const qui: Record<string, { size: number; sha: string }> = {}
      for (const c of chat) {
        const sha = await improntaDi(c.jsonl)
        if (sha !== undefined) qui[c.sessione] = { size: statSync(c.jsonl).size, sha }
      }
      // Il PC di destinazione può essersi riavviato dopo «Porta qui»: si
      // riprova per un minuto prima di dire che non risponde.
      let la: Record<string, { size: number; sha?: string } | undefined> | undefined
      let ultimoErrore = ''
      for (let k = 0; k < 12 && la === undefined; k += 1) {
        try {
          const r = await deps.chiamaPc(destinazione, '/api/sposta/verifica', { sessioni: Object.keys(qui) }) as { file?: Record<string, { size: number; sha?: string }> }
          la = r.file ?? {}
        } catch (err) {
          ultimoErrore = err instanceof Error ? err.message : String(err)
          await new Promise((ok) => setTimeout(ok, 5000))
        }
      }
      if (la === undefined) return { ok: false, messaggio: `${nomeDi(destinazione)} non risponde alla verifica (${ultimoErrore}). Qui non è cambiato niente: riprova la verifica quando torna.` }
      const v = verificaSposta(qui, la)
      if (!v.ok) return { ok: false, diverse: v.diverse, messaggio: `${v.diverse.length} chat su ${Object.keys(qui).length} non sono arrivate uguali su ${nomeDi(destinazione)}. Mi fermo: la casa resta qui e niente è stato spostato. Puoi riprovare il trasferimento.` }
      return { ok: true, messaggio: `Tutte le ${Object.keys(qui).length} chat sono arrivate su ${nomeDi(destinazione)}, con la stessa dimensione e la stessa impronta.` }
    },
    async cambiaCasa(cwd, destinazione) {
      const nuove: Record<string, CasaChat> = {}
      for (const c of chatDi(cwd)) nuove[c.sessione] = casaVerso(destinazione)
      await deps.unaCasa.memorizza(nuove)
      return { ok: true, messaggio: `Le ${Object.keys(nuove).length} chat hanno casa su ${nomeDi(destinazione)}.` }
    },
    async archivia(cwd, destinazione) {
      // Dopo il cambio di casa le chat non sono più «di qui»: si prendono per cartella.
      const sessioni = deps.chatLocali().filter((c) => c.cwd !== undefined && dentroO(c.cwd, cwd)).map((c) => c.sessione)
      const registro = await deps.unaCasa.riordina(sessioni, { tipo: 'sposta', verso: { pc: destinazione, nome: nomeDi(destinazione), cwd }, casaNuova: () => casaVerso(destinazione) })
      return { ok: true, registro, messaggio: `Le chat di qui sono nella cartella di recupero (${registro.spostamenti.length} file), non cancellate. La cartella del codice ${cwd} resta dov’è.` }
    }
  }
}

/** Dal lato di chi riceve: le chat con quella sessione nella cartella dei progetti di Claude Code. */
export function fileDelleSessioni(radiceProgetti: string, sessioni: string[]): Map<string, string[]> {
  const fuori = new Map<string, string[]>()
  let cartelle: string[] = []
  try { cartelle = readdirSync(radiceProgetti) } catch { return fuori }
  for (const d of cartelle) {
    for (const s of sessioni) {
      const f = join(radiceProgetti, d, `${s}.jsonl`)
      if (existsSync(f)) fuori.set(s, [...(fuori.get(s) ?? []), f])
    }
  }
  return fuori
}

/** Dimensione e impronta della copia più lunga di ogni sessione. */
export async function impronteSessioni(radiceProgetti: string, sessioni: string[]): Promise<Record<string, { size: number; sha?: string }>> {
  const fuori: Record<string, { size: number; sha?: string }> = {}
  for (const [s, file] of fileDelleSessioni(radiceProgetti, sessioni)) {
    const piuLungo = file.map((f) => ({ f, size: statSync(f).size })).sort((a, b) => b.size - a.size)[0]
    if (piuLungo === undefined) continue
    const sha = await improntaDi(piuLungo.f)
    fuori[s] = { size: piuLungo.size, ...(sha !== undefined ? { sha } : {}) }
  }
  return fuori
}
