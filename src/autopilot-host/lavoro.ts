import { spawn } from 'node:child_process'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'

export type Processo = { uccidi: () => void; finito: Promise<number> }
export type AvvioProcesso = (comando: string, args: string[], cwd: string) => Processo

/**
 * Il tetto dell'hook, in secondi.
 *
 * Deve coprire una verifica lenta più il giudizio del supervisore: un hook
 * scaduto lascia la chat ferma senza che nessuno lo sappia, che è il guasto
 * peggiore per un sistema il cui scopo è non lasciarla ferma.
 */
const TIMEOUT_HOOK_S = 900

/**
 * Le impostazioni che la chat governata riceve con `--settings`.
 *
 * L'id dell'autopilota viaggia **nell'URL**, non nel corpo: al primo `Stop` il
 * `session_id` non è ancora noto a nessuno, quindi cercare per sessione
 * lascerebbe il primo evento senza padrone.
 *
 * Vengono iniettate per singola sessione: `~/.claude/settings.json` non si
 * tocca, e le altre sessioni dell'utente non si accorgono di nulla.
 */
export function componiImpostazioni(id: string, porta: number, chatId?: string): string {
  // La chat viaggia nell'URL accanto all'autopilota: con piu' chat governate,
  // sapere *quale* si e' fermata e' l'unico modo per dare a ciascuna le proprie
  // istruzioni invece che a caso.
  const perChat = chatId !== undefined ? `&chat=${chatId}` : ''
  const hook = (evento: string): unknown => ({
    hooks: [{
      type: 'http',
      url: `http://127.0.0.1:${porta}/hook/${evento}?ap=${id}${perChat}`,
      timeout: TIMEOUT_HOOK_S
    }]
  })
  return JSON.stringify({ hooks: { Stop: [hook('stop')], Notification: [hook('notification')] } })
}

/**
 * Gli argomenti con cui parte la chat governata.
 *
 * `--dangerously-skip-permissions` è deliberato e coerente con il resto del
 * gestore: una chat che si ferma a chiedere un permesso è esattamente ciò che
 * l'autopilota esiste per evitare, e nessuno sarebbe lì a concederlo.
 */
export function componiArgomenti(
  a: Autopilota,
  impostazioni: string,
  messaggio?: string,
  chat?: { compito: string; sessionId?: string },
  /**
   * Dice se quella sessione ha già una trascrizione su disco. Decide fra
   * riprendere e creare: Claude Code rifiuta un `--session-id` già usato, e
   * ricreare una sessione esistente perderebbe il lavoro fatto prima.
   */
  trascrizioneEsiste: (cwd: string, sessionId: string) => boolean = () => false
): string[] {
  // Con una flotta, ogni chat riceve il proprio pezzo di lavoro; l'obiettivo
  // resta sopra, perche' serve a capire perche' quel pezzo esiste.
  const intestazione =
    chat !== undefined && chat.compito !== ''
      ? [a.obiettivo, '', `Il tuo compito, dentro questo obiettivo: ${chat.compito}`].join('\n')
      : a.obiettivo

  const compito = [
    intestazione,
    '',
    'Criteri di fine:',
    ...a.criteri.map((c) => `- ${c.descrizione}${c.comando !== undefined ? ` (si verifica con: ${c.comando})` : ''}`),
    '',
    'Lavora fino a soddisfarli tutti.'
  ].join('\n')

  // Con un messaggio e una sessione da riprendere si manda **solo** il
  // messaggio: la conversazione ripresa ha già l'obiettivo in memoria, e
  // rimandarglielo la farebbe ricominciare da capo il lavoro già fatto.
  // Senza sessione non c'è niente da riprendere, e ripartire dall'obiettivo è
  // meglio che non partire.
  const sessione = chat !== undefined ? chat.sessionId : a.sessionId
  // Una sessione che esiste già su disco si riprende; una decisa da noi ma non
  // ancora nata si crea con quell'id. Imporre l'id fin dall'inizio è ciò che
  // permette di **vedere** la conversazione mentre accade: senza, l'id lo
  // sceglie Claude Code e si scopre solo al primo hook Stop, cioè dopo minuti
  // in cui non si sa nemmeno quale trascrizione guardare.
  const esiste = sessione !== undefined && trascrizioneEsiste(a.cwd, sessione)
  const riprende = messaggio !== undefined && esiste

  return [
    '-p', riprende ? messaggio : compito,
    '--settings', impostazioni,
    '--dangerously-skip-permissions',
    ...(sessione === undefined ? [] : esiste ? ['--resume', sessione] : ['--session-id', sessione])
  ]
}

/**
 * I marcatori che dicono a Claude Code «sei figlia di un'altra sessione».
 *
 * Ereditandoli, la chat scrive «Transcript saving is off» e **non salva la
 * trascrizione**: senza `.jsonl` l'autopilota non potrebbe riprenderla dopo un
 * riavvio, cioè perderebbe proprio il lavoro che esiste per proteggere.
 * Il servizio nasce quasi sempre dentro una sessione — lo avvia il Gestore, che
 * a sua volta può essere partito da un terminale di Claude Code.
 */
const MARCATORI_DI_SESSIONE = [
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_PID'
]

export function ambienteChat(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [nome, valore] of Object.entries(base)) {
    if (valore === undefined || MARCATORI_DI_SESSIONE.includes(nome)) continue
    env[nome] = valore
  }
  return env
}

export function avvioReale(): AvvioProcesso {
  return (comando, args, cwd) => {
    const figlio = spawn(comando, args, {
      cwd,
      windowsHide: true,
      stdio: 'ignore',
      env: ambienteChat(process.env)
    })
    return {
      uccidi: () => { figlio.kill() },
      finito: new Promise<number>((risolvi) => {
        figlio.on('exit', (codice) => risolvi(codice ?? 0))
        figlio.on('error', (err) => {
          // `error` arriva quando il processo non parte affatto — eseguibile
          // assente, cartella sparita — e senza questo ramo la promise non si
          // risolverebbe mai: l'autopilota resterebbe «al lavoro» per sempre.
          console.error('[autopilota] avvio della chat fallito:', err)
          risolvi(1)
        })
      })
    }
  }
}

export function creaLavori(p: {
  avvia: AvvioProcesso
  claudeCmd: string
  porta: number
  suUscitaAnomala: (id: string) => void
  /**
   * Dice se una sessione ha già una trascrizione su disco: decide fra
   * riprenderla e crearla con l'id che le abbiamo dato noi.
   */
  trascrizioneEsiste?: (cwd: string, sessionId: string) => boolean
}): {
  avvia: (a: Autopilota, messaggio?: string, chat?: ChatGovernata) => Promise<void>
  ferma: (id: string, chatId?: string) => void
  attivi: () => string[]
} {
  const processi = new Map<string, Processo>()
  const fermatiDaNoi = new Set<string>()

  /**
   * La chiave di un processo.
   *
   * Autopilota **e** chat: con una flotta, la stessa chiave per tutte
   * impedirebbe di aprire la seconda chat, e fermarne una le fermerebbe tutte.
   */
  const chiave = (autopilotaId: string, chatId?: string): string =>
    chatId === undefined ? autopilotaId : `${autopilotaId}::${chatId}`

  return {
    avvia(a, messaggio, chat) {
      const k = chiave(a.id, chat?.id)
      // Due processi sulla stessa chat lavorerebbero sugli stessi file senza
      // sapere l'uno dell'altro, e il secondo non avrebbe nessuno che lo
      // sorveglia.
      if (processi.has(k)) return Promise.resolve()
      const processo = p.avvia(
        p.claudeCmd,
        componiArgomenti(
          a,
          componiImpostazioni(a.id, p.porta, chat?.id),
          messaggio,
          chat === undefined ? undefined : { compito: chat.compito, ...(chat.sessionId !== undefined ? { sessionId: chat.sessionId } : {}) },
          p.trascrizioneEsiste
        ),
        a.cwd
      )
      processi.set(k, processo)
      void processo.finito.then((codice) => {
        processi.delete(k)
        const fermatoDaNoi = fermatiDaNoi.delete(k)
        // Un'uscita diversa da zero che non abbiamo provocato noi è un guasto —
        // claude.exe che non parte, la cartella sparita — e deve raggiungere
        // qualcuno, invece di lasciare l'autopilota «al lavoro» senza lavoro.
        if (codice !== 0 && !fermatoDaNoi) p.suUscitaAnomala(a.id)
      })
      return Promise.resolve()
    },

    ferma(id, chatId) {
      // Senza chat si ferma tutto l'autopilota: e' cio' che serve al comando
      // «ferma», che non conosce le singole chat.
      const chiavi = chatId === undefined
        ? [...processi.keys()].filter((k) => k === id || k.startsWith(`${id}::`))
        : [chiave(id, chatId)]
      for (const k of chiavi) {
        const processo = processi.get(k)
        if (processo === undefined) continue
        fermatiDaNoi.add(k)
        processi.delete(k)
        processo.uccidi()
      }
    },

    attivi: () => [...processi.keys()]
  }
}
