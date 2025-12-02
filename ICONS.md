# Icon Generation Instructions

To generate platform-specific icons from the SVG, you'll need to create icons in different formats.

## Required Icon Formats

1. **Windows** (`.ico`): 256x256, 128x128, 64x64, 48x48, 32x32, 16x16 pixels
2. **macOS** (`.icns`): 1024x1024, 512x512, 256x256, 128x128, 64x64, 32x32, 16x16 pixels
3. **Linux** (`.png`): 512x512 or 1024x1024 pixels

## Quick Generation Methods

### Using Online Tools

1. Go to [CloudConvert](https://cloudconvert.com/svg-to-ico) or [ConvertICO](https://convertico.com/)
2. Upload `public/icon.svg`
3. Download the converted formats
4. Save as:
   - `public/icon.ico` (Windows)
   - `public/icon.icns` (macOS)
   - `public/icon.png` (Linux, 512x512)

### Using ImageMagick (Command Line)

```bash
# Install ImageMagick first
# Windows: choco install imagemagick
# macOS: brew install imagemagick
# Linux: sudo apt install imagemagick

# Generate PNG from SVG
convert -background none -size 512x512 public/icon.svg public/icon.png

# Generate ICO for Windows (multiple sizes)
convert public/icon.png -define icon:auto-resize=256,128,64,48,32,16 public/icon.ico
```

### Using Inkscape

```bash
# Export to PNG
inkscape public/icon.svg --export-filename=public/icon.png --export-width=512

# Then use other tools to convert PNG to ICO/ICNS
```

### Using electron-icon-builder (Recommended)

```bash
# Install
npm install -g electron-icon-builder

# Generate all formats from a 1024x1024 PNG
electron-icon-builder --input=./icon-1024.png --output=./public
```

## After Generation

Make sure you have these files in the `public/` folder:

- `icon.svg` (source)
- `icon.png` (512x512 for Linux)
- `icon.ico` (for Windows)
- `icon.icns` (for macOS)

The build configuration in `package.json` already references these paths.
