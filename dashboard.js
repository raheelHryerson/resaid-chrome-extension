// Dashboard JavaScript
const ACHIEVEMENTS = [
  { id: 'first_app', name: '🚀 First Step', description: 'Apply to your first job', condition: (stats) => stats.totalApplications >= 1 },
  { id: 'five_apps', name: '📤 Five Apply', description: 'Apply to 5 jobs', condition: (stats) => stats.totalApplications >= 5 },
  { id: 'ten_apps', name: '💪 Persistent', description: 'Apply to 10 jobs', condition: (stats) => stats.totalApplications >= 10 },
  { id: 'twenty_apps', name: '🔥 On Fire', description: 'Apply to 20 jobs', condition: (stats) => stats.totalApplications >= 20 },
  { id: 'high_match', name: '🎯 Perfect Match', description: 'Find a 90%+ match job', condition: (stats) => stats.maxMatchScore >= 90 },
  { id: 'interview', name: '💼 Interview Ready', description: 'Land an interview', condition: (stats) => stats.interviews >= 1 },
  { id: 'offer', name: '🏆 Winner', description: 'Get a job offer', condition: (stats) => stats.offers >= 1 },
  { id: 'week_streak', name: '📆 Weekly Warrior', description: 'Apply 7 days in a row', condition: (stats) => stats.streak >= 7 }
];

let allApplications = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is signed in, if not redirect to landing
  const user = await chrome.storage.sync.get(['userEmail', 'onboardingComplete']);
  if (!user.userEmail) {
    window.location.href = 'index.html';
    return;
  }

  // If onboarding is NOT complete, redirect to onboarding
  if (!user.onboardingComplete) {
    window.location.href = 'onboarding.html';
    return;
  }

  // Load user email
  document.getElementById('userEmail').textContent = user.userEmail;

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Load all data
  await loadResumes();
  await loadPersonalInfo();
  await loadExtraInfo();
  await loadApplications();
  updateAchievements();
});

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

// === RESUMES TAB ===
async function loadResumes() {
  const uploadBox = document.getElementById('uploadBox');
  const fileInput = document.getElementById('resumeFileInput');
  const resumeList = document.getElementById('resumeList');

  uploadBox.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await uploadResume(e.target.files[0]);
    }
  });

  // Load resumes from local storage
  const stored = await chrome.storage.local.get(['resumes']);
  const resumes = stored.resumes || [];

  if (resumes.length === 0) {
    resumeList.innerHTML = `
      <li class="empty-state">
        <div class="empty-icon">📁</div>
        <div>No resumes uploaded yet</div>
      </li>
    `;
    return;
  }

  resumeList.innerHTML = resumes.map(resume => `
    <li class="resume-item">
      <div class="resume-info">
        <div class="resume-name">📄 ${resume.fileName || 'Resume'}</div>
        <div class="resume-meta">Uploaded ${formatDate(resume.uploadedAt)} ${resume.isDefault ? '• Default' : ''}</div>
      </div>
      <div class="resume-actions">
        <button class="btn btn-secondary" onclick="setDefaultResume('${resume.id || ''}')">Set Default</button>
        <button class="btn btn-secondary" onclick="deleteResume('${resume.id || ''}')">Delete</button>
      </div>
    </li>
  `).join('');
}

async function uploadResume(file) {
  try {
    const bufferToBase64 = (arrayBuffer) => {
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };

    const arrayBuffer = await file.arrayBuffer();
    const base64Content = bufferToBase64(arrayBuffer);

    const newResume = {
      id: `${Date.now()}`,
      fileName: file.name,
      contentBase64: base64Content,
      uploadedAt: new Date().toISOString(),
      isDefault: false
    };

    const stored = await chrome.storage.local.get(['resumes']);
    const resumes = stored.resumes || [];
    const updated = [...resumes, newResume];
    await chrome.storage.local.set({ resumes: updated, currentResume: newResume });

    alert('Resume uploaded successfully!');
    await loadResumes();
  } catch (error) {
    console.error('Upload error:', error);
    alert('Failed to upload resume. Please try again.');
  }
}

window.setDefaultResume = async function(id) {
  const stored = await chrome.storage.local.get(['resumes']);
  const resumes = stored.resumes || [];
  const updated = resumes.map(r => ({ ...r, isDefault: r.id === id }));
  const current = updated.find(r => r.isDefault) || null;
  await chrome.storage.local.set({ resumes: updated, currentResume: current });
  await loadResumes();
};

window.deleteResume = async function(id) {
  if (!confirm('Are you sure you want to delete this resume?')) return;
  const stored = await chrome.storage.local.get(['resumes']);
  const resumes = stored.resumes || [];
  const updated = resumes.filter(r => r.id !== id);
  const current = await chrome.storage.local.get(['currentResume']);
  let newCurrent = current.currentResume;
  if (newCurrent && newCurrent.id === id) {
    newCurrent = updated.find(r => r.isDefault) || (updated[0] || null);
  }
  await chrome.storage.local.set({ resumes: updated, currentResume: newCurrent });
  alert('Resume deleted');
  await loadResumes();
};

// Auto-refresh resumes when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.resumes) {
    loadResumes();
  }
});

// === PERSONAL INFO TAB ===
async function loadPersonalInfo() {
  const fields = ['firstName', 'lastName', 'email', 'phone', 'city', 'country', 'linkedin'];
  const saved = await chrome.storage.sync.get(fields);

  fields.forEach(field => {
    const input = document.getElementById(field);
    if (input && saved[field]) {
      input.value = saved[field];
    }
  });

  document.getElementById('personalInfoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {};
    fields.forEach(field => {
      const input = document.getElementById(field);
      if (input) data[field] = input.value;
    });

    await chrome.storage.sync.set(data);
    alert('Personal info saved successfully!');
  });
}

async function loadExtraInfo() {
  const fields = ['expectedSalary', 'yearsExperience', 'currentCompany', 'willingRelocate', 'workAuthorization', 'noticePeriod', 'coverLetterTemplate'];
  const saved = await chrome.storage.sync.get(fields);

  fields.forEach(field => {
    const input = document.getElementById(field);
    if (input && saved[field]) {
      input.value = saved[field];
    }
  });

  document.getElementById('extraInfoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {};
    fields.forEach(field => {
      const input = document.getElementById(field);
      if (input) data[field] = input.value;
    });

    await chrome.storage.sync.set(data);
    alert('Extra info saved successfully!');
  });
}

// === APPLICATIONS TAB ===
async function loadApplications() {
  const result = await chrome.storage.local.get(['applications']);
  allApplications = result.applications || [];

  displayApplications(allApplications);

  // Search functionality
  document.getElementById('searchBox').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allApplications.filter(app => 
      app.company.toLowerCase().includes(query) ||
      app.position.toLowerCase().includes(query)
    );
    displayApplications(filtered);
  });
}

function displayApplications(applications) {
  const tbody = document.getElementById('applicationsBody');

  if (applications.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: #999;">
          No applications found
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = applications.map(app => `
    <tr>
      <td><strong>${escapeHtml(app.company)}</strong></td>
      <td>${escapeHtml(app.position)}</td>
      <td>${formatDate(app.dateAdded)}</td>
      <td>
        <span class="match-score ${getMatchClass(app.matchScore)}">
          ${app.matchScore}%
        </span>
      </td>
      <td>
        <span class="badge badge-${app.status}">
          ${formatStatus(app.status)}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary" onclick="editApplication('${app.id}')">Edit</button>
      </td>
    </tr>
  `).join('');
}

window.editApplication = function(id) {
  // Open tracker page to edit
  const trackerUrl = chrome.runtime.getURL('tracker.html');
  chrome.tabs.create({ url: trackerUrl });
};

// === ACHIEVEMENTS TAB ===
function updateAchievements() {
  const stats = getStats();

  document.getElementById('totalApps').textContent = stats.totalApplications;
  document.getElementById('avgScore').textContent = stats.avgScore + '%';
  document.getElementById('thisWeek').textContent = stats.thisWeek;
  document.getElementById('streakCount').textContent = stats.streak + '🔥';

  const grid = document.getElementById('achievementGrid');
  grid.innerHTML = ACHIEVEMENTS.map(achievement => {
    const unlocked = achievement.condition(stats);
    return `
      <div class="achievement ${unlocked ? 'unlocked' : ''}" title="${achievement.description}">
        <div class="achievement-icon">${achievement.name.split(' ')[0]}</div>
        <div class="achievement-name">${achievement.name.substring(2)}</div>
      </div>
    `;
  }).join('');
}

function getStats() {
  const totalApps = allApplications.length;
  const avgScore = totalApps > 0 ? Math.round(allApplications.reduce((sum, a) => sum + a.matchScore, 0) / totalApps) : 0;
  const thisWeek = countThisWeek();
  const streak = calculateStreak();

  return {
    totalApplications: totalApps,
    avgScore: avgScore,
    thisWeek: thisWeek,
    streak: streak,
    maxMatchScore: totalApps > 0 ? Math.max(...allApplications.map(a => a.matchScore)) : 0,
    interviews: allApplications.filter(a => a.status === 'interview').length,
    offers: allApplications.filter(a => a.status === 'offer').length
  };
}

function countThisWeek() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return allApplications.filter(app => new Date(app.dateAdded) >= oneWeekAgo).length;
}

function calculateStreak() {
  if (allApplications.length === 0) return 0;
  
  const sorted = [...allApplications].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  let streak = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  
  for (const app of sorted) {
    const appDate = new Date(app.dateAdded);
    appDate.setHours(0, 0, 0, 0);
    const dayDiff = Math.floor((checkDate - appDate) / (1000 * 60 * 60 * 24));
    
    if (dayDiff === streak) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dayDiff > streak) {
      break;
    }
  }
  
  return streak;
}

// === UTILITY FUNCTIONS ===
function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatStatus(status) {
  const map = {
    'applied': 'Applied',
    'interview': 'Interview',
    'offer': 'Offer',
    'rejected': 'Rejected'
  };
  return map[status] || status;
}

function getMatchClass(score) {
  if (score >= 80) return 'match-high';
  if (score >= 60) return 'match-medium';
  return 'match-low';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
