import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriQuadernoPersonale } from '../../src/main/quaderno-personale'
import { testoEsito, valoreNascosto, type EsitoUso } from '../../src/shared/quaderno-personale'

/**
 * La risposta di `/api/quaderno-personale` di un computer alla 0.57.0, fatta
 * dalle rotte vere su dati d'esempio, e i testi condivisi. L'app la legge da
 * `android/app/src/test/resources/quaderno-personale/` (QuadernoPersonaleTest):
 * se il formato o i testi cambiano qui, questo test lo dice prima del telefono.
 * `AGGIORNA=1` riscrive il file.
 */
const ESITI: EsitoUso[] = ['una-volta', 'sempre', 'gia-consentita', 'negato', 'nessuna-risposta', 'voce-assente']

async function esempio(): Promise<Record<string, unknown>> {
  let ora = Date.parse('2026-10-10T10:00:00Z')
  const q = apriQuadernoPersonale({
    cartella: mkdtempSync(join(tmpdir(), 'sd-qpa-')),
    portachiavi: { disponibile: () => true, avvolgi: (k) => k.toString('base64'), svolgi: (s) => Buffer.from(s, 'base64') },
    adesso: () => (ora += 1000),
    attesaMs: 50
  })
  q.salva({ nome: 'Email di contatto', valore: 'esempio@example.com', nota: 'per le pagine pubbliche' })
  await q.chiedi({ sessione: 's-esempio', titolo: 'Pagina legale' }, 'Email di contatto', 'nella pagina dei contatti')
  const rotte = rotteClient({ quadernoPersonale: q, chat: () => [] } as unknown as DipendenzeRotte)
  const stato = (await rotte({ metodo: 'POST', percorso: '/api/quaderno-personale', corpo: {}, dispositivo: 'tel-esempio' })).corpo as Record<string, unknown>
  // Gli id sono casuali: per il confronto si fissano.
  const fissa = (x: unknown): unknown => JSON.parse(JSON.stringify(x).replace(/"id":"[0-9a-f-]{36}"/g, '"id":"id-esempio"').replace(/"voceId":"[0-9a-f-]{36}"/g, '"voceId":"id-esempio"'))
  return {
    stato: fissa(stato),
    esiti: Object.fromEntries(ESITI.map((e) => [e, testoEsito(e)])),
    nascosti: Object.fromEntries(['abc', 'esempio@example.com', 'IT00000000000'].map((v) => [v, valoreNascosto(v)]))
  }
}

describe('il quaderno personale visto dall’app', () => {
  it('la risposta e i testi sono quelli che l’app si aspetta', async () => {
    const atteso = await esempio()
    const file = join('android', 'app', 'src', 'test', 'resources', 'quaderno-personale', 'quaderno-0.57.json')
    if (process.env.AGGIORNA === '1' || !existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(atteso, null, 2) + '\n')
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(atteso)
  })
})
