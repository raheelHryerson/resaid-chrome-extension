// Popup script - Simple, professional interface for ResAid

let currentTab = null;
let isPremiumUser = false;
let lastPremiumAnalysisKey = null;
const premiumAnalysisCacheKey = 'premiumAnalysisCache';

function buildPremiumCacheKey(resumeId, jobDescriptionText) {
  const normalized = `${resumeId || 'unknown'}|${jobDescriptionText || ''}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return `premium:${hash}`;
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
  console.log('ResAid: Popup initialized');

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Load profile status
  await loadProfileStatus();

  // Analyze current page
  await analyzeCurrentPage();

  // Set up event listeners
  setupEventListeners();
});

// Load profile status
async function loadProfileStatus() {
  try {
    const result = await chrome.storage.sync.get([
      'firstName', 'lastName', 'email', 'phone'
    ]);

    const profileStatus = document.getElementById('profileStatus');
    if (result.firstName || result.email) {
      profileStatus.textContent = 'Profile loaded';
      profileStatus.className = 'status success';
    } else {
      profileStatus.textContent = 'No profile synced';
      profileStatus.className = 'status warning';
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    document.getElementById('profileStatus').textContent = 'Error loading profile';
    document.getElementById('profileStatus').className = 'status error';
  }
}

// Analyze current page for job application
async function analyzeCurrentPage() {
  const jobStatus = document.getElementById('jobStatus');

  if (!currentTab) {
    jobStatus.textContent = 'No active tab';
    jobStatus.className = 'status warning';
    return;
  }

  // Check if it's a chrome page
  if (currentTab.url.startsWith('chrome://') ||
      currentTab.url.startsWith('edge://') ||
      currentTab.url.startsWith('about:') ||
      currentTab.url.startsWith('chrome-extension://')) {
    jobStatus.textContent = 'Not available on this page';
    jobStatus.className = 'status warning';
    return;
  }

  try {
    // Get comprehensive job detection state from content script
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_JOB_STATUS' });

    if (response) {
      if (response.hasJobForm) {
        jobStatus.textContent = 'Job application form detected';
        jobStatus.className = 'status warning';
      } else if (response.hasJobDescription) {
        jobStatus.textContent = 'Job description found';
        jobStatus.className = 'status detected';
      } else {
        jobStatus.textContent = 'Not a job application page';
        jobStatus.className = 'status';
      }
    } else {
      jobStatus.textContent = 'Unable to analyze page';
      jobStatus.className = 'status';
    }
  } catch (error) {
    console.error('Error analyzing page:', error);
    jobStatus.textContent = 'Unable to analyze page';
    jobStatus.className = 'status warning';
  }
}

// Set up event listeners
function setupEventListeners() {
  // Smart Fill button
  document.getElementById('smartFillBtn').addEventListener('click', async () => {
    await performSmartFill();
  });

  // Settings link
  document.getElementById('settingsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// Perform smart fill
async function performSmartFill() {
  if (!currentTab) {
    alert('No active tab to fill');
    return;
  }

  const button = document.getElementById('smartFillBtn');
  const originalText = button.textContent;
  button.textContent = 'Filling...';
  button.disabled = true;

  try {
    // Load profile data
    const profileData = await chrome.storage.sync.get([
      'firstName', 'lastName', 'email', 'phone', 'city', 'state', 'country'
    ]);

    if (!profileData.firstName && !profileData.email) {
      alert('Please sync your profile first. Click the extension icon and set up your profile.');
      button.textContent = originalText;
      button.disabled = false;
      return;
    }

    // Send fill command to content script
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'AUTOFILL_COMMON_FIELDS',
      profileData: profileData
    });

    if (response && response.success) {
      button.textContent = '✅ Filled!';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
        window.close(); // Close popup after successful fill
      }, 1500);
    } else {
      throw new Error('Fill failed');
    }
  } catch (error) {
    console.error('Error performing smart fill:', error);
    button.textContent = '❌ Failed';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  }
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
      item.innerHTML = `${strength}`;
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

// Animate score meter and reveal fit score section
function animateScoreMeter(score) {
  const scoreValue = document.getElementById('scoreValue');
  const scoreCircle = document.getElementById('scoreCircle');
  const fitScoreContainer = document.getElementById('fitScoreContainer');
  if (!scoreValue || !scoreCircle || !fitScoreContainer) return;

  const numericScore = Number(score);
  const clampedScore = Math.max(0, Math.min(100, Number.isFinite(numericScore) ? numericScore : 0));
  const targetScore = Math.round(clampedScore);

  fitScoreContainer.classList.add('visible');

  const circumference = 440;
  const targetOffset = circumference * (1 - targetScore / 100);
  const startOffset = Number.parseFloat(scoreCircle.style.strokeDashoffset) || circumference;
  const startScore = Number.parseFloat(scoreValue.textContent) || 0;
  const durationMs = 900;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentOffset = startOffset + (targetOffset - startOffset) * eased;
    const currentScore = Math.round(startScore + (targetScore - startScore) * eased);

    scoreCircle.style.strokeDasharray = `${circumference}`;
    scoreCircle.style.strokeDashoffset = `${currentOffset}`;
    scoreValue.textContent = `${currentScore}%`;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

async function openDashboardUpgrade() {
  const settings = await chrome.storage.sync.get(['apiEndpoint']);
  if (!settings.apiEndpoint) {
    chrome.runtime.openOptionsPage();
    return;
  }
  const trimmed = settings.apiEndpoint.replace(/\/+$/, '');
  chrome.tabs.create({ url: `${trimmed}/pricing` });
}

async function getSubscriptionStatus() {
  try {
    const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
    if (!settings.apiEndpoint || !settings.apiKey) return false;
    const response = await fetch(`${settings.apiEndpoint}/api/subscription/check`, {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) return false;
    const data = await response.json();
    const isPremium = data.status && data.status !== 'free';
    await chrome.storage.sync.set({ subscriptionStatus: isPremium ? 'premium' : 'free' });
    return isPremium;
  } catch (error) {
    console.log('ResAid: Failed to fetch subscription status:', error);
    return false;
  }
}

function updatePremiumUI(isPremium) {
  const breakdown = document.getElementById('scoreBreakdownSection');
  const locked = document.getElementById('premiumLocked');
  const analysis = document.getElementById('premiumAnalysisSection');

  if (breakdown) breakdown.style.display = isPremium ? 'block' : 'none';
  if (locked) locked.style.display = isPremium ? 'none' : 'block';
  if (analysis) analysis.style.display = isPremium ? 'block' : 'none';
}

function buildPremiumPrompt(jobDescription, resumeText, scoreData) {
  const scoreSummary = scoreData?.scoreComponents
    ? `Score components: Skills Match ${scoreData.scoreComponents.skillsMatch}%, Experience ${scoreData.scoreComponents.experienceRelevance}%, Role Alignment ${scoreData.scoreComponents.roleAlignment}%.`
    : '';

  return `Assume you are an expert resume writer with 20 years of experience helping tech professionals land their dream job at Google, Amazon, and other FAANG companies.

Analyze the resume against the job description and explain what is weak or missing. Follow the rules:
- See if the bulleted points clearly show a connection between the skills/experience and the job's preferred/basic qualifications.
- List relevant accomplishments or significant tasks performed that are most closely related to the job I am applying for.
- Highlight relevant transferable skills.
- Do not put company names or dates.
- Do not include skills and experience that aren't supported by the resume.
- Please don't utilize an Em-Dash unless it is the only grammatically correct option.

Output format:
1) Key gaps (bullet list)
2) Missing evidence from the resume (bullet list)
3) What to emphasize or add (bullet list)

${scoreSummary}

Resume:
${resumeText ? resumeText.substring(0, 6000) : ''}

Job Description:
${jobDescription ? jobDescription.substring(0, 6000) : ''}`;
}

async function generatePremiumAnalysis(jobDescriptionText, scoreData, options = {}) {
  if (!isPremiumUser) return;
  const premiumText = document.getElementById('premiumAnalysisText');
  if (!premiumText) return;
  const { forceRefresh = false } = options;
  const resumeId = document.getElementById('resumeSelect')?.value || '';
  const cacheKey = buildPremiumCacheKey(resumeId, jobDescriptionText);

  if (!forceRefresh) {
    const cached = await chrome.storage.local.get([premiumAnalysisCacheKey]);
    const cachedEntry = cached[premiumAnalysisCacheKey]?.[cacheKey];
    if (cachedEntry?.content) {
      premiumText.textContent = cachedEntry.content;
      return;
    }
  }

  const settings = await chrome.storage.sync.get(['aiApiKey', 'aiModel', 'aiEnabled']);
  if (!settings.aiApiKey || settings.aiEnabled === false) {
    premiumText.textContent = 'Add an AI API key in settings to generate the premium explanation.';
    return;
  }

  const resumeResponse = await chrome.runtime.sendMessage({ type: 'LOAD_RESUME_DATA' });
  const resumeText = resumeResponse?.success ? resumeResponse.data : '';
  if (!resumeText || !jobDescriptionText) {
    premiumText.textContent = 'Need both a resume and a job description to generate the premium explanation.';
    return;
  }

  const prompt = buildPremiumPrompt(jobDescriptionText, resumeText, scoreData);
  premiumText.textContent = 'Generating explanation...';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.aiApiKey}`
      },
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      premiumText.textContent = `Failed to generate explanation: ${response.status} ${errorText}`;
      return;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    const finalContent = content || 'No explanation returned.';
    premiumText.textContent = finalContent;
    const cached = await chrome.storage.local.get([premiumAnalysisCacheKey]);
    const cacheMap = cached[premiumAnalysisCacheKey] || {};
    cacheMap[cacheKey] = {
      content: finalContent,
      savedAt: Date.now()
    };
    await chrome.storage.local.set({ [premiumAnalysisCacheKey]: cacheMap });
  } catch (error) {
    premiumText.textContent = 'Error generating premium explanation.';
    console.error('ResAid: Premium analysis error:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const jobStatus = document.getElementById('jobStatus');
  const refreshJobBtn = document.getElementById('refreshJobBtn');
  const resumeSelect = document.getElementById('resumeSelect');
  const syncProfileBtn = document.getElementById('syncProfileBtn');
  const settingsLink = document.getElementById('settingsLink');
  const premiumUpgradeBtn = document.getElementById('premiumUpgradeBtn');
  const refreshPremiumAnalysis = document.getElementById('refreshPremiumAnalysis');

  let currentTab = null;
  let jobDescription = null;
  let lastScoreData = null;
  let lastJobDescriptionText = '';
  // Backend API key removed. All data now uses local storage.

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  if (premiumUpgradeBtn) {
    premiumUpgradeBtn.addEventListener('click', () => {
      openDashboardUpgrade();
    });
  }

  if (refreshPremiumAnalysis) {
    refreshPremiumAnalysis.addEventListener('click', () => {
      generatePremiumAnalysis(lastJobDescriptionText, lastScoreData, { forceRefresh: true });
    });
  }

  // Pin popup button
  const pinPopupBtn = document.getElementById('pinPopup');
  if (pinPopupBtn) {
    pinPopupBtn.addEventListener('click', () => {
      chrome.windows.create({
        url: chrome.runtime.getURL('pinned-popup.html'),
        type: 'popup',
        width: 320,
        height: 400,
        focused: true,
        top: 100,
        left: window.screen.width - 340
      });
      window.close(); // Close the regular popup
    });
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
        jobStatus.innerHTML = 'Job description found';
        
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
        jobStatus.innerHTML = 'Job description found';
        
        // Log to console for debugging
        console.log('ResAid: Job Description detected:', {
          length: jobDescription.text?.length,
          confidence: jobDescription.confidence,
          preview: jobDescription.text?.substring(0, 200) + '...'
        });
        refreshJobBtn.style.display = 'none';
      } else {
        // Try global last-known JD (carry-over across tabs) - for fit scoring only, don't change status
        const last = await chrome.runtime.sendMessage({ type: 'GET_LAST_JOB_DESCRIPTION' });
        if (last?.data?.text) {
          jobDescription = last.data;
          
          // Log to console for debugging
          console.log('ResAid: Job Description carried over for fit scoring:', {
            length: jobDescription.text?.length,
            preview: jobDescription.text?.substring(0, 200) + '...'
          });
          // Don't change the status - let analyzeCurrentPage() determine the current page status
          refreshJobBtn.style.display = 'none';
        } else {
          // Don't change status here either - analyzeCurrentPage() already set it
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
          jobStatus.textContent = 'Job description found';
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
        jobStatus.textContent = 'Please refresh the page and try again';
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
    } catch (err) {
      console.error('Error loading resumes:', err);
      resumeSelect.innerHTML = '<option value="">Error loading resumes</option>';

      // Show actionable hint
      jobStatus.className = 'status warning';
      jobStatus.textContent = 'Could not load resumes. Check API key and endpoint in Settings, then reopen the popup.';
    }
  }

  // Refresh job description
  refreshJobBtn.addEventListener('click', async () => {
    refreshJobBtn.textContent = 'Refreshing...';
    refreshJobBtn.disabled = true;
    
    // Reload content script
    await chrome.tabs.reload(currentTab.id);
    
    setTimeout(async () => {
      await loadJobDescription();
      refreshJobBtn.textContent = 'Refresh Detection';
      refreshJobBtn.disabled = false;
    }, 2000);
  });

  // Sync profile from account
  syncProfileBtn.addEventListener('click', async () => {
    console.log('ResAid: Starting profile sync...');
    syncProfileBtn.textContent = 'Syncing...';
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
          
          syncProfileBtn.textContent = 'Synced!';
          syncProfileBtn.style.background = '#4CAF50';

          setTimeout(() => {
            syncProfileBtn.textContent = 'Sync Profile';
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
      syncProfileBtn.textContent = 'Sync Profile';
      syncProfileBtn.disabled = false;
    }
  });

  // Keep selected resume saved for fallback autofill
  resumeSelect.addEventListener('change', async () => {
    const selectedId = resumeSelect.value;
    if (selectedId) {
      await chrome.storage.sync.set({ lastResumeId: selectedId });
    }
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
      jobStatus.innerHTML = 'Job description found';
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
        lastScoreData = scoreResult.data;
        lastJobDescriptionText = jobDescription?.text || '';
        updatePremiumUI(isPremiumUser);

        if (isPremiumUser && lastJobDescriptionText) {
          const analysisKey = `${lastJobDescriptionText.substring(0, 200)}|${scoreResult.data.overallScore}`;
          if (lastPremiumAnalysisKey !== analysisKey) {
            lastPremiumAnalysisKey = analysisKey;
            generatePremiumAnalysis(lastJobDescriptionText, lastScoreData);
          }
        }
      }
    } catch (err) {
      console.error('Error calculating fit score:', err);
    }
  }

  isPremiumUser = await getSubscriptionStatus();
  updatePremiumUI(isPremiumUser);

  if (isPremiumUser && lastJobDescriptionText && lastScoreData) {
    const analysisKey = `${lastJobDescriptionText.substring(0, 200)}|${lastScoreData.overallScore}`;
    if (lastPremiumAnalysisKey !== analysisKey) {
      lastPremiumAnalysisKey = analysisKey;
      generatePremiumAnalysis(lastJobDescriptionText, lastScoreData);
    }
  }
});

// AI status is managed in extension settings.
