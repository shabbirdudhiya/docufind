# DocuFind - Publishing & Release Guide

Complete guide to build and publish DocuFind for Windows and macOS.

## Table of Contents

1. [Quick Start (Recommended)](#quick-start-recommended)
2. [Manual Building](#manual-building)
3. [GitHub Actions Setup (Automated)](#github-actions-setup-automated)
4. [Code Signing](#code-signing)
5. [Auto-Update System](#auto-update-system)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start (Recommended)

The easiest way to publish is using GitHub Actions. Here's how:

### Step 1: Set Up GitHub Secrets

1. Go to your GitHub repo: `https://github.com/shabbirdudhiya/docufind`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   | Secret Name                          | Value                                            |
   | ------------------------------------ | ------------------------------------------------ |
   | `TAURI_SIGNING_PRIVATE_KEY`          | Contents of `C:\Users\shabb\.tauri\docufind.key` |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set when generating the key     |

   **To get the key contents:**

   ```powershell
   Get-Content "$env:USERPROFILE\.tauri\docufind.key" -Raw | Set-Clipboard
   # Now paste into GitHub Secrets
   ```

### Step 2: Update Version

Edit `src-tauri/tauri.conf.json`:

```json
"version": "1.0.0"
```

Also update `package.json`:

```json
"version": "1.0.0"
```

### Step 3: Create a Release

```powershell
# Commit your changes
git add .
git commit -m "Release v1.0.0"

# Create and push a tag
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

### Step 4: Wait for Build

1. Go to **Actions** tab in your GitHub repo
2. Watch the "Release" workflow run
3. Once complete, go to **Releases**
4. Find your draft release with all platform builds attached
5. Edit the release notes and click **Publish release**

**That's it!** Your app is now available for download with:

- ✅ Windows (64-bit): `.exe` installer
- ✅ macOS (Intel): `.dmg`
- ✅ macOS (Apple Silicon): `.dmg`
- ✅ Linux: `.deb` and `.AppImage`

---

## Manual Building

### Prerequisites

- [Rust](https://rustup.rs/) installed
- [Node.js](https://nodejs.org/) 18+ installed
- For macOS: Xcode Command Line Tools (`xcode-select --install`)

### Building for Windows

```powershell
cd C:\Personal_Data\Code_Projects\JS\docufind-tauri

# Set signing keys (required for auto-update)
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\docufind.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password"

# Build
npm run tauri build
```

**Output files** in `src-tauri/target/release/bundle/`:

```
nsis/
├── DocuFind_1.0.0_x64-setup.exe       # Main installer (share this)
├── DocuFind_1.0.0_x64-setup.nsis.zip  # For auto-update
└── DocuFind_1.0.0_x64-setup.nsis.zip.sig  # Signature
```

### Building for macOS

On a Mac (required for macOS builds):

```bash
cd /path/to/docufind-tauri

# Set signing keys
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/docufind.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"

# Build for Apple Silicon (M1/M2/M3)
npm run tauri build -- --target aarch64-apple-darwin

# Build for Intel Macs
npm run tauri build -- --target x86_64-apple-darwin
```

**Output files** in `src-tauri/target/{arch}/release/bundle/`:

```
dmg/
├── DocuFind_1.0.0_aarch64.dmg  # For Apple Silicon
└── DocuFind_1.0.0_x64.dmg      # For Intel
macos/
└── DocuFind.app.tar.gz         # For auto-update
```

### Building for Linux

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

# Set signing keys
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/docufind.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"

# Build
npm run tauri build
```

---

## GitHub Actions Setup (Automated)

The workflow file is already set up at `.github/workflows/release.yml`. It will:

1. Build for Windows, macOS (both Intel and Apple Silicon), and Linux
2. Sign all builds with your Tauri key
3. Create a draft GitHub release with all artifacts
4. Generate `latest.json` for auto-updates

### Workflow Triggers

The workflow runs when you push a tag starting with `v`:

```bash
git tag v1.0.1
git push origin v1.0.1
```

### Required Secrets

| Secret                               | Description                      |
| ------------------------------------ | -------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Your private key contents        |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password                     |
| `GITHUB_TOKEN`                       | Automatically provided by GitHub |

### Optional: macOS Code Signing

For notarized macOS builds (removes "unidentified developer" warning):

1. Join Apple Developer Program ($99/year)
2. Create certificates in Apple Developer portal
3. Add these secrets:
   - `APPLE_CERTIFICATE`: Base64 encoded .p12 certificate
   - `APPLE_CERTIFICATE_PASSWORD`: Certificate password
   - `APPLE_SIGNING_IDENTITY`: e.g., "Developer ID Application: Your Name"
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your team ID

---

## Code Signing

### Tauri Update Signing (Required)

Your signing keys are already set up:

- **Private Key:** `C:\Users\shabb\.tauri\docufind.key`
- **Public Key:** Configured in `tauri.conf.json`

⚠️ **IMPORTANT:** Keep your private key safe! If you lose it, you cannot push updates to existing installations.

### Windows Code Signing (Optional)

Without code signing, users will see SmartScreen warnings. Options:

#### Option A: Self-Signed (Free, Internal Use)

```powershell
# Run as Administrator
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=DocuFind" `
  -KeyUsage DigitalSignature `
  -FriendlyName "DocuFind Code Signing" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

# Export to PFX
$password = ConvertTo-SecureString -String "YourPassword" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "docufind-cert.pfx" -Password $password
```

#### Option B: Trusted Certificate (Paid, Public Distribution)

Purchase from DigiCert, Sectigo, or GlobalSign (~$200-500/year for OV certificates).

### macOS Code Signing (Optional)

Without signing, users must right-click → Open to bypass Gatekeeper. For proper distribution:

1. Join Apple Developer Program ($99/year)
2. Create a "Developer ID Application" certificate
3. Notarize your app with Apple

---

## Auto-Update System

### How It Works

1. App checks `https://github.com/shabbirdudhiya/docufind/releases/latest/download/latest.json`
2. Compares current version with latest
3. If newer version found, prompts user to update
4. Downloads and installs update automatically
5. Verifies signature before installing

### Testing Auto-Update

1. Build and install version `1.0.0`
2. Update version to `1.0.1` in config files
3. Build again and create a GitHub release
4. Run the installed `1.0.0` app
5. It should detect and offer the update

### Manual Release for Auto-Update

If not using GitHub Actions, upload these files to your release:

```
DocuFind_1.0.1_x64-setup.exe          # Windows installer
DocuFind_1.0.1_x64-setup.nsis.zip     # Windows update bundle
DocuFind_1.0.1_x64-setup.nsis.zip.sig # Windows signature
DocuFind_1.0.1_aarch64.dmg            # macOS ARM installer
DocuFind.app.tar.gz                    # macOS update bundle
DocuFind.app.tar.gz.sig               # macOS signature
latest.json                            # Update manifest (auto-generated)
```

---

## Troubleshooting

### Windows SmartScreen Warning

**Problem:** "Windows protected your PC" message  
**Solution:**

- Users can click "More info" → "Run anyway"
- For smoother experience, purchase a code signing certificate
- With an EV certificate, SmartScreen warnings are eliminated immediately

### macOS "Cannot be opened because it is from an unidentified developer"

**Problem:** Gatekeeper blocks the app  
**Solution:**

- Users: Right-click the app → Open → Open
- Developer: Join Apple Developer Program and notarize the app

### Build Fails with "not enough memory"

**Problem:** Tantivy compilation requires ~2GB RAM  
**Solution:**

```powershell
cargo clean
npm run tauri build
```

Or close other applications to free memory.

### Auto-Update Not Working

**Checklist:**

- [ ] `latest.json` is accessible at the update URL
- [ ] Version in `latest.json` is higher than installed version
- [ ] Signature files (`.sig`) are uploaded alongside installers
- [ ] Public key in `tauri.conf.json` matches your private key

### "Invalid signature" Error

**Problem:** Update fails signature verification  
**Solution:** Ensure you use the same key pair for all builds. If you regenerated keys, users must reinstall the app.

### Icon Looks Blurry

**Solution:** Regenerate icons from a high-resolution source:

```powershell
# Convert SVG to high-res PNG first (1024x1024)
npx sharp -i public/icon.svg -o icon_temp.png resize 1024 1024

# Generate all icon sizes
npm run tauri icon icon_temp.png

# Clean up
Remove-Item icon_temp.png
```

---

## Release Checklist

Before each release:

- [ ] Update version in `src-tauri/tauri.conf.json`
- [ ] Update version in `package.json`
- [ ] Test build locally: `npm run tauri build`
- [ ] Commit changes: `git commit -am "Release vX.Y.Z"`
- [ ] Create tag: `git tag vX.Y.Z`
- [ ] Push: `git push origin main && git push origin vX.Y.Z`
- [ ] Wait for GitHub Actions to complete
- [ ] Review and publish the draft release
- [ ] Test auto-update from previous version

---

## File Locations Reference

| File            | Location                                |
| --------------- | --------------------------------------- |
| Private Key     | `C:\Users\shabb\.tauri\docufind.key`    |
| Tauri Config    | `src-tauri/tauri.conf.json`             |
| App Version     | `src-tauri/tauri.conf.json` → `version` |
| Icons           | `src-tauri/icons/`                      |
| Build Output    | `src-tauri/target/release/bundle/`      |
| GitHub Workflow | `.github/workflows/release.yml`         |

---

## Links

- [Tauri v2 Documentation](https://tauri.app/v2/guides/)
- [Tauri Auto-Update Guide](https://tauri.app/v2/guides/distribute/updater/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Your Releases](https://github.com/shabbirdudhiya/docufind/releases)
