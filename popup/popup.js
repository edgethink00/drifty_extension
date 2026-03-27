import { formatTime, calculatePercentage } from '../common/utils.js';
import { PRODUCTIVITY_GROUPS } from '../common/constants.js';

// ============================================
// DOM Elements - Main View
// ============================================
const totalTimeEl = document.getElementById('totalTime');
const todayDateEl = document.getElementById('todayDate');
const comparisonEl = document.getElementById('comparison');
const categoriesListEl = document.getElementById('categoriesList');
const mostUsedListEl = document.getElementById('mostUsedList');
const timeRingCanvas = document.getElementById('timeRingCanvas');

// Current Site Elements
const currentSiteCard = document.getElementById('currentSiteCard');
const currentSiteFavicon = document.getElementById('currentSiteFavicon');
const currentSiteDomain = document.getElementById('currentSiteDomain');
const currentSiteCategory = document.getElementById('currentSiteCategory');
const currentSiteTime = document.getElementById('currentSiteTime');
const currentSiteProgress = document.getElementById('currentSiteProgress');

// Navigation buttons
const dashboardBtn = document.getElementById('dashboardBtn');
const viewDetailsBtn = document.getElementById('viewDetailsBtn');
const limitsBtn = document.getElementById('limitsBtn');

// Views
const mainView = document.getElementById('mainView');
const limitsView = document.getElementById('limitsView');
const backToMainBtn = document.getElementById('backToMainBtn');

// Limits View Elements
const currentLimitsList = document.getElementById('currentLimitsList');
const limitsCountEl = document.getElementById('limitsCount');
const categorySelectionList = document.getElementById('categorySelectionList');
const timeInputSection = document.getElementById('timeInputSection');
const selectedTargetEl = document.getElementById('selectedTarget');
const limitHours = document.getElementById('limitHours');
const limitMinutes = document.getElementById('limitMinutes');
const addLimitBtn = document.getElementById('addLimitBtn');

// Day toggle buttons
const todayBtn = document.getElementById('todayBtn');
const yesterdayBtn = document.getElementById('yesterdayBtn');

// ============================================
// State
// ============================================
let categoriesInfo = {};
let todayStats = {};
let categoryDomainUsage = {};
let currentSelection = null;
let viewingDay = 'today'; // 'today' or 'yesterday'

// Current session real-time tracking
let currentSessionData = null;
let sessionTimerInterval = null;

// ============================================
// Initialize
// ============================================
initPopup();

async function initPopup() {
  // Load accent color first for immediate visual consistency
  loadAccentColor();
  
  // Set today's date
  const today = new Date();
  if (todayDateEl) {
    todayDateEl.textContent = today.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  // Load data
  await loadPopupData();

  // Setup event listeners
  setupEventListeners();

  // Start current session real-time timer
  startSessionTimer();
}

// ============================================
// Accent Color
// ============================================

/**
 * Load and apply saved accent color
 */
function loadAccentColor() {
  const savedColor = localStorage.getItem('accentColor') || '#8BAF5B';
  document.documentElement.style.setProperty('--primary', savedColor);
  
  // Calculate lighter variant for hover states
  const lightColor = adjustColorBrightness(savedColor, 40);
  document.documentElement.style.setProperty('--primary-light', `${savedColor}1A`); // 10% opacity
}

/**
 * Adjust color brightness
 */
function adjustColorBrightness(hex, percent) {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  
  r = Math.min(255, Math.max(0, r + (r * percent / 100)));
  g = Math.min(255, Math.max(0, g + (g * percent / 100)));
  b = Math.min(255, Math.max(0, b + (b * percent / 100)));
  
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Dashboard navigation
  dashboardBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard/dashboard.html' });
  });

  viewDetailsBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard/dashboard.html' });
  });

  // Limits view navigation
  limitsBtn?.addEventListener('click', showLimitsView);
  backToMainBtn?.addEventListener('click', showMainView);

  // Day toggle
  todayBtn?.addEventListener('click', () => switchDay('today'));
  yesterdayBtn?.addEventListener('click', () => switchDay('yesterday'));

  // Add limit button
  addLimitBtn?.addEventListener('click', saveNewLimit);
}

// ============================================
// View Navigation
// ============================================
function showMainView() {
  mainView?.classList.remove('hidden');
  limitsView?.classList.add('hidden');
}

function showLimitsView() {
  mainView?.classList.add('hidden');
  limitsView?.classList.remove('hidden');
  loadLimitsView();
}

// ============================================
// Day Toggle
// ============================================
async function switchDay(day) {
  viewingDay = day;

  // Update button states
  todayBtn?.classList.toggle('active', day === 'today');
  yesterdayBtn?.classList.toggle('active', day === 'yesterday');

  // Update date display
  const date = day === 'today' ? new Date() : new Date(Date.now() - 86400000);
  if (todayDateEl) {
    todayDateEl.textContent = date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  // Show/hide current site card (only for today)
  if (currentSiteCard) {
    currentSiteCard.classList.toggle('hidden', day !== 'today');
  }

  await loadPopupData(day);
}

// ============================================
// Load Data
// ============================================
async function loadPopupData(day = 'today') {
  try {
    // Show loading state
    categoriesListEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    // Get stats for the selected day
    let response;
    if (day === 'yesterday') {
      const yesterday = new Date(Date.now() - 86400000);
      const dateStr = yesterday.toISOString().split('T')[0];
      response = await chrome.runtime.sendMessage({ type: 'GET_DATE_STATS', date: dateStr });
    } else {
      response = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
    }
    if (!response.success) {
      throw new Error(response.error || 'Failed to load stats');
    }
    // GET_DATE_STATS returns { stats, sessions }, GET_TODAY_STATS returns stats directly
    todayStats = response.data.stats || response.data;

    // Get categories info
    const categoriesResponse = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    categoriesInfo = categoriesResponse.data;

    // Get weekly stats for comparison
    const weeklyResponse = await chrome.runtime.sendMessage({ type: 'GET_WEEKLY_STATS' });
    const weeklyStats = weeklyResponse.data;

    // Display data
    displayTotalTime(todayStats.totalTime || 0, weeklyStats.dailyAverage || 0);
    displayCategories(todayStats.categories || {}, categoriesInfo, todayStats.totalTime || 0);
    displayMostUsed(todayStats.categories || {}, categoriesInfo);
    drawTimeRing(todayStats.categories || {}, categoriesInfo);

    // Display current site info (only for today)
    if (day === 'today') {
      await displayCurrentSite(todayStats, categoriesInfo);
    }

  } catch (error) {
    console.error('Error loading popup data:', error);
    categoriesListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">Failed to load data</div>
      </div>
    `;
  }
}

// ============================================
// Display Total Time
// ============================================
function displayTotalTime(totalTime, weeklyAverage) {
  totalTimeEl.textContent = formatTime(totalTime);

  const iconEl = comparisonEl?.querySelector('.comparison-icon');
  const textEl = comparisonEl?.querySelector('.comparison-text');

  if (!iconEl || !textEl) return;

  if (weeklyAverage > 0) {
    const diff = totalTime - weeklyAverage;
    const percentage = calculatePercentage(Math.abs(diff), weeklyAverage);

    if (diff > 0) {
      iconEl.textContent = '↑';
      textEl.textContent = `${percentage}% more than average`;
    } else if (diff < 0) {
      iconEl.textContent = '↓';
      textEl.textContent = `${percentage}% less than average`;
    } else {
      iconEl.textContent = '→';
      textEl.textContent = 'Same as average';
    }
  } else {
    iconEl.textContent = '✨';
    textEl.textContent = 'Start of tracking';
  }
}

// ============================================
// Display Categories with Hierarchy
// ============================================
function displayCategories(categories, categoriesInfo, totalTime) {
  if (!categories || Object.keys(categories).length === 0 || totalTime === 0) {
    categoriesListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏱️</div>
        <div class="empty-text">No activity yet today</div>
      </div>
    `;
    return;
  }

  // Group categories by productivity type
  const groupedTime = {};
  Object.entries(PRODUCTIVITY_GROUPS).forEach(([groupKey, groupInfo]) => {
    groupedTime[groupKey] = {
      ...groupInfo,
      totalTime: 0,
      categories: []
    };
  });

  // Calculate time for each group
  Object.entries(categories).forEach(([category, data]) => {
    if (data.time <= 0) return;

    // Find which group this category belongs to
    for (const [groupKey, groupInfo] of Object.entries(PRODUCTIVITY_GROUPS)) {
      if (groupInfo.categories.includes(category)) {
        groupedTime[groupKey].totalTime += data.time;
        groupedTime[groupKey].categories.push({
          key: category,
          info: categoriesInfo[category],
          time: data.time
        });
        break;
      }
    }
  });

  // Sort groups by total time (descending)
  const sortedGroups = Object.entries(groupedTime)
    .filter(([_, data]) => data.totalTime > 0)
    .sort((a, b) => b[1].totalTime - a[1].totalTime);

  if (sortedGroups.length === 0) {
    categoriesListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏱️</div>
        <div class="empty-text">No activity yet today</div>
      </div>
    `;
    return;
  }

  categoriesListEl.innerHTML = sortedGroups.map(([groupKey, groupData]) => {
    const percentage = calculatePercentage(groupData.totalTime, totalTime);

    // Sort categories within the group
    const sortedCats = groupData.categories.sort((a, b) => b.time - a.time);

    return `
      <div class="category-group">
        <div class="category-group-header">
          <div class="category-group-info">
            <span class="category-group-icon" style="color: ${groupData.color}">${groupData.icon}</span>
            <span class="category-group-name">${groupData.name}</span>
          </div>
          <div class="category-group-time">${formatTime(groupData.totalTime)}</div>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width: ${percentage}%; background: ${groupData.color}"></div>
        </div>
        <div class="category-group-items">
          ${sortedCats.map(cat => {
            const catPercentage = calculatePercentage(cat.time, groupData.totalTime);
            const bgColor = hexToRgba(cat.info.color, 0.15);
            return `
              <div class="category-item">
                <div class="category-icon-wrapper" style="background: ${bgColor}">
                  ${cat.info.icon}
                </div>
                <div class="category-item-info">
                  <span class="category-item-name">${cat.info.name}</span>
                  <div class="category-item-bar-track">
                    <div class="category-item-bar-fill" style="width: ${catPercentage}%; background: ${cat.info.color}"></div>
                  </div>
                </div>
                <div class="category-item-time">${formatTime(cat.time)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// Display Most Used Sites
// ============================================
let allTopSites = [];
let showingAllSites = false;
const INITIAL_SITES_COUNT = 4;
const MAX_SITES_COUNT = 10;

function displayMostUsed(categories, categoriesInfo) {
  const sites = [];

  Object.entries(categories).forEach(([category, data]) => {
    if (data.topSites && data.topSites.length > 0) {
      data.topSites.forEach(site => {
        const siteName = typeof site === 'string' ? site : site.domain;
        const siteTime = typeof site === 'object' && site.time ? site.time : (data.time / data.topSites.length);
        sites.push({
          name: siteName,
          time: siteTime,
          category: category
        });
      });
    }
  });

  allTopSites = sites.sort((a, b) => b.time - a.time).slice(0, MAX_SITES_COUNT);
  showingAllSites = false;
  
  renderTopSites();
}

function renderTopSites() {
  const showMoreBtn = document.getElementById('showMoreSitesBtn');

  if (allTopSites.length === 0) {
    mostUsedListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-text">No sites tracked yet</div>
      </div>
    `;
    if (showMoreBtn) showMoreBtn.classList.add('hidden');
    return;
  }

  const sitesToShow = showingAllSites ? allTopSites : allTopSites.slice(0, INITIAL_SITES_COUNT);

  mostUsedListEl.innerHTML = sitesToShow.map((site) => {
    const catInfo = categoriesInfo[site.category] || { icon: '📱', name: 'Other', color: '#8E8E93' };
    return `
      <div class="site-row">
        <img class="site-favicon" src="https://www.google.com/s2/favicons?domain=${site.name}&sz=32" alt="">
        <div class="site-info">
          <div class="site-name">${site.name}</div>
          <div class="site-category-badge" style="color: ${catInfo.color}">
            <span class="site-category-icon">${catInfo.icon}</span>
            <span class="site-category-name">${catInfo.name}</span>
          </div>
        </div>
        <div class="site-time">${formatTime(site.time)}</div>
      </div>
    `;
  }).join('');

  // Show/hide the Show More button
  if (showMoreBtn) {
    if (allTopSites.length > INITIAL_SITES_COUNT) {
      showMoreBtn.classList.remove('hidden');
      showMoreBtn.textContent = showingAllSites ? 'Show Less' : `Show More (${allTopSites.length - INITIAL_SITES_COUNT})`;
    } else {
      showMoreBtn.classList.add('hidden');
    }
  }
}

// Show More button handler
document.getElementById('showMoreSitesBtn')?.addEventListener('click', () => {
  showingAllSites = !showingAllSites;
  renderTopSites();
});

// ============================================
// Draw Time Ring (Canvas)
// ============================================
function drawTimeRing(categories, categoriesInfo) {
  if (!timeRingCanvas) return;

  const ctx = timeRingCanvas.getContext('2d');
  const size = 100;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 40;
  const lineWidth = 9;

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // Get sorted categories with time
  const sortedCategories = Object.entries(categories)
    .filter(([_, data]) => data.time > 0)
    .sort((a, b) => b[1].time - a[1].time);

  const totalTime = sortedCategories.reduce((sum, [_, data]) => sum + data.time, 0);

  if (totalTime === 0) {
    // Draw empty ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    return;
  }

  // Draw category segments
  let startAngle = -Math.PI / 2; // Start from top

  sortedCategories.forEach(([category, data]) => {
    const info = categoriesInfo[category] || { color: '#8E8E93' };
    const percentage = data.time / totalTime;
    const endAngle = startAngle + (percentage * Math.PI * 2);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = info.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    startAngle = endAngle;
  });
}

// ============================================
// Display Current Site
// ============================================
async function displayCurrentSite(todayStats, categoriesInfo) {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      hideCurrentSiteCard();
      return;
    }

    // Parse URL to get domain
    let url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      hideCurrentSiteCard();
      return;
    }

    // Skip non-http(s) URLs
    if (!url.protocol.startsWith('http')) {
      hideCurrentSiteCard();
      return;
    }

    const domain = url.hostname.replace('www.', '');
    
    // Find this domain's usage in today's stats
    let siteTime = 0;
    let siteCategory = null;
    
    if (todayStats.domains && todayStats.domains[domain]) {
      siteTime = todayStats.domains[domain].time || 0;
      siteCategory = todayStats.domains[domain].category;
    }
    
    // Also check in categories' topSites
    if (siteTime === 0 && todayStats.categories) {
      Object.entries(todayStats.categories).forEach(([category, data]) => {
        if (data.topSites) {
          data.topSites.forEach(site => {
            const siteDomain = typeof site === 'string' ? site : site.domain;
            if (siteDomain === domain) {
              siteTime = typeof site === 'object' ? (site.time || 0) : 0;
              siteCategory = category;
            }
          });
        }
      });
    }

    // Show the card
    if (currentSiteCard) currentSiteCard.classList.remove('hidden');
    
    // Update favicon
    if (currentSiteFavicon) {
      currentSiteFavicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    }
    
    // Update domain name
    if (currentSiteDomain) {
      currentSiteDomain.textContent = domain;
    }
    
    // Update category badge
    if (currentSiteCategory && siteCategory) {
      const catInfo = categoriesInfo[siteCategory] || { icon: '📱', name: siteCategory, color: '#8E8E93' };
      currentSiteCategory.innerHTML = `<span style="color: ${catInfo.color}">${catInfo.icon}</span> ${catInfo.name}`;
    } else if (currentSiteCategory) {
      currentSiteCategory.textContent = '';
    }
    
    // Update time
    if (currentSiteTime) {
      currentSiteTime.textContent = formatTime(siteTime);
    }
    
    // Update progress bar (relative to total time)
    if (currentSiteProgress && todayStats.totalTime > 0) {
      const percentage = Math.min(100, (siteTime / todayStats.totalTime) * 100);
      currentSiteProgress.style.width = `${percentage}%`;
      
      // Color based on category
      if (siteCategory) {
        const catInfo = categoriesInfo[siteCategory];
        if (catInfo) {
          currentSiteProgress.style.background = catInfo.color;
        }
      }
    }

  } catch (error) {
    console.error('Error displaying current site:', error);
    hideCurrentSiteCard();
  }
}

function hideCurrentSiteCard() {
  if (currentSiteCard) currentSiteCard.classList.add('hidden');
}

// ============================================
// Limits View
// ============================================
async function loadLimitsView() {
  await loadCurrentLimits();
  await loadCategoryDomainUsage();
  loadCategorySelection();
  resetSelection();
}

async function loadCategoryDomainUsage() {
  try {
    const weeklyResponse = await chrome.runtime.sendMessage({ type: 'GET_WEEKLY_STATS' });
    const weeklyData = weeklyResponse.data;

    categoryDomainUsage = {};

    if (weeklyData?.dailyStats) {
      weeklyData.dailyStats.forEach(day => {
        if (day.domains) {
          Object.entries(day.domains).forEach(([domain, info]) => {
            const category = info.category || 'other';
            if (!categoryDomainUsage[category]) {
              categoryDomainUsage[category] = {};
            }
            if (!categoryDomainUsage[category][domain]) {
              categoryDomainUsage[category][domain] = 0;
            }
            categoryDomainUsage[category][domain] += info.time || 0;
          });
        }
      });
    }
  } catch (error) {
    console.error('Error loading domain usage:', error);
  }
}

async function loadCurrentLimits() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
    const limits = response.data || [];

    // Update count badge
    if (limitsCountEl) {
      limitsCountEl.textContent = limits.length;
    }

    if (limits.length === 0) {
      currentLimitsList.innerHTML = '<div class="limits-empty">No limits set yet</div>';
      return;
    }

    currentLimitsList.innerHTML = limits.map(limit => {
      const info = categoriesInfo[limit.category];
      const hours = Math.floor(limit.dailyLimit / 3600000);
      const minutes = Math.floor((limit.dailyLimit % 3600000) / 60000);
      // Format time: "1 hour" if minutes is 0, otherwise "1h 30m"
      let timeStr;
      if (minutes === 0) {
        timeStr = hours === 1 ? '1 hour' : `${hours} hours`;
      } else if (hours === 0) {
        timeStr = `${minutes}m`;
      } else {
        timeStr = `${hours}h ${minutes}m`;
      }

      // Check for domains and categories in the limit
      const hasDomains = limit.includeSites && limit.includeSites.length > 0;
      const hasCategories = limit.includeCategories && limit.includeCategories.length > 0;
      let displayName, categoryLabel;

      if (hasDomains || hasCategories) {
        const domainParts = [];
        const categorySet = new Set();

        // Add category names from includeCategories
        if (hasCategories) {
          limit.includeCategories.forEach(cat => {
            const catInfo = categoriesInfo[cat];
            if (catInfo) {
              categorySet.add(catInfo.name);
            }
          });
        }

        // Add domain names and collect their categories
        if (hasDomains) {
          limit.includeSites.forEach(domain => {
            domainParts.push(domain);
            // Try to find category from categoryDomainUsage
            Object.entries(categoryDomainUsage).forEach(([cat, domains]) => {
              if (domains[domain]) {
                const catInfo = categoriesInfo[cat];
                if (catInfo) categorySet.add(catInfo.name);
              }
            });
          });
        }

        // Format domain display: show first 2, then "+N more"
        if (domainParts.length === 1) {
          displayName = domainParts[0];
        } else if (domainParts.length === 2) {
          displayName = `${domainParts[0]}, ${domainParts[1]}`;
        } else if (domainParts.length > 2) {
          displayName = `${domainParts[0]}, ${domainParts[1]} <span class="limit-more">+${domainParts.length - 2}</span>`;
        } else if (hasCategories) {
          const catNames = Array.from(categorySet);
          if (catNames.length === 1) {
            displayName = catNames[0];
          } else if (catNames.length === 2) {
            displayName = `${catNames[0]}, ${catNames[1]}`;
          } else {
            displayName = `${catNames[0]}, ${catNames[1]} <span class="limit-more">+${catNames.length - 2}</span>`;
          }
        }

        // Format category label: max 2, then +n more
        const catNames = Array.from(categorySet);
        if (catNames.length === 0) {
          categoryLabel = '';
        } else if (catNames.length === 1) {
          categoryLabel = catNames[0];
        } else if (catNames.length === 2) {
          categoryLabel = `${catNames[0]}, ${catNames[1]}`;
        } else {
          categoryLabel = `${catNames[0]}, ${catNames[1]} <span class="limit-more">+${catNames.length - 2}</span>`;
        }
      } else {
        displayName = info?.name || limit.category;
        categoryLabel = '';
      }

      return `
        <div class="limit-item" data-id="${limit.id || `cat:${limit.category}`}">
          <div class="limit-info">
            <div class="limit-name">${displayName}</div>
            ${categoryLabel ? `<div class="limit-category">${categoryLabel}</div>` : ''}
          </div>
          <div class="limit-time">${timeStr}</div>
          <button class="limit-delete" data-id="${limit.id || `cat:${limit.category}`}">🗑️</button>
        </div>
      `;
    }).join('');

    // Add delete event listeners
    currentLimitsList.querySelectorAll('.limit-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm('Delete this limit?')) {
          await chrome.runtime.sendMessage({ type: 'DELETE_LIMIT', id });
          loadCurrentLimits();
        }
      });
    });

  } catch (error) {
    console.error('Error loading limits:', error);
    currentLimitsList.innerHTML = '<div class="limits-empty">Failed to load limits</div>';
  }
}

function loadCategorySelection() {
  const categories = Object.entries(categoriesInfo)
    .filter(([key]) => key !== 'other' && key !== 'adult');

  categorySelectionList.innerHTML = categories.map(([key, info]) => {
    const domainUsage = categoryDomainUsage[key] || {};
    const sortedDomains = Object.entries(domainUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, time]) => ({ domain, time }));
    const hasDomains = sortedDomains.length > 0;

    return `
      <div class="category-select-item" data-category="${key}">
        <div class="category-select-row">
          <div class="custom-checkbox category-select-checkbox" data-category="${key}"></div>
          <span class="category-select-icon">${info.icon}</span>
          <span class="category-select-name">${info.name}</span>
          ${hasDomains ? `
            <span class="selection-count" data-category="${key}"></span>
            <button class="category-expand-btn" data-category="${key}">▶</button>
          ` : ''}
        </div>
        ${hasDomains ? `
          <div class="domain-list" data-category="${key}">
            ${sortedDomains.map(({ domain, time }) => `
              <div class="domain-select-item" data-domain="${domain}" data-category="${key}">
                <div class="custom-checkbox custom-checkbox-sm domain-select-checkbox" data-category="${key}" data-domain="${domain}"></div>
                <img class="domain-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="">
                <span class="domain-select-name">${domain}</span>
                <span class="domain-select-time">${formatTime(time)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  setupSelectionListeners();
}

function setupSelectionListeners() {
  // Category checkbox - toggle category, allow mixing with domains
  categorySelectionList.querySelectorAll('.category-select-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      checkbox.classList.toggle('checked');
      updateSelectionCounts();
      updateLimitSelection();
    });
  });

  // Domain checkbox - toggle domain, allow mixing with categories
  categorySelectionList.querySelectorAll('.domain-select-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      checkbox.classList.toggle('checked');
      updateSelectionCounts();
      updateLimitSelection();
    });
  });

  // Make domain item row clickable
  categorySelectionList.querySelectorAll('.domain-select-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('domain-select-checkbox')) return;
      const checkbox = item.querySelector('.domain-select-checkbox');
      if (checkbox) checkbox.click();
    });
  });

  // Expand button
  categorySelectionList.querySelectorAll('.category-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = e.target.dataset.category;
      const domainList = categorySelectionList.querySelector(`.domain-list[data-category="${category}"]`);
      const isExpanded = domainList?.classList.contains('expanded');

      // Close all other lists
      categorySelectionList.querySelectorAll('.domain-list').forEach(dl => dl.classList.remove('expanded'));
      categorySelectionList.querySelectorAll('.category-expand-btn').forEach(b => b.classList.remove('expanded'));

      if (!isExpanded && domainList) {
        domainList.classList.add('expanded');
        e.target.classList.add('expanded');
      }
    });
  });
}

function updateSelectionCounts() {
  // Update count for each category
  const categories = categorySelectionList.querySelectorAll('.category-select-item');
  categories.forEach(catItem => {
    const countEl = catItem.querySelector('.selection-count');
    if (!countEl) return;

    const checkedInCategory = catItem.querySelectorAll('.domain-select-checkbox.checked').length;
    if (checkedInCategory > 0) {
      countEl.textContent = `${checkedInCategory} selected`;
    } else {
      countEl.textContent = '';
    }
  });
}

function updateLimitSelection() {
  // Gather checked categories
  const checkedCategories = [];
  categorySelectionList.querySelectorAll('.category-select-checkbox.checked').forEach(cb => {
    checkedCategories.push(cb.dataset.category);
  });

  // Gather checked domains
  const checkedDomains = [];
  categorySelectionList.querySelectorAll('.domain-select-checkbox.checked').forEach(cb => {
    checkedDomains.push(cb.dataset.domain);
  });

  if (checkedCategories.length === 0 && checkedDomains.length === 0) {
    resetSelection();
    return;
  }

  const selection = {
    type: 'mixed',
    categories: checkedCategories,
    domains: checkedDomains
  };

  setSelection(selection);
}

function setSelection(selection) {
  currentSelection = selection;
  timeInputSection?.classList.remove('hidden');

  if (selection.type === 'category') {
    const info = categoriesInfo[selection.category];
    selectedTargetEl.innerHTML = `Limit for <strong>${info.icon} ${info.name}</strong>`;
  } else if (selection.type === 'domains' && selection.domains) {
    const domainCount = selection.domains.length;
    let displayText;
    if (domainCount === 1) {
      displayText = selection.domains[0];
    } else if (domainCount === 2) {
      displayText = `${selection.domains[0]}, ${selection.domains[1]}`;
    } else {
      displayText = `${selection.domains[0]}, ${selection.domains[1]} +${domainCount - 2} more`;
    }
    selectedTargetEl.innerHTML = `Limit for <strong>${displayText}</strong>`;
  } else if (selection.type === 'mixed') {
    const parts = [];

    // Add categories with icons
    if (selection.categories && selection.categories.length > 0) {
      selection.categories.forEach(cat => {
        const info = categoriesInfo[cat];
        if (info) {
          parts.push(`${info.icon} ${info.name}`);
        }
      });
    }

    // Add domains
    if (selection.domains && selection.domains.length > 0) {
      const domainCount = selection.domains.length;
      if (domainCount <= 2) {
        parts.push(...selection.domains);
      } else {
        parts.push(selection.domains[0], selection.domains[1], `+${domainCount - 2} more`);
      }
    }

    const displayText = parts.join(', ');
    selectedTargetEl.innerHTML = `Limit for <strong>${displayText}</strong>`;
  }
}

function resetSelection() {
  currentSelection = null;
  timeInputSection?.classList.add('hidden');
  categorySelectionList?.querySelectorAll('.custom-checkbox').forEach(cb => cb.classList.remove('checked'));
  updateSelectionCounts();
}

async function saveNewLimit() {
  if (!currentSelection) return;

  const hours = parseInt(limitHours.value) || 0;
  const minutes = parseInt(limitMinutes.value) || 0;
  const dailyLimit = (hours * 3600000) + (minutes * 60000);

  if (dailyLimit === 0) {
    alert('Please set a valid time limit');
    return;
  }

  try {
    // Handle mixed selection type
    let includeSites = [];
    let includeCategories = [];

    if (currentSelection.type === 'mixed') {
      includeCategories = currentSelection.categories || [];
      includeSites = currentSelection.domains || [];
    } else if (currentSelection.type === 'domains') {
      includeSites = currentSelection.domains || [];
    } else if (currentSelection.type === 'category') {
      includeCategories = [currentSelection.category];
    }

    // Generate unique ID for this limit based on selection
    const limitId = generateLimitId(includeCategories, includeSites);

    // Check for duplicate limits
    const existingLimits = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
    const existingLimit = (existingLimits.data || []).find(l => (l.id || l.category) === limitId);
    if (existingLimit) {
      if (!confirm('A limit with these selections already exists. Do you want to update it?')) {
        return;
      }
    }

    const limit = {
      id: `cat:${limitId}`,
      dailyLimit,
      enabled: true,
      alertMinutesBefore: 5,
      blockWhenLimitReached: true,
      targetType: 'category',
      targetValue: null,
      includeSites,
      includeCategories,
      excludeSites: []
    };

    await chrome.runtime.sendMessage({
      type: 'SET_LIMIT',
      category: limitId,
      limit
    });

    // Reload and reset
    await loadCurrentLimits();
    resetSelection();
    limitHours.value = 1;
    limitMinutes.value = 0;

  } catch (error) {
    console.error('Error saving limit:', error);
    alert('Failed to save limit');
  }
}

/**
 * Generate unique limit ID based on selection
 */
function generateLimitId(categories, domains) {
  if (domains.length > 0) {
    // For domain-specific limits, use sorted domains as ID
    return 'site:' + domains.sort().join(',');
  } else if (categories.length === 1) {
    // Single category - use category key
    return categories[0];
  } else if (categories.length > 1) {
    // Multiple categories
    return 'cats:' + categories.sort().join(',');
  }
  return 'mixed_' + Date.now();
}

// ============================================
// Utility Functions
// ============================================
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================
// Current Session Real-time Timer
// ============================================

/**
 * Start the session timer that updates every second
 */
function startSessionTimer() {
  // Clear any existing timer
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
  }

  // Fetch current session immediately
  updateCurrentSessionTime();

  // Update every second
  sessionTimerInterval = setInterval(updateCurrentSessionTime, 1000);
}

/**
 * Update current session time display in real-time
 */
async function updateCurrentSessionTime() {
  try {
    // Get current session from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
    
    if (!response.success || !response.data?.session) {
      return;
    }

    const session = response.data.session;
    currentSessionData = session;

    // Calculate elapsed time since session started
    const now = Date.now();
    const elapsedTime = now - session.startTime;

    // Get the domain from the current session's last visit
    const lastVisit = session.visits?.[session.visits.length - 1];
    if (!lastVisit) return;

    const domain = lastVisit.domain;

    // Find this domain's stored time in today's stats
    let storedTime = 0;
    if (todayStats.domains && todayStats.domains[domain]) {
      storedTime = todayStats.domains[domain].time || 0;
    }

    // Total time = stored time + current session elapsed time
    const totalTime = storedTime + elapsedTime;

    // Update the current site time display if domain matches
    if (currentSiteDomain && currentSiteTime) {
      const displayedDomain = currentSiteDomain.textContent;
      if (displayedDomain === domain) {
        currentSiteTime.textContent = formatTime(totalTime);
        
        // Add pulsing animation to indicate real-time update
        currentSiteTime.classList.add('live-timer');
      }
    }
  } catch (error) {
    // Silently ignore - popup might be closing or background not ready
  }
}

/**
 * Stop the session timer (called when popup closes)
 */
function stopSessionTimer() {
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
}

// ============================================
// Auto-refresh
// ============================================
setInterval(loadPopupData, 30000);
