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
      'middleName',
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
      'github',
      'portfolio',
      'twitter',
      'pronouns',
      'currentCompany',
      'salary',
      'availability',
      'workAuth',
      'referral'
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

  if (message.type === 'LOAD_RESUME_DATA') {
    (async () => {
      try {
        // First try to get from local storage (cached)
        const cached = await chrome.storage.local.get(['resumeText', 'resumeLastUpdated']);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

        // If we have cached data less than 1 hour old, use it
        if (cached.resumeText && cached.resumeLastUpdated && (now - cached.resumeLastUpdated) < oneHour) {
          console.log('ResAid: Using cached resume data');
          sendResponse({ success: true, data: cached.resumeText });
          return;
        }

        // Otherwise, try to fetch from API
        const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
        console.log('ResAid: API settings - endpoint:', settings.apiEndpoint, 'hasApiKey:', !!settings.apiKey);

        if (settings.apiEndpoint && settings.apiKey) {
          console.log('ResAid: Fetching resume from API:', `${settings.apiEndpoint}/api/user/resume`);

          const response = await fetch(`${settings.apiEndpoint}/api/user/resume`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${settings.apiKey}`,
              'Content-Type': 'application/json'
            }
          });

          console.log('ResAid: API response status:', response.status);

          if (response.ok) {
            const data = await response.json();
            console.log('ResAid: API response data keys:', Object.keys(data));

            const resumeText = data.parsedData ? JSON.stringify(data.parsedData) : (data.content || '');

            // Cache the resume data
            await chrome.storage.local.set({
              resumeText: resumeText,
              resumeLastUpdated: now
            });

            console.log('ResAid: Resume data loaded and cached, length:', resumeText.length);
            sendResponse({ success: true, data: resumeText });
          } else {
            const errorText = await response.text();
            console.error('ResAid: API error response:', response.status, errorText);
            sendResponse({ success: false, error: `API error: ${response.status} ${errorText}` });
          }
        } else {
          console.log('ResAid: Missing API settings - endpoint:', !!settings.apiEndpoint, 'apiKey:', !!settings.apiKey);
          sendResponse({ success: false, error: 'Missing API settings' });
        }

        // Fallback to cached data if API fails
        if (cached.resumeText) {
          console.log('ResAid: Using cached resume data (API failed)');
          sendResponse({ success: true, data: cached.resumeText });
        } else {
          sendResponse({ success: false, error: 'No cached data available' });
        }

      } catch (err) {
        console.error('ResAid: Error loading resume data:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
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

  if (message.type === 'SYNC_RESUMES') {
    (async () => {
      try {
        const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
        if (!settings.apiEndpoint || !settings.apiKey) {
          sendResponse({ success: false, error: 'API not configured' });
          return;
        }

        console.log('Syncing resumes from API...');

        const response = await fetch(`${settings.apiEndpoint}/api/user/resumes`, {
          headers: {
            'Authorization': `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          sendResponse({ success: false, error: `API error: ${response.status}` });
          return;
        }

        const resumes = await response.json();

        // Store resume data locally for AI use
        if (resumes && resumes.length > 0) {
          const latestResume = resumes[0]; // Use most recent resume
          const resumeText = latestResume.parsedData ? JSON.stringify(latestResume.parsedData) : (latestResume.content || '');

          await chrome.storage.local.set({
            resumeText: resumeText,
            resumeLastUpdated: Date.now(),
            lastResumeId: latestResume.id
          });

          console.log('Resume data synced successfully');
          sendResponse({ success: true, resumeCount: resumes.length });
        } else {
          sendResponse({ success: true, resumeCount: 0 });
        }

      } catch (err) {
        console.error('Error syncing resumes:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

async function handleGenerateAnswer(data, tabId) {
  const { resumeId, question, jobDescription, guidelines } = data;

  try {
    // Get AI settings
    const aiSettings = await chrome.storage.sync.get(['aiApiKey', 'aiModel', 'aiEnabled']);
    
    if (!aiSettings.aiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (aiSettings.aiEnabled === false) {
      throw new Error('AI question answering is disabled');
    }

    // Get resume data
    let resumeText = '';
    if (resumeId) {
      // Try to get from local storage first
      const cached = await chrome.storage.local.get(['resumeText']);
      if (cached.resumeText) {
        resumeText = cached.resumeText;
      } else {
        // Try to fetch from API if not cached
        const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
        if (settings.apiEndpoint && settings.apiKey) {
          try {
            const response = await fetch(`${settings.apiEndpoint}/api/user/resume`, {
              headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json'
              }
            });
            if (response.ok) {
              const data = await response.json();
              resumeText = data.parsedData ? JSON.stringify(data.parsedData) : (data.content || '');
              
              // Cache for future use
              await chrome.storage.local.set({
                resumeText: resumeText,
                resumeLastUpdated: Date.now()
              });
            }
          } catch (err) {
            console.log('Failed to fetch resume from API:', err);
          }
        }
      }
    }

    // Log the full resumeText and jobDescription for inspection
    console.log('ResAid: Full Resume Text:', resumeText);
    console.log('ResAid: Full Job Description:', jobDescription);

    const prompt = `You are a professional Resume writer. Answer this question based on their resume and the job description provided. Keep your answer professional, concise, and relevant to the job application context."

Question: ${question}

${resumeText ? `Resume: ${resumeText.substring(0, 6000)}` : ''}

${jobDescription ? `Job Description: ${jobDescription.substring(0, 10000)}` : ''}

${guidelines ? `Additional Guidelines: ${guidelines}` : ''}

Answer the question directly and naturally, as if the applicant is writing it themselves. Keep it between 150 and 250 words.  Aim for clarity, relevance and impact; use as many words as needed to fully answer the competency prompt but stop short of the maximum unless every sentence adds value`;

    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiSettings.aiApiKey}`
    };
    const body = JSON.stringify({
      model: aiSettings.aiModel || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7
    });

    console.log('Calling OpenAI API for question:', question.substring(0, 50) + '...');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const result = await response.json();
    const answer = result.choices?.[0]?.message?.content || '';

    console.log('OpenAI answer generated successfully');
    return { 
      answer: answer.trim(),
      model: aiSettings.aiModel || 'gpt-4o-mini',
      source: 'openai'
    };

  } catch (error) {
    console.error('Error generating answer:', error);
    throw error;
  }
}
