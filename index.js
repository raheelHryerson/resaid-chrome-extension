// Landing page JavaScript
document.addEventListener('DOMContentLoaded', async () => {
  const signInBtn = document.getElementById('googleSignInBtn');
  const signInSection = document.getElementById('signInSection');
  const continueSection = document.getElementById('continueSection');
  const authStatus = document.getElementById('authStatus');
  const userName = document.getElementById('userName');

  // Check if user is already signed in
  const result = await chrome.storage.sync.get(['userEmail', 'userName']);
  
  if (result.userEmail) {
    // User is signed in
    userName.textContent = result.userEmail;
    authStatus.classList.add('show');
    signInSection.style.display = 'none';
    continueSection.style.display = 'block';
  }

  // Google Sign In (mock for now - integrate with your backend)
  signInBtn.addEventListener('click', async () => {
    // In production, use chrome.identity.launchWebAuthFlow
    // For now, mock authentication
    const email = prompt('Enter your email (demo):');
    if (email) {
      await chrome.storage.sync.set({
        userEmail: email,
        userName: email.split('@')[0],
        onboardingComplete: false
      });
      
      // Redirect to onboarding
      window.location.href = 'onboarding.html';
    }
  });
});
