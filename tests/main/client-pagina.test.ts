import { describe, it, expect } from 'vitest'
import { paginaClient, MANIFESTO } from '../../src/main/client-pagina'

const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

describe('lo script della pagina', () => {
  it('è JavaScript valido', () => {
    // Un errore di sintassi qui non si vede da nessuna parte: la pagina resta
    // **nera**, senza un messaggio, senza niente da premere. È successo, ed è
    // la ragione per cui questo test esiste: il testo vive dentro un template
    // JavaScript, e una virgoletta scappata male non la nota nessuno.
    expect(() => new Function(script)).not.toThrow()
  })

  it('si puo affidare un lavoro, e la cartella si sceglie dalla lista', () => {
    // Delegare e' il gesto che ha piu' senso da un telefono: si dice cosa si
    // vuole e si va. Le domande della preparazione arrivano sulla stessa
    // pagina, dove c'e' gia' il campo per rispondere.
    const p = paginaClient()
    expect(p).toContain('/api/autopilota/crea')
    expect(p).toContain('Affida un lavoro')
    // Per indice, come per l'apertura di una chat: un percorso di Windows
    // dentro un onclick vorrebbe dire raddoppiare i backslash e sperare.
    expect(p).toContain('scegliPer(')
  })

  it('la regex del codice cerca sei cifre, non la lettera d', () => {
    // `\d` scritto una volta sola dentro un template arriva alla pagina come
    // una «d»: la scansione del QR non accoppiava niente e nessuno capiva
    // perché.
    const riga = script.split(String.fromCharCode(10)).find((r) => r.includes('codice=(')) ?? ''
    const regex = new RegExp(riga.slice(riga.indexOf('/') + 1, riga.lastIndexOf('/')))
    // La prova vera non è che il testo somigli a una regex: è che **trovi** un
    // codice. Con la lettera «d» al posto della classe di cifre, un controllo
    // sul testo sarebbe passato lo stesso e il QR avrebbe continuato a non
    // funzionare.
    expect(regex.test('#codice=123456')).toBe(true)
  })

  it('accoppia leggendo il codice dall indirizzo', () => {
    expect(script).toContain('accoppiaDalQr')
    expect(script).toContain('location.hash')
  })

  it('ogni tasto della pagina esiste davvero', () => {
    // Un onclick che chiama una funzione mai definita non dà errore finché
    // qualcuno non lo preme: il tasto sembra esserci e non fa niente. Qui si
    // raccolgono tutti i nomi chiamati negli onclick e si controlla che siano
    // scritti da qualche parte.
    const chiamati = new Set<string>()
    for (const m of script.matchAll(/onclick="([a-zA-Z]+)\(/g)) chiamati.add(m[1] ?? '')
    for (const nome of chiamati) {
      const definita =
        script.includes(`window.${nome} =`) || script.includes(`function ${nome}(`)
      expect(definita, `${nome} non è definita`).toBe(true)
    }
    // E le tre cose che da fuori servono davvero: guardare dentro una chat,
    // aprirne una nuova, e sapere dove.
    expect(chiamati.has('guarda')).toBe(true)
    expect(chiamati.has('scegliCartella')).toBe(true)
    expect(chiamati.has('apriIn')).toBe(true)
  })

  it('qualunque errore lascia qualcosa a schermo', () => {
    // Il nero è il peggior esito: non dice se manca la rete, se la chiave non
    // vale più o se c'è un difetto, e non lascia niente da premere.
    expect(script).toContain("addEventListener('error'")
    expect(script).toContain('ingresso(')
  })
})

describe('il manifesto', () => {
  it('dice come si chiama e come si apre', () => {
    expect(MANIFESTO.name).toContain('SierraDeck')
    expect(MANIFESTO.display).toBe('standalone')
  })
})

describe('la chiave che non si riscrive ogni volta', () => {
  it('la pagina la fa sapere all app quando si accoppia', () => {
    // La chiave nasce nella pagina e finiva solo nel suo archivio locale:
    // l'app non la vedeva, e la guardia mandava le sue richieste con una
    // chiave vuota. Il servizio che esiste per avvisarti non ha mai avvisato.
    expect(script).toContain('SierraDeckApp.ricorda')
  })

  it('e la richiede all app quando non ce l ha', () => {
    expect(script).toContain('chiaveSalvata()')
  })

  it('senza il ponte funziona lo stesso: nel browser non c e', () => {
    // Il try attorno è ciò che permette alla stessa pagina di vivere in un
    // browser qualunque, dove `SierraDeckApp` non esiste.
    const riga = script.slice(script.indexOf('chiaveSalvata()') - 200, script.indexOf('chiaveSalvata()') + 80)
    expect(riga).toContain('try')
  })
})

describe('il logo', () => {
  it('c e anche nella schermata del codice', () => {
    // Si arriva da un QR o da un link e la prima cosa che si vede è un campo
    // con sei puntini: senza un segno, non si sa nemmeno dove si è finiti.
    const ingresso = html.slice(html.indexOf('function ingresso('), html.indexOf('function ingresso(') + 600)
    expect(ingresso).toContain('data:image/svg+xml')
  })
})

describe('il terminale, con i suoi colori', () => {
  it('la pagina porta dentro l interprete dei colori, per intero', () => {
    // Non una copia riscritta a mano: la stessa funzione che i test verificano,
    // incollata dentro. Due copie divergono al primo ritocco.
    const p = paginaClient()
    expect(p).toContain('function ansiInHtml')
    expect(p).toContain('#54c07a')
  })

  it('mostra le righe vestite, e ripiega su quelle ripulite', () => {
    // Una versione vecchia dell'app puo' non mandarle: meglio un terminale
    // sbiancato che uno schermo vuoto.
    const p = paginaClient()
    expect(p).toContain('righeGrezze')
    expect(p).toContain('righeDentro.length')
  })
})

describe('l invito a installare l app', () => {
  /**
   * Le funzioni vere della pagina, prese dallo script e rese chiamabili.
   *
   * Non una riscrittura: un secondo esemplare divergerebbe al primo ritocco, e
   * questo difetto e' nato proprio da un controllo che sembrava giusto e non
   * lo era.
   */
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    expect(inizio, `${nome} non e nella pagina`).toBeGreaterThan(-1)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') profondita++
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(`${nome} non si chiude`)
  }
  const decidi = new Function(
    `${estrai('versioneApp')}\n${estrai('piuNuovaApp')}\n${estrai('proponeApp')}
     return { proponeApp, versioneApp, piuNuovaApp }`
  ) as () => {
    proponeApp: (ua: string, disponibile: string, rifiutato: unknown, comeApp: boolean) => boolean
    versioneApp: (ua: string) => string
    piuNuovaApp: (mia: string, trovata: string) => boolean
  }
  const { proponeApp, versioneApp, piuNuovaApp } = decidi()

  const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126'
  const DENTRO = `${CHROME} SierraDeck/1.3.0`

  it('legge dallo user agent la versione dell app che sta guardando', () => {
    // Una WebView non e' mai `display-mode: standalone`: senza questa
    // dichiarazione la pagina non ha nessun modo di sapere dove gira.
    expect(versioneApp(DENTRO)).toBe('1.3.0')
    expect(versioneApp(CHROME)).toBe('')
  })

  it('non propone a chi ha gia quella versione installata', () => {
    // Il difetto vero, provato sul telefono: la banda offriva di scaricare la
    // 1.3.0 a chi stava usando la 1.3.0, e premere non faceva niente.
    expect(proponeApp(DENTRO, '1.3.0', null, false)).toBe(false)
  })

  it('propone dentro l app solo un sorpasso vero', () => {
    expect(proponeApp(`${CHROME} SierraDeck/1.2.0`, '1.3.0', null, false)).toBe(true)
    expect(proponeApp(`${CHROME} SierraDeck/1.3.0`, '1.2.9', null, false)).toBe(false)
    expect(piuNuovaApp('0.9.0', '0.10.0')).toBe(true)
  })

  it('nel browser Android l app si propone ancora: li non ce l ha', () => {
    expect(proponeApp(CHROME, '1.3.0', null, false)).toBe(true)
  })

  it('tace su un computer, a chi ha detto no, e se non c e niente da scaricare', () => {
    expect(proponeApp('Mozilla/5.0 (Windows NT 10.0)', '1.3.0', null, false)).toBe(false)
    expect(proponeApp(CHROME, '1.3.0', '1', false)).toBe(false)
    expect(proponeApp(CHROME, undefined as unknown as string, null, false)).toBe(false)
  })

  it('il no vale per quella versione, non per sempre', () => {
    // Altrimenti un «No, grazie» premuto una volta spegneva ogni avviso
    // futuro: chi l'ha premuto non saprebbe piu' di nessun aggiornamento.
    expect(proponeApp(DENTRO, '1.3.0', '1.3.0', false)).toBe(false)
    expect(proponeApp(`${CHROME} SierraDeck/1.2.0`, '1.4.0', '1.3.0', false)).toBe(true)
  })
})

describe('la pagina si puo leggere, e non mente', () => {
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    expect(inizio, `${nome} non e nella pagina`).toBeGreaterThan(-1)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') profondita++
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(`${nome} non si chiude`)
  }

  it('non rifa il documento quando non e cambiato niente', () => {
    // E' la meta' concreta di «inusabile»: la pagina si ricostruiva tutta ogni
    // due secondi, e lo scorrimento di una chat tornava a zero due volte al
    // secondo. Leggere l'output dal telefono era materialmente impossibile.
    expect(script).toContain('function impronta(')
    const p = script.slice(script.indexOf('function pannello('))
    expect(p.slice(0, 1400)).toContain('=== ultimaImpronta')
  })

  it('e quando lo rifa, rimette lo scorrimento dov era', () => {
    expect(script).toContain('function segnaScorrimento(')
    expect(script).toContain('rimettiScorrimento(dove)')
  })

  it('il LED lo decide il computer, non una seconda mappatura scritta a mano', () => {
    // Quella scritta a mano dava a un autopilota **fallito** lo stesso puntino
    // grigio di uno **finito**: due copie della stessa regola divergono, e
    // questa era gia' divergente.
    expect(script).toContain('a.led')
    expect(script).toContain("classe.indexOf('led--')")
  })

  it('l ambra pulsa nell elenco, dove si guarda da lontano', () => {
    // Il lampeggio esisteva solo dentro il dettaglio, cioe' mancava proprio
    // dove serve: in tutto il programma significa «aspetta te».
    const stile = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    expect(stile).toMatch(/\.attesa\s*\{[^}]*animation:\s*pulsa/)
    expect(stile).toContain('@keyframes pulsa')
    // E chi ha chiesto di non vedere animazioni non perde l'informazione.
    expect(stile).toContain('prefers-reduced-motion')
  })

  it('quando il computer tace lo dice, invece di mostrare dati vecchi', () => {
    expect(script).toContain('giriFalliti')
    expect(script).toContain('scollegato')
    expect(script).toContain('Non parlo con il computer da')
    // Due giri di tolleranza: una richiesta persa capita.
    expect(script).toContain('giriFalliti >= 2')
  })

  it('e allora spegne tutti i LED, invece di lasciarli verdi', () => {
    const led = script.slice(script.indexOf('const led = (a) =>'))
    expect(led.slice(0, 200)).toContain("giriFalliti >= 2")
  })

  it('dice da quanto tace, in secondi, minuti o ore', () => {
    const daQuando = new Function(`${estrai('daQuando')}\nreturn daQuando`)() as (q: number) => string
    const adesso = Date.now()
    expect(daQuando(adesso - 40_000)).toBe('40 secondi')
    expect(daQuando(adesso - 5 * 60_000)).toBe('5 minuti')
    expect(daQuando(adesso - 3 * 3600_000)).toBe('3 ore')
    // Mai una data assurda quando non si e' mai parlato con nessuno.
    expect(daQuando(0)).not.toContain('NaN')
  })
})

describe('la fascia in basso', () => {
  it('ha quattro destinazioni, ed e fissa', () => {
    // «La barra in basso non e' il problema: *quella* barra lo era.» Era un
    // riquadro di bottoni alla fine di uno scorrimento infinito, che apriva i
    // suoi pannelli ancora piu' sotto — con sei chat aperte «Consumi» era a
    // dodici schermate dal pollice.
    for (const voce of ['ADESSO', 'CHAT', 'LAVORI', 'COMPUTER']) {
      expect(script).toContain(voce)
    }
    const stile = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    expect(stile).toMatch(/\.fascia\s*\{[^}]*position:\s*fixed/)
    // E lascia spazio a se stessa: senza, l'ultima piastrella finisce sotto i
    // tasti — proprio quella che si stava andando a leggere.
    expect(stile).toContain('main.schermata')
    expect(stile).toContain('env(safe-area-inset-bottom)')
  })

  it('il riquadro dei cinque bottoni non c e piu', () => {
    // I comandi stavano in tre posti diversi; adesso in uno.
    expect(script).not.toContain("apriPannello('sessioni')\">Riprendi</button>")
    // E l'intestazione che ripeteva i numeri se n'e' andata con lui.
    expect(script).not.toContain('<header><b>SIERRADECK</b>')
  })

  it('la fascia e anche la fila dei LED', () => {
    // L'idea che tiene insieme la pagina: la navigazione **e'** il display di
    // stato. Sei dentro una chat e vedi lampeggiare in fondo che qualcuno ti
    // aspetta.
    expect(script).toContain('function ledDestinazione(')
    const f = script.slice(script.indexOf('function fascia('), script.indexOf('function fascia(') + 700)
    expect(f).toContain('ledDestinazione(')
    expect(f).toContain('class="led ')
  })

  it('il computer accende il suo LED solo quando riguarda la macchina', () => {
    const led = script.slice(script.indexOf('function ledDestinazione('))
    const corpo = led.slice(0, led.indexOf('function fascia('))
    // Aggiornamento pronto, o silenzio: non gli autopiloti.
    expect(corpo).toContain('aggiornamentoVisto')
    expect(corpo).toContain("nome === 'computer'")
  })

  it('cambiare destinazione lascia una traccia, cosi indietro non esce dall app', () => {
    // Da una WebView il tasto indietro di Android usciva dall'app: brutale per
    // un gesto che tutti fanno per «torna su».
    expect(script).toContain('history.pushState')
    expect(script).toContain("addEventListener('popstate'")
    // E prima di cambiare schermata chiude quello che si sta guardando.
    const pop = script.slice(script.indexOf("addEventListener('popstate'"))
    expect(pop.slice(0, 500)).toContain('dentro = null')
  })

  it('ogni destinazione ha il suo contenuto, e quello che non c entra non compare', () => {
    const sch = script.slice(script.indexOf('const schermate = {'))
    const corpo = sch.slice(0, sch.indexOf('app.innerHTML'))
    // Il quaderno sta con i lavori: e' quello che l'autopilota produce.
    expect(corpo).toContain('vistaQuaderno')
    // I consumi e i salvataggi stanno con il computer.
    expect(corpo).toContain('vistaConsumi')
    expect(corpo).toContain('elencoSalvataggi')
    // «Affida un lavoro» sta in Lavori, non in mezzo alle chat.
    expect(corpo.slice(corpo.indexOf('lavori:'), corpo.indexOf('computer:'))).toContain('delega')
  })
})

describe('i materiali del banco, sul telefono', () => {
  const stile = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))

  it('il raggio arriva dal computer e non si adatta', () => {
    // I 14px di raggio erano la ragione singola per cui la pagina sembrava un
    // modulo web invece del banco, che ha --raggio 2px.
    expect(stile).toContain('--raggio: 2px')
    expect(stile).not.toContain('border-radius: 14px')
  })

  it('le misure sono token, non pixel scritti a mano', () => {
    // I token del computer arrivavano e venivano buttati: scegliere il Foglio
    // non cambiava niente qui.
    for (const t of ['--t0', '--t1', '--t2', '--t3', '--t4', '--s1', '--s2', '--s3', '--s4']) {
      expect(stile, `manca ${t}`).toContain(t)
    }
    expect(script).toContain('const MISURE = {')
    expect(script).toContain("s.stile === 'foglio'")
  })

  it('ma le misure del telefono sono piu grandi di quelle del computer', () => {
    // 10px di serigrafia a braccio teso non si leggono, e senza puntatore
    // serve piu' aria fra le cose.
    const misure = script.slice(script.indexOf('const MISURE = {'))
    expect(misure.slice(0, 400)).toContain("'--t0': '11px'")
    expect(misure.slice(0, 400)).toContain("'--t4': '22px'")
  })

  it('i tasti hanno rilievo e si premono', () => {
    // Su un telefono non c'e' hover: il rilievo e la pressione sono tutto il
    // ritorno che si puo' dare.
    expect(stile).toMatch(/button\s*\{[^}]*box-shadow:\s*var\(--rilievo\)/)
    expect(stile).toContain('button:active')
    expect(stile).toContain('translateY(1px)')
  })

  it('il colore resta riservato allo stato', () => {
    // Un tasto pieno d'azzurro per scaricare un file diceva «urgente» a una
    // cosa che non lo e', e toglieva forza all'ambra che significa «tocca a te».
    const tastoLink = stile.slice(stile.indexOf('.tasto-link'), stile.indexOf('.tasto-link') + 700)
    expect(tastoLink).not.toContain('background: var(--accento)')
    expect(tastoLink).not.toContain('color: #fff')
  })

  it('ci sono la serigrafia e il solco', () => {
    expect(stile).toContain('.serigrafia')
    expect(stile).toContain('.solco')
    expect(stile).toContain('var(--incisione)')
  })
})

describe('la gerarchia di Adesso', () => {
  const stile = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))

  it('i quattro numeri giganti non ci sono piu', () => {
    // Rispondevano alla domanda sbagliata: «0 ti aspettano» e «2 ti aspettano»
    // differiscono di un carattere, mentre la domanda del colpo d'occhio e'
    // «serve qualcosa da me, si' o no».
    expect(script).not.toContain('<span>ti aspettano</span>')
    expect(script).not.toContain('<span>al lavoro</span>')
  })

  it('una domanda in attesa e la schermata, non una piastrella fra le altre', () => {
    const dom = script.slice(script.indexOf('const domande = '))
    const corpo = dom.slice(0, 900)
    expect(corpo).toContain('TI STA CHIEDENDO')
    // Il suo testo alla misura piu' grande della pagina.
    expect(corpo).toContain('class="grande"')
    expect(stile).toMatch(/\.grande\s*\{[^}]*font-size:\s*var\(--t4\)/)
    // Una sola alla volta: la seconda aspetta il suo turno.
    expect(corpo).toContain('.slice(0, 1)')
    expect(corpo).toContain('1 DI ')
  })

  it('e quando domina lei, tutto il resto collassa in una riga', () => {
    const sch = script.slice(script.indexOf('adesso: fermo'))
    expect(sch.slice(0, 500)).toContain('altre cose in moto')
  })

  it('quello che si e fermato e rosso, e il suo LED non pulsa', () => {
    // Il lampeggio in tutto il programma significa una cosa sola — aspetta te —
    // e «si e' fermato» non lo sta dicendo.
    expect(script).toContain('SI E FERMATO')
    expect(script).toContain('class="led rosso"')
    expect(stile).toMatch(/\.led\.rosso\s*\{(?![^}]*animation)/)
  })

  it('e dice perche, non solo che', () => {
    // «Sospeso» da solo manda a cercare altrove: la parte utile e' il motivo.
    const b = script.slice(script.indexOf('const bloccati = '))
    expect(b.slice(0, 800)).toContain('a.motivo')
  })

  it('quando non c e niente da fare, domina il vuoto', () => {
    expect(script).toContain('Tutto in moto.')
    expect(script).toContain('Nessuno ti aspetta.')
    expect(stile).toContain('.calma__grande')
  })

  it('il polso e una riga per cosa, non un cruscotto', () => {
    const polso = script.slice(script.indexOf('const polso ='))
    expect(polso.slice(0, 900)).toContain('IN MOTO')
    expect(stile).toContain('.polso__nome')
  })
})

describe('la profondita, e i bordi', () => {
  const stile = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))

  it('gli elenchi sono elenchi: una riga per cosa', () => {
    // Prima ogni chat portava sempre sei comandi — campo, Invia, Guarda
    // dentro, campo nome, Nome, Chiudi: con sei chat erano trenta bersagli in
    // una colonna.
    expect(script).toContain('class="voce"')
    expect(stile).toContain('.voce__nome')
    // Il campo per rinominare non e' piu' sempre a schermo.
    expect(script).toContain('apriAltro(')
  })

  it('dentro una chat il terminale prende l altezza, e il campo sta in fondo', () => {
    expect(script).toContain('dentro--alto')
    expect(stile).toMatch(/\.dentro--alto\s*\{[^}]*height:\s*58vh/)
    expect(script).toContain('class="riga ancorata"')
    expect(stile).toMatch(/\.ancorata\s*\{[^}]*position:\s*sticky/)
  })

  it('si torna indietro con una freccia sola', () => {
    expect(script).toContain('class="indietro"')
    expect(script).toContain('chiudiDentro()')
  })

  it('il quaderno e quello dell autopilota che stai guardando', () => {
    // Prima leggeva la cartella della prima chat dell'elenco: con due progetti
    // aperti e' semplicemente un'altra cosa.
    const f = script.slice(script.indexOf('function cartellaPrima('))
    expect(f.slice(0, 400)).toContain('dentroAp')
  })

  it('il percorso di una cartella si taglia da sinistra', () => {
    // «…\\progetti\\sierradeck» dice quello che serve; «C:\\Users\\nikof\\…» no.
    expect(script).toContain('cartella__nome')
    expect(stile).toMatch(/\.cartella__dove\s*\{[^}]*direction:\s*rtl/)
  })

  it('il permesso di avvisare si chiede alla prima domanda vera', () => {
    // Chiederlo al primo disegno significa chiederlo prima che esista un
    // motivo per dire di si' — e chi dice di no, dice di no per sempre.
    const f = script.slice(script.indexOf('function avvisaSeServe('))
    expect(f.slice(0, 700)).toContain('requestPermission')
    expect(f.slice(0, 700)).toContain('(stato.domande || []).length > 0')
    // E all'apertura non si chiede piu' niente.
    const c = script.slice(script.indexOf('function chiediDiAvvisare('))
    expect(c.slice(0, 120)).not.toContain('requestPermission')
  })

  it('c e un solo momento animato, e si puo spegnere', () => {
    expect(stile).toContain('@keyframes entra')
    const ridotto = stile.slice(stile.indexOf('@media (prefers-reduced-motion'))
    expect(ridotto).toContain('animation: none')
  })
})

describe('la stessa pagina, aperta da un computer', () => {
  const stile = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))

  it('la fascia diventa una colonna, con le stesse quattro voci', () => {
    // Non una seconda interfaccia: la stessa, seduta invece che in piedi. Chi
    // passa dal telefono al portatile ritrova le stesse quattro parole.
    const largo = stile.slice(stile.indexOf('@media (min-width: 900px)'))
    expect(largo).toContain('.fascia')
    expect(largo).toContain('grid-template-columns: 1fr')
  })

  it('e la colonna del testo si ferma dove finisce la lettura comoda', () => {
    // Una riga larga mezzo metro non si legge.
    const largo = stile.slice(stile.indexOf('@media (min-width: 900px)'))
    expect(largo).toMatch(/main\.schermata\s*\{[^}]*max-width/)
  })
})
