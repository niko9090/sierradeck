// I plugin si dichiarano qui e si applicano nel modulo: è la forma che Gradle
// si aspetta, e tenerli allineati in un posto solo evita che due moduli
// finiscano su versioni diverse dello stesso strumento.
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
