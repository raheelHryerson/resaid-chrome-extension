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
  const syncProfileBtn = document.getElementById('syncProfileBtn');
  const debugStorageBtn = document.getElementById('debugStorageBtn');
  const testApiBtn = document.getElementById('testApiBtn');
  const settingsLink = document.getElementById('settingsLink');
  const openTrackerBtn = document.getElementById('openTrackerBtn');

  // AI status elements
  const aiStatus = document.getElementById('aiStatus');
  const aiStatusText = document.getElementById('aiStatusText');
  const aiToggle = document.getElementById('aiToggle');

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

  // Load resumes from API or local storage
  async function loadResumes() {
    try {
      // First try to load from API if configured
      const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      let resumes = [];

      if (settings.apiEndpoint && settings.apiKey) {
        try {
          console.log('Fetching resumes from API...');
          const response = await fetch(`${settings.apiEndpoint}/api/resumes`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${settings.apiKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.resumes) {
              resumes = data.resumes;
              console.log('Loaded resumes from API:', resumes.length);

              // Store in local storage for offline use
              await chrome.storage.local.set({ resumes });

              // Mark the most recent resume as default if none is marked
              const hasDefault = resumes.some(r => r.isDefault);
              if (!hasDefault && resumes.length > 0) {
                resumes[0].isDefault = true;
              }
            }
          }
        } catch (apiError) {
          console.log('API fetch failed, falling back to local storage:', apiError);
        }
      }

      // If no resumes from API, load from local storage
      if (resumes.length === 0) {
        const stored = await chrome.storage.local.get(['resumes']);
        resumes = stored.resumes || [];
        console.log('Loaded resumes from local storage:', resumes.length);
      }

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

  // Sync profile from account
  syncProfileBtn.addEventListener('click', async () => {
    console.log('ResAid: Starting profile sync...');
    syncProfileBtn.textContent = '⏳ Syncing...';
    syncProfileBtn.disabled = true;

    try {
      const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      console.log('ResAid: Sync settings:', { hasEndpoint: !!settings.apiEndpoint, hasApiKey: !!settings.apiKey });

      if (!settings.apiEndpoint || !settings.apiKey) {
        alert('Please configure your API endpoint and key in Settings first.');
        syncProfileBtn.textContent = '🔄 Sync Profile';
        syncProfileBtn.disabled = false;
        return;
      }

      console.log('ResAid: Fetching from API:', `${settings.apiEndpoint}/api/user/profile`);
      const response = await fetch(`${settings.apiEndpoint}/api/user/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('ResAid: API response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('ResAid: API response data:', data);

        if (data.success && data.profile) {
          const profile = data.profile;
          console.log('ResAid: Profile data received:', {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            hasFirstName: !!profile.firstName
          });

          // Save to Chrome storage
          await chrome.storage.sync.set({
            fullName: profile.fullName || '',
            firstName: profile.firstName || '',
            middleName: profile.middleName || '',
            lastName: profile.lastName || '',
            email: profile.email || '',
            phone: profile.phone || '',
            countryPhoneCode: profile.countryPhoneCode || '',
            extension: profile.extension || '',
            city: profile.city || '',
            postalCode: profile.postalCode || '',
            location: profile.location || '',
            addressLine2: profile.addressLine2 || '',
            country: profile.country || '',
            province: profile.province || '',
            linkedin: profile.linkedin || '',
            github: profile.github || '',
            portfolio: profile.portfolio || '',
            twitter: profile.twitter || '',
            pronouns: profile.pronouns || '',
            currentCompany: profile.currentCompany || '',
            salary: profile.salary || '',
            availability: profile.availability || '',
            workAuth: profile.workAuth || '',
            referral: profile.referral || ''
          });

          console.log('ResAid: Profile saved to Chrome storage');
          
          // Verify the data was saved correctly
          const verifyData = await chrome.storage.sync.get(['firstName', 'lastName', 'email']);
          console.log('ResAid: Verification - data in storage:', verifyData);
          
          syncProfileBtn.textContent = '✓ Synced!';
          syncProfileBtn.style.background = '#4CAF50';

          setTimeout(() => {
            syncProfileBtn.textContent = '🔄 Sync Profile';
            syncProfileBtn.style.background = '';
            syncProfileBtn.disabled = false;
          }, 2000);
        } else {
          console.error('ResAid: Invalid response format:', data);
          throw new Error('Invalid response format');
        }
      } else {
        const errorText = await response.text();
        console.error('ResAid: API error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (err) {
      console.error('ResAid: Error syncing profile:', err);
      alert('Failed to sync profile. Please check your settings and try again. Check console for details.');
      syncProfileBtn.textContent = '🔄 Sync Profile';
      syncProfileBtn.disabled = false;
    }
  });

  // Debug storage - show what's currently in Chrome storage
  debugStorageBtn.addEventListener('click', async () => {
    try {
      const storageData = await chrome.storage.sync.get([
        'firstName', 'lastName', 'email', 'phone', 'fullName',
        'apiEndpoint', 'apiKey'
      ]);
      
      console.log('ResAid: Current Chrome storage data:', storageData);
      alert(`Chrome Storage Data:\n\nfirstName: "${storageData.firstName || 'NOT SET'}"\nlastName: "${storageData.lastName || 'NOT SET'}"\nemail: "${storageData.email || 'NOT SET'}"\nphone: "${storageData.phone || 'NOT SET'}"\nfullName: "${storageData.fullName || 'NOT SET'}"\n\nAPI Endpoint: ${storageData.apiEndpoint ? 'SET' : 'NOT SET'}\nAPI Key: ${storageData.apiKey ? 'SET' : 'NOT SET'}\n\nCheck browser console for full details.`);
    } catch (err) {
      console.error('ResAid: Error reading storage:', err);
      alert('Error reading storage. Check console.');
    }
  });

  // Test API connection
  testApiBtn.addEventListener('click', async () => {
    testApiBtn.textContent = '⏳ Testing...';
    testApiBtn.disabled = true;

    try {
      const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      
      if (!settings.apiEndpoint || !settings.apiKey) {
        alert('API endpoint and key not configured. Go to Settings first.');
        testApiBtn.textContent = '🔗 Test API';
        testApiBtn.disabled = false;
        return;
      }

      console.log('ResAid: Testing API connection to:', settings.apiEndpoint);
      const response = await fetch(`${settings.apiEndpoint}/api/user/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('ResAid: API test response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('ResAid: API test response:', data);
        
        if (data.success && data.profile) {
          alert(`✅ API Connected!\n\nProfile data received:\n• firstName: "${data.profile.firstName || 'null'}"\n• lastName: "${data.profile.lastName || 'null'}"\n• email: "${data.profile.email || 'null'}"\n\nCheck console for full response.`);
        } else {
          alert(`❌ API responded but invalid format. Check console.`);
        }
      } else {
        const errorText = await response.text();
        console.error('ResAid: API test error:', errorText);
        alert(`❌ API Error: ${response.status}\n${errorText}`);
      }
      
      testApiBtn.textContent = '🔗 Test API';
      testApiBtn.disabled = false;
    } catch (err) {
      console.error('ResAid: API test error:', err);
      alert(`❌ Connection Error: ${err.message}`);
      testApiBtn.textContent = '🔗 Test API';
      testApiBtn.disabled = false;
    }
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
      console.log('ResAid: Sending AUTOFILL_COMMON_FIELDS to tab:', currentTab.id, currentTab.url);
      // Trigger immediate autofill of all common fields on the page
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        type: 'AUTOFILL_COMMON_FIELDS'
      });
      console.log('ResAid: AUTOFILL_COMMON_FIELDS response:', response);

      enableBtn.textContent = '✓ Done!';
      enableBtn.style.background = '#4CAF50';
    } catch (err) {
      console.error('Error triggering autofill:', err);
      enableBtn.textContent = 'Smart Autofill';
      enableBtn.disabled = false;
      alert('No personal info found. Click "Sync Profile" to load your latest data from your account, or go to Settings to add your info manually.');
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

  // AI toggle
  aiToggle.addEventListener('change', async () => {
    const isEnabled = aiToggle.checked;
    await chrome.storage.sync.set({ aiEnabled: isEnabled });
    console.log('ResAid: AI enabled state changed to:', isEnabled);
  });

  // Initialize
  await loadJobDescription();
  await loadResumes();

  // Load AI enabled state
  const aiSettings = await chrome.storage.sync.get(['aiEnabled']);
  aiToggle.checked = aiSettings.aiEnabled !== false; // Default to true if not set

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

// ===== APPLICATIONS TRACKER =====

document.addEventListener('DOMContentLoaded', async () => {
  const toggleApplications = document.getElementById('toggleApplications');
  const applicationsList = document.getElementById('applicationsList');
  const applicationsContent = document.getElementById('applicationsContent');
  const viewAllApplications = document.getElementById('viewAllApplications');
  
  let applicationsExpanded = false;
  
  // Toggle applications list
  toggleApplications.addEventListener('click', () => {
    applicationsExpanded = !applicationsExpanded;
    applicationsList.style.display = applicationsExpanded ? 'block' : 'none';
    toggleApplications.textContent = applicationsExpanded ? '▲' : '▼';
    
    if (applicationsExpanded) {
      loadRecentApplications();
    }
  });
  
  // View all applications
  viewAllApplications.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('applications.html') });
  });
  
  // Load recent applications
  async function loadRecentApplications() {
    try {
      const result = await chrome.storage.local.get(['applications']);
      const applications = result.applications || [];
      
      if (applications.length === 0) {
        applicationsContent.innerHTML = `
          <div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">
            No applications tracked yet.<br>
            <small>Applications will be tracked automatically when you submit job applications.</small>
          </div>
        `;
        return;
      }
      
      // Show last 3 applications
      const recentApps = applications.slice(-3).reverse();
      
      applicationsContent.innerHTML = recentApps.map(app => `
        <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 8px; background: #fafafa;">
          <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${app.position || 'Unknown Position'}</div>
          <div style="font-size: 14px; color: #666; margin-bottom: 4px;">${app.company || 'Unknown Company'}</div>
          <div style="font-size: 12px; color: #888;">
            ${app.status || 'Applied'} • ${new Date(app.dateAdded || app.appliedDate).toLocaleDateString()}
          </div>
        </div>
      `).join('');
      
    } catch (error) {
      console.error('Error loading applications:', error);
      applicationsContent.innerHTML = `
        <div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">
          Error loading applications
        </div>
      `;
    }
  }

  // Check AI status and show in popup
  async function checkAIStatus() {
    try {
      const aiSettings = await chrome.storage.sync.get(['enableAI', 'aiProvider', 'aiApiKey', 'aiModel']);
      
      if (aiStatus && aiStatusText) {
        if (aiSettings.enableAI && aiSettings.aiApiKey) {
          aiStatus.style.display = 'block';
          aiStatus.style.background = '#e8f5e8';
          aiStatus.style.border = '1px solid #4caf50';
          aiStatus.style.color = '#2e7d32';
          aiStatusText.textContent = `AI Question Answering: Enabled (${aiSettings.aiProvider || 'openai'})`;
        } else if (aiSettings.enableAI && !aiSettings.aiApiKey) {
          aiStatus.style.display = 'block';
          aiStatus.style.background = '#fff3cd';
          aiStatus.style.border = '1px solid #ffc107';
          aiStatus.style.color = '#856404';
          aiStatusText.textContent = 'AI Question Answering: Enabled but needs API key';
        } else {
          aiStatus.style.display = 'block';
          aiStatus.style.background = '#f5f5f5';
          aiStatus.style.border = '1px solid #ddd';
          aiStatus.style.color = '#666';
          aiStatusText.textContent = 'AI Question Answering: Disabled';
        }
      }
    } catch (err) {
      console.log('Error checking AI status:', err);
      if (aiStatus) aiStatus.style.display = 'none';
    }
  }

  // Initialize AI status check
  checkAIStatus();
});
