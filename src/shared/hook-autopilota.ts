/**
 * Le impostazioni con cui nasce una chat governata da un autopilota.
 *
 * Stanno qui, fra le cose condivise, perché adesso servono a **due** processi:
 * al servizio dell'autopilota, che sa quale chat governa, e al Gestore, che è
 * l'unico che può far nascere una chat dentro il mosaico. Da quando le chat
 * sono quelle vere — visibili, dove si può scrivere — è il Gestore ad avviarle,
 * e senza queste impostazioni l'autopilota non saprebbe mai quando hanno
 * finito di rispondere.
 */

/**
 * Il tetto dell'hook, in secondi.
 *
 * Deve coprire una verifica lenta più il giudizio del supervisore: un hook
 * scaduto lascia la chat ferma senza che nessuno lo sappia, che è il guasto
 * peggiore per un sistema il cui scopo è non lasciarla ferma.
 */
export const TIMEOUT_HOOK_S = 900

/**
 * L'id dell'autopilota viaggia **nell'URL**, non nel corpo: al primo `Stop` il
 * `session_id` non è ancora noto a nessuno, quindi cercare per sessione
 * lascerebbe il primo evento senza padrone.
 *
 * Vengono iniettate per singola sessione: `~/.claude/settings.json` non si
 * tocca, e le altre chat dell'utente non si accorgono di nulla.
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
