// Onboarding - Single page form
let selectedFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is signed in
  const user = await chrome.storage.sync.get(['userEmail', 'onboardingComplete']);
  console.log('🔍 ONBOARDING DEBUG:', { userEmail: user.userEmail, onboardingComplete: user.onboardingComplete });
  
  if (!user.userEmail) {
    window.location.href = 'index.html';
    return;
  }

  console.log('📝 Onboarding NOT complete, showing form');

  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const parsingStatus = document.getElementById('parsingStatus');
  const form = document.getElementById('onboardingForm');

  // File upload handling
  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    if (!file.name.match(/\.(pdf|doc|docx)$/i)) {
      alert('Please upload a PDF or DOC file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.add('show');
    
    // Auto-save resume metadata to storage
    saveResumeToStorage(file);
  }

  // Save resume file to Chrome storage
  async function saveResumeToStorage(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const resumeData = {
        fileName: file.name,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        isDefault: true, // Set as default resume
        fileContent: e.target.result // Base64 encoded content
      };
      
      // Save to storage
      await chrome.storage.local.set({ 
        currentResume: resumeData,
        resumes: [resumeData] // Also add to resumes array
      });
      
      console.log('📄 Resume saved:', resumeData.fileName);
    };
    reader.readAsDataURL(file); // Convert to base64
  }

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate required fields
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!firstName || !lastName || !email) {
      alert('Please fill in all required fields');
      return;
    }

    // Process resume if uploaded
    if (selectedFile) {
      console.log('✅ Resume already saved during upload');
    }

    // Collect all form data
    const onboardingData = {
      firstName: document.getElementById('firstName').value,
      lastName: document.getElementById('lastName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      city: document.getElementById('city').value,
      country: document.getElementById('country').value,
      linkedin: document.getElementById('linkedin').value,
      expectedSalary: document.getElementById('expectedSalary').value,
      yearsExperience: document.getElementById('yearsExperience').value,
      currentCompany: document.getElementById('currentCompany').value,
      willingRelocate: document.getElementById('willingRelocate').value,
      workAuthorization: document.getElementById('workAuthorization').value,
      noticePeriod: document.getElementById('noticePeriod').value,
      onboardingComplete: true,
      hasResume: !!selectedFile
    };

    // Save to Chrome storage
    await chrome.storage.sync.set(onboardingData);
    console.log('💾 Saved onboarding data:', onboardingData);
    console.log('🎉 Onboarding complete, redirecting to dashboard');

    // Redirect to dashboard
    window.location.href = 'dashboard.html';
  });

  // Load any previously saved data
  const saved = await chrome.storage.sync.get([
    'firstName', 'lastName', 'email', 'phone', 'city', 'country', 'linkedin',
    'expectedSalary', 'yearsExperience', 'currentCompany', 'willingRelocate', 'workAuthorization', 'noticePeriod'
  ]);

  Object.keys(saved).forEach(key => {
    const input = document.getElementById(key);
    if (input && saved[key]) input.value = saved[key];
  });
});

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

