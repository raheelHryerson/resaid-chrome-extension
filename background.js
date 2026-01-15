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
      'email', 
      'phone', 
      'linkedin', 
      'location', 
      'currentCompany'
    ], (result) => {
      sendResponse({ success: true, data: result });
    });
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
