// Settings page logic

document.addEventListener('DOMContentLoaded', async () => {
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
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
  const fetchProfileBtn = document.getElementById('fetchProfileBtn');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load existing settings
  const settings = await chrome.storage.sync.get([
    'apiEndpoint', 
    'apiKey',
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
  ]);
  
  if (settings.apiEndpoint) {
    apiEndpointInput.value = settings.apiEndpoint;
  }
  
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }

  // Load personal info
  fullNameInput.value = settings.fullName || '';
  firstNameInput.value = settings.firstName || '';
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
  currentCompanyInput.value = settings.currentCompany || '';

  // Fetch profile from API
  fetchProfileBtn.addEventListener('click', async () => {
    const apiEndpoint = apiEndpointInput.value.trim() || 'http://localhost:3000';
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      status.className = 'status';
      status.style.background = '#ffebee';
      status.style.color = '#c62828';
      status.style.display = 'block';
      status.textContent = '⚠️ Please enter your API key first';
      return;
    }

    fetchProfileBtn.textContent = '⏳ Fetching...';
    fetchProfileBtn.disabled = true;

    try {
      const response = await fetch(`${apiEndpoint}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      const profile = data.profile;

      // Populate all fields
      fullNameInput.value = profile.fullName || '';
      firstNameInput.value = profile.firstName || '';
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
      currentCompanyInput.value = profile.currentCompany || '';

      status.className = 'status success';
      status.textContent = '✓ Profile fetched successfully! Click Save to store.';
    } catch (err) {
      status.className = 'status';
      status.style.background = '#ffebee';
      status.style.color = '#c62828';
      status.style.display = 'block';
      status.textContent = '❌ Error: ' + err.message;
    } finally {
      fetchProfileBtn.textContent = '📥 Fetch from Resume';
      fetchProfileBtn.disabled = false;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const apiEndpoint = apiEndpointInput.value.trim() || 'http://localhost:3000';
    const apiKey = apiKeyInput.value.trim();

    await chrome.storage.sync.set({
      apiEndpoint,
      apiKey: apiKey || null,
      fullName: fullNameInput.value.trim(),
      firstName: firstNameInput.value.trim(),
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
      currentCompany: currentCompanyInput.value.trim()
    });

    status.className = 'status success';
    status.textContent = '✓ Settings saved successfully!';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
});
