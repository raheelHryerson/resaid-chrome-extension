// Settings page logic

document.addEventListener('DOMContentLoaded', async () => {
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load existing settings
  const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
  
  if (settings.apiEndpoint) {
    apiEndpointInput.value = settings.apiEndpoint;
  }
  
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const apiEndpoint = apiEndpointInput.value.trim() || 'http://localhost:3000';
    const apiKey = apiKeyInput.value.trim();

    await chrome.storage.sync.set({
      apiEndpoint,
      apiKey: apiKey || null
    });

    status.className = 'status success';
    status.textContent = '✓ Settings saved successfully!';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
});
