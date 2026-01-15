// Settings page logic

document.addEventListener('DOMContentLoaded', async () => {
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const linkedinInput = document.getElementById('linkedin');
  const locationInput = document.getElementById('location');
  const currentCompanyInput = document.getElementById('currentCompany');
  const fetchProfileBtn = document.getElementById('fetchProfileBtn');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load existing settings
  const settings = await chrome.storage.sync.get([
    'apiEndpoint', 
    'apiKey',
    'fullName',
    'email',
    'phone',
    'linkedin',
    'location',
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
  emailInput.value = settings.email || '';
  phoneInput.value = settings.phone || '';
  linkedinInput.value = settings.linkedin || '';
  locationInput.value = settings.location || '';
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

      // Populate fields
      fullNameInput.value = profile.fullName || '';
      emailInput.value = profile.email || '';
      phoneInput.value = profile.phone || '';
      linkedinInput.value = profile.linkedin || '';
      locationInput.value = profile.location || '';
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
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      linkedin: linkedinInput.value.trim(),
      location: locationInput.value.trim(),
      currentCompany: currentCompanyInput.value.trim()
    });

    status.className = 'status success';
    status.textContent = '✓ Settings saved successfully!';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
});
