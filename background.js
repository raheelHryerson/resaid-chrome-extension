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

  if (message.type === 'SAVE_APPLICATION') {
    // Save application to local storage for tracker
    chrome.storage.local.get(['applications'], (result) => {
      const applications = result.applications || [];
      const newApplication = {
        id: Date.now().toString(),
        company: message.data.company,
        position: message.data.position,
        matchScore: message.data.matchScore,
        status: message.data.status,
        notes: message.data.notes,
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString()
      };
      
      applications.unshift(newApplication);
      chrome.storage.local.set({ applications });
      sendResponse({ success: true, id: newApplication.id });
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

  // Local heuristic-based answer generation using stored profile data
  const profile = await chrome.storage.sync.get([
    'fullName','firstName','lastName','email','phone','city','country','linkedin',
    'expectedSalary','yearsExperience','currentCompany','willingRelocate','workAuthorization','noticePeriod'
  ]);

  const name = profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'I';
  const years = profile.yearsExperience ? `${profile.yearsExperience} years` : null;
  const company = profile.currentCompany || null;
  const relocate = profile.willingRelocate ? 'I am open to relocation' : '';
  const auth = profile.workAuthorization ? `Work authorization: ${profile.workAuthorization}.` : '';

  const jdSynopsis = (jobDescription || '').slice(0, 280).replace(/\s+/g, ' ').trim();
  const keepShort = (guidelines || '').toLowerCase().includes('under 200 words');

  const intro = `Hello, my name is ${name}.`;
  const exp = years ? ` I have ${years} of experience` : '';
  const curr = company ? `, most recently at ${company}.` : '.';
  const role = jdSynopsis ? ` I reviewed the role and its requirements: ${jdSynopsis}` : '';
  const close = ` ${relocate} ${auth}`.trim();

  let answerText = `${intro}${exp}${curr}${role} ${question ? `Here's my response: ${question}` : ''}`.trim();
  if (keepShort && answerText.length > 900) {
    answerText = answerText.slice(0, 900) + '...';
  }

  return { answer: answerText, model: 'local' };
}
