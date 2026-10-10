import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviAtomico, scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  controllaVoce, idDomandaPersonale, leggiIdDomandaPersonale, OPZIONI_CONSENSO, sceltaDaRisposta, testoDomandaConsenso, trovaVoce,
  type ConsensoSempre, type EsitoUso, type RichiestaPersonale, type StatoQuadernoPersonale, type UsoPersonale, type VocePersonale
} from '@shared/quaderno-personale'
import type { DomandaPerDomande } from '@shared/domande-telefono'

/**
 * Il Quaderno personale sul disco (0.57.0). Le regole e i testi stanno in
 * `@shared/quaderno-personale`.
 *
 * **Dove e come.** Un file solo, `<dati>/quaderno-personale.cifrato`, nella
 * cartella dei dati del programma (mai in un progetto, quindi mai in git):
 * AES-256-GCM con una chiave casuale. La chiave sta in
 * `quaderno-personale.chiave.json`, avvolta dal portachiavi di Windows
 * (DPAPI, legato a questo utente su questo PC), come le password SFTP. Il
 * file copiato su un altro computer non si apre. Non va sul Drive.
 *
 * **Le richieste delle chat** vivono in memoria: un riavvio del programma le
 * chiude come «nessuna risposta», cioè no.
 */

export type PortachiaviPersonale = {
  disponibile: () => boolean
  /** Avvolge la chiave del quaderno, la restituisce in testo. */
  avvolgi: (chiave: Buffer) => string
  svolgi: (avvolta: string) => Buffer
}

export type ChatCheChiede = { sessione: string; titolo: string }

export type QuadernoPersonale = {
  stato: () => StatoQuadernoPersonale
  salva: (v: { id?: string; nome: string; valore: string; nota?: string }) => { ok: true; voce: VocePersonale } | { ok: false; errore: string }
  togli: (id: string) => boolean
  /** Toglie un «sempre per questa chat». */
  revoca: (sessione: string, voceId: string) => boolean
  /** Lo strumento delle chat: il testo da restituire, e se è un rifiuto. */
  chiedi: (chat: ChatCheChiede, voce: unknown, motivo: unknown) => Promise<{ testo: string; errore: boolean }>
  /** Le domande di consenso aperte, per le Domande. */
  domande: () => DomandaPerDomande[]
  /** La risposta a una domanda di consenso; falso se non è una sua. */
  rispondi: (idDomanda: string, risposta: string) => boolean
}

type Contenuto = { voci: VocePersonale[]; consensi: ConsensoSempre[]; usi: UsoPersonale[] }

export const FILE_QUADERNO_PERSONALE = 'quaderno-personale.cifrato'
export const FILE_CHIAVE_PERSONALE = 'quaderno-personale.chiave.json'
/** Gli usi si tengono per gli ultimi 500: è un registro da consultare, non un archivio. */
const MAX_USI = 500

export function apriQuadernoPersonale(opz: {
  cartella: string
  portachiavi: PortachiaviPersonale
  adesso?: () => number
  /** Quanto aspettare la scelta di Nicholas. */
  attesaMs?: number
  /** Quando cambia qualcosa (una voce, un consenso, un uso, una domanda): per avvisare subito le finestre. */
  cambiate?: () => void
}): QuadernoPersonale {
  const adesso = opz.adesso ?? (() => Date.now())
  const attesaMs = opz.attesaMs ?? 120_000
  const fileDati = join(opz.cartella, FILE_QUADERNO_PERSONALE)
  const fileChiave = join(opz.cartella, FILE_CHIAVE_PERSONALE)
  const iso = (): string => new Date(adesso()).toISOString()

  let chiave: Buffer | undefined
  let perche: string | undefined
  /** La chiave: quella avvolta su disco, o una nuova al primo uso. */
  const laChiave = (): Buffer | undefined => {
    if (chiave !== undefined) return chiave
    if (!opz.portachiavi.disponibile()) {
      perche = 'Il portachiavi di Windows non è disponibile per questo utente: senza, il quaderno personale non si può cifrare, e resta spento.'
      return undefined
    }
    try {
      if (existsSync(fileChiave)) {
        const j = JSON.parse(readFileSync(fileChiave, 'utf8')) as { avvolta?: unknown }
        if (typeof j.avvolta !== 'string') throw new Error('chiave senza contenuto')
        chiave = opz.portachiavi.svolgi(j.avvolta)
      } else {
        const nuova = randomBytes(32)
        if (!scriviJsonAtomico(fileChiave, { versione: 1, avvolta: opz.portachiavi.avvolgi(nuova) }, 'quaderno-personale', { mode: 0o600 })) {
          perche = 'Non sono riuscito a scrivere la chiave del quaderno personale nella cartella dei dati.'
          return undefined
        }
        chiave = nuova
      }
      return chiave
    } catch (err) {
      perche = `La chiave del quaderno personale non si apre (${err instanceof Error ? err.message : String(err)}). Succede se la cartella dei dati viene da un altro utente o da un altro PC: il portachiavi è legato a questo.`
      return undefined
    }
  }

  const vuoto = (): Contenuto => ({ voci: [], consensi: [], usi: [] })
  let contenuto: Contenuto | undefined
  const leggi = (): Contenuto | undefined => {
    if (contenuto !== undefined) return contenuto
    const k = laChiave()
    if (k === undefined) return undefined
    if (!existsSync(fileDati)) { contenuto = vuoto(); return contenuto }
    try {
      const b = Buffer.from(readFileSync(fileDati, 'utf8'), 'base64')
      const d = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12))
      d.setAuthTag(b.subarray(12, 28))
      const chiaro = Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
      const x = JSON.parse(chiaro) as Partial<Contenuto>
      contenuto = { voci: x.voci ?? [], consensi: x.consensi ?? [], usi: x.usi ?? [] }
      return contenuto
    } catch {
      perche = 'Il file del quaderno personale non si decifra: è stato modificato, o la chiave non è la sua. Non lo sovrascrivo: guarda il registro.'
      return undefined
    }
  }
  const scrivi = (c: Contenuto): boolean => {
    const k = laChiave()
    if (k === undefined) return false
    const iv = randomBytes(12)
    const ci = createCipheriv('aes-256-gcm', k, iv)
    const cifrato = Buffer.concat([ci.update(Buffer.from(JSON.stringify(c), 'utf8')), ci.final()])
    const ok = scriviAtomico(fileDati, Buffer.concat([iv, ci.getAuthTag(), cifrato]).toString('base64'), 'quaderno-personale', { mode: 0o600 })
    if (ok) { contenuto = c; opz.cambiate?.() }
    return ok
  }

  const richieste = new Map<string, RichiestaPersonale & { fine: (s: 'una-volta' | 'sempre' | 'no' | 'scaduta') => void }>()
  const ricordaUso = (u: Omit<UsoPersonale, 'id' | 'quando'>): void => {
    const c = leggi()
    if (c === undefined) return
    scrivi({ ...c, usi: [...c.usi, { id: randomUUID(), quando: iso(), ...u }].slice(-MAX_USI) })
  }
  const spento = (): { testo: string; errore: boolean } => ({ testo: `Rifiutato: il quaderno personale non è disponibile su questo PC. ${perche ?? ''}`.trim(), errore: true })

  return {
    stato() {
      const c = leggi()
      return {
        disponibile: c !== undefined,
        ...(c === undefined && perche !== undefined ? { perche } : {}),
        voci: c?.voci ?? [],
        consensi: c?.consensi ?? [],
        usi: [...(c?.usi ?? [])].reverse(),
        richieste: [...richieste.values()].map(({ fine: _f, ...r }) => r)
      }
    },

    salva(v) {
      const c = leggi()
      if (c === undefined) return { ok: false, errore: perche ?? 'Il quaderno personale non è disponibile.' }
      const nota = v.nota?.trim() === '' ? undefined : v.nota?.trim()
      const errore = controllaVoce(v.nome, v.valore, nota, c.voci, v.id)
      if (errore !== undefined) return { ok: false, errore }
      if (v.id !== undefined && !c.voci.some((x) => x.id === v.id)) return { ok: false, errore: 'Questa voce non c’è più: forse è stata tolta da un’altra finestra.' }
      const voce: VocePersonale = { id: v.id ?? randomUUID(), nome: v.nome.trim(), valore: v.valore, ...(nota !== undefined ? { nota } : {}), modificata: iso() }
      const voci = v.id === undefined ? [...c.voci, voce] : c.voci.map((x) => (x.id === v.id ? voce : x))
      // Il nome nei consensi segue la voce: la revoca deve dire il nome di adesso.
      const consensi = c.consensi.map((k) => (k.voceId === voce.id ? { ...k, voce: voce.nome } : k))
      return scrivi({ ...c, voci, consensi }) ? { ok: true, voce } : { ok: false, errore: 'Non sono riuscito a salvare il quaderno personale sul disco: guarda il registro.' }
    },

    togli(id) {
      const c = leggi()
      if (c === undefined || !c.voci.some((v) => v.id === id)) return false
      // Con la voce se ne vanno anche i suoi «sempre»: una voce rifatta con lo stesso nome si richiede da capo.
      return scrivi({ ...c, voci: c.voci.filter((v) => v.id !== id), consensi: c.consensi.filter((k) => k.voceId !== id) })
    },

    revoca(sessione, voceId) {
      const c = leggi()
      if (c === undefined) return false
      const resto = c.consensi.filter((k) => !(k.sessione === sessione && k.voceId === voceId))
      return resto.length !== c.consensi.length && scrivi({ ...c, consensi: resto })
    },

    async chiedi(chat, voce, motivo) {
      const c = leggi()
      if (c === undefined) return spento()
      if (typeof voce !== 'string' || voce.trim() === '') return { testo: 'Rifiutato: manca la voce da chiedere (voce).', errore: true }
      if (typeof motivo !== 'string' || motivo.trim().length < 3) {
        return { testo: 'Rifiutato: serve il motivo (motivo), con parole tue: Nicholas lo legge prima di decidere.', errore: true }
      }
      const m = motivo.trim().slice(0, 500)
      const v = trovaVoce(c.voci, voce)
      if (v === undefined) {
        ricordaUso({ chat: chat.titolo, sessione: chat.sessione, voce: voce.trim().slice(0, 80), motivo: m, esito: 'voce-assente' })
        const nomi = c.voci.map((x) => `«${x.nome}»`).join(', ')
        return {
          testo: `Nel quaderno personale non c’è «${voce.trim()}». ${nomi === '' ? 'Il quaderno è vuoto.' : `Le voci che ci sono: ${nomi}.`} ` +
            'Se serve un dato nuovo, chiedi a Nicholas di aggiungerlo dal PC (Impostazioni → Quaderno personale) o dall’app. Non inventarlo.',
          errore: true
        }
      }
      const dato = (esito: EsitoUso): { testo: string; errore: boolean } => {
        ricordaUso({ chat: chat.titolo, sessione: chat.sessione, voce: v.nome, motivo: m, esito })
        return {
          testo: `«${v.nome}»: ${v.valore}\n\nUsalo solo per quello che hai detto («${m}»). ` +
            'Non scriverlo in file del repository, nei test, nei messaggi di commit o nel quaderno del progetto, a meno che Nicholas non te lo abbia chiesto per quel posto preciso.',
          errore: false
        }
      }
      if (c.consensi.some((k) => k.sessione === chat.sessione && k.voceId === v.id)) return dato('gia-consentita')

      const id = randomUUID()
      const scelta = await new Promise<'una-volta' | 'sempre' | 'no' | 'scaduta'>((ok) => {
        const timer = setTimeout(() => fine('scaduta'), attesaMs)
        const fine = (s: 'una-volta' | 'sempre' | 'no' | 'scaduta'): void => {
          if (!richieste.has(id)) return
          clearTimeout(timer)
          richieste.delete(id)
          opz.cambiate?.()
          ok(s)
        }
        richieste.set(id, { id, sessione: chat.sessione, chat: chat.titolo, voceId: v.id, voce: v.nome, motivo: m, creata: iso(), fine })
        opz.cambiate?.()
      })
      if (scelta === 'sempre') {
        const ora = leggi()
        if (ora !== undefined && !ora.consensi.some((k) => k.sessione === chat.sessione && k.voceId === v.id)) {
          scrivi({ ...ora, consensi: [...ora.consensi, { sessione: chat.sessione, chat: chat.titolo, voceId: v.id, voce: v.nome, dal: iso() }] })
        }
        return dato('sempre')
      }
      if (scelta === 'una-volta') return dato('una-volta')
      ricordaUso({ chat: chat.titolo, sessione: chat.sessione, voce: v.nome, motivo: m, esito: scelta === 'no' ? 'negato' : 'nessuna-risposta' })
      return scelta === 'no'
        ? { testo: `Nicholas ha detto di no: il dato «${v.nome}» non te lo do. Non chiederlo di nuovo per lo stesso motivo; se ti serve davvero, spiegaglielo in chat.`, errore: true }
        : { testo: `Nessuna risposta da Nicholas in ${Math.round(attesaMs / 1000)} secondi: vale come no, il dato «${v.nome}» non te lo do. Puoi riprovare più tardi, o lasciare un segnaposto evidente e dirglielo.`, errore: true }
    },

    domande() {
      return [...richieste.values()].map((r) => ({
        id: idDomandaPersonale(r.id),
        autopilotaId: 'sierradeck:quaderno-personale',
        testo: testoDomandaConsenso(r),
        apertaIl: Date.parse(r.creata),
        scadeIl: Date.parse(r.creata) + attesaMs,
        opzioni: [...OPZIONI_CONSENSO],
        da: `Quaderno personale · ${r.chat}`,
        sotto: `chiede «${r.voce}»`
      }))
    },

    rispondi(idDomanda, risposta) {
      const id = leggiIdDomandaPersonale(idDomanda)
      if (id === undefined) return false
      const r = richieste.get(id)
      if (r === undefined) throw new Error('Questa richiesta non aspetta più: è scaduta (dopo due minuti vale no) o ha già avuto risposta.')
      r.fine(sceltaDaRisposta(risposta))
      return true
    }
  }
}
