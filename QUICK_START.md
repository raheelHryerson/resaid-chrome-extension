# Quick Start Guide

## Prerequisites
1. At least one resume to upload (PDF/DOCX)
2. PNG icons generated (see ICON_SETUP.md)

## Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Navigate to and select this `chrome-extension` folder
5. Extension should appear with the ✨ icon

## Configure

1. Click the ResAid extension icon in Chrome toolbar
2. Click **⚙️ Extension Settings** at the bottom
3. Optionally click "Load from Onboarding" to copy your details
4. Click **Save Settings**

## Test It Out

### Step 1: Visit a Job Site
Go to any of these:
- https://www.linkedin.com/jobs/ (search and click a job)
- A Workday careers page (e.g., search "workday careers" + company name)
- https://jobs.lever.co/ (browse any company)
- Any job posting with a description

### Step 2: Open Extension Popup
1. Click the ResAid icon
2. You should see:
   - ✓ Job description detected (if on a job page)
   - Resume dropdown (loaded from local storage)
   - Guidelines textarea

### Step 3: Enable Autofill
1. Select your resume
2. (Optional) Add guidelines like:
   - "Keep answers under 200 words"
   - "Emphasize leadership and teamwork"
   - "Use active voice and specific examples"
3. Click **Enable Smart Autofill**
4. Popup will close

### Step 4: Fill Out Application
1. Click on an application form (usually "Apply" button on job site)
2. When you focus on a text field or textarea, the **✨ ResAid** button should appear above/near it
3. Click the button
4. Wait for AI to generate an answer (~2-5 seconds)
5. Answer is auto-filled into the field!

## Troubleshooting

**No job description detected:**
- Click "Refresh Detection" button
- Check browser console (F12) for errors
- Some sites use complex JS rendering; try waiting a few seconds after page load

**ResAid button doesn't appear:**
- Make sure you clicked "Enable Smart Autofill" in the popup
- Refresh the page after enabling
- Check that the field is a standard `<textarea>` or `<input type="text">`

**Answers seem generic:**
- Add more detailed guidelines in the popup
- Ensure onboarding information is filled to personalize outputs

**Extension won't load:**
- Ensure PNG icons exist (see ICON_SETUP.md)
- Check `chrome://extensions/` for error messages
- Try removing and re-adding the extension

## Development Tips

### Debugging Content Script
- Open DevTools on the job page
- Check Console for `ResAid:` messages
- content.js logs detection results

### Debugging Popup
- Right-click extension icon → Inspect Popup
- Console shows popup.js logs

### Debugging Background Script
- Go to `chrome://extensions/`
- Click "Inspect views: service worker" under ResAid
- Console shows background.js logs

### Reload After Changes
After editing any extension file:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the ResAid extension
3. Refresh any open job pages
