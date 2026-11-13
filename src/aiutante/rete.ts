import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { hostname, homedir } from 'node:os'
import { join } from 'node:path'
import type { BattitoPc } from '@shared/posta'
import { nomeDaMostrare, nomeSceltoValido } from '@shared/nome-pc'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { improntaPc } from '../main/casa-firma'
import { apriContoDrive, type ContoDrive } from '../main/cassaforte/conto-drive'
import { apriSincronia, type Portachiavi as PortachiaviMaestra, type Sincronia } from '../main/cassaforte/sincronia'
import { creaServerClient, indirizziDaAnnunciare, indirizzoPrincipale, mieiIndirizzi } from '../main/client-server'
import type { Dispositivi } from '../main/dispositivi'
import { creaClientPcRemoto, ErroreRemoto, type ClientPcRemoto } from '../main/pc-remoto'
import { apriIdentitaPc, FILE_PC, type IdentitaPcStore } from '../main/progetti/pc'
import { creaPostino, type Postino } from '../main/progetti/posta'
import { apriRegistroProgetti, type RegistroProgettiStore } from '../main/progetti/registro'
import type { Registro } from '../main/registro'
import { rispondiAiuto, type FonteAiuto } from '../main/rotte-aiuto'
import type { Portachiavi as PortachiaviToken } from '../main/segreti-su-file'

/**
 * **L'Aiutante nella rete** (12/11). Nicholas: «tutto come al solito con
 * l'accesso al Drive condiviso». Entra esattamente come un PC con il programma
 * completo, con gli stessi pezzi (niente riscritto):
 * - il Drive (`conto-drive.ts`, lo stesso consenso Google) e la cassaforte
 *   (`sincronia.ts`, la stessa passphrase, la maestra nel portachiavi);
 * - il battito `pc-<id>` sul Drive dal postino (`progetti/posta.ts`), con
 *   `aiutante: true`: gli altri PC lo riconoscono;
 * - il collegamento sicuro fra i PC (`client-server.ts`): entra solo chi ha la
 *   chiave di casa `HMAC(maestra, 'client-pc:<id>')`, cioè un PC della stessa
 *   cassaforte. Niente codici di accoppiamento, niente pagina per il telefono.
 *
 * Non salva niente sul Drive: nessuna chat, nessun progetto. Del Drive legge
 * solo i battiti degli altri PC, la posta (per gli errori quando il PC di
 * sviluppo è spento) e il registro dei progetti (per sapere qual è il PC di
 * sviluppo di serie).
 */

export type ReteAiutante = {
  contoDrive: ContoDrive
  sincronia: Sincronia
  identita: IdentitaPcStore
  postino: Postino
  remoto: ClientPcRemoto
  registroProgetti: RegistroProgettiStore
  server: () => Server | undefined
  stato: () => { driveConnesso: boolean; driveConfigurato: boolean; email?: string; cassaforteAperta: boolean; inAscolto: boolean; errorePorta?: string; porta: number; altri: BattitoPc[] }
  /** Riavvia il collegamento fra i PC su un'altra porta (cambiata nelle impostazioni). */
  riascolta: (porta: number) => void
  ferma: () => void
}

/** Il collegamento fra i PC dell'Aiutante non accoppia telefoni: nessun dispositivo è mai riconosciuto con una chiave sua. */
export const NESSUN_DISPOSITIVO: Dispositivi = {
  elenca: () => [],
  apriAccoppiamento: () => { throw new Error('SierraDeck Aiutante non accoppia dispositivi') },
  chiudiAccoppiamento: () => {},
  accoppiamentoAperto: () => undefined,
  accoppia: () => undefined,
  riconosci: () => undefined,
  prova: () => undefined,
  revoca: () => {}
}

/**
 * Le rotte del collegamento dell'Aiutante: l'aiuto (le stesse del programma
 * completo, `rotte-aiuto.ts`) e `/api/pc`, il bussare leggero con cui gli
 * altri PC sanno se è acceso. Tutto il resto non c'è.
 */
export function rotteAiutante(p: { aiuto: FonteAiuto; versione: string; identita: () => { nome: string; host: string } }) {
  return async (r: { metodo: string; percorso: string; corpo: unknown; dispositivo?: string }): Promise<{ stato: number; corpo: unknown }> => {
    const a = await rispondiAiuto(r, p.aiuto)
    if (a !== undefined) return a
    if (r.percorso === '/api/pc') {
      const i = p.identita()
      return { stato: 200, corpo: { programma: 'SierraDeck', aiutante: true, versione: p.versione, nome: i.nome, host: i.host } }
    }
    return { stato: 404, corpo: { errore: 'SierraDeck Aiutante: qui ci sono solo i posti per gli altri PC (Aiuta la rete)' } }
  }
}

export function colleghiRete(d: {
  dati: string
  versione: string
  registro: Registro
  portachiaviToken: PortachiaviToken
  portachiaviMaestra: PortachiaviMaestra
  porta: () => number
  oltreLaRete: () => boolean
  aiuto: FonteAiuto
  /** 1.0.3: perché adesso non prende lavori (Claude non collegato…), nel battito. */
  blocco?: () => string | undefined
}): ReteAiutante {
  const { dati, registro } = d
  mkdirSync(dati, { recursive: true })
  const primaVolta = !existsSync(join(dati, FILE_PC))
  const identita = apriIdentitaPc(dati, { nome: () => hostname(), casa: () => homedir(), documenti: () => join(dati, 'documenti') })
  // La prima volta il nome dice che è un Aiutante: sullo stesso PC può esserci anche il programma completo.
  if (primaVolta) { try { identita.impostaNome(nomeSceltoValido(`${hostname()} Aiutante`)) } catch { /* resta l'hostname */ } }
  const contoDrive = apriContoDrive(dati, d.portachiaviToken)
  const registroProgetti = apriRegistroProgetti(dati)
  const sincronia = apriSincronia({
    dati,
    // Nessuna chat da salvare: una cartella vuota sua, mai quella di Claude Code.
    radiceClaude: join(dati, 'nessuna-chat'),
    driveConnesso: () => contoDrive.stato().connesso,
    magazzino: (nome) => contoDrive.magazzino(nome),
    archivio: () => contoDrive.archivio(),
    log: (m) => registro.info(`[cassaforte] ${m}`),
    portachiavi: d.portachiaviMaestra,
    pcNome: () => identita.leggi().nome,
    pcId: () => identita.leggi().id,
    registroProgetti,
    // Niente sale da qui: l'Aiutante non ha niente di suo da mettere sul Drive.
    saleDaQui: () => false
  })
  let statoClient: { inAscolto: boolean; errore?: string } = { inAscolto: false }
  let principale: string | undefined
  void indirizzoPrincipale().then((x) => { principale = x }).catch(() => undefined)
  const postino = creaPostino({
    scatola: () => sincronia.scatola(),
    pcId: () => identita.leggi().id,
    pcNome: () => identita.leggi().nome,
    identita: () => { const i = identita.leggi(); return { host: i.host, ...(i.nomeScelto !== undefined ? { nomeScelto: i.nomeScelto } : {}) } },
    versione: () => d.versione,
    chat: () => [],
    cartelle: () => [],
    rete: () => ({ indirizzi: indirizziDaAnnunciare(undefined, principale), porta: d.porta() }),
    client: () => statoClient,
    aiutante: () => true,
    ...(d.blocco !== undefined ? { bloccoAiutante: d.blocco } : {}),
    // Nessuna cartella qui: una voce per una chat fallisce e lo dice a chi l'ha mandata.
    cartellaEsiste: () => false,
    comando: async (c) => ({ ok: false, esito: c.tipo === 'errori' ? 'questo è SierraDeck Aiutante: gli errori vanno al PC di sviluppo' : 'questo è SierraDeck Aiutante: non apre chat né progetti' }),
    apriChat: () => {},
    riprendiChat: () => {},
    scrivi: () => {},
    memoria: {
      leggi: () => {
        try {
          const raw = JSON.parse(readFileSync(join(dati, 'pc-altrui.json'), 'utf8')) as unknown
          return Array.isArray(raw) ? raw.filter((b): b is BattitoPc => typeof b === 'object' && b !== null && typeof (b as BattitoPc).pcId === 'string')
            .map((b) => ({ ...b, cartelle: Array.isArray(b.cartelle) ? b.cartelle : [], chat: Array.isArray(b.chat) ? b.chat : [] })) : []
        } catch { return [] }
      },
      scrivi: (b) => scriviJsonAtomico(join(dati, 'pc-altrui.json'), b, 'pc-altrui')
    },
    log: (m) => registro.info(m)
  })
  const remoto = creaClientPcRemoto({
    battiti: () => postino.altrui(),
    chiavePer: (pcId) => sincronia.chiaveDiCasa(`client-pc:${pcId}`),
    mioNome: () => identita.leggi().nome,
    mioId: () => identita.leggi().id,
    mieiIndirizzi: () => mieiIndirizzi(),
    driveCollegato: () => contoDrive.stato().connesso,
    log: (m) => registro.info(m)
  })
  const rotta = rotteAiutante({ aiuto: d.aiuto, versione: d.versione, identita: () => { const i = identita.leggi(); return { nome: i.nome, host: i.host } } })

  let server: Server | undefined
  let portaInUso = d.porta()
  let riprova: ReturnType<typeof setTimeout> | undefined
  const ascolta = (porta: number): void => {
    portaInUso = porta
    const srv = creaServerClient({
      dispositivi: NESSUN_DISPOSITIVO,
      oltreLaRete: d.oltreLaRete,
      chiaveDiCasa: () => sincronia.chiaveDiCasa(`client-pc:${identita.leggi().id}`),
      impronta: () => improntaPc(identita.leggi().id),
      rotta,
      rottaLibera: async () => ({ stato: 404, corpo: { errore: 'SierraDeck Aiutante non ha una pagina né accoppia telefoni' } }),
      log: (m) => registro.info(m)
    })
    srv.on('error', (err: NodeJS.ErrnoException) => {
      const prima = statoClient.inAscolto || statoClient.errore === undefined
      statoClient = { inAscolto: false, errore: `${err.code ?? 'errore'}: ${err.code === 'EADDRINUSE' ? `un altro programma usa la porta ${porta}` : err.message}` }
      // Un blocco: nello storico degli errori (una volta per guasto, non a ogni nuovo tentativo).
      if (prima) registro.errore(`[client] l'Aiutante non è in ascolto sulla porta ${porta}: ${statoClient.errore}. Riprovo ogni 30 secondi.`)
      riprova = setTimeout(() => { try { if (server === srv && !srv.listening) srv.listen(porta) } catch { /* al prossimo errore */ } }, 30_000)
      riprova.unref?.()
    })
    srv.on('listening', () => {
      const dopoGuasto = statoClient.errore !== undefined
      statoClient = { inAscolto: true }
      registro.info(`[client] Aiutante in ascolto sulla porta ${porta}${dopoGuasto ? ' (la porta si è liberata)' : ''}`)
    })
    srv.listen(porta)
    server = srv
  }
  ascolta(portaInUso)

  // Il battito e la posta: come il programma completo, ogni mezzo minuto.
  const timerPosta = setInterval(() => { void postino.giro().catch(() => undefined) }, 30_000)
  const primaPosta = setTimeout(() => { void postino.giro().catch(() => undefined) }, 5_000)
  // Il registro dei progetti dal Drive (serve a sapere chi è il PC di sviluppo di serie): ogni 10 minuti.
  const timerArrivo = setInterval(() => { void sincronia.arrivo().catch(() => undefined) }, 10 * 60_000)
  const primoArrivo = setTimeout(() => { void sincronia.arrivo().catch(() => undefined) }, 20_000)
  // La cassaforte chiusa con la chiave ricordata: si riprova ogni minuto, come nel programma completo.
  const timerPortachiavi = setInterval(() => { try { sincronia.riapriDalPortachiavi() } catch { /* al prossimo giro */ } }, 60_000)
  const principaleOgni = setInterval(() => { void indirizzoPrincipale().then((x) => { principale = x }).catch(() => undefined) }, 10 * 60_000)
  for (const t of [timerPosta, primaPosta, timerArrivo, primoArrivo, timerPortachiavi, principaleOgni]) (t as { unref?: () => void }).unref?.()

  return {
    contoDrive, sincronia, identita, postino, remoto, registroProgetti,
    server: () => server,
    stato: () => {
      const st = contoDrive.stato()
      return {
        driveConnesso: st.connesso,
        driveConfigurato: st.configurato,
        ...(st.email !== undefined ? { email: st.email } : {}),
        cassaforteAperta: sincronia.chiaveDiCasa('prova') !== undefined,
        inAscolto: statoClient.inAscolto,
        ...(statoClient.errore !== undefined ? { errorePorta: statoClient.errore } : {}),
        porta: portaInUso,
        altri: postino.altrui()
      }
    },
    riascolta: (porta) => {
      if (porta === portaInUso && statoClient.inAscolto) return
      if (riprova !== undefined) clearTimeout(riprova)
      const vecchio = server
      server = undefined
      statoClient = { inAscolto: false }
      if (vecchio !== undefined) vecchio.close(() => ascolta(porta))
      else ascolta(porta)
    },
    ferma: () => {
      for (const t of [timerPosta, timerArrivo, timerPortachiavi, principaleOgni]) clearInterval(t)
      clearTimeout(primaPosta); clearTimeout(primoArrivo)
      if (riprova !== undefined) clearTimeout(riprova)
      try { server?.close() } catch { /* già chiuso */ }
    }
  }
}

/** Per l'invio degli errori: il PC di sviluppo ha risposto e ha detto di no (niente posta), o non ha risposto (sul Drive). */
export function erroreConRisposta(err: unknown): boolean {
  return err instanceof ErroreRemoto && err.stato !== undefined
}

/** Il nome da mostrare di un altro PC, dai battiti. */
export function nomeDi(postino: Postino, pcId: string): string | undefined {
  const b = postino.altrui().find((x) => x.pcId === pcId)
  return b !== undefined ? nomeDaMostrare(b) : undefined
}
