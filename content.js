// Content script - runs on all pages to detect job descriptions and question fields
// Extracts context and enables autofill

(function() {
  'use strict';

  // Patterns for job description detection
  const JOB_DESCRIPTION_SELECTORS = [
    // Common class/id patterns
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '[class*="job-details"]',
    '[class*="description"]',
    'div[data-automation*="jobDescription"]',
    '[role="article"]',
    
    // Workday specific
    '[data-automation-id="jobPostingDescription"]',
    '.job-description',
    
    // LinkedIn
    '.description__text',
    '.show-more-less-html__markup',
    
    // Greenhouse
    '#content .content',
    
    // Lever
    '.posting-description',
    
    // Generic fallbacks
    'article',
    'main'
  ];

  const QUESTION_FIELD_SELECTORS = [
    'textarea',
    'input[type="text"]',
    '[contenteditable="true"]',
    'div[role="textbox"]'
  ];

  // Field patterns for instant autofill
  const FIELD_PATTERNS = {
    fullName: ['name', 'fullname', 'full_name', 'applicantname', 'candidatename', 'your name'],
    firstName: ['firstname', 'first_name', 'fname', 'givenname'],
    lastName: ['lastname', 'last_name', 'lname', 'surname', 'familyname'],
    email: ['email', 'e-mail', 'emailaddress', 'mail'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'phonenumber', 'contact'],
    linkedin: ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedinprofile'],
    location: ['location', 'city', 'address', 'residence', 'currentlocation'],
    currentCompany: ['company', 'employer', 'organization', 'currentcompany', 'current_company']
  };

  // State
  let detectedJobDescription = null;
  let activeField = null;
  let personalInfo = null;

  // Helper to get current tab ID
  async function getCurrentTabId() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
        resolve(response?.tabId || null);
      });
    });
  }

  // Extract job description from page
  function extractJobDescription() {
    for (const selector of JOB_DESCRIPTION_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.innerText || el.textContent;
        if (text && text.length > 200) { // Minimum length heuristic
          // Check for job-related keywords
          const keywords = ['responsibilities', 'requirements', 'qualifications', 'experience', 'skills'];
          const hasKeywords = keywords.some(kw => text.toLowerCase().includes(kw));
          
          if (hasKeywords) {
            return {
              text: text.trim(),
              element: el,
              confidence: 'high'
            };
          }
        }
      }
    }
    
    // Fallback: find largest text block
    const allElements = document.querySelectorAll('div, article, section');
    let longest = null;
    let maxLength = 0;
    
    for (const el of allElements) {
      const text = el.innerText || el.textContent;
      if (text && text.length > maxLength && text.length > 500) {
        maxLength = text.length;
        longest = { text: text.trim(), element: el, confidence: 'low' };
      }
    }
    
    return longest;
  }

  // Find question context from field
  function getQuestionContext(field) {
    // Try to find associated label
    let question = '';
    
    // Method 1: Label element
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) {
        question = label.innerText || label.textContent;
      }
    }
    
    // Method 2: Closest label
    if (!question) {
      const closestLabel = field.closest('label');
      if (closestLabel) {
        question = closestLabel.innerText || closestLabel.textContent;
      }
    }
    
    // Method 3: Aria-label
    if (!question) {
      question = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || '';
    }
    
    // Method 4: Placeholder
    if (!question) {
      question = field.getAttribute('placeholder') || '';
    }
    
    // Method 5: Look at previous sibling or parent text
    if (!question) {
      const parent = field.parentElement;
      if (parent) {
        const prevSibling = field.previousElementSibling;
        if (prevSibling) {
          question = prevSibling.innerText || prevSibling.textContent || '';
        }
        if (!question) {
          // Get parent's first text node
          for (const child of parent.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
              question = child.textContent.trim();
              break;
            }
          }
        }
      }
    }
    
    return question.trim().replace(/\s+/g, ' ').slice(0, 500);
  }

  // Inject answer into field
  function fillField(field, answer) {
    if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
      field.value = answer;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (field.contentEditable === 'true' || field.getAttribute('contenteditable') === 'true') {
      field.innerText = answer;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Highlight briefly
    const originalBorder = field.style.border;
    field.style.border = '2px solid #4CAF50';
    setTimeout(() => {
      field.style.border = originalBorder;
    }, 2000);
  }

  // Listen for focus on question fields
  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (QUESTION_FIELD_SELECTORS.some(sel => target.matches(sel))) {
      activeField = target;
      const question = getQuestionContext(target);
      
      // Show ResAid assist button near field
      if (question && question.length > 5) {
        showAssistButton(target, question);
      }
    }
  });

  // Show assist button
  function showAssistButton(field, question) {
    // Remove existing button
    const existing = document.getElementById('resaid-assist-btn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.id = 'resaid-assist-btn';
    btn.innerText = '✨ ResAid';
    btn.style.cssText = `
      position: absolute;
      z-index: 999999;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: all 0.2s;
    `;
    
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    });
    
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      btn.innerText = '⏳ Generating...';
      btn.disabled = true;
      
      try {
        // Get autofill context from background script (avoids CSP issues)
        const contextResponse = await chrome.runtime.sendMessage({
          type: 'GET_AUTOFILL_CONTEXT'
        });
        
        const context = contextResponse?.data;
        
        if (!context || !context.enabled) {
          throw new Error('Autofill not enabled. Open the extension popup first.');
        }
        
        // Request answer generation from background
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_ANSWER',
          data: {
            resumeId: context.resumeId,
            question: question,
            jobDescription: context.jobDescription,
            guidelines: context.guidelines
          }
        });
        
        if (response.success && response.data) {
          fillField(field, response.data.answer);
          btn.remove();
        } else {
          throw new Error(response.error || 'Failed to generate answer');
        }
      } catch (err) {
        console.error('ResAid autofill error:', err);
        btn.innerText = '❌ ' + (err.message || 'Error');
        setTimeout(() => btn.remove(), 3000);
      }
    });
    
    // Position near field
    const rect = field.getBoundingClientRect();
    btn.style.top = (window.scrollY + rect.top - 35) + 'px';
    btn.style.left = (window.scrollX + rect.right - 100) + 'px';
    
    document.body.appendChild(btn);
    
    // Remove on blur
    field.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.getElementById('resaid-assist-btn')) {
          btn.remove();
        }
      }, 200);
    }, { once: true });
  }

  // Detect field type based on attributes
  function detectFieldType(field) {
    const attributes = [
      field.name,
      field.id,
      field.getAttribute('aria-label'),
      field.getAttribute('placeholder'),
      field.getAttribute('data-automation-id'),
      field.className
    ].filter(Boolean).join(' ').toLowerCase();

    for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (patterns.some(pattern => attributes.includes(pattern))) {
        return fieldType;
      }
    }

    return null;
  }

  // Auto-fill common fields
  async function autoFillCommonFields() {
    if (!personalInfo) {
      // Load personal info from storage
      const result = await chrome.runtime.sendMessage({ type: 'GET_PERSONAL_INFO' });
      personalInfo = result?.data || {};
    }

    // Skip if no personal info
    if (!personalInfo || Object.keys(personalInfo).length === 0) {
      return;
    }

    // Find all input fields
    const fields = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"]');
    
    for (const field of fields) {
      // Skip if already filled
      if (field.value && field.value.trim().length > 0) {
        continue;
      }

      const fieldType = detectFieldType(field);
      
      if (fieldType && personalInfo[fieldType]) {
        // Special handling for name fields
        if (fieldType === 'firstName' && personalInfo.fullName) {
          const firstName = personalInfo.fullName.split(' ')[0];
          fillField(field, firstName);
        } else if (fieldType === 'lastName' && personalInfo.fullName) {
          const parts = personalInfo.fullName.split(' ');
          const lastName = parts.slice(1).join(' ');
          fillField(field, lastName);
        } else {
          fillField(field, personalInfo[fieldType]);
        }
      }
    }
  }

  // Auto-extract job description on page load
  setTimeout(() => {
    const jd = extractJobDescription();
    if (jd) {
      detectedJobDescription = jd;
      chrome.runtime.sendMessage({
        type: 'EXTRACT_JOB_DESCRIPTION',
        data: { text: jd.text, confidence: jd.confidence }
      });
      console.log('ResAid: Job description detected');
    }

    // Auto-fill common fields after a short delay
    setTimeout(() => {
      autoFillCommonFields();
    }, 1500);
  }, 1000);

  // Also watch for new fields added dynamically (SPA sites like Workday)
  const observer = new MutationObserver(() => {
    autoFillCommonFields();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_JOB_DESCRIPTION') {
      sendResponse({ success: true, data: detectedJobDescription });
    }
    
    if (message.type === 'FILL_ACTIVE_FIELD') {
      if (activeField && message.answer) {
        fillField(activeField, message.answer);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No active field' });
      }
    }

    if (message.type === 'TRIGGER_AUTOFILL') {
      autoFillCommonFields();
      sendResponse({ success: true });
    }
    
    return true;
  });

})();
