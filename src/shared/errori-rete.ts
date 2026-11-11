/**
 * Errori di rete passeggeri: la connessione manca o cade, il guasto non è del
 * programma e passa da solo. Li usano l'aggiornamento (electron-updater) e
 * l'autopilota (risposta dell'API che non arriva).
 */
const CODICI_RETE = /ERR_NO_BUFFER_SPACE|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_EMPTY_RESPONSE|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|Can't reach the API server/

export function eErroreDiRete(testo: string): boolean {
  return CODICI_RETE.test(testo)
}
