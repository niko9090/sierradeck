package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

// ─── /api/dentro ───  (le ultime righe del terminale di UNA chat)
@Serializable
data class Dentro(
    val chat: String = "",
    val titolo: String = "",
    /** Righe ripulite (senza codici ANSI). */
    val righe: List<String> = emptyList(),
    /** Righe grezze con i codici ANSI: sono queste che la nativa colora. */
    val grezze: List<String> = emptyList(),
    val continua: List<Boolean> = emptyList(),
    val colonne: Int = 0,
    val scelte: Scelte? = null
)

// ─── /api/consumi ───
@Serializable
data class Consumi(
    val oggi: Quota = Quota(),
    val settimana: Quota = Quota(),
    val totale: Quota = Quota(),
    /** I limiti del piano, letti dal computer (dalla 0.31): finestra di 5 ore e settimana. */
    val limiti: Limiti? = null,
    /** La spesa che Claude Code stima, in dollari. */
    val costo: Costo? = null,
    /** Le chat aperte sul computer con il loro contesto, gia' detto in parole (dalla 0.37). */
    val chatAperte: List<ChatConsumo> = emptyList(),
    /** Cosa farebbe adesso il freno degli autopiloti con questi limiti (dalla 0.37). */
    val freno: FrenoConsumi? = null
)

/**
 * Una finestra del piano. Dalla 0.37 il computer manda anche `stato`
 * («fresca», «vecchia», «azzerata») e `etichetta`, la frase intera — la
 * stessa della console e della pagina: l'app la mostra cosi' com'e'.
 */
@Serializable
data class Finestra(
    val percento: Double = 0.0,
    val resettaIl: Long? = null,
    val stato: String? = null,
    val etichetta: String? = null,
    /** PC 0.70: la parola (libero, attento, pieno, vecchia, attesa) con il colore. */
    val vista: StatoVistaDrive? = null
)

@Serializable
data class ContestoChat(val percento: Int = 0, val usati: Long = 0, val dimensione: Long = 0)

@Serializable
data class ChatConsumo(
    val sessione: String = "",
    val titolo: String? = null,
    val modello: String? = null,
    val contesto: ContestoChat? = null,
    val contestoEtichetta: String? = null,
    /** PC 0.70: il contesto in una parola (libera, piena, riassumi). */
    val vista: StatoVistaDrive? = null
)

@Serializable
data class FrenoConsumi(val livello: String = "", val titolo: String = "", val spiegazione: String = "", val motivo: String = "")

@Serializable
data class Limiti(val cinqueOre: Finestra? = null, val settimana: Finestra? = null, val letti: Long = 0, val modello: String? = null)

@Serializable
data class Costo(val oggi: Double = 0.0, val settimana: Double = 0.0, val totale: Double = 0.0, val chat: Int = 0)

@Serializable
data class Quota(
    val ingresso: Long = 0,
    val uscita: Long = 0,
    val cache: Long = 0,
    val chat: Int = 0
)

// ─── /api/cartelle ───  (è una lista di percorsi, non di oggetti)
@Serializable
data class Cartelle(val cartelle: List<String> = emptyList())

// ─── /api/autopilota (dettaglio) = tutto l'autopilota + passaggi + misura ───
@Serializable
data class AutopilotaDettaglio(
    /** PC 0.84.0: il file dello storico del lavoro nel quaderno (storico-….md). Assente con un PC più vecchio. */
    val storico: String? = null,
    /** PC 0.74.0: il workspace dell'autopilota (per la Panoramica, PC 0.77.0). */
    val workspace: String? = null,
    /** PC 0.69.0: stato dal vivo e messaggi verso la chat. */
    val dalVivo: StatoDalVivo? = null,
    val messaggi: List<StatoMessaggio> = emptyList(),
    /** PC 0.81.0: il riquadro «Adesso», una riga per chat. Assente con un PC più vecchio. */
    val adesso: Adesso? = null,
    val id: String = "",
    val nome: String = "",
    /** L'obiettivo come l'ha capito lui (riscritto dalla preparazione). */
    val obiettivo: String = "",
    /** L'obiettivo come l'hai chiesto tu (assente = coincide con `obiettivo`). */
    val obiettivoTuo: String? = null,
    val stato: String = "",
    val cicli: Int = 0,
    val strategia: String? = null,
    val motivoSospensione: String? = null,
    /** Assente vale «sì». */
    val riprendiAlRiavvio: Boolean? = null,
    /** PC 0.72.0: la chat lavora senza riquadro sul PC, solo se l'ha chiesto Nicholas. Assente vale «no». */
    val sottofondo: Boolean? = null,
    val criteri: List<Criterio> = emptyList(),
    val decisioni: List<Decisione> = emptyList(),
    val passaggi: List<Passo> = emptyList(),
    val misura: MisuraPasso = MisuraPasso(),
    /** PC 0.71: i tempi dei giri in una riga («giro 12 s (criteri 2 s, supervisore 9 s) · 8 giri»). */
    val tempi: String? = null,
    /**
     * Il dialogo con lui (0.27.0): le tue battute e le sue risposte, dalla
     * scheda. Assente nei computer con una versione precedente.
     */
    val dialogo: List<ScambioDialogo> = emptyList(),
    /**
     * La chat con lui (0.29.0), composta dal computer: la stessa della sezione
     * sul PC. Vuota nei computer con una versione precedente: allora la
     * schermata mostra solo il dialogo di prima.
     */
    val chat: List<Battuta> = emptyList(),
    /** Ha una domanda aperta: quello che scrivi nella casella è la risposta. */
    val domanda: Boolean = false,
    val domandaId: String? = null,
    /** Sta pensando alla tua ultima battuta. */
    val pensa: Boolean = false,
    /** PC 0.75.4: ha promesso lavoro ed è fermo («L'autopilota è fermo: Riprendi»). */
    val fermoConPromessa: Boolean = false,
    val compitiDaFare: List<String> = emptyList(),
    val chats: List<ChatGovernataBreve> = emptyList(),
    /** Il coordinatore e le sue sotto-chat (0.36.0). Assente nei computer piu' vecchi. */
    val albero: NodoAlbero? = null,
    /** PC 0.73.0: gli specialisti, con ruolo, stato, ultima azione e la sessione per «Guarda». */
    val specialisti: Specialisti? = null,
    /** Il ramo principale in cui si uniscono i lavori delle chat. */
    val ramoBase: String? = null,
    /** La regola di pubblicazione del progetto: beta, stabile, unica. */
    val pubblicazione: String? = null,
    /** Le sue domande per la linguetta «Domande» (0.38.0), una per volta. */
    val domandeScheda: List<DomandaScheda> = emptyList()
)

/**
 * Una riga della chat con lui: `da` è "tu", "lui" o "nota" (la sua voce di
 * lavoro); `tono` colora la riga (domanda, pronto, decisione, correzione,
 * fine, fermo…); `volte` quante note uguali di fila.
 */
@Serializable
data class Battuta(
    val quando: String = "",
    val da: String = "",
    val testo: String = "",
    val dettaglio: String? = null,
    val tono: String? = null,
    val volte: Int? = null
)

/** Una chat che esegue per l'autopilota: `stato` è lavoro | bloccata | finita. */
@Serializable
data class ChatGovernataBreve(
    val id: String = "",
    val compito: String = "",
    val stato: String = "",
    val cicli: Int = 0
)

/** Una battuta del dialogo: `da` è "tu" o "lui"; `esito` dice cosa ne ha fatto. */
@Serializable
data class ScambioDialogo(
    val quando: String = "",
    val da: String = "",
    val testo: String = "",
    val esito: String? = null
)

@Serializable
data class Criterio(
    val descrizione: String = "",
    val comando: String? = null,
    val soddisfatto: Boolean = false,
    val raggiuntoIl: String? = null,
    /** Com'e' andata l'ultima misura del comando. Assente se non l'ha ancora provato. */
    val ultimaVerifica: UltimaVerifica? = null
)

/**
 * L'esito dell'ultima volta che un criterio e' stato misurato (`Verifica` in
 * `src/shared/autopilota.ts`): zero e' passato, qualunque altro codice e' come
 * e' uscito il comando, e `uscita` e' quello che ha stampato, gia' tagliato.
 */
@Serializable
data class UltimaVerifica(
    val quando: String = "",
    val codice: Int? = null,
    val uscita: String = ""
)

@Serializable
data class Decisione(val quando: String = "", val cosa: String = "")

@Serializable
data class Passo(
    /** fatto | corrente | attesa | fermo | davanti */
    val stato: String = "davanti",
    val nome: String = "",
    val nota: String? = null
)

@Serializable
data class MisuraPasso(
    val percento: Int = 0,
    /** preparazione | criteri */
    val di: String = "",
    val dettaglio: String = "",
    /** preparazione | lavoro | attesa | fermo */
    val tono: String = ""
)

// ─── /api/quaderno ───
@Serializable
data class Schede(val schede: List<SchedaBreve> = emptyList())

@Serializable
data class SchedaBreve(
    val file: String = "",
    val titolo: String = "",
    val quando: String = "",
    /** PC 0.70: i tag e la prima riga del corpo, per i filtri e la ricerca. */
    val tag: List<String> = emptyList(),
    val assaggio: String = ""
)

@Serializable
data class SchedaPiena(
    val file: String = "",
    val titolo: String = "",
    val corpo: String = "",
    val quando: String = ""
)

// ─── /api/preferenze ───
@Serializable
data class PreferenzeInvolucro(val preferenze: Preferenze = Preferenze())

@Serializable
data class Preferenze(
    /** banco | foglio */
    val stile: String = "banco",
    /** Chiarore del fondo, 0..100. */
    val chiarore: Int = 20
)

// ─── /api/aggiornamento (del computer) ───
@Serializable
data class Aggiornamento(
    val fase: String = "",
    val versione: String? = null,
    val percento: Int? = null,
    val errore: String? = null,
    /**
     * Quante chat stanno finendo quello che avevano in mano, in fase «attendo».
     *
     * Fra «Installa» e il computer che si chiude c'e' un'attesa vera: un
     * aggiornamento non uccide piu' le chat dove sono arrivate, aspetta che
     * ognuna chiuda il turno. Senza questo numero, da qui si vedrebbe un tasto
     * premuto e nient'altro - e un'attesa legittima di due minuti e' identica
     * a un tasto rotto.
     */
    val chatOccupate: Int? = null,
    /**
     * Cosa aspetta, quando non sono le chat: il lavoro con il Drive, con il
     * conto dei file. Manca sui computer prima della 0.28.1.
     */
    val attesa: String? = null,
    /** Le chat che si aspettano, con i nomi (PC 0.67.1). */
    val attesaChat: String? = null,
    /** «Aggiorna adesso» già premuto (PC 0.84.1): salva il lavoro delle chat e installa. */
    val subito: Boolean? = null,
    /**
     * Le fasi con il tempo (PC 0.84.3): «Scaricato in 40 s · salvo le chat da
     * 2 min (al massimo 5 min) · poi installo e riparto». La stessa riga del PC.
     */
    val fasiTesto: String? = null,
    /**
     * Quello che l'installer sta scrivendo **adesso**, parola per parola.
     *
     * Arriva solo mentre il computer si sta aggiornando, e non lo manda
     * SierraDeck — che in quel momento e' chiuso — ma l'installer stesso, che
     * prende in prestito la porta rimasta libera. Quando c'e', questa e' la
     * verita' e non si deduce piu' niente dal silenzio.
     */
    val testo: String? = null,
    /**
     * L'ultima installazione sul computer non e' riuscita (0.39.2): al riavvio
     * era ancora sulla versione di prima. Manca sui computer piu' vecchi.
     */
    val tentativoFallito: TentativoFallitoPc? = null
)

/** Il perche' e le strade di un'installazione non riuscita, scritti dal computer. */
@Serializable
data class TentativoFallitoPc(
    val versione: String = "",
    val da: String = "",
    val quando: String = "",
    val titolo: String = "",
    val motivo: String = "",
    val strade: List<String> = emptyList(),
    val pagina: String = ""
)

// ─── /api/sessioni ───
/** `nascoste` (PC 0.60.0): le chat senza nome fuori dall'elenco, non cancellate. */
@Serializable
data class Sessioni(val sessioni: List<SessioneRipresa> = emptyList(), val nascoste: Int = 0)

@Serializable
data class SessioneRipresa(
    val id: String = "",
    val cwd: String = "",
    val titolo: String = "",
    val quando: String = "",
    /**
     * La cartella di questa chat sta su un altro PC: il suo nome. Riprenderla
     * qui non si puo' (il computer risponde 409 e lo spiega); si vede, per
     * sapere dove andarla a cercare.
     */
    val altrove: String? = null,
    /**
     * Quel PC e' acceso adesso (dal suo battito sul Drive, 0.35.0): e' la
     * stessa etichetta del computer, «su X · acceso» o «spento». Assente nei
     * computer piu' vecchi.
     */
    val altroveAcceso: Boolean? = null,
    /** L'id di quel PC (PC 0.58.4): per scriverle da qui, e là parte in sottofondo. */
    val altrovePc: String? = null,
    /** Senza nome (PC 0.60.0): c'è solo con «mostra anche le senza nome». */
    val senzaNome: Boolean = false
)

// ─── risposta generica delle azioni ───
/**
 * `esito`, `tentativi` e `frase` (PC 0.84.1, app dalla 0.84.3): dopo una
 * risposta a una domanda il PC dice se la chat l'ha presa davvero. La frase
 * è la stessa che leggono PC e pagina («Presa: «Blu», la chat è andata avanti.»).
 */
@Serializable
data class Fatto(
    val fatto: Boolean = false,
    val autopilota: String? = null,
    val esito: String? = null,
    val tentativi: Int? = null,
    val frase: String? = null
)

/** La riga dopo una risposta: quella del PC se la dice, se no «Mandata» come prima. */
object EsitoRisposta {
    fun riga(f: Fatto, testo: String): String =
        f.frase?.takeIf { it.isNotBlank() } ?: "Mandata: «${testo.take(80)}». Sparisce appena il computer la riceve."
}
