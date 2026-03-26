import { formatTime } from '../common/utils.js';
import { SUBCATEGORIES, getSubcategoryName, hasMultipleSubcategories } from '../common/subcategories.js';
import { PRODUCTIVITY_GROUPS } from '../common/constants.js';

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
const limitTargetType = document.getElementById('limitTargetType');
const limitSubcategory = document.getElementById('limitSubcategory');
const limitDomain = document.getElementById('limitDomain');
const subcategoryTarget = document.getElementById('subcategoryTarget');
const domainTarget = document.getElementById('domainTarget');
const refinementGroup = document.getElementById('refinementGroup');
const targetTypeBtns = document.querySelectorAll('.target-type-btn');

let categoriesInfo = {};
let currentSettings = {};
let editingLimitId = null; // Track if we're editing an existing limit

// Initialize
loadSettings();
loadCategories();
loadLimits();
loadSyncStatus();
loadHistoryAnalysisStatus();

// Check for edit parameter in URL
const urlParams = new URLSearchParams(window.location.search);
const editParam = urlParams.get('edit');
if (editParam) {
  // Wait for limits to load, then open edit modal
  setTimeout(() => openEditModal(editParam), 500);
}

// Event listeners
backBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'dashboard/dashboard.html' });
  window.close();
});

addLimitBtn.addEventListener('click', () => {
  // Reset form for new limit
  editingLimitId = null;
  limitCategory.disabled = false;
  limitHours.value = 1;
  limitMinutes.value = 0;
  limitDomain.value = '';
  onCategoryChange();

  // Reset modal title
  const modalTitle = document.querySelector('#addLimitModal .modal-header h3');
  if (modalTitle) {
    modalTitle.textContent = 'Add New Limit';
  }

  addLimitModal.classList.add('active');
});

modalClose.addEventListener('click', () => {
  addLimitModal.classList.remove('active');
  editingLimitId = null;
  limitCategory.disabled = false;
});

cancelLimitBtn.addEventListener('click', () => {
  addLimitModal.classList.remove('active');
  editingLimitId = null;
  limitCategory.disabled = false;
});

// Target type selector
targetTypeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    setTargetType(btn.dataset.type);
  });
});

// Update refinement options when category changes
limitCategory.addEventListener('change', () => {
  onCategoryChange();
});

/**
 * Check if current selection is a productivity group
 */
function isGroupSelection() {
  return limitCategory.value.startsWith('group:');
}

/**
 * Handle category dropdown change
 */
function onCategoryChange() {
  if (isGroupSelection()) {
    // Group selected — no refinement needed
    refinementGroup.style.display = 'none';
    setTargetType('category');
  } else {
    // Individual category — show refinement options
    refinementGroup.style.display = '';
    setTargetType('category');
    updateSubcategoryOptions();
  }
}

function setTargetType(type) {
  limitTargetType.value = type;
  targetTypeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === type));
  subcategoryTarget.style.display = type === 'subcategory' ? 'block' : 'none';
  domainTarget.style.display = type === 'domain' ? 'block' : 'none';
}

function updateSubcategoryOptions() {
  const category = limitCategory.value;
  const subcats = SUBCATEGORIES[category] || {};
  const entries = Object.entries(subcats).filter(([key]) => key !== 'general');

  limitSubcategory.innerHTML = entries.length > 0
    ? entries.map(([key]) => `<option value="${key}">${getSubcategoryName(key)}</option>`).join('')
    : '<option value="" disabled>No subcategories available</option>';

  // Disable subcategory button if none available
  const subBtn = document.querySelector('.target-type-btn[data-type="subcategory"]');
  if (subBtn) {
    const hasSubcats = entries.length > 0;
    subBtn.disabled = !hasSubcats;
    subBtn.classList.toggle('disabled', !hasSubcats);
    // If subcategory was selected but no longer available, fall back
    if (!hasSubcats && limitTargetType.value === 'subcategory') {
      setTargetType('category');
    }
  }
}

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

// Debug log download
const downloadDebugBtn = document.getElementById('downloadDebugBtn');
downloadDebugBtn.addEventListener('click', downloadDebugLog);

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

    // Build dropdown: productivity groups + individual categories
    let html = '';

    // Productivity group options
    html += '<optgroup label="Productivity Groups">';
    for (const [groupKey, group] of Object.entries(PRODUCTIVITY_GROUPS)) {
      html += `<option value="group:${groupKey}">${group.icon} All ${group.name}</option>`;
    }
    html += '</optgroup>';

    // Individual categories grouped by productivity
    for (const [groupKey, group] of Object.entries(PRODUCTIVITY_GROUPS)) {
      html += `<optgroup label="${group.name}">`;
      for (const cat of group.categories) {
        const info = categoriesInfo[cat];
        if (info && cat !== 'adult') {
          html += `<option value="${cat}">${info.icon} ${info.name}</option>`;
        }
      }
      html += '</optgroup>';
    }

    limitCategory.innerHTML = html;

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
      const hours = Math.floor(limit.dailyLimit / 3600000);
      const minutes = Math.floor((limit.dailyLimit % 3600000) / 60000);
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      const limitId = limit.id || `cat:${limit.category}`;
      const targetType = limit.targetType || 'category';

      // Build display name and icon
      let icon, name, targetLabel = '';

      const groupIcons = { productive: '🟢', unproductive: '🔴', neutral: '⚪' };
      if (targetType === 'group' && limit.targetValue) {
        const group = PRODUCTIVITY_GROUPS[limit.targetValue];
        icon = groupIcons[limit.targetValue] || '⏱️';
        name = `All ${group?.name || limit.targetValue}`;
      } else {
        const info = categoriesInfo[limit.category];
        icon = info?.icon || '⏱️';
        name = info?.name || limit.category;

        if (targetType === 'subcategory' && limit.targetValue) {
          targetLabel = `<span class="limit-target limit-target-sub">${getSubcategoryName(limit.targetValue)}</span>`;
        } else if (targetType === 'domain' && limit.targetValue) {
          targetLabel = `<span class="limit-target limit-target-dom">${limit.targetValue}</span>`;
        }
      }

      return `
        <div class="limit-item" data-id="${limitId}">
          <div class="limit-info">
            <div class="limit-icon">${icon}</div>
            <div class="limit-details">
              <div class="limit-category">${name} ${targetLabel}</div>
              <div class="limit-time">Limit: ${timeStr} per day</div>
            </div>
          </div>
          <div class="limit-actions">
            <label class="toggle limit-toggle">
              <input type="checkbox" class="limit-toggle-checkbox" data-id="${limitId}" ${limit.enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-icon delete limit-delete-btn" data-id="${limitId}">🗑️</button>
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
async function openEditModal(limitId) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
    const limits = response.data || [];
    // Support both old category-based lookup and new id-based
    const limit = limits.find(l => l.id === limitId || l.category === limitId);

    if (!limit) {
      console.error('Limit not found:', limitId);
      return;
    }

    // Set editing mode
    editingLimitId = limit.id || `cat:${limit.category}`;

    // Populate form with existing values
    const targetType = limit.targetType || 'category';

    if (targetType === 'group') {
      limitCategory.value = `group:${limit.targetValue}`;
    } else {
      limitCategory.value = limit.category;
    }
    limitCategory.disabled = true;
    onCategoryChange();

    const hours = Math.floor(limit.dailyLimit / 3600000);
    const minutes = Math.floor((limit.dailyLimit % 3600000) / 60000);
    limitHours.value = hours;
    limitMinutes.value = minutes;

    // Set refinement target
    if (targetType === 'subcategory' && limit.targetValue) {
      setTargetType('subcategory');
      limitSubcategory.value = limit.targetValue;
    } else if (targetType === 'domain' && limit.targetValue) {
      setTargetType('domain');
      limitDomain.value = limit.targetValue;
    }

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
    const selection = limitCategory.value;
    const hours = parseInt(limitHours.value) || 0;
    const minutes = parseInt(limitMinutes.value) || 0;

    const dailyLimit = (hours * 3600000) + (minutes * 60000);

    if (dailyLimit === 0) {
      alert('Please set a valid time limit');
      return;
    }

    let id, category, targetType, targetValue;

    if (selection.startsWith('group:')) {
      // Productivity group limit
      const groupKey = selection.replace('group:', '');
      id = `grp:${groupKey}`;
      category = groupKey; // store group key as category
      targetType = 'group';
      targetValue = groupKey;
    } else {
      // Individual category — check refinement
      category = selection;
      targetType = limitTargetType.value;
      targetValue = null;

      if (targetType === 'subcategory') {
        targetValue = limitSubcategory.value;
        if (!targetValue) {
          alert('Please select a subcategory');
          return;
        }
        id = `sub:${category}:${targetValue}`;
      } else if (targetType === 'domain') {
        targetValue = limitDomain.value.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
        if (!targetValue) {
          alert('Please enter a domain');
          return;
        }
        id = `dom:${category}:${targetValue}`;
      } else {
        id = `cat:${category}`;
      }
    }

    // If editing, get current enabled state; otherwise default to true
    let enabled = true;
    if (editingLimitId) {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
      const limits = response.data || [];
      const existingLimit = limits.find(l => l.id === editingLimitId);
      if (existingLimit) {
        enabled = existingLimit.enabled;
      }
      if (editingLimitId !== id) {
        await chrome.runtime.sendMessage({ type: 'DELETE_LIMIT', id: editingLimitId });
      }
    }

    const limit = {
      id,
      dailyLimit,
      enabled,
      targetType,
      targetValue,
      alertMinutesBefore: 5,
      blockMethod: 'soft',
      blockWhenLimitReached: true
    };

    await chrome.runtime.sendMessage({
      type: 'SET_LIMIT',
      category,
      limit
    });

    addLimitModal.classList.remove('active');
    editingLimitId = null;
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
    const id = e.target.dataset.id;
    if (!confirm('Are you sure you want to delete this limit?')) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_LIMIT',
        id
      });
      loadLimits();
    } catch (error) {
      console.error('Error deleting limit:', error);
      alert('Failed to delete limit');
    }
  }

  // Handle clicking a limit item to edit
  const limitItem = e.target.closest('.limit-item');
  if (limitItem && !e.target.closest('.limit-actions')) {
    const id = limitItem.dataset.id;
    if (id) openEditModal(id);
  }
});

limitsList.addEventListener('change', async (e) => {
  // Handle toggle checkbox change
  if (e.target.classList.contains('limit-toggle-checkbox')) {
    const id = e.target.dataset.id;
    const enabled = e.target.checked;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
      const limits = response.data || [];
      const limit = limits.find(l => l.id === id);

      if (limit) {
        await chrome.runtime.sendMessage({
          type: 'SET_LIMIT',
          category: limit.category,
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

/**
 * Download debug log as .txt
 */
async function downloadDebugLog() {
  downloadDebugBtn.textContent = '⏳ Collecting...';
  downloadDebugBtn.disabled = true;

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_DEBUG_DATA' });
    if (!resp.success) {
      alert('Error: ' + resp.error);
      return;
    }

    const d = resp.data;
    const lines = [];

    lines.push('========================================');
    lines.push('  deTime Session Debug Report');
    lines.push('  Generated: ' + new Date().toISOString());
    lines.push('========================================');
    lines.push('');

    // Service Worker
    const sw = d.serviceWorker || {};
    lines.push('[Service Worker]');
    lines.push('  Started at:  ' + (sw.startTime || '?'));
    lines.push('  Uptime:      ' + (sw.uptimeMin || 0) + ' min');
    lines.push('');

    // Current state
    const cs = d.currentState;
    lines.push('[Current State]');
    lines.push('  Session active:  ' + cs.hasCurrentSession);
    lines.push('  Session state:   ' + cs.sessionState);
    lines.push('  Is user idle:    ' + cs.isUserIdle);
    lines.push('  Last activity:   ' + (cs.lastActivityTime || 'never'));
    if (cs.hasCurrentSession) {
      lines.push('  Session ID:      ' + cs.currentSessionId);
      lines.push('  Category:        ' + cs.currentSessionCategory);
      lines.push('  Started at:      ' + cs.currentSessionStartTime);
      lines.push('  Duration so far: ' + fmtMs(cs.currentSessionDuration));
      lines.push('  Visit count:     ' + cs.currentSessionVisitCount);
    }
    lines.push('');

    // DB summary
    const db = d.db;
    lines.push('[DB Summary - Today]');
    lines.push('  Session count:         ' + db.todaySessionCount);
    lines.push('  Total (from sessions): ' + fmtMs(db.todayTotalTimeFromSessions) + ' (' + (db.todayTotalTimeFromSessions / 60000).toFixed(1) + ' min)');
    lines.push('  Total (dailyStats):    ' + fmtMs(db.todayStatsTotal) + ' (' + (db.todayStatsTotal / 60000).toFixed(1) + ' min)');
    lines.push('');

    // Debug stats
    const st = d.stats;
    lines.push('[Debug Stats]');
    lines.push('  Total events logged: ' + st.totalEvents);
    lines.push('  Sessions started:    ' + st.sessionStarts);
    lines.push('  Sessions ended:      ' + st.sessionEnds);
    lines.push('  Focus lost events:   ' + st.focusLost);
    lines.push('  Idle API events:     ' + st.idleEvents);
    lines.push('');

    // End reason breakdown
    lines.push('[End Reason Breakdown]');
    const reasons = Object.entries(st.endReasons || {}).sort((a, b) => b[1] - a[1]);
    if (reasons.length === 0) {
      lines.push('  (none)');
    } else {
      for (const [reason, count] of reasons) {
        lines.push('  ' + reason.padEnd(35) + ' x' + count);
      }
    }
    lines.push('');

    // All sessions detail
    lines.push('========================================');
    lines.push('[Today\'s Sessions - Detail]');
    lines.push('========================================');
    const sessions = [...db.sessions].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    for (const s of sessions) {
      lines.push('');
      lines.push('--- Session ' + s.id + ' ---');
      lines.push('  Category:    ' + s.category + ' (confidence: ' + (s.confidence || '?') + ', method: ' + (s.method || '?') + ')');
      lines.push('  Start:       ' + s.startTime);
      lines.push('  End:         ' + (s.endTime || '(active)'));
      lines.push('  Duration:    ' + fmtMs(s.duration || 0) + ' (' + (s.durationMin || 0) + ' min)');
      lines.push('  Visits:      ' + s.visitCount);
      lines.push('  Active:      ' + (s.isActive ? 'YES' : 'no'));
      lines.push('  End reason:  ' + (s.endReason || '-'));
      lines.push('  Source:      ' + (s.source || 'tracked'));
      lines.push('  Device:      ' + (s.deviceSource || 'local'));
      if (s.visits && s.visits.length > 0) {
        lines.push('  Visit list:');
        for (const v of s.visits) {
          lines.push('    [' + v.time + '] ' + (v.category || '') + ' | ' + v.url);
          if (v.title) lines.push('      title: ' + v.title);
        }
      }
    }
    lines.push('');

    // Full event log
    lines.push('========================================');
    lines.push('[Full Event Log (' + d.debugLog.length + ' entries)]');
    lines.push('========================================');
    for (const e of d.debugLog) {
      const data = Object.entries(e)
        .filter(([k]) => !['t', 'ts', 'event'].includes(k))
        .map(([k, v]) => k + '=' + (typeof v === 'object' ? JSON.stringify(v) : v))
        .join('  ');
      lines.push(e.t + '  ' + e.event.padEnd(28) + '  ' + data);
    }

    // Download
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'detime-debug-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
    a.click();
    URL.revokeObjectURL(url);

    downloadDebugBtn.textContent = '✓ Downloaded!';
    setTimeout(() => {
      downloadDebugBtn.textContent = '🐛 Download Debug Log';
      downloadDebugBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Error downloading debug log:', error);
    alert('Failed to download debug log');
    downloadDebugBtn.textContent = '🐛 Download Debug Log';
    downloadDebugBtn.disabled = false;
  }
}

function fmtMs(ms) {
  if (!ms || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return hr + 'h ' + (min % 60) + 'm ' + (sec % 60) + 's';
  if (min > 0) return min + 'm ' + (sec % 60) + 's';
  return sec + 's';
}
