package it.ferrariconsulenze.sierradeck.schermate.tema

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import it.ferrariconsulenze.sierradeck.R
import it.ferrariconsulenze.sierradeck.nucleo.Stile
import it.ferrariconsulenze.sierradeck.schermate.vecchie.chiave

/**
 * I colori del banco — **vivi**, non copiati.
 *
 * La grafica di SierraDeck la sceglie l'utente sul computer (l'accento, il
 * chiarore del fondo, e se il banco è inciso o un foglio piatto). Il telefono la
 * riceve da `/api/stile` e la indossa: l'app e la finestra sono lo stesso
 * strumento, quindi devono avere la stessa faccia — fino al **raggio degli
 * angoli**, che è quello della console (2px sul banco), non i bordi tondi di un
 * modulo web.
 *
 * I valori sono `mutableStateOf`: ogni lettura `Banco.fondo` dentro una schermata
 * si riaggancia da sola, e quando arriva lo stile del computer tutta l'app si
 * riveste in un colpo, senza passare un tema di mano in mano. I default sono la
 * veste scura di partenza, per non vedere un lampo bianco prima della risposta.
 */
object Banco {
    // App 2.89.0 (restyling «studio», come il PC 0.95.0): grigi ardesia.
    var fondo by mutableStateOf(Color(0xFF0C0E12))
    var chassis by mutableStateOf(Color(0xFF15171B))
    var chassisAlto by mutableStateOf(Color(0xFF1C1E22))
    var incisione by mutableStateOf(Color(0xFF24262A))
    var testo by mutableStateOf(Color(0xFFE2E4E8))
    var testoQuieto by mutableStateOf(Color(0xFFA0A2A6))
    var accento by mutableStateOf(Color(0xFF4AA3FF))
    var ambra by mutableStateOf(Color(0xFFE0A33C))
    var verde by mutableStateOf(Color(0xFF54C07A))
    /** Già schiarito per AA sul pannello alto (#dc5f5f era 4,0:1): vale prima che arrivi lo stile. */
    var rosso by mutableStateOf(Color(0xFFDC7273))
    /** Il raggio degli angoli, dal token `--raggio` del computer. */
    var raggio by mutableStateOf(6.dp)

    /** Il raggio delle schede e delle bolle: il doppio di quello dei tasti. */
    val raggioGrande: Dp get() = raggio * 2

    /** Il fondo d'accento leggero: la voce scelta, la tua bolla. */
    val accentoTenue: Color get() = accento.copy(alpha = 0.16f)

    /** Indossa la tavolozza arrivata da `/api/stile`. I token mancanti restano
     *  quelli di prima: un computer più vecchio non spoglia l'app. */
    fun applica(s: Stile) {
        val t = s.token
        fun c(chiave: String, ora: Color): Color = t[chiave]?.let { coloreDaToken(it, ora) } ?: ora
        fondo = c("--fondo", fondo)
        chassis = c("--chassis", chassis)
        chassisAlto = c("--chassis-alto", chassisAlto)
        incisione = c("--incisione", incisione)
        testo = c("--testo", testo)
        testoQuieto = c("--testo-quieto", testoQuieto)
        accento = c("--accento", accento)
        ambra = c("--ambra", ambra)
        verde = c("--verde", verde)
        rosso = c("--rosso", rosso)
        t["--raggio"]?.let { dpDaToken(it) }?.let { raggio = it }
        // Col chiarore al massimo il grigio quieto sui pannelli alti scende a
        // 4,4:1 e il rosso a 3,8:1: si schiariscono quanto basta per AA.
        testoQuieto = Color(Contrasto.almenoAA(testoQuieto.argb(), chassisAlto.argb(), testo.argb()))
        rosso = Color(Contrasto.almenoAA(rosso.argb(), chassisAlto.argb(), testo.argb()))
    }
}

/** `#rrggbb` → Color; `transparent` → il colore di prima con alpha 0. Qualunque
 *  altra forma non tocca niente. */
private fun coloreDaToken(valore: String, ripiego: Color): Color {
    val v = valore.trim()
    if (v.equals("transparent", ignoreCase = true)) return Color.Transparent
    if (v.startsWith("#") && v.length == 7) {
        val n = v.substring(1).toLongOrNull(16) ?: return ripiego
        return Color(0xFF000000 or n)
    }
    return ripiego
}

/** `"2px"` → `2.dp`. */
private fun dpDaToken(valore: String): Dp? =
    valore.trim().removeSuffix("px").trim().toFloatOrNull()?.dp

/**
 * Il contrasto WCAG (0.83.0): sui tasti pieni il bianco fisso era sotto AA
 * (2,6:1 sull'accento, 2,2:1 sull'ambra). Il testo sopra un colore pieno è
 * quello, fra fondo e testo del banco, che si legge meglio: con la veste
 * chiara del PC si gira da solo.
 */
object Contrasto {
    private fun canale(c: Int): Double {
        val s = c / 255.0
        return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
    }

    /** La luminanza relativa di un colore `0xAARRGGBB`. */
    fun luminanza(argb: Long): Double {
        val r = canale(((argb shr 16) and 0xFF).toInt())
        val g = canale(((argb shr 8) and 0xFF).toInt())
        val b = canale((argb and 0xFF).toInt())
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /** Il rapporto di contrasto, da 1 a 21. */
    fun rapporto(a: Long, b: Long): Double {
        val x = luminanza(a)
        val y = luminanza(b)
        return (maxOf(x, y) + 0.05) / (minOf(x, y) + 0.05)
    }

    /**
     * Il colore, avvicinato a `verso` a passi del 5 % finché sul fondo non arriva
     * a 4,5:1 (AA per il testo normale). Se lo è già, resta com'è.
     */
    fun almenoAA(colore: Long, fondo: Long, verso: Long): Long {
        var c = colore
        var t = 0.0
        while (rapporto(c, fondo) < 4.5 && t < 1.0) {
            t += 0.05
            fun mix(sh: Int): Long {
                val a = (colore shr sh) and 0xFF
                val b = (verso shr sh) and 0xFF
                return (a + ((b - a) * t)).toLong().coerceIn(0, 255) shl sh
            }
            c = 0xFF000000L or mix(16) or mix(8) or mix(0)
        }
        return c
    }

    /** Fra i candidati, quello che sul fondo si legge meglio. */
    fun migliore(fondo: Long, vararg candidati: Long): Long = candidati.maxBy { rapporto(it, fondo) }
}

internal fun Color.argb(): Long = toArgb().toLong() and 0xFFFFFFFFL

/** Il testo sopra un colore pieno: fondo o testo del banco, quello col contrasto più alto. */
fun sopra(pieno: Color): Color =
    Color(Contrasto.migliore(pieno.argb(), Banco.fondo.argb(), Banco.testo.argb()))

@Composable
fun TemaSierraDeck(content: @Composable () -> Unit) {
    // Legge lo stato del Banco: quando cambia (stile dal computer), lo schema e le
    // forme si ricalcolano e tutta l'app si riveste.
    val schema = darkColorScheme(
        primary = Banco.accento,
        onPrimary = sopra(Banco.accento),
        secondary = Banco.ambra,
        onSecondary = sopra(Banco.ambra),
        tertiary = Banco.verde,
        onTertiary = sopra(Banco.verde),
        background = Banco.fondo,
        onBackground = Banco.testo,
        surface = Banco.chassis,
        onSurface = Banco.testo,
        surfaceVariant = Banco.chassisAlto,
        surfaceContainer = Banco.chassis,
        surfaceContainerHigh = Banco.chassisAlto,
        surfaceContainerHighest = Banco.chassisAlto,
        surfaceContainerLow = Banco.chassis,
        surfaceContainerLowest = Banco.fondo,
        primaryContainer = Banco.accentoTenue,
        onPrimaryContainer = Banco.testo,
        secondaryContainer = Banco.accentoTenue,
        onSecondaryContainer = Banco.testo,
        onSurfaceVariant = Banco.testoQuieto,
        outline = Banco.incisione,
        outlineVariant = Banco.incisione,
        error = Banco.rosso,
        onError = sopra(Banco.rosso)
    )
    // App 2.89.0: tasti e campi con il raggio del PC, schede e finestre col doppio,
    // fogli e dialoghi col triplo — angoli morbidi, come il PC 0.95.0.
    val r = RoundedCornerShape(Banco.raggio)
    val grande = RoundedCornerShape(Banco.raggioGrande)
    val forme = Shapes(extraSmall = r, small = r, medium = grande, large = grande, extraLarge = RoundedCornerShape(Banco.raggio * 3))

    MaterialTheme(
        colorScheme = schema,
        shapes = forme,
        typography = tipografia(),
        content = content
    )
}

/**
 * Una scala di testo sola (app 2.89.0): titoli un filo più pesanti e stretti,
 * corpo a 15 sp con interlinea comoda; niente sotto i 14 sp (app nuova, 11/11). Prima era la
 * `Typography()` di Material senza ritocchi.
 */
private fun tipografia(): Typography {
    val base = Typography()
    fun TextStyle.con(dim: Int, peso: FontWeight, interlinea: Int, spazio: Double = 0.0) =
        copy(fontSize = dim.sp, fontWeight = peso, lineHeight = interlinea.sp, letterSpacing = spazio.sp)
    return base.copy(
        headlineSmall = base.headlineSmall.con(22, FontWeight.SemiBold, 28, -0.2),
        titleLarge = base.titleLarge.con(20, FontWeight.SemiBold, 26, -0.1),
        titleMedium = base.titleMedium.con(16, FontWeight.SemiBold, 22),
        titleSmall = base.titleSmall.con(14, FontWeight.SemiBold, 20),
        bodyLarge = base.bodyLarge.con(15, FontWeight.Normal, 22),
        bodyMedium = base.bodyMedium.con(14, FontWeight.Normal, 20),
        bodySmall = base.bodySmall.con(14, FontWeight.Normal, 20),
        labelLarge = base.labelLarge.con(14, FontWeight.Medium, 20),
        labelMedium = base.labelMedium.con(14, FontWeight.Medium, 20),
        labelSmall = base.labelSmall.con(14, FontWeight.Medium, 18, 0.1)
    )
}

/**
 * Il carattere a spaziatura fissa dei terminali e del codice (0.43.0, app
 * 2.46.0): JetBrains Mono, dentro l'APK (licenza SIL OFL 1.1, in
 * `assets/licenze/JetBrainsMono-OFL.txt`). Quello di sistema non ha i
 * caratteri di cornice e i blocchi di Claude Code (`╭ ▄ █`): Android li
 * prendeva da un carattere proporzionale e nella griglia le colonne
 * slittavano.
 */
val FontTerminale = androidx.compose.ui.text.font.FontFamily(
    androidx.compose.ui.text.font.Font(R.font.jetbrains_mono, androidx.compose.ui.text.font.FontWeight.Normal),
    androidx.compose.ui.text.font.Font(R.font.jetbrains_mono_bold, androidx.compose.ui.text.font.FontWeight.Bold)
)
