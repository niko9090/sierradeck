// Prepara la copia di prova per le misure (0.80.0). Dalla radice del progetto, dopo `npm run build`:
//   node scripts/misure/prepara.mjs                 → copia vuota
//   node scripts/misure/prepara.mjs --conversazioni → copia anche ~/.claude/projects nella Claude Code di prova (l'originale si legge soltanto)
// Porte 47670/47671 (mai 47630/47631 del programma vero); telefono finto con una chiave casuale in note/prova-080/chiave.txt.
import { mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'

const RADICE = join(process.cwd(), 'note', 'prova-080')
const SD = join(RADICE, 'dati', 'SierraDeck')
const CLAUDE = join(RADICE, 'claude')
const CARTELLA = join(RADICE, 'SierraDeck-prova-080')
const FILE_CHIAVE = join(RADICE, 'chiave.txt')
const PORTA = Number(process.env.SD_MISURE_PORTA ?? 47670)

for (const d of [SD, CLAUDE, CARTELLA]) mkdirSync(d, { recursive: true })
const chiave = existsSync(FILE_CHIAVE) ? readFileSync(FILE_CHIAVE, 'utf8').trim() : randomBytes(32).toString('hex')
writeFileSync(FILE_CHIAVE, chiave)
writeFileSync(join(SD, 'impostazioni.json'), JSON.stringify({ versione: 1, preferenze: { portaClient: PORTA, portaAutopiloti: PORTA + 1 } }))
const ora = new Date().toISOString()
writeFileSync(join(SD, 'dispositivi.json'), JSON.stringify({ versione: 1, dispositivi: [{ id: 'tel-prova', nome: 'Telefono di prova', segno: createHash('sha256').update(chiave).digest('hex'), collegatoIl: ora, ultimoAccesso: ora }] }))
// Claude Code a parte: credenziali senza refreshToken, così la copia non rinnova mai quelle vere.
const cred = JSON.parse(readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8'))
if (cred.claudeAiOauth) delete cred.claudeAiOauth.refreshToken
writeFileSync(join(CLAUDE, '.credentials.json'), JSON.stringify(cred))
writeFileSync(join(CLAUDE, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, projects: { [CARTELLA]: { hasTrustDialogAccepted: true } } }))
writeFileSync(join(CLAUDE, 'settings.json'), JSON.stringify({ skipDangerousModePermissionPrompt: true }))
// Due workspace vuoti: «misura apri» mette 4 chat nel primo e 2 nel secondo.
const vuoto = (nome) => ({ nome, perSlot: { 1: { panes: [] } }, perMonitor: { 1: { panes: [] } } })
if (!existsSync(join(SD, 'workspaces.json'))) writeFileSync(join(SD, 'workspaces.json'), JSON.stringify({ versione: 1, attivo: 'Prova-080-a', workspace: [vuoto('Prova-080-a'), vuoto('Prova-080-b')], finestre: 1 }))
if (process.argv.includes('--conversazioni')) cpSync(join(homedir(), '.claude', 'projects'), join(CLAUDE, 'projects'), { recursive: true })
console.log(`copia pronta in ${RADICE}`)
