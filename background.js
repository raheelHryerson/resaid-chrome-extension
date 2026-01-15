// Background service worker for ResAid extension
// Handles message routing and cross-tab coordination

chrome.runtime.onInstalled.addListener(() => {
  console.log('ResAid extension installed');
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id || null });
  }

  if (message.type === 'EXTRACT_JOB_DESCRIPTION') {
    // Store job description in session storage for this tab
    chrome.storage.session.set({
      [`jobDescription_${sender.tab.id}`]: {
        text: message.data.text,
        url: sender.tab.url,
        timestamp: Date.now()
      }
    });

    // Also store last detected globally for carry-over across tabs
    try {
      const host = (() => {
        try {
          const u = new URL(sender.tab.url || '');
          return u.host || '';
        } catch (_) {
          return '';
        }
      })();

      // Only persist globally if it looks like a real job description
      const text = (message.data.text || '').trim();
      const hasKeywords = ['responsibilities','requirements','qualifications','experience','skills','role','position']
        .some(kw => text.toLowerCase().includes(kw));
      const looksValid = hasKeywords && text.length >= 300 || text.length >= 800;
      if (!looksValid) {
        sendResponse({ success: true });
        return;
      }

      chrome.storage.session.set({
        jobDescription_last: {
          text: message.data.text,
          url: sender.tab.url,
          host,
          timestamp: Date.now()
        }
      });
    } catch (e) {
      // ignore
    }
    sendResponse({ success: true });
  }

  if (message.type === 'GENERATE_ANSWER') {
    // Forward to API endpoint
    handleGenerateAnswer(message.data, sender.tab.id)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_JOB_DESCRIPTION') {
    chrome.storage.session.get([`jobDescription_${message.tabId}`], (result) => {
      const data = result[`jobDescription_${message.tabId}`];
      sendResponse({ success: true, data });
    });
    return true;
  }

  if (message.type === 'GET_AUTOFILL_CONTEXT') {
    chrome.storage.session.get([`autofill_${sender.tab.id}`], (result) => {
      const context = result[`autofill_${sender.tab.id}`];
      sendResponse({ success: true, data: context });
    });
    return true;
  }

  if (message.type === 'GET_PERSONAL_INFO') {
    chrome.storage.sync.get([
      'fullName',
      'firstName',
      'lastName', 
      'email', 
      'phone',
      'countryPhoneCode',
      'extension',
      'city',
      'postalCode',
      'location',
      'addressLine2',
      'country',
      'province', 
      'linkedin', 
      'currentCompany'
    ], (result) => {
      sendResponse({ success: true, data: result });
    });
    return true;
  }

  if (message.type === 'GET_FALLBACK_CONTEXT') {
    chrome.storage.sync.get([
      'lastResumeId',
      'guidelines'
    ], (result) => {
      sendResponse({ success: true, data: result });
    });
    return true;
  }

  if (message.type === 'SET_SMART_AUTOFILL') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.storage.session.set({ [`smartAutofill_${tabId}`]: !!message.enabled });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_SMART_AUTOFILL') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: true, enabled: false });
      return true;
    }
    chrome.storage.session.get([`smartAutofill_${tabId}`], (result) => {
      sendResponse({ success: true, enabled: !!result[`smartAutofill_${tabId}`] });
    });
    return true;
  }

  if (message.type === 'GET_LAST_JOB_DESCRIPTION') {
    chrome.storage.session.get(['jobDescription_last'], (result) => {
      sendResponse({ success: true, data: result.jobDescription_last || null });
    });
    return true;
  }

  if (message.type === 'CALCULATE_FIT_SCORE') {
    // Calculate fit score using scoring algorithm
    (async () => {
      try {
        const { jobDescription, resumeData } = message.data;
        
        // Import scoring functions from content.js context (send to active tab)
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) {
          sendResponse({ success: false, error: 'No active tab' });
          return;
        }

        // Execute scoring in content script context where functions exist
        const result = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SCORE_RESUME_JOB_MATCH',
          data: { jobDescription, resumeData }
        });

        sendResponse(result);
      } catch (err) {
        console.error('Error calculating fit score:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

async function handleGenerateAnswer(data, tabId) {
  const { resumeId, question, jobDescription, guidelines } = data;
  
  // Get API endpoint and key from storage
  const config = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
  const endpoint = config.apiEndpoint || 'http://localhost:3000';
  const apiKey = config.apiKey;

  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${endpoint}/api/resumes/${resumeId}/answers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jobDescription: jobDescription || '',
      questions: [question],
      tone: 'neutral',
      guidelines: guidelines || ''
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const result = await response.json();
  return result.answers?.[0] || null;
}
