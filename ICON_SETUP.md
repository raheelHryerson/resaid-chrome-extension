# Icon Conversion Instructions

The extension currently has an SVG icon at `icons/icon128.svg`. Chrome extensions need PNG files.

## Option 1: Online Converter
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `icons/icon128.svg`
3. Convert to:
   - 128x128 → save as `icon128.png`
   - 48x48 → save as `icon48.png`
   - 16x16 → save as `icon16.png`
4. Place all PNG files in the `icons/` folder

## Option 2: ImageMagick (if installed)
```bash
cd icons
magick icon128.svg -resize 128x128 icon128.png
magick icon128.svg -resize 48x48 icon48.png
magick icon128.svg -resize 16x16 icon16.png
```

## Option 3: Use Any SVG → PNG Tool
- Inkscape
- GIMP
- Photoshop
- Online tools (svgtopng.com, etc.)

Once PNG files are created, the extension is ready to load!
