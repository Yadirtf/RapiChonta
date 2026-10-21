# Reglas de R8 para el APK de release (el workflow "App Android" copia este archivo a android/app/,
# donde el plugin de Flutter lo agrega solo).

# Huawei Push Kit (HMS Core): las clases se cargan por reflexión y el SDK referencia módulos opcionales
# (HiAnalytics, actualizador de HMS Core, APIs propias de EMUI, BouncyCastle) que no vienen en el APK.
-keepattributes *Annotation*,Exceptions,InnerClasses,Signature,SourceFile,LineNumberTable
-keep class com.huawei.hms.** { *; }
-keep class com.huawei.agconnect.** { *; }
-keep class com.huawei.updatesdk.** { *; }
-keep class com.hianalytics.android.** { *; }
-dontwarn com.huawei.android.os.**
-dontwarn com.huawei.hianalytics.**
-dontwarn com.huawei.hms.availableupdate.**
-dontwarn com.huawei.libcore.io.**
-dontwarn org.bouncycastle.**
