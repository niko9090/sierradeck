/**
 * Come si manda davvero un compito a Claude Code dentro un terminale.
 *
 * Non è un ragionamento: apre un `claude.exe` vero in un PTY, gli scrive un
 * compito lungo come quelli dell'autopilota e guarda se parte. Le strategie si
 * confrontano una per volta, e il testo arriva **spezzato** come nella realtà —
 * fra il renderer e il terminale ci sono un IPC e un processo di mezzo, e un
 * testo di duemila caratteri non arriva mai tutto insieme.
 *
 *   node scripts/prova-invio.mjs <staccato|paste|lento> [pausaMs]
 */
import { spawn } from 'node-pty'
import { homedir } from 'node:os'
import { join } from 'node:path'

const strategia = process.argv[2] ?? 'staccato'
const pausa = Number.parseInt(process.argv[3] ?? '200', 10)
const CLAUDE = join(homedir(), '.local', 'bin', 'claude.exe')

/** Un compito vero: preambolo, criteri, e la coda comune. */
const QUANTI = Number.parseInt(process.argv[4] ?? '18', 10)
const CRITERI = Array.from({ length: QUANTI }, (_, i) =>
  `- criterio ${i + 1}: qualcosa che deve essere vero alla fine, descritto per intero`
).join('\n')
const TESTO = `Rispondi con una parola sola: pronto.\n\nQuesto e' il compito:\n${CRITERI}\n\nLavora fino a soddisfarli tutti.`

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v

const pty = spawn(CLAUDE, ['--dangerously-skip-permissions'], {
  name: 'xterm-256color', cols: 120, rows: 30, cwd: process.cwd(), env
})

let uscita = ''
pty.onData((d) => { uscita += d })
const attendi = (ms) => new Promise((r) => setTimeout(r, ms))

/** Come arriva davvero: a pezzi, con l'IPC di mezzo. */
async function scriviAPezzi(testo, pezzo = 512, ritardo = 20) {
  for (let i = 0; i < testo.length; i += pezzo) {
    pty.write(testo.slice(i, i + pezzo))
    await attendi(ritardo)
  }
}

// Si aspetta il prompt e poi la quiete: la stessa regola del renderer.
const iniziato = Date.now()
let ultimo = Date.now()
pty.onData(() => { ultimo = Date.now() })
while (!/❯|bypass permissions|esc to interrupt/.test(uscita) && Date.now() - iniziato < 60000) {
  await attendi(100)
}
while (Date.now() - ultimo < 700 && Date.now() - iniziato < 60000) await attendi(100)
console.log('--- pronto dopo', Math.round((Date.now() - iniziato) / 100) / 10, 's | testo di', TESTO.length, 'caratteri')
uscita = ''

if (strategia === 'paste') {
  // Bracketed paste: il terminale sa **dove finisce** l'incollaggio, quindi
  // l'invio che arriva dopo è un invio e non un altro a capo del testo.
  pty.write('[200~')
  await scriviAPezzi(TESTO)
  pty.write('[201~')
  await attendi(pausa)
  pty.write('\r')
} else if (strategia === 'lento') {
  await scriviAPezzi(TESTO)
  await attendi(pausa)
  pty.write('\r')
} else {
  await scriviAPezzi(TESTO)
  await attendi(pausa)
  pty.write('\r')
}

await attendi(9000)
const pulito = uscita.replace(/\[[0-9;?]*[a-zA-Z]/g, '')
console.log('--- strategia:', strategia, '| pausa:', pausa, 'ms')
console.log('--- partito?', /esc to interrupt|● pronto|Baked|Worked|Channell|Befuddl/i.test(pulito))
pty.kill()
process.exit(0)
