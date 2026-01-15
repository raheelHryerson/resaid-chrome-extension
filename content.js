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
    // Order matters: more specific patterns BEFORE broader ones
    firstName: ['firstname', 'first_name', 'fname', 'givenname', 'legalname--firstname'],
    lastName: ['lastname', 'last_name', 'lname', 'surname', 'familyname', 'legalname--lastname'],
    fullName: ['full name', 'fullname', 'full_name', 'applicantname', 'candidatename', 'legal name', 'legalname', 'your name'],
    email: ['email', 'e-mail', 'emailaddress', 'mail'],
    // Put extension and country code before phone so "phoneNumber--extension" maps correctly
    extension: ['extension', 'ext', 'phone extension', 'ext number'],
    countryPhoneCode: ['country code', 'country phone code', 'phone country', 'intl code', 'countryphonecode'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'phonenumber', 'contact'],
    linkedin: ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedinprofile'],
    // Specific address fields BEFORE generic location
    city: ['city', 'town'],
    postalCode: ['postal', 'zip', 'zipcode', 'postcode', 'postalcode'],
    country: ['country', 'nation', 'countryregion', 'province', 'territory', 'region', 'state', 'provinceorterritory'],
    location: ['addressline1', 'addressline2', 'address1', 'address2', 'address', 'street', 'location', 'residence', 'currentlocation'],
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
    console.log('\n📊 ResAid: Job Description Scoring Results');
    console.log('═══════════════════════════════════════════════════════════════');
    topCandidates.forEach((c, idx) => {
      console.log(`\n🔹 Candidate ${idx + 1}:`);
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

    // Fallback: if confidence 0.5-0.75, return with medium confidence
    if (scoredCandidates[0] && scoredCandidates[0].score.total >= 0.5) {
      return {
        text: scoredCandidates[0].text.trim(),
        element: scoredCandidates[0].element,
        confidence: scoredCandidates[0].score.total,
        reasons: scoredCandidates[0].score.reasons
      };
    }

    console.log('ResAid: All candidates below confidence threshold');
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
      '.job-description',
      '.description__text',
      '.show-more-less-html__markup',
      '.posting-description'
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
    const allDivs = document.querySelectorAll('div');
    console.log(`ResAid: Checking ${allDivs.length} divs in fallback...`);
    let fallbackChecked = 0;
    for (const el of allDivs) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text && text.length >= 1500 && text.length <= 20000 && !seen.has(text)) {
        fallbackChecked++;
        // Look for multiple job posting indicators
        const hasJobKeywords = /\b(job\s+description|description:|responsibilities:|qualifications:|requirements:|what you['']ll do|minimum qualifications|nice to have)\b/i.test(text);
        if (hasJobKeywords) {
          const visible = isVisible(el);
          const inNav = isInNavFooter(el);
          const noise = isNavigationNoise(text, el);
          console.log(`ResAid: Fallback div (${text.length} chars): hasKeywords=true, visible=${visible}, inNav=${inNav}, isNoise=${noise}`);
          if (visible && !inNav && !noise) {
            candidates.push({ element: el, text });
            seen.add(text);
            console.log(`ResAid: ✅ Added candidate from fallback (${text.length} chars)`);
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

    let current = element;
    while (current) {
      const tag = current.tagName.toLowerCase();
      const classes = (current.className || '').toLowerCase();
      const currentId = (current.id || '').toLowerCase();
      
      if (tag === 'nav' || tag === 'footer' ||
          classes.includes('nav') || classes.includes('footer') ||
          classes.includes('sidebar') || classes.includes('aside') ||
          currentId.includes('nav') || currentId.includes('footer')) {
        return true;
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

      // Weighted composite (your spec: Skills 35%, Exp 30%, Role 15%, Seniority 10%, Edu 5%, Keywords 5%)
      const overallScore = (
        skillsScore * 0.35 +
        experienceScore * 0.30 +
        roleScore * 0.15 +
        seniorityScore * 0.10 +
        educationScore * 0.05 +
        keywordScore * 0.05
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
      console.log(`\n📊 Component Breakdown:`);
      console.log(`   • Skills Match: ${Math.round(skillsScore * 100)}% (35% weight)`);
      console.log(`   • Experience Relevance: ${Math.round(experienceScore * 100)}% (30% weight)`);
      console.log(`   • Role Alignment: ${Math.round(roleScore * 100)}% (15% weight)`);
      console.log(`   • Seniority Match: ${Math.round(seniorityScore * 100)}% (10% weight)`);
      console.log(`   • Education Match: ${Math.round(educationScore * 100)}% (5% weight)`);
      console.log(`   • Keyword Coverage: ${Math.round(keywordScore * 100)}% (5% weight)`);
      
      if (missingSkills.length > 0) {
        console.log(`\n❌ Missing Skills: ${missingSkills.slice(0, 3).join(', ')}`);
      }
      
      const strengths = getStrengths(skillsScore, experienceScore, roleScore, seniorityScore);
      if (strengths.length > 0) {
        console.log(`\n✅ Strengths: ${strengths.join(', ')}`);
      }

      const recommendations = getRecommendations(missingSkills, experienceScore, educationScore);
      if (recommendations.length > 0) {
        console.log(`\n💡 Recommendations: ${recommendations.join('; ')}`);
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
      field.getAttribute('data-qa'),
      field.className
    ].filter(Boolean).join(' ').toLowerCase();

    // Try to match each field type with patterns
    for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
      for (const pattern of patterns) {
        if (attributes.includes(pattern.toLowerCase())) {
          return fieldType;
        }
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

    console.log('ResAid: Personal Info loaded:', personalInfo);

    // Find all input fields on the page
    const fields = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea');
    
    console.log('ResAid: Found', fields.length, 'input fields');
    
    let filled = 0;
    for (const field of fields) {
      // Skip if already filled
      if (field.value && field.value.trim().length > 0) {
        console.log('ResAid: Skipping already-filled field:', field.name || field.id);
        continue;
      }

      const fieldType = detectFieldType(field);
      console.log('ResAid: Field', field.name || field.id, '-> type:', fieldType);
      
      if (fieldType) {
        try {
          // Prefer explicit first/last if available; fall back to splitting fullName
          if (fieldType === 'firstName') {
            const firstName = personalInfo.firstName || (personalInfo.fullName ? personalInfo.fullName.split(' ')[0] : '');
            if (firstName) {
              fillField(field, firstName);
              filled++;
              console.log('ResAid: Filled firstName:', firstName);
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
              console.log('ResAid: Filled lastName:', lastName);
            }
          } else if (personalInfo[fieldType]) {
            fillField(field, personalInfo[fieldType]);
            filled++;
            console.log('ResAid: Filled', fieldType, ':', personalInfo[fieldType]);
          }
        } catch (e) {
          console.log('ResAid: Error filling field:', e);
        }
      }
    }

    console.log(`ResAid: Auto-filled ${filled} field(s)`);
  }

  // Auto-extract job description on page load (kept), but do NOT auto-fill
  setTimeout(async () => {
    let jd = extractJobDescription();

    if (!isValidJobDescription(jd)) {
      // Try carry-over from previous tab
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

      // Calculate and show fit score automatically
      await calculateAndShowFitScore();
    }
  }, 1000);

  // Calculate fit score and show floating badge
  async function calculateAndShowFitScore() {
    try {
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
        // Show floating badge with score
        showFitScoreBadge(scoreResult);
      }
    } catch (err) {
      console.error('ResAid: Error calculating fit score:', err);
    }
  }

  // Show floating fit score badge on page
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
      z-index: 999999;
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

    badge.innerHTML = `
      <div style="font-size: 11px; opacity: 0.9; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">Resume-Job Fit</div>
      <div style="font-size: 36px; font-weight: 700; line-height: 1; margin-bottom: 8px;">${score}%</div>
      <div style="font-size: 10px; opacity: 0.8; margin-bottom: 8px;">
        Skills: ${scoreData.scoreComponents.skillsMatch}% • 
        Experience: ${scoreData.scoreComponents.experienceRelevance}%
      </div>
      ${scoreData.missingSkills && scoreData.missingSkills.length > 0 ? 
        `<div style="font-size: 10px; background: rgba(255,255,255,0.2); padding: 6px 8px; border-radius: 6px; margin-top: 8px;">
          ⚠️ Missing: ${scoreData.missingSkills.slice(0, 2).join(', ')}
        </div>` : ''}
      <div style="font-size: 9px; opacity: 0.7; margin-top: 8px; text-align: center;">Click to open ResAid</div>
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
      // Open extension popup (triggers browser action)
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    // Slide in animation
    badge.style.transform = 'translateX(300px)';
    document.body.appendChild(badge);
    
    requestAnimationFrame(() => {
      badge.style.transition = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
      badge.style.transform = 'translateX(0)';
    });
  }

  // Remove automatic autofill on DOM mutations; only fill when user presses the button

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
    
    if (message.type === 'AUTOFILL_COMMON_FIELDS') {
      autoFillCommonFields();
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
    
    return true;
  });

})();
