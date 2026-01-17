// Test Application Tracking - Manual Test Script
// Run this in browser console on any webpage to simulate application tracking

function simulateApplicationTracking() {
  console.log('🧪 Testing Application Tracking...');

  // Create a test application
  const testApplication = {
    id: Date.now().toString(),
    company: 'Test Company Inc.',
    position: 'Senior Software Engineer',
    location: 'San Francisco, CA',
    status: 'Applied',
    url: window.location.href,
    appliedDate: new Date().toISOString(),
    notes: 'Test application - simulated'
  };

  // Save to local storage (simulating what the extension does)
  chrome.storage.local.get(['applications'], (result) => {
    const applications = result.applications || [];
    applications.push(testApplication);

    chrome.storage.local.set({ applications }, () => {
      console.log('✅ Test application saved:', testApplication);
      console.log('📊 Total applications:', applications.length);

      // Show success message
      showTestSuccess();
    });
  });
}

function showTestSuccess() {
  const success = document.createElement('div');
  success.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    z-index: 10001;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-weight: 600;
    font-size: 14px;
  `;
  success.innerHTML = `
    ✅ Test Application Tracked!<br>
    <small>Check extension popup → Applications Tracker</small>
  `;

  document.body.appendChild(success);

  setTimeout(() => {
    if (success.parentNode) {
      success.remove();
    }
  }, 5000);
}

// Auto-run test
simulateApplicationTracking();