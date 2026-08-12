// Importare questo modulo non apre nessuna porta: l'avvio del servizio vive in
// `avvio.ts`, che è il punto d'ingresso del processo. Senza quella separazione
// la suite aprirebbe davvero la 47630 e i test dipenderebbero dallo stato della
// macchina — che è esattamente come questo difetto è stato scoperto.
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { inAscolto } from '../../src/autopilot-host/index'

let occupante: Server | undefined

afterEach(() => { occupante?.close(); occupante = undefined })

function avviaOccupante(risposta: (res: import('node:http').ServerResponse) => void): Promise<number> {
  occupante = createServer((_req, res) => risposta(res))
  return new Promise((ris) => {
    occupante!.listen(0, '127.0.0.1', () => ris((occupante!.address() as { port: number }).port))
  })
}

describe('inAscolto', () => {
  it('dice falso quando nessuno risponde su quella porta', async () => {
    expect(await inAscolto(47599)).toBe(false)
  })

  it('dice vero quando il servizio risponde a /salute', async () => {
    const porta = await avviaOccupante((res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ vivo: true }))
    })
    expect(await inAscolto(porta)).toBe(true)
  })

  it('dice falso se sulla porta risponde qualcun altro', async () => {
    // Una porta occupata da un altro programma non e' il nostro servizio: se
    // rispondessimo vero, il Gestore aspetterebbe per sempre un servizio che
    // non arriva.
    const porta = await avviaOccupante((res) => { res.writeHead(200); res.end('sono un altro') })
    expect(await inAscolto(porta)).toBe(false)
  })
})
