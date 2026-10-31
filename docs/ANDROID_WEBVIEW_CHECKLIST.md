# Android Studio checklist (separate project; not modified by this update)

Site origin to trust: `https://rahimanshaik159-ui.github.io` (served under `/Haunters_game/`).

## 1. Manifest
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```
Both are needed on Android 12+: the user may grant only "Approximate" if COARSE is the only one granted or they choose it in the dialog. A WebView app should request FINE + COARSE together and check that **Precise** was granted.

## 2. Runtime permission (Activity)
Request `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` before loading the game, e.g. with `registerForActivityResult(RequestMultiplePermissions())`. After the result, check `ContextCompat.checkSelfPermission(..., ACCESS_FINE_LOCATION) == GRANTED`; if only coarse was granted, show a message asking for Precise location (Settings -> Apps -> HAUNTERS -> Permissions -> Location -> "Use precise location").

## 3. WebView settings
```kotlin
webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true
    setGeolocationEnabled(true)
}
```
(`setGeolocationDatabasePath` is deprecated and unnecessary on modern Android.)

## 4. Geolocation prompt: grant only to your origin
```kotlin
private val allowedOrigin = "https://rahimanshaik159-ui.github.io"

webView.webChromeClient = object : WebChromeClient() {
    override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
        val fineOk = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val originOk = origin.trimEnd('/') == allowedOrigin
        // allow = true only for YOUR https origin AND when the OS permission is granted; retain = false so it is re-checked each time
        callback.invoke(origin, originOk && fineOk, false)
    }
}
```
Never call `callback.invoke(origin, true, true)` unconditionally; that grants location to any page the WebView loads.

## 5. Keep navigation on your origin
In `WebViewClient.shouldOverrideUrlLoading`, open any URL whose origin differs from `allowedOrigin` in the external browser (Intent) instead of the WebView.

## 6. Device settings to test on the Vivo Y200e 5G
Location ON -> Mode/Google Location Accuracy ON (High accuracy) -> app permission "Precise location" ON -> battery optimisation for the app set to "Unrestricted"/"No restrictions" (Vivo's *Background power consumption* and *High background power consumption* lists can suspend location) -> test outdoors with open sky, wait 30-60 s for a fix.

## 7. Foreground behaviour
Geolocation in a WebView stops or throttles when the app is backgrounded or the screen is off. The website shows "GPS signal lost" and recovers when the app returns to the foreground. Background tracking would need a native foreground service, which is outside this website.
