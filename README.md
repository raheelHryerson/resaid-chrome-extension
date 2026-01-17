# ResAid Chrome Extension

AI-powered job application autofill using your resume and the job description on the page.

## Features

- **Intelligent Job Description Detection**: Automatically extracts job descriptions from Workday, LinkedIn, Greenhouse, Lever, and other job sites
- **Context-Aware Autofill**: Focuses on the question field and generates tailored answers based on your resume + job description
- **Automatic Application Tracking**: Detects when you submit job applications and tracks them automatically
- **Applications Dashboard**: View and manage all your tracked applications with status updates
- **Custom Guidelines**: Add your own prompts and answer guidelines for personalized outputs
- **One-Click Fill**: Click the ✨ ResAid button next to any question field to generate and insert answers

## Installation

### Development Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this `chrome-extension` folder

### Setup

**Option 1: Local Only (No Account Required)**
The extension runs fully locally and uses Chrome storage for resumes and profile data.

**Option 2: Connected Account (Recommended)**
Connect to your ResAid web app account to automatically sync resumes and profile data:
1. Deploy/start your ResAid web app
2. Open extension settings
3. Enter your web app URL and API key
4. Click "Sync Resumes from Account"

## Usage

1. **Upload a Resume**: Use onboarding or the Dashboard Resumes tab to add a resume
2. **Connect Account** (Optional): In extension settings, configure API endpoint and sync resumes from your web app
3. **Visit a Job Site**: Navigate to Workday, LinkedIn, etc.
4. **Open Extension**: Click the ResAid icon in your toolbar
5. **Select Resume**: Choose from your synced resumes (or locally stored ones)
6. **Apply for Jobs**: Fill out applications normally - ResAid will detect submissions and offer to track them
7. **Track Applications**: View your application history in the popup or full Applications Tracker
8. **Verify Detection**: The extension will show if a job description was detected
9. **Add Guidelines** (optional): Customize the answer style (e.g., "Keep under 200 words", "Emphasize leadership")
10. **Enable Autofill**: Click the button
11. **Focus on Question Fields**: When you click into a textarea or input, the ✨ ResAid button appears
12. **Generate Answer**: Click it to fill the field with a tailored answer

## Application Tracking

ResAid automatically detects when you submit job applications and offers to track them:

- **Automatic Detection**: Monitors form submissions and success pages on job sites
- **Smart Dialog**: Shows a confirmation dialog when an application is detected
- **Complete Tracking**: Stores company, position, location, status, and application date
- **Status Management**: Update application status (Applied → Interview → Offer → Rejected)
- **Export Data**: Export your application history to CSV
- **Offline Storage**: All data stored locally in your browser

### Supported Job Boards
- LinkedIn Jobs
- Indeed
- Greenhouse
- Workday
- Lever
- Glassdoor
- Monster
- And many more job sites

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

## Data Flow

- Resumes are stored in `chrome.storage.local` with metadata and base64 content.
- Personal info is stored in `chrome.storage.sync` from onboarding/settings.
- Answer generation uses a local heuristic based on your profile and the detected job description.

## Icon Conversion

The extension uses SVG icons. To convert to PNG for Chrome:

```bash
# Install imagemagick or use an online converter
convert icon128.svg -resize 128x128 icon128.png
convert icon128.svg -resize 48x48 icon48.png
convert icon128.svg -resize 16x16 icon16.png
```

Or use https://cloudconvert.com/svg-to-png

## Privacy & Storage

- Job descriptions are stored in `chrome.storage.session` (cleared on browser close).
- Resumes and application data are kept local to your browser.

## Troubleshooting

**Job description not detected:**
- Try clicking "Refresh Detection"
- The page may use non-standard markup; check console for errors

**Autofill button doesn't appear:**
- Ensure the extension is enabled and you clicked "Enable Smart Autofill"
- Check if the field is a standard input/textarea

**Local generation too generic:**
- Add guidelines in the popup to steer tone and content (e.g., "Keep under 200 words", "Emphasize leadership").

## Next Steps

- Add support for more job sites
- Improve answer quality with fine-tuned prompts
- Add answer preview/edit before filling
- Store answer history for reuse
