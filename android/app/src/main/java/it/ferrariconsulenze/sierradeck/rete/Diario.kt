package it.ferrariconsulenze.sierradeck.rete

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/** Un tentativo di collegamento, per capire dopo cosa è successo. */
@Serializable
data class Tentativo(
    val quando: Long,
    val pc: String,
    /** casa | tailscale | ponte */
    val strada: String,
    /** riuscito | fallito | saltato | estraneo | non-mi-conosce */
    val esito: String,
    val ms: Long = 0,
    val motivo: String = ""
)

/**
 * Il diario dei tentativi: gli ultimi 200, su file, e quelli non ancora mandati
 * al PC (`POST /api/telefono/diario`) al collegamento dopo. Senza, «non si
 * collega» restava una frase senza storia.
 */
class Diario(private val file: File?, private val tetto: Int = 200) {
    private val righe = ArrayDeque<Tentativo>()
    private var mandatiFino = 0L
    private var letto = false

    @Synchronized
    private fun carica() {
        if (letto) return
        letto = true
        val f = file ?: return
        try {
            if (f.exists()) Api.json.decodeFromString(ListSerializer(Tentativo.serializer()), f.readText()).takeLast(tetto).forEach { righe.addLast(it) }
            mandatiFino = File(f.parentFile, f.name + ".mandati").takeIf { it.exists() }?.readText()?.trim()?.toLongOrNull() ?: 0L
        } catch (e: Exception) {
            righe.clear()
        }
    }

    @Synchronized
    fun annota(t: Tentativo) {
        carica()
        righe.addLast(t)
        while (righe.size > tetto) righe.removeFirst()
        salva()
    }

    @Synchronized
    fun ultimi(n: Int = tetto): List<Tentativo> { carica(); return righe.toList().takeLast(n) }

    @Synchronized
    fun daMandare(): List<Tentativo> { carica(); return righe.filter { it.quando > mandatiFino } }

    @Synchronized
    fun mandati(fino: Long) {
        carica()
        mandatiFino = maxOf(mandatiFino, fino)
        val f = file ?: return
        try { File(f.parentFile, f.name + ".mandati").writeText(mandatiFino.toString()) } catch (e: Exception) { }
    }

    private fun salva() {
        val f = file ?: return
        try {
            val tmp = File(f.parentFile, f.name + ".tmp")
            tmp.writeText(Api.json.encodeToString(ListSerializer(Tentativo.serializer()), righe.toList()))
            if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
        } catch (e: Exception) {
            // Un diario che non si scrive non ferma il collegamento.
        }
    }
}
