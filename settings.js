// Settings page logic

document.addEventListener('DOMContentLoaded', async () => {
  const fullNameInput = document.getElementById('fullName');
  const firstNameInput = document.getElementById('firstName');
  const lastNameInput = document.getElementById('lastName');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const countryPhoneCodeInput = document.getElementById('countryPhoneCode');
  const extensionInput = document.getElementById('extension');
  const cityInput = document.getElementById('city');
  const postalCodeInput = document.getElementById('postalCode');
  const locationInput = document.getElementById('location');
  const addressLine2Input = document.getElementById('addressLine2');
  const countryInput = document.getElementById('country');
  const provinceInput = document.getElementById('province');
  const linkedinInput = document.getElementById('linkedin');
  const currentCompanyInput = document.getElementById('currentCompany');
  const middleNameInput = document.getElementById('middleName');
  const githubInput = document.getElementById('github');
  const portfolioInput = document.getElementById('portfolio');
  const twitterInput = document.getElementById('twitter');
  const pronounsInput = document.getElementById('pronouns');
  const salaryInput = document.getElementById('salary');
  const availabilityInput = document.getElementById('availability');
  const workAuthInput = document.getElementById('workAuth');
  const referralInput = document.getElementById('referral');
  const fetchProfileBtn = document.getElementById('fetchProfileBtn');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // New API connection elements
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
  const getApiKeyBtn = document.getElementById('getApiKeyBtn');
  const syncResumesBtn = document.getElementById('syncResumesBtn');

  // Load existing settings
  const settings = await chrome.storage.sync.get([
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
    'referral',
    'apiEndpoint',
    'apiKey'
  ]);

  // Load personal info
  fullNameInput.value = settings.fullName || '';
  firstNameInput.value = settings.firstName || '';
  middleNameInput.value = settings.middleName || '';
  lastNameInput.value = settings.lastName || '';
  emailInput.value = settings.email || '';
  phoneInput.value = settings.phone || '';
  countryPhoneCodeInput.value = settings.countryPhoneCode || '';
  extensionInput.value = settings.extension || '';
  cityInput.value = settings.city || '';
  postalCodeInput.value = settings.postalCode || '';
  locationInput.value = settings.location || '';
  addressLine2Input.value = settings.addressLine2 || '';
  countryInput.value = settings.country || '';
  provinceInput.value = settings.province || '';
  linkedinInput.value = settings.linkedin || '';
  githubInput.value = settings.github || '';
  portfolioInput.value = settings.portfolio || '';
  twitterInput.value = settings.twitter || '';
  pronounsInput.value = settings.pronouns || '';
  currentCompanyInput.value = settings.currentCompany || '';
  salaryInput.value = settings.salary || '';
  availabilityInput.value = settings.availability || '';
  workAuthInput.value = settings.workAuth || '';
  referralInput.value = settings.referral || '';

  // Load API settings
  apiEndpointInput.value = settings.apiEndpoint || '';
  apiKeyInput.value = settings.apiKey || '';

  // Get API Key button
  getApiKeyBtn.addEventListener('click', () => {
    const endpoint = apiEndpointInput.value.trim();
    if (!endpoint) {
      status.className = 'status';
      status.style.background = '#ffebee';
      status.style.color = '#c62828';
      status.style.display = 'block';
      status.textContent = '❌ Please enter your API endpoint first';
      return;
    }
    
    // Open web app in new tab for user to get API key
    const apiKeyUrl = `${endpoint}/dashboard?tab=api-key`;
    chrome.tabs.create({ url: apiKeyUrl });
    
    status.className = 'status success';
    status.textContent = '✓ Opened web app. Copy your API key and paste it above.';
    status.style.display = 'block';
  });

  // Sync resumes button
  syncResumesBtn.addEventListener('click', async () => {
    const apiEndpoint = apiEndpointInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!apiEndpoint || !apiKey) {
      status.className = 'status';
      status.style.background = '#ffebee';
      status.style.color = '#c62828';
      status.style.display = 'block';
      status.textContent = '❌ Please configure API endpoint and key first';
      return;
    }

    syncResumesBtn.textContent = '⏳ Syncing...';
    syncResumesBtn.disabled = true;

    try {
      const response = await fetch(`${apiEndpoint}/api/resumes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.resumes) {
          // Store resumes locally
          await chrome.storage.local.set({ resumes: data.resumes });

          // Mark first resume as default if none marked
          const resumes = data.resumes;
          const hasDefault = resumes.some(r => r.isDefault);
          if (!hasDefault && resumes.length > 0) {
            resumes[0].isDefault = true;
            await chrome.storage.local.set({ resumes });
          }

          status.className = 'status success';
          status.textContent = `✓ Synced ${resumes.length} resume(s) from your account!`;
        } else {
          throw new Error('Invalid response format');
        }
      } else {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (error) {
      status.className = 'status';
      status.style.background = '#ffebee';
      status.style.color = '#c62828';
      status.style.display = 'block';
      status.textContent = `❌ Failed to sync resumes: ${error.message}`;
    } finally {
      syncResumesBtn.textContent = '📄 Sync Resumes from Account';
      syncResumesBtn.disabled = false;
    }
  });

  // Load profile from account (API first, then local storage fallback)
  fetchProfileBtn.addEventListener('click', async () => {
    fetchProfileBtn.textContent = '⏳ Loading...';
    fetchProfileBtn.disabled = true;
    
    try {
      const apiEndpoint = apiEndpointInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      
      // Try API first if configured
      if (apiEndpoint && apiKey) {
        try {
          const response = await fetch(`${apiEndpoint}/api/user/profile`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.profile) {
              const profile = data.profile;
              
              // Populate all fields from API
              fullNameInput.value = profile.fullName || '';
              firstNameInput.value = profile.firstName || '';
              middleNameInput.value = profile.middleName || '';
              lastNameInput.value = profile.lastName || '';
              emailInput.value = profile.email || '';
              phoneInput.value = profile.phone || '';
              countryPhoneCodeInput.value = profile.countryPhoneCode || '';
              extensionInput.value = profile.extension || '';
              cityInput.value = profile.city || '';
              postalCodeInput.value = profile.postalCode || '';
              locationInput.value = profile.location || '';
              addressLine2Input.value = profile.addressLine2 || '';
              countryInput.value = profile.country || '';
              provinceInput.value = profile.province || '';
              linkedinInput.value = profile.linkedin || '';
              githubInput.value = profile.github || '';
              portfolioInput.value = profile.portfolio || '';
              twitterInput.value = profile.twitter || '';
              pronounsInput.value = profile.pronouns || '';
              currentCompanyInput.value = profile.currentCompany || '';
              salaryInput.value = profile.salary || '';
              availabilityInput.value = profile.availability || '';
              workAuthInput.value = profile.workAuth || '';
              referralInput.value = profile.referral || '';
              
              status.className = 'status success';
              status.textContent = '✓ Profile loaded from your account. Click Save to store locally.';
              status.style.display = 'block';
              return;
            }
          }
        } catch (apiError) {
          console.log('API call failed, falling back to local storage:', apiError);
        }
      }
      
      // Fallback to local storage
      const profile = await chrome.storage.sync.get([
        'fullName','firstName','middleName','lastName','email','phone','countryPhoneCode','extension','city','postalCode',
        'location','addressLine2','country','province','linkedin','github','portfolio','twitter','pronouns','currentCompany','salary','availability','workAuth','referral'
      ]);
      
      // Populate all fields from local storage
      fullNameInput.value = profile.fullName || '';
      firstNameInput.value = profile.firstName || '';
      middleNameInput.value = profile.middleName || '';
      lastNameInput.value = profile.lastName || '';
      emailInput.value = profile.email || '';
      phoneInput.value = profile.phone || '';
      countryPhoneCodeInput.value = profile.countryPhoneCode || '';
      extensionInput.value = profile.extension || '';
      cityInput.value = profile.city || '';
      postalCodeInput.value = profile.postalCode || '';
      locationInput.value = profile.location || '';
      addressLine2Input.value = profile.addressLine2 || '';
      countryInput.value = profile.country || '';
      provinceInput.value = profile.province || '';
      linkedinInput.value = profile.linkedin || '';
      githubInput.value = profile.github || '';
      portfolioInput.value = profile.portfolio || '';
      twitterInput.value = profile.twitter || '';
      pronounsInput.value = profile.pronouns || '';
      currentCompanyInput.value = profile.currentCompany || '';
      salaryInput.value = profile.salary || '';
      availabilityInput.value = profile.availability || '';
      workAuthInput.value = profile.workAuth || '';
      referralInput.value = profile.referral || '';

      status.className = 'status success';
      status.textContent = '✓ Profile loaded from local storage. Click Save to store.';
    } catch (err) {
      status.className = 'status';
      status.style.background = '#ffebee';
      status.style.color = '#c62828';
      status.style.display = 'block';
      status.textContent = '❌ Error: ' + err.message;
    } finally {
      fetchProfileBtn.textContent = '📥 Load from Account';
      fetchProfileBtn.disabled = false;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({
      fullName: fullNameInput.value.trim(),
      firstName: firstNameInput.value.trim(),
      middleName: middleNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      countryPhoneCode: countryPhoneCodeInput.value.trim(),
      extension: extensionInput.value.trim(),
      city: cityInput.value.trim(),
      postalCode: postalCodeInput.value.trim(),
      location: locationInput.value.trim(),
      addressLine2: addressLine2Input.value.trim(),
      country: countryInput.value.trim(),
      province: provinceInput.value.trim(),
      linkedin: linkedinInput.value.trim(),
      github: githubInput.value.trim(),
      portfolio: portfolioInput.value.trim(),
      twitter: twitterInput.value.trim(),
      pronouns: pronounsInput.value.trim(),
      currentCompany: currentCompanyInput.value.trim(),
      salary: salaryInput.value.trim(),
      availability: availabilityInput.value.trim(),
      workAuth: workAuthInput.value.trim(),
      referral: referralInput.value.trim(),
      apiEndpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim()
    });

    status.className = 'status success';
    status.textContent = '✓ Settings saved successfully!';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
});
