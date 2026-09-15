# Lumen Scanner

Lumen is a privacy-focused document scanner for Android and the web. It captures or imports pages, detects document edges, corrects perspective, enhances readability, and exports clean images or multi-page PDFs.

All scan processing happens on the device. The Android app does not request internet access and does not require an account.

## Features

- Capture pages with the device camera
- Import one or more photos
- Import PDFs with up to 30 pages
- Automatic document-edge detection
- Manual crop and perspective adjustment
- Enhance, black-and-white, grayscale, and photo filters
- Rotate, reorder, and remove pages
- Recover an unfinished document from local storage
- Export or share a multi-page PDF
- Save individual page images
- Offline Android runtime with packaged fonts and assets

## Technology

- React 19 and TypeScript
- Vite and TanStack Router/Start
- Zustand for scanner state
- Canvas-based image processing
- `pdf-lib` and `pdfjs-dist`
- Native Android WebView wrapper written in Java
- Android API 36 target
- GitHub Actions for CI and signed release bundles

## Repository layout

```text
.
├── .github/workflows/          CI and Android release workflows
├── grok-workspace/
│   ├── android/                Native Android wrapper
│   ├── native/                 Android WebView entry point
│   ├── src/components/scanner/ Scanner interface
│   ├── src/lib/scan/           Detection, geometry, filters, PDF, and persistence
│   ├── scripts/                Tests, builds, and browser smoke checks
│   └── package.json
└── gradlew / gradlew.bat       Root Android Gradle wrapper
```

## Requirements

- Node.js 22
- Java 17 or newer supported by Gradle 9.6
- Android SDK Platform 36
- Android Studio for emulator or device testing

## Web development

```bash
cd grok-workspace
npm ci
npm run dev
```

The development server listens on port `8080`.

Useful commands:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run build:native
npm run test:e2e -- http://127.0.0.1:8080/
```

The end-to-end test expects the development server to be running. It exercises camera startup, image import, crop adjustment, draft recovery, and multi-page PDF import.

## Android development

From the repository root:

```bash
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

On Windows:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

The Android build automatically creates the native web bundle before packaging the app. The debug APK is generated under:

```text
grok-workspace/android/app/build/outputs/apk/debug/
```

## Release signing

Release builds intentionally fail when signing is not configured. Set these variables in a private environment:

```text
LUMEN_KEYSTORE_FILE   Absolute path to the upload keystore
LUMEN_KEYSTORE_PASS   Keystore password
LUMEN_KEY_ALIAS       Key alias; defaults to lumen
LUMEN_KEY_PASS        Key password
```

Then build the Play Store bundle:

```bash
./gradlew :app:bundleRelease
```

The resulting AAB is written under:

```text
grok-workspace/android/app/build/outputs/bundle/release/
```

Never commit a keystore, passwords, or generated release artifacts.

## GitHub release workflow

The manual **Android release bundle** workflow can build a signed AAB without storing the decoded keystore in the repository. Configure these GitHub Actions secrets:

- `LUMEN_KEYSTORE_BASE64`
- `LUMEN_KEYSTORE_PASS`
- `LUMEN_KEY_ALIAS` (optional)
- `LUMEN_KEY_PASS`

Run the workflow from the repository's **Actions** tab. The signed AAB is uploaded as an artifact with seven-day retention.

## Privacy and security

The Android application:

- Does not request `INTERNET` or network-state permissions
- Disables cleartext traffic and application backups
- Restricts WebView navigation and native messages to the packaged application origin
- Disables direct file access in the WebView
- Uses a strict Content Security Policy
- Limits imported document sizes, page counts, and native transfer sizes
- Stores unfinished scans locally on the device

The public privacy policy is available from the app's `/privacy` route. Replace the placeholder URL in `grok-workspace/artifacts/lumen-android/PLAY-STORE.txt` after deploying the website.

## Current release status

The codebase builds and tests successfully against Android API 36. Before a Google Play testing release, complete physical-device testing, configure the upload key, publish the privacy-policy URL, and run the signed release workflow.

## License

No open-source license has been selected yet. Until one is added, all rights are reserved.
