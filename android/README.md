# GREVIN AI — Native Android Application (Kotlin + Jetpack Compose)

This directory contains the complete native Android port of the GREVIN AI Institutional Trading Signals, Volume Profile, and Smart Money Concepts platform.

## Architecture & Module Structure

- **`model/`**: Pure Kotlin data models (`Candle`, `VolumeProfile`, `TradingSignal`, `SymbolInfo`, `MarketSessionType`, `SetupGrade`, `NotificationControls`).
- **`engine/VolumeProfileEngine.kt`**: Point of Control (POC) calculation, 70% Value Area (VAH & VAL) expansion algorithm, labeled strictly as `APPROXIMATE (tick volume)`.
- **`engine/MarketSessionEngine.kt`**: Asian, London, New York, and London/NY Overlap session clocks with UK/US Daylight Saving Time (BST/EDT) calculations and live countdowns.
- **`engine/MarketStructureEngine.kt`**: Fractal swing high/low detection, Break of Structure (BOS), and Change of Character (CHoCH).
- **`engine/SetupEngine.kt`**: The 3 institutional strategies:
  1. `POC_BOUNCE`: Uses previous session POC, requires prior close outside Value Area.
  2. `VALUE_AREA_REVERSAL`: Move beyond VAH/VAL with candle body closing back inside.
  3. `CONFIRMED_BREAKOUT`: Breakout beyond VAH/VAL, pullback <= 50% VA height, confirmed BOS.
  - Strict single 2R take-profit target (`rMultiple = 2.0`).
  - Institutional Setup Grade checklist (Grade A, B, or C).
- **`engine/RiskEngine.kt`**: Dynamic position sizing taking pip value and contract size from cTrader symbol specs with safe fallback when specs are unavailable.
- **`engine/VerificationEngine.kt`**: All 8 institutional unit tests in Kotlin.
- **`notifications/`**: `GrevinNotificationManager` & `GrevinFirebaseMessagingService` for native FCM push notifications when the app is closed or in background.
- **`ui/`**: Jetpack Compose UI with dark institutional fintech design (`#050811`, `#0B0F19`, cyan, amber, emerald highlights).

## Building & Installing the Native Android App

### Option 1: Android Studio
1. Open Android Studio.
2. Select **Open an Existing Project** and choose the `android/` folder.
3. Allow Gradle to sync.
4. Connect an Android device (USB Debugging enabled) or start an emulator.
5. Click **Run 'app'** (`Shift + F10`) or build APK via **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

### Option 2: Command Line (Gradle)
```bash
cd android
./gradlew assembleDebug
```
The resulting debug APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

To install directly to a connected Android phone:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
