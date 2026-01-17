// Popup script - UI logic for the extension popup

// Animate radial score meter
function animateScoreMeter(score) {
  const circle = document.getElementById('scoreCircle');
  const scoreValue = document.getElementById('scoreValue');
  const container = document.getElementById('fitScoreContainer');
  
  // Show container
  container.classList.add('visible');
  
  // Calculate circle progress (440 is circumference: 2 * π * 70)
  const circumference = 440;
  const progress = circumference - (score / 100) * circumference;
  
  // Animate from 0 to score
  let current = 0;
  const duration = 1500; // 1.5 seconds
  const startTime = Date.now();
  
  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out-cubic)
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(score * eased);
    
    // Update circle
    const offset = circumference - (current / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Update text
    scoreValue.textContent = current + '%';
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  update();
}

// Display score breakdown and insights
function displayScoreBreakdown(scoreData) {
  if (!scoreData) return;
  
  // Update component scores
  document.getElementById('skillsScore').textContent = scoreData.scoreComponents.skillsMatch + '%';
  document.getElementById('expScore').textContent = scoreData.scoreComponents.experienceRelevance + '%';
  document.getElementById('roleScore').textContent = scoreData.scoreComponents.roleAlignment + '%';
  
  // Display insights
  const insightsContainer = document.getElementById('scoreInsights');
  insightsContainer.innerHTML = '';
  
  // Strengths
  if (scoreData.strengths && scoreData.strengths.length > 0) {
    scoreData.strengths.slice(0, 2).forEach(strength => {
      const item = document.createElement('div');
      item.className = 'insight-item';
      item.innerHTML = `✓ ${strength}`;
      insightsContainer.appendChild(item);
    });
  }
  
  // Missing skills
  if (scoreData.missingSkills && scoreData.missingSkills.length > 0) {
    const item = document.createElement('div');
    item.className = 'insight-item insight-missing';
    item.innerHTML = `⚠ Missing: ${scoreData.missingSkills.join(', ')}`;
    insightsContainer.appendChild(item);
  }
  
  // Display skills gap analysis
  displaySkillsGap(scoreData);
  
  // Recommendations
  if (scoreData.recommendations && scoreData.recommendations.length > 0) {
    const rec = scoreData.recommendations[0];
    const item = document.createElement('div');
    item.className = 'insight-item';
    item.innerHTML = `💡 ${rec}`;
    insightsContainer.appendChild(item);
  }
}

// Display skills gap analysis
function displaySkillsGap(scoreData) {
  const gapSection = document.getElementById('skillsGapSection');
  const gapList = document.getElementById('skillsGapList');
  
  if (!scoreData.missingSkills || scoreData.missingSkills.length === 0) {
    gapSection.style.display = 'none';
    return;
  }
  
  gapSection.style.display = 'block';
  
  // Estimate impact of adding each skill (rough calculation)
  const skillImpacts = scoreData.missingSkills.map((skill, index) => {
    // Assume each missing required skill adds ~5-8% to match score
    const impact = Math.min(8 - (index * 0.5), 5);
    return { skill, impact: Math.round(impact) };
  }).slice(0, 5); // Show top 5 missing skills
  
  gapList.innerHTML = skillImpacts.map(item => `
    <div class="gap-item">
      <span class="gap-skill">${item.skill}</span>
      <span class="gap-impact">+${item.impact}%</span>
    </div>
  `).join('');
  
  if (skillImpacts.length === 0) {
    gapList.innerHTML = '<div class="gap-empty">Great match! No major gaps detected.</div>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const jobStatus = document.getElementById('jobStatus');
  const refreshJobBtn = document.getElementById('refreshJobBtn');
  const resumeSelect = document.getElementById('resumeSelect');
  const guidelinesInput = document.getElementById('guidelines');
  const enableBtn = document.getElementById('enableAutofill');
  const settingsLink = document.getElementById('settingsLink');
  const openTrackerBtn = document.getElementById('openTrackerBtn');

  let currentTab = null;
  let jobDescription = null;
  // Backend API key removed. All data now uses local storage.

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Tracker button
  openTrackerBtn.addEventListener('click', () => {
    const trackerUrl = chrome.runtime.getURL('tracker.html');
    chrome.tabs.create({ url: trackerUrl });
  });

  // Load saved guidelines
  const saved = await chrome.storage.sync.get(['guidelines']);
  if (saved.guidelines) {
    guidelinesInput.value = saved.guidelines;
  }

  // Load job description from storage
  async function loadJobDescription() {
    const url = currentTab?.url || '';
    if (/^(chrome:|edge:|about:|chrome-extension:|devtools:|view-source:)/i.test(url)) {
      jobStatus.className = 'status warning';
      jobStatus.textContent = 'ℹ️ Open a job page (http/https) to detect the description';
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_JOB_DESCRIPTION',
        tabId: currentTab.id
      });

      if (response.success && response.data) {
        jobDescription = response.data;
        jobStatus.className = 'status detected';
        jobStatus.innerHTML = `✓ Detected (${Math.round((jobDescription.confidence || 0.5) * 100)}% confidence)`;
        
        // Log to console for debugging
        console.log('ResAid: Job Description detected:', {
          length: jobDescription.text?.length,
          confidence: jobDescription.confidence,
          preview: jobDescription.text?.substring(0, 200) + '...'
        });
        refreshJobBtn.style.display = 'none';
        return;
      }
    } catch (err) {
      console.log('No cached job description, checking page...');
    }

    // Try to get from content script directly
    try {
      const contentResponse = await chrome.tabs.sendMessage(currentTab.id, {
        type: 'GET_PAGE_JOB_DESCRIPTION'
      });
      
      if (contentResponse && contentResponse.success && contentResponse.data) {
        jobDescription = contentResponse.data;
        jobStatus.className = 'status detected';
        jobStatus.innerHTML = `✓ Detected (${Math.round((jobDescription.confidence || 0.5) * 100)}% confidence)`;
        
        // Log to console for debugging
        console.log('ResAid: Job Description detected:', {
          length: jobDescription.text?.length,
          confidence: jobDescription.confidence,
          preview: jobDescription.text?.substring(0, 200) + '...'
        });
        refreshJobBtn.style.display = 'none';
      } else {
        // Try global last-known JD (carry-over across tabs)
        const last = await chrome.runtime.sendMessage({ type: 'GET_LAST_JOB_DESCRIPTION' });
        if (last?.data?.text) {
          jobDescription = last.data;
          jobStatus.className = 'status detected';
          jobStatus.innerHTML = `✓ Detected (carried over)`;
          
          // Log to console for debugging
          console.log('ResAid: Job Description carried over:', {
            length: jobDescription.text?.length,
            preview: jobDescription.text?.substring(0, 200) + '...'
          });
          refreshJobBtn.style.display = 'none';
        } else {
          jobStatus.className = 'status warning';
          jobStatus.textContent = 'ℹ️ No job description found on this page';
          refreshJobBtn.style.display = 'block';
        }
      }
    } catch (err) {
      // Content script not loaded - inject it
      console.log('Content script not loaded, injecting...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['content.js']
        });
        
        // Wait a bit for script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try again
        const retryResponse = await chrome.tabs.sendMessage(currentTab.id, {
          type: 'GET_PAGE_JOB_DESCRIPTION'
        });
        
        if (retryResponse && retryResponse.success && retryResponse.data) {
          jobDescription = retryResponse.data;
          const confidence = Math.round(retryResponse.data.confidence * 100);
          jobStatus.className = 'status detected';
          jobStatus.textContent = `✓ Detected (${confidence}% confidence)`;
          console.log('Job Description:', {
            length: retryResponse.data.text.length,
            confidence: confidence + '%',
            preview: retryResponse.data.text.slice(0, 200) + '...'
          });
          refreshJobBtn.style.display = 'none';
        } else {
          jobStatus.className = 'status warning';
          jobStatus.textContent = 'ℹ️ No job description found on this page';
          refreshJobBtn.style.display = 'block';
        }
      } catch (injectErr) {
        console.error('Could not inject content script:', injectErr);
        jobStatus.className = 'status warning';
        jobStatus.textContent = '⚠️ Please refresh the page and try again';
        refreshJobBtn.style.display = 'block';
      }
    }
  }

  // Load resumes from local storage
  async function loadResumes() {
    try {
      const stored = await chrome.storage.local.get(['resumes']);
      const resumes = stored.resumes || [];

      resumeSelect.innerHTML = '';
      
      if (resumes.length === 0) {
        resumeSelect.innerHTML = '<option value="">No resumes found</option>';
        enableBtn.disabled = true;
        return;
      }

      resumes.forEach(resume => {
        const option = document.createElement('option');
        option.value = resume.id || resume.fileName;
        option.textContent = resume.fileName || 'Resume';
        if (resume.isDefault) {
          option.selected = true;
        }
        resumeSelect.appendChild(option);
      });

      // Persist selected resume for fallback autofill
      const selectedId = resumeSelect.value;
      if (selectedId) {
        await chrome.storage.sync.set({ lastResumeId: selectedId });
      }

      enableBtn.disabled = false;
    } catch (err) {
      console.error('Error loading resumes:', err);
      resumeSelect.innerHTML = '<option value="">Error loading resumes</option>';
      enableBtn.disabled = true;

      // Show actionable hint
      jobStatus.className = 'status warning';
      jobStatus.textContent = '⚠️ Could not load resumes. Check API key and endpoint in Settings, then reopen the popup.';
    }
  }

  // Refresh job description
  refreshJobBtn.addEventListener('click', async () => {
    refreshJobBtn.textContent = '⏳ Refreshing...';
    refreshJobBtn.disabled = true;
    
    // Reload content script
    await chrome.tabs.reload(currentTab.id);
    
    setTimeout(async () => {
      await loadJobDescription();
      refreshJobBtn.textContent = '🔄 Refresh Detection';
      refreshJobBtn.disabled = false;
    }, 2000);
  });

  // Smart autofill - fill all common fields immediately
  enableBtn.addEventListener('click', async () => {
    const resumeId = resumeSelect.value;
    const guidelines = guidelinesInput.value.trim();

    if (!resumeId) {
      alert('Please select a resume');
      return;
    }

    // Save guidelines
    await chrome.storage.sync.set({ guidelines });

    enableBtn.textContent = '⏳ Filling...';
    enableBtn.disabled = true;

    try {
      // Trigger immediate autofill of all common fields on the page
      await chrome.tabs.sendMessage(currentTab.id, {
        type: 'AUTOFILL_COMMON_FIELDS'
      });

      enableBtn.textContent = '✓ Done!';
      enableBtn.style.background = '#4CAF50';
    } catch (err) {
      console.error('Error triggering autofill:', err);
      enableBtn.textContent = 'Smart Autofill';
      enableBtn.disabled = false;
      alert('No personal info found. Go to Settings and add your info or click "Fetch from Resume".');
    }
    
    setTimeout(() => {
      window.close();
    }, 1000);
  });

  // Keep selected resume saved for fallback autofill
  resumeSelect.addEventListener('change', async () => {
    const selectedId = resumeSelect.value;
    if (selectedId) {
      await chrome.storage.sync.set({ lastResumeId: selectedId });
    }
  });

  // Save guidelines as user types (so fallback has them)
  guidelinesInput.addEventListener('input', async () => {
    await chrome.storage.sync.set({ guidelines: guidelinesInput.value.trim() });
  });

  // Settings
  settingsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Initialize
  await loadJobDescription();
  await loadResumes();

  // Calculate fit score if both job description and resume are available
  if (jobDescription && resumeSelect.value) {
    await calculateFitScore();
  }

  // Recalculate when resume changes
  resumeSelect.addEventListener('change', async () => {
    const selectedId = resumeSelect.value;
    if (selectedId) {
      await chrome.storage.sync.set({ lastResumeId: selectedId });
      if (jobDescription) {
        calculateFitScore();
      }
    }
  });

  // Listen for job description detection from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'JOB_DESCRIPTION_DETECTED' && sender.tab?.id === currentTab.id) {
      jobDescription = message.data;
      jobStatus.className = 'status detected';
      jobStatus.innerHTML = `✓ Detected (${Math.round((jobDescription.confidence || 0.5) * 100)}% confidence)`;
      refreshJobBtn.style.display = 'none';
      
      // Auto-calculate score if resume is selected
      if (resumeSelect.value) {
        calculateFitScore();
      }
    }
  });

  // Calculate and display fit score
  async function calculateFitScore() {
    const resumeId = resumeSelect.value;
    if (!resumeId || !jobDescription) return;

    try {
      // Build resume data from stored onboarding info
      const profile = await chrome.storage.sync.get([
        'firstName','lastName','email','phone','city','country','linkedin',
        'expectedSalary','yearsExperience','currentCompany','willingRelocate','workAuthorization','noticePeriod'
      ]);
      const resumeData = profile; // simple object used by scoring

      // Send to background to calculate score (content.js has the scoring function)
      const scoreResult = await chrome.runtime.sendMessage({
        type: 'CALCULATE_FIT_SCORE',
        data: {
          jobDescription: jobDescription.text,
          resumeData: resumeData
        }
      });

      if (scoreResult && scoreResult.success && scoreResult.data) {
        // Animate and display score
        animateScoreMeter(scoreResult.data.overallScore);
        displayScoreBreakdown(scoreResult.data);
      }
    } catch (err) {
      console.error('Error calculating fit score:', err);
    }
  }
});
