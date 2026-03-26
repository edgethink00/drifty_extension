import { formatTime } from '../common/utils.js';

// DOM elements
const backBtn = document.getElementById('backBtn');
const addLimitBtn = document.getElementById('addLimitBtn');
const addLimitModal = document.getElementById('addLimitModal');
const modalClose = document.querySelector('.modal-close');
const cancelLimitBtn = document.getElementById('cancelLimitBtn');
const saveLimitBtn = document.getElementById('saveLimitBtn');
const limitsList = document.getElementById('limitsList');

// Data Collection
const collectFullData = document.getElementById('collectFullData');
const excludedDomainsTextarea = document.getElementById('excludedDomains');
const savePrivacyBtn = document.getElementById('savePrivacyBtn');

// Privacy mode
const privacyModeEnabled = document.getElementById('privacyModeEnabled');
const privacyAutoDelete = document.getElementById('privacyAutoDelete');
const privacyExcludeStats = document.getElementById('privacyExcludeStats');
const privacyHideTimeline = document.getElementById('privacyHideTimeline');
const privacyOptions = document.getElementById('privacyOptions');

// Notifications
const notificationsEnabled = document.getElementById('notificationsEnabled');

// Server Sync
const serverSyncEnabled = document.getElementById('serverSyncEnabled');
const shareUsageData = document.getElementById('shareUsageData');
const forceSyncBtn = document.getElementById('forceSyncBtn');
const serverSyncOptions = document.getElementById('serverSyncOptions');
const lastSyncTime = document.getElementById('lastSyncTime');
const categoryVersion = document.getElementById('categoryVersion');
const syncStatus = document.getElementById('syncStatus');

// History Analysis
const showApproximatedData = document.getElementById('showApproximatedData');
const lastAnalysisDate = document.getElementById('lastAnalysisDate');

// General Settings
const weekStartDaySelect = document.getElementById('weekStartDay');

// About
const exportDataBtn = document.getElementById('exportDataBtn');
const clearDataBtn = document.getElementById('clearDataBtn');

// Limit form
const limitCategory = document.getElementById('limitCategory');
const limitHours = document.getElementById('limitHours');
const limitMinutes = document.getElementById('limitMinutes');
const excludeSites = document.getElementById('excludeSites');
const includeSites = document.getElementById('includeSites');

let categoriesInfo = {};
let currentSettings = {};
let editingCategory = null; // Track if we're editing an existing limit

// Initialize
loadSettings();
loadCategories();
loadLimits();
loadSyncStatus();
loadHistoryAnalysisStatus();

// Check for edit parameter in URL
const urlParams = new URLSearchParams(window.location.search);
const editCategory = urlParams.get('edit');
if (editCategory) {
  // Wait for limits to load, then open edit modal
  setTimeout(() => openEditModal(editCategory), 500);
}

// Event listeners
backBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'dashboard/dashboard.html' });
  window.close();
});

addLimitBtn.addEventListener('click', () => {
  // Reset form for new limit
  editingCategory = null;
  limitCategory.disabled = false;
  limitHours.value = 1;
  limitMinutes.value = 0;
  excludeSites.value = '';
  includeSites.value = '';

  // Reset modal title
  const modalTitle = document.querySelector('#addLimitModal .modal-header h3');
  if (modalTitle) {
    modalTitle.textContent = 'Add New Limit';
  }

  addLimitModal.classList.add('active');
});

modalClose.addEventListener('click', () => {
  addLimitModal.classList.remove('active');
  editingCategory = null;
  limitCategory.disabled = false;
});

cancelLimitBtn.addEventListener('click', () => {
  addLimitModal.classList.remove('active');
  editingCategory = null;
  limitCategory.disabled = false;
});

saveLimitBtn.addEventListener('click', saveLimit);

// Data Collection - Save Privacy Settings
savePrivacyBtn.addEventListener('click', async () => {
  const domainsText = excludedDomainsTextarea.value.trim();
  const excludedDomains = domainsText
    .split('\n')
    .map(d => d.trim())
    .filter(d => d.length > 0);

  if (!currentSettings.privacy) {
    currentSettings.privacy = {};
  }
  currentSettings.privacy.excludedDomains = excludedDomains;

  await saveSettings();

  // Show success message
  savePrivacyBtn.textContent = '✓ Saved!';
  savePrivacyBtn.style.background = '#34C759';
  setTimeout(() => {
    savePrivacyBtn.textContent = 'Save Privacy Settings';
    savePrivacyBtn.style.background = '';
  }, 2000);
});

// Privacy mode toggle
privacyModeEnabled.addEventListener('change', async (e) => {
  currentSettings.privacyMode.enabled = e.target.checked;
  privacyOptions.style.display = e.target.checked ? 'block' : 'none';
  await saveSettings();
});

privacyAutoDelete.addEventListener('change', async (e) => {
  currentSettings.privacyMode.autoDelete = e.target.checked;
  await saveSettings();
});

privacyExcludeStats.addEventListener('change', async (e) => {
  currentSettings.privacyMode.excludeFromStats = e.target.checked;
  await saveSettings();
});

privacyHideTimeline.addEventListener('change', async (e) => {
  currentSettings.privacyMode.hideFromTimeline = e.target.checked;
  await saveSettings();
});

// Notifications
notificationsEnabled.addEventListener('change', async (e) => {
  currentSettings.notifications.enabled = e.target.checked;
  await saveSettings();
});

// Server Sync
serverSyncEnabled.addEventListener('change', async (e) => {
  currentSettings.serverSync.enabled = e.target.checked;
  serverSyncOptions.style.display = e.target.checked ? 'block' : 'none';
  await saveSettings();

  if (e.target.checked) {
    await forceSyncNow();
  }
});

shareUsageData.addEventListener('change', async (e) => {
  currentSettings.serverSync.shareUsageData = e.target.checked;
  await saveSettings();
});

forceSyncBtn.addEventListener('click', async () => {
  await forceSyncNow();
});

// History Analysis
showApproximatedData.addEventListener('change', async (e) => {
  if (!currentSettings.historyAnalysis) {
    currentSettings.historyAnalysis = {};
  }
  currentSettings.historyAnalysis.showApproximatedData = e.target.checked;
  await saveSettings();
});

// Week Start Day
weekStartDaySelect.addEventListener('change', async (e) => {
  currentSettings.weekStartDay = parseInt(e.target.value);
  await saveSettings();
});

// Export data
exportDataBtn.addEventListener('click', exportData);

// Clear data
clearDataBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
    alert('Clear data functionality not yet implemented');
  }
});

/**
 * Load settings
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    currentSettings = response.data;

    // Apply settings to UI
    // Data Collection
    collectFullData.checked = currentSettings.privacy?.collectFullData !== false;
    if (currentSettings.privacy?.excludedDomains) {
      excludedDomainsTextarea.value = currentSettings.privacy.excludedDomains.join('\n');
    }

    // Privacy mode
    privacyModeEnabled.checked = currentSettings.privacyMode?.enabled || false;
    privacyAutoDelete.checked = currentSettings.privacyMode?.autoDelete || false;
    privacyExcludeStats.checked = currentSettings.privacyMode?.excludeFromStats || false;
    privacyHideTimeline.checked = currentSettings.privacyMode?.hideFromTimeline || false;
    privacyOptions.style.display = currentSettings.privacyMode?.enabled ? 'block' : 'none';

    notificationsEnabled.checked = currentSettings.notifications?.enabled || false;

    serverSyncEnabled.checked = currentSettings.serverSync?.enabled || false;
    shareUsageData.checked = currentSettings.serverSync?.shareUsageData || false;
    serverSyncOptions.style.display = currentSettings.serverSync?.enabled ? 'block' : 'none';

    showApproximatedData.checked = currentSettings.historyAnalysis?.showApproximatedData !== false;

    // Week start day (default to 1 = Monday)
    weekStartDaySelect.value = currentSettings.weekStartDay !== undefined ? currentSettings.weekStartDay : 1;

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: currentSettings
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Failed to save settings');
  }
}

/**
 * Load categories for limit selection
 */
async function loadCategories() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    categoriesInfo = response.data;

    // Populate category dropdown (exclude 'other' and 'adult')
    limitCategory.innerHTML = Object.entries(categoriesInfo)
      .filter(([key]) => key !== 'other' && key !== 'adult')
      .map(([key, info]) => `
        <option value="${key}">${info.icon} ${info.name}</option>
      `)
      .join('');

  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

/**
 * Load existing limits
 */
async function loadLimits() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
    const limits = response.data || [];

    if (limits.length === 0) {
      limitsList.innerHTML = '<div class="empty-state"><div class="empty-state-text">No limits set yet</div></div>';
      return;
    }

    limitsList.innerHTML = limits.map(limit => {
      const info = categoriesInfo[limit.category];
      const hours = Math.floor(limit.dailyLimit / 3600000);
      const minutes = Math.floor((limit.dailyLimit % 3600000) / 60000);
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      // Build filter info
      let filterHtml = '';
      if (limit.excludeSites && limit.excludeSites.length > 0) {
        filterHtml += `<div class="limit-filters">Exclude: ${limit.excludeSites.map(s => `<span>${s}</span>`).join('')}</div>`;
      }
      if (limit.includeSites && limit.includeSites.length > 0) {
        filterHtml += `<div class="limit-filters">Only: ${limit.includeSites.map(s => `<span>${s}</span>`).join('')}</div>`;
      }

      return `
        <div class="limit-item" data-category="${limit.category}">
          <div class="limit-info">
            <div class="limit-icon">${info?.icon || '⏱️'}</div>
            <div class="limit-details">
              <div class="limit-category">${info?.name || limit.category}</div>
              <div class="limit-time">Limit: ${timeStr} per day</div>
              ${filterHtml}
            </div>
          </div>
          <div class="limit-actions">
            <label class="toggle limit-toggle">
              <input type="checkbox" class="limit-toggle-checkbox" data-category="${limit.category}" ${limit.enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-icon delete limit-delete-btn" data-category="${limit.category}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading limits:', error);
  }
}

/**
 * Open modal to edit existing limit
 */
async function openEditModal(category) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
    const limits = response.data || [];
    const limit = limits.find(l => l.category === category);

    if (!limit) {
      console.error('Limit not found for category:', category);
      return;
    }

    // Set editing mode
    editingCategory = category;

    // Populate form with existing values
    limitCategory.value = category;
    limitCategory.disabled = true; // Don't allow changing category when editing

    const hours = Math.floor(limit.dailyLimit / 3600000);
    const minutes = Math.floor((limit.dailyLimit % 3600000) / 60000);
    limitHours.value = hours;
    limitMinutes.value = minutes;

    excludeSites.value = (limit.excludeSites || []).join(', ');
    includeSites.value = (limit.includeSites || []).join(', ');

    // Update modal title
    const modalTitle = document.querySelector('#addLimitModal .modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = 'Edit Limit';
    }

    // Show modal
    addLimitModal.classList.add('active');

  } catch (error) {
    console.error('Error opening edit modal:', error);
  }
}

/**
 * Save new or edited limit
 */
async function saveLimit() {
  try {
    const category = editingCategory || limitCategory.value;
    const hours = parseInt(limitHours.value) || 0;
    const minutes = parseInt(limitMinutes.value) || 0;

    const dailyLimit = (hours * 3600000) + (minutes * 60000);

    if (dailyLimit === 0) {
      alert('Please set a valid time limit');
      return;
    }

    // Parse site filters
    const excludeList = excludeSites.value
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);

    const includeList = includeSites.value
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);

    // If editing, get current enabled state; otherwise default to true
    let enabled = true;
    if (editingCategory) {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
      const limits = response.data || [];
      const existingLimit = limits.find(l => l.category === category);
      if (existingLimit) {
        enabled = existingLimit.enabled;
      }
    }

    const limit = {
      dailyLimit,
      enabled,
      alertAt: 0.917, // Alert 5 minutes before (approximately)
      alertMinutesBefore: 5,
      blockMethod: 'soft',
      excludeSites: excludeList,
      includeSites: includeList
    };

    await chrome.runtime.sendMessage({
      type: 'SET_LIMIT',
      category,
      limit
    });

    // Close modal and reload limits
    addLimitModal.classList.remove('active');
    editingCategory = null;
    limitCategory.disabled = false;
    loadLimits();

  } catch (error) {
    console.error('Error saving limit:', error);
    alert('Failed to save limit');
  }
}

// Event delegation for limits list
limitsList.addEventListener('click', async (e) => {
  // Handle delete button click
  if (e.target.classList.contains('limit-delete-btn')) {
    const category = e.target.dataset.category;
    if (!confirm('Are you sure you want to delete this limit?')) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_LIMIT',
        category
      });
      loadLimits();
    } catch (error) {
      console.error('Error deleting limit:', error);
      alert('Failed to delete limit');
    }
  }
});

limitsList.addEventListener('change', async (e) => {
  // Handle toggle checkbox change
  if (e.target.classList.contains('limit-toggle-checkbox')) {
    const category = e.target.dataset.category;
    const enabled = e.target.checked;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
      const limits = response.data || [];
      const limit = limits.find(l => l.category === category);

      if (limit) {
        await chrome.runtime.sendMessage({
          type: 'SET_LIMIT',
          category,
          limit: {
            ...limit,
            enabled: enabled
          }
        });
      }
    } catch (error) {
      console.error('Error toggling limit:', error);
    }
  }
});

/**
 * Export data to JSON
 */
async function exportData() {
  try {
    const weeklyResponse = await chrome.runtime.sendMessage({ type: 'GET_WEEKLY_STATS' });
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const limitsResponse = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });

    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      weeklyStats: weeklyResponse.data,
      settings: settingsResponse.data,
      limits: limitsResponse.data
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `detime-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error exporting data:', error);
    alert('Failed to export data');
  }
}

/**
 * Load sync status
 */
async function loadSyncStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' });
    const status = response.data;

    if (status.lastSyncTime) {
      const date = new Date(status.lastSyncTime);
      lastSyncTime.textContent = date.toLocaleString();
    } else {
      lastSyncTime.textContent = 'Never';
    }

    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    categoryVersion.textContent = settings.data.categoryVersion || '1.0.0';

    if (status.syncInProgress) {
      syncStatus.textContent = 'Syncing...';
      syncStatus.style.color = '#8BAF5B';
      forceSyncBtn.disabled = true;
    } else if (!status.isOnline) {
      syncStatus.textContent = 'Offline';
      syncStatus.style.color = '#FF3B30';
      forceSyncBtn.disabled = true;
    } else {
      syncStatus.textContent = `Ready (${status.pendingStatsCount} pending stats)`;
      syncStatus.style.color = '#34C759';
      forceSyncBtn.disabled = false;
    }

  } catch (error) {
    console.error('Error loading sync status:', error);
  }
}

/**
 * Force sync now
 */
async function forceSyncNow() {
  try {
    syncStatus.textContent = 'Syncing...';
    syncStatus.style.color = '#8BAF5B';
    forceSyncBtn.disabled = true;

    await chrome.runtime.sendMessage({ type: 'FORCE_SYNC_NOW' });

    setTimeout(async () => {
      await loadSyncStatus();
      alert('Category database updated successfully!');
    }, 2000);

  } catch (error) {
    console.error('Error forcing sync:', error);
    alert('Failed to sync. Please check your internet connection.');
    syncStatus.textContent = 'Error';
    syncStatus.style.color = '#FF3B30';
    forceSyncBtn.disabled = false;
  }
}

// Refresh sync status every 30 seconds
setInterval(loadSyncStatus, 30000);

/**
 * Load history analysis status
 */
async function loadHistoryAnalysisStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.data;

    if (settings.historyAnalysis?.lastAnalysisDate) {
      const date = new Date(settings.historyAnalysis.lastAnalysisDate);
      lastAnalysisDate.textContent = date.toLocaleString();
    } else {
      lastAnalysisDate.textContent = 'Never';
    }

  } catch (error) {
    console.error('Error loading history analysis status:', error);
  }
}
