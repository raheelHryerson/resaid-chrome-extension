// Applications Tracker Page

document.addEventListener('DOMContentLoaded', async () => {
  const applicationsList = document.getElementById('applicationsList');
  const statusFilter = document.getElementById('statusFilter');
  const searchInput = document.getElementById('searchInput');
  const addApplicationBtn = document.getElementById('addApplicationBtn');
  const exportBtn = document.getElementById('exportBtn');
  
  // Modal elements
  const addApplicationModal = document.getElementById('addApplicationModal');
  const addApplicationForm = document.getElementById('addApplicationForm');
  const cancelBtn = document.getElementById('cancelAddBtn');
  const closeModalBtn = document.querySelector('.modal-close');
  
  let allApplications = [];
  
  // Load applications
  await loadApplications();
  
  // Set up event listeners
  statusFilter.addEventListener('change', filterApplications);
  searchInput.addEventListener('input', filterApplications);
  addApplicationBtn.addEventListener('click', openAddModal);
  exportBtn.addEventListener('click', exportApplications);
  
  // Modal event listeners
  cancelBtn.addEventListener('click', closeAddModal);
  closeModalBtn.addEventListener('click', closeAddModal);
  addApplicationForm.addEventListener('submit', saveNewApplication);
  
  // Close modal when clicking outside
  addApplicationModal.addEventListener('click', (e) => {
    if (e.target === addApplicationModal) {
      closeAddModal();
    }
  });
  
  async function loadApplications() {
    try {
      // Try to load from website API first if configured
      const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      let websiteApps = [];
      let localApps = [];

      if (settings.apiEndpoint && settings.apiKey) {
        try {
          const response = await fetch(`${settings.apiEndpoint}/api/applications`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${settings.apiKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.applications) {
              websiteApps = data.applications.map(app => ({
                id: app.id,
                company: app.companyName,
                position: app.jobTitle,
                location: 'N/A', // Website doesn't store location
                status: app.status,
                dateAdded: app.createdAt,
                url: app.jobUrl,
                notes: app.jobDescription ? `Job Description: ${app.jobDescription.substring(0, 100)}...` : '',
                source: 'website'
              }));
            }
          }
        } catch (apiError) {
          console.log('Failed to load applications from website:', apiError);
        }
      }

      // Also load from local storage
      const result = await chrome.storage.local.get(['applications']);
      localApps = (result.applications || []).map(app => ({
        ...app,
        source: 'local'
      }));

      // Combine and deduplicate applications (prefer website data for duplicates)
      const allApps = [...websiteApps, ...localApps];
      allApplications = allApps.filter((app, index, self) =>
        index === self.findIndex(a =>
          (a.url === app.url && a.url) ||
          (a.company === app.company && a.position === app.position && !a.url && !app.url)
        )
      );

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
        <div class="application-title">${app.position || app.jobTitle || 'Unknown Position'}</div>
        <div class="application-company">${app.company || app.companyName || 'Unknown Company'}</div>
        <div class="application-meta">
          <span>${app.location || 'Unknown Location'}</span>
          <span class="status-badge status-${(app.status || 'applied').toLowerCase()}">${app.status || 'Applied'}</span>
          ${app.source ? `<span class="source-badge">${app.source}</span>` : ''}
        </div>
        <div style="font-size: 12px; color: #888; margin-top: 8px;">
          Applied: ${new Date(app.dateAdded || app.createdAt || app.appliedDate).toLocaleDateString()}
          ${app.url || app.jobUrl ? `• <a href="${app.url || app.jobUrl}" target="_blank" style="color: #667eea;">View Job</a>` : ''}
        </div>
        ${app.notes ? `<div style="font-size: 13px; color: #666; margin-top: 8px; font-style: italic;">${app.notes}</div>` : ''}
        <div class="actions">
          ${app.source === 'website' ?
            `<button class="btn btn-secondary" onclick="updateWebsiteStatus('${app.id}', 'Interview')">Interview</button>
             <button class="btn btn-secondary" onclick="updateWebsiteStatus('${app.id}', 'Offer')">Offer</button>
             <button class="btn btn-secondary" onclick="updateWebsiteStatus('${app.id}', 'Rejected')">Rejected</button>` :
            `<button class="btn btn-secondary" onclick="updateStatus('${app.id}', 'Interview')">Interview</button>
             <button class="btn btn-secondary" onclick="updateStatus('${app.id}', 'Offer')">Offer</button>
             <button class="btn btn-secondary" onclick="updateStatus('${app.id}', 'Rejected')">Rejected</button>
             <button class="btn btn-secondary" onclick="deleteApplication('${app.id}')">Delete</button>`
          }
        </div>
      </div>
    `).join('');
  }
  
  function filterApplications() {
    const filterValue = statusFilter.value;
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    let filtered = allApplications;
    
    // Apply status filter
    if (filterValue !== 'all') {
      filtered = filtered.filter(app => app.status === filterValue);
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(app => 
        (app.company && app.company.toLowerCase().includes(searchTerm)) ||
        (app.position && app.position.toLowerCase().includes(searchTerm)) ||
        (app.location && app.location.toLowerCase().includes(searchTerm))
      );
    }
    
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

  window.updateWebsiteStatus = async function(appId, newStatus) {
    try {
      const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      if (!settings.apiEndpoint || !settings.apiKey) {
        alert('API settings not configured. Please configure your API endpoint and key in settings.');
        return;
      }

      // Note: The website API doesn't currently support updating application status
      // This would need to be added to the backend API
      alert('Status updates for website applications are not yet supported. This feature will be added soon.');

      // TODO: Implement when backend API supports status updates
      // const response = await fetch(`${settings.apiEndpoint}/api/applications/${appId}`, {
      //   method: 'PATCH',
      //   headers: {
      //     'Authorization': `Bearer ${settings.apiKey}`,
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify({ status: newStatus })
      // });

    } catch (error) {
      console.error('Error updating website application status:', error);
      alert('Error updating application status. Please try again.');
    }
  };

  // Modal functions
  function openAddModal() {
    addApplicationModal.style.display = 'flex';
    document.getElementById('companyInput').focus();
  }

  function closeAddModal() {
    addApplicationModal.style.display = 'none';
    addApplicationForm.reset();
  }

  async function saveNewApplication(e) {
    e.preventDefault();
    
    const company = document.getElementById('companyInput').value.trim();
    const position = document.getElementById('positionInput').value.trim();
    const location = document.getElementById('locationInput').value.trim();
    const url = document.getElementById('urlInput').value.trim();
    const status = document.getElementById('statusInput').value;
    const notes = document.getElementById('notesInput').value.trim();

    if (!company || !position) {
      alert('Company and Job Title are required.');
      return;
    }

    try {
      const newApplication = {
        id: Date.now().toString(),
        company: company,
        position: position,
        location: location || 'Unknown Location',
        status: status,
        dateAdded: new Date().toISOString(),
        url: url || '',
        notes: notes || 'Manually added application',
        source: 'local'
      };

      // Save to local storage
      const result = await chrome.storage.local.get(['applications']);
      const applications = result.applications || [];
      applications.unshift(newApplication);
      await chrome.storage.local.set({ applications });

      // Also sync to website if configured
      const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
      if (settings.apiEndpoint && settings.apiKey) {
        try {
          await fetch(`${settings.apiEndpoint}/api/applications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
              jobUrl: url,
              companyName: company,
              jobTitle: position,
              jobDescription: notes || '',
              status: status
            })
          });
        } catch (syncError) {
          console.log('Failed to sync to website:', syncError);
        }
      }

      // Update local data and UI
      allApplications = applications;
      filterApplications();
      closeAddModal();
      
      // Show success message
      alert('Application added successfully!');
      
    } catch (error) {
      console.error('Error saving application:', error);
      alert('Error saving application. Please try again.');
    }
  }

  // Event listeners for modal
  addApplicationBtn.addEventListener('click', openAddModal);
  closeModalBtn.addEventListener('click', closeAddModal);
  cancelBtn.addEventListener('click', closeAddModal);
  addApplicationForm.addEventListener('submit', saveNewApplication);

  // Close modal when clicking outside
  addApplicationModal.addEventListener('click', (e) => {
    if (e.target === addApplicationModal) {
      closeAddModal();
    }
  });
});