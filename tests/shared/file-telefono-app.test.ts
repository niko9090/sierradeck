import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { apriFileProgetti } from '../../src/main/file-progetti'
import { apriAlTelefono } from '../../src/main/al-telefono'
import { mimeDi, misura, tipoAnteprima } from '../../src/shared/file-telefono'

/**
 * Le risposte della sezione File e della coda per il telefono di un computer
 * alla 0.54.0, fatte dalle rotte vere su dati d'esempio, e le regole di
 * anteprima. L'app le legge da `android/app/src/test/resources/file/`
 * (FileTelefonoTest): se il formato o le regole cambiano qui, questo test lo
 * dice prima che lo scopra il telefono. `AGGIORNA=1` riscrive il file.
 */
const NOMI = ['index.ts', 'README', 'Dockerfile', '.gitignore', 'note.md', 'foto.JPG', 'schema.png', 'fattura.pdf', 'pagina.html', 'dati.csv', 'archivio.zip', 'video.mp4', 'senza-estensione', 'setup.exe']
const GRANDEZZE = [0, 40, 1023, 1024, 12_345, 1_048_575, 1_048_576, 3_500_000, 104_857_600]

async function esempio(): Promise<Record<string, unknown>> {
  const radice = mkdtempSync(join(tmpdir(), 'sd-fta-'))
  const progetto = join(radice, 'Esempio')
  mkdirSync(join(progetto, 'src'), { recursive: true })
  writeFileSync(join(progetto, 'src', 'index.ts'), 'export const x = 1\n')
  writeFileSync(join(progetto, 'LEGGIMI.md'), '# Esempio\n')
  const quando = new Date('2026-10-08T10:00:00Z')
  for (const f of ['src/index.ts', 'LEGGIMI.md', 'src']) utimesSync(join(progetto, f), quando, quando)
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-fta-d-')))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'Telefono di prova')
  const coda = apriAlTelefono({ cartella: mkdtempSync(join(tmpdir(), 'sd-fta-c-')), dispositivi: () => dispositivi.elenca(), nomePc: () => 'PC-ESEMPIO', adesso: () => quando.getTime() })
  await coda.metti({ file: join(progetto, 'LEGGIMI.md'), a: `tel:${t?.id ?? ''}`, da: 'chat', daChat: 'Relazioni', nota: 'da leggere' })
  const rotte = rotteClient({
    dispositivi, chat: () => [], autopiloti: async () => [], workspace: async () => ({ nomi: [], attivo: '' }),
    fileProgetti: apriFileProgetti({ candidati: async () => [progetto], home: 'C:\\Users\\Esempio' }),
    alTelefono: coda
  } as unknown as DipendenzeRotte)
  const chiedi = async (percorso: string, corpo: unknown): Promise<unknown> => (await rotte({ metodo: 'POST', percorso, corpo, dispositivo: t?.id })).corpo
  const neutro = (x: unknown): unknown => JSON.parse(JSON.stringify(x).split(JSON.stringify(progetto).slice(1, -1)).join('C:\\\\Progetti\\\\Esempio'))
  const consegne = await chiedi('/api/consegne', { nome: 'Telefono di prova' }) as { consegne: { id: string }[] }
  const id = consegne.consegne[0]?.id ?? ''
  const pezzo = await chiedi('/api/consegne/pezzo', { id, da: 0 })
  const ri = (x: unknown): unknown => JSON.parse(JSON.stringify(x).split(id).join('consegna-esempio'))
  return {
    regole: NOMI.map((nome) => ({ nome, tipo: tipoAnteprima(nome), mime: mimeDi(nome) })),
    misure: GRANDEZZE.map((byte) => ({ byte, testo: misura(byte) })),
    progetti: neutro(await chiedi('/api/file/progetti', {})),
    elenco: neutro(await chiedi('/api/file/elenco', { progetto, percorso: '' })),
    elencoSrc: neutro(await chiedi('/api/file/elenco', { progetto, percorso: 'src' })),
    leggi: neutro(await chiedi('/api/file/leggi', { progetto, percorso: 'src/index.ts', da: 0 })),
    consegne: ri(consegne),
    pezzoConsegna: ri(pezzo)
  }
}

describe('quello che legge l’app della sezione File', () => {
  it('è quello del file che usano i test dell’app', async () => {
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'file', 'file-0.54.json')
    const fatto = JSON.parse(JSON.stringify(await esempio())) as Record<string, unknown>
    if (process.env.AGGIORNA === '1') {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, `${JSON.stringify(fatto, null, 2)}\n`)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fatto)
  })
})
