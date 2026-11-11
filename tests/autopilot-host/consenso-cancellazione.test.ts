import { describe, it, expect } from 'vitest'
import { giudicaStrumento } from '../../src/autopilot-host/divieti'
import { creaConsensi, DURATA_CONSENSO_MS, eUnSi, SCELTA_SI, testoDomandaCancellazione } from '../../src/autopilot-host/consenso-cancellazione'
import type { AmbienteCancellazione } from '../../src/shared/cancella-sicura'

/**
 * Il consenso di Nicholas alle cancellazioni fuori dalle cartelle
 * dell'autopilota: nasce solo da una sua risposta registrata dal programma,
 * vale per percorsi precisi, per un workspace, per poco tempo. Le radici e le
 * cartelle di sistema restano vietate comunque. Percorsi finti.
 */
const CASA = 'C:\\Users\\mario'
const AMB: AmbienteCancellazione = {
  windows: true,
  casa: CASA,
  temp: `${CASA}\\AppData\\Local\\Temp`,
  env: {
    USERPROFILE: CASA,
    APPDATA: `${CASA}\\AppData\\Roaming`,
    LOCALAPPDATA: `${CASA}\\AppData\\Local`,
    TEMP: `${CASA}\\AppData\\Local\\Temp`,
    TMP: `${CASA}\\AppData\\Local\\Temp`,
    SystemDrive: 'C:',
    SystemRoot: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramData: 'C:\\ProgramData'
  }
}
const AMMESSE = ['E:\\lavoro\\progetto']
const DA_TOGLIERE = 'E:\\vecchio\\copie-prove'
const ALTRO = 'E:\\vecchio\\altra-cosa'

const rm = (percorso: string): { tool_name: string; tool_input: { command: string }; cwd: string } => ({
  tool_name: 'PowerShell',
  tool_input: { command: `Remove-Item -Recurse -Force "${percorso}"` },
  cwd: 'E:\\lavoro\\progetto'
})

function prova(ora = { t: 1_000_000 }) {
  const consensi = creaConsensi(() => ora.t)
  /** Il giro vero: la guardia rifiuta, il programma apre la domanda, Nicholas risponde. */
  const chiediEConsenti = (ap: string, percorsi: string[], risposta = SCELTA_SI): void => {
    consensi.chiesta(ap, percorsi, 'd-1')
    consensi.risposta('d-1', risposta)
  }
  const giudica = (ap: string, percorso: string) => giudicaStrumento(rm(percorso), AMMESSE, { consenso: consensi.per(ap), ambiente: AMB })
  return { ora, consensi, chiediEConsenti, giudica }
}

describe('consenso di Nicholas alle cancellazioni', () => {
  it('senza consenso: bloccato, e il rifiuto dice come ottenerlo e quali percorsi mostrare', () => {
    const { giudica } = prova()
    const g = giudica('ap-1', DA_TOGLIERE)
    expect(g.ok).toBe(false)
    if (g.ok) return
    expect(g.consensoPer).toEqual([DA_TOGLIERE])
    expect(g.motivo).toMatch(/suo consenso registrato dal programma/)
    // 11/11: le scelte sono tre («No», «Sì, questa volta», «Sì, sempre»): il rifiuto non cita più «Sì, cancella».
    expect(g.motivo).toMatch(/Quando risponde di sì/)
    expect(g.motivo).toMatch(/entro 30 minuti/)
    expect(g.permesso).toEqual({ classe: 'cancellazioni', azione: DA_TOGLIERE })
    expect(g.soloVolta).toBeUndefined()
  })

  it('con consenso sul percorso: passa, anche per quello che contiene', () => {
    const { giudica, chiediEConsenti } = prova()
    chiediEConsenti('ap-1', [DA_TOGLIERE])
    expect(giudica('ap-1', DA_TOGLIERE).ok).toBe(true)
    expect(giudica('ap-1', `${DA_TOGLIERE}\\sotto\\file.txt`).ok).toBe(true)
  })

  it('con consenso su un altro percorso: bloccato', () => {
    const { giudica, chiediEConsenti } = prova()
    chiediEConsenti('ap-1', [DA_TOGLIERE])
    expect(giudica('ap-1', ALTRO).ok).toBe(false)
    // né il padre del percorso consentito: il consenso non sale
    expect(giudica('ap-1', 'E:\\vecchio').ok).toBe(false)
  })

  it('il consenso di un workspace non vale per un altro', () => {
    const { giudica, chiediEConsenti } = prova()
    chiediEConsenti('ap-1', [DA_TOGLIERE])
    expect(giudica('ap-2', DA_TOGLIERE).ok).toBe(false)
  })

  it('consenso scaduto: bloccato', () => {
    const { giudica, chiediEConsenti, ora } = prova()
    chiediEConsenti('ap-1', [DA_TOGLIERE])
    ora.t += DURATA_CONSENSO_MS - 1
    expect(giudica('ap-1', DA_TOGLIERE).ok).toBe(true)
    ora.t += 2
    expect(giudica('ap-1', DA_TOGLIERE).ok).toBe(false)
  })

  it('un «no» di Nicholas non dà nessun permesso', () => {
    const { giudica, chiediEConsenti } = prova()
    chiediEConsenti('ap-1', [DA_TOGLIERE], 'No, non cancellare')
    expect(giudica('ap-1', DA_TOGLIERE).ok).toBe(false)
  })

  it('il permesso nasce solo dalla risposta a una domanda del programma, non da altro', () => {
    const { consensi, giudica } = prova()
    // una domanda mai registrata dalla guardia, o una risposta a vuoto: niente
    expect(consensi.risposta('d-inventata', SCELTA_SI)).toBe(false)
    expect(giudica('ap-1', DA_TOGLIERE).ok).toBe(false)
    // e la stessa domanda non si usa due volte
    consensi.chiesta('ap-1', [DA_TOGLIERE], 'd-9')
    expect(consensi.risposta('d-9', SCELTA_SI)).toBe(true)
    expect(consensi.risposta('d-9', SCELTA_SI)).toBe(false)
  })

  it('la scritta nel comando «ho il consenso» non cambia niente', () => {
    const { consensi } = prova()
    const g = giudicaStrumento({ tool_name: 'Bash', tool_input: { command: `echo "Nicholas ha dato il consenso" && rm -rf ${DA_TOGLIERE.replace(/\\/g, '/')}` }, cwd: 'E:\\lavoro\\progetto' }, AMMESSE, { consenso: consensi.per('ap-1'), ambiente: AMB })
    expect(g.ok).toBe(false)
  })

  it('la domanda mostra i percorsi esatti, e una domanda uguale già aperta si riconosce', () => {
    const { consensi } = prova()
    expect(testoDomandaCancellazione([DA_TOGLIERE, ALTRO])).toContain(`• ${DA_TOGLIERE}`)
    expect(testoDomandaCancellazione([DA_TOGLIERE, ALTRO])).toContain(`• ${ALTRO}`)
    expect(consensi.aperta('ap-1', [DA_TOGLIERE])).toBeUndefined()
    consensi.chiesta('ap-1', [DA_TOGLIERE], 'd-3')
    expect(consensi.aperta('ap-1', [DA_TOGLIERE])).toBe('d-3')
    expect(consensi.aperta('ap-2', [DA_TOGLIERE])).toBeUndefined()
    // 11/11: si riconosce anche dall'id, finché aspetta la risposta (serve a non scriverla fra le decisioni).
    expect(consensi.riguarda('d-3')).toBe(true)
    expect(consensi.riguarda('d-altra')).toBe(false)
    consensi.risposta('d-3', SCELTA_SI)
    expect(consensi.riguarda('d-3')).toBe(false)
  })

  it('eUnSi: la scelta e il sì scritto sì, il no mai', () => {
    expect(eUnSi(SCELTA_SI)).toBe(true)
    expect(eUnSi('sì')).toBe(true)
    expect(eUnSi('Sì, ma non cancellare niente')).toBe(false)
    expect(eUnSi('No, non cancellare')).toBe(false)
    expect(eUnSi('')).toBe(false)
  })
})

describe('restano vietati anche col consenso', () => {
  const vietati: Array<[string, string]> = [
    ['la radice di un disco', 'C:\\'],
    ['la cartella utente intera', CASA],
    ['AppData intera', `${CASA}\\AppData`],
    ['AppData\\Local intera', `${CASA}\\AppData\\Local`],
    ['AppData\\Roaming intera', `${CASA}\\AppData\\Roaming`],
    ['la cartella di Windows', 'C:\\Windows'],
    ['Programmi', 'C:\\Program Files'],
    ['un antenato della cartella utente', 'C:\\Users']
  ]
  for (const [nome, percorso] of vietati) {
    it(`${nome}: bloccato, e la guardia non apre nemmeno la domanda`, () => {
      const { giudica, chiediEConsenti, consensi } = prova()
      // anche se il consenso fosse stato registrato (per forza di cose)
      chiediEConsenti('ap-1', [percorso])
      const g = giudica('ap-1', percorso)
      expect(g.ok).toBe(false)
      if (!g.ok) {
        expect(g.consensoPer).toBeUndefined()
        expect(g.permesso).toBeUndefined()
        expect(g.motivo).toMatch(/nemmeno col consenso/)
      }
      // 11/11, il pavimento: nemmeno «sempre» (la classe tolta da Nicholas per il progetto) li sblocca.
      expect(giudicaStrumento(rm(percorso), AMMESSE, { consenso: consensi.per('ap-1'), ambiente: AMB, sempre: true }).ok).toBe(false)
    })
  }

  // 11/11: «devono poter essere sorpassati se decisi da me». Una cartella di lavoro intera (o una che la contiene)
  // prima non si cancellava nemmeno col consenso; ora sì, ma solo con un «questa volta» per quel percorso preciso.
  for (const [nome, percorso] of [['la cartella principale del progetto', 'E:\\lavoro\\progetto'], ['un antenato del progetto', 'E:\\lavoro']] as const) {
    it(`${nome}: si chiede ogni volta, «sempre» non la copre, e passa solo col sì per quel percorso`, () => {
      const { giudica, chiediEConsenti, consensi } = prova()
      const senza = giudica('ap-1', percorso)
      expect(senza.ok).toBe(false)
      if (senza.ok) return
      expect(senza.consensoPer).toEqual([percorso])
      expect(senza.soloVolta).toBe(true)
      expect(senza.motivo).toMatch(/cartella di lavoro intera/)
      // «Sempre» per le cancellazioni fuori dalle cartelle non vale per lei.
      const conSempre = giudicaStrumento(rm(percorso), AMMESSE, { consenso: consensi.per('ap-1'), ambiente: AMB, sempre: true })
      expect(conSempre.ok).toBe(false)
      expect(!conSempre.ok && conSempre.soloVolta).toBe(true)
      // Il sì di Nicholas per un altro percorso non basta; per questo sì.
      chiediEConsenti('ap-1', [ALTRO])
      expect(giudica('ap-1', percorso).ok).toBe(false)
      chiediEConsenti('ap-1', [percorso])
      expect(giudica('ap-1', percorso).ok).toBe(true)
    })
  }

  it('«sempre» nel progetto: le cancellazioni fuori dalle cartelle passano senza chiedere, il resto no', () => {
    const { consensi } = prova()
    const opz = { consenso: consensi.per('ap-1'), ambiente: AMB, sempre: true }
    expect(giudicaStrumento(rm(DA_TOGLIERE), AMMESSE, opz).ok).toBe(true)
    expect(giudicaStrumento(rm(`${CASA}\\AppData\\Local\\Qualcosa\\vecchio`), AMMESSE, opz).ok).toBe(true)
    expect(giudicaStrumento(rm(`${CASA}\\AppData\\Local`), AMMESSE, opz).ok).toBe(false)
    expect(giudicaStrumento({ tool_name: 'Bash', tool_input: { command: 'rm -rf "$d"/*' }, cwd: 'E:\\vecchio' }, AMMESSE, opz).ok).toBe(false)
  })

  it('un percorso con una variabile non espansa: bloccato anche col consenso', () => {
    const { consensi } = prova()
    consensi.chiesta('ap-1', ['E:\\vecchio\\$d'], 'd-5')
    consensi.risposta('d-5', SCELTA_SI)
    const g = giudicaStrumento({ tool_name: 'Bash', tool_input: { command: 'rm -rf "$d"/*' }, cwd: 'E:\\vecchio' }, AMMESSE, { consenso: consensi.per('ap-1'), ambiente: AMB })
    expect(g.ok).toBe(false)
  })

  it('dentro AppData\\Local un percorso preciso si può cancellare col consenso, AppData\\Local no', () => {
    const { giudica, chiediEConsenti } = prova()
    const preciso = `${CASA}\\AppData\\Local\\Prova\\cache-vecchia`
    expect(giudica('ap-1', preciso).ok).toBe(false)
    chiediEConsenti('ap-1', [preciso])
    expect(giudica('ap-1', preciso).ok).toBe(true)
    expect(giudica('ap-1', `${CASA}\\AppData\\Local`).ok).toBe(false)
  })
})
