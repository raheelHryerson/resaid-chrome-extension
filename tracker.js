// Application Tracker JavaScript
const ACHIEVEMENTS = [
  {
    id: 'first_app',
    name: '🚀 First Step',
    description: 'Apply to your first job',
    icon: '🚀',
    condition: (stats) => stats.totalApplications >= 1
  },
  {
    id: 'five_apps',
    name: '📤 Five Apply',
    description: 'Apply to 5 jobs',
    icon: '📤',
    condition: (stats) => stats.totalApplications >= 5
  },
  {
    id: 'ten_apps',
    name: '💪 Persistent',
    description: 'Apply to 10 jobs',
    icon: '💪',
    condition: (stats) => stats.totalApplications >= 10
  },
  {
    id: 'twenty_apps',
    name: '🔥 On Fire',
    description: 'Apply to 20 jobs',
    icon: '🔥',
    condition: (stats) => stats.totalApplications >= 20
  },
  {
    id: 'high_match',
    name: '🎯 Perfect Match',
    description: 'Find a 90%+ match job',
    icon: '🎯',
    condition: (stats) => stats.maxMatchScore >= 90
  },
  {
    id: 'interview',
    name: '💼 Interview Ready',
    description: 'Land an interview',
    icon: '💼',
    condition: (stats) => stats.interviews >= 1
  },
  {
    id: 'offer',
    name: '🏆 Winner',
    description: 'Get a job offer',
    icon: '🏆',
    condition: (stats) => stats.offers >= 1
  },
  {
    id: 'week_streak',
    name: '📆 Weekly Warrior',
    description: 'Apply 7 days in a row',
    icon: '📆',
    condition: (stats) => stats.streak >= 7
  },
  {
    id: 'hundred_pct',
    name: '💯 Profile Complete',
    description: 'Add 20+ applications',
    icon: '💯',
    condition: (stats) => stats.totalApplications >= 20
  },
  {
    id: 'early_bird',
    name: '⏰ Early Bird',
    description: 'Apply to job within 24h of posting',
    icon: '⏰',
    condition: (stats) => stats.earlyBirdApps >= 1
  }
];

let allApplications = [];
let currentFilter = 'all';
let editingId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  loadApplications();
  setupEventListeners();
  updateStats();
  displayAchievements();
});

function setupEventListeners() {
  document.getElementById('addApplicationBtn').addEventListener('click', openAddModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('applicationForm').addEventListener('submit', saveApplication);
  
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.status;
      displayApplications();
    });
  });
}

async function loadApplications() {
  const result = await chrome.storage.local.get(['applications']);
  allApplications = result.applications || [];
}

async function saveApplications() {
  await chrome.storage.local.set({ applications: allApplications });
}

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Application';
  document.getElementById('applicationForm').reset();
  document.getElementById('applicationModal').classList.add('open');
}

function closeModal() {
  document.getElementById('applicationModal').classList.remove('open');
}

async function saveApplication(e) {
  e.preventDefault();
  
  const application = {
    id: editingId || Date.now().toString(),
    company: document.getElementById('companyName').value,
    position: document.getElementById('jobPosition').value,
    matchScore: parseInt(document.getElementById('matchScore').value) || 0,
    status: document.getElementById('applicationStatus').value,
    followUpDate: document.getElementById('followUpDate').value,
    notes: document.getElementById('applicationNotes').value,
    dateAdded: editingId ? findApp(editingId)?.dateAdded : new Date().toISOString(),
    dateModified: new Date().toISOString()
  };
  
  if (editingId) {
    const index = allApplications.findIndex(a => a.id === editingId);
    allApplications[index] = application;
  } else {
    allApplications.unshift(application);
  }
  
  await saveApplications();
  closeModal();
  displayApplications();
  updateStats();
  displayAchievements();
}

function findApp(id) {
  return allApplications.find(a => a.id === id);
}

function editApplication(id) {
  const app = findApp(id);
  if (!app) return;
  
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Application';
  document.getElementById('companyName').value = app.company;
  document.getElementById('jobPosition').value = app.position;
  document.getElementById('matchScore').value = app.matchScore;
  document.getElementById('applicationStatus').value = app.status;
  document.getElementById('followUpDate').value = app.followUpDate || '';
  document.getElementById('applicationNotes').value = app.notes || '';
  
  document.getElementById('applicationModal').classList.add('open');
}

async function deleteApplication(id) {
  if (confirm('Are you sure you want to delete this application?')) {
    allApplications = allApplications.filter(a => a.id !== id);
    await saveApplications();
    displayApplications();
    updateStats();
    displayAchievements();
  }
}

function displayApplications() {
  const tbody = document.getElementById('applicationsBody');
  
  let filtered = allApplications;
  if (currentFilter !== 'all') {
    filtered = allApplications.filter(a => a.status === currentFilter);
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No applications in this category yet.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = filtered.map(app => `
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
        <span class="status-badge status-${app.status}">
          ${formatStatus(app.status)}
        </span>
      </td>
      <td>
        <button class="action-btn" onclick="editApplication('${app.id}')">Edit</button> | 
        <button class="action-btn" onclick="deleteApplication('${app.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function updateStats() {
  const totalApps = allApplications.length;
  const avgScore = totalApps > 0 ? Math.round(allApplications.reduce((sum, a) => sum + a.matchScore, 0) / totalApps) : 0;
  const thisWeek = countThisWeek();
  const streak = calculateStreak();
  
  document.getElementById('totalApps').textContent = totalApps;
  document.getElementById('avgScore').textContent = avgScore + '%';
  document.getElementById('thisWeek').textContent = thisWeek;
  document.getElementById('streakCount').textContent = streak + '🔥';
}

function countThisWeek() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  return allApplications.filter(app => {
    const date = new Date(app.dateAdded);
    return date >= oneWeekAgo;
  }).length;
}

function calculateStreak() {
  if (allApplications.length === 0) return 0;
  
  // Sort by date descending
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

function getStats() {
  return {
    totalApplications: allApplications.length,
    maxMatchScore: allApplications.length > 0 ? Math.max(...allApplications.map(a => a.matchScore)) : 0,
    interviews: allApplications.filter(a => a.status === 'interview').length,
    offers: allApplications.filter(a => a.status === 'offer').length,
    streak: calculateStreak(),
    earlyBirdApps: allApplications.filter(a => {
      const date = new Date(a.dateAdded);
      const oneDay = 24 * 60 * 60 * 1000;
      return (new Date() - date) < oneDay;
    }).length
  };
}

function displayAchievements() {
  const stats = getStats();
  const grid = document.getElementById('achievementsGrid');
  
  grid.innerHTML = ACHIEVEMENTS.map(achievement => {
    const unlocked = achievement.condition(stats);
    return `
      <div class="achievement ${unlocked ? 'unlocked' : ''}" title="${achievement.description}">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-desc">${achievement.description}</div>
      </div>
    `;
  }).join('');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }
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
