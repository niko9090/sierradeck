/**
 * Errori di rete passeggeri: la connessione manca o cade, il guasto non è del
 * programma e passa da solo. Li usano l'aggiornamento (electron-updater) e
 * l'autopilota (risposta dell'API che non arriva).
 */
// ERR_HTTP2_* (25/11: «ERR_HTTP2_SERVER_REFUSED_STREAM» di GitHub alle 02:39,
// finito nel riquadro rosso) e ERR_QUIC_* sono rifiuti del flusso, non del programma.
const CODICI_RETE = /ERR_HTTP2_[A-Z_]+|ERR_QUIC_[A-Z_]+|ERR_SPDY_[A-Z_]+|ERR_NETWORK_ACCESS_DENIED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_ABORTED|ERR_CONNECTION_FAILED|ERR_CONNECTION_REFUSED|ERR_NAME_RESOLUTION_FAILED|ERR_PROXY_CONNECTION_FAILED|ERR_SOCKET_NOT_CONNECTED|ERR_NO_BUFFER_SPACE|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_EMPTY_RESPONSE|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|Can't reach the API server/

export function eErroreDiRete(testo: string): boolean {
  return CODICI_RETE.test(testo)
}
