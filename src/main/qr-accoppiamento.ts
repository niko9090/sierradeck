import { toDataURL } from 'qrcode'

/**
 * Il codice da inquadrare, invece di quello da digitare.
 *
 * Sei cifre da leggere su uno schermo e ribattere su un telefono sono sei
 * occasioni di sbagliare, e un'attesa di tre minuti che comincia mentre cerchi
 * gli occhiali. Un QR toglie tutto: si inquadra con la fotocamera — quella di
 * sistema, senza app da installare — e il telefono apre la pagina già
 * accoppiata.
 *
 * Il codice viaggia **dentro il quadrato**, cioè sullo schermo del computer, e
 * mai sulla rete: è la stessa sicurezza di prima, con un gesto in meno.
 */

/**
 * L'indirizzo che il quadrato contiene.
 *
 * Il codice sta dopo il cancelletto e non fra i parametri: quello che segue il
 * cancelletto **non viaggia** verso il server — resta nel browser — e non
 * finisce nei log di nessuno.
 */
export function indirizzoAccoppiamento(base: string, codice: string): string {
  return `${base.replace(/\/+$/, '')}/#codice=${encodeURIComponent(codice)}`
}

/**
 * Il quadrato come immagine da mettere in una pagina.
 *
 * Correzione d'errore alta: viene inquadrato da lontano, storto, su uno schermo
 * che riflette — le condizioni peggiori possibili per una fotocamera.
 */
export async function immagineQr(testo: string): Promise<string> {
  return toDataURL(testo, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 260,
    color: { dark: '#0b0c0e', light: '#ffffff' }
  })
}
