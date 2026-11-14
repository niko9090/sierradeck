package it.ferrariconsulenze.sierradeck

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MenuDefaults
import androidx.compose.ui.unit.dp
import it.ferrariconsulenze.sierradeck.schermate.tema.coloriVoceMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import it.ferrariconsulenze.sierradeck.schermate.tema.spentoSuTasto
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onLast
import com.github.takahirom.roborazzi.captureRoboImage
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.Contrasto
import it.ferrariconsulenze.sierradeck.schermate.tema.TemaSierraDeck
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Le foto dei menu a tendina e dei dialoghi, in tema scuro e chiaro
 * (`build/foto-schermate/menu-*.png`), e il contrasto 4,5:1 dei colori che
 * usano: voce, voce spenta, tasto testo, tasto pieno.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], application = Application::class, qualifiers = "w400dp-h860dp-xhdpi")
class FotoMenuTest {
    @get:Rule val regola = createComposeRule()

    private fun foto(nome: String, chiara: Boolean, cosa: @Composable () -> Unit) {
        val prima = BancoSalvato.prendi()
        if (chiara) BancoSalvato.indossaChiara()
        try {
            regola.setContent { TemaSierraDeck { Surface(Modifier.fillMaxSize(), color = Banco.fondo) { cosa() } } }
            regola.waitForIdle()
            regola.onAllNodes(isRoot()).onLast().captureRoboImage("build/foto-schermate/menu-$nome-${if (chiara) "chiaro" else "scuro"}.png")
        } finally { BancoSalvato.rimetti(prima) }
    }

    @Composable private fun Tendina() {
        // Il popup vero è una finestra che Robolectric non fotografa: qui le stesse
        // voci (DropdownMenuItem) sul fondo che il menu usa (MenuDefaults.containerColor).
        Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopStart) {
            Surface(color = MenuDefaults.containerColor, shape = MaterialTheme.shapes.extraSmall, shadowElevation = 3.dp) {
                Column(Modifier.padding(vertical = 8.dp)) {
                    DropdownMenuItem(text = { Text("Quaderno") }, onClick = {})
                    DropdownMenuItem(text = { Text("Pagina dei dolci") }, onClick = {})
                    DropdownMenuItem(text = { Text("Nessuna chat in questo workspace") }, onClick = {}, enabled = false, colors = coloriVoceMenu())
                }
            }
        }
    }

    @Composable private fun Dialogo() {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Chiudere «Prove del meteo»?") },
            text = { Text("Il lavoro salvato resta; la chat si riapre dal PC.") },
            confirmButton = { Button(onClick = {}) { Text("Chiudi") } },
            dismissButton = { TextButton(onClick = {}) { Text("Annulla") } }
        )
    }

    @Test fun tendinaScuro() = foto("tendina", false) { Tendina() }
    @Test fun tendinaChiaro() = foto("tendina", true) { Tendina() }
    @Test fun dialogoScuro() = foto("dialogo", false) { Dialogo() }
    @Test fun dialogoChiaro() = foto("dialogo", true) { Dialogo() }

    private fun misura(chiara: Boolean, f: (androidx.compose.material3.ColorScheme) -> Unit) {
        val prima = BancoSalvato.prendi()
        if (chiara) BancoSalvato.indossaChiara()
        try {
            regola.setContent { TemaSierraDeck { f(MaterialTheme.colorScheme) } }
            regola.waitForIdle()
        } finally { BancoSalvato.rimetti(prima) }
    }

    private fun controlla(chiara: Boolean) = misura(chiara) { s ->
        fun r(a: androidx.compose.ui.graphics.Color, b: androidx.compose.ui.graphics.Color) =
            Contrasto.rapporto(a.toArgb().toLong() and 0xFFFFFFFFL, b.toArgb().toLong() and 0xFFFFFFFFL)
        val fondiMenu = listOf(s.surfaceContainer, s.surfaceContainerHigh, s.surface)
        for (f in fondiMenu) {
            assertTrue("voce %.2f".format(r(s.onSurface, f)), r(s.onSurface, f) >= 4.5)
            assertTrue("sottotitolo %.2f".format(r(s.onSurfaceVariant, f)), r(s.onSurfaceVariant, f) >= 4.5)
            assertTrue("tasto testo %.2f".format(r(s.primary, f)), r(s.primary, f) >= 4.5)
            // La voce spenta di un menu: il grigio quieto del banco (non il 38 % del Material).
            assertTrue("voce spenta %.2f".format(r(Banco.testoQuieto, f)), r(Banco.testoQuieto, f) >= 4.5)
        }
        // Il tasto pieno spento: testo sul solco.
        assertTrue("tasto spento %.2f".format(r(spentoSuTasto(), Banco.incisione)), r(spentoSuTasto(), Banco.incisione) >= 4.5)
        assertTrue("tasto pieno %.2f".format(r(s.onPrimary, s.primary)), r(s.onPrimary, s.primary) >= 4.5)
    }

    @Test fun contrastoScuro() = controlla(false)
    @Test fun contrastoChiaro() = controlla(true)
}
