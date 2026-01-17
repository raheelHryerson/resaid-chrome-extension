// Applications Tracker Page

document.addEventListener('DOMContentLoaded', async () => {
  const applicationsList = document.getElementById('applicationsList');
  const statusFilter = document.getElementById('statusFilter');
  const exportBtn = document.getElementById('exportBtn');
  
  let allApplications = [];
  
  // Load applications
  await loadApplications();
  
  // Filter applications
  statusFilter.addEventListener('change', filterApplications);
  
  // Export applications
  exportBtn.addEventListener('click', exportApplications);
  
  async function loadApplications() {
    try {
      const result = await chrome.storage.local.get(['applications']);
      allApplications = result.applications || [];
      
      displayApplications(allApplications);
    } catch (error) {
      console.error('Error loading applications:', error);
      applicationsList.innerHTML = `
        <div class="empty-state">
          <h3>Error loading applications</h3>
          <p>Please try refreshing the page.</p>
        </div>
      `;
    }
  }
  
  function displayApplications(applications) {
    if (applications.length === 0) {
      applicationsList.innerHTML = `
        <div class="empty-state">
          <h3>No applications tracked yet</h3>
          <p>Applications will be tracked automatically when you submit job applications on supported sites.</p>
          <br>
          <small><strong>Supported platforms:</strong> LinkedIn, Indeed, Greenhouse, Workday, Lever, and more</small>
        </div>
      `;
      return;
    }
    
    applicationsList.innerHTML = applications.map(app => `
      <div class="application-card">
        <div class="application-title">${app.position || 'Unknown Position'}</div>
        <div class="application-company">${app.company || 'Unknown Company'}</div>
        <div class="application-meta">
          <span>${app.location || 'Unknown Location'}</span>
          <span class="status-badge status-${(app.status || 'applied').toLowerCase()}">${app.status || 'Applied'}</span>
        </div>
        <div style="font-size: 12px; color: #888; margin-top: 8px;">
          Applied: ${new Date(app.dateAdded || app.appliedDate).toLocaleDateString()}
          ${app.url ? `• <a href="${app.url}" target="_blank" style="color: #667eea;">View Job</a>` : ''}
        </div>
        ${app.notes ? `<div style="font-size: 13px; color: #666; margin-top: 8px; font-style: italic;">${app.notes}</div>` : ''}
        <div class="actions">
          <button class="btn btn-secondary" onclick="updateStatus('${app.id}', 'Interview')">Interview</button>
          <button class="btn btn-secondary" onclick="updateStatus('${app.id}', 'Offer')">Offer</button>
          <button class="btn btn-secondary" onclick="updateStatus('${app.id}', 'Rejected')">Rejected</button>
          <button class="btn btn-secondary" onclick="deleteApplication('${app.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }
  
  function filterApplications() {
    const filterValue = statusFilter.value;
    const filtered = filterValue === 'all' 
      ? allApplications 
      : allApplications.filter(app => app.status === filterValue);
    
    displayApplications(filtered);
  }
  
  function exportApplications() {
    const csvContent = [
      ['Company', 'Position', 'Location', 'Status', 'Applied Date', 'URL', 'Notes'],
      ...allApplications.map(app => [
        app.company || '',
        app.position || '',
        app.location || '',
        app.status || 'Applied',
        new Date(app.dateAdded || app.appliedDate).toLocaleDateString(),
        app.url || '',
        app.notes || ''
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-applications-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Global functions for buttons
  window.updateStatus = async function(appId, newStatus) {
    try {
      const result = await chrome.storage.local.get(['applications']);
      const applications = result.applications || [];
      
      const appIndex = applications.findIndex(app => app.id === appId);
      if (appIndex !== -1) {
        applications[appIndex].status = newStatus;
        applications[appIndex].dateModified = new Date().toISOString();
        
        await chrome.storage.local.set({ applications });
        allApplications = applications;
        filterApplications();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };
  
  window.deleteApplication = async function(appId) {
    if (!confirm('Are you sure you want to delete this application?')) return;
    
    try {
      const result = await chrome.storage.local.get(['applications']);
      const applications = result.applications || [];
      
      const filtered = applications.filter(app => app.id !== appId);
      await chrome.storage.local.set({ applications: filtered });
      
      allApplications = filtered;
      filterApplications();
    } catch (error) {
      console.error('Error deleting application:', error);
    }
  };
});