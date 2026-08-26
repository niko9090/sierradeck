// I plugin si dichiarano qui e si applicano nel modulo: è la forma che Gradle
// si aspetta, e tenerli allineati in un posto solo evita che due moduli
// finiscano su versioni diverse dello stesso strumento.
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    // Il compilatore di Compose è un plugin di Kotlin da 2.0 in poi: la versione
    // segue quella di Kotlin, così non divergono mai.
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    // La serializzazione JSON generata a compile time: modelli dell'API tipati,
    // niente parsing a mano di org.json.
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
}
