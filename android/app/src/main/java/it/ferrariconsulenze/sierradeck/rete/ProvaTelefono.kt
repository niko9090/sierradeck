package it.ferrariconsulenze.sierradeck.rete

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * La prova reciproca fra telefono e PC (contratto, sezione 1). Pura: i casi di
 * prova sono gli stessi del PC (`tests/fixtures/prova-telefono-casi.json`,
 * conto in `src/shared/prova-telefono.ts`).
 *
 * - `segno` = SHA-256 della chiave (UTF-8), in esadecimale minuscolo: è quello
 *   che il PC tiene al posto della chiave;
 * - `chi` = primi 16 caratteri di SHA-256("chi|" + segno): dice al PC quale
 *   telefono chiede, senza dire la chiave;
 * - `prova` = HMAC-SHA256 con chiave i 32 byte del segno sul messaggio
 *   "ciao|" + sfida: solo chi conosce il segno sa darla.
 *
 * La chiave parte solo verso chi ha dato una prova buona (o, per un PC che non
 * sa provare, con la logica di prima).
 */
object ProvaTelefono {
    private val caso = SecureRandom()
    private val formaSfida = Regex("^[0-9a-f]{64}$")

    fun sha256Hex(testo: String): String = hex(MessageDigest.getInstance("SHA-256").digest(testo.toByteArray(Charsets.UTF_8)))

    fun segno(chiave: String): String = sha256Hex(chiave)

    fun chi(segno: String): String = sha256Hex("chi|$segno").take(16)

    fun prova(segno: String, sfida: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(daHex(segno), "HmacSHA256"))
        return hex(mac.doFinal("ciao|$sfida".toByteArray(Charsets.UTF_8)))
    }

    fun sfidaValida(sfida: String): Boolean = formaSfida.matches(sfida)

    fun sfidaNuova(): String = ByteArray(32).also { caso.nextBytes(it) }.let(::hex)

    /** La prova arrivata è quella giusta? Confronto a tempo costante. */
    fun provaBuona(segno: String, sfida: String, arrivata: String?): Boolean {
        if (arrivata.isNullOrBlank()) return false
        return MessageDigest.isEqual(prova(segno, sfida).toByteArray(), arrivata.lowercase().toByteArray())
    }

    /** L'impronta di un PC dal suo id, come `improntaPc` del PC (per trovarlo nell'elenco di un altro PC). */
    fun improntaDaId(idPc: String): String = sha256Hex("sierradeck-rete:$idPc").take(16)

    private fun hex(b: ByteArray): String = buildString(b.size * 2) { for (x in b) append("%02x".format(x.toInt() and 0xFF)) }

    private fun daHex(s: String): ByteArray = ByteArray(s.length / 2) { i -> s.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
}
