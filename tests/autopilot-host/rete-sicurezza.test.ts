import { describe, it, expect } from 'vitest'
import { applicaRete, fallitiDavvero, interrogaSupervisore, rigaSupervisoreMancato, senzaSupervisore, TETTO_SUPERVISORE_MANCATO } from '../../src/autopilot-host/rete-sicurezza'
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

  it('un criterio non misurabile non ferma la chiusura: si chiude dicendolo (0.84.3)', () => {
    // **Regola cambiata due volte, di proposito.** Fino alla 0.43 si chiudeva
    // in silenzio; dalla 0.44 alla 0.84.2 si chiedeva a Nicholas «chiudo lo
    // stesso o correggi il comando?», cioè gli si chiedeva un gesto a mano.
    // Il 22/10 Nicholas: «togli i vincoli». Adesso si chiude, e la mossa porta
    // con sé quale criterio non si è misurato e perché, per la riga a Nicholas.
    const { mossa } = applicaRete(CTX([NON_MISURABILE]), { azione: 'finito' })
    expect(mossa.tipo).toBe('finito')
    if (mossa.tipo === 'finito') expect(mossa.senzaMisura).toEqual([{ descrizione: 'i test passano', perche: 'il comando di verifica non parte («bash: unexpected EOF»)' }])
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

  it('senza supervisore, tutto verde non basta per chiudere: si rifà il giro (0.80.1)', () => {
    // I comandi dicono che non c'e' niente di rotto, non che il lavoro e'
    // finito. A dirlo deve essere qualcuno che l'ha guardato. Fino alla 0.80.0
    // ci si sospendeva; ora si rifà il giro e il supervisore torna a decidere.
    const { mossa } = applicaRete(CTX([PASSATO]), undefined)
    expect(mossa.tipo).toBe('prosegui')
    if (mossa.tipo === 'prosegui') expect(mossa.istruzioni).toContain('supervisore non ha detto')
  })

  it('un supervisore che non decide (azione senza istruzioni) non sospende', () => {
    const { mossa } = applicaRete(CTX([PASSATO]), { azione: 'chiedi' })
    expect(mossa.tipo).toBe('prosegui')
  })

  it('senza supervisore ed esaurite le strade, chiede all utente', () => {
    const fuori = 3 + STRATEGIE.length
    expect(applicaRete(CTX([BOCCIATO], fuori), undefined).mossa.tipo).toBe('chiediUtente')
  })
})

describe('chiudere con criteri mai misurati', () => {
  it('«finito» con un comando che non è nemmeno partito chiude, mai in silenzio (0.84.3)', () => {
    // Il caso che scappava prima della 0.44: chiudere senza dirlo. Adesso la
    // nota e la mossa dicono quali criteri non si sono misurati.
    const { mossa, nota } = applicaRete(CTX([NON_MISURABILE]), { azione: 'finito' })
    expect(mossa.tipo).toBe('finito')
    expect(nota).toContain('non misurati')
    expect(nota).toContain('senza chiedere')
  })

  it('con tutti i criteri misurati e verdi, «finito» passa come prima', () => {
    expect(applicaRete(CTX([PASSATO]), { azione: 'finito' }).mossa.tipo).toBe('finito')
  })

  it('un criterio verde accanto a uno non misurato: si chiude, e si dice solo quello non misurato', () => {
    const altroVerde: EsitoVerifica = {
      descrizione: 'compila', comando: 'npm run build', passato: true, uscita: 'ok'
    }
    const { mossa } = applicaRete(CTX([altroVerde, NON_MISURABILE]), { azione: 'finito' })
    expect(mossa.tipo === 'finito' && mossa.senzaMisura?.map((c) => c.descrizione)).toEqual(['i test passano'])
  })

  it('un criterio bocciato accanto a uno non misurato: non si chiude', () => {
    // Il danno peggiore resta escluso: un comando che misura e boccia vince.
    const altroRosso: EsitoVerifica = {
      descrizione: 'compila', comando: 'npm run build', passato: false, uscita: 'errore TS'
    }
    expect(applicaRete(CTX([altroRosso, NON_MISURABILE]), { azione: 'finito' }).mossa.tipo).not.toBe('finito')
  })
})

describe('supervisore che non risponde (0.82.1)', () => {
  const regole = { tipo: 'prosegui' as const, istruzioni: 'Rileggi l’obiettivo.' }

  it('la chat prosegue con l’ultima istruzione valida', () => {
    const r = senzaSupervisore({ regole, ultimeIstruzioni: 'Scrivi il test della coda.', mancati: 0 })
    expect(r.mossa.tipo).toBe('prosegui')
    expect(r.mossa.tipo === 'prosegui' && r.mossa.istruzioni).toContain('Scrivi il test della coda.')
    expect(r.mancati).toBe(1)
    expect(r.avvisaNicholas).toBe(false)
  })

  it('senza un’istruzione di prima decidono le regole; se chiedono a Nicholas vincono loro', () => {
    expect(senzaSupervisore({ regole, ultimeIstruzioni: undefined, mancati: 0 }).mossa).toEqual(regole)
    const chiedi = { tipo: 'chiediUtente' as const, domanda: 'Come procedo?' }
    expect(senzaSupervisore({ regole: chiedi, ultimeIstruzioni: 'Vai avanti.', mancati: 0 }).mossa).toEqual(chiedi)
  })

  it('al tetto una riga a Nicholas, una volta sola; poi lo si interroga un giro ogni tetto', () => {
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'x', mancati: TETTO_SUPERVISORE_MANCATO - 1 }).avvisaNicholas).toBe(true)
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'x', mancati: TETTO_SUPERVISORE_MANCATO }).avvisaNicholas).toBe(false)
    expect([0, 1, 2, 3, 4, 5, 6].map(interrogaSupervisore)).toEqual([true, true, true, true, false, false, true])
    expect(rigaSupervisoreMancato('Sistemare la coda')).toContain('«Sistemare la coda»')
    expect(rigaSupervisoreMancato('Sistemare la coda')).not.toMatch(/sospes[oa] (il|la)/)
  })
})

describe('supervisore che non risponde: dettagli (Revisione 0.82.1)', () => {
  it('una strategia nuova delle regole vale più dell’istruzione di prima', () => {
    const regole = { tipo: 'prosegui' as const, strategia: 'cambia approccio', istruzioni: 'Prova un’altra strada.' }
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'Vai avanti.', mancati: 0 }).mossa).toEqual(regole)
  })

  it('dice giusto fra quanti giri lo riprova', () => {
    const regole = { tipo: 'prosegui' as const, istruzioni: 'x' }
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'y', mancati: 0 }).nota).toContain('al prossimo giro')
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'y', mancati: 3 }).nota).toContain('fra 3 giri')
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'y', mancati: 4 }).nota).toContain('fra 2 giri')
    expect(senzaSupervisore({ regole, ultimeIstruzioni: 'y', mancati: 5 }).nota).toContain('al prossimo giro')
  })
})
