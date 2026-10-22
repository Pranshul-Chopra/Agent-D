# Agent-D — Desktop Release Workflow & Packaging Specification

> **Target Version:** `0.1.0`  
> **Target Platform:** Windows 10 / 11 (x64)  
> **Binary Types:** NSIS Interactive Setup Wizard (`Agent-D-Setup-0.1.0.exe`) & Standalone Portable Executable (`Agent-D-Portable-0.1.0.exe`)  
> **Security Baseline:** Hardware-bound AES-256-GCM encryption, 32-byte launch bearer token, zero cloud PII leakage.

---

## 1. Release Philosophy & Medical Data Integrity

Agent-D is an intelligent, local-first conversational clinical workstation designed for attending physicians. Unlike standard consumer applications, releasing an update to clinical workstation software carries critical data preservation responsibilities:

1. **Non-Destructive Installations:** Installing an update, repairing an installation, or migrating across minor/patch releases must **never modify, purge, or overwrite** the physician's local clinical database (`%LOCALAPPDATA%\AgentD\context.db` or `%LOCALAPPDATA%\AgentD\config.db`).
2. **Deterministic Cryptographic Key Retention:** The cryptographic derivation salt (`.key_salt`) and PBKDF2 configuration must remain preserved across updates so that historical encrypted patient records remain decryptable.
3. **Strict Version Parity:** The version string (`0.1.0`) must be strictly synchronized across all manifests:
   - `electron/package.json` (`version`)
   - `version.json` (`version`)
   - `main.py`
   - `electron/src/data/whatsNewData.ts`
   - `CHANGELOG.md`
   - `README.md`
4. **Zero Cloud PII Leakage:** Build pipelines must enforce that all automated regression suites (`test_m1` through `test_m5`) pass before packaging, certifying that only de-identified cryptographic aliases (`PT-XXXX`) ever reach LLM prompt layers.

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
│  │  - release/Agent-D-Setup-0.1.0.exe (NSIS Setup Wizard with shortcuts)    │  │
│  │  - release/Agent-D-Portable-0.1.0.exe (Standalone Portable)             │  │
│  │  - release/latest.yml (Auto-update feed manifest)                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Pre-Flight Verification Checklist

Before triggering a release build, verify that the following steps pass:

### 3.1 Run Complete Backend Regression Test Suite
Run the 5 sequential milestone test suites to guarantee database integrity, security boundaries, and tool safety:

```powershell
# Milestone 1: Cryptographic vault, bearer tokens, AES-256-GCM encryption at rest
python test_m1.py

# Milestone 2: Patient context artifacts, immutable version snapshots, visual diffs
python test_m2.py

# Milestones 3, 4, 5: Conversational command center, proposals safety gate, visits lifecycle, multi-key gateway
python -m unittest test_m3.py test_m4.py test_m5.py
```
*Expected Result:* All tests must pass with **0 errors and 0 failures**.

### 3.2 Verify Clean Git Tree
Ensure all feature branches are merged and working tree is clean:
```powershell
git status
```

### 3.3 Verify Version Manifest Consistency
Ensure version `0.1.0` matches across:
- `electron/package.json`: `"version": "0.1.0"`
- `version.json`: `{"version": "0.1.0", "build_date": "YYYY-MM-DD"}`
- `CHANGELOG.md`: Current release documented under `## [0.1.0]`

---

## 4. Step-by-Step Production Build Pipeline

The complete release build can be executed locally using the automated build script [`build.bat`](file:///c:/Users/Pranshul%20Chopra/OneDrive/Desktop/Agent-D/build.bat) or step-by-step:

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
- `Agent-D-Setup-0.1.0.exe` (NSIS Setup Wizard with desktop & start menu shortcuts)
- `Agent-D-Portable-0.1.0.exe` (Standalone Portable Executable)
- `latest.yml` (Auto-updater differential manifest)

---

## 5. One-Click Automated Local Build

To execute all build steps in a single automated command:
```powershell
# Full release build (NSIS Installer + Portable):
.\build.bat

# Fast unpacked directory build (for testing):
.\build.bat --dir

# Fast re-package skipping PyInstaller (if backend was already compiled):
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
   git commit -m "Release v0.1.0: Complete Clinical Workstation"
   git push origin master
   ```

2. Create an annotated release tag:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0: Clinical Consultation Workstation"
   ```

3. Push the tag to GitHub:
   ```bash
   git push origin v0.1.0
   ```

4. The GitHub Actions runner will automatically:
   - Check out code and set up Python 3.13 + Node.js 20 on a `windows-latest` runner.
   - Run the 5 regression test suites (`test_m1` through `test_m5`).
   - Compile the React SPA bundle with Vite.
   - Freeze the Flask backend with PyInstaller.
   - Run `electron-builder` with `GITHUB_TOKEN` to create the GitHub Release, upload `Agent-D-Setup-0.1.0.exe`, `Agent-D-Portable-0.1.0.exe`, and publish `latest.yml`.

---

## 8. Auto-Update Delivery Architecture

Agent-D includes native background update checking powered by `electron-updater`:

- **NSIS Installed Installations:**
  - Upon startup, Electron checks `https://github.com/Pranshul-Chopra/Agent-D/releases/latest`.
  - If a newer version is found, it silently downloads the differential update in the background.
  - When finished, a non-intrusive toast notification (`UpdaterToast.tsx`) prompts the physician: *"Update Ready: Restart to apply update."*
  - Clicking restart cleanly terminates the local Flask backend first to release all database file locks, then triggers `autoUpdater.quitAndInstall()`.
- **Portable Executables:**
  - Portable mode (`Agent-D-Portable-0.1.0.exe`) does not perform silent in-place overwrite.
  - Instead, the app detects portable mode and displays a direct download button pointing to the GitHub Release tag page.

---

## 9. Rollback & Emergency Hotfix Protocol

In the event of an unexpected critical bug or regression in a release:

1. **Hotfix Branch Creation:**
   ```bash
   git checkout -b hotfix/0.1.1 v0.1.0
   ```
2. **Apply Minimal Fix:**
   - Modify the specific affected file.
   - Add a unit test verifying the bug fix.
   - Bump version to `0.1.1` across manifests.
3. **Verify Regression Suite:**
   ```powershell
   python -m unittest test_m3.py test_m4.py test_m5.py
   ```
4. **Deploy Hotfix:**
   ```bash
   git commit -am "hotfix: resolve encounter notes lock on close"
   git tag -a v0.1.1 -m "Hotfix v0.1.1"
   git push origin v0.1.1
   ```
5. **Immediate Client Upgrade:**
   - The auto-updater detects `v0.1.1` and delivers the patch to all connected physician workstations within the 60-minute background poll cycle.
