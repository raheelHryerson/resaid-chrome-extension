// Popup script - UI logic for the extension popup

document.addEventListener('DOMContentLoaded', async () => {
  const jobStatus = document.getElementById('jobStatus');
  const jobPreview = document.getElementById('jobPreview');
  const refreshJobBtn = document.getElementById('refreshJob');
  const resumeSelect = document.getElementById('resumeSelect');
  const guidelinesInput = document.getElementById('guidelines');
  const enableBtn = document.getElementById('enableAutofill');
  const settingsLink = document.getElementById('settingsLink');

  let currentTab = null;
  let jobDescription = null;
  let apiKey = null;

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load saved guidelines and API endpoint
  const saved = await chrome.storage.sync.get(['guidelines', 'apiEndpoint']);
  if (saved.guidelines) {
    guidelinesInput.value = saved.guidelines;
  }

  const apiEndpoint = saved.apiEndpoint || 'http://localhost:3000';

  // Fetch API key from server
  async function fetchApiKey() {
    try {
      const response = await fetch(`${apiEndpoint}/api/user/api-key`);
      if (response.ok) {
        const data = await response.json();
        apiKey = data.apiKey;
        await chrome.storage.sync.set({ apiKey });
        return apiKey;
      }
    } catch (err) {
      console.error('Error fetching API key:', err);
      // Try to use stored key
      const stored = await chrome.storage.sync.get(['apiKey']);
      apiKey = stored.apiKey || null;
    }
    return apiKey;
  }

  // Load API key on popup open
  await fetchApiKey();

  if (!apiEndpoint) {
    jobStatus.className = 'status warning';
    jobStatus.textContent = '⚠️ API endpoint not configured. Click settings below.';
  }

  // Load job description from storage
  async function loadJobDescription() {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_JOB_DESCRIPTION',
      tabId: currentTab.id
    });

    if (response.success && response.data) {
      jobDescription = response.data;
      jobStatus.className = 'status detected';
      jobStatus.textContent = `✓ Job description detected (${jobDescription.text.length} chars)`;
      jobPreview.style.display = 'block';
      jobPreview.textContent = jobDescription.text.slice(0, 300) + '...';
    } else {
      // Try to get from content script directly
      try {
        const contentResponse = await chrome.tabs.sendMessage(currentTab.id, {
          type: 'GET_PAGE_JOB_DESCRIPTION'
        });
        
        if (contentResponse.success && contentResponse.data) {
          jobDescription = contentResponse.data;
          jobStatus.className = 'status detected';
          jobStatus.textContent = `✓ Job description detected (${jobDescription.text.length} chars)`;
          jobPreview.style.display = 'block';
          jobPreview.textContent = jobDescription.text.slice(0, 300) + '...';
        }
      } catch (err) {
        console.error('Could not load job description:', err);
      }
    }
  }

  // Load resumes from API
  async function loadResumes() {
    try {
      const config = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      const endpoint = config.apiEndpoint || 'http://localhost:3000';
      const key = config.apiKey || apiKey;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
      }

      const response = await fetch(`${endpoint}/api/resumes`, { headers });
      if (!response.ok) throw new Error('Failed to load resumes');

      const data = await response.json();
      const resumes = data.resumes || [];

      resumeSelect.innerHTML = '';
      
      if (resumes.length === 0) {
        resumeSelect.innerHTML = '<option value="">No resumes found</option>';
        enableBtn.disabled = true;
        return;
      }

      resumes.forEach(resume => {
        const option = document.createElement('option');
        option.value = resume.id;
        option.textContent = resume.fileName || 'Resume';
        if (resume.isDefault) {
          option.selected = true;
        }
        resumeSelect.appendChild(option);
      });

      enableBtn.disabled = false;
    } catch (err) {
      console.error('Error loading resumes:', err);
      resumeSelect.innerHTML = '<option value="">Error loading resumes</option>';
      enableBtn.disabled = true;
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
      refreshJobBtn.textContent = 'Refresh Detection';
      refreshJobBtn.disabled = false;
    }, 2000);
  });

  // Enable autofill
  enableBtn.addEventListener('click', async () => {
    const resumeId = resumeSelect.value;
    const guidelines = guidelinesInput.value.trim();

    if (!resumeId) {
      alert('Please select a resume');
      return;
    }

    // Save guidelines
    await chrome.storage.sync.set({ guidelines });

    // Store context in session for this tab
    await chrome.storage.session.set({
      [`autofill_${currentTab.id}`]: {
        resumeId,
        guidelines,
        jobDescription: jobDescription?.text || '',
        enabled: true
      }
    });

    enableBtn.textContent = '✓ Autofill Enabled!';
    enableBtn.style.background = '#4CAF50';
    
    setTimeout(() => {
      window.close();
    }, 1000);
  });

  // Settings
  settingsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Initialize
  await loadJobDescription();
  await loadResumes();
});
