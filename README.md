# ResAid Chrome Extension

AI-powered job application autofill using your resume and the job description on the page.

## Features

- **Intelligent Job Description Detection**: Automatically extracts job descriptions from Workday, LinkedIn, Greenhouse, Lever, and other job sites
- **Context-Aware Autofill**: Focuses on the question field and generates tailored answers based on your resume + job description
- **Custom Guidelines**: Add your own prompts and answer guidelines for personalized outputs
- **One-Click Fill**: Click the ✨ ResAid button next to any question field to generate and insert answers

## Installation

### Development Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this `chrome-extension` folder

### Configure API Endpoint

1. Click the ResAid extension icon
2. Click **⚙️ Extension Settings**
3. Enter your API endpoint:
   - Local: `http://localhost:3000`
   - Production: Your deployed Vercel URL (e.g., `https://resaid.vercel.app`)
4. Save settings

## Usage

1. **Upload a Resume**: Go to your ResAid dashboard and upload/parse a resume
2. **Visit a Job Site**: Navigate to Workday, LinkedIn, etc.
3. **Open Extension**: Click the ResAid icon in your toolbar
4. **Verify Detection**: The extension will show if a job description was detected
5. **Select Resume**: Choose which resume to use
6. **Add Guidelines** (optional): Customize the answer style (e.g., "Keep under 200 words", "Emphasize leadership")
7. **Enable Autofill**: Click the button
8. **Focus on Question Fields**: When you click into a textarea or input, the ✨ ResAid button appears
9. **Generate Answer**: Click it to fill the field with a tailored answer

## Supported Sites

- Workday
- LinkedIn Jobs
- Greenhouse
- Lever
- Generic job boards (with fallback heuristics)

## Architecture

- **manifest.json**: Extension config (permissions, scripts)
- **background.js**: Service worker for message routing and API calls
- **content.js**: Runs on all pages; detects job descriptions and question fields
- **popup.html/js**: Extension popup UI
- **settings.html/js**: Configuration page

## API Integration

The extension calls:
- `GET /api/resumes` - List user resumes
- `POST /api/resumes/:id/answers` - Generate answers
  - Body: `{ jobDescription, questions[], tone, guidelines }`

## Icon Conversion

The extension uses SVG icons. To convert to PNG for Chrome:

```bash
# Install imagemagick or use an online converter
convert icon128.svg -resize 128x128 icon128.png
convert icon128.svg -resize 48x48 icon48.png
convert icon128.svg -resize 16x16 icon16.png
```

Or use https://cloudconvert.com/svg-to-png

## Security

- API keys stored in `chrome.storage.sync` (encrypted by Chrome)
- Job descriptions stored in `chrome.storage.session` (cleared on browser close)
- All network requests go through your API endpoint (CORS must allow extension origin)

## Troubleshooting

**Job description not detected:**
- Try clicking "Refresh Detection"
- The page may use non-standard markup; check console for errors

**Autofill button doesn't appear:**
- Ensure the extension is enabled and you clicked "Enable Smart Autofill"
- Check if the field is a standard input/textarea

**API errors:**
- Verify your API endpoint in settings
- Check that OPENAI_API_KEY is set in your API's .env
- Open DevTools → Console for detailed error messages

## Next Steps

- Add support for more job sites
- Improve answer quality with fine-tuned prompts
- Add answer preview/edit before filling
- Store answer history for reuse
