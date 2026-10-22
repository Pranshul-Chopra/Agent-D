# Agent-D — Desktop Release Workflow & Packaging Specification

> **Target Version:** `0.3.0`  
> **Target Platform:** Windows 10 / 11 (x64)  
> **Binary Types:** NSIS Smooth One-Click Installer (`Agent-D-Setup-0.3.0.exe`) & Standalone Portable Executable (`Agent-D-Portable-0.3.0.exe`)  
> **Security Baseline:** Hardware-bound AES-256-GCM encryption, 32-byte launch bearer token, zero cloud PII leakage.

---

## 1. Release Philosophy & Governance Policy

Agent-D is an intelligent, local-first conversational clinical workstation designed for attending physicians. Unlike standard consumer applications, releasing an update to clinical workstation software carries critical governance and data preservation responsibilities:

### 1.1 Authorization-First Builds (Never After Every Fix)
- **Explicit Orders Only:** Full production packaging (`build.bat`, PyInstaller freezing, and `electron-builder` compilation) **MUST ONLY be executed upon explicit user permission or direct order**.
- **No Automatic Packaging on Bug Fixes:** Routine bug fixes, styling adjustments, or incremental feature additions must **never** automatically trigger a full desktop build.
- **Development Cycle Protocol:**
  - For code changes and bug fixes, developers/assistants run targeted unit tests (`python -m unittest test_m*.py`) and UI bundle checks (`npm run build:ui` in `electron/`).
  - Full production binaries (~150MB NSIS setup, portable exe, and `latest.yml` auto-update manifest) are heavy artifacts and are compiled only when an intentional release milestone is ordered.

### 1.2 Mandatory Version Bumping on Every Release Build
- **No Duplicate Version Builds:** Every production build execution **MUST include a bumped version** adhering to Semantic Versioning (`MAJOR.MINOR.PATCH`). A build is never generated using an existing or unchanged version tag.
- **Manifest Synchronization:** Before running `build.bat`, the version bump must be propagated synchronously across all project manifests:
  1. `version.json` (`"version": "X.Y.Z"`, `"build_date": "YYYY-MM-DD"`)
  2. `electron/package.json` (`"version": "X.Y.Z"`)
  3. `electron/package-lock.json` (`"version": "X.Y.Z"`)
  4. `build.bat` (Console banner version header)
  5. `routes.py` (`_get_app_version()` fallback string)
  6. `electron/src/data/whatsNewData.ts` (New release object with `isLatest: true`)
  7. `CHANGELOG.md` (Documented under `## [X.Y.Z] — YYYY-MM-DD`)
  8. `README.md` & `RELEASE_WORKFLOW.md`

### 1.3 Medical Data Integrity & Patient Safety
1. **Non-Destructive Installations:** Installing an update, repairing an installation, or migrating across minor/patch releases must **never modify, purge, or overwrite** the physician's local clinical database (`%LOCALAPPDATA%\AgentD\context.db` or `%LOCALAPPDATA%\AgentD\config.db`).
2. **Deterministic Cryptographic Key Retention:** The cryptographic derivation salt (`.key_salt`) and PBKDF2 configuration must remain preserved across updates so that historical encrypted patient records remain decryptable.
3. **Zero Cloud PII Leakage:** Build pipelines must enforce that all automated regression suites pass before packaging, certifying that only de-identified cryptographic aliases (`PT-XXXX`) ever reach LLM prompt layers.

---

## 2. Packaging Architecture

Agent-D combines a high-performance React 19 UI inside an Electron 44 desktop shell with a headless local Python Flask 3 backend service.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Agent-D Release Package                         │
│                                                                        │
│  ┌────────────────────────┐         ┌──────────────────────────────┐  │
│  │   React 19 Frontend    │         │     Flask Backend Engine     │  │
│  │   (Vite SPA Bundle)    │         │  (PyInstaller Headless Exe)  │  │
│  │   - Output: static/spa │         │  - Output: dist/flask/       │  │
│  └───────────┬────────────┘         └──────────────┬───────────────┘  │
│              │                                     │                  │
│              ▼                                     ▼                  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     Electron Native Shell                       │  │
│  │  - main.js (Port handshake, process tree supervision, token)    │  │
│  │  - preload.js (Secure IPC context isolation bridge)             │  │
│  │  - extraResources: dist/flask/ -> resources/flask/              │  │
│  └─────────────────────────────────┬───────────────────────────────┘  │
│                                    │                                  │
│                                    ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                      electron-builder Output                    │  │
│  │  - release/Agent-D-Setup-0.3.0.exe (NSIS Smooth One-Click Installer with shortcuts) │  │
│  │  - release/Agent-D-Portable-0.3.0.exe (Standalone Portable)                         │  │
│  │  - release/latest.yml (Auto-update feed manifest)                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Pre-Flight Verification Checklist

Before triggering an authorized release build, verify that the following steps pass:

### 3.1 Run Complete Backend Regression Test Suite
Run all sequential milestone test suites to guarantee database integrity, security boundaries, and tool safety:

```powershell
# Milestone 1: Cryptographic vault, bearer tokens, AES-256-GCM encryption at rest
python test_m1.py

# Milestone 2: Patient context artifacts, immutable version snapshots, visual diffs
python test_m2.py

# Milestones 3, 4, 5 & 6: Conversational command center, proposals safety gate, visits, multi-key gateway, and CRUD tools
python -m unittest test_m3.py test_m4.py test_m5.py test_m6_actions.py
```
*Expected Result:* All tests must pass with **0 errors and 0 failures**.

### 3.2 Verify Clean Git Tree
Ensure all feature branches are merged and working tree is clean:
```powershell
git status
```

### 3.3 Verify Version Manifest Consistency
Ensure the bumped version (e.g., `0.2.0`) matches across:
- `electron/package.json`: `"version": "0.2.0"`
- `version.json`: `{"version": "0.2.0", "build_date": "YYYY-MM-DD"}`
- `CHANGELOG.md`: Current release documented under `## [0.2.0]`
- `electron/src/data/whatsNewData.ts`: Release highlight entry present.

---

## 4. Production Build Pipeline (Triggered on Permission Only)

When explicitly requested by the user, the release build can be executed locally using the automated build script [`build.bat`](file:///c:/Users/Pranshul%20Chopra/OneDrive/Desktop/Agent-D/build.bat) or step-by-step:

### Step 1: Compile React SPA Frontend
Transpiles React 19 + TypeScript + Tailwind CSS using Vite into production static assets:
```powershell
cd electron
npm run build:ui
cd ..
```
*Output:* `static/spa/index.html` and `static/spa/assets/`

### Step 2: Freeze Python Backend with PyInstaller
Packages the Flask 3 engine, SQLite ORM, cryptography primitives, and clinical tool layers into a standalone headless executable:
```powershell
python -m PyInstaller flask.spec --noconfirm
```
*Output:* `dist/flask/flask.exe` and associated shared libraries/DLLs.

### Step 3: Package Electron Desktop Application
Uses `electron-builder` to bundle the native shell, production SPA, icons, and `dist/flask/` extra resources into release binaries:
```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
cd electron
npm run build
cd ..
```
*Output in `release/`:*
- `Agent-D-Setup-0.3.0.exe` (NSIS Smooth One-Click Installer with desktop & start menu shortcuts, zero wizard pages)
- `Agent-D-Portable-0.3.0.exe` (Standalone Portable Executable)
- `latest.yml` (Auto-updater differential manifest)

---

## 5. Automated Build Commands

To execute the build when authorized:
```powershell
# Full release build (NSIS Installer + Portable):
.\build.bat

# Fast unpacked directory build (for testing):
.\build.bat --dir

# Fast re-package skipping PyInstaller (if backend was already frozen):
.\build.bat --skip-pyinstaller
```

---

## 6. Code Signing Configuration (Production Windows Releases)

For commercial or clinical enterprise deployments, Windows binaries must be digitally signed with an Authenticode certificate to prevent Windows Defender SmartScreen warnings.

### Certificate Environment Variables
Set the following environment variables before running `electron-builder`:
```powershell
# Path to PFX / PKCS#12 certificate file:
$env:CSC_LINK="C:\path\to\code-signing-cert.pfx"

# Password for the PFX certificate:
$env:CSC_KEY_PASSWORD="YourSecureCertificatePassword"

# Or for EV Hardware Tokens / Azure Trusted Signing:
$env:WIN_CSC_LINK="azure-or-hsm-provider"
```

> [!NOTE]
> During local development and testing, `CSC_IDENTITY_AUTO_DISCOVERY="false"` is set by default in `build.bat` to avoid hanging when looking for smart cards or expired developer certificates.

---

## 7. Continuous Integration & CD Pipeline (GitHub Actions)

Agent-D includes a fully automated GitHub Actions workflow at [`.github/workflows/release.yml`](file:///c:/Users/Pranshul%20Chopra/OneDrive/Desktop/Agent-D/.github/workflows/release.yml).

### Triggering a Production Release via Git Tag

1. Commit all verified changes:
   ```bash
   git add -A
   git commit -m "Release v0.2.0: Encounters, Calendar & Slash Commands"
   git push origin master
   ```

2. Create an annotated release tag:
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0: Clinical Encounters & Calendar"
   ```

3. Push the tag to GitHub:
   ```bash
   git push origin v0.2.0
   ```

4. The GitHub Actions runner will automatically:
   - Check out code and set up Python 3.13 + Node.js 20 on a `windows-latest` runner.
   - Run the regression test suites (`test_m1` through `test_m6_actions`).
   - Compile the React SPA bundle with Vite.
   - Freeze the Flask backend with PyInstaller.
   - Run `electron-builder` with `GITHUB_TOKEN` to create the GitHub Release, upload `Agent-D-Setup-0.2.0.exe`, `Agent-D-Portable-0.2.0.exe`, and publish `latest.yml`.

---

## 8. Auto-Update Delivery Architecture

Agent-D includes native background update checking powered by `electron-updater`:

- **NSIS Installed Installations:**
  - Upon startup, Electron checks `https://github.com/Pranshul-Chopra/Agent-D/releases/latest`.
  - If a newer version is found, it silently downloads the differential update in the background.
  - When finished, a non-intrusive toast notification (`UpdaterToast.tsx`) prompts the physician: *"Update Ready: Restart to apply update."*
  - Clicking restart cleanly terminates the local Flask backend first to release all database file locks, then triggers `autoUpdater.quitAndInstall()`.
- **Portable Executables:**
  - Portable mode (`Agent-D-Portable-0.2.0.exe`) does not perform silent in-place overwrite.
  - Instead, the app detects portable mode and displays a direct download button pointing to the GitHub Release tag page.

---

## 9. Rollback & Emergency Hotfix Protocol

In the event of an unexpected critical bug or regression in a release:

1. **Hotfix Branch Creation:**
   ```bash
   git checkout -b hotfix/0.2.1 v0.2.0
   ```
2. **Apply Minimal Fix:**
   - Modify the specific affected file.
   - Add a unit test verifying the bug fix.
   - Bump version to `0.2.1` across manifests.
3. **Verify Regression Suite:**
   ```powershell
   python -m unittest test_m3.py test_m4.py test_m5.py test_m6_actions.py
   ```
4. **Deploy Hotfix (Upon Approval):**
   ```bash
   git commit -am "hotfix: resolve encounter notes lock on close"
   git tag -a v0.2.1 -m "Hotfix v0.2.1"
   git push origin v0.2.1
   ```
5. **Immediate Client Upgrade:**
   - The auto-updater detects `v0.2.1` and delivers the patch to all connected physician workstations within the 60-minute background poll cycle.
