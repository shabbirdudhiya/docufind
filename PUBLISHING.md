# DocuFind Publishing Guide

This guide will walk you through the process of building and publishing DocuFind for different platforms.

## Prerequisites

Before publishing, ensure you have:

1. **Node.js 18+** installed
2. **npm** package manager
3. All dependencies installed: `npm install`
4. The app builds successfully: `npm run build`

---

## Building for Distribution

### 1. Build the Next.js App

First, build the Next.js application:

```bash
npm run build
```

### 2. Package the Electron App

#### Build for All Platforms (on your current OS)

```bash
npm run dist
```

#### Build for Specific Platforms

```bash
# Windows
npm run dist:win

# macOS (requires macOS)
npm run dist:mac

# Linux
npm run dist:linux
```

### 3. Output Location

Built files will be in the `dist/` folder:

```
dist/
├── DocuFind-Setup-1.0.0.exe          # Windows installer
├── DocuFind-1.0.0-portable.exe       # Windows portable
├── DocuFind-1.0.0.dmg                # macOS disk image
├── DocuFind-1.0.0-mac.zip            # macOS zip
├── DocuFind-1.0.0.AppImage           # Linux AppImage
├── docufind_1.0.0_amd64.deb          # Linux Debian package
└── latest.yml                         # Auto-update manifest
```

---

## Platform-Specific Notes

### Windows

#### Building on Windows

- Use `npm run dist:win` to create:
  - **NSIS installer** (.exe) - Full installation with uninstaller
  - **Portable** (.exe) - No installation required

#### Code Signing (Recommended for Production)

1. Obtain a code signing certificate from a trusted CA
2. Set environment variables:
   ```bash
   set CSC_LINK=path/to/certificate.pfx
   set CSC_KEY_PASSWORD=your-password
   ```
3. Build with signing: `npm run dist:win`

#### Windows Store (Optional)

1. Create a [Microsoft Partner Center](https://partner.microsoft.com/) account
2. Register your app
3. Add MSIX target to `package.json`:
   ```json
   "win": {
     "target": ["nsis", "appx"]
   }
   ```
4. Build and submit via Partner Center

---

### macOS

#### Building on macOS

- Use `npm run dist:mac` to create:
  - **DMG** - Disk image for easy installation
  - **ZIP** - For direct distribution

#### Code Signing (Required for Distribution)

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a Developer ID Application certificate
3. Set environment variables:
   ```bash
   export CSC_LINK=path/to/certificate.p12
   export CSC_KEY_PASSWORD=your-password
   export APPLE_ID=your@email.com
   export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```
4. Build with signing and notarization

#### Mac App Store (Optional)

1. Create an App Store Connect listing
2. Configure `package.json` for MAS build:
   ```json
   "mac": {
     "target": ["dmg", "mas"]
   }
   ```
3. Submit via Transporter or Xcode

---

### Linux

#### Building on Linux

- Use `npm run dist:linux` to create:
  - **AppImage** - Universal Linux format
  - **DEB** - For Debian/Ubuntu
  - **RPM** - For Fedora/CentOS (add to targets)

#### Snap Store (Optional)

1. Create a [Snapcraft](https://snapcraft.io/) account
2. Add snap target:
   ```json
   "linux": {
     "target": ["AppImage", "deb", "snap"]
   }
   ```
3. Build and upload: `snapcraft push dist/docufind_1.0.0_amd64.snap`

#### Flatpak (Optional)

1. Create a Flathub account
2. Create a flatpak manifest
3. Submit to [Flathub](https://flathub.org/)

---

## Distribution Channels

### 1. GitHub Releases (Recommended)

The easiest way to distribute your app:

1. **Create a GitHub Repository**

   ```bash
   git init
   git add .
   git commit -m "Initial release v1.0.0"
   git remote add origin https://github.com/yourusername/docufind.git
   git push -u origin main
   ```

2. **Create a Release**

   - Go to your repository on GitHub
   - Click "Releases" → "Create a new release"
   - Tag version: `v1.0.0`
   - Title: `DocuFind v1.0.0`
   - Add release notes
   - Upload all files from `dist/` folder
   - Publish release

3. **Enable Auto-Updates (Optional)**
   Add to `package.json`:
   ```json
   "build": {
     "publish": {
       "provider": "github",
       "owner": "yourusername",
       "repo": "docufind"
     }
   }
   ```

### 2. Your Own Website

1. Host the built files on your website
2. Provide download links for each platform
3. Consider using a CDN for faster downloads

### 3. Direct Distribution

Share the built files directly:

- **Windows**: Share the `.exe` installer or portable version
- **macOS**: Share the `.dmg` file
- **Linux**: Share the `.AppImage` or `.deb` file

---

## Auto-Updates

DocuFind supports automatic updates using electron-updater:

### Setup GitHub Auto-Updates

1. Add to `package.json`:

   ```json
   "build": {
     "publish": {
       "provider": "github",
       "owner": "yourusername",
       "repo": "docufind"
     }
   }
   ```

2. Add auto-update code to `electron.js`:

   ```javascript
   const { autoUpdater } = require("electron-updater");

   app.whenReady().then(() => {
     autoUpdater.checkForUpdatesAndNotify();
   });
   ```

3. When you release a new version:
   - Update version in `package.json`
   - Build the app
   - Create a new GitHub release
   - Upload the new files
   - Users will receive update notifications

---

## Version Management

### Updating Version

1. Update `package.json`:

   ```json
   "version": "1.1.0"
   ```

2. Update the version badge in `README.md` if needed

3. Rebuild and release

### Semantic Versioning

Follow [SemVer](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backwards compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes

---

## Troubleshooting

### Common Issues

1. **Build fails on Windows**

   - Run as Administrator
   - Check for antivirus blocking

2. **Build fails on macOS**

   - Ensure Xcode Command Line Tools are installed
   - Check certificate validity

3. **Large bundle size**

   - Use `npm run build` before `npm run dist`
   - Check for unnecessary dependencies

4. **Missing icon**
   - Ensure `public/icon.svg` exists
   - For Windows, provide `.ico` file
   - For macOS, provide `.icns` file

### Getting Help

- [Electron Builder Documentation](https://www.electron.build/)
- [Electron Documentation](https://electronjs.org/docs)
- [GitHub Issues](https://github.com/yourusername/docufind/issues)

---

## Checklist Before Publishing

- [ ] Update version number in `package.json`
- [ ] Test the app on your platform
- [ ] Build with `npm run dist`
- [ ] Test the built installer/package
- [ ] Create release notes
- [ ] Upload to distribution channel
- [ ] Update README with download links
- [ ] Announce the release

---

## Security Considerations

1. **Code Signing**: Always sign your app for production
2. **Notarization**: Required for macOS distribution outside App Store
3. **HTTPS**: Use HTTPS for auto-update servers
4. **Dependency Audit**: Run `npm audit` before releasing

---

Happy Publishing! 🚀
