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
    
    // Workday specific (expanded)
    '[data-automation-id="jobPostingDescription"]',
    '[data-automation-id*="jobDescription"]',
    '[data-automation-id*="jobPosting"]',
    '[data-automation-id*="jobDetail"]',
    '[data-automation-id*="jobSummary"]',
    '[data-qa*="job-description"]',
    '[data-testid*="job-description"]',
    '.job-description',
    '[class*="workday-job-description"]',
    '[class*="job-posting-description"]',
    '[class*="job-details"]',
    '[class*="jobDetail"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '[id*="jobDetail"]',
    // Generic job content containers
    '[class*="description"]',
    '[class*="responsibilities"]',
    '[class*="qualifications"]',
    '[class*="requirements"]',
    
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

  // Keyword-based field detection (more reliable than patterns)
  const FIELD_KEYWORDS = {
    firstName: ['firstname', 'first_name', 'fname', 'givenname', 'first', 'given_name', 'forename'],
    lastName: ['lastname', 'last_name', 'lname', 'surname', 'familyname', 'family_name', 'last'],
    middleName: ['middlename', 'middle_name', 'mname', 'middle'],
    fullName: ['fullname', 'full_name', 'name', 'applicantname', 'candidatename'],
    email: ['email', 'e-mail', 'emailaddress'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'phonenumber'],
    extension: ['extension', 'ext'],
    countryPhoneCode: ['countrycode', 'country_code', 'countryphonecode', 'intlcode'],
    linkedin: ['linkedin', 'linkedinurl'],
    github: ['github', 'githuburl'],
    portfolio: ['portfolio', 'website', 'personalwebsite'],
    twitter: ['twitter', 'twitterurl'],
    pronouns: ['pronouns'],
    city: ['city', 'town'],
    postalCode: ['postal', 'zip', 'zipcode', 'postcode', 'postalcode'],
    country: ['country', 'nation', 'countryregion'],
    location: ['address', 'location', 'residence'],
    currentCompany: ['company', 'employer', 'organization', 'currentcompany'],
    salary: ['salary', 'compensation'],
    availability: ['availability', 'startdate'],
    workAuth: ['workauth', 'visa', 'workpermit'],
    referral: ['referral', 'referredby', 'source']
  };

  // Field patterns for instant autofill (fallback when keywords don't match)
  const FIELD_PATTERNS = {
    // Order matters: more specific patterns BEFORE broader ones
    firstName: ['legalname--firstname', 'legalname--firstName', 'first name', 'first-name', 'given_name', 'given-name', 'name_first', 'firstName', 'first-name-input', 'input-firstname', 'first_name_field'],
    middleName: ['middle name'],
    lastName: ['legalname--lastname', 'legalname--lastName', 'legalName--lastName', 'last name', 'last-name', 'family_name', 'family-name', 'surname_field', 'lastName', 'last-name-input', 'input-lastname', 'last_name_field'],
    fullName: ['full name', 'legal name', 'legalname', 'your name'],
    email: ['e-mail', 'email address'],
    // Put extension and country code before phone so "phoneNumber--extension" maps correctly
    countryPhoneCode: ['country code', 'country phone code', 'phone country', 'intl code', 'countryphonecode', 'phoneNumber--countryPhoneCode'],
    phone: ['telephone', 'mobile', 'cell', 'contact', 'phone number', 'phoneNumber'],
    extension: ['phone extension', 'ext number', 'phoneNumber--extension'],
    linkedin: ['linkedin_url', 'linkedinprofile', 'linkedin profile'],
    github: ['github_url', 'githubprofile', 'github profile'],
    portfolio: ['personal website', 'personal site', 'portfolio url', 'website url'],
    twitter: ['twitter_url', 'twitterprofile', 'twitter profile'],
    pronouns: ['preferred pronouns', 'gender pronouns'],
    // Specific address fields BEFORE generic location
    postalCode: ['zip code', 'postal code', 'postalCode'],
    city: ['city of residence'],
    country: ['province', 'territory', 'region', 'state', 'provinceorterritory'],
    location: ['addressline1', 'addressline2', 'address1', 'address2', 'street', 'currentlocation', 'current location'],
    currentCompany: ['current_company', 'current employer'],
    salary: ['salary expectation', 'expected salary', 'salary range'],
    availability: ['available date', 'start date', 'available to start', 'notice period'],
    workAuth: ['work authorization', 'work auth', 'visa status', 'work permit', 'eligible to work'],
    referral: ['referred by', 'how did you hear', 'referral source']
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

  // Extract job description using multi-signal candidate scoring
  function extractJobDescription() {
    // Step 1: Candidate Extraction
    const candidates = extractCandidates();
    
    if (candidates.length === 0) {
      console.log('ResAid: No candidates found');
      return null;
    }

    // Step 2-5: Score candidates across multiple signals
    const scoredCandidates = candidates.map(candidate => ({
      ...candidate,
      score: scoreCandidate(candidate)
    })).sort((a, b) => b.score.total - a.score.total);

    // Log top candidates with detailed scoring
    const topCandidates = scoredCandidates.slice(0, 3);
    console.log('\nResAid: Job Description Scoring Results');
    console.log('═══════════════════════════════════════════════════════════════');
    topCandidates.forEach((c, idx) => {
      console.log(`\nCandidate ${idx + 1}:`);
      console.log(`   Overall Confidence: ${(c.score.total * 100).toFixed(0)}%`);
      console.log(`   Text Length: ${c.text.length} chars`);
      console.log(`   Signal Breakdown:`);
      if (c.score.signalBreakdown) {
        Object.entries(c.score.signalBreakdown).forEach(([signal, points]) => {
          const pct = (points * 100).toFixed(0);
          console.log(`     • ${signal}: ${pct}%`);
        });
      }
      console.log(`   Contributing Factors: ${c.score.reasons.join(', ')}`);
    });
    console.log('\n═══════════════════════════════════════════════════════════════\n');

    // Step 3: Return highest confidence if >= 0.75
    if (scoredCandidates[0] && scoredCandidates[0].score.total >= 0.75) {
      return {
        text: scoredCandidates[0].text.trim(),
        element: scoredCandidates[0].element,
        confidence: scoredCandidates[0].score.total,
        reasons: scoredCandidates[0].score.reasons
      };
    }

    // Fallback: if confidence 0.3-0.75, return with medium confidence (lowered threshold)
    if (scoredCandidates[0] && scoredCandidates[0].score.total >= 0.3) {
      console.log('ResAid: Accepting candidate with confidence:', scoredCandidates[0].score.total);
      return {
        text: scoredCandidates[0].text.trim(),
        element: scoredCandidates[0].element,
        confidence: scoredCandidates[0].score.total,
        reasons: scoredCandidates[0].score.reasons
      };
    }

    console.log('ResAid: All candidates below confidence threshold');
    
    // Debug: Log all candidates with their scores for troubleshooting
    if (scoredCandidates.length > 0) {
      console.log('ResAid: Debug - All candidates and scores:');
      scoredCandidates.slice(0, 5).forEach((c, idx) => {
        console.log(`  Candidate ${idx + 1}: ${c.score.total.toFixed(3)} confidence, ${c.text.length} chars`);
        console.log(`    Reasons: ${c.score.reasons.join(', ')}`);
        console.log(`    Signal breakdown:`, c.score.signalBreakdown);
        console.log(`    Text preview: "${c.text.substring(0, 200)}..."`);
      });
    }
    
    return null;
  }

  function extractCandidates() {
    const candidates = [];
    const seen = new Set();
    
    console.log('ResAid: Starting candidate extraction...');
    
    // Collect from known selectors first
    const JOB_DESCRIPTION_SELECTORS = [
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[id*="job-description"]',
      '[id*="jobDescription"]',
      '[class*="job-details"]',
      '[data-automation-id="jobPostingDescription"]',
      '[data-automation-id*="jobDescription"]',
      '[data-automation-id*="jobPosting"]',
      '[data-automation-id*="jobDetail"]',
      '[data-automation-id*="jobSummary"]',
      '[data-qa*="job-description"]',
      '[data-testid*="job-description"]',
      '.job-description',
      '.description__text',
      '.show-more-less-html__markup',
      '.posting-description',
      '[class*="workday-job-description"]',
      '[class*="job-posting-description"]',
      '[class*="jobDetail"]',
      '[id*="jobDetail"]',
      // Generic job content containers
      '[class*="description"]',
      '[class*="responsibilities"]',
      '[class*="qualifications"]',
      '[class*="requirements"]'
    ];

    for (const selector of JOB_DESCRIPTION_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) console.log(`ResAid: Found ${elements.length} elements for selector: ${selector}`);
      for (const el of elements) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text && text.length >= 1000 && text.length <= 15000 && !seen.has(text)) {
          if (isVisible(el) && !isInNavFooter(el) && !isNavigationNoise(text, el)) {
            candidates.push({ element: el, text });
            seen.add(text);
            console.log(`ResAid: Added candidate from selector (${text.length} chars)`);
          }
        }
      }
    }

    // Collect from generic containers
    const containers = document.querySelectorAll('section, article, div[role="article"], [class*="prose"]');
    console.log(`ResAid: Found ${containers.length} generic containers`);
    for (const el of containers) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text && text.length >= 1000 && text.length <= 20000 && !seen.has(text)) {
        if (isVisible(el) && !isInNavFooter(el) && !isNavigationNoise(text, el)) {
          candidates.push({ element: el, text });
          seen.add(text);
          console.log(`ResAid: Added candidate from container (${text.length} chars)`);
        } else {
          console.log(`ResAid: Rejected container: visible=${isVisible(el)}, inNav=${isInNavFooter(el)}, isNoise=${isNavigationNoise(text, el)}, length=${text.length}`);
        }
      }
    }

    // Fallback: Look for divs containing job posting keywords
    const allDivs = document.querySelectorAll('div, section, article');
    console.log(`ResAid: Checking ${allDivs.length} elements in fallback...`);
    let fallbackChecked = 0;
    for (const el of allDivs) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text && text.length >= 1000 && text.length <= 20000 && !seen.has(text)) {
        fallbackChecked++;
        // Look for multiple job posting indicators
        const hasJobKeywords = /\b(job\s+description|description:|responsibilities:|qualifications:|requirements:|what you['']ll do|minimum qualifications|nice to have|about this role|in this role)\b/i.test(text);
        if (hasJobKeywords) {
          const visible = isVisible(el);
          const inNav = isInNavFooter(el);
          const noise = isNavigationNoise(text, el);
          console.log(`ResAid: Fallback element (${text.length} chars): hasKeywords=true, visible=${visible}, inNav=${inNav}, isNoise=${noise}`);
          if (visible && !inNav && !noise) {
            candidates.push({ element: el, text });
            seen.add(text);
            console.log(`ResAid: Added candidate from fallback (${text.length} chars)`);
          }
        }
      }
    }
    console.log(`ResAid: Checked ${fallbackChecked} divs in fallback`);

    return candidates;
  }

  function isNavigationNoise(text, element) {
    // Never filter elements with explicit job description class/id
    if (element) {
      const className = (element.className || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      if (className.includes('job-description') || 
          className.includes('jobdescription') || 
          id.includes('job-description') || 
          id.includes('jobdescription')) {
        return false; // Always include
      }
    }

    // Filter out common navigation/header patterns
    const navPatterns = [
      /skip.{0,10}content/i,
      /individuals|companies|advisors|brokers/i,
      /^(fr|en|log in|sign up|sign in|search|menu)/i,
      /our current job postings/i
    ];

    // Check for explicit job description headers (don't filter if present)
    const hasJobDescriptionHeader = /\b(job\s+description|description:|responsibilities:|qualifications:|minimum qualifications)\b/i.test(text.substring(0, 1000));
    if (hasJobDescriptionHeader) return false; // Always include if has explicit header

    // Count metadata-like lines (e.g., "Employer: X", "Location: Y")
    const firstPart = text.substring(0, 800);
    const metadataInFirst = (firstPart.match(/^[a-z\s]+:\s+[a-z0-9\s,.-]+$/gim) || []).length;
    
    // If more than 8 metadata lines in first 800 chars, it's probably metadata-heavy
    // (This allows for some metadata like "Location", "Hours", "Pay" but filters pure metadata dumps)
    const hasNavPattern = navPatterns.some(pattern => pattern.test(firstPart));
    
    return hasNavPattern || metadataInFirst > 8;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.height > 0 && rect.width > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  function isInNavFooter(element) {
    // Never filter elements with explicit job description class/id
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    if (className.includes('job-description') || 
        className.includes('jobdescription') || 
        id.includes('job-description') || 
        id.includes('jobdescription')) {
      return false; // Always include - even if technically in a nav wrapper
    }

    // Check if element contains job-related content - if so, don't filter
    const elementText = (element.innerText || element.textContent || '').toLowerCase();
    const hasJobContent = /\b(responsibilities|qualifications|requirements|job description|role and responsibilities|what you['']ll do|about this role)\b/i.test(elementText);
    if (hasJobContent) {
      return false; // Don't filter if it contains job content
    }

    let current = element;
    while (current) {
      // Check if current element is nav, footer, header, or has nav-related classes
      const tagName = current.tagName?.toLowerCase();
      const currentClass = (current.className || '').toLowerCase();
      const currentId = (current.id || '').toLowerCase();
      
      if (tagName === 'nav' || tagName === 'footer' || tagName === 'header' ||
          currentClass.includes('nav') || currentClass.includes('navigation') ||
          currentClass.includes('footer') || currentClass.includes('header') ||
          currentId.includes('nav') || currentId.includes('navigation') ||
          currentId.includes('footer') || currentId.includes('header')) {
        return true; // This element is inside navigation or footer
      }
      
      current = current.parentElement;
    }
    return false;
  }

  function scoreCandidate(candidate) {
    let score = 0;
    const reasons = [];
    const text = candidate.text.toLowerCase();
    const signalBreakdown = {};

    // Signal 1: Header proximity (0-0.25)
    const headerScore = scoreHeaderProximity(candidate.element, text);
    score += headerScore.score;
    signalBreakdown['Header Proximity'] = headerScore.score;
    if (headerScore.found) reasons.push('has job description headers');

    // Signal 2: Structural composition (0-0.20)
    const structScore = scoreStructure(candidate.text);
    score += structScore.score;
    signalBreakdown['Structure'] = structScore.score;
    reasons.push(...structScore.reasons);

    // Signal 3: Linguistic signals (0-0.25)
    const lingScore = scoreLinguistic(text);
    score += lingScore.score;
    signalBreakdown['Linguistics'] = lingScore.score;
    reasons.push(...lingScore.reasons);

    // Signal 4: Layout & position (0-0.15)
    const layoutScore = scoreLayout(candidate.element);
    score += layoutScore.score;
    signalBreakdown['Layout'] = layoutScore.score;
    if (layoutScore.nearTop) reasons.push('near top of page');

    // Signal 5: Page metadata (0-0.15)
    const metaScore = scoreMetadata();
    score += metaScore.score;
    signalBreakdown['Page Metadata'] = metaScore.score;
    if (metaScore.titleMatches) reasons.push('title mentions job/career');

    const total = Math.min(score, 1.0);
    return { 
      total, 
      signalBreakdown,
      reasons: reasons.length > 0 ? reasons : ['generic text block'] 
    };
  }

  function scoreHeaderProximity(element, text) {
    const jobHeaders = [
      'job description', 'responsibilities', 'what you\'ll do',
      'requirements', 'qualifications', 'about the role',
      'about this position', 'what you will', 'essential duties',
      'role description', 'position overview'
    ];

    const hasInternalHeader = jobHeaders.some(h => text.includes(h));
    
    // Check if header is immediately above element
    let prevEl = element.previousElementSibling;
    let siblingHeaderMatch = false;
    for (let i = 0; i < 3 && prevEl; i++) {
      const siblingText = (prevEl.innerText || prevEl.textContent || '').toLowerCase();
      if (jobHeaders.some(h => siblingText.includes(h))) {
        siblingHeaderMatch = true;
        break;
      }
      prevEl = prevEl.previousElementSibling;
    }

    const headerScore = (hasInternalHeader ? 0.2 : 0) + (siblingHeaderMatch ? 0.05 : 0);
    return { score: headerScore, found: hasInternalHeader || siblingHeaderMatch };
  }

  function scoreStructure(text) {
    let score = 0;
    const reasons = [];

    // Check for multiple paragraphs
    const paragraphCount = (text.match(/\n\n+/g) || []).length;
    if (paragraphCount >= 3) {
      score += 0.08;
      reasons.push('multiple paragraphs');
    }

    // Check for bullet lists
    const bulletCount = (text.match(/^[\s]*[-•*][\s]/m) || []).length;
    if (bulletCount >= 3) {
      score += 0.12;
      reasons.push('has bullet lists');
    }

    // Penalize single-paragraph blocks
    if (paragraphCount === 0 && bulletCount === 0) {
      score -= 0.05;
    }

    return { score: Math.max(score, 0), reasons };
  }

  function scoreLinguistic(text) {
    let score = 0;
    const reasons = [];

    // Strong phrases (flexible matching)
    const strongPhrases = [
      'you will', 'you\'ll', 'responsibilities', 'requirements', 'qualifications',
      'we are looking', 'we\'re looking', 'we seek', 'we need',
      'ideal candidate', 'the right person',
      'in this role', 'for this role', 'about this role',
      'what you\'ll', 'what you will', 'what you bring',
      'key responsibilities', 'main responsibilities',
      'must have', 'must know', 'essential', 'required',
      'nice to have', 'bonus', 'preferred',
      'about you', 'your background', 'your experience'
    ];

    const strongMatches = strongPhrases.filter(p => text.includes(p)).length;
    score += Math.min(strongMatches * 0.03, 0.22); // Slightly higher cap
    if (strongMatches > 0) reasons.push(`has ${strongMatches} job phrases`);

    // Action verbs (strong indicator of job description)
    const actionVerbs = [
      'lead', 'develop', 'oversee', 'manage', 'coordinate', 'ensure',
      'build', 'create', 'design', 'implement', 'establish', 'maintain',
      'assist', 'support', 'collaborate', 'partner', 'contribute',
      'prepare', 'analyze', 'evaluate', 'assess', 'monitor', 'track',
      'drive', 'improve', 'optimize', 'enhance', 'strengthen'
    ];

    const verbMatches = actionVerbs.filter(v => text.includes(' ' + v + ' ') || text.includes('\n' + v + ' ')).length;
    score += Math.min(verbMatches * 0.01, 0.03); // Bonus for action verbs
    if (verbMatches >= 5) reasons.push('strong action verbs');

    // Weak/negative phrases (penalize)
    const weakPhrases = [
      'privacy policy',
      'terms and conditions',
      'cookie settings',
      'contact us',
      'subscribe',
      'follow us',
      'copyright',
      'all rights reserved'
    ];

    const weakMatches = weakPhrases.filter(p => text.includes(p)).length;
    score -= Math.min(weakMatches * 0.02, 0.10); // Lighter penalty

    return { score: Math.max(score, 0), reasons };
  }

  function scoreLayout(element) {
    let score = 0;
    let nearTop = false;

    const rect = element.getBoundingClientRect();
    
    // Distance from top (0-0.08)
    if (rect.top < window.innerHeight * 2) {
      score += 0.08;
      nearTop = true;
    } else if (rect.top < window.innerHeight * 4) {
      score += 0.04;
    }

    // Width relative to viewport (0-0.07)
    const widthRatio = rect.width / window.innerWidth;
    if (widthRatio > 0.6) {
      score += 0.07;
    } else if (widthRatio > 0.4) {
      score += 0.04;
    }

    return { score, nearTop };
  }

  function scoreMetadata() {
    let score = 0;
    let titleMatches = false;

    const title = (document.title || '').toLowerCase();
    const ogTitle = (document.querySelector('meta[property="og:title"]')?.content || '').toLowerCase();
    const h1 = (document.querySelector('h1')?.innerText || '').toLowerCase();

    const jobKeywords = ['job', 'career', 'apply', 'role', 'position', 'hiring'];
    
    if (jobKeywords.some(k => title.includes(k)) || jobKeywords.some(k => ogTitle.includes(k))) {
      score += 0.10;
      titleMatches = true;
    }

    if (jobKeywords.some(k => h1.includes(k))) {
      score += 0.05;
      titleMatches = true;
    }

    return { score, titleMatches };
  }

  // ============================================
  // RESUME-JOB FIT SCORING SYSTEM (Phase 2)
  // ============================================

  async function scoreResumeJobMatch(jobDescription, resumeData) {
    // Score how well the resume matches a job description (0-100)
    if (!jobDescription || !resumeData) return null;

    try {
      // Normalize inputs
      const jobData = normalizeJobDescription(jobDescription);
      const resume = normalizeResume(resumeData);

      // Score 6 components (weighted by importance)
      const skillsScore = scoreSkillsMatch(resume.skills, jobData.requiredSkills, jobData.preferredSkills);
      const experienceScore = scoreExperienceRelevance(resume.experiences, jobData.responsibilities, jobData.domain);
      const roleScore = scoreRoleAlignment(resume.titles, jobData.jobTitle);
      const seniorityScore = scoreSeniorityMatch(resume.yearsOfExperience, jobData.seniorityLevel);
      const educationScore = scoreEducationMatch(resume.education, jobData.educationRequirements);
      const keywordScore = scoreKeywordCoverage(resume.allText, jobDescription);

      // Weighted composite (Skills 40%, Exp 25%, Role 15%, Seniority 5%, Edu 5%, Keywords 10%)
      const overallScore = (
        skillsScore * 0.40 +
        experienceScore * 0.25 +
        roleScore * 0.15 +
        seniorityScore * 0.05 +
        educationScore * 0.05 +
        keywordScore * 0.10
      );

      const normalizedScore = Math.round(overallScore * 100);

      // Get missing skills for recommendations
      const missingSkills = jobData.requiredSkills.filter(
        skill => !resume.skills.some(rs => skillMatchScore(rs, skill) > 0.3)
      );

      // Log detailed scoring breakdown
      console.log('\n📈 ResAid: Resume-Job Fit Analysis');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`\n🎯 Overall Fit Score: ${normalizedScore}%`);
      console.log(`\nComponent Breakdown:`);
      console.log(`   • Skills Match: ${Math.round(skillsScore * 100)}% (40% weight)`);
      console.log(`   • Experience Relevance: ${Math.round(experienceScore * 100)}% (25% weight)`);
      console.log(`   • Role Alignment: ${Math.round(roleScore * 100)}% (15% weight)`);
      console.log(`   • Seniority Match: ${Math.round(seniorityScore * 100)}% (5% weight)`);
      console.log(`   • Education Match: ${Math.round(educationScore * 100)}% (5% weight)`);
      console.log(`   • Keyword Coverage: ${Math.round(keywordScore * 100)}% (10% weight)`);
      
      if (missingSkills.length > 0) {
        console.log(`\nMissing Skills: ${missingSkills.slice(0, 3).join(', ')}`);
      }
      
      const strengths = getStrengths(skillsScore, experienceScore, roleScore, seniorityScore);
      if (strengths.length > 0) {
        console.log(`\nStrengths: ${strengths.join(', ')}`);
      }

      const recommendations = getRecommendations(missingSkills, experienceScore, educationScore);
      if (recommendations.length > 0) {
        console.log(`\nRecommendations: ${recommendations.join('; ')}`);
      }
      console.log('\n═══════════════════════════════════════════════════════════════\n');

      return {
        overallScore: normalizedScore,
        scoreComponents: {
          skillsMatch: Math.round(skillsScore * 100),
          experienceRelevance: Math.round(experienceScore * 100),
          roleAlignment: Math.round(roleScore * 100),
          seniorityMatch: Math.round(seniorityScore * 100),
          educationMatch: Math.round(educationScore * 100),
          keywordCoverage: Math.round(keywordScore * 100)
        },
        missingSkills: missingSkills.slice(0, 3),
        strengths: strengths,
        recommendations: recommendations
      };
    } catch (err) {
      console.error('ResAid: Error scoring resume-job match:', err);
      return null;
    }
  }

  function normalizeJobDescription(text) {
    const lower = text.toLowerCase();
    
    // Extract job title (usually in first 200 chars or title attribute)
    let jobTitle = document.querySelector('h1')?.innerText || 
                   document.querySelector('[data-automation-id*="jobTitle"]')?.innerText || 
                   document.title || '';

    // Extract required vs preferred skills
    const requiredSkills = extractSkills(text, ['required', 'must have', 'essential', 'must know']);
    const preferredSkills = extractSkills(text, ['preferred', 'nice to have', 'bonus', 'plus']);

    // Extract responsibilities
    const responsibilities = extractBulletPoints(text);

    // Detect seniority
    const seniorityLevel = detectSeniority(lower);

    // Detect domain/industry
    const domain = detectDomain(lower);

    // Extract education requirements
    const educationRequirements = extractEducationRequirements(lower);

    return {
      jobTitle: jobTitle.trim(),
      requiredSkills,
      preferredSkills,
      responsibilities,
      seniorityLevel,
      domain,
      educationRequirements
    };
  }

  function normalizeResume(resumeData) {
    // Assuming resumeData comes from API: skills[], experiences[], education[], yearsOfExperience
    const skills = (resumeData.skills || []).map(s => typeof s === 'string' ? s.trim() : s);
    const experiences = resumeData.experiences || [];
    const education = resumeData.education || [];
    const titles = experiences.map(e => e.title || '').filter(Boolean);
    
    // Calculate years of experience if not provided
    let yearsOfExperience = resumeData.yearsOfExperience || 0;
    if (!yearsOfExperience && experiences.length > 0) {
      const today = new Date();
      yearsOfExperience = experiences.reduce((sum, exp) => {
        if (exp.startDate && exp.endDate) {
          const start = new Date(exp.startDate);
          const end = new Date(exp.endDate);
          return sum + (end - start) / (1000 * 60 * 60 * 24 * 365.25);
        }
        return sum;
      }, 0);
    }

    // Extract all text for keyword coverage
    const allText = [
      ...skills,
      ...titles,
      ...experiences.map(e => e.description || ''),
      ...education.map(e => e.field || '')
    ].join(' ').toLowerCase();

    return {
      skills,
      experiences,
      education,
      titles,
      yearsOfExperience,
      allText
    };
  }

  function scoreSkillsMatch(resumeSkills, requiredSkills, preferredSkills) {
    if (requiredSkills.length === 0) return 0.8; // No skills specified

    let score = 0;
    const totalWeight = requiredSkills.length * 0.7 + preferredSkills.length * 0.3;

    // Required skills (70% weight)
    for (const reqSkill of requiredSkills) {
      const match = Math.max(...resumeSkills.map(rs => skillMatchScore(rs, reqSkill)));
      score += match * 0.7;
    }

    // Preferred skills (30% weight)
    for (const prefSkill of preferredSkills) {
      const match = Math.max(...resumeSkills.map(rs => skillMatchScore(rs, prefSkill)));
      score += match * 0.3;
    }

    return totalWeight > 0 ? Math.min(score / totalWeight, 1.0) : 0.8;
  }

  function skillMatchScore(resumeSkill, jobSkill) {
    const r = resumeSkill.toLowerCase();
    const j = jobSkill.toLowerCase();
    
    if (r === j) return 1.0; // Exact match
    if (r.includes(j) || j.includes(r)) return 0.85; // Partial match
    
    // Semantic synonyms (common tech equivalencies)
    const synonyms = {
      'javascript': ['js', 'es6', 'node', 'nodejs'],
      'python': ['py', 'flask', 'django'],
      'react': ['reactjs', 'next', 'nextjs'],
      'sql': ['mysql', 'postgres', 'postgresql'],
      'kubernetes': ['k8s', 'docker', 'container'],
      'aws': ['amazon', 'ec2', 's3'],
      'gcp': ['google cloud'],
      'azure': ['microsoft azure'],
      'cicd': ['ci/cd', 'continuous integration'],
      'devops': ['infrastructure', 'deployment']
    };

    if (synonyms[j]) {
      if (synonyms[j].some(syn => r.includes(syn))) return 0.75;
    }

    return 0; // No match
  }

  function scoreExperienceRelevance(experiences, responsibilities, domain) {
    if (experiences.length === 0) return 0.4;
    
    let score = 0;
    let matches = 0;

    for (const exp of experiences) {
      const description = (exp.description || '').toLowerCase();
      
      // Domain match
      if (domain && description.includes(domain.toLowerCase())) {
        score += 0.3;
        matches++;
      }

      // Responsibility similarity (check for action verbs + context)
      for (const resp of responsibilities) {
        if (description.includes(resp.slice(0, 10).toLowerCase())) {
          score += 0.2;
          matches++;
        }
      }

      // Tool/tech mentions
      const toolMatches = (exp.technologies || []).length > 0 ? 0.2 : 0;
      score += toolMatches;
    }

    const relevance = matches > 0 ? Math.min(score / (experiences.length * 0.7), 1.0) : 0.3;
    return relevance;
  }

  function scoreRoleAlignment(resumeTitles, jobTitle) {
    if (resumeTitles.length === 0 || !jobTitle) return 0.5;

    // Extract role keywords
    const jobRoleKeywords = extractRoleKeywords(jobTitle);
    
    let matches = 0;
    for (const title of resumeTitles) {
      const resumeKeywords = extractRoleKeywords(title);
      if (jobRoleKeywords.some(jk => resumeKeywords.some(rk => rk === jk))) {
        matches++;
      }
    }

    return matches > 0 ? Math.min(matches / resumeTitles.length, 1.0) : 0.5;
  }

  function extractRoleKeywords(title) {
    const keywords = ['engineer', 'developer', 'analyst', 'manager', 'architect', 'lead', 'senior', 'junior', 'principal', 'staff', 'backend', 'frontend', 'fullstack', 'devops', 'data', 'scientist'];
    const lower = title.toLowerCase();
    return keywords.filter(k => lower.includes(k));
  }

  function scoreSeniorityMatch(yearsOfExperience, requiredSeniority) {
    if (!requiredSeniority) return 0.8;

    const lower = requiredSeniority.toLowerCase();
    let requiredYears = 0;

    if (lower.includes('senior') || lower.includes('staff')) requiredYears = 5;
    else if (lower.includes('mid')) requiredYears = 3;
    else if (lower.includes('junior') || lower.includes('entry')) requiredYears = 0;

    // Extract numeric requirement
    const match = lower.match(/(\\d+)\\s*(?:year|yr)/i);
    if (match) requiredYears = parseInt(match[1]);

    const diff = yearsOfExperience - requiredYears;
    
    if (diff >= -1 && diff <= 10) return 1.0; // Good fit
    if (diff < -1) return 0.5 - Math.abs(diff) * 0.1; // Underqualified
    return 0.95; // Slightly overqualified (acceptable)
  }

  function scoreEducationMatch(resumeEducation, jobEducationReqs) {
    if (!jobEducationReqs || jobEducationReqs.length === 0) return 0.95; // Not required
    if (resumeEducation.length === 0) return 0.5; // No education listed

    const eduText = resumeEducation.map(e => (e.field || '') + ' ' + (e.degree || '')).join(' ').toLowerCase();
    
    let matches = 0;
    for (const req of jobEducationReqs) {
      if (eduText.includes(req.toLowerCase())) {
        matches++;
      }
    }

    return matches > 0 ? Math.min(matches / jobEducationReqs.length, 1.0) : 0.6;
  }

  function scoreKeywordCoverage(resumeText, jobDescription) {
    const jobKeywords = jobDescription.toLowerCase().match(/\\b[a-z]+(?:\\s+[a-z]+)?\\b/g) || [];
    const keywordFreq = {};
    
    for (const word of jobKeywords) {
      if (word.length > 3) { // Ignore small words
        keywordFreq[word] = (keywordFreq[word] || 0) + 1;
      }
    }

    let matches = 0;
    const importantKeywords = Object.entries(keywordFreq)
      .filter(([_, freq]) => freq >= 2) // Keywords appearing 2+ times
      .map(([word]) => word);

    for (const keyword of importantKeywords) {
      if (resumeText.includes(keyword)) {
        matches++;
      }
    }

    return importantKeywords.length > 0 ? matches / importantKeywords.length : 0.8;
  }

  // Helper: Extract skills from text
  function extractSkills(text, markers) {
    const lower = text.toLowerCase();
    let start = 0;

    // Find section starting with marker
    for (const marker of markers) {
      const idx = lower.indexOf(marker);
      if (idx !== -1) {
        start = idx + marker.length;
        break;
      }
    }

    const section = text.substring(start, start + 1000);
    const skillPattern = /(?:^|[-•*]|\\n)\\s*([A-Za-z0-9#/+.\\-\\s,&()]+?)(?=[\\n•*-]|$)/gm;
    
    const skills = [];
    let match;
    while ((match = skillPattern.exec(section)) && skills.length < 10) {
      const skill = match[1].trim();
      if (skill.length > 2 && skill.length < 50) {
        skills.push(skill);
      }
    }

    return skills;
  }

  // Helper: Extract bullet points (responsibilities)
  function extractBulletPoints(text) {
    const pattern = /(?:^|\\n)\\s*[-•*]\\s+(.+?)(?=\\n|$)/gm;
    const bullets = [];
    let match;
    while ((match = pattern.exec(text)) && bullets.length < 15) {
      bullets.push(match[1].trim().substring(0, 50));
    }
    return bullets;
  }

  // Helper: Detect seniority level
  function detectSeniority(text) {
    if (text.includes('staff') || text.includes('principal')) return 'staff';
    if (text.includes('senior')) return 'senior';
    if (text.includes('mid')) return 'mid';
    if (text.includes('junior') || text.includes('entry')) return 'junior';
    return null;
  }

  // Helper: Detect industry/domain
  function detectDomain(text) {
    const domains = ['finance', 'healthcare', 'ecommerce', 'saas', 'fintech', 'edtech', 'logistics', 'retail', 'travel'];
    for (const domain of domains) {
      if (text.includes(domain)) return domain;
    }
    return null;
  }

  // Helper: Extract education requirements
  function extractEducationRequirements(text) {
    const requirements = [];
    const degreePattern = /(bachelor|master|phd|b\\.?s|m\\.?s|b\\.?a|m\\.?a)\\s+(in\\s+)?([a-z\\s&-]+)/gi;
    
    let match;
    while ((match = degreePattern.exec(text))) {
      requirements.push(match[0].trim());
    }

    return requirements;
  }

  function getStrengths(skillsScore, experienceScore, roleScore, seniorityScore) {
    const strengths = [];
    if (skillsScore > 0.75) strengths.push('Excellent skills match');
    if (experienceScore > 0.75) strengths.push('Highly relevant experience');
    if (roleScore > 0.8) strengths.push('Perfect role alignment');
    if (seniorityScore > 0.85) strengths.push('Ideal seniority level');
    return strengths;
  }

  function getRecommendations(missingSkills, experienceScore, educationScore) {
    const recommendations = [];
    if (missingSkills.length > 0) {
      recommendations.push(`Add ${missingSkills.slice(0, 2).join(', ')} to resume`);
    }
    if (experienceScore < 0.5) {
      recommendations.push('Emphasize relevant project experience');
    }
    if (educationScore < 0.7) {
      recommendations.push('Highlight relevant certifications');
    }
    return recommendations;
  }

  function isValidJobDescription(jd) {
    if (!jd || !jd.text) return false;
    const text = jd.text.trim();
    
    // Use numeric confidence if available (from new algorithm)
    if (typeof jd.confidence === 'number') {
      return jd.confidence >= 0.5; // Accept if confidence >= 0.5
    }
    
    // Fallback to old logic for backward compatibility
    if (text.length < 300) return false;
    const keywords = ['responsibilities', 'requirements', 'qualifications', 'experience', 'skills', 'role', 'position'];
    const hasKeywords = keywords.some(kw => text.toLowerCase().includes(kw));
    return hasKeywords || text.length > 800;
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
    console.log('ResAid: fillField called with answer:', answer, 'for field:', field.name || field.id || field.placeholder || field.tagName);
    
    if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
      field.value = answer;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('ResAid: Set field value to:', field.value);
    } else if (field.contentEditable === 'true' || field.getAttribute('contenteditable') === 'true' || 
               field.getAttribute('role') === 'textbox' || field.tagName === 'DIV' || field.tagName === 'SPAN') {
      field.innerText = answer;
      field.textContent = answer;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('ResAid: Set contentEditable/textbox text to:', field.innerText);
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
        // If this field is a common personal info field, fill locally without AI
        if (!personalInfo) {
          const result = await chrome.runtime.sendMessage({ type: 'GET_PERSONAL_INFO' });
          personalInfo = result?.data || {};
        }
        const fieldType = detectFieldType(field);
        const COMMON_PERSONAL_FIELDS = new Set([
          'firstName','lastName','fullName','email','phone','extension','countryPhoneCode','linkedin','location','city','postalCode','country','currentCompany'
        ]);

        if (fieldType && COMMON_PERSONAL_FIELDS.has(fieldType)) {
          // Try to resolve value (first/last fallback to fullName split)
          let value = personalInfo[fieldType];
          if (!value && fieldType === 'firstName' && personalInfo.fullName) {
            value = personalInfo.fullName.split(' ')[0] || '';
          }
          if (!value && fieldType === 'lastName' && personalInfo.fullName) {
            const parts = personalInfo.fullName.split(' ');
            value = parts.slice(1).join(' ');
          }

          if (value) {
            fillField(field, value);
            btn.innerText = '✨ Filled';
            setTimeout(() => btn.remove(), 1200);
            return;
          } else {
            btn.innerText = '⚠️ Add in Settings';
            setTimeout(() => btn.remove(), 1600);
            return;
          }
        }

        // Get autofill context from background script (avoids CSP issues)
        const contextResponse = await chrome.runtime.sendMessage({
          type: 'GET_AUTOFILL_CONTEXT'
        });
        
        let context = contextResponse?.data;

        // Fallback: if user forgot to enable, use stored defaults
        if (!context || !context.enabled) {
          const fallback = await chrome.runtime.sendMessage({ type: 'GET_FALLBACK_CONTEXT' });
          const { lastResumeId, guidelines } = fallback?.data || {};
          if (lastResumeId) {
            context = {
              enabled: true,
              resumeId: lastResumeId,
              guidelines: guidelines || '',
              jobDescription: detectedJobDescription?.text || ''
            };
          }
        }

        if (!context || !context.enabled) {
          throw new Error('Autofill not enabled. Open the popup once to choose a resume.');
        }
        
        // Use detected job description if context lacks one
        let jobDesc = (context.jobDescription && context.jobDescription.trim())
          ? context.jobDescription
          : (detectedJobDescription?.text || '').trim();

        // Fallback to last-known JD from background (previous tab) if still empty
        if (!jobDesc || jobDesc.length < 50) {
          const last = await chrome.runtime.sendMessage({ type: 'GET_LAST_JOB_DESCRIPTION' });
          if (last?.data?.text) {
            jobDesc = last.data.text.trim();
          }
        }

        if (!jobDesc || jobDesc.length < 50) {
          throw new Error('No job description detected. Click Refresh in the popup, then try again.');
        }

        // Request answer generation from background
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_ANSWER',
          data: {
            resumeId: context.resumeId,
            question: question,
            jobDescription: jobDesc,
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
        btn.innerText = (err.message || 'Error');
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

  // Extract question text from field attributes
  function extractQuestionFromAttributes(attributes) {
    // Split by spaces and find the longest contiguous sequence that looks like a question
    const words = attributes.split(' ');
    let bestQuestion = '';
    let currentQuestion = '';

    for (const word of words) {
      if (word.includes('?') || /\b(what|how|why|describe|explain|tell|please|can)\b/i.test(word)) {
        currentQuestion += (currentQuestion ? ' ' : '') + word;
      } else if (currentQuestion) {
        // Continue building if we have a question started
        const lowerWord = word.toLowerCase();
        if (lowerWord.length > 2 && !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that', 'from', 'they', 'will', 'have', 'been', 'were'].includes(lowerWord)) {
          currentQuestion += ' ' + word;
        } else {
          // End current question if we hit a stop word
          if (currentQuestion.length > bestQuestion.length) {
            bestQuestion = currentQuestion;
          }
          currentQuestion = '';
        }
      }
    }

    // Check the last question
    if (currentQuestion.length > bestQuestion.length) {
      bestQuestion = currentQuestion;
    }

    // Clean up the question
    return bestQuestion.replace(/^[^\w]+|[^\w]+$/g, '').trim();
  }

  // AI API calling function for answering custom questions
  async function answerQuestionWithAI(question, settings, resumeText, jobDescription) {
    if (!settings.aiApiKey) {
      console.log('ResAid: AI API key missing');
      return null;
    }

    // Log the full resumeText and jobDescription for inspection
    console.log('ResAid: Full Resume Text:', resumeText);
    console.log('ResAid: Full Job Description:', jobDescription);

    const prompt = `You are helping someone fill out a job application. Answer this question based on their resume and the job description provided. Keep your answer professional, concise, and relevant to the job application context.

Question: ${question}

${resumeText ? `Resume Summary: ${resumeText.substring(0, 2000)}` : ''}

${jobDescription ? `Job Description: ${jobDescription.substring(0, 2000)}` : ''}

Answer the question directly and naturally, as if the applicant is writing it themselves. Keep it under 250 words and focus on relevant experience and skills.`;

    try {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.aiApiKey}`
      };
      const body = JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });

      console.log('ResAid: Calling OpenAI API for question:', question.substring(0, 50) + '...');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: body
      });

      if (!response.ok) {
        const error = await response.text();
        console.log('ResAid: OpenAI API error:', response.status, error);
        return null;
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || '';

      console.log('ResAid: AI generated answer:', answer.substring(0, 100) + '...');
      return answer.trim();

    } catch (err) {
      console.log('ResAid: AI call failed:', err.message);
      return null;
    }
  }

  // Detect field type based on attributes
  function detectFieldType(field) {
    // Collect all possible text sources
    const textSources = [
      field.name,
      field.id,
      field.getAttribute('aria-label'),
      field.getAttribute('placeholder'),
      field.getAttribute('data-automation-id'),
      field.getAttribute('data-qa'),
      field.className,
      field.getAttribute('data-testid'),
      field.getAttribute('data-input'),
      field.getAttribute('data-field'),
      field.getAttribute('data-name'),
      field.getAttribute('data-label'),
      field.getAttribute('data-cy'),
      field.getAttribute('data-e2e'),
      field.getAttribute('data-test'),
      field.getAttribute('data-testid'),
      field.getAttribute('aria-describedby'),
      field.getAttribute('title'),
      field.getAttribute('alt')
    ];

    // Check aria-labelledby
    const ariaLabelledBy = field.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/);
      for (const id of ids) {
        const labelElement = document.getElementById(id);
        if (labelElement) {
          textSources.push(labelElement.textContent || labelElement.innerText);
        }
      }
    }

    // Check aria-describedby
    const ariaDescribedBy = field.getAttribute('aria-describedby');
    if (ariaDescribedBy) {
      const ids = ariaDescribedBy.split(/\s+/);
      for (const id of ids) {
        const descElement = document.getElementById(id);
        if (descElement) {
          textSources.push(descElement.textContent || descElement.innerText);
        }
      }
    }

    // Check associated label
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) {
        textSources.push(label.textContent || label.innerText);
      }
    }

    // Check parent elements for data-testid or text content
    let parent = field.parentElement;
    let depth = 0;
    while (parent && depth < 5) { // Check up to 5 levels up
      if (parent.getAttribute('data-testid')) {
        textSources.push(parent.getAttribute('data-testid'));
      }
      // If parent has text content and is likely a label container
      const parentText = (parent.textContent || parent.innerText || '').trim();
      if (parentText && parentText.length < 200 && !parentText.includes('\n')) {
        textSources.push(parentText);
      }
      parent = parent.parentElement;
      depth++;
    }

    // Check sibling elements for text content
    if (field.parentElement) {
      const siblings = field.parentElement.children;
      for (const sibling of siblings) {
        if (sibling !== field) {
          const siblingText = (sibling.textContent || sibling.innerText || '').trim();
          if (siblingText && siblingText.length < 100 && !siblingText.includes('\n')) {
            textSources.push(siblingText);
          }
        }
      }
    }

    // Check for any nearby text elements (spans, labels, divs with text) - expanded search
    const nearbyElements = field.parentElement ? field.parentElement.querySelectorAll('span, label, div, p, h1, h2, h3, h4, h5, h6, strong, b, em, i') : [];
    for (const el of nearbyElements) {
      const elText = (el.textContent || el.innerText || '').trim();
      if (elText && elText.length < 100 && elText.length > 1 && !elText.includes('\n')) {
        textSources.push(elText);
      }
    }

    // Check grandparent level for labels or text
    if (field.parentElement && field.parentElement.parentElement) {
      const grandparent = field.parentElement.parentElement;
      const grandparentElements = grandparent.querySelectorAll('span, label, div, p, h1, h2, h3, h4, h5, h6');
      for (const el of grandparentElements) {
        const elText = (el.textContent || el.innerText || '').trim();
        if (elText && elText.length < 100 && elText.length > 1 && !elText.includes('\n')) {
          textSources.push(elText);
        }
      }
    }

    // Join all sources and convert to lowercase
    const attributes = textSources.filter(Boolean).join(' ').toLowerCase();

    // Debug logging for field detection
    console.log('ResAid: Detecting field type for:', field.name || field.id || 'unnamed field');
    console.log('ResAid: Collected attributes:', attributes);

    // FIRST: Try keyword-based detection (most reliable)
    const fieldNameId = (field.name || field.id || '').toLowerCase();
    for (const [fieldType, keywords] of Object.entries(FIELD_KEYWORDS)) {
      for (const keyword of keywords) {
        if (fieldNameId.includes(keyword)) {
          console.log('ResAid: Keyword match:', keyword, 'for fieldType:', fieldType);
          return fieldType;
        }
      }
    }

    // SECOND: Try pattern matching in attributes (fallback)
    for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
      for (const pattern of patterns) {
        const lowerPattern = pattern.toLowerCase();
        if (attributes.includes(lowerPattern)) {
          console.log('ResAid: Pattern match:', lowerPattern, 'for fieldType:', fieldType);
          return fieldType;
        }
      }
    }

    // Check for custom questions (AI-answered fields)
    const questionPatterns = /\b(what|how|why|describe|explain|tell us|please|can you)\b.*\?/i;
    const hasQuestionMark = attributes.includes('?');
    const looksLikeQuestion = questionPatterns.test(attributes) || hasQuestionMark;

    // Additional checks for question-like content
    const questionIndicators = ['question', 'customquestion', 'additional', 'optional', 'tell us about', 'describe your', 'explain your'];
    const hasQuestionIndicators = questionIndicators.some(indicator => attributes.toLowerCase().includes(indicator));

    if ((looksLikeQuestion || hasQuestionIndicators) && attributes.length > 20) {
      // Extract the question text from attributes
      const questionText = extractQuestionFromAttributes(attributes);
      if (questionText && questionText.length > 10) {
        return 'customQuestion:' + questionText;
      }
    }

    // Fallback: Check for common name patterns in any nearby text (broader search)
    if (!field.name && !field.id && !field.getAttribute('aria-label') && !field.placeholder) {
      // If field has no identifying attributes, do a broader search for labels
      const broaderSearch = field.closest('div, form, fieldset');
      if (broaderSearch) {
        const allTextInContainer = broaderSearch.textContent || broaderSearch.innerText || '';
        const lowerText = allTextInContainer.toLowerCase();
        
        // Check for keywords in the broader context
        for (const [fieldType, keywords] of Object.entries(FIELD_KEYWORDS)) {
          for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
              console.log('ResAid: Broad context keyword match:', keyword, 'for fieldType:', fieldType);
              return fieldType;
            }
          }
        }

        if (lowerText.includes('first name') || lowerText.includes('given name') || lowerText.includes('legal first')) {
          return 'firstName';
        }
        if (lowerText.includes('last name') || lowerText.includes('family name') || lowerText.includes('surname') || lowerText.includes('legal last')) {
          return 'lastName';
        }
      }
    }

    return null;
  }

  // Helper to get all elements including those in shadow DOM
  function getAllElements(selector) {
    const elements = [];
    
    function collectElements(root) {
      // Add elements from current root
      const found = root.querySelectorAll(selector);
      elements.push(...found);
      
      // Recursively check shadow roots
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          collectElements(el.shadowRoot);
        }
      }
    }
    
    collectElements(document);
    return elements;
  }

  // Auto-fill common fields
  async function autoFillCommonFields(profileDataOverride = null) {
    let personalInfo = profileDataOverride;
    
    if (!personalInfo) {
      // Load personal info from storage
      const result = await chrome.runtime.sendMessage({ type: 'GET_PERSONAL_INFO' });
      personalInfo = result?.data || {};
    }

    console.log('ResAid: Personal Info loaded:', personalInfo);
    console.log('ResAid: firstName value:', personalInfo.firstName, 'type:', typeof personalInfo.firstName);

    // Load resume data for AI question answering
    const resumeResponse = await chrome.runtime.sendMessage({ type: 'LOAD_RESUME_DATA' });
    const resumeText = resumeResponse.success ? resumeResponse.data : '';

    // Log resume data for inspection
    console.log('ResAid: Resume data loaded:', resumeText ? `Length: ${resumeText.length}, Preview: ${resumeText.substring(0, 200)}...` : 'No resume data');
    if (resumeText) {
      console.log('ResAid: Full resume text (first 6000 chars):', resumeText.substring(0, 6000));
    }

    // Find all input fields on the page, including in shadow DOM
    const fields = getAllElements('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea, [contenteditable="true"], div[role="textbox"], span[role="textbox"]');
    
    console.log('ResAid: Found', fields.length, 'potential input fields');
    let filled = 0;
    for (const field of fields) {
      // Skip if already filled
      const isContentEditable = field.contentEditable === 'true' || field.getAttribute('contenteditable') === 'true';
      const hasValue = field.value && field.value.trim().length > 0;
      const hasTextContent = (field.innerText || field.textContent || '').trim().length > 0;
      
      if ((hasValue && !isContentEditable) || (isContentEditable && hasTextContent)) {
        console.log('ResAid: Skipping already-filled field:', field.name || field.id || field.tagName);
        continue;
      }

      const fieldType = detectFieldType(field);
      console.log('ResAid: Field', field.name || field.id || field.placeholder, '-> type:', fieldType);

      if (fieldType) {
        try {
          // Handle custom questions with AI
          if (fieldType.startsWith('customQuestion:')) {
            const question = fieldType.substring('customQuestion:'.length);
            console.log('ResAid: Detected custom question:', question);

            // Get AI settings
            const aiSettings = await chrome.storage.sync.get(['aiApiKey', 'aiModel', 'aiEnabled']);

            if (aiSettings.aiApiKey && aiSettings.aiEnabled !== false) {
              const jobDesc = detectedJobDescription?.text || '';

              const aiAnswer = await answerQuestionWithAI(question, aiSettings, resumeText, jobDesc);
              if (aiAnswer) {
                fillField(field, aiAnswer);
                filled++;
                console.log('ResAid: AI answered custom question with:', aiAnswer.substring(0, 50) + '...');
              } else {
                console.log('ResAid: AI failed to answer question, skipping field');
              }
            } else {
              console.log('ResAid: OpenAI API key not configured, skipping custom question');
            }
          }
          // Prefer explicit first/last if available; fall back to splitting fullName
          else if (fieldType === 'firstName') {
            const firstName = personalInfo.firstName || (personalInfo.fullName ? personalInfo.fullName.split(' ')[0] : '');
            if (firstName) {
              fillField(field, firstName);
              filled++;
            }
          } else if (fieldType === 'lastName') {
            const lastName = personalInfo.lastName || (() => {
              if (personalInfo.fullName) {
                const parts = personalInfo.fullName.split(' ');
                return parts.slice(1).join(' ');
              }
              return '';
            })();
            if (lastName) {
              fillField(field, lastName);
              filled++;
            }
          } else if (personalInfo[fieldType]) {
            fillField(field, personalInfo[fieldType]);
            filled++;
          }
        } catch (e) {
          console.log('ResAid: Error filling field:', e);
        }
      }
    }
  }

  // Auto-extract job description on page load (kept), but do NOT auto-fill
  setTimeout(async () => {
    let jd = extractJobDescription();
    const originalJdValid = isValidJobDescription(jd);

    if (!originalJdValid) {
      // Try carry-over from previous tab (only for fit scoring, not badge)
      const last = await chrome.runtime.sendMessage({ type: 'GET_LAST_JOB_DESCRIPTION' });
      if (last?.data?.text) {
        jd = last.data;
      }
    }

    if (isValidJobDescription(jd)) {
      detectedJobDescription = jd;
      chrome.runtime.sendMessage({
        type: 'EXTRACT_JOB_DESCRIPTION',
        data: { text: jd.text, confidence: jd.confidence || 'medium' }
      });
      
      // Notify popup if it's open
      chrome.runtime.sendMessage({
        type: 'JOB_DESCRIPTION_DETECTED',
        data: { text: jd.text, confidence: jd.confidence || 0.5 }
      }).catch(() => {
        // Popup not open, that's fine
      });
      
      console.log('ResAid: Job description available');

      // Show if this is from current page or carry-over
      if (originalJdValid) {
        console.log('ResAid: Using job description from current page');
      } else {
        console.log('ResAid: Using carry-over job description from previous tab');
      }

      // Calculate and show fit score automatically (only if we have a valid JD for this page)
      if (originalJdValid) {
        await calculateAndShowFitScore();
      }
    }

    // Auto-fill common fields if smart autofill is enabled
    const smartAutofillEnabled = await chrome.runtime.sendMessage({ type: 'GET_SMART_AUTOFILL' });
    if (smartAutofillEnabled?.enabled) {
      console.log('ResAid: Smart autofill enabled, auto-filling common fields...');
      setTimeout(() => autoFillCommonFields(), 2000); // Wait a bit for dynamic content
    }

    // Automatically analyze page for job forms and update badge (use ORIGINAL detection, not carry-over)
    const hasJobForm = detectJobApplicationForm();

    // Use original detection for badge (not carry-over)
    const hasJobDescription = originalJdValid;

    // Badge should only show for pages with actual job content, not just forms
    const hasJob = hasJobDescription;

    console.log('ResAid: Automatic page analysis complete');
    console.log('  - hasJobForm:', hasJobForm);
    console.log('  - hasJobDescription:', hasJobDescription);
    console.log('  - hasJob (badge):', hasJob);
    console.log('  - jobDesc confidence:', jd?.confidence || 'none');
    console.log('  - using carry-over JD:', !originalJdValid && isValidJobDescription(jd));

    chrome.runtime.sendMessage({
      type: 'UPDATE_BADGE',
      hasJob: hasJob
    });

    // Retry after 2 seconds in case content loads dynamically (only update badge if we find new content)
    setTimeout(async () => {
      if (!originalJdValid) {
        console.log('ResAid: Retrying job description detection after 2 seconds...');
        const retryJd = extractJobDescription();
        if (isValidJobDescription(retryJd)) {
          console.log('ResAid: Job description found on retry!');
          detectedJobDescription = retryJd;
          chrome.runtime.sendMessage({
            type: 'EXTRACT_JOB_DESCRIPTION',
            data: { text: retryJd.text, confidence: retryJd.confidence || 'medium' }
          });
          
          chrome.runtime.sendMessage({
            type: 'JOB_DESCRIPTION_DETECTED',
            data: { text: retryJd.text, confidence: retryJd.confidence || 0.5 }
          }).catch(() => {});
          
          // Update badge since we found job content on this page
          chrome.runtime.sendMessage({
            type: 'UPDATE_BADGE',
            hasJob: true
          });
          
          // Calculate fit score
          await calculateAndShowFitScore();
        }
      }
    }, 2000);
  }, 500);

  // Calculate fit score and show floating badge (only if valid job description exists)
  async function calculateAndShowFitScore() {
    try {
      // Check if we have a valid job description first
      if (!detectedJobDescription || !isValidJobDescription(detectedJobDescription)) {
        console.log('ResAid: No valid job description found for fit scoring');
        return;
      }

      // Get personal info (acts as resume data for now)
      const personalInfoResult = await chrome.runtime.sendMessage({ type: 'GET_PERSONAL_INFO' });
      const resumeData = personalInfoResult?.data || {};

      if (!resumeData || Object.keys(resumeData).length === 0) {
        console.log('ResAid: No resume data available for fit scoring');
        return;
      }

      // Calculate score
      const scoreResult = await scoreResumeJobMatch(detectedJobDescription.text, resumeData);
      
      if (scoreResult && scoreResult.overallScore) {
        // Show floating badge that triggers modal on click
        showFitScoreBadge(scoreResult);
      }
    } catch (err) {
      console.error('ResAid: Error calculating fit score:', err);
    }
  }

  // Show detailed fit score modal with pie chart
  function showFitScoreModal(scoreData) {
    // Remove existing modal only (keep badge visible)
    const existingModal = document.getElementById('resaid-fit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'resaid-fit-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const score = scoreData.overallScore;
    const color = score >= 75 ? '#4CAF50' : score >= 50 ? '#FF9800' : '#f44336';

    // Create pie chart data
    const components = scoreData.scoreComponents;
    const pieData = [
      { label: 'Skills Match', value: components.skillsMatch, color: '#667eea', weight: '40%' },
      { label: 'Experience', value: components.experienceRelevance, color: '#764ba2', weight: '25%' },
      { label: 'Role Alignment', value: components.roleAlignment, color: '#f093fb', weight: '15%' },
      { label: 'Seniority', value: components.seniorityMatch, color: '#4facfe', weight: '5%' },
      { label: 'Education', value: components.educationMatch, color: '#43e97b', weight: '5%' },
      { label: 'Keywords', value: components.keywordCoverage, color: '#38f9d7', weight: '10%' }
    ];

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 16px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Resume-Job Fit Analysis</div>
          <div style="font-size: 48px; font-weight: 700; color: ${color}; margin-bottom: 8px;">${score}%</div>
          <div style="font-size: 16px; color: #666;">Overall Match Score</div>
        </div>

        <div style="margin-bottom: 20px;">
          <canvas id="resaid-pie-chart" width="200" height="200" style="display: block; margin: 0 auto;"></canvas>
        </div>

        <div style="margin-bottom: 20px;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333;">Score Breakdown</div>
          ${pieData.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="display: flex; align-items: center;">
                <div style="width: 12px; height: 12px; background: ${item.color}; border-radius: 2px; margin-right: 8px;"></div>
                <span style="font-size: 13px; color: #555;">${item.label}</span>
              </div>
              <div style="font-size: 13px; font-weight: 600; color: #333;">${item.value}% <span style="color: #999; font-weight: 400;">(${item.weight})</span></div>
            </div>
          `).join('')}
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-bottom: 20px;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333;">Premium Analysis</div>
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">🔒 Unlock Detailed Insights</div>
            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 12px;">
              Get personalized recommendations to improve your resume and identify missing skills
            </div>
            <button id="resaid-upgrade-btn" style="
              background: white;
              color: #667eea;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-weight: 600;
              cursor: pointer;
              font-size: 13px;
            ">Upgrade to Premium</button>
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button id="resaid-close-modal" style="
            flex: 1;
            background: #f5f5f5;
            color: #666;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          ">Close</button>
          <button id="resaid-view-full" style="
            flex: 1;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          ">View Full Analysis</button>
        </div>
      </div>
    `;

    // Add event listeners
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    modal.querySelector('#resaid-close-modal').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('#resaid-upgrade-btn').addEventListener('click', () => {
      // TODO: Open upgrade/payment flow
      alert('Premium upgrade coming soon!');
    });

    modal.querySelector('#resaid-view-full').addEventListener('click', () => {
      // Show premium content (for now, just show a message)
      showPremiumAnalysis(scoreData);
    });

    document.body.appendChild(modal);

    // Draw pie chart
    setTimeout(() => {
      drawPieChart('resaid-pie-chart', pieData);
    }, 100);
  }

  // Show premium analysis content
  function showPremiumAnalysis(scoreData) {
    const modal = document.getElementById('resaid-fit-modal');
    if (!modal) return;

    const premiumContent = modal.querySelector('.premium-content');
    if (premiumContent) {
      premiumContent.style.display = premiumContent.style.display === 'none' ? 'block' : 'none';
      return;
    }

    // Add premium content
    const container = modal.querySelector('div[style*="border-top"]');
    const premiumDiv = document.createElement('div');
    premiumDiv.className = 'premium-content';
    premiumDiv.style.cssText = `
      background: #f8f9ff;
      border: 1px solid #e0e4ff;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    `;

    premiumDiv.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333;">🎯 Personalized Recommendations</div>

      ${scoreData.missingSkills && scoreData.missingSkills.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 13px; font-weight: 600; color: #666; margin-bottom: 8px;">Missing Skills to Add:</div>
          <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #eee;">
            ${scoreData.missingSkills.map(skill => `<span style="background: #fff3cd; color: #856404; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 6px; margin-bottom: 4px; display: inline-block;">${skill}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${scoreData.strengths && scoreData.strengths.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 13px; font-weight: 600; color: #666; margin-bottom: 8px;">Your Strengths:</div>
          <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #eee;">
            ${scoreData.strengths.map(strength => `<div style="color: #2e7d32; font-size: 13px; margin-bottom: 4px;">✓ ${strength}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${scoreData.recommendations && scoreData.recommendations.length > 0 ? `
        <div>
          <div style="font-size: 13px; font-weight: 600; color: #666; margin-bottom: 8px;">Action Items:</div>
          <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #eee;">
            ${scoreData.recommendations.map(rec => `<div style="color: #1976d2; font-size: 13px; margin-bottom: 4px;">• ${rec}</div>`).join('')}
          </div>
        </div>
      ` : ''}
    `;

    container.appendChild(premiumDiv);
  }

  // Draw pie chart using Canvas API
  function drawPieChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    let startAngle = -Math.PI / 2; // Start from top

    data.forEach(item => {
      const percentage = item.value / 100;
      const endAngle = startAngle + (percentage * 2 * Math.PI);

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();

      // Draw border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle = endAngle;
    });

    // Draw center circle for donut effect
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
  }

  // Show floating fit score badge on page (now triggers modal)
  function showFitScoreBadge(scoreData) {
    // Remove existing badge
    const existing = document.getElementById('resaid-fit-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'resaid-fit-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999998;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer;
      transition: all 0.3s ease;
      min-width: 180px;
    `;

    const score = scoreData.overallScore;
    const color = score >= 75 ? '#4CAF50' : score >= 50 ? '#FF9800' : '#f44336';

    const components = scoreData.scoreComponents;
    badge.innerHTML = `
      <div style="font-size: 11px; opacity: 0.9; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">Resume-Job Fit</div>
      <div style="font-size: 36px; font-weight: 700; line-height: 1; margin-bottom: 8px;">${score}%</div>
      <div style="font-size: 10px; opacity: 0.8; margin-bottom: 8px;">
        Skills: ${components.skillsMatch}% • 
        Experience: ${components.experienceRelevance}%
      </div>
      <div style="font-size: 9px; opacity: 0.7; margin-top: 8px; text-align: center;">Click for detailed analysis</div>
    `;

    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.05) translateY(-2px)';
      badge.style.boxShadow = '0 12px 32px rgba(102, 126, 234, 0.5)';
    });

    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1) translateY(0)';
      badge.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)';
    });

    badge.addEventListener('click', () => {
      // Show detailed modal instead of opening popup
      showFitScoreModal(scoreData);
    });

    // Slide in animation
    badge.style.transform = 'translateX(300px)';
    document.body.appendChild(badge);
    
    requestAnimationFrame(() => {
      badge.style.transition = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
      badge.style.transform = 'translateX(0)';
    });
  }

  // More specific job application form detection
  function detectJobApplicationForm() {
    // Check for job-specific keywords in title/URL
    const titleHasJob = /job|career|application|apply|hiring|recruit/i.test(document.title);
    const urlHasJob = /job|career|apply|application/i.test(window.location.href);

    // Check for job application form patterns
    const forms = document.querySelectorAll('form');
    let hasJobForm = false;

    for (const form of forms) {
      const formText = (form.innerText || form.textContent || '').toLowerCase();
      const formHtml = form.innerHTML.toLowerCase();

      // Look for job application indicators
      const jobIndicators = [
        'resume', 'cv', 'cover letter', 'application', 'apply now',
        'submit application', 'job application', 'career application',
        'work experience', 'education', 'skills', 'qualifications'
      ];

      const hasJobContent = jobIndicators.some(indicator => formText.includes(indicator));
      const hasJobFields = form.querySelector('input[type="file"]') || // Resume upload
                          form.querySelector('textarea') || // Cover letter
                          (form.querySelectorAll('input').length > 3); // Multiple form fields

      if (hasJobContent || hasJobFields) {
        hasJobForm = true;
        break;
      }
    }

    // Check for email inputs in job-related context
    const emailInputs = document.querySelectorAll('input[type="email"]');
    let hasJobEmail = false;

    for (const email of emailInputs) {
      const context = email.closest('form, div, section');
      if (context) {
        const contextText = (context.innerText || context.textContent || '').toLowerCase();
        if (contextText.includes('application') || contextText.includes('apply') ||
            contextText.includes('job') || contextText.includes('career')) {
          hasJobEmail = true;
          break;
        }
      }
    }

    return titleHasJob || urlHasJob || hasJobForm || hasJobEmail;
  }

  // Helper function to extract company name from text
  function extractCompanyName(text) {
    // Try to find common company name indicators
    const patterns = [
      /(?:about|welcome to|join|apply at|company:?)\s+([A-Z][A-Za-z0-9\s&]+)/i,
      /©\s*([A-Z][A-Za-z0-9\s&]+)/i,
      /([A-Z][A-Za-z0-9\s&]+)\s+(?:careers|jobs|hiring)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Fallback: extract from domain
    try {
      const domain = new URL(window.location.href).hostname;
      const parts = domain.split('.');
      if (parts.length > 1) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }
    } catch (e) {
      // Ignore
    }
    
    return null;
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('ResAid: Content script received message:', message.type);
    
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
      console.log('ResAid: TRIGGER_AUTOFILL message received, calling autoFillCommonFields()');
      autoFillCommonFields();
      sendResponse({ success: true });
    }

    if (message.type === 'SMART_FILL') {
      console.log('ResAid: SMART_FILL message received, calling autoFillCommonFields()');
      autoFillCommonFields();
      sendResponse({ success: true });
    }
    
    if (message.type === 'AUTOFILL_COMMON_FIELDS') {
      console.log('ResAid: AUTOFILL_COMMON_FIELDS message received, calling autoFillCommonFields()');
      // Use profile data from message if provided, otherwise load from storage
      const profileData = message.profileData;
      autoFillCommonFields(profileData);
      
      // Auto-save to application tracker if this looks like a job application
      const jobDetails = extractJobDetails();
      const isJobPage = isLikelyJobApplicationPage();
      
      if (isJobPage || detectedJobDescription) {
        console.log('ResAid: Auto-tracking application via Smart Fill', {
          isJobPage,
          hasJobDescription: !!detectedJobDescription,
          jobDetails
        });
        
        const jobTitle = detectedJobDescription?.text?.split('\n')[0] || jobDetails.position || document.title || 'Job Position';
        const companyName = extractCompanyName(document.body.innerText || '') || jobDetails.company || 'Unknown Company';
        const matchScore = detectedJobDescription ? Math.round((detectedJobDescription.confidence || 0.5) * 100) : 0;
        
        chrome.runtime.sendMessage({
          type: 'SAVE_APPLICATION',
          data: {
            company: companyName,
            position: jobTitle,
            location: jobDetails.location,
            url: window.location.href,
            matchScore: matchScore,
            status: 'Applied',
            appliedDate: new Date().toISOString(),
            notes: 'Tracked via Smart Fill'
          }
        }).catch((error) => {
          console.log('ResAid: Failed to save application via Smart Fill:', error);
        });
      } else {
        console.log('ResAid: Smart Fill used but page not detected as job application');
      }
      
      sendResponse({ success: true });
    }

    if (message.type === 'SCORE_RESUME_JOB_MATCH') {
      // Calculate fit score and return result
      (async () => {
        try {
          const { jobDescription, resumeData } = message.data;
          const scoreResult = await scoreResumeJobMatch(jobDescription, resumeData);
          sendResponse({ success: true, data: scoreResult });
        } catch (err) {
          console.error('Error scoring match:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // Keep channel open for async response
    }

    if (message.type === 'GET_JOB_STATUS') {
      // Return current job detection status
      const hasJobDescription = isValidJobDescription(detectedJobDescription);
      const hasJobForm = detectJobApplicationForm();
      
      sendResponse({
        hasJob: hasJobDescription, // Badge logic: only show for job descriptions
        hasJobForm: hasJobForm,
        hasJobDescription: hasJobDescription
      });
    }

    if (message.type === 'GET_JOB_DETAILS') {
      // Get detailed job information from the page
      const companyName = extractCompanyName(document.body.innerText || '') || 'Unknown Company';
      const jobTitle = document.title.replace(/\|.*$/, '').trim() || 'Unknown Position';
      const jobDescription = detectedJobDescription?.text?.substring(0, 500) || '';

      sendResponse({
        companyName: companyName,
        jobTitle: jobTitle,
        jobDescription: jobDescription,
        url: window.location.href
      });
    }
    
    return true;
  });

  // ===== APPLICATION TRACKING SYSTEM =====
  
  // Detect potential job application pages and track submissions
  function initApplicationTracking() {
    // Only track on job-related pages
    if (!isJobApplicationPage()) return;
    
    console.log('🎯 Application tracking enabled on:', window.location.href);
    
    // Track form submissions
    trackFormSubmissions();
    
    // Track navigation to success pages
    trackSuccessPages();
    
    // Track content changes for success messages
    trackSuccessContent();
  }
  
  // Check if current page is likely a job application
  function isJobApplicationPage() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const bodyText = document.body?.textContent?.toLowerCase() || '';
    
    // URL patterns
    const jobUrlPatterns = [
      /\/jobs?\//, /\/careers?\//, /\/apply\/?/, /\/application\/?/,
      /greenhouse\.io/, /workday\.com/, /lever\.co/, /linkedin\.com\/jobs/,
      /indeed\.com/, /glassdoor\.com/, /monster\.com/
    ];
    
    // Title patterns
    const jobTitlePatterns = [
      /apply/i, /application/i, /job/i, /career/i, /position/i,
      /hiring/i, /recruit/i, /opening/i
    ];
    
    // Content patterns
    const jobContentPatterns = [
      /submit application/i, /apply now/i, /send application/i,
      /job application/i, /application form/i
    ];
    
    return jobUrlPatterns.some(pattern => pattern.test(url)) ||
           jobTitlePatterns.some(pattern => pattern.test(title)) ||
           jobContentPatterns.some(pattern => pattern.test(bodyText));
  }
  
  // Track form submissions that might be job applications
  function trackFormSubmissions() {
    // Find all forms that look like job application forms
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      // Check if form contains job application indicators
      if (isJobApplicationForm(form)) {
        form.addEventListener('submit', handleFormSubmission);
        console.log('📋 Tracking form submission for potential job application');
      }
    });
  }
  
  // Check if a form looks like a job application
  function isJobApplicationForm(form) {
    const formHTML = form.innerHTML.toLowerCase();
    const formText = form.textContent?.toLowerCase() || '';
    
    const applicationIndicators = [
      'submit application', 'apply now', 'send application',
      'job application', 'application form', 'cover letter',
      'resume', 'cv', 'work experience', 'education',
      'phone', 'email', 'address', 'linkedin'
    ];
    
    return applicationIndicators.some(indicator => 
      formHTML.includes(indicator) || formText.includes(indicator)
    );
  }
  
  // Check if the current page looks like a job application page
  function isLikelyJobApplicationPage() {
    const pageText = document.body?.textContent?.toLowerCase() || '';
    const pageHTML = document.body?.innerHTML?.toLowerCase() || '';
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    
    const applicationIndicators = [
      'job application', 'apply now', 'submit application', 'application form',
      'cover letter', 'resume', 'cv', 'work experience', 'education',
      'career', 'job posting', 'position details', 'apply for this job',
      'submit your application', 'job application form'
    ];
    
    const urlIndicators = [
      'apply', 'application', 'job', 'career', 'jobs', 'careers'
    ];
    
    // Check page content
    const hasContentIndicators = applicationIndicators.some(indicator => 
      pageText.includes(indicator) || pageHTML.includes(indicator)
    );
    
    // Check URL
    const hasUrlIndicators = urlIndicators.some(indicator => 
      url.includes(indicator)
    );
    
    // Check if there are forms with personal info fields
    const forms = document.querySelectorAll('form');
    let hasApplicationForm = false;
    for (const form of forms) {
      if (isJobApplicationForm(form)) {
        hasApplicationForm = true;
        break;
      }
    }
    
    return hasContentIndicators || hasUrlIndicators || hasApplicationForm;
  }
  
  // Handle form submission
  async function handleFormSubmission(event) {
    console.log('📝 Form submitted - checking if job application...');
    
    // Wait a bit for any redirects or page changes
    setTimeout(() => {
      checkForApplicationSuccess();
    }, 2000);
  }
  
  // Track navigation to success/thank you pages
  function trackSuccessPages() {
    // Monitor URL changes
    let currentUrl = window.location.href;
    
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        checkForApplicationSuccess();
      }
    });
    
    urlObserver.observe(document, { childList: true, subtree: true });
    
    // Also check periodically
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        checkForApplicationSuccess();
      }
    }, 1000);
  }
  
  // Track content changes for success messages
  function trackSuccessContent() {
    const contentObserver = new MutationObserver(() => {
      checkForApplicationSuccess();
    });
    
    contentObserver.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: true 
    });
  }
  
  // Check if application was successfully submitted
  function checkForApplicationSuccess() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const bodyText = document.body?.textContent?.toLowerCase() || '';
    
    // Success URL patterns
    const successUrlPatterns = [
      /success/i, /thank.?you/i, /submitted/i, /confirmed/i, /complete/i,
      /applied/i, /application.?received/i, /next.?steps/i
    ];
    
    // Success content patterns
    const successContentPatterns = [
      /application.*submitted/i, /thank.*applying/i, /application.*received/i,
      /successfully.*applied/i, /application.*confirmed/i, /next.*steps/i,
      /we.*received.*application/i, /application.*complete/i
    ];
    
    const isSuccessPage = 
      successUrlPatterns.some(pattern => pattern.test(url)) ||
      successUrlPatterns.some(pattern => pattern.test(title)) ||
      successContentPatterns.some(pattern => pattern.test(bodyText));
    
    if (isSuccessPage) {
      console.log('🎉 Application success detected!');
      showApplicationTrackingDialog();
    }
  }
  
  // Show dialog to track the application
  function showApplicationTrackingDialog() {
    // Prevent multiple dialogs
    if (document.querySelector('.resaid-tracking-dialog')) return;
    
    // Extract job details from page
    const jobDetails = extractJobDetails();
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'resaid-tracking-dialog';
    dialog.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; margin-right: 12px;"></div>
          <h3 style="margin: 0; color: #333; font-size: 18px;">Track Application</h3>
        </div>
        
        <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">
          We detected a successful job application. Would you like to track it?
        </p>
        
        <div style="margin-bottom: 16px;">
          <div style="font-size: 14px; color: #333; margin-bottom: 4px;"><strong>Company:</strong> ${jobDetails.company || 'Unknown'}</div>
          <div style="font-size: 14px; color: #333; margin-bottom: 4px;"><strong>Position:</strong> ${jobDetails.position || 'Unknown'}</div>
          <div style="font-size: 14px; color: #333;"><strong>Location:</strong> ${jobDetails.location || 'Unknown'}</div>
        </div>
        
        <div style="display: flex; gap: 8px;">
          <button id="track-yes" style="
            flex: 1;
            padding: 10px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">Track It</button>
          <button id="track-no" style="
            flex: 1;
            padding: 10px 16px;
            background: #f5f5f5;
            color: #666;
            border: 1px solid #ddd;
            border-radius: 8px;
            cursor: pointer;
          ">Not Now</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Handle button clicks
    document.getElementById('track-yes').addEventListener('click', () => {
      trackApplication(jobDetails);
      dialog.remove();
    });
    
    document.getElementById('track-no').addEventListener('click', () => {
      dialog.remove();
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (dialog.parentNode) {
        dialog.remove();
      }
    }, 10000);
  }
  
  // Extract job details from the current page
  function extractJobDetails() {
    const title = document.title;
    const url = window.location.href;
    const bodyText = document.body?.textContent || '';
    
    // Try to extract company and position from title
    let company = '';
    let position = '';
    let location = '';
    
    // Common patterns: "Company - Position" or "Position at Company"
    const titlePatterns = [
      /^(.+?)\s*[-–—]\s*(.+)$/,
      /^(.+?)\s+at\s+(.+)$/,
      /^(.+?)\s*\|\s*(.+)$/,
      /^(.+?)\s*@\s*(.+)$/
    ];
    
    for (const pattern of titlePatterns) {
      const match = title.match(pattern);
      if (match) {
        if (title.toLowerCase().includes(' at ')) {
          position = match[1].trim();
          company = match[2].trim();
        } else {
          company = match[1].trim();
          position = match[2].trim();
        }
        break;
      }
    }
    
    // If no match, try to extract from URL
    if (!company || !position) {
      const urlParts = url.split('/').filter(p => p);
      for (const part of urlParts) {
        if (part.length > 2 && !part.includes('.') && !/\d/.test(part)) {
          if (!company) company = part;
          else if (!position) position = part;
        }
      }
    }
    
    // Try to extract location from body text
    const locationPatterns = [
      /location:?\s*([^,\n]{1,50})/i,
      /📍\s*([^,\n]{1,50})/,
      /location[^:]*:?\s*([^,\n]{1,50})/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = bodyText.match(pattern);
      if (match && match[1]) {
        location = match[1].trim();
        break;
      }
    }
    
    return {
      company: company || 'Unknown Company',
      position: position || 'Unknown Position', 
      location: location || 'Unknown Location',
      url: url,
      appliedDate: new Date().toISOString()
    };
  }
  
  // Save application to local storage
  async function trackApplication(jobDetails) {
    try {
      console.log('💾 Saving application:', jobDetails);
      
      // Send to background script to save
      chrome.runtime.sendMessage({
        type: 'SAVE_APPLICATION',
        data: {
          company: jobDetails.company,
          position: jobDetails.position,
          location: jobDetails.location,
          url: jobDetails.url,
          status: 'Applied',
          appliedDate: jobDetails.appliedDate,
          notes: 'Automatically tracked by ResAid',
          jobDescription: detectedJobDescription?.text || ''
        }
      });
      
      // Show success feedback
      showTrackingSuccess();
      
    } catch (error) {
      console.error('Error tracking application:', error);
    }
  }
  
  // Show success feedback
  function showTrackingSuccess() {
    const success = document.createElement('div');
    success.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-weight: 600;
    `;
    success.textContent = 'Application tracked successfully!';
    
    document.body.appendChild(success);
    
    setTimeout(() => {
      if (success.parentNode) {
        success.remove();
      }
    }, 3000);
  }
  
  // Manual field detection test (call from console)
  window.testFieldDetection = function(selector) {
    const field = selector ? document.querySelector(selector) : document.activeElement;
    if (!field) {
      console.log('ResAid: No field found');
      return;
    }
    console.log('ResAid: Testing field detection for:', field);
    const fieldType = detectFieldType(field);
    console.log('ResAid: Detected field type:', fieldType);
    return fieldType;
  };

  // Manual field filling test (call from console)
  window.testFieldFill = function(selector, value) {
    const field = selector ? document.querySelector(selector) : document.activeElement;
    if (!field) {
      console.log('ResAid: No field found');
      return;
    }
    console.log('ResAid: Filling field with value:', value);
    fillField(field, value);
  };

  // Store reference to detectFieldType for global access
  window._resAidDetectFieldType = detectFieldType;

})();
