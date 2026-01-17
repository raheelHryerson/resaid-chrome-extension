// Test script to verify extension API connection
// Run this in browser console while on a job page with extension loaded

async function testExtensionConnection() {
  console.log('🔍 Testing ResAid Extension Connection...');

  // Check if extension is loaded
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.error('❌ Chrome extension APIs not available');
    return;
  }

  try {
    // Check stored settings
    const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
    console.log('📋 Current Settings:', settings);

    if (!settings.apiEndpoint || !settings.apiKey) {
      console.log('⚠️ API not configured - extension using local storage only');
      console.log('To connect: 1) Open extension settings 2) Add API endpoint and key 3) Click "Load from Account"');
      return;
    }

    // Test API connection
    console.log('🌐 Testing API connection...');
    const response = await fetch(`${settings.apiEndpoint}/api/user/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API Connection Successful!');
      console.log('📄 Profile Data:', data.profile);
      console.log('🔗 Extension is CONNECTED to your account!');
    // Test resume syncing
    console.log('📄 Testing resume sync...');
    const resumeResponse = await fetch(`${settings.apiEndpoint}/api/resumes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (resumeResponse.ok) {
      const resumeData = await resumeResponse.json();
      console.log('✅ Resume sync successful!');
      console.log('📋 Resumes found:', resumeData.resumes?.length || 0);
      if (resumeData.resumes?.length > 0) {
        console.log('📄 Resume names:', resumeData.resumes.map(r => r.fileName));
      }
    // Test answer generation
    console.log('🤖 Testing answer generation...');
    const testResumeId = resumeData.resumes?.[0]?.id;
    if (testResumeId) {
      const answerResponse = await fetch(`${settings.apiEndpoint}/api/resumes/${testResumeId}/answers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          questions: ['Why do you want to work here?'],
          jobDescription: 'Software Engineer position requiring React and Node.js experience',
          tone: 'neutral'
        })
      });

      if (answerResponse.ok) {
        const answerData = await answerResponse.json();
        console.log('✅ Answer generation successful!');
        console.log('💬 Generated answer:', answerData.answers?.[0]?.substring(0, 100) + '...');
      } else {
        console.error('❌ Answer generation failed:', answerResponse.status);
      }
    } else {
      console.log('⚠️ No resumes found to test answer generation');
    }

  } catch (error) {
    console.error('❌ Connection test failed:', error);
    console.log('🔄 Extension using local storage fallback');
  }
}

// Auto-run test
testExtensionConnection();