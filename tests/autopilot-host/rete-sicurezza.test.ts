import { describe, it, expect } from 'vitest'
import { applicaRete, fallitiDavvero } from '../../src/autopilot-host/rete-sicurezza'
import type { EsitoVerifica } from '../../src/autopilot-host/decisione'
import { STRATEGIE } from '../../src/autopilot-host/strategie'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-12T10:00:00.000Z'
    }),
    ...over
  }
}

const PASSATO: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: true, uscita: 'ok'
}
const BOCCIATO: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: false, uscita: '2 test rossi'
}
const NON_MISURABILE: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: false, misurato: false,
  uscita: 'bash: unexpected EOF'
}

const CTX = (esiti: EsitoVerifica[], inCerchioDa = 0, a = ap()): Parameters<typeof applicaRete>[0] =>
  ({ a, esiti, inCerchioDa })

describe('fallitiDavvero', () => {
  it('non conta i criteri che nessuno ha potuto misurare', () => {
    // Un comando che non parte non dice niente sul lavoro: contarlo fra i
    // bocciati e' cio' che mandava la chat a correggere codice sano.
    expect(fallitiDavvero([BOCCIATO, NON_MISURABILE])).toEqual([BOCCIATO])
  })
})

describe('applicaRete', () => {
  it('non lascia dichiarare finito un lavoro che i comandi bocciano', () => {
    // E' il danno peggiore che questo sistema possa fare: chiudere da solo un
    // lavoro incompleto. Un comando eseguito batte qualunque parere.
    const { mossa, nota } = applicaRete(CTX([BOCCIATO]), { azione: 'finito' })
    expect(mossa.tipo).toBe('prosegui')
    expect(nota).toContain('rifiutato')
  })

  it('lascia chiudere quando i comandi lo sostengono', () => {
    expect(applicaRete(CTX([PASSATO]), { azione: 'finito' }).mossa.tipo).toBe('finito')
  })

  it('un criterio non misurabile non fa chiudere: fa chiedere', () => {
    // **Regola cambiata di proposito.** Prima si lasciava chiudere: un criterio
    // non misurato non e' un fallimento, e' un dato mancante, e si dava la
    // decisione al supervisore «che il quadro ce l'ha». Ma il supervisore il
    // quadro lo legge dalla chat, non dal comando che non e' partito: chiudere
    // li' vuol dire dichiarare finito un lavoro di cui una parte non e' mai
    // stata controllata.
    //
    // Nemmeno si insiste, pero': il comando rotto resta rotto — la riparazione
    // automatica ha gia' provato in questo stesso giro — e proseguire vorrebbe
    // dire girare fino a un tetto. Si chiede a chi puo' deciderlo davvero.
    expect(applicaRete(CTX([NON_MISURABILE]), { azione: 'finito' }).mossa.tipo)
      .toBe('chiediUtente')
  })

  it('prosegue con le istruzioni del supervisore', () => {
    const { mossa } = applicaRete(CTX([BOCCIATO]), {
      azione: 'prosegui', istruzioni: 'Guarda il test X: manca il caso limite'
    })
    expect(mossa.tipo).toBe('prosegui')
    if (mossa.tipo === 'prosegui') expect(mossa.istruzioni).toContain('caso limite')
  })

  it('«prosegui» senza istruzioni torna alle regole', () => {
    // Rimandare la chat a lavorare senza dirle cosa fare produce un giro
    // identico al precedente: uno stallo travestito da attivita'.
    const { mossa, nota } = applicaRete(CTX([BOCCIATO]), { azione: 'prosegui' })
    expect(mossa.tipo).toBe('prosegui')
    expect(nota).toContain('regole')
  })

  it('dopo troppi giri uguali aggiunge la strategia alle istruzioni', () => {
    const { mossa } = applicaRete(CTX([BOCCIATO], 3), {
      azione: 'prosegui', istruzioni: 'Riprova la correzione'
    })
    if (mossa.tipo === 'prosegui') {
      expect(mossa.istruzioni).toContain(STRATEGIE[0].istruzioni)
      expect(mossa.strategia).toBe(STRATEGIE[0].nome)
    }
  })

  it('accetta la correzione di un criterio che non si e potuto misurare', () => {
    const { mossa } = applicaRete(CTX([NON_MISURABILE]), {
      azione: 'correggiCriterio',
      criterio: { descrizione: 'i test passano', comando: 'npx vitest run' }
    })
    expect(mossa.tipo).toBe('correggiCriterio')
    if (mossa.tipo === 'correggiCriterio') expect(mossa.comando).toBe('npx vitest run')
  })

  it('rifiuta di «correggere» un criterio che misura e boccia', () => {
    // Sarebbe il modo piu' elegante di far sparire un problema invece di
    // risolverlo: cambiare la domanda finche' la risposta non piace.
    const { mossa, nota } = applicaRete(CTX([BOCCIATO]), {
      azione: 'correggiCriterio',
      criterio: { descrizione: 'i test passano', comando: 'true' }
    })
    expect(mossa.tipo).not.toBe('correggiCriterio')
    expect(nota).toContain('misura, e boccia')
  })

  it('gira la domanda all utente quando ce n e una', () => {
    const { mossa } = applicaRete(CTX([BOCCIATO]), {
      azione: 'chiedi', domanda: 'Quale chiave API devo usare?'
    })
    expect(mossa.tipo).toBe('chiediUtente')
  })

  it('«chiedi» senza domanda non ferma il lavoro', () => {
    const { mossa } = applicaRete(CTX([BOCCIATO]), { azione: 'chiedi' })
    expect(mossa.tipo).toBe('prosegui')
  })

  it('senza supervisore decidono le regole, e il lavoro non si ferma', () => {
    // Un modello che non risponde non deve bloccare niente: sotto c'e' ancora
    // il motore che ha retto fin qui.
    const { mossa, nota } = applicaRete(CTX([BOCCIATO]), undefined)
    expect(mossa.tipo).toBe('prosegui')
    expect(nota).toContain('non ha risposto')
  })

  it('senza supervisore, tutto verde non basta per chiudere', () => {
    // I comandi dicono che non c'e' niente di rotto, non che il lavoro e'
    // finito. A dirlo deve essere qualcuno che l'ha guardato: se non ha
    // risposto ci si ferma e lo si scrive.
    const { mossa } = applicaRete(CTX([PASSATO]), undefined)
    expect(mossa.tipo).toBe('sospendi')
    if (mossa.tipo === 'sospendi') expect(mossa.motivo).toContain('supervisore')
  })

  it('senza supervisore ed esaurite le strade, chiede all utente', () => {
    const fuori = 3 + STRATEGIE.length
    expect(applicaRete(CTX([BOCCIATO], fuori), undefined).mossa.tipo).toBe('chiediUtente')
  })
})

describe('chiudere con criteri mai misurati', () => {
  it('«finito» non passa se un comando non e nemmeno partito', () => {
    // Il caso che scappava: un criterio non misurato non boccia niente, quindi
    // `fallitiDavvero` lo ignora e la porta di «finito» restava aperta. Il
    // lavoro si chiudeva con una parte mai controllata — il fallimento
    // silenzioso peggiore che questo sistema possa produrre.
    const { mossa, nota } = applicaRete(CTX([NON_MISURABILE]), { azione: 'finito' })
    expect(mossa.tipo).toBe('chiediUtente')
    expect(nota).toContain('non misurati')
  })

  it('con tutti i criteri misurati e verdi, «finito» passa come prima', () => {
    expect(applicaRete(CTX([PASSATO]), { azione: 'finito' }).mossa.tipo).toBe('finito')
  })

  it('un criterio verde accanto a uno non misurato non basta', () => {
    // Il pericolo vero: la maggioranza verde fa sembrare tutto a posto.
    const altroVerde: EsitoVerifica = {
      descrizione: 'compila', comando: 'npm run build', passato: true, uscita: 'ok'
    }
    const { mossa } = applicaRete(CTX([altroVerde, NON_MISURABILE]), { azione: 'finito' })
    expect(mossa.tipo).not.toBe('finito')
  })
})
