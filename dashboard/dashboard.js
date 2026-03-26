import { formatTime, formatTimeWithSeconds, calculatePercentage, formatDate, getTodayDate, normalizeDomain } from '../common/utils.js';
import { SERVER_CONFIG } from '../common/server-config.js';
import { SUBCATEGORIES, getSubcategoryName, hasMultipleSubcategories } from '../common/subcategories.js';
import { getWellKnownDomain } from '../common/well-known-domains.js';

// ============================================
// Week Start Day Setting
// ============================================
let weekStartDay = 1; // 0 = Sunday, 1 = Monday (default)

/**
 * Load week start day setting from storage
 */
async function loadWeekStartDay() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.data?.weekStartDay !== undefined) {
      weekStartDay = response.data.weekStartDay;
    }
  } catch (error) {
    console.error('Error loading week start day:', error);
  }
}

/**
 * Get the start of the week for a given date
 * @param {Date} date - The date to find week start for
 * @returns {Date} - The first day of the week
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  // Calculate days to subtract to get to week start
  // If weekStartDay is 1 (Monday) and today is Sunday (0), we need to go back 6 days
  // If weekStartDay is 1 (Monday) and today is Monday (1), we need to go back 0 days
  const diff = (day - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get week day name based on index from week start
 * @param {number} index - Day index (0-6 from week start)
 * @returns {string} - Day name abbreviation
 */
function getWeekDayName(index) {
  const dayIndex = (weekStartDay + index) % 7;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex];
}

/**
 * Format time as decimal hours (e.g., 2.5h)
 * @param {number} ms - Time in milliseconds
 * @returns {string} - Formatted time string
 */
function formatDecimalHours(ms) {
  const hours = ms / 3600000;
  if (hours < 0.1) {
    // Less than 6 minutes, show in minutes
    const minutes = Math.round(ms / 60000);
    return `${minutes}m`;
  }
  // Round to 1 decimal place
  return `${hours.toFixed(1)}h`;
}

/**
 * Format date as YYYY-MM-DD using local timezone (not UTC)
 * @param {Date} date - Date object
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Productivity groupings (colors match CSS .prod-bar-fill)
const PRODUCTIVITY_GROUPS = {
  productive: {
    name: 'Productive',
    categories: ['productivity', 'education'],
    color: '#8BAF5B'  // Blue
  },
  unproductive: {
    name: 'Unproductive',
    categories: ['social', 'entertainment', 'games', 'adult'],
    color: '#FF6B6B'  // Grapefruit
  },
  neutral: {
    name: 'Neutral',
    categories: ['shopping', 'news', 'other'],
    color: '#8E8E93'  // Gray
  }
};

/**
 * Get productivity color for a category
 */
function getProductivityColor(category) {
  if (PRODUCTIVITY_GROUPS.productive.categories.includes(category)) {
    return PRODUCTIVITY_GROUPS.productive.color;
  } else if (PRODUCTIVITY_GROUPS.unproductive.categories.includes(category)) {
    return PRODUCTIVITY_GROUPS.unproductive.color;
  }
  return PRODUCTIVITY_GROUPS.neutral.color;
}

/**
 * Get productivity group for a category
 * Returns: 0 = productive, 1 = neutral, 2 = unproductive
 */
function getProductivityGroup(category) {
  if (PRODUCTIVITY_GROUPS.productive.categories.includes(category)) {
    return 0; // productive - bottom
  } else if (PRODUCTIVITY_GROUPS.unproductive.categories.includes(category)) {
    return 2; // unproductive - top
  }
  return 1; // neutral - middle
}

// ============================================
// Theme Management
// ============================================

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const themeBtn = document.getElementById('themeToggleBtn');

  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme, themeBtn);
  } else {
    // Follow system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = prefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme, themeBtn);
  }

  // Load saved accent color
  loadAccentColor();
}

// ============================================
// Accent Color Management
// ============================================

const DEFAULT_ACCENT_COLOR = '#8BAF5B';

/**
 * Load saved accent color from localStorage
 */
function loadAccentColor() {
  const savedColor = localStorage.getItem('accentColor') || DEFAULT_ACCENT_COLOR;
  applyAccentColor(savedColor);
}

/**
 * Apply accent color to CSS variables
 */
function applyAccentColor(color) {
  document.documentElement.style.setProperty('--primary', color);
  
  // Calculate lighter and darker variants
  const lightColor = adjustColorBrightness(color, 40);
  const darkColor = adjustColorBrightness(color, -30);
  document.documentElement.style.setProperty('--primary-light', lightColor);
  document.documentElement.style.setProperty('--primary-dark', darkColor);
  
  // Update productivity group color if it uses primary
  if (PRODUCTIVITY_GROUPS.productive.color === '#8BAF5B') {
    PRODUCTIVITY_GROUPS.productive.color = color;
  }
}

/**
 * Save accent color to localStorage
 */
function saveAccentColor(color) {
  localStorage.setItem('accentColor', color);
  applyAccentColor(color);
  
  // Refresh charts to apply new color
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab) {
    loadTabData(activeTab);
  }
}

/**
 * Adjust color brightness
 * @param {string} hex - Hex color string
 * @param {number} percent - Percentage to adjust (-100 to 100)
 * @returns {string} - Adjusted hex color
 */
function adjustColorBrightness(hex, percent) {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Parse RGB values
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  
  // Adjust brightness
  r = Math.min(255, Math.max(0, r + (r * percent / 100)));
  g = Math.min(255, Math.max(0, g + (g * percent / 100)));
  b = Math.min(255, Math.max(0, b + (b * percent / 100)));
  
  // Convert back to hex
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Initialize color palette event listeners
 */
function initColorPalette() {
  const colorPalette = document.getElementById('colorPalette');
  const customColorPicker = document.getElementById('customColorPicker');
  
  if (colorPalette) {
    const swatches = colorPalette.querySelectorAll('.color-swatch');
    const savedColor = localStorage.getItem('accentColor') || DEFAULT_ACCENT_COLOR;
    
    // Mark active swatch
    swatches.forEach(swatch => {
      const swatchColor = swatch.dataset.color;
      if (swatchColor.toLowerCase() === savedColor.toLowerCase()) {
        swatch.classList.add('active');
      }
      
      swatch.addEventListener('click', () => {
        // Remove active from all swatches
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        
        // Update custom picker to match
        if (customColorPicker) {
          customColorPicker.value = swatchColor;
        }
        
        // Save and apply
        saveAccentColor(swatchColor);
      });
    });
  }
  
  if (customColorPicker) {
    const savedColor = localStorage.getItem('accentColor') || DEFAULT_ACCENT_COLOR;
    customColorPicker.value = savedColor;
    
    customColorPicker.addEventListener('input', (e) => {
      const color = e.target.value;
      
      // Remove active from preset swatches since using custom
      const swatches = document.querySelectorAll('.color-swatch');
      swatches.forEach(s => s.classList.remove('active'));
      
      // Apply immediately for preview
      applyAccentColor(color);
    });
    
    customColorPicker.addEventListener('change', (e) => {
      // Save on final selection
      saveAccentColor(e.target.value);
    });
  }
}

function updateThemeIcon(theme, btn) {
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }
}

function toggleTheme() {
  const themeBtn = document.getElementById('themeToggleBtn');
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  let newTheme;
  if (currentTheme) {
    newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  } else {
    newTheme = prefersDark ? 'light' : 'dark';
  }

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme, themeBtn);

  // Re-render charts with new theme colors
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab) {
    loadTabData(activeTab);
  }
}

// Get CSS variable value
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Get theme-aware colors for charts
function getChartColors() {
  const isDark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    textSecondary: getCSSVar('--text-secondary') || '#86868B',
    textTertiary: getCSSVar('--text-tertiary') || '#AEAEB2',
    bgTertiary: isDark ? '#48484A' : '#D2D2D7',  // More visible bar color
    border: getCSSVar('--border') || '#D2D2D7',
    chartGrid: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    chartText: getCSSVar('--text-secondary') || '#86868B'
  };
}

// Initialize theme on load
initTheme();

// Theme toggle button
document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme')) {
    // Only auto-switch if user hasn't manually set a preference
    const themeBtn = document.getElementById('themeToggleBtn');
    updateThemeIcon(e.matches ? 'dark' : 'light', themeBtn);
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab) {
      loadTabData(activeTab);
    }
  }
});

// ============================================
// Real-time Update for Most Used Sites
// ============================================
let realTimeUpdateInterval = null;
let cachedTodayData = null; // Cache for today's data

/**
 * Start real-time updates for most used sites (1 second interval)
 */
function startRealTimeUpdates() {
  // Clear any existing interval
  stopRealTimeUpdates();

  // Only run on today's data
  if (currentTodayDate !== getTodayDate()) {
    return;
  }

  // Immediate first update
  updateMostUsedRealTime();

  // Start 1-second interval
  realTimeUpdateInterval = setInterval(async () => {
    await updateMostUsedRealTime();
  }, 1000);
}

/**
 * Stop real-time updates
 */
function stopRealTimeUpdates() {
  if (realTimeUpdateInterval) {
    clearInterval(realTimeUpdateInterval);
    realTimeUpdateInterval = null;
  }
}

// Pause/resume real-time updates when page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRealTimeUpdates();
  } else {
    // Resume if we're on the dashboard page and viewing today's data
    const activeNav = document.querySelector('.nav-item.active');
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeNav?.dataset.page === 'dashboard' &&
        activeTab?.dataset.tab === 'today' &&
        currentTodayDate === getTodayDate()) {
      startRealTimeUpdates();
    }
  }
});

/**
 * Update most used sites in real-time with current session data
 */
async function updateMostUsedRealTime() {
  try {
    const container = document.getElementById('todayMostUsed');
    if (!container) return;

    // Initialize allSites if not present (empty state)
    if (!container.allSites) {
      container.allSites = [];
      container.visibleCount = 10;
      container.totalDayTime = 0;
    }

    // Get current session to add real-time tracking
    const currentSessionResponse = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
    const currentSession = currentSessionResponse?.data?.session;

    let needsFullRender = false;

    if (currentSession && currentSession.visits?.length > 0) {
      // Get the current domain being tracked
      const lastVisit = currentSession.visits[currentSession.visits.length - 1];
      try {
        const url = new URL(lastVisit.url);
        const currentDomain = normalizeDomain(url.hostname.replace('www.', ''));

        // Calculate real-time duration for current session
        const currentDuration = Date.now() - currentSession.startTime;
        const timePerVisit = currentDuration / currentSession.visits.length;

        // Initialize base times on first update
        if (!container.baseTimes) {
          container.baseTimes = {};
          container.allSites.forEach(s => {
            container.baseTimes[s.name] = s.time;
          });
          container.baseTotalTime = container.totalDayTime;
        }

        // Update the allSites array with real-time data
        let siteIndex = container.allSites.findIndex(s => s.name === currentDomain);

        if (siteIndex !== -1) {
          // Update existing site's time
          container.allSites[siteIndex].time = (container.baseTimes[currentDomain] || 0) + timePerVisit;
        } else {
          // New site being tracked - add it to the list
          const categoriesResponse = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
          const categoriesInfo = categoriesResponse?.data || {};
          const categoryInfo = categoriesInfo[currentSession.category] || { name: currentSession.category, color: '#8E8E93' };

          container.allSites.push({
            name: currentDomain,
            time: timePerVisit,
            category: currentSession.category,
            categoryName: categoryInfo.name,
            color: categoryInfo.color
          });
          container.baseTimes[currentDomain] = 0;
          needsFullRender = true;
        }

        // Update totalDayTime
        container.totalDayTime = container.baseTotalTime + currentDuration;

        // Re-sort by time
        container.allSites.sort((a, b) => b.time - a.time);

        // Update the total time display in the header
        const todayChartTotal = document.getElementById('todayChartTotal');
        if (todayChartTotal) {
          todayChartTotal.textContent = formatTime(container.totalDayTime);
        }

        // Update the total time display in usage stats
        const totalTimeEl = document.getElementById('todayTotalTime');
        if (totalTimeEl) {
          totalTimeEl.textContent = formatTime(container.totalDayTime);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }

    // Re-render with updated times
    if (needsFullRender) {
      // Full re-render if new site was added
      renderMostUsedItems(container, 'today');
    } else {
      // Efficient update of just the time values
      renderMostUsedItemsRealTime(container);
    }

  } catch (error) {
    console.debug('Real-time update error:', error);
  }
}

/**
 * Render most used items with real-time seconds display
 */
function renderMostUsedItemsRealTime(container) {
  const allSites = container.allSites || [];
  const visibleCount = container.visibleCount || 10;
  const totalTime = container.totalDayTime || 1;
  const visibleSites = allSites.slice(0, visibleCount);

  // Update only the time elements to avoid flickering
  visibleSites.forEach((site, index) => {
    const wrapper = container.querySelector(`.most-used-item-wrapper[data-site-index="${index}"]`);
    if (wrapper) {
      const timeEl = wrapper.querySelector('.most-used-time');
      const barEl = wrapper.querySelector('.most-used-bar');
      if (timeEl) {
        timeEl.textContent = formatTimeWithSeconds(site.time);
      }
      if (barEl) {
        const barWidth = Math.max(2, (site.time / totalTime) * 100);
        barEl.style.width = `${barWidth}%`;
      }
    }
  });
}

// ============================================
// Productivity Score
// ============================================

/**
 * Calculate productivity stats from categories
 */
function calculateProductivityStats(categories) {
  let productive = 0;
  let unproductive = 0;
  let neutral = 0;

  Object.entries(categories || {}).forEach(([category, data]) => {
    const time = data.time || 0;

    if (PRODUCTIVITY_GROUPS.productive.categories.includes(category)) {
      productive += time;
    } else if (PRODUCTIVITY_GROUPS.unproductive.categories.includes(category)) {
      unproductive += time;
    } else {
      neutral += time;
    }
  });

  const total = productive + unproductive + neutral;
  // Score = productive / (productive + unproductive), ignoring neutral
  const relevantTotal = productive + unproductive;
  const score = relevantTotal > 0 ? Math.round((productive / relevantTotal) * 100) : 0;

  return { productive, unproductive, neutral, total, score };
}

// Store previous donut chart values for animation
const previousDonutValues = {
  today: { productive: 0, unproductive: 0, neutral: 0 },
  week: { productive: 0, unproductive: 0, neutral: 0 }
};

// Store productivity data for tooltip display
const productivityData = {
  today: { values: { productive: 0, unproductive: 0, neutral: 0 }, topSites: {} },
  week: { values: { productive: 0, unproductive: 0, neutral: 0 }, topSites: {} }
};

/**
 * Animate a number from start to end value
 */
function animateNumber(element, start, end, duration) {
  const startTime = performance.now();
  const diff = end - start;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + diff * easeProgress);

    element.textContent = `${current}%`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Update productivity score display with animation
 */
function displayProductivityScore(stats, prefix = 'today', compareScore = null, topSites = {}) {
  const { productive, unproductive, neutral, score } = stats;
  const total = productive + unproductive + neutral;

  // Store data for tooltip
  productivityData[prefix] = {
    values: { productive, unproductive, neutral },
    topSites: topSites
  };

  // Update score display with animation
  const scoreEl = document.getElementById(`${prefix}ProductivityScore`);
  if (scoreEl) {
    const currentText = scoreEl.textContent.trim();
    const currentScore = parseInt(currentText) || 0;

    // Skip animation if score text is empty or just "-" (first load)
    if (!currentText || currentText === '-' || currentText === '0%') {
      scoreEl.textContent = `${score}%`;
    } else {
      animateNumber(scoreEl, currentScore, score, 400);
    }
  }

  // Draw animated productivity donut chart
  const canvas = document.getElementById(`${prefix}ProductivityChart`);
  if (canvas) {
    const prev = previousDonutValues[prefix];

    // Check if this is the first load (all values are 0)
    const isFirstLoad = prev.productive === 0 && prev.unproductive === 0 && prev.neutral === 0;

    if (isFirstLoad) {
      // First load: draw immediately without animation
      drawDonutChartStatic(canvas, { productive, unproductive, neutral });
    } else {
      // Subsequent loads: animate from previous values
      animateDonutChart(canvas, prev, { productive, unproductive, neutral }, 400, prefix);
    }

    // Store current values for next animation
    previousDonutValues[prefix] = { productive, unproductive, neutral };

    // Setup hover detection
    setupDonutChartHover(canvas, prefix);
  }

  // Update tooltip time displays
  const productiveTime = document.getElementById(`${prefix}ProductiveTime`);
  const unproductiveTime = document.getElementById(`${prefix}UnproductiveTime`);
  const neutralTime = document.getElementById(`${prefix}NeutralTime`);

  if (productiveTime) productiveTime.textContent = formatTime(productive);
  if (unproductiveTime) unproductiveTime.textContent = formatTime(unproductive);
  if (neutralTime) neutralTime.textContent = formatTime(neutral);
}

/**
 * Setup hover detection for donut chart
 */
function setupDonutChartHover(canvas, prefix) {
  const size = 100;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 40;
  const lineWidth = 12;
  const innerRadius = radius - lineWidth / 2;
  const outerRadius = radius + lineWidth / 2;

  const tooltip = document.getElementById(`${prefix}ChartTooltip`);

  canvas.onmousemove = function(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate distance from center
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if mouse is within the donut ring
    if (distance >= innerRadius && distance <= outerRadius) {
      // Calculate angle
      let angle = Math.atan2(dy, dx);
      // Convert to start from top (-PI/2) and go clockwise
      angle = angle + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;

      // Find which segment the angle corresponds to
      const data = productivityData[prefix];
      const { productive, unproductive, neutral } = data.values;
      const total = productive + unproductive + neutral;

      if (total > 0) {
        const segments = [
          { name: 'productive', value: productive, color: '#8BAF5B', label: 'Productive' },
          { name: 'unproductive', value: unproductive, color: '#FF6B6B', label: 'Unproductive' },
          { name: 'neutral', value: neutral, color: '#8E8E93', label: 'Neutral' }
        ];

        let currentAngle = 0;
        let hoveredSegment = null;
        let segmentMidAngle = 0;

        for (const segment of segments) {
          if (segment.value > 0) {
            const sweepAngle = (segment.value / total) * Math.PI * 2;
            if (angle >= currentAngle && angle < currentAngle + sweepAngle) {
              hoveredSegment = segment;
              segmentMidAngle = currentAngle + sweepAngle / 2;
              break;
            }
            currentAngle += sweepAngle;
          }
        }

        if (hoveredSegment) {
          // Position tooltip relative to mouse
          const chartArea = canvas.closest('.productivity-chart-area');
          const chartAreaRect = chartArea ? chartArea.getBoundingClientRect() : rect;

          // Position tooltip to the right of the chart
          const tooltipX = rect.right - chartAreaRect.left + 10;
          const tooltipY = event.clientY - chartAreaRect.top - 30;

          showProductivityTooltip(prefix, hoveredSegment, data.topSites, tooltipX, tooltipY);
          canvas.style.cursor = 'pointer';
          return;
        }
      }
    }

    // Hide tooltip if not on segment
    hideProductivityTooltip(prefix);
    canvas.style.cursor = 'default';
  };

  canvas.onmouseleave = function() {
    hideProductivityTooltip(prefix);
    canvas.style.cursor = 'default';
  };
}

/**
 * Show productivity tooltip with segment info and top sites
 */
function showProductivityTooltip(prefix, segment, topSites, x, y) {
  const tooltip = document.getElementById(`${prefix}ChartTooltip`);
  const header = document.getElementById(`${prefix}TooltipHeader`);
  const time = document.getElementById(`${prefix}TooltipTime`);
  const sites = document.getElementById(`${prefix}TooltipSites`);

  if (!tooltip || !header || !time || !sites) return;

  // Update header
  header.textContent = segment.label;
  header.className = `chart-tooltip-header ${segment.name}`;

  // Update time
  time.textContent = formatTime(segment.value);

  // Get top sites for this productivity group
  const groupCategories = PRODUCTIVITY_GROUPS[segment.name]?.categories || [];
  const groupSites = [];

  groupCategories.forEach(category => {
    const categorySites = topSites[category] || [];
    categorySites.forEach(site => {
      groupSites.push({
        name: typeof site === 'string' ? site : site.domain,
        time: typeof site === 'object' ? site.time : 0
      });
    });
  });

  // Sort by time and take top 3
  groupSites.sort((a, b) => b.time - a.time);
  const top3 = groupSites.slice(0, 3);

  if (top3.length > 0) {
    sites.innerHTML = top3.map(site => `
      <div class="chart-tooltip-site">
        <span class="chart-tooltip-site-name">${site.name}</span>
        ${site.time > 0 ? `<span class="chart-tooltip-site-time">${formatTime(site.time)}</span>` : ''}
      </div>
    `).join('');
  } else {
    sites.innerHTML = '<div class="chart-tooltip-site"><span class="chart-tooltip-site-name">No sites tracked</span></div>';
  }

  // Position tooltip near the segment
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('visible');
}

/**
 * Hide productivity tooltip
 */
function hideProductivityTooltip(prefix) {
  const tooltip = document.getElementById(`${prefix}ChartTooltip`);
  if (tooltip) {
    tooltip.classList.remove('visible');
  }
}

/**
 * Show graph tooltip for a specific segment (fixed position at top-right of chart)
 */
function showGraphTooltip(tooltipId, data, mouseX, mouseY, containerRect, colorMode, categoriesInfo) {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return;

  const { label, time, segmentName, segmentColor, segmentTime, topSites } = data;

  // Build tooltip content based on whether we're showing a segment or whole bar
  let html = '';

  if (segmentName) {
    // Showing a specific segment
    html = `
      <div class="graph-tooltip-header" style="color:${segmentColor}">${segmentName}</div>
      <div class="graph-tooltip-time">${formatTime(segmentTime)}</div>
      <div class="graph-tooltip-divider"></div>
      <div class="graph-tooltip-site">
        <span class="graph-tooltip-site-name">${label}</span>
        <span class="graph-tooltip-site-time">${formatTime(time)}</span>
      </div>
    `;

    // Add top sites for this segment if available
    if (topSites && topSites.length > 0) {
      html += `<div class="graph-tooltip-divider"></div>`;
      html += `<div class="graph-tooltip-sites-title">Top Sites</div>`;
      topSites.slice(0, 3).forEach(site => {
        html += `
          <div class="graph-tooltip-site">
            <span class="graph-tooltip-site-name">${site.domain || site.name}</span>
            <span class="graph-tooltip-site-time">${formatTime(site.time)}</span>
          </div>
        `;
      });
    }
  } else {
    html = `
      <div class="graph-tooltip-header">${label}</div>
      <div class="graph-tooltip-time">${formatTime(time)}</div>
    `;

    // Add top sites if available
    if (topSites && topSites.length > 0) {
      html += `<div class="graph-tooltip-divider"></div>`;
      html += `<div class="graph-tooltip-sites-title">Top Sites</div>`;
      topSites.slice(0, 3).forEach(site => {
        html += `
          <div class="graph-tooltip-site">
            <span class="graph-tooltip-site-name">${site.domain || site.name}</span>
            <span class="graph-tooltip-site-time">${formatTime(site.time)}</span>
          </div>
        `;
      });
    }
  }

  tooltip.innerHTML = html;

  // Position tooltip next to the hovered bar, left-aligned
  // mouseX is the bar's X position, place tooltip to its right
  const barRightEdge = mouseX + 20; // 20px to the right of bar position
  tooltip.style.left = barRightEdge + 'px';
  tooltip.style.right = 'auto';
  tooltip.style.top = '12px';
  tooltip.classList.add('visible');
}

/**
 * Hide graph tooltip
 */
function hideGraphTooltip(tooltipId) {
  const tooltip = document.getElementById(tooltipId);
  if (tooltip) {
    tooltip.classList.remove('visible');
  }
}

/**
 * Get categories for a segment based on name and color mode
 */
function getSegmentCategories(segmentName, colorMode) {
  if (colorMode === 'productivity') {
    if (segmentName === 'Productive') {
      return PRODUCTIVITY_GROUPS.productive.categories;
    } else if (segmentName === 'Unproductive') {
      return PRODUCTIVITY_GROUPS.unproductive.categories;
    } else if (segmentName === 'Neutral') {
      return PRODUCTIVITY_GROUPS.neutral.categories;
    }
  } else if (colorMode === 'subcategories') {
    // For subcategory mode, return all categories that match this subcategory
    // This is used for filtering sites when clicking on a subcategory segment
    return []; // Will be handled differently
  }
  // For category mode, just return the segment name as an array
  return [segmentName.toLowerCase()];
}

/**
 * Group category data by subcategories
 * @param {Object} categories - Category time data { category: { time, ... } }
 * @returns {Object} - Grouped by subcategory { "category:subcategory": { time, category, subcategory } }
 */
function groupBySubcategories(categories) {
  const grouped = {};

  for (const [category, data] of Object.entries(categories)) {
    const time = typeof data === 'number' ? data : (data.time || 0);
    const subcategory = data.subcategory || 'general';

    // Create key: "category:subcategory" for unique identification
    const key = `${category}:${subcategory}`;

    if (!grouped[key]) {
      grouped[key] = {
        time: 0,
        category: category,
        subcategory: subcategory
      };
    }
    grouped[key].time += time;
  }

  return grouped;
}

/**
 * Get color for subcategory (use parent category color with slight variation)
 */
function getSubcategoryColor(category, subcategory, index = 0) {
  const categoryInfo = CATEGORIES[category];
  if (!categoryInfo) return '#8E8E93';

  const baseColor = categoryInfo.color;

  // For 'general' subcategory, use base color
  if (subcategory === 'general') {
    return baseColor;
  }

  // Create variations by adjusting brightness
  // Parse hex color
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Adjust brightness based on index (darker for first, lighter for later)
  const factor = 1 - (index * 0.15);
  const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
  const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
  const newB = Math.min(255, Math.max(0, Math.round(b * factor)));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Get top sites for given categories from category data
 */
function getTopSitesForCategories(segmentCategories, categories, categoriesInfo) {
  const sites = [];

  segmentCategories.forEach(cat => {
    const catData = categories[cat];
    if (!catData) return;

    // Handle hourly data format: { time: number, topSites: { domain: time } }
    if (catData.topSites && typeof catData.topSites === 'object' && !Array.isArray(catData.topSites)) {
      Object.entries(catData.topSites).forEach(([domain, time]) => {
        sites.push({
          domain: domain,
          time: time,
          category: cat
        });
      });
    }
    // Handle daily data format: { time: number, topSites: [{ domain, time }] }
    else if (catData.topSites && Array.isArray(catData.topSites)) {
      catData.topSites.forEach(site => {
        sites.push({
          domain: typeof site === 'string' ? site : site.domain,
          time: typeof site === 'object' ? site.time : 0,
          category: cat
        });
      });
    }
  });

  // Sort by time and return top 3
  return sites.sort((a, b) => b.time - a.time).slice(0, 3);
}

/**
 * Find which segment is being hovered based on Y position
 * @param useTop3Colors - if true, use fixed top3 colors (Blue, Tiffany, Orange) and return null for gray segments
 * @param weeklyTop3Categories - optional array of category names ordered by weekly total (for consistent colors)
 */
function findHoveredSegment(mouseY, categories, totalTime, maxTime, chartTop, maxHeight, colorMode, categoriesInfo, useTop3Colors = false, weeklyTop3Categories = null) {
  if (!categories || totalTime === 0) return null;

  const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const grayColor = isDarkMode ? '#555555' : '#C8C8C8';

  // For productivity mode or non-top3 mode, use original sorting
  if (colorMode === 'productivity' || !useTop3Colors) {
    let sortedCategories = Object.entries(categories)
      .filter(([_, data]) => {
        const time = typeof data === 'number' ? data : (data.time || 0);
        return time > 0;
      });

    if (colorMode === 'productivity') {
      sortedCategories.sort((a, b) => getProductivityGroup(a[0]) - getProductivityGroup(b[0]));
    } else {
      sortedCategories.sort((a, b) => {
        if (a[0] === 'other') return 1;
        if (b[0] === 'other') return -1;
        const aTime = typeof a[1] === 'number' ? a[1] : (a[1].time || 0);
        const bTime = typeof b[1] === 'number' ? b[1] : (b[1].time || 0);
        return bTime - aTime;
      });
    }

    let currentY = chartTop + maxHeight;

    for (const [category, data] of sortedCategories) {
      const segmentTime = typeof data === 'number' ? data : (data.time || 0);
      const segmentHeight = (segmentTime / maxTime) * maxHeight;
      const segmentTop = currentY - segmentHeight;

      if (mouseY >= segmentTop && mouseY <= currentY) {
        if (colorMode === 'productivity') {
          const prodGroup = getProductivityGroup(category);
          const prodName = prodGroup === 0 ? 'Productive' : (prodGroup === 2 ? 'Unproductive' : 'Neutral');
          const prodColor = prodGroup === 0 ? '#8BAF5B' : (prodGroup === 2 ? '#FF6B6B' : '#8E8E93');
          return { name: prodName, color: prodColor, time: segmentTime };
        } else {
          const catInfo = categoriesInfo[category] || { name: category, color: '#8E8E93' };
          return { name: catInfo.name, color: catInfo.color, time: segmentTime };
        }
      }
      currentY = segmentTop;
    }
    return null;
  }

  // For subcategories mode - group by subcategory and find top 3
  if (colorMode === 'subcategories') {
    const subcatData = {};

    // Group by subcategory from categories[category].subcategories
    Object.entries(categories).forEach(([category, data]) => {
      const time = typeof data === 'number' ? data : (data.time || 0);
      if (time <= 0) return;

      const subcategories = data.subcategories || {};

      // If no subcategories data, use category time as 'general'
      if (Object.keys(subcategories).length === 0) {
        const key = `${category}:general`;
        subcatData[key] = {
          time: time,
          category: category,
          subcategory: 'general',
          displayName: `${categoriesInfo[category]?.name || category} - ${getSubcategoryName('general')}`
        };
      } else {
        // Add each subcategory
        Object.entries(subcategories).forEach(([subcategory, subcatInfo]) => {
          const key = `${category}:${subcategory}`;
          if (!subcatData[key]) {
            subcatData[key] = {
              time: 0,
              category: category,
              subcategory: subcategory,
              displayName: `${categoriesInfo[category]?.name || category} - ${getSubcategoryName(subcategory)}`
            };
          }
          subcatData[key].time += subcatInfo.time || 0;
        });
      }
    });

    // Sort by time and get top 3
    const sortedSubcats = Object.entries(subcatData)
      .sort((a, b) => b[1].time - a[1].time);

    const top3Subcats = sortedSubcats.slice(0, 3);

    let currentY = chartTop + maxHeight;
    let restTime = totalTime;

    // Check each top3 subcategory segment
    for (let i = 0; i < top3Subcats.length; i++) {
      const [key, data] = top3Subcats[i];
      const segmentHeight = (data.time / maxTime) * maxHeight;
      const segmentTop = currentY - segmentHeight;

      if (mouseY >= segmentTop && mouseY <= currentY) {
        return { name: data.displayName, color: top3Colors[i], time: data.time };
      }
      currentY = segmentTop;
      restTime -= data.time;
    }

    // Gray segment - return null to hide tooltip
    if (restTime > 0) {
      const restHeight = (restTime / maxTime) * maxHeight;
      const restTop = currentY - restHeight;
      if (mouseY >= restTop && mouseY <= currentY) {
        return null; // Don't show tooltip for gray segment
      }
    }

    return null;
  }

  // For top3 mode with weekly categories - use consistent order
  const top3Cats = weeklyTop3Categories || Object.entries(categories)
    .filter(([cat, data]) => {
      const time = typeof data === 'number' ? data : (data.time || 0);
      return time > 0 && cat !== 'other' && cat !== 'undefined';
    })
    .sort((a, b) => {
      const aTime = typeof a[1] === 'number' ? a[1] : (a[1].time || 0);
      const bTime = typeof b[1] === 'number' ? b[1] : (b[1].time || 0);
      return bTime - aTime;
    })
    .slice(0, 3)
    .map(([cat]) => cat);

  let currentY = chartTop + maxHeight;
  let restTime = totalTime;

  // Check each top3 category segment (in order from bottom)
  for (let i = 0; i < top3Cats.length; i++) {
    const cat = top3Cats[i];
    const catData = categories[cat];
    if (catData) {
      const segmentTime = typeof catData === 'number' ? catData : (catData.time || 0);
      if (segmentTime > 0) {
        const segmentHeight = (segmentTime / maxTime) * maxHeight;
        const segmentTop = currentY - segmentHeight;

        if (mouseY >= segmentTop && mouseY <= currentY) {
          const catInfo = categoriesInfo[cat] || { name: cat };
          return { name: catInfo.name, color: top3Colors[i], time: segmentTime };
        }
        currentY = segmentTop;
        restTime -= segmentTime;
      }
    }
  }

  // Check gray (rest) segment - return null to hide tooltip
  if (restTime > 0) {
    const restHeight = (restTime / maxTime) * maxHeight;
    const restTop = currentY - restHeight;
    if (mouseY >= restTop && mouseY <= currentY) {
      return null;
    }
  }

  return null;
}

/**
 * Extract top sites from categories for tooltip display
 */
function extractTopSitesFromCategories(categories, domains) {
  const topSites = {};

  Object.entries(categories || {}).forEach(([category, data]) => {
    topSites[category] = [];

    // Try to get sites from topSites array
    if (data.topSites && data.topSites.length > 0) {
      data.topSites.forEach(site => {
        const domain = typeof site === 'string' ? site : site.domain;
        const time = typeof site === 'object' && site.time ? site.time : (domains[domain]?.time || 0);
        topSites[category].push({ domain, time });
      });
    }
  });

  // Also aggregate from domains if available
  Object.entries(domains || {}).forEach(([domain, data]) => {
    const category = data.category || 'other';
    if (!topSites[category]) {
      topSites[category] = [];
    }
    // Check if already exists
    const existing = topSites[category].find(s => s.domain === domain);
    if (!existing) {
      topSites[category].push({ domain, time: data.time || 0 });
    } else if (data.time) {
      existing.time = data.time;
    }
  });

  // Sort each category by time
  Object.keys(topSites).forEach(category => {
    topSites[category].sort((a, b) => b.time - a.time);
    topSites[category] = topSites[category].slice(0, 5);
  });

  return topSites;
}

/**
 * Draw donut chart immediately (no animation)
 */
function drawDonutChartStatic(canvas, values) {
  const ctx = canvas.getContext('2d');
  const size = 80;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 32;
  const lineWidth = 10;

  const total = values.productive + values.unproductive + values.neutral;

  ctx.clearRect(0, 0, size, size);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#E5E5EA';
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  } else {
    const segments = [
      { value: values.productive, color: '#8BAF5B' },
      { value: values.unproductive, color: '#FF6B6B' },
      { value: values.neutral, color: '#8E8E93' }
    ];

    let startAngle = -Math.PI / 2;
    segments.forEach(segment => {
      if (segment.value > 0) {
        const sweepAngle = (segment.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sweepAngle);
        ctx.strokeStyle = segment.color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'butt';
        ctx.stroke();
        startAngle += sweepAngle;
      }
    });
  }
}

/**
 * Animate donut chart from previous values to new values
 */
function animateDonutChart(canvas, fromValues, toValues, duration) {
  const ctx = canvas.getContext('2d');
  const size = 80;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 32;
  const lineWidth = 10;

  const startTime = performance.now();

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function drawFrame(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    // Interpolate values
    const current = {
      productive: fromValues.productive + (toValues.productive - fromValues.productive) * easedProgress,
      unproductive: fromValues.unproductive + (toValues.unproductive - fromValues.unproductive) * easedProgress,
      neutral: fromValues.neutral + (toValues.neutral - fromValues.neutral) * easedProgress
    };

    const total = current.productive + current.unproductive + current.neutral;

    ctx.clearRect(0, 0, size, size);

    if (total === 0) {
      // Draw empty ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#E5E5EA';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    } else {
      // Draw segments
      const segments = [
        { value: current.productive, color: '#8BAF5B' },
        { value: current.unproductive, color: '#FF6B6B' },
        { value: current.neutral, color: '#8E8E93' }
      ];

      let startAngle = -Math.PI / 2;
      segments.forEach(segment => {
        if (segment.value > 0) {
          const sweepAngle = (segment.value / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, startAngle, startAngle + sweepAngle);
          ctx.strokeStyle = segment.color;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'butt';
          ctx.stroke();
          startAngle += sweepAngle;
        }
      });
    }

    if (progress < 1) {
      requestAnimationFrame(drawFrame);
    }
  }

  // Draw first frame immediately to prevent blank flash
  drawFrame(performance.now());
}

// ============================================
// Tab management
// ============================================
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    const previousTab = document.querySelector('.tab-btn.active')?.dataset.tab;

    // Copy productivity score and donut values from previous tab for smooth transition
    if (previousTab && previousTab !== tabName) {
      // Copy score text
      const prevScoreEl = document.getElementById(`${previousTab}ProductivityScore`);
      const newScoreEl = document.getElementById(`${tabName}ProductivityScore`);
      if (prevScoreEl && newScoreEl) {
        newScoreEl.textContent = prevScoreEl.textContent;
      }

      // Copy donut chart values and immediately redraw new tab's chart with previous values
      const prevValues = previousDonutValues[previousTab];
      previousDonutValues[tabName] = { ...prevValues };

      // Immediately draw new tab's donut chart with previous tab's values (prevents flash)
      const newCanvas = document.getElementById(`${tabName}ProductivityChart`);
      if (newCanvas && prevValues) {
        drawDonutChartStatic(newCanvas, prevValues);
      }
    }

    // Update active states
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(tabName).classList.add('active');

    // Sync week offset based on current today date when switching to week tab
    if (tabName === 'week') {
      syncWeekOffsetToDate(currentTodayDate);
    }

    // Wait for layout to complete before rendering charts
    requestAnimationFrame(() => {
      loadTabData(tabName);
    });
  });
});

// Chart color mode toggle (categories vs productivity)
document.querySelectorAll('.chart-color-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const toggleGroup = btn.closest('.chart-color-toggle-group');
    const mode = btn.dataset.mode;

    // Update button states
    toggleGroup.querySelectorAll('.chart-color-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update shared chart color mode and sync both toggle groups
    chartColorMode = mode;

    // Sync all toggle buttons to match the selected mode
    document.querySelectorAll('.chart-color-toggle-group').forEach(group => {
      group.querySelectorAll('.chart-color-toggle').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
    });

    // Re-render both tabs' charts with new color mode
    const isToday = toggleGroup.id === 'todayChartToggle';
    if (isToday) {
      loadTodayData(currentTodayDate);
    } else {
      loadWeekData();
    }
  });
});

/**
 * Sync week offset to show the week containing the given date
 */
function syncWeekOffsetToDate(targetDate) {
  const thisWeekStart = getWeekStart(new Date());
  const targetWeekStart = getWeekStart(new Date(targetDate));

  // Calculate week offset
  const diffTime = targetWeekStart.getTime() - thisWeekStart.getTime();
  const diffWeeks = Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));

  weekOffset = diffWeeks;
}

// ============================================
// Sidebar Navigation
// ============================================
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const pageName = item.dataset.page;

    // Stop real-time updates when leaving dashboard page
    if (pageName !== 'dashboard') {
      stopRealTimeUpdates();
    }

    // Update active states
    navItems.forEach(nav => nav.classList.remove('active'));
    pages.forEach(page => page.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(`${pageName}Page`).classList.add('active');

    // Load data for specific pages
    if (pageName === 'dashboard') {
      // Restart real-time updates if viewing today's data
      if (currentTodayDate === getTodayDate()) {
        startRealTimeUpdates();
      }
    } else if (pageName === 'limits') {
      loadLimits();
    } else if (pageName === 'settings') {
      loadSettingsUI();
    } else if (pageName === 'goals') {
      loadGoals();
    } else if (pageName === 'flowchart') {
      loadFlowChart();
    } else if (pageName === 'focus') {
      loadFocusMode();
    } else if (pageName === 'reports') {
      loadReports();
    } else if (pageName === 'downtime') {
      loadDowntimePage();
    }
  });
});

// ============================================
// Settings & Limits State
// ============================================
let categoriesInfo = {};
let currentSettings = {};

// ============================================
// Settings UI
// ============================================
async function loadSettingsUI() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    currentSettings = response.data || {};

    // Week Start Day
    const weekStartDaySelect = document.getElementById('weekStartDay');
    if (weekStartDaySelect) {
      weekStartDaySelect.value = currentSettings.weekStartDay !== undefined ? currentSettings.weekStartDay : 1;
    }

    // Notifications
    const notificationsEnabled = document.getElementById('notificationsEnabled');
    if (notificationsEnabled) {
      notificationsEnabled.checked = currentSettings.notifications?.enabled || false;
    }

    // Server Sync
    const serverSyncEnabled = document.getElementById('serverSyncEnabled');
    const serverSyncOptions = document.getElementById('serverSyncOptions');
    const shareUsageData = document.getElementById('shareUsageData');
    if (serverSyncEnabled) {
      serverSyncEnabled.checked = currentSettings.serverSync?.enabled || false;
      if (serverSyncOptions) {
        serverSyncOptions.classList.toggle('active', currentSettings.serverSync?.enabled || false);
      }
    }
    if (shareUsageData) {
      shareUsageData.checked = currentSettings.serverSync?.shareUsageData || false;
    }

    // History Analysis
    const showApproximatedData = document.getElementById('showApproximatedData');
    if (showApproximatedData) {
      showApproximatedData.checked = currentSettings.historyAnalysis?.showApproximatedData !== false;
    }
    const lastAnalysisDate = document.getElementById('lastAnalysisDate');
    if (lastAnalysisDate && currentSettings.historyAnalysis?.lastAnalysisDate) {
      lastAnalysisDate.textContent = new Date(currentSettings.historyAnalysis.lastAnalysisDate).toLocaleString();
    }

    // Privacy Mode
    const privacyModeEnabled = document.getElementById('privacyModeEnabled');
    const privacyOptions = document.getElementById('privacyOptions');
    if (privacyModeEnabled) {
      privacyModeEnabled.checked = currentSettings.privacyMode?.enabled || false;
      if (privacyOptions) {
        privacyOptions.classList.toggle('active', currentSettings.privacyMode?.enabled || false);
      }
    }
    const privacyAutoDelete = document.getElementById('privacyAutoDelete');
    const privacyExcludeStats = document.getElementById('privacyExcludeStats');
    const privacyHideTimeline = document.getElementById('privacyHideTimeline');
    if (privacyAutoDelete) privacyAutoDelete.checked = currentSettings.privacyMode?.autoDelete || false;
    if (privacyExcludeStats) privacyExcludeStats.checked = currentSettings.privacyMode?.excludeFromStats || false;
    if (privacyHideTimeline) privacyHideTimeline.checked = currentSettings.privacyMode?.hideFromTimeline || false;

    // Sync status
    loadSyncStatus();

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: currentSettings
    });
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

async function loadSyncStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' });
    const status = response.data;

    const lastSyncTime = document.getElementById('lastSyncTime');
    if (lastSyncTime) {
      lastSyncTime.textContent = status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : 'Never';
    }

    const categoryVersion = document.getElementById('categoryVersion');
    if (categoryVersion) {
      categoryVersion.textContent = currentSettings.categoryVersion || '1.0.0';
    }

    const syncStatus = document.getElementById('syncStatus');
    const forceSyncBtn = document.getElementById('forceSyncBtn');
    if (syncStatus) {
      if (status.syncInProgress) {
        syncStatus.textContent = 'Syncing...';
        syncStatus.style.color = '#8BAF5B';
        if (forceSyncBtn) forceSyncBtn.disabled = true;
      } else if (!status.isOnline) {
        syncStatus.textContent = 'Offline';
        syncStatus.style.color = '#FF3B30';
        if (forceSyncBtn) forceSyncBtn.disabled = true;
      } else {
        syncStatus.textContent = `Ready (${status.pendingStatsCount || 0} pending)`;
        syncStatus.style.color = '#34C759';
        if (forceSyncBtn) forceSyncBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('Error loading sync status:', error);
  }
}

// Settings event listeners
document.getElementById('weekStartDay')?.addEventListener('change', async (e) => {
  currentSettings.weekStartDay = parseInt(e.target.value);
  weekStartDay = currentSettings.weekStartDay;
  await saveSettings();
  // Reload current tab data
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab) loadTabData(activeTab);
});

document.getElementById('notificationsEnabled')?.addEventListener('change', async (e) => {
  if (!currentSettings.notifications) currentSettings.notifications = {};
  currentSettings.notifications.enabled = e.target.checked;
  await saveSettings();
});

document.getElementById('serverSyncEnabled')?.addEventListener('change', async (e) => {
  if (!currentSettings.serverSync) currentSettings.serverSync = {};
  currentSettings.serverSync.enabled = e.target.checked;
  document.getElementById('serverSyncOptions')?.classList.toggle('active', e.target.checked);
  await saveSettings();
  if (e.target.checked) {
    await forceSyncNow();
  }
});

document.getElementById('shareUsageData')?.addEventListener('change', async (e) => {
  if (!currentSettings.serverSync) currentSettings.serverSync = {};
  currentSettings.serverSync.shareUsageData = e.target.checked;
  await saveSettings();
});

document.getElementById('forceSyncBtn')?.addEventListener('click', forceSyncNow);

document.getElementById('analyzeUnclassifiedBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('analyzeUnclassifiedBtn');
  const status = document.getElementById('analyzeStatus');

  if (btn) btn.disabled = true;
  if (status) {
    status.style.display = 'block';
    status.textContent = 'Analyzing unclassified domains...';
    status.style.color = '#8BAF5B';
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_UNCLASSIFIED' });
    if (response?.success) {
      const { total, classified } = response.data;
      if (total === 0) {
        status.textContent = 'No unclassified domains found.';
      } else {
        status.textContent = `Done! ${classified}/${total} domains classified.`;
        if (classified > 0) {
          // Refresh dashboard data
          setTimeout(() => {
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
            if (activeTab) loadTabData(activeTab);
          }, 1000);
        }
      }
    } else {
      status.textContent = `Error: ${response?.error || 'Unknown error'}`;
      status.style.color = '#FF3B30';
    }
  } catch (error) {
    console.error('Analyze unclassified error:', error);
    if (status) {
      status.textContent = 'Failed to connect to service worker.';
      status.style.color = '#FF3B30';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
});

async function forceSyncNow() {
  const syncStatus = document.getElementById('syncStatus');
  const forceSyncBtn = document.getElementById('forceSyncBtn');
  if (syncStatus) {
    syncStatus.textContent = 'Syncing...';
    syncStatus.style.color = '#8BAF5B';
  }
  if (forceSyncBtn) forceSyncBtn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: 'FORCE_SYNC_NOW' });
    setTimeout(loadSyncStatus, 2000);
  } catch (error) {
    console.error('Error forcing sync:', error);
    if (syncStatus) {
      syncStatus.textContent = 'Error';
      syncStatus.style.color = '#FF3B30';
    }
    if (forceSyncBtn) forceSyncBtn.disabled = false;
  }
}

document.getElementById('showApproximatedData')?.addEventListener('change', async (e) => {
  if (!currentSettings.historyAnalysis) currentSettings.historyAnalysis = {};
  currentSettings.historyAnalysis.showApproximatedData = e.target.checked;
  await saveSettings();
});

document.getElementById('privacyModeEnabled')?.addEventListener('change', async (e) => {
  if (!currentSettings.privacyMode) currentSettings.privacyMode = {};
  currentSettings.privacyMode.enabled = e.target.checked;
  document.getElementById('privacyOptions')?.classList.toggle('active', e.target.checked);
  await saveSettings();
});

document.getElementById('privacyAutoDelete')?.addEventListener('change', async (e) => {
  if (!currentSettings.privacyMode) currentSettings.privacyMode = {};
  currentSettings.privacyMode.autoDelete = e.target.checked;
  await saveSettings();
});

document.getElementById('privacyExcludeStats')?.addEventListener('change', async (e) => {
  if (!currentSettings.privacyMode) currentSettings.privacyMode = {};
  currentSettings.privacyMode.excludeFromStats = e.target.checked;
  await saveSettings();
});

document.getElementById('privacyHideTimeline')?.addEventListener('change', async (e) => {
  if (!currentSettings.privacyMode) currentSettings.privacyMode = {};
  currentSettings.privacyMode.hideFromTimeline = e.target.checked;
  await saveSettings();
});

document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
document.getElementById('clearDataBtn')?.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
    alert('Clear data functionality not yet implemented');
  }
});

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
    a.download = `web-activity-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting data:', error);
    alert('Failed to export data');
  }
}

// ============================================
// Limits Management
// ============================================
async function loadCategories() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    categoriesInfo = response.data;

    const limitCategory = document.getElementById('limitCategory');
    if (limitCategory) {
      limitCategory.innerHTML = Object.entries(categoriesInfo)
        .filter(([key]) => key !== 'other' && key !== 'adult')
        .map(([key, info]) => `<option value="${key}">${info.icon} ${info.name}</option>`)
        .join('');
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Limits page state
let limitsEnabled = true;
let categoryLimits = {};
let categoryDomainUsage = {};
let selectedLimitCategory = null;
let limitModalStep = 1;

async function loadLimits() {
  await loadCategories();

  try {
    // Load settings for master toggle
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResponse.data || {};
    limitsEnabled = settings.limitsEnabled !== false;

    // Update master toggle
    const limitsEnabledToggle = document.getElementById('limitsEnabled');
    if (limitsEnabledToggle) {
      limitsEnabledToggle.checked = limitsEnabled;
    }

    // Load existing limits
    const limitsResponse = await chrome.runtime.sendMessage({ type: 'GET_LIMITS' });
    const limits = limitsResponse.data || [];
    categoryLimits = {};
    limits.forEach(limit => {
      categoryLimits[limit.category] = limit;
    });

    // Load domain usage for categories (last 7 days)
    await loadCategoryDomainUsage();

    // Render UI
    renderActiveLimits();
  } catch (error) {
    console.error('Error loading limits:', error);
  }
}

async function loadCategoryDomainUsage() {
  try {
    const weeklyResponse = await chrome.runtime.sendMessage({ type: 'GET_WEEKLY_STATS' });
    const weeklyData = weeklyResponse.data;

    categoryDomainUsage = {};

    // Aggregate domain usage by category
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

async function renderActiveLimits() {
  const container = document.getElementById('activeLimitsList');
  if (!container) return;

  const activeLimits = Object.entries(categoryLimits)
    .filter(([_, limit]) => limit && limit.dailyLimit > 0);

  if (activeLimits.length === 0) {
    container.innerHTML = '<div class="empty-domains-text">No limits set yet. Click "Add Usage Limit" to create one.</div>';
    return;
  }

  // Get today's stats for current usage
  let todayStats = {};
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
    todayStats = response.data || {};
  } catch (e) {
    console.error('Error getting today stats for limits:', e);
  }

  container.innerHTML = activeLimits.map(([category, limit]) => {
    const info = categoriesInfo[category] || { icon: '📱', name: category };
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
    const enabled = limit.enabled !== false;

    // Calculate current usage for this limit
    let currentUsage = 0;
    const domains = todayStats.domains || {};
    const categories = todayStats.categories || {};
    
    if (limit.includeSites && limit.includeSites.length > 0) {
      // Site-specific limit
      limit.includeSites.forEach(site => {
        const siteLower = site.toLowerCase();
        Object.entries(domains).forEach(([domain, data]) => {
          if (domain.toLowerCase().includes(siteLower)) {
            currentUsage += data.time || 0;
          }
        });
      });
    } else if (limit.includeCategories && limit.includeCategories.length > 0) {
      // Category limit
      limit.includeCategories.forEach(cat => {
        if (categories[cat]) {
          currentUsage += categories[cat].time || 0;
        }
      });
    } else {
      // Single category (legacy)
      if (categories[category]) {
        currentUsage = categories[category].time || 0;
      }
    }

    const usagePercent = Math.min(100, (currentUsage / limit.dailyLimit) * 100);
    const currentTimeStr = formatTime(currentUsage);
    const isOverLimit = currentUsage >= limit.dailyLimit;
    const isNearLimit = usagePercent >= 80 && !isOverLimit;

    // Check for domains and categories in the limit
    const hasDomains = limit.includeSites && limit.includeSites.length > 0;
    const hasCategories = limit.includeCategories && limit.includeCategories.length > 0;
    let displayName, subLabel, iconHtml;

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
          // Find category for this domain from categoryDomainUsage
          Object.entries(categoryDomainUsage).forEach(([cat, domains]) => {
            if (domains[domain]) {
              const catInfo = categoriesInfo[cat];
              if (catInfo) categorySet.add(catInfo.name);
            }
          });
        });
      }

      // Generate icon(s) for domains - show favicons
      if (hasDomains) {
        if (domainParts.length === 1) {
          iconHtml = `<img class="active-limit-favicon" src="https://www.google.com/s2/favicons?domain=${domainParts[0]}&sz=32" alt="" onerror="this.style.display='none'">`;
        } else {
          // Show stacked favicons for multiple domains
          const faviconStack = domainParts.slice(0, 3).map((domain, idx) => 
            `<img class="active-limit-favicon stacked" style="z-index:${3-idx}; margin-left:${idx > 0 ? '-8px' : '0'}" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" onerror="this.style.display='none'">`
          ).join('');
          iconHtml = `<div class="active-limit-favicon-stack">${faviconStack}</div>`;
        }
      } else {
        // Category icon
        iconHtml = `<span class="active-limit-icon">${info.icon}</span>`;
      }

      // Format domain display: show first 2 items, then "+N more"
      if (domainParts.length === 1) {
        displayName = domainParts[0];
      } else if (domainParts.length === 2) {
        displayName = `${domainParts[0]}, ${domainParts[1]}`;
      } else if (domainParts.length > 2) {
        displayName = `${domainParts[0]}, ${domainParts[1]} <span class="active-limit-more">+${domainParts.length - 2} more</span>`;
      } else if (hasCategories) {
        // Only categories, no domains
        const catNames = Array.from(categorySet);
        if (catNames.length === 1) {
          displayName = catNames[0];
        } else if (catNames.length === 2) {
          displayName = `${catNames[0]}, ${catNames[1]}`;
        } else {
          displayName = `${catNames[0]}, ${catNames[1]} <span class="active-limit-more">+${catNames.length - 2} more</span>`;
        }
      }

      // Format category label: max 2 categories, then +n more
      const catNames = Array.from(categorySet);
      if (catNames.length === 0) {
        subLabel = '';
      } else if (catNames.length === 1) {
        subLabel = catNames[0];
      } else if (catNames.length === 2) {
        subLabel = `${catNames[0]}, ${catNames[1]}`;
      } else {
        subLabel = `${catNames[0]}, ${catNames[1]} <span class="active-limit-more">+${catNames.length - 2} more</span>`;
      }
    } else {
      displayName = info.name;
      subLabel = '';
      iconHtml = `<span class="active-limit-icon">${info.icon}</span>`;
    }

    // Calculate remaining time
    const remainingMs = Math.max(0, limit.dailyLimit - currentUsage);
    const remainingStr = remainingMs > 0 ? formatTime(remainingMs) : 'Over limit';
    
    // Visual status
    let statusClass = '';
    let statusText = '';
    if (isOverLimit) {
      statusClass = 'status-over';
      statusText = `Over by ${formatTime(currentUsage - limit.dailyLimit)}`;
    } else if (isNearLimit) {
      statusClass = 'status-warning';
      statusText = `${remainingStr} left`;
    } else {
      statusClass = 'status-ok';
      statusText = `${remainingStr} left`;
    }

    return `
      <div class="active-limit-item ${enabled ? '' : 'disabled'} ${isOverLimit ? 'over-limit' : ''} ${isNearLimit ? 'near-limit' : ''}" data-category="${category}">
        <div class="active-limit-header">
          ${iconHtml}
          <div class="active-limit-text">
            <span class="active-limit-name">${displayName}</span>
            ${subLabel && hasDomains ? `<span class="active-limit-category">${subLabel}</span>` : ''}
          </div>
          <div class="active-limit-actions">
            <label class="toggle toggle-small">
              <input type="checkbox" class="limit-toggle-checkbox" data-category="${category}" ${enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-icon limit-modify-btn" data-category="${category}" title="Modify">✎</button>
            <button class="btn-icon limit-delete-btn" data-category="${category}" title="Delete">✕</button>
          </div>
        </div>
        <div class="active-limit-visual">
          <div class="active-limit-bar-container">
            <div class="active-limit-bar-bg">
              <div class="active-limit-bar-fill ${statusClass}" style="width: ${Math.min(usagePercent, 100)}%"></div>
              ${isOverLimit ? `<div class="active-limit-bar-over" style="width: ${Math.min((currentUsage / limit.dailyLimit - 1) * 100, 50)}%"></div>` : ''}
            </div>
            <div class="active-limit-bar-marker" style="left: 100%"></div>
          </div>
          <div class="active-limit-stats">
            <span class="active-limit-current">${currentTimeStr}</span>
            <span class="active-limit-status ${statusClass}">${statusText}</span>
            <span class="active-limit-total">${timeStr}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCategoryDomains(category) {
  const domains = categoryDomainUsage[category] || {};
  const sortedDomains = Object.entries(domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedDomains.length === 0) {
    return '<div class="empty-domains-text">No sites tracked yet</div>';
  }

  return sortedDomains.map(([domain, time]) => {
    const timeStr = formatTime(time);
    return `
      <div class="top-site-item">
        <span class="top-site-name">${domain}</span>
        <span class="top-site-time">${timeStr}</span>
      </div>
    `;
  }).join('');
}

// Event delegation for active limits list
document.getElementById('activeLimitsList')?.addEventListener('click', (e) => {
  const target = e.target;

  // Handle modify button click
  if (target.classList.contains('limit-modify-btn')) {
    const category = target.dataset.category;
    openEditLimitModal(category);
  }

  // Handle delete button click
  if (target.classList.contains('limit-delete-btn')) {
    const category = target.dataset.category;
    if (confirm('Delete this limit?')) {
      chrome.runtime.sendMessage({ type: 'DELETE_LIMIT', category }).then(() => {
        delete categoryLimits[category];
        renderActiveLimits();
      });
    }
  }
});

document.getElementById('activeLimitsList')?.addEventListener('change', (e) => {
  const target = e.target;

  // Handle toggle checkbox change
  if (target.classList.contains('limit-toggle-checkbox')) {
    const category = target.dataset.category;
    const enabled = target.checked;
    toggleCategoryLimit(category, enabled);
  }
});

async function toggleCategoryLimit(category, enabled) {
  try {
    let limit = categoryLimits[category];
    if (!limit) {
      limit = {
        dailyLimit: 3600000,
        enabled: enabled,
        alertAt: 0.9,
        blockMethod: 'soft'
      };
    } else {
      limit = { ...limit, enabled };
    }

    await chrome.runtime.sendMessage({
      type: 'SET_LIMIT',
      category,
      limit
    });

    categoryLimits[category] = limit;
  } catch (error) {
    console.error('Error toggling category limit:', error);
  }
}

// Master toggle for limits
document.getElementById('limitsEnabled')?.addEventListener('change', async (e) => {
  limitsEnabled = e.target.checked;
  try {
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResponse.data || {};
    settings.limitsEnabled = limitsEnabled;

    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings
    });
  } catch (error) {
    console.error('Error saving limits enabled:', error);
  }
});

// ==================== GOALS MANAGEMENT ====================
let goals = [];
let editingGoalId = null;

async function loadGoals() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.data || {};
    goals = settings.goals || [];
    renderGoalsList();
    updateDashboardGoals();
    // Load achievements on Goals page
    await loadAchievements();
  } catch (error) {
    console.error('Error loading goals:', error);
  }
}

async function saveGoals() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.data || {};
    settings.goals = goals;
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  } catch (error) {
    console.error('Error saving goals:', error);
  }
}

function getGoalTypeInfo(type) {
  const types = {
    'productive': { name: 'Productive Time', icon: '💪', categories: ['productivity', 'education'] },
    'learning': { name: 'Learning', icon: '📚', categories: ['education'] },
    'limit_unproductive': { name: 'Limit Unproductive', icon: '🚫', categories: ['entertainment', 'social', 'games'] }
  };
  return types[type] || { name: type, icon: '🎯', categories: [] };
}

// Calculate 30-day average for a goal type's categories
async function calculate30DayAverage(goalType) {
  console.log('[Goal] Calculating 30-day average for:', goalType);
  const typeInfo = getGoalTypeInfo(goalType);
  const categories = typeInfo.categories;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Build date list for last 30 days
  const dates = [];
  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(formatDateLocal(date));
  }
  
  console.log('[Goal] Fetching stats for dates:', dates.slice(0, 3), '...');
  
  // Fetch all dates in parallel
  const results = await Promise.all(
    dates.map(dateStr => 
      chrome.runtime.sendMessage({ type: 'GET_DATE_STATS', date: dateStr })
        .catch(err => {
          console.error(`[Goal] Error fetching stats for ${dateStr}:`, err);
          return null;
        })
    )
  );
  
  let totalTime = 0;
  let validDays = 0;
  
  results.forEach((response) => {
    // Data structure: response.data.stats.categories or response.data.categories
    const cats = response?.data?.stats?.categories || response?.data?.categories;
    if (cats) {
      let dayTime = 0;
      categories.forEach(cat => {
        if (cats[cat]) {
          dayTime += cats[cat].time || 0;
        }
      });
      
      // Only count days with some activity
      if (dayTime > 0) {
        totalTime += dayTime;
        validDays++;
      }
    }
  });
  
  const avg = validDays > 0 ? Math.round(totalTime / validDays) : 0;
  console.log('[Goal] Average calculated:', avg, 'ms from', validDays, 'valid days');
  
  // Return average (or 0 if no data)
  return avg;
}

// Generate smart presets based on 30-day average
// isLimitGoal: for limit goals, show decrease options; for productive goals, show increase options
function generateSmartPresets(averageMs, isLimitGoal = false) {
  if (averageMs <= 0) {
    // Fallback to fixed presets if no data
    if (isLimitGoal) {
      // For limit goals: smaller defaults
      return [
        { label: '15m', ms: 15 * 60000, percent: null },
        { label: '30m', ms: 30 * 60000, percent: null },
        { label: '1h', ms: 60 * 60000, percent: null },
        { label: '1.5h', ms: 90 * 60000, percent: null },
        { label: '2h', ms: 120 * 60000, percent: null }
      ];
    } else {
      return [
        { label: '30m', ms: 30 * 60000, percent: null },
        { label: '1h', ms: 60 * 60000, percent: null },
        { label: '2h', ms: 120 * 60000, percent: null },
        { label: '3h', ms: 180 * 60000, percent: null },
        { label: '4h', ms: 240 * 60000, percent: null }
      ];
    }
  }
  
  // For productive goals: average and increase options (no decrease - you want MORE productive time)
  // For limit goals: decrease and average options (no increase - you want LESS unproductive time)
  let presets;
  if (isLimitGoal) {
    presets = [
      { percent: -30, multiplier: 0.70 },
      { percent: -20, multiplier: 0.80 },
      { percent: -10, multiplier: 0.90 },
      { percent: 0, multiplier: 1.0 },
      { percent: 10, multiplier: 1.10 }
    ];
  } else {
    presets = [
      { percent: -10, multiplier: 0.90 },
      { percent: 0, multiplier: 1.0 },
      { percent: 10, multiplier: 1.10 },
      { percent: 20, multiplier: 1.20 },
      { percent: 30, multiplier: 1.30 }
    ];
  }
  
  return presets.map(p => {
    const ms = Math.round(averageMs * p.multiplier);
    const hours = ms / 3600000;
    let label;
    
    if (hours < 1) {
      label = `${Math.round(ms / 60000)}m`;
    } else if (hours % 1 === 0) {
      label = `${Math.floor(hours)}h`;
    } else {
      label = `${hours.toFixed(1)}h`;
    }
    
    return {
      label,
      ms,
      percent: p.percent,
      isAverage: p.percent === 0
    };
  });
}

// Format time for preset display (compact)
function formatPresetTime(ms) {
  const hours = ms / 3600000;
  if (hours < 1) {
    return `${Math.round(ms / 60000)}m`;
  } else if (hours % 0.5 === 0) {
    return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
  return `${hours.toFixed(1)}h`;
}

// Render smart presets in the modal
function renderSmartPresets(presets, currentMs = null) {
  const container = document.getElementById('goalTimePresets');
  if (!container) return;
  
  container.innerHTML = presets.map(preset => {
    const isActive = currentMs !== null && Math.abs(preset.ms - currentMs) < 60000; // Within 1 minute tolerance
    const percentLabel = preset.percent !== null 
      ? (preset.percent === 0 ? 'avg' : `${preset.percent > 0 ? '+' : ''}${preset.percent}%`)
      : '';
    
    return `
      <button type="button" class="preset-btn ${preset.isAverage ? 'average' : ''} ${isActive ? 'active' : ''}" 
              data-ms="${preset.ms}">
        <span class="preset-time">${preset.label}</span>
        ${percentLabel ? `<span class="preset-percent">${percentLabel}</span>` : ''}
      </button>
    `;
  }).join('');
}

async function renderGoalsList() {
  const container = document.getElementById('goalsList');
  if (!container) return;

  if (goals.length === 0) {
    container.innerHTML = '<div class="goals-empty">No goals set yet. Add your first goal!</div>';
    return;
  }

  // Get current stats for progress visualization
  let todayStats = null;
  let weekStats = null;
  try {
    const [todayResponse, weekResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' }),
      chrome.runtime.sendMessage({ type: 'GET_WEEKLY_STATS' })
    ]);
    todayStats = todayResponse.data;
    weekStats = weekResponse.data;
  } catch (error) {
    console.error('Error getting stats for goals list:', error);
  }

  container.innerHTML = goals.map((goal, index) => {
    const typeInfo = getGoalTypeInfo(goal.type);
    const comparison = goal.comparison === 'min' ? 'At least' : 'At most';
    const targetTime = formatTime(goal.targetTime);
    const frequency = goal.frequency === 'daily' ? 'Daily' : 'Weekly';

    // Check if today is an active day for this goal
    const today = new Date().getDay();
    const activeDays = goal.activeDays || [0, 1, 2, 3, 4, 5, 6];
    const isActiveToday = activeDays.includes(today);

    // Calculate current progress
    let currentTime = 0;
    const stats = goal.frequency === 'daily' ? todayStats : weekStats;
    if (stats && isActiveToday) {
      const categories = goal.frequency === 'daily' 
        ? (stats.categories || {}) 
        : (stats.weeklyCategories || {});
      typeInfo.categories.forEach(cat => {
        if (categories[cat]) {
          currentTime += categories[cat].time || 0;
        }
      });
    }

    const progress = goal.targetTime > 0 ? Math.min((currentTime / goal.targetTime) * 100, 100) : 0;
    const isAchieved = goal.comparison === 'min' ? currentTime >= goal.targetTime : currentTime <= goal.targetTime;
    const isOverLimit = goal.comparison === 'max' && currentTime > goal.targetTime;
    const statusClass = isAchieved ? 'achieved' : (isOverLimit ? 'over-limit' : 'in-progress');

    // Progress bar color - use accent color from CSS variable
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8BAF5B';
    let progressBarColor = accentColor;
    if (goal.comparison === 'max') {
      if (progress >= 100) progressBarColor = '#FF3B30';
      else if (progress >= 80) progressBarColor = '#FF9500';
      else progressBarColor = '#34C759';
    } else {
      if (isAchieved) progressBarColor = '#34C759';
    }

    // Circular progress calculation
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(progress, 100) / 100) * circumference;

    // Generate activity blocks (last 12 weeks for weekly, last 8 weeks for daily)
    const activityBlocksHtml = generateActivityBlocks(goal, typeInfo);
    
    // Format created date
    const createdAt = goal.createdAt ? new Date(goal.createdAt) : null;
    const createdDateStr = createdAt ? `Since ${createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
    
    // Calculate streak
    const streak = calculateGoalStreak(goal, typeInfo);
    
    // Format active days display
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDaysStr = activeDays.length === 7 ? 'Every day' : activeDays.map(d => dayNames[d]).join(', ');

    return `
      <div class="goal-item ${statusClass}${!isActiveToday ? ' inactive-today' : ''}" data-goal-id="${index}">
        <div class="goal-item-left">
          <div class="goal-item-progress">
            <svg class="goal-item-ring" viewBox="0 0 80 80">
              <circle class="goal-item-ring-bg" cx="40" cy="40" r="${radius}" />
              <circle class="goal-item-ring-fill" cx="40" cy="40" r="${radius}"
                stroke="${progressBarColor}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${strokeDashoffset}"
                transform="rotate(-90 40 40)" />
            </svg>
            <div class="goal-item-percent">${Math.round(progress)}%</div>
          </div>
          <div class="goal-item-details">
            <div class="goal-item-header">
              <span class="goal-item-icon">${typeInfo.icon}</span>
              <span class="goal-item-title">${typeInfo.name}</span>
              <span class="goal-item-frequency-badge">${frequency}</span>
              ${streak > 0 ? `<span class="goal-item-streak">🔥 ${streak}</span>` : ''}
            </div>
            <div class="goal-item-stats">
              <span class="goal-item-current">${formatTime(currentTime)}</span>
              <span class="goal-item-separator">/</span>
              <span class="goal-item-target">${comparison} ${targetTime}</span>
            </div>
            <div class="goal-item-meta">
              ${!isActiveToday ? '<span class="goal-item-inactive">Not active today</span>' : 
                `<span class="goal-item-status ${statusClass}">${isAchieved ? 'Achieved!' : (isOverLimit ? 'Over Limit!' : `${formatTime(Math.max(0, goal.targetTime - currentTime))} left`)}</span>`}
            </div>
          </div>
        </div>
        <div class="goal-item-right">
          <div class="goal-activity-calendar">
            ${activityBlocksHtml}
          </div>
          <div class="goal-actions">
            <button class="btn-icon goal-edit-btn" data-goal-id="${index}" title="Edit">✏️</button>
            <button class="btn-icon goal-delete-btn" data-goal-id="${index}" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Generate activity calendar (8 weeks grid) with day labels and legend
function generateActivityBlocks(goal, typeInfo) {
  const history = goal.history || {};
  const activeDays = goal.activeDays || [0, 1, 2, 3, 4, 5, 6];
  const blocks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Generate 8 weeks (56 days) in a calendar grid
  const numWeeks = 8;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (numWeeks * 7) + 1);
  
  // Adjust to start from Sunday
  const startDayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDayOfWeek);
  
  // Day labels (only M, W, F for compact display)
  const dayLabels = ['', 'M', '', 'W', '', 'F', ''];
  
  for (let week = 0; week < numWeeks; week++) {
    for (let day = 0; day < 7; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + (week * 7) + day);
      
      const dateKey = formatDateLocal(currentDate);
      const dayOfWeek = currentDate.getDay();
      const isActive = activeDays.includes(dayOfWeek);
      const isFuture = currentDate > today;
      const isToday = dateKey === formatDateLocal(today);
      const isBeforeCreated = goal.createdAt && currentDate < new Date(goal.createdAt);
      
      let level = 0;
      let percent = 0;
      
      if (!isFuture && !isBeforeCreated && isActive) {
        const historyEntry = history[dateKey];
        if (historyEntry) {
          percent = Math.round(historyEntry.progress || 0);
          if (goal.comparison === 'min') {
            if (percent >= 100) level = 4;
            else if (percent >= 75) level = 3;
            else if (percent >= 50) level = 2;
            else if (percent > 0) level = 1;
          } else {
            if (percent <= 50) level = 4;
            else if (percent <= 75) level = 3;
            else if (percent <= 100) level = 2;
            else level = 1;
          }
        }
      }
      
      let blockClass = 'level-0';
      if (isFuture) blockClass = 'future';
      else if (isBeforeCreated) blockClass = 'before-created';
      else if (!isActive) blockClass = 'inactive';
      else blockClass = `level-${level}`;
      
      const todayClass = isToday ? ' today' : '';
      
      blocks.push(`<div class="cal-cell ${blockClass}${todayClass}" title="${dateKey}: ${percent}%"></div>`);
    }
  }
  
  // Build the complete calendar HTML with labels and legend
  const dayLabelsHtml = dayLabels.map(label => 
    `<div class="cal-day-label">${label}</div>`
  ).join('');
  
  const isLimitGoal = goal.comparison === 'max';
  const legendHtml = `
    <div class="cal-legend">
      <span class="cal-legend-label">${isLimitGoal ? 'More' : 'Less'}</span>
      <div class="cal-legend-cells">
        <div class="cal-cell level-0"></div>
        <div class="cal-cell level-1"></div>
        <div class="cal-cell level-2"></div>
        <div class="cal-cell level-3"></div>
        <div class="cal-cell level-4"></div>
      </div>
      <span class="cal-legend-label">${isLimitGoal ? 'Less' : 'More'}</span>
    </div>
  `;
  
  return `
    <div class="cal-wrapper">
      <div class="cal-day-labels">${dayLabelsHtml}</div>
      <div class="cal-grid">${blocks.join('')}</div>
    </div>
    ${legendHtml}
  `;
}

// Calculate current streak for a goal
function calculateGoalStreak(goal, typeInfo) {
  const history = goal.history || {};
  const activeDays = goal.activeDays || [0, 1, 2, 3, 4, 5, 6];
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Start from yesterday (today might not be complete yet)
  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1);
  
  while (true) {
    const dateKey = formatDateLocal(checkDate);
    const dayOfWeek = checkDate.getDay();
    
    // Skip inactive days
    if (!activeDays.includes(dayOfWeek)) {
      checkDate.setDate(checkDate.getDate() - 1);
      continue;
    }
    
    // Stop if before goal creation
    if (goal.createdAt && checkDate < new Date(goal.createdAt)) break;
    
    const historyEntry = history[dateKey];
    if (!historyEntry) break;
    
    const isAchieved = goal.comparison === 'min' 
      ? historyEntry.progress >= 100 
      : historyEntry.progress <= 100;
    
    if (isAchieved) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
    
    // Safety limit
    if (streak > 365) break;
  }
  
  return streak;
}

async function updateDashboardGoals() {
  const todayContainer = document.getElementById('todayGoalsDisplay');
  const weekContainer = document.getElementById('weekGoalsDisplay');

  if (!todayContainer && !weekContainer) return;

  // Get current stats
  let todayStats = null;
  let weekStats = null;

  try {
    const todayResponse = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
    todayStats = todayResponse.data;

    const weekResponse = await chrome.runtime.sendMessage({ type: 'GET_WEEKLY_STATS' });
    weekStats = weekResponse.data;
  } catch (error) {
    console.error('Error getting stats for goals:', error);
  }

  // Update goal history for today (for daily goals)
  await updateGoalHistory(todayStats);

  // Filter and render daily goals
  const dailyGoals = goals.filter(g => g.frequency === 'daily');
  const weeklyGoals = goals.filter(g => g.frequency === 'weekly');

  if (todayContainer) {
    if (dailyGoals.length === 0) {
      todayContainer.innerHTML = '<div class="goals-empty">No daily goals. <a href="#" class="goals-add-link" data-page="goals">Add a goal</a></div>';
    } else {
      todayContainer.innerHTML = dailyGoals.map(goal => renderGoalCard(goal, todayStats, 'daily')).join('');
    }
  }

  if (weekContainer) {
    if (weeklyGoals.length === 0) {
      weekContainer.innerHTML = '<div class="goals-empty">No weekly goals. <a href="#" class="goals-add-link" data-page="goals">Add a goal</a></div>';
    } else {
      weekContainer.innerHTML = weeklyGoals.map(goal => renderGoalCard(goal, weekStats, 'weekly')).join('');
    }
  }
}

// Track which goals have been notified today
const notifiedGoals = new Set();

// Update goal history with today's progress
async function updateGoalHistory(todayStats) {
  if (!todayStats || goals.length === 0) return;

  const todayKey = getTodayDate();
  const today = new Date().getDay();
  let hasChanges = false;

  for (const goal of goals) {
    if (goal.frequency !== 'daily') continue;

    const activeDays = goal.activeDays || [0, 1, 2, 3, 4, 5, 6];
    if (!activeDays.includes(today)) continue;

    const typeInfo = getGoalTypeInfo(goal.type);
    let currentTime = 0;
    const categories = todayStats.categories || {};
    
    typeInfo.categories.forEach(cat => {
      if (categories[cat]) {
        currentTime += categories[cat].time || 0;
      }
    });

    const progress = goal.targetTime > 0 ? (currentTime / goal.targetTime) * 100 : 0;
    
    // Check if goal is newly achieved
    const wasAchieved = goal.history?.[todayKey]?.progress >= 100;
    const isNowAchieved = checkGoalAchieved(goal, currentTime);
    const goalKey = `${goal.type}-${goal.targetTime}-${todayKey}`;
    
    if (isNowAchieved && !wasAchieved && !notifiedGoals.has(goalKey)) {
      // Goal just achieved! Send notification
      notifiedGoals.add(goalKey);
      try {
        await chrome.runtime.sendMessage({
          type: 'GOAL_ACHIEVED',
          goal: goal
        });
      } catch (e) {
        console.debug('Could not send goal notification:', e);
      }
    }

    // Initialize history if not exists
    if (!goal.history) {
      goal.history = {};
    }

    // Update today's history
    goal.history[todayKey] = {
      progress: progress,
      time: currentTime,
      target: goal.targetTime,
      achieved: isNowAchieved,
      updatedAt: Date.now()
    };

    hasChanges = true;
  }

  // Save updated goals if there were changes
  if (hasChanges) {
    await saveGoals();
  }
}

// Check if a goal is achieved based on type
function checkGoalAchieved(goal, currentTime) {
  if (goal.type === 'limit_unproductive') {
    // For limit goals: achieved if under the limit
    return currentTime <= goal.targetTime;
  } else {
    // For productive/learning goals: achieved if reached the target
    return currentTime >= goal.targetTime;
  }
}

function renderGoalCard(goal, stats, period) {
  const typeInfo = getGoalTypeInfo(goal.type);
  
  // Check if today is an active day for this goal
  const today = new Date().getDay();
  const activeDays = goal.activeDays || [0, 1, 2, 3, 4, 5, 6];
  const isActiveToday = period === 'weekly' || activeDays.includes(today);
  
  let currentTime = 0;

  if (stats && isActiveToday) {
    const categories = period === 'daily'
      ? (stats.categories || {})
      : (stats.weeklyCategories || {});

    typeInfo.categories.forEach(cat => {
      if (categories[cat]) {
        currentTime += categories[cat].time || 0;
      }
    });
  }

  const progress = goal.targetTime > 0 ? Math.min((currentTime / goal.targetTime) * 100, 100) : 0;
  const isAchieved = goal.comparison === 'min'
    ? currentTime >= goal.targetTime
    : currentTime <= goal.targetTime;

  // For "limit" goals, check if over limit
  const isOverLimit = goal.comparison === 'max' && currentTime > goal.targetTime;
  
  const statusClass = isAchieved ? 'achieved' : (isOverLimit ? 'over-limit' : 'in-progress');
  
  // Progress bar color based on goal type and status - use accent color
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8BAF5B';
  let progressBarColor = accentColor; // Use accent color
  if (goal.comparison === 'max') {
    // For limit goals: green when under, yellow when approaching, red when over
    if (progress >= 100) {
      progressBarColor = '#FF3B30'; // Red - over limit
    } else if (progress >= 80) {
      progressBarColor = '#FF9500'; // Orange - approaching limit
    } else {
      progressBarColor = '#34C759'; // Green - safely under
    }
  } else {
    // For minimum goals: show progress toward achievement
    if (isAchieved) {
      progressBarColor = '#34C759'; // Green - achieved
    }
  }

  // Calculate stroke dash for circular progress (circumference = 2 * PI * radius)
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return `
    <div class="goal-card ${statusClass}">
      <div class="goal-card-content">
        <div class="goal-circular-progress">
          <svg class="goal-progress-ring" viewBox="0 0 100 100">
            <circle class="goal-progress-bg" cx="50" cy="50" r="${radius}" />
            <circle class="goal-progress-circle" cx="50" cy="50" r="${radius}" 
              stroke="${progressBarColor}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${strokeDashoffset}"
              transform="rotate(-90 50 50)" />
          </svg>
          <div class="goal-progress-center">
            <span class="goal-progress-percent">${Math.round(progress)}%</span>
          </div>
        </div>
        <div class="goal-card-details">
          <div class="goal-card-header">
            <span class="goal-card-icon">${typeInfo.icon}</span>
            <span class="goal-card-title">${typeInfo.name}</span>
          </div>
          <div class="goal-card-times">
            <div class="goal-time-current">${formatTime(currentTime)}</div>
            <div class="goal-time-target">/ ${formatTime(goal.targetTime)}</div>
          </div>
          <div class="goal-card-status ${isActiveToday ? statusClass : 'inactive'}">
            ${!isActiveToday ? 'Not active today' : (isAchieved ? 'Achieved!' : (isOverLimit ? 'Over Limit' : `${formatTime(goal.targetTime - currentTime)} left`))}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Store current averages for each goal type
let goalTypeAverages = {};

async function openGoalModal(goalId = null) {
  const modal = document.getElementById('addGoalModal');
  const title = document.getElementById('goalModalTitle');

  editingGoalId = goalId;

  if (goalId !== null && goals[goalId]) {
    const goal = goals[goalId];
    title.textContent = 'Edit Goal';
    
    // Set goal type pill (setTimeToAvg=false to keep existing time)
    await setGoalTypePill(goal.type, false);
    
    // Set comparison toggle
    setGoalComparisonToggle(goal.comparison);
    
    // Set time (existing goal's time)
    const hours = Math.floor(goal.targetTime / 3600000);
    const minutes = Math.floor((goal.targetTime % 3600000) / 60000);
    setGoalTime(hours, minutes);
    
    // Update presets to show current time as active
    updateSmartPresetsActive(goal.targetTime);
    
    // Set active days
    const activeDays = goal.activeDays || [0, 1, 2, 3, 4, 5, 6];
    document.querySelectorAll('#goalDayCircles .day-circle').forEach(btn => {
      const day = parseInt(btn.dataset.day);
      btn.classList.toggle('active', activeDays.includes(day));
    });
  } else {
    title.textContent = 'Add Goal';
    
    // Reset to defaults (setTimeToAvg=true to set time to average)
    await setGoalTypePill('productive', true);
    setGoalComparisonToggle('min');
    
    // Reset all days to active
    document.querySelectorAll('#goalDayCircles .day-circle').forEach(btn => {
      btn.classList.add('active');
    });
  }

  modal.classList.add('active');
}

// Update smart presets to mark current time as active
function updateSmartPresetsActive(currentMs) {
  document.querySelectorAll('#goalTimePresets .preset-btn').forEach(btn => {
    const presetMs = parseInt(btn.dataset.ms);
    const isActive = Math.abs(presetMs - currentMs) < 60000; // Within 1 minute
    btn.classList.toggle('active', isActive);
  });
}

// Helper functions for new UI
// setTimeToAvg: when true, auto-set time to average (for Add mode or switching type)
async function setGoalTypePill(type, setTimeToAvg = true) {
  document.getElementById('goalType').value = type;
  document.querySelectorAll('#goalTypePills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === type);
  });
  
  // Auto-select and disable comparison based on goal type
  const comparisonToggle = document.getElementById('goalComparisonToggle');
  const minBtn = comparisonToggle?.querySelector('[data-value="min"]');
  const maxBtn = comparisonToggle?.querySelector('[data-value="max"]');
  
  if (type === 'limit_unproductive') {
    // Limit goals: "At most" only
    setGoalComparisonToggle('max');
    minBtn?.classList.add('disabled');
    maxBtn?.classList.remove('disabled');
  } else {
    // Productive/Learning goals: "At least" only
    setGoalComparisonToggle('min');
    minBtn?.classList.remove('disabled');
    maxBtn?.classList.add('disabled');
  }
  
  // Calculate 30-day average and render smart presets
  await loadSmartPresetsForType(type, setTimeToAvg);
}

// Load smart presets based on 30-day average for the goal type
// If setTimeToAvg is true, also set the time input to the average value
async function loadSmartPresetsForType(type, setTimeToAvg = false) {
  const container = document.getElementById('goalTimePresets');
  const avgInfoBox = document.getElementById('goalAvgInfo');
  const avgValueEl = document.getElementById('goalAvgValue');
  if (!container) return;
  
  // Show loading state
  container.innerHTML = '<div class="presets-loading">Loading...</div>';
  if (avgValueEl) avgValueEl.textContent = 'calculating...';
  if (avgInfoBox) avgInfoBox.classList.remove('no-data');
  
  try {
    // Check cache first
    if (goalTypeAverages[type] === undefined) {
      goalTypeAverages[type] = await calculate30DayAverage(type);
    }
    
    const avgMs = goalTypeAverages[type];
    
    // Update average info display
    if (avgValueEl) {
      if (avgMs > 0) {
        avgValueEl.textContent = formatTime(avgMs);
      } else {
        avgValueEl.textContent = 'No data yet';
        if (avgInfoBox) avgInfoBox.classList.add('no-data');
      }
    }
    
    // Generate presets based on goal type
    const isLimitGoal = type === 'limit_unproductive';
    const presets = generateSmartPresets(avgMs, isLimitGoal);
    
    // Set time to average if requested (when switching goal type)
    if (setTimeToAvg && avgMs > 0) {
      // Round to nearest 15 minutes
      const roundedMs = Math.round(avgMs / (15 * 60000)) * (15 * 60000);
      const finalMs = roundedMs > 0 ? roundedMs : 15 * 60000; // minimum 15min
      const hours = Math.floor(finalMs / 3600000);
      const minutes = Math.floor((finalMs % 3600000) / 60000);
      setGoalTime(hours, minutes);
      renderSmartPresets(presets, finalMs);
    } else if (setTimeToAvg && avgMs === 0) {
      // No data, set default 2h for productive, 1h for limit
      const defaultMs = isLimitGoal ? 3600000 : 7200000;
      const hours = Math.floor(defaultMs / 3600000);
      const minutes = Math.floor((defaultMs % 3600000) / 60000);
      setGoalTime(hours, minutes);
      renderSmartPresets(presets, defaultMs);
    } else {
      // Keep current time value
      const hours = parseInt(document.getElementById('goalHours')?.value) || 0;
      const minutes = parseInt(document.getElementById('goalMinutes')?.value) || 0;
      const currentMs = (hours * 3600000) + (minutes * 60000);
      renderSmartPresets(presets, currentMs);
    }
  } catch (error) {
    console.error('Error loading smart presets:', error);
    // Fallback to default presets
    const presets = generateSmartPresets(0, false);
    renderSmartPresets(presets, null);
  }
}

function setGoalComparisonToggle(comparison) {
  document.getElementById('goalComparison').value = comparison;
  document.querySelectorAll('#goalComparisonToggle .toggle-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === comparison);
  });
}

function setGoalTime(hours, minutes) {
  document.getElementById('goalHours').value = hours;
  document.getElementById('goalMinutes').value = minutes;
  updateGoalTimeDisplay();
  updateGoalTimePresets();
}

function updateGoalTimeDisplay() {
  const hours = parseInt(document.getElementById('goalHours').value) || 0;
  const minutes = parseInt(document.getElementById('goalMinutes').value) || 0;
  const display = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  document.getElementById('goalTimeDisplay').textContent = display;
}

function updateGoalTimePresets() {
  const hours = parseInt(document.getElementById('goalHours').value) || 0;
  const minutes = parseInt(document.getElementById('goalMinutes').value) || 0;
  const currentMs = (hours * 3600000) + (minutes * 60000);
  
  document.querySelectorAll('#goalTimePresets .preset-btn').forEach(btn => {
    const presetMs = parseInt(btn.dataset.ms) || 0;
    // Within 1 minute tolerance
    btn.classList.toggle('active', Math.abs(presetMs - currentMs) < 60000);
  });
}

function closeGoalModal() {
  const modal = document.getElementById('addGoalModal');
  modal.classList.remove('active');
  editingGoalId = null;
}

async function saveGoal() {
  const type = document.getElementById('goalType').value;
  const comparison = document.getElementById('goalComparison').value;
  const hours = parseInt(document.getElementById('goalHours').value) || 0;
  const minutes = parseInt(document.getElementById('goalMinutes').value) || 0;

  const targetTime = (hours * 3600000) + (minutes * 60000);

  if (targetTime <= 0) {
    alert('Please set a valid target time.');
    return;
  }

  // Check for duplicate type (only when adding new goal)
  if (editingGoalId === null) {
    const existingGoal = goals.find(g => g.type === type);
    if (existingGoal) {
      alert(`You already have a "${getGoalTypeInfo(type).name}" goal. Please edit the existing one instead.`);
      return;
    }
  }

  // Get selected active days from day circles
  const activeDays = Array.from(document.querySelectorAll('#goalDayCircles .day-circle.active')).map(btn => parseInt(btn.dataset.day));

  if (activeDays.length === 0) {
    alert('Please select at least one day.');
    return;
  }

  const goal = { 
    type, 
    comparison, 
    targetTime, 
    frequency: 'daily',
    activeDays,
    createdAt: editingGoalId !== null ? (goals[editingGoalId].createdAt || Date.now()) : Date.now(),
    history: editingGoalId !== null ? (goals[editingGoalId].history || {}) : {}
  };

  if (editingGoalId !== null) {
    goals[editingGoalId] = goal;
  } else {
    goals.push(goal);
  }

  await saveGoals();
  renderGoalsList();
  updateDashboardGoals();
  closeGoalModal();
}

async function deleteGoal(goalId) {
  if (!confirm('Are you sure you want to delete this goal?')) return;

  goals.splice(goalId, 1);
  await saveGoals();
  renderGoalsList();
  updateDashboardGoals();
}

// Goal event listeners
document.getElementById('addGoalBtn')?.addEventListener('click', () => openGoalModal());
document.getElementById('addGoalModalClose')?.addEventListener('click', closeGoalModal);
document.getElementById('goalCancelBtn')?.addEventListener('click', closeGoalModal);
document.getElementById('goalSaveBtn')?.addEventListener('click', saveGoal);

// Close modal on overlay click
document.getElementById('addGoalModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'addGoalModal') closeGoalModal();
});

// Goal Type Pills
document.getElementById('goalTypePills')?.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill-btn');
  if (pill) {
    setGoalTypePill(pill.dataset.value);
  }
});

// Goal Comparison Toggle
document.getElementById('goalComparisonToggle')?.addEventListener('click', (e) => {
  const pill = e.target.closest('.toggle-pill');
  if (pill && !pill.classList.contains('disabled')) {
    setGoalComparisonToggle(pill.dataset.value);
  }
});

// Goal Time Presets
document.getElementById('goalTimePresets')?.addEventListener('click', (e) => {
  const preset = e.target.closest('.preset-btn');
  if (preset) {
    const ms = parseInt(preset.dataset.ms);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    setGoalTime(hours, minutes);
    
    // Update active state for all presets
    document.querySelectorAll('#goalTimePresets .preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn === preset);
    });
  }
});

// Goal Time Adjust Buttons
document.getElementById('goalTimeDecrease')?.addEventListener('click', () => {
  let hours = parseInt(document.getElementById('goalHours').value) || 0;
  let minutes = parseInt(document.getElementById('goalMinutes').value) || 0;
  let totalMinutes = hours * 60 + minutes;
  // Round down to previous 15-minute mark
  totalMinutes = Math.floor((totalMinutes - 1) / 15) * 15;
  if (totalMinutes < 15) totalMinutes = 15;
  setGoalTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
});

document.getElementById('goalTimeIncrease')?.addEventListener('click', () => {
  let hours = parseInt(document.getElementById('goalHours').value) || 0;
  let minutes = parseInt(document.getElementById('goalMinutes').value) || 0;
  let totalMinutes = hours * 60 + minutes;
  // Round up to next 15-minute mark
  totalMinutes = Math.ceil((totalMinutes + 1) / 15) * 15;
  if (totalMinutes > 720) totalMinutes = 720; // Max 12 hours
  setGoalTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
});

// Goal Day Circles
document.getElementById('goalDayCircles')?.addEventListener('click', (e) => {
  const dayCircle = e.target.closest('.day-circle');
  if (dayCircle) {
    dayCircle.classList.toggle('active');
  }
});

document.getElementById('goalsList')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.goal-edit-btn');
  const deleteBtn = e.target.closest('.goal-delete-btn');

  if (editBtn) {
    const goalId = parseInt(editBtn.dataset.goalId);
    openGoalModal(goalId);
  } else if (deleteBtn) {
    const goalId = parseInt(deleteBtn.dataset.goalId);
    deleteGoal(goalId);
  }
});

// Goals add link in dashboard
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('goals-add-link')) {
    e.preventDefault();
    const page = e.target.dataset.page;
    if (page) {
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
      });
      document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === page + 'Page');
      });
      loadGoals();
    }
  }
});

// Today navigation state
let currentTodayDate = getTodayDate();

// Today navigation buttons
document.getElementById('todayPrevBtn').addEventListener('click', () => {
  stopRealTimeUpdates();
  const date = new Date(currentTodayDate);
  date.setDate(date.getDate() - 1);
  currentTodayDate = formatDateLocal(date);
  loadTodayData(currentTodayDate);
  updateTodayTitle();
  updateTodayNextButton();
  // Only start real-time updates if viewing today
  if (currentTodayDate === getTodayDate()) {
    startRealTimeUpdates();
  }
});

document.getElementById('todayNextBtn').addEventListener('click', () => {
  stopRealTimeUpdates();
  const date = new Date(currentTodayDate);
  date.setDate(date.getDate() + 1);
  currentTodayDate = formatDateLocal(date);
  loadTodayData(currentTodayDate);
  updateTodayTitle();
  updateTodayNextButton();
  // Only start real-time updates if viewing today
  if (currentTodayDate === getTodayDate()) {
    startRealTimeUpdates();
  }
});

function updateTodayTitle() {
  const title = document.getElementById('todayTitle');
  const today = getTodayDate();

  // Calculate yesterday's date
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatDateLocal(yesterdayDate);

  if (currentTodayDate === today) {
    title.textContent = `${currentTodayDate} (Today)`;
  } else if (currentTodayDate === yesterday) {
    title.textContent = `${currentTodayDate} (Yesterday)`;
  } else {
    title.textContent = currentTodayDate;
  }
}

function updateTodayNextButton() {
  const nextBtn = document.getElementById('todayNextBtn');
  const today = getTodayDate();
  nextBtn.disabled = (currentTodayDate >= today);
}

// Week navigation state
let weekType = 'week'; // 'weekend' or 'week'
let weekOffset = 0; // -1 = last, 0 = this, 1 = next, etc.
let selectedWeekDate = null; // Currently selected date in week view
let chartColorMode = 'categories'; // 'categories', 'subcategories', or 'productivity' - shared between tabs
let currentWeekDailyStats = []; // Store current week data for re-rendering

// Week navigation buttons
document.getElementById('weekPrevBtn').addEventListener('click', () => {
  weekOffset--;
  loadWeekData();
  updateWeekNextButton();
});

document.getElementById('weekNextBtn').addEventListener('click', () => {
  if (weekOffset >= 0) return; // Don't go to future weeks
  weekOffset++;
  loadWeekData();
  updateWeekNextButton();
});

function updateWeekNextButton() {
  const nextBtn = document.getElementById('weekNextBtn');
  nextBtn.disabled = (weekOffset >= 0);
}

// Load initial data
(async () => {
  await loadWeekStartDay();
  updateTodayTitle();
  updateTodayNextButton();
  updateWeekNextButton();

  // Load goals first so they're available for dashboard display
  await loadGoalsData();

  // Load today data first (visible tab)
  await loadTabData('today');

  // Pre-load week data in background to prevent flicker on first switch
  preloadWeekData();
})();

/**
 * Load goals data from settings (separate from UI rendering)
 */
async function loadGoalsData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.data || {};
    goals = settings.goals || [];
  } catch (error) {
    console.error('Error loading goals data:', error);
    goals = [];
  }
}

/**
 * Pre-load week data in background (without displaying)
 */
async function preloadWeekData() {
  try {
    const { dates } = getDateRange();
    const dailyStats = await Promise.all(
      dates.map(async (date) => {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_DATE_STATS',
          date
        });
        return {
          date,
          ...(response.data?.stats || {}),
          categories: response.data?.stats?.categories || {}
        };
      })
    );

    const weeklyStats = aggregateWeeklyStats(dailyStats);
    const weekProductivityStats = calculateProductivityStats(weeklyStats.weeklyCategories);

    // Store week's productivity values for smooth animation on first switch
    if (previousDonutValues['week'].productive === 0 &&
        previousDonutValues['week'].unproductive === 0 &&
        previousDonutValues['week'].neutral === 0) {
      previousDonutValues['week'] = {
        productive: weekProductivityStats.productive,
        unproductive: weekProductivityStats.unproductive,
        neutral: weekProductivityStats.neutral
      };
    }
  } catch (error) {
    // Silently fail - week data will load normally when tab is switched
    console.debug('Week data preload skipped:', error);
  }
}

/**
 * Load data for a specific tab
 */
async function loadTabData(tabName) {
  // Stop real-time updates when switching tabs
  stopRealTimeUpdates();

  switch (tabName) {
    case 'today':
      await loadTodayData(currentTodayDate);
      // Start real-time updates if viewing today
      if (currentTodayDate === getTodayDate()) {
        startRealTimeUpdates();
      }
      break;
    case 'week':
      await loadWeekData();
      break;
  }
}

/**
 * Load today's data
 */
async function loadTodayData(date = null) {
  try {
    // Use provided date or today
    const targetDate = date || getTodayDate();
    const isToday = targetDate === getTodayDate();

    let stats, sessions;

    if (isToday) {
      // For today, use GET_TODAY_STATS to include current session
      const response = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
      stats = response.data || {};

      // Get sessions separately for today
      const sessionsResponse = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date: targetDate
      });
      sessions = sessionsResponse.data.sessions || [];
    } else {
      // For past dates, use GET_DATE_STATS
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date: targetDate
      });
      stats = response.data.stats || {};
      sessions = response.data.sessions || [];
    }

    // Get categories info
    const categoriesResponse = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    const categoriesInfo = categoriesResponse.data;

    // Get week data for overview chart
    const weekData = await getWeekDataForDate(targetDate);

    // Update total usage display above graph
    const todayChartTotal = document.getElementById('todayChartTotal');
    if (todayChartTotal) {
      todayChartTotal.textContent = formatTime(stats.totalTime || 0);
    }

    // Display data
    displayTodayWeekOverview(weekData, targetDate, categoriesInfo);
    displayTodayHourlyBreakdown(sessions, stats, targetDate, categoriesInfo);

    // Calculate and display productivity score with yesterday comparison
    const productivityStats = calculateProductivityStats(stats.categories || {});

    // Get yesterday's productivity score for comparison
    let yesterdayScore = null;
    try {
      const yesterdayDate = new Date(targetDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = formatDateLocal(yesterdayDate);
      const yesterdayResponse = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date: yesterdayStr
      });
      if (yesterdayResponse?.data?.stats?.categories) {
        const yesterdayProductivity = calculateProductivityStats(yesterdayResponse.data.stats.categories);
        yesterdayScore = yesterdayProductivity.score;
      }
    } catch (e) {
      console.error('Error getting yesterday stats:', e);
    }

    // Calculate subcategory statistics from sessions
    calculateSubcategoryStats(stats.categories || {}, sessions);

    // Extract topSites from categories for tooltip display
    const todayTopSites = extractTopSitesFromCategories(stats.categories || {}, stats.domains || {});

    displayProductivityScore(productivityStats, 'today', yesterdayScore, todayTopSites);

    displayTodayCategories(stats.categories || {}, categoriesInfo, stats.totalTime || 0, stats.domains || {});
    await displayTodayMostUsed(sessions, stats, categoriesInfo, stats.totalTime || 0, stats.categories || {});

    // Populate usage stats with comparison
    displayUsageStats(stats, sessions, categoriesInfo, targetDate);

    // Update goals display
    updateDashboardGoals();

  } catch (error) {
    console.error('Error loading today data:', error);
  }
}

/**
 * Display usage stats with comparison to previous period
 */
async function displayUsageStats(stats, sessions, categoriesInfo, currentDate) {
  const totalTime = stats.totalTime || 0;
  const sessionCount = sessions.length || 0;

  // Total Time
  const totalTimeEl = document.getElementById('todayTotalTime');
  if (totalTimeEl) {
    totalTimeEl.textContent = formatTime(totalTime);
  }

  // Sessions count
  const sessionsEl = document.getElementById('todaySessions');
  if (sessionsEl) {
    sessionsEl.textContent = sessionCount;
  }

  // Productivity Score
  const productivityStats = calculateProductivityStats(stats.categories || {});
  const productivityEl = document.getElementById('todayProductivityStat');
  if (productivityEl) {
    productivityEl.textContent = productivityStats.score + '%';
  }

  // Get yesterday's data for comparison
  const yesterday = new Date(currentDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateLocal(yesterday);

  try {
    const yesterdayResponse = await chrome.runtime.sendMessage({
      type: 'GET_DATE_STATS',
      date: yesterdayStr
    });
    const yesterdayStats = yesterdayResponse.data.stats || {};
    const yesterdaySessions = yesterdayResponse.data.sessions || [];

    const yesterdayTotalTime = yesterdayStats.totalTime || 0;
    const yesterdaySessionCount = yesterdaySessions.length || 0;
    const yesterdayProductivity = calculateProductivityStats(yesterdayStats.categories || {});

    // Compare total time (vs yesterday's full day)
    displayComparison('todayTotalCompare', totalTime, yesterdayTotalTime, true);

    // Compare sessions
    displayComparison('todaySessionsCompare', sessionCount, yesterdaySessionCount, false);

    // Compare productivity (higher is better, so invert)
    displayProductivityComparison('todayProductivityCompare', productivityStats.score, yesterdayProductivity.score);

    // Daily Average (using last 7 days)
    const dailyAvg = await calculateDailyAverage(currentDate, 7);
    const dailyAvgEl = document.getElementById('todayDailyAvg');
    if (dailyAvgEl) {
      dailyAvgEl.textContent = formatTime(dailyAvg.current);
    }
    displayComparison('todayDailyAvgCompare', dailyAvg.current, dailyAvg.previous, true);

    // NEW: "vs Yesterday at Same Time" stat (only for today)
    const isViewingToday = currentDate === getTodayDate();
    const sameTimeContainer = document.getElementById('todaySameTimeContainer');

    if (isViewingToday && sameTimeContainer) {
      sameTimeContainer.style.display = 'block';

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Calculate yesterday's usage up to current time
      let yesterdayTimeAtSameTime = 0;
      yesterdaySessions.forEach(session => {
        if (!session.endTime || !session.startTime) return;

        const sessionStart = new Date(session.startTime);
        const sessionEnd = new Date(session.endTime);

        // Create cutoff time (yesterday at current time)
        const cutoff = new Date(sessionStart);
        cutoff.setHours(currentHour, currentMinute, 0, 0);

        if (sessionEnd <= cutoff) {
          // Session ended before cutoff - include full duration
          yesterdayTimeAtSameTime += session.duration || 0;
        } else if (sessionStart < cutoff) {
          // Session spans cutoff - include partial duration
          yesterdayTimeAtSameTime += cutoff.getTime() - sessionStart.getTime();
        }
      });

      // Display the comparison
      const sameTimeValueEl = document.getElementById('todaySameTimeValue');
      const sameTimeCompareEl = document.getElementById('todaySameTimeCompare');
      const sameTimeLabelEl = document.getElementById('todaySameTimeLabel');

      if (sameTimeValueEl) {
        const diff = totalTime - yesterdayTimeAtSameTime;
        if (diff >= 0) {
          sameTimeValueEl.textContent = '+' + formatTime(diff);
          sameTimeValueEl.className = 'stat-box-value same-time-up';
        } else {
          sameTimeValueEl.textContent = '-' + formatTime(Math.abs(diff));
          sameTimeValueEl.className = 'stat-box-value same-time-down';
        }
      }

      if (sameTimeLabelEl) {
        sameTimeLabelEl.textContent = `vs Yesterday ${formatTimeOfDay(now)}`;
      }

      if (sameTimeCompareEl) {
        const percentDiff = yesterdayTimeAtSameTime > 0
          ? Math.round(((totalTime - yesterdayTimeAtSameTime) / yesterdayTimeAtSameTime) * 100)
          : (totalTime > 0 ? 100 : 0);

        if (Math.abs(percentDiff) < 5) {
          sameTimeCompareEl.textContent = '—';
          sameTimeCompareEl.className = 'stat-box-compare neutral';
        } else if (percentDiff > 0) {
          sameTimeCompareEl.textContent = `↑${Math.abs(percentDiff)}%`;
          sameTimeCompareEl.className = 'stat-box-compare up';
        } else {
          sameTimeCompareEl.textContent = `↓${Math.abs(percentDiff)}%`;
          sameTimeCompareEl.className = 'stat-box-compare down';
        }
      }
    } else if (sameTimeContainer) {
      sameTimeContainer.style.display = 'none';
    }

  } catch (error) {
    console.error('Error getting comparison data:', error);
  }
}

/**
 * Format time of day (e.g., "2:30 PM")
 */
function formatTimeOfDay(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Display productivity comparison (higher is better)
 */
function displayProductivityComparison(elementId, current, previous) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const diff = current - previous;
  if (diff === 0 || previous === 0) {
    el.textContent = '';
    el.className = 'stat-box-compare';
    return;
  }

  const arrow = diff > 0 ? '↑' : '↓';
  el.textContent = `${arrow} ${Math.abs(diff)}%`;
  // For productivity, up is good (green), down is bad (red)
  el.className = `stat-box-compare ${diff > 0 ? 'down' : 'up'}`;
}

/**
 * Calculate daily average for a period
 */
async function calculateDailyAverage(endDate, days) {
  const dates = [];
  const prevDates = [];
  const today = getTodayDate();

  for (let i = 0; i < days; i++) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const dateStr = formatDateLocal(date);
    if (dateStr <= today) {
      dates.push(dateStr);
    }
  }

  for (let i = days; i < days * 2; i++) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const dateStr = formatDateLocal(date);
    prevDates.push(dateStr);
  }

  let currentTotal = 0;
  let currentDays = 0;
  let prevTotal = 0;
  let prevDays = 0;

  for (const date of dates) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DATE_STATS', date });
      const time = response.data.stats?.totalTime || 0;
      if (time > 0) {
        currentTotal += time;
        currentDays++;
      }
    } catch (e) {}
  }

  for (const date of prevDates) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DATE_STATS', date });
      const time = response.data.stats?.totalTime || 0;
      if (time > 0) {
        prevTotal += time;
        prevDays++;
      }
    } catch (e) {}
  }

  return {
    current: currentDays > 0 ? currentTotal / currentDays : 0,
    previous: prevDays > 0 ? prevTotal / prevDays : 0
  };
}

/**
 * Display comparison indicator
 * @param {string} elementId - Element ID
 * @param {number} current - Current value
 * @param {number} previous - Previous value to compare against
 * @param {boolean} isTime - Whether values are time (affects formatting)
 * @param {string} tooltip - Optional tooltip text
 */
function displayComparison(elementId, current, previous, isTime, tooltip = null) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (previous === 0 && current === 0) {
    el.textContent = '';
    el.className = 'stat-box-compare neutral';
    el.title = '';
    return;
  }

  const diff = current - previous;
  const percentDiff = previous > 0 ? Math.round((diff / previous) * 100) : (current > 0 ? 100 : 0);

  if (Math.abs(percentDiff) < 5) {
    el.textContent = '—';
    el.className = 'stat-box-compare neutral';
  } else if (diff > 0) {
    el.textContent = `↑${Math.abs(percentDiff)}%`;
    el.className = 'stat-box-compare up';
  } else {
    el.textContent = `↓${Math.abs(percentDiff)}%`;
    el.className = 'stat-box-compare down';
  }

  // Set tooltip if provided
  if (tooltip) {
    el.title = tooltip;
  } else {
    el.title = isTime ? `vs ${formatTime(previous)}` : `vs ${previous}`;
  }
}

/**
 * Get week data for a specific date
 */
async function getWeekDataForDate(targetDate) {
  const target = new Date(targetDate);
  const weekStart = getWeekStart(target);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push(formatDateLocal(date));
  }

  const dailyStats = await Promise.all(
    dates.map(async date => {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date
      });
      return {
        date,
        ...(response.data.stats || { categories: {}, totalTime: 0 })
      };
    })
  );

  return dailyStats;
}

// Chart settings
const CHART_WEEK_HEIGHT = 207;
const CHART_HOURLY_HEIGHT = 100;

/**
 * Setup canvas with proper pixel ratio for crisp text
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} width - Desired CSS width
 * @param {number} height - Desired CSS height
 * @returns {CanvasRenderingContext2D} - Context ready for drawing
 */
function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;

  // Set CSS size
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  // Set actual canvas size (scaled by device pixel ratio)
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');

  // Scale context to account for device pixel ratio
  ctx.scale(dpr, dpr);

  return ctx;
}

/**
 * Display week overview chart in Today tab with stacked categories
 */
function displayTodayWeekOverview(dailyStats, selectedDate, categoriesInfo = {}) {
  const canvas = document.getElementById('todayWeekChart');

  // Chart size
  const container = canvas.parentElement;
  const containerWidth = container.offsetWidth || 500;
  const ctx = setupCanvas(canvas, containerWidth, CHART_WEEK_HEIGHT);

  // Use CSS dimensions for calculations
  const canvasWidth = containerWidth;
  const canvasHeight = CHART_WEEK_HEIGHT;
  const todayDateForMax = getTodayDate();

  // Round max time up to nearest hour (exclude future dates)
  const rawMaxTime = Math.max(...dailyStats.filter(d => d.date <= todayDateForMax).map(d => d.totalTime || 0), 1);
  const maxTime = Math.ceil(rawMaxTime / 3600000) * 3600000;

  // Chart dimensions
  const chartLeft = 10;
  const chartRight = 35;
  const chartTop = 8;
  const chartBottom = 24;
  const totalWidth = canvasWidth - chartLeft - chartRight;
  const barWidth = (totalWidth / 7) * 0.75;  // 75% (reduced from 85%)
  const barGap = (totalWidth - (barWidth * 7)) / 6;
  const maxHeight = canvasHeight - chartTop - chartBottom;

  // Find selected day's total
  const selectedDay = dailyStats.find(d => d.date === selectedDate);
  const selectedDayTotal = selectedDay?.totalTime || 0;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid lines - 4 lines, only label 50% and 100%
  const themeColors = getChartColors();
  ctx.strokeStyle = themeColors.border;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const labelLevels = [0.5, 1.0];
  ctx.fillStyle = themeColors.chartText;
  ctx.font = '10px -apple-system';
  ctx.textAlign = 'left';

  gridLevels.forEach(level => {
    const y = chartTop + maxHeight - (maxHeight * level);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth - chartRight, y);
    ctx.stroke();

    // Time label only for 50% and 100%
    if (labelLevels.includes(level)) {
      const timeAtLevel = maxTime * level;
      const hours = timeAtLevel / 3600000;
      const label = hours >= 1 ? `${hours}h` : `${Math.round(hours * 60)}m`;
      ctx.fillText(label, canvasWidth - chartRight + 5, y + 4);
    }
  });
  ctx.setLineDash([]);

  // Draw vertical lines between days (including start and end)
  ctx.strokeStyle = themeColors.border;
  ctx.setLineDash([4, 4]);
  // Start line
  ctx.beginPath();
  ctx.moveTo(chartLeft - 2, chartTop);
  ctx.lineTo(chartLeft - 2, chartTop + maxHeight);
  ctx.stroke();
  // Lines between bars
  for (let i = 1; i < 7; i++) {
    const x = chartLeft + i * (barWidth + barGap) - barGap / 2;
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartTop + maxHeight);
    ctx.stroke();
  }
  // End line (positioned to not overlap with labels)
  const chartEndXLine = chartLeft + 6 * (barWidth + barGap) + barWidth + 2;
  ctx.beginPath();
  ctx.moveTo(chartEndXLine, chartTop);
  ctx.lineTo(chartEndXLine, chartTop + maxHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Calculate average for non-future days
  const todayDateStr = getTodayDate();
  const pastDays = dailyStats.filter(d => d.date <= todayDateStr && d.totalTime > 0);
  const avgTime = pastDays.length > 0
    ? pastDays.reduce((sum, d) => sum + d.totalTime, 0) / pastDays.length
    : 0;

  // Helper to get category color from categoriesInfo
  const getCategoryColor = (category) => {
    return categoriesInfo[category]?.color || '#8E8E93';
  };

  // Store bar positions for click handling
  canvas.barPositions = [];
  const todayDate = getTodayDate();

  // Draw bars
  dailyStats.forEach((day, index) => {
    const date = new Date(day.date);
    const isSelected = day.date === selectedDate;
    const isFuture = day.date > todayDate;
    const x = chartLeft + index * (barWidth + barGap);

    // Future dates have no data
    const effectiveTime = isFuture ? 0 : (day.totalTime || 0);
    const totalHeight = maxTime > 0 ? (effectiveTime / maxTime) * maxHeight : 0;

    // Store for click handling (exclude future dates)
    if (!isFuture) {
      canvas.barPositions.push({
        x,
        y: chartTop + maxHeight - totalHeight,
        width: barWidth,
        height: totalHeight,
        date: day.date
      });
    }

    if (isFuture) {
      // Future date: show empty placeholder (very light, no bar)
      ctx.fillStyle = themeColors.border;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, chartTop + maxHeight - 4, barWidth, 4);
      ctx.globalAlpha = 1.0;
    } else if (isSelected) {
      // Selected day: draw stacked categories in color
      const categories = day.categories || {};
      // Get ALL categories with time for proper total calculation
      let allCategoriesWithTime = Object.entries(categories)
        .filter(([_, data]) => data.time > 0);

      // Calculate total time from all categories
      const allCategoriesTime = allCategoriesWithTime.reduce((sum, [_, data]) => sum + (data.time || 0), 0);

      // For display, filter out 'other' and 'undefined' for top3 calculation
      let sortedCategories = allCategoriesWithTime
        .filter(([cat, _]) => cat !== 'other' && cat !== 'undefined');

      // Sort by time descending to get top 3
      sortedCategories.sort((a, b) => b[1].time - a[1].time);

      // Fixed colors for top 3: Accent color, Tiffany Blue, Orange
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8BAF5B';
      const top3Colors = [accentColor, '#40E0D0', '#FF9500'];
      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
      const grayColor = isDarkMode ? '#555555' : '#C8C8C8';

      // Use effectiveTime (day's total) for the total bar height
      const barTotalHeight = totalHeight;
      let currentY = chartTop + maxHeight;

      if (allCategoriesTime === 0) {
        // No data - show gray bar
        ctx.fillStyle = themeColors.border;
        ctx.fillRect(x, chartTop + maxHeight - 10, barWidth, 10);
      } else {
        if (chartColorMode === 'productivity') {
          // Productivity mode: draw each category with productivity colors
          // Include ALL categories (including other/undefined) for correct total
          allCategoriesWithTime.sort((a, b) => getProductivityGroup(a[0]) - getProductivityGroup(b[0]));
          allCategoriesWithTime.forEach(([category, data]) => {
            // Calculate segment height as proportion of total bar height
            const segmentHeight = (data.time / allCategoriesTime) * barTotalHeight;
            const segmentY = currentY - segmentHeight;
            ctx.fillStyle = getProductivityColor(category);
            // Draw without border between segments
            ctx.fillRect(x, segmentY, barWidth, segmentHeight + 0.5); // +0.5 to prevent gaps
            currentY = segmentY;
          });
        } else if (chartColorMode === 'subcategories') {
          // Subcategories mode: group by subcategory and show top 3
          const subcatData = {};

          // Group by subcategory from categories[category].subcategories
          allCategoriesWithTime.forEach(([category, data]) => {
            const subcategories = data.subcategories || {};

            // If no subcategories data, use category time as 'general'
            if (Object.keys(subcategories).length === 0) {
              const key = `${category}:general`;
              subcatData[key] = {
                time: data.time,
                category: category,
                subcategory: 'general',
                displayName: `${categoriesInfo[category]?.name || category} - ${getSubcategoryName('general')}`
              };
            } else {
              // Add each subcategory
              Object.entries(subcategories).forEach(([subcategory, subcatInfo]) => {
                const key = `${category}:${subcategory}`;
                if (!subcatData[key]) {
                  subcatData[key] = {
                    time: 0,
                    category: category,
                    subcategory: subcategory,
                    displayName: `${categoriesInfo[category]?.name || category} - ${getSubcategoryName(subcategory)}`
                  };
                }
                subcatData[key].time += subcatInfo.time || 0;
              });
            }
          });

          // Sort by time
          let sortedSubcats = Object.entries(subcatData)
            .filter(([_, data]) => data.time > 0)
            .sort((a, b) => b[1].time - a[1].time);

          const top3Subcats = sortedSubcats.slice(0, 3);
          const top3Time = top3Subcats.reduce((sum, [_, data]) => sum + data.time, 0);
          const restTime = allCategoriesTime - top3Time;

          // Draw top 3 subcategories
          for (let i = 0; i < top3Subcats.length; i++) {
            const [key, data] = top3Subcats[i];
            const segmentHeight = (data.time / allCategoriesTime) * barTotalHeight;
            const segmentY = currentY - segmentHeight;
            ctx.fillStyle = top3Colors[i];
            ctx.fillRect(x, segmentY, barWidth, segmentHeight + 0.5);
            currentY = segmentY;
          }

          // Draw rest (gray) at top
          if (restTime > 0) {
            const restHeight = (restTime / allCategoriesTime) * barTotalHeight;
            const restY = currentY - restHeight;
            ctx.fillStyle = grayColor;
            ctx.fillRect(x, restY, barWidth, restHeight);
            currentY = restY;
          }
        } else {
          // Categories mode: top 3 with colors, rest merged into single gray
          const top3 = sortedCategories.slice(0, 3);
          const top3Time = top3.reduce((sum, [_, data]) => sum + data.time, 0);
          // Rest includes categories after top3 + 'other' + 'undefined'
          const restTime = allCategoriesTime - top3Time;

          // Draw from bottom: Blue (top1) -> Tiffany (top2) -> Orange (top3) -> Gray (rest)
          // Draw top 3 first (in order so top1/blue is at bottom)
          for (let i = 0; i < top3.length; i++) {
            const [category, data] = top3[i];
            // Calculate segment height as proportion of total bar height
            const segmentHeight = (data.time / allCategoriesTime) * barTotalHeight;
            const segmentY = currentY - segmentHeight;
            ctx.fillStyle = top3Colors[i];
            ctx.fillRect(x, segmentY, barWidth, segmentHeight + 0.5); // +0.5 to prevent gaps
            currentY = segmentY;
          }

          // Draw rest (gray) at top
          if (restTime > 0) {
            const restHeight = (restTime / allCategoriesTime) * barTotalHeight;
            const restY = currentY - restHeight;
            ctx.fillStyle = grayColor;
            ctx.fillRect(x, restY, barWidth, restHeight);
            currentY = restY;
          }
        }
      }
    } else {
      // Unselected day
      const categories = day.categories || {};
      let sortedCategories = Object.entries(categories)
        .filter(([_, data]) => data.time > 0);
      const totalTime = day.totalTime || 0;
      const barTotalHeight = totalHeight; // Use pre-calculated total height

      if (totalTime === 0 || sortedCategories.length === 0) {
        // No data - show small gray bar
        ctx.fillStyle = themeColors.border;
        ctx.fillRect(x, chartTop + maxHeight - 10, barWidth, 10);
      } else if (chartColorMode === 'productivity') {
        // Productivity mode: draw single muted bar for unselected days
        const isDarkModeUnselected = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDarkModeUnselected ? '#4A4A4A' : '#D0D0D0';
        ctx.fillRect(x, chartTop + maxHeight - barTotalHeight, barWidth, barTotalHeight);
      } else if (chartColorMode === 'subcategories') {
        // Subcategories mode: draw single solid gray bar for unselected days
        const isDarkModeUnselected = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDarkModeUnselected ? '#555555' : '#C8C8C8';
        ctx.fillRect(x, chartTop + maxHeight - barTotalHeight, barWidth, barTotalHeight);
      } else {
        // Categories mode: draw single solid gray bar
        const isDarkModeUnselected = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDarkModeUnselected ? '#555555' : '#C8C8C8';
        ctx.fillRect(x, chartTop + maxHeight - barTotalHeight, barWidth, barTotalHeight);
      }
    }

    // Draw day label
    const isDarkModeLabel = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isSelected ? (isDarkModeLabel ? '#FFFFFF' : '#000000') : (isDarkModeLabel ? '#999999' : '#666666');
    ctx.font = isSelected ? 'bold 12px -apple-system' : '12px -apple-system';
    ctx.textAlign = 'center';
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    ctx.fillText(dayName, x + barWidth / 2, chartTop + maxHeight + 20);
  });

  // Draw average line
  if (avgTime > 0) {
    const avgY = chartTop + maxHeight - (avgTime / maxTime) * maxHeight;
    const chartEndX = chartLeft + 7 * (barWidth + barGap) - barGap;
    ctx.strokeStyle = themeColors.textSecondary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, avgY);
    ctx.lineTo(chartEndX, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw "Avg" label
    ctx.fillStyle = themeColors.textSecondary;
    ctx.font = '10px -apple-system';
    ctx.textAlign = 'left';
    ctx.fillText('Avg', chartEndX + 5, avgY + 3);
  }

  // Store daily stats and categories info for tooltip
  canvas.dailyStats = dailyStats;
  canvas.categoriesInfo = categoriesInfo;
  canvas.selectedDate = selectedDate;

  // Add click handler to change selected day
  canvas.onclick = function(event) {
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;

    // Find which bar was clicked
    const clickedBar = canvas.barPositions.find(bar => {
      return clickX >= bar.x && clickX <= bar.x + bar.width;
    });

    if (clickedBar && clickedBar.date !== selectedDate) {
      // Update current date and reload
      currentTodayDate = clickedBar.date;
      updateTodayTitle();
      updateTodayNextButton();
      loadTodayData(clickedBar.date);
    }
  };

  // Change cursor on hover and show tooltip with segment detection
  canvas.onmousemove = function(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const containerRect = canvas.parentElement.getBoundingClientRect();

    const hoveredBar = canvas.barPositions.find(bar => {
      return mouseX >= bar.x && mouseX <= bar.x + bar.width;
    });

    if (hoveredBar) {
      canvas.style.cursor = 'pointer';

      // Find day data
      const dayData = canvas.dailyStats.find(d => d.date === hoveredBar.date);
      if (dayData) {
        const date = new Date(dayData.date);
        const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const categories = dayData.categories || {};
        const catInfo = canvas.categoriesInfo;
        const isSelectedDay = hoveredBar.date === canvas.selectedDate;

        // For unselected days in categories mode, hide tooltip (the bar is just a solid gray)
        if (!isSelectedDay && chartColorMode !== 'productivity') {
          hideGraphTooltip('todayWeekChartTooltip');
          return;
        }

        // Detect which segment is being hovered based on Y position (use top3 colors for categories mode)
        let segmentInfo = findHoveredSegment(mouseY, categories, dayData.totalTime || 0, maxTime, chartTop, maxHeight, chartColorMode, catInfo, true);

        // For categories mode on selected day, check if hovering over gray (rest) segment
        if (isSelectedDay && chartColorMode !== 'productivity' && !segmentInfo) {
          // Calculate top3 and rest info
          const filteredCats = Object.entries(categories)
            .filter(([cat, data]) => data.time > 0 && cat !== 'other' && cat !== 'undefined')
            .sort((a, b) => b[1].time - a[1].time);
          const top3Cats = filteredCats.slice(0, 3);
          const restCats = filteredCats.slice(3);
          const top3TotalTime = top3Cats.reduce((sum, [_, data]) => sum + data.time, 0);
          const allCategoriesTime = Object.values(categories).reduce((sum, data) => sum + (data.time || 0), 0);
          const restTime = allCategoriesTime - top3TotalTime;

          if (restTime > 0) {
            const top3Height = (top3TotalTime / maxTime) * maxHeight;
            const top3Top = chartTop + maxHeight - top3Height;

            // If mouse is above the top3 segments (in the gray area), show "Others" tooltip
            if (mouseY < top3Top) {
              const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
              segmentInfo = {
                name: 'Others',
                color: isDarkMode ? '#555555' : '#C8C8C8',
                time: restTime
              };
            }
          }
        }

        // Get top sites for this day's segment
        let topSites = [];
        if (segmentInfo && categories) {
          const segmentCategories = getSegmentCategories(segmentInfo.name, chartColorMode);
          topSites = getTopSitesForCategories(segmentCategories, categories, catInfo);
        }

        showGraphTooltip('todayWeekChartTooltip', {
          label: label,
          time: dayData.totalTime || 0,
          segmentName: segmentInfo?.name,
          segmentColor: segmentInfo?.color,
          segmentTime: segmentInfo?.time,
          topSites: topSites
        }, hoveredBar.x + hoveredBar.width, mouseY, { width: containerRect.width, height: containerRect.height }, chartColorMode, catInfo);
      }
    } else {
      canvas.style.cursor = 'default';
      hideGraphTooltip('todayWeekChartTooltip');
    }
  };

  canvas.onmouseleave = function() {
    hideGraphTooltip('todayWeekChartTooltip');
  };
}

/**
 * Display hourly breakdown chart with category colors
 */
function displayTodayHourlyBreakdown(sessions, stats = {}, date = null, categoriesInfo = {}) {
  const canvas = document.getElementById('todayHourlyChart');

  // Set canvas size with proper scaling
  const containerWidth = canvas.parentElement.offsetWidth || 500;
  const canvasHeight = CHART_HOURLY_HEIGHT;
  const ctx = setupCanvas(canvas, containerWidth, canvasHeight);
  const canvasWidth = containerWidth;

  // Helper to get category color from categoriesInfo
  const getCategoryColor = (category) => {
    return categoriesInfo[category]?.color || '#8E8E93';
  };

  // Initialize 24 hours with category breakdown
  const hourlyData = new Array(24).fill(null).map(() => ({ total: 0, categories: {} }));

  // Calculate time per hour from sessions with category breakdown
  if (sessions && sessions.length > 0) {
    sessions.forEach(session => {
      const startTime = session.startTime;
      const duration = session.duration;
      const category = session.category || 'other';

      if (!startTime || !duration) return;

      // Extract domain from session
      let domain = null;
      if (session.visits && session.visits.length > 0) {
        try {
          const url = new URL(session.visits[0].url);
          domain = url.hostname.replace('www.', '');
        } catch (e) {}
      }

      const startDate = new Date(startTime);
      const endDate = new Date(startTime + duration);
      const startHour = startDate.getHours();
      const endHour = endDate.getHours();

      const addToHour = (hour, time) => {
        const ONE_HOUR = 3600000;
        // Cap time to not exceed 1 hour total per hour slot
        const remainingCapacity = ONE_HOUR - hourlyData[hour].total;
        const cappedTime = Math.min(time, Math.max(remainingCapacity, 0));

        if (cappedTime <= 0) return; // Hour is already full

        hourlyData[hour].total += cappedTime;
        if (!hourlyData[hour].categories[category]) {
          hourlyData[hour].categories[category] = { time: 0, topSites: {} };
        }
        hourlyData[hour].categories[category].time += cappedTime;

        // Track domain time for this hour/category
        if (domain) {
          if (!hourlyData[hour].categories[category].topSites[domain]) {
            hourlyData[hour].categories[category].topSites[domain] = 0;
          }
          hourlyData[hour].categories[category].topSites[domain] += cappedTime;
        }
      };

      if (startHour === endHour) {
        addToHour(startHour, duration);
      } else {
        const startHourEnd = new Date(startDate);
        startHourEnd.setHours(startHour + 1, 0, 0, 0);
        addToHour(startHour, startHourEnd - startDate);

        for (let h = startHour + 1; h < endHour; h++) {
          addToHour(h, 60 * 60 * 1000);
        }

        const endHourStart = new Date(endDate);
        endHourStart.setHours(endHour, 0, 0, 0);
        addToHour(endHour, endDate - endHourStart);
      }
    });
  } else if (stats.totalTime && stats.totalTime > 0) {
    // No sessions but have stats - distribute time across typical hours
    const dateSeed = date ? new Date(date).getTime() : Date.now();
    const seededRandom = (seed, index) => {
      const x = Math.sin(seed * (index + 1)) * 10000;
      return x - Math.floor(x);
    };

    const startHour = 8 + Math.floor(seededRandom(dateSeed, 100) * 3);
    const endHour = 21 + Math.floor(seededRandom(dateSeed, 200) * 3);
    const activeHours = [];
    for (let h = startHour; h <= endHour; h++) {
      activeHours.push(h);
    }

    // Get category proportions from stats
    const categories = stats.categories || {};
    const totalCatTime = Object.values(categories).reduce((sum, c) => sum + (c.time || 0), 0);

    const baseTimePerHour = stats.totalTime / activeHours.length;
    activeHours.forEach((hour, i) => {
      let peakFactor = hour >= 18 && hour <= 21 ? 1.4 :
                       hour >= 12 && hour <= 14 ? 1.2 : 0.9;
      const variation = 0.5 + seededRandom(dateSeed, hour) * 1.0;
      const hourTime = baseTimePerHour * peakFactor * variation;
      hourlyData[hour].total = hourTime;

      // Distribute by category proportions
      Object.entries(categories).forEach(([cat, data]) => {
        const proportion = totalCatTime > 0 ? (data.time || 0) / totalCatTime : 0;
        hourlyData[hour].categories[cat] = hourTime * proportion;
      });
    });
  }

  // Fixed max time at 1 hour (hourly chart should never exceed 1 hour per slot)
  const maxTime = 3600000; // 1 hour in milliseconds

  const chartTop = 8;
  const chartLeft = 10;
  const chartRight = 35;
  const chartBottom = 18;
  const totalWidth = canvasWidth - chartLeft - chartRight;
  const barWidth = (totalWidth / 24) * 0.7; // 70% of available space per bar
  const barGap = (totalWidth - (barWidth * 24)) / 23;
  const maxHeight = canvasHeight - chartTop - chartBottom;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid lines - 4 lines, only label 50% and 100%
  const themeColors = getChartColors();
  ctx.strokeStyle = themeColors.border;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const labelLevels = [0.5, 1.0];
  ctx.fillStyle = themeColors.chartText;
  ctx.font = '10px -apple-system';
  ctx.textAlign = 'left';

  gridLevels.forEach(level => {
    const y = chartTop + maxHeight - (maxHeight * level);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth - chartRight, y);
    ctx.stroke();

    // Time label only for 50% and 100%
    if (labelLevels.includes(level)) {
      const timeAtLevel = maxTime * level;
      const minutes = Math.round(timeAtLevel / 60000);
      const label = minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
      ctx.fillText(label, canvasWidth - chartRight + 5, y + 4);
    }
  });
  ctx.setLineDash([]);

  // Draw vertical lines at 0, 6, 12, 18, 24 hours (including start and end)
  ctx.strokeStyle = themeColors.border;
  ctx.setLineDash([4, 4]);
  // Start line
  ctx.beginPath();
  ctx.moveTo(chartLeft - 2, chartTop);
  ctx.lineTo(chartLeft - 2, chartTop + maxHeight);
  ctx.stroke();
  // Lines at 6, 12, 18 hours
  [6, 12, 18].forEach(hour => {
    const x = chartLeft + hour * (barWidth + barGap) - barGap / 2;
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartTop + maxHeight);
    ctx.stroke();
  });
  // End line (positioned to not overlap with labels)
  const chartEndXLineHourly = chartLeft + 23 * (barWidth + barGap) + barWidth + 2;
  ctx.beginPath();
  ctx.moveTo(chartEndXLineHourly, chartTop);
  ctx.lineTo(chartEndXLineHourly, chartTop + maxHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Check if viewing today to determine future hours
  const isViewingToday = date === getTodayDate();
  const currentHour = new Date().getHours();

  // Draw stacked bars with category colors
  hourlyData.forEach((hourData, hour) => {
    const x = chartLeft + hour * (barWidth + barGap);
    const totalHeight = maxTime > 0 ? (hourData.total / maxTime) * maxHeight : 0;

    // Draw hour label every 6 hours (0, 6, 12, 18) - always show regardless of data
    if (hour % 6 === 0) {
      ctx.fillStyle = themeColors.chartText;
      ctx.font = '10px -apple-system';
      ctx.textAlign = 'center';
      // Convert to AM/PM format
      let label;
      if (hour === 0) label = '12AM';
      else if (hour === 6) label = '6AM';
      else if (hour === 12) label = '12PM';
      else if (hour === 18) label = '6PM';
      ctx.fillText(label, x + barWidth / 2, chartTop + maxHeight + 12);
    }

    // Skip future hours entirely (no bar at all)
    const isFutureHour = isViewingToday && hour > currentHour;

    if (isFutureHour) {
      // Future hour - don't draw any bar
      return;
    } else if (hourData.total === 0) {
      // Past/current hour with no data - show small gray bar
      ctx.fillStyle = themeColors.bgTertiary;
      ctx.fillRect(x, chartTop + maxHeight - 5, barWidth, 5);
    } else {
      // Sort categories by time descending
      // Handle both number format and object format { time, topSites }
      // Filter out 'other' and 'undefined' for top3 calculation (consistent with hover detection)
      let sortedCategories = Object.entries(hourData.categories)
        .filter(([cat, data]) => {
          const time = typeof data === 'number' ? data : (data.time || 0);
          return time > 0 && cat !== 'other' && cat !== 'undefined';
        });

      // Calculate total time including all categories
      const allCategoriesTime = Object.values(hourData.categories).reduce((sum, data) => {
        const time = typeof data === 'number' ? data : (data.time || 0);
        return sum + time;
      }, 0);

      // Sort by time descending
      sortedCategories.sort((a, b) => {
        const aTime = typeof a[1] === 'number' ? a[1] : (a[1].time || 0);
        const bTime = typeof b[1] === 'number' ? b[1] : (b[1].time || 0);
        return bTime - aTime;
      });

      // Fixed colors for top 3: Blue, Tiffany Blue, Orange
      const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];
      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
      const grayColor = isDarkMode ? '#555555' : '#C8C8C8';

      let currentY = chartTop + maxHeight;

      if (chartColorMode === 'productivity') {
        // Productivity mode: draw each category with productivity colors
        sortedCategories.sort((a, b) => getProductivityGroup(a[0]) - getProductivityGroup(b[0]));
        sortedCategories.forEach(([category, data]) => {
          const time = typeof data === 'number' ? data : (data.time || 0);
          const segmentHeight = (time / maxTime) * maxHeight;
          const segmentY = currentY - segmentHeight;
          ctx.fillStyle = getProductivityColor(category);
          ctx.fillRect(x, segmentY, barWidth, segmentHeight);
          currentY = segmentY;
        });
      } else {
        // Categories mode: top 3 with colors, rest merged into single gray
        const top3 = sortedCategories.slice(0, 3);
        const top3Time = top3.reduce((sum, [_, data]) => {
          const time = typeof data === 'number' ? data : (data.time || 0);
          return sum + time;
        }, 0);
        // Rest includes categories after top3 + 'other' + 'undefined'
        const restTime = allCategoriesTime - top3Time;

        // Draw from bottom: Blue (top1) -> Tiffany (top2) -> Orange (top3) -> Gray (rest)
        // Draw top 3 first (in order so top1/blue is at bottom)
        for (let i = 0; i < top3.length; i++) {
          const [category, data] = top3[i];
          const time = typeof data === 'number' ? data : (data.time || 0);
          const segmentHeight = (time / maxTime) * maxHeight;
          const segmentY = currentY - segmentHeight;
          ctx.fillStyle = top3Colors[i];
          ctx.fillRect(x, segmentY, barWidth, segmentHeight);
          currentY = segmentY;
        }

        // Draw rest (gray) at top
        if (restTime > 0) {
          const restHeight = (restTime / maxTime) * maxHeight;
          const restY = currentY - restHeight;
          ctx.fillStyle = grayColor;
          ctx.fillRect(x, restY, barWidth, restHeight);
          currentY = restY;
        }
      }
    }
  });

  // Store hourly data and bar positions for hover
  canvas.hourlyData = hourlyData;
  canvas.categoriesInfo = categoriesInfo;
  canvas.barPositions = [];

  hourlyData.forEach((hourData, hour) => {
    const x = chartLeft + hour * (barWidth + barGap);
    const isFutureHour = isViewingToday && hour > currentHour;
    if (!isFutureHour && hourData.total > 0) {
      canvas.barPositions.push({
        x,
        width: barWidth,
        hour,
        data: hourData
      });
    }
  });

  // Add hover functionality with segment detection
  canvas.onmousemove = function(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const containerRect = canvas.parentElement.getBoundingClientRect();

    const hoveredBar = canvas.barPositions.find(bar => {
      return mouseX >= bar.x && mouseX <= bar.x + bar.width;
    });

    if (hoveredBar) {
      const hour = hoveredBar.hour;
      const hourLabel = hour === 0 ? '12 AM' :
                        hour === 12 ? '12 PM' :
                        hour < 12 ? `${hour} AM` : `${hour - 12} PM`;

      // Detect which segment is being hovered (use top3 colors for categories mode)
      let segmentInfo = findHoveredSegment(mouseY, hoveredBar.data.categories, hoveredBar.data.total, maxTime, chartTop, maxHeight, chartColorMode, canvas.categoriesInfo, true);

      // For categories mode, check if hovering over gray (rest) segment
      if (chartColorMode !== 'productivity' && !segmentInfo) {
        const hourCategories = hoveredBar.data.categories || {};
        const filteredCats = Object.entries(hourCategories)
          .filter(([cat, data]) => {
            const time = typeof data === 'number' ? data : (data.time || 0);
            return time > 0 && cat !== 'other' && cat !== 'undefined';
          })
          .sort((a, b) => {
            const aTime = typeof a[1] === 'number' ? a[1] : (a[1].time || 0);
            const bTime = typeof b[1] === 'number' ? b[1] : (b[1].time || 0);
            return bTime - aTime;
          });
        const top3Cats = filteredCats.slice(0, 3);
        const top3TotalTime = top3Cats.reduce((sum, [_, data]) => {
          const time = typeof data === 'number' ? data : (data.time || 0);
          return sum + time;
        }, 0);
        const allCategoriesTime = Object.values(hourCategories).reduce((sum, data) => {
          const time = typeof data === 'number' ? data : (data.time || 0);
          return sum + time;
        }, 0);
        const restTime = allCategoriesTime - top3TotalTime;

        if (restTime > 0) {
          const top3Height = (top3TotalTime / maxTime) * maxHeight;
          const top3Top = chartTop + maxHeight - top3Height;

          // If mouse is above the top3 segments (in the gray area), show "Others" tooltip
          if (mouseY < top3Top) {
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            segmentInfo = {
              name: 'Others',
              color: isDarkMode ? '#555555' : '#C8C8C8',
              time: restTime
            };
          }
        }
      }

      // Get top sites for this hour's segment
      let topSites = [];
      if (segmentInfo && hoveredBar.data.categories) {
        const segmentCategories = getSegmentCategories(segmentInfo.name, chartColorMode);
        topSites = getTopSitesForCategories(segmentCategories, hoveredBar.data.categories, canvas.categoriesInfo);
      }

      showGraphTooltip('todayHourlyChartTooltip', {
        label: hourLabel,
        time: hoveredBar.data.total,
        segmentName: segmentInfo?.name,
        segmentColor: segmentInfo?.color,
        segmentTime: segmentInfo?.time,
        topSites: topSites
      }, hoveredBar.x + hoveredBar.width, mouseY, { width: containerRect.width, height: containerRect.height }, chartColorMode, canvas.categoriesInfo);
    } else {
      hideGraphTooltip('todayHourlyChartTooltip');
    }
  };

  canvas.onmouseleave = function() {
    hideGraphTooltip('todayHourlyChartTooltip');
  };
}

/**
 * Calculate subcategory statistics from sessions
 * Adds subcategories field to each category in stats
 */
function calculateSubcategoryStats(categories, sessions) {
  // Initialize subcategories for each category
  for (const category in categories) {
    if (!categories[category].subcategories) {
      categories[category].subcategories = {};
    }
  }

  // Aggregate subcategory time from sessions
  for (const session of sessions) {
    const category = session.category;
    const subcategory = session.subcategory;

    if (!category || category === 'other' || category === 'undefined') continue;
    if (!subcategory) continue;

    // Initialize category if needed
    if (!categories[category]) {
      categories[category] = { time: 0, subcategories: {} };
    }
    if (!categories[category].subcategories) {
      categories[category].subcategories = {};
    }

    // Add time to subcategory
    const sessionDuration = session.duration || 0;
    if (!categories[category].subcategories[subcategory]) {
      categories[category].subcategories[subcategory] = { time: 0 };
    }
    categories[category].subcategories[subcategory].time += sessionDuration;
  }

  return categories;
}

/**
 * Display today's categories (simple, compact view)
 */
function displayTodayCategories(categories, categoriesInfo, totalTime, domains = {}) {
  const container = document.getElementById('todayCategories');

  let displayData = [];

  // Build display data based on chartColorMode
  if (chartColorMode === 'subcategories') {
    // Subcategories mode: flatten all subcategories
    Object.entries(categories).forEach(([category, data]) => {
      if (data.time <= 0 || category === 'other' || category === 'undefined') return;

      const subcategories = data.subcategories || {};
      if (Object.keys(subcategories).length === 0) {
        // No subcategories, use category as is with 'general'
        displayData.push({
          key: `${category}:general`,
          name: `${categoriesInfo[category]?.name || category} - General`,
          time: data.time,
          category: category,
          subcategory: 'general'
        });
      } else {
        // Add each subcategory
        Object.entries(subcategories).forEach(([subcat, subcatData]) => {
          if (subcatData.time <= 0) return;
          displayData.push({
            key: `${category}:${subcat}`,
            name: `${categoriesInfo[category]?.name || category} - ${getSubcategoryName(subcat)}`,
            time: subcatData.time,
            category: category,
            subcategory: subcat
          });
        });
      }
    });
  } else if (chartColorMode === 'productivity') {
    // Productivity mode: group by productivity type
    const productivityGroups = {
      productive: { name: 'Productive', time: 0, categories: [] },
      unproductive: { name: 'Unproductive', time: 0, categories: [] },
      neutral: { name: 'Neutral', time: 0, categories: [] }
    };

    Object.entries(categories).forEach(([category, data]) => {
      if (data.time <= 0) return;
      const prodGroup = getProductivityGroup(category);
      const groupKey = prodGroup === 0 ? 'productive' : (prodGroup === 2 ? 'unproductive' : 'neutral');

      productivityGroups[groupKey].time += data.time;
      productivityGroups[groupKey].categories.push(category);
    });

    Object.entries(productivityGroups).forEach(([key, data]) => {
      if (data.time > 0) {
        displayData.push({
          key: key,
          name: data.name,
          time: data.time,
          category: key,
          subcategory: null
        });
      }
    });
  } else {
    // Categories mode: use categories as is
    Object.entries(categories).forEach(([category, data]) => {
      if (data.time > 0 && category !== 'other' && category !== 'undefined') {
        displayData.push({
          key: category,
          name: categoriesInfo[category]?.name || category,
          time: data.time,
          category: category,
          subcategory: null,
          subcategories: data.subcategories  // Keep for expansion
        });
      }
    });
  }

  // Sort by time
  displayData.sort((a, b) => b.time - a.time);

  if (displayData.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No activity yet</div>';
    return;
  }

  // Filter out items under 2%, but keep minimum 5
  let filteredData = displayData.filter(item => {
    const percentage = totalTime > 0 ? (item.time / totalTime) * 100 : 0;
    return percentage >= 2;
  });

  // Ensure minimum 5 items are shown
  if (filteredData.length < 5 && displayData.length > filteredData.length) {
    filteredData = displayData.slice(0, Math.min(5, displayData.length));
  }

  // If no items were filtered out and we have more than 5, remove the lowest one
  if (filteredData.length === displayData.length && filteredData.length > 5) {
    filteredData = filteredData.slice(0, -1);
  }

  // Find max time for relative bar sizing
  const maxCategoryTime = filteredData.length > 0 ? filteredData[0].time : 1;

  // Use filteredData as final sorted categories
  const sortedCategories = filteredData;

  // Build category to top sites map (only for categories mode)
  const categoryTopSites = {};
  if (chartColorMode === 'categories') {
    Object.entries(domains).forEach(([domain, data]) => {
      const cat = data.category || 'other';
      if (!categoryTopSites[cat]) categoryTopSites[cat] = [];
      categoryTopSites[cat].push({ domain, time: data.time });
    });
    // Sort each category's sites by time
    Object.keys(categoryTopSites).forEach(cat => {
      categoryTopSites[cat].sort((a, b) => b.time - a.time);
    });
  }

  // Fixed colors for top 3: Blue, Tiffany Blue, Orange
  const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];

  container.innerHTML = sortedCategories.map((item, index) => {
    const info = categoriesInfo[item.category] || { name: item.category, color: '#8E8E93' };
    const barWidth = Math.round((item.time / maxCategoryTime) * 100);
    const percentage = totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;
    const topSites = categoryTopSites[item.category] || [];
    const topSitesJson = JSON.stringify(topSites.slice(0, 5)).replace(/"/g, '&quot;');
    // Use fixed colors for top 3, original category colors for rest
    const barColor = index < 3 ? top3Colors[index] : info.color;

    // Check if category has subcategories (only in categories mode)
    const hasSubcats = chartColorMode === 'categories' && hasMultipleSubcategories(item.category);
    const subcategoryData = item.subcategories || {};

    // Build subcategory HTML (only in categories mode)
    let subcategoryHTML = '';
    if (hasSubcats && Object.keys(subcategoryData).length > 0) {
      const sortedSubcats = Object.entries(subcategoryData)
        .filter(([_, subcatData]) => subcatData.time > 0)
        .sort((a, b) => b[1].time - a[1].time);

      if (sortedSubcats.length > 0) {
        subcategoryHTML = `
          <div class="category-subcategories" style="display: none;">
            ${sortedSubcats.map(([subcat, subcatData]) => {
              const subcatPercentage = item.time > 0 ? Math.round((subcatData.time / item.time) * 100) : 0;
              const subcatName = getSubcategoryName(subcat);
              return `
                <div class="subcategory-item">
                  <span class="subcategory-name">${subcatName}</span>
                  <span class="subcategory-time">${subcatPercentage}% · ${formatDecimalHours(subcatData.time)}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="category-item-compact ${hasSubcats && subcategoryHTML ? 'has-subcategories' : ''}" data-category="${item.category}" data-color="${barColor}" data-time="${item.time}" data-topsites="${topSitesJson}">
        <div class="category-info-row">
          <span class="category-name-small">
            ${hasSubcats && subcategoryHTML ? '<span class="expand-icon">▶</span>' : ''}
            ${item.name}
          </span>
          <span class="category-time-small">(${percentage}%) ${formatDecimalHours(item.time)}</span>
        </div>
        <div class="category-bar-small">
          <div class="category-bar-fill-small" style="width: ${barWidth}%; background-color: ${barColor};"></div>
        </div>
        ${subcategoryHTML}
      </div>
    `;
  }).join('');

  // Add tooltip element if not exists
  if (!document.getElementById('categoryTooltip')) {
    const tooltip = document.createElement('div');
    tooltip.id = 'categoryTooltip';
    tooltip.className = 'graph-tooltip';
    container.style.position = 'relative';
    container.appendChild(tooltip);
  }

  // Setup hover events
  setupCategoryHoverEvents(container, categoriesInfo);

  // Setup click events for expanding subcategories
  setupCategoryClickEvents(container);
}

function setupCategoryHoverEvents(container, categoriesInfo, tooltipId = 'categoryTooltip') {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return;

  container.querySelectorAll('.category-item-compact').forEach(item => {
    item.addEventListener('mouseenter', (e) => {
      const category = item.dataset.category;
      const color = item.dataset.color;
      const time = parseInt(item.dataset.time) || 0;
      const info = categoriesInfo[category] || { name: category };
      let topSites = [];
      try {
        topSites = JSON.parse(item.dataset.topsites || '[]');
      } catch (err) {}

      let html = `
        <div class="graph-tooltip-header" style="color:${color}">${info.name}</div>
        <div class="graph-tooltip-time">${formatTime(time)}</div>
      `;

      if (topSites.length > 0) {
        html += `<div class="graph-tooltip-divider"></div>`;
        html += `<div class="graph-tooltip-sites-title">Top Sites</div>`;
        html += `<div class="graph-tooltip-sites">`;
        topSites.forEach(site => {
          html += `
            <div class="graph-tooltip-site">
              <span class="graph-tooltip-site-name">${site.domain}</span>
              <span class="graph-tooltip-site-time">${formatTime(site.time)}</span>
            </div>
          `;
        });
        html += `</div>`;
      }

      tooltip.innerHTML = html;
      tooltip.classList.add('visible');

      // Position tooltip
      const rect = item.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      tooltip.style.left = `${rect.right - containerRect.left + 10}px`;
      tooltip.style.top = `${rect.top - containerRect.top}px`;
    });

    item.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  });
}

function setupCategoryClickEvents(container) {
  container.querySelectorAll('.category-item-compact.has-subcategories').forEach(item => {
    const infoRow = item.querySelector('.category-info-row');
    const subcategoriesDiv = item.querySelector('.category-subcategories');
    const expandIcon = item.querySelector('.expand-icon');

    if (infoRow && subcategoriesDiv) {
      infoRow.style.cursor = 'pointer';
      infoRow.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = subcategoriesDiv.style.display !== 'none';

        // Toggle subcategories
        if (isExpanded) {
          subcategoriesDiv.style.display = 'none';
          if (expandIcon) expandIcon.textContent = '▶';
          item.classList.remove('expanded');
        } else {
          subcategoriesDiv.style.display = 'block';
          if (expandIcon) expandIcon.textContent = '▼';
          item.classList.add('expanded');
        }
      });
    }
  });
}

/**
 * Display today's most used sites with expandable list and bar graph
 */
async function displayTodayMostUsed(sessions, stats, categoriesInfo, totalDayTime, todayCategories = {}) {
  const container = document.getElementById('todayMostUsed');

  // Calculate top3 categories based on today's totals for consistent colors
  const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const grayColor = isDarkMode ? '#555555' : '#C8C8C8';

  const todayTop3Categories = Object.entries(todayCategories)
    .filter(([cat, data]) => data.time > 0 && cat !== 'other' && cat !== 'undefined')
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 3)
    .map(([cat]) => cat);

  // Create color map for categories
  const categoryColorMap = {};
  todayTop3Categories.forEach((cat, index) => {
    categoryColorMap[cat] = top3Colors[index];
  });

  // Calculate time per domain from sessions
  const domainTimes = {};

  // Use ALL sessions for domain time calculation (including needs_server_classification)
  // For unclassified sessions, use well-known domain's default category as fallback
  sessions.forEach(session => {
    session.visits.forEach(visit => {
      try {
        const url = new URL(visit.url);
        const domain = normalizeDomain(url.hostname.replace('www.', ''));

        // Resolve category: use session category, or fall back to well-known domain default
        let effectiveCategory = session.category;
        if (effectiveCategory === 'needs_server_classification' || effectiveCategory === 'uncategorized') {
          const wellKnown = getWellKnownDomain(domain);
          effectiveCategory = wellKnown?.category || 'other';
        }
        const subcategory = session.subcategory || 'general';

        // Choose key based on chartColorMode
        let key;
        if (chartColorMode === 'subcategories') {
          key = `${domain}:${subcategory}`;
        } else if (chartColorMode === 'productivity') {
          const prodGroup = getProductivityGroup(effectiveCategory);
          const prodName = prodGroup === 0 ? 'Productive' : (prodGroup === 2 ? 'Unproductive' : 'Neutral');
          key = `${prodName}:${domain}`;
        } else {
          key = domain;
        }

        if (!domainTimes[key]) {
          domainTimes[key] = {
            time: 0,
            category: effectiveCategory,
            subcategory: subcategory,
            domain: domain
          };
        }

        // Distribute session time evenly across all visits
        domainTimes[key].time += session.duration / session.visits.length;
      } catch (error) {
        // Skip invalid URLs
      }
    });
  });

  // Include current active session's domain time (for real-time accuracy)
  try {
    const currentSessionResponse = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
    const currentSession = currentSessionResponse?.data?.session;

    if (currentSession && currentSession.visits?.length > 0) {
      const currentDuration = Date.now() - currentSession.startTime;
      const timePerVisit = currentDuration / currentSession.visits.length;

      currentSession.visits.forEach(visit => {
        try {
          const url = new URL(visit.url);
          const domain = normalizeDomain(url.hostname.replace('www.', ''));

          // Resolve category for unclassified sessions
          let effectiveCategory = currentSession.category;
          if (effectiveCategory === 'needs_server_classification' || effectiveCategory === 'uncategorized') {
            const wellKnown = getWellKnownDomain(domain);
            effectiveCategory = wellKnown?.category || 'other';
          }
          const subcategory = currentSession.subcategory || 'general';

          // Choose key based on chartColorMode
          let key;
          if (chartColorMode === 'subcategories') {
            key = `${domain}:${subcategory}`;
          } else if (chartColorMode === 'productivity') {
            const prodGroup = getProductivityGroup(effectiveCategory);
            const prodName = prodGroup === 0 ? 'Productive' : (prodGroup === 2 ? 'Unproductive' : 'Neutral');
            key = `${prodName}:${domain}`;
          } else {
            key = domain;
          }

          if (!domainTimes[key]) {
            domainTimes[key] = {
              time: 0,
              category: effectiveCategory,
              subcategory: subcategory,
              domain: domain
            };
          }
          domainTimes[key].time += timePerVisit;
        } catch (e) {
          // Skip invalid URLs
        }
      });

      // Update totalDayTime to include current session
      totalDayTime = (totalDayTime || 0) + currentDuration;
    }
  } catch (e) {
    console.debug('Error getting current session for most used:', e);
  }

  // If no session data (e.g., approximated data), use domains from stats
  if (Object.keys(domainTimes).length === 0 && stats.domains) {
    Object.entries(stats.domains).forEach(([rawDomain, data]) => {
      const domain = normalizeDomain(rawDomain);
      const subcategory = data.subcategory || 'general';

      // Choose key based on chartColorMode
      let key;
      if (chartColorMode === 'subcategories') {
        key = `${domain}:${subcategory}`;
      } else if (chartColorMode === 'productivity') {
        const prodGroup = getProductivityGroup(data.category);
        const prodName = prodGroup === 0 ? 'Productive' : (prodGroup === 2 ? 'Unproductive' : 'Neutral');
        key = `${prodName}:${domain}`;
      } else {
        key = domain;
      }

      if (!domainTimes[key]) {
        domainTimes[key] = { time: 0, category: data.category, subcategory: subcategory, domain: domain };
      }
      domainTimes[key].time += data.time;
    });
  }

  // Convert to array and sort by time
  const sites = Object.entries(domainTimes).map(([key, data]) => {
    const info = categoriesInfo[data.category] || { name: data.category, color: '#8E8E93' };
    // Use top3-consistent color if category is in top3, otherwise original category color
    const color = categoryColorMap[data.category] || info.color;

    // Display name based on chartColorMode
    let displayName;
    let categoryDisplayName;
    if (chartColorMode === 'subcategories') {
      displayName = data.domain;
      categoryDisplayName = `${info.name} - ${getSubcategoryName(data.subcategory)}`;
    } else if (chartColorMode === 'productivity') {
      displayName = data.domain;
      const prodGroup = getProductivityGroup(data.category);
      const prodName = prodGroup === 0 ? 'Productive' : (prodGroup === 2 ? 'Unproductive' : 'Neutral');
      categoryDisplayName = prodName;
    } else {
      displayName = data.domain;
      categoryDisplayName = info.name;
    }

    return {
      name: displayName,
      time: data.time,
      category: data.category,
      subcategory: data.subcategory,
      categoryName: categoryDisplayName,
      color: color,
      domain: data.domain  // Keep original domain for favicon
    };
  });

  const allSites = sites.sort((a, b) => b.time - a.time);

  if (allSites.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No sites tracked yet</div>';
    return;
  }

  // Store data for expansion
  container.allSites = allSites;
  container.sessions = sessions; // Store sessions for visit detail expansion
  // Only set visibleCount if not already set (preserve user's "Show More" clicks)
  if (!container.visibleCount) {
    container.visibleCount = 10;
  }
  container.totalDayTime = totalDayTime || stats.totalTime || 1;

  // Clear cached base times for real-time updates
  container.baseTimes = null;
  container.baseTotalTime = null;

  renderMostUsedItems(container, 'today');
}

/**
 * Render most used items with bar graph
 */
function renderMostUsedItems(container, containerId = 'today') {
  const allSites = container.allSites || [];
  const visibleCount = container.visibleCount || 10;
  const totalTime = container.totalDayTime || 1;
  const visibleSites = allSites.slice(0, visibleCount);

  let html = visibleSites.map((site, index) => {
    // Bar width based on percentage of total time
    const barWidth = Math.max(2, (site.time / totalTime) * 100);
    // Get favicon URL (use domain field for favicon, or fall back to name)
    const faviconDomain = site.domain || site.name;
    const primaryUrl = `https://icons.duckduckgo.com/ip3/${faviconDomain}.ico`;
    const fallbackUrl = `https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=64`;

    return `
      <div class="most-used-item-wrapper" data-site-index="${index}" data-container-id="${containerId}">
        <div class="most-used-item-new">
          <img class="most-used-favicon" src="${primaryUrl}" alt="" onerror="this.onerror=null; this.src='${fallbackUrl}'">
          <div class="most-used-content">
            <div class="most-used-header">
              <span class="most-used-name">${site.name}</span>
              <span class="most-used-divider">|</span>
              <span class="most-used-category">${site.categoryName}</span>
              <span class="most-used-expand-icon">▶</span>
            </div>
            <div class="most-used-bar-container">
              <div class="most-used-bar-track">
                <div class="most-used-bar" style="width: ${barWidth}%; background-color: ${site.color};"></div>
              </div>
              <span class="most-used-time">${formatTimeWithSeconds(site.time)}</span>
            </div>
          </div>
        </div>
        <div class="most-used-visits-detail"></div>
      </div>
    `;
  }).join('');

  // Add "Show More" button if there are more items
  if (allSites.length > visibleCount) {
    html += `<button class="btn-show-more" id="showMoreSites_${containerId}">Show More</button>`;
  }

  container.innerHTML = html;

  // Add click handlers for most-used items - toggle inline visit details
  container.querySelectorAll('.most-used-item-wrapper').forEach(wrapper => {
    const itemEl = wrapper.querySelector('.most-used-item-new');
    itemEl.addEventListener('click', async () => {
      const index = parseInt(wrapper.dataset.siteIndex);
      const site = allSites[index];
      if (!site) return;

      const detailEl = wrapper.querySelector('.most-used-visits-detail');
      const expandIcon = wrapper.querySelector('.most-used-expand-icon');
      const isExpanded = wrapper.classList.contains('expanded');

      // Collapse all other expanded items
      container.querySelectorAll('.most-used-item-wrapper.expanded').forEach(other => {
        if (other !== wrapper) {
          other.classList.remove('expanded');
          other.querySelector('.most-used-visits-detail').innerHTML = '';
          const otherIcon = other.querySelector('.most-used-expand-icon');
          if (otherIcon) otherIcon.textContent = '▶';
        }
      });

      if (isExpanded) {
        wrapper.classList.remove('expanded');
        detailEl.innerHTML = '';
        if (expandIcon) expandIcon.textContent = '▶';
      } else {
        wrapper.classList.add('expanded');
        if (expandIcon) expandIcon.textContent = '▼';

        // If sessions not available on container, load them dynamically (week view)
        let sessions = container.sessions || [];
        if (sessions.length === 0 && containerId === 'week') {
          detailEl.innerHTML = '<div class="visit-detail-empty">Loading...</div>';
          sessions = await loadWeekSessions();
          container.sessions = sessions;
        }
        detailEl.innerHTML = buildVisitDetailHTML(site.domain || site.name, sessions);
      }
    });
  });

  // Add click handler for "Show More"
  const showMoreBtn = document.getElementById(`showMoreSites_${containerId}`);
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      container.visibleCount += 10;
      renderMostUsedItems(container, containerId);
    });
  }
}

/**
 * Load sessions for all dates in the current week view
 * @returns {Array} Combined sessions from all dates
 */
async function loadWeekSessions() {
  try {
    const dateRange = getDateRange();
    const allSessions = [];
    await Promise.all(dateRange.dates.map(async date => {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date
      });
      const sessions = response?.data?.sessions || [];
      allSessions.push(...sessions);
    }));
    return allSessions;
  } catch (e) {
    console.error('Error loading week sessions:', e);
    return [];
  }
}

/**
 * Build HTML for visit details of a specific domain from sessions
 * @param {string} domain - The domain to filter visits for
 * @param {Array} sessions - Array of session objects
 * @returns {string} HTML string
 */
function buildVisitDetailHTML(domain, sessions) {
  // Collect all visits for this domain across sessions
  const visits = [];

  sessions.forEach(session => {
    if (!session.visits) return;
    session.visits.forEach(visit => {
      try {
        const url = new URL(visit.url);
        const visitDomain = normalizeDomain(url.hostname.replace('www.', ''));
        if (visitDomain === domain) {
          visits.push({
            url: visit.url,
            title: visit.title || visit.url,
            timestamp: visit.timestamp,
            duration: session.duration / session.visits.length,
            sessionCategory: session.category
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    });
  });

  // Sort by timestamp descending (most recent first)
  visits.sort((a, b) => b.timestamp - a.timestamp);

  if (visits.length === 0) {
    return '<div class="visit-detail-empty">No visit records available</div>';
  }

  const visitItems = visits.map(v => {
    const time = new Date(v.timestamp);
    const dateStr = time.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    const timeStr = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const displayTime = `${dateStr} ${timeStr}`;
    const durationStr = formatTimeWithSeconds(v.duration);
    // Truncate title if too long
    const title = v.title.length > 60 ? v.title.substring(0, 57) + '...' : v.title;
    // Get path from URL for display
    let path = '';
    try {
      const urlObj = new URL(v.url);
      path = urlObj.pathname + urlObj.search;
      if (path.length > 50) path = path.substring(0, 47) + '...';
      if (path === '/') path = '';
    } catch (e) {}

    return `
      <div class="visit-detail-item">
        <div class="visit-detail-time">${displayTime}</div>
        <div class="visit-detail-info">
          <div class="visit-detail-title">${escapeHtml(title)}</div>
          ${path ? `<div class="visit-detail-path">${escapeHtml(path)}</div>` : ''}
        </div>
        <div class="visit-detail-duration">${durationStr}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="visit-detail-header">
      <span>Visit History (${visits.length})</span>
    </div>
    ${visitItems}
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Load week data
 */
async function loadWeekData() {
  try {
    // Get date range based on current offset and type
    const dateRange = getDateRange();

    // Update title
    const weekTitle = document.getElementById('weekTitle');
    weekTitle.textContent = dateRange.title;

    // Get stats for each day in the range
    const dailyStats = await Promise.all(
      dateRange.dates.map(async date => {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_DATE_STATS',
          date
        });
        return {
          date,
          ...(response.data.stats || { categories: {}, totalTime: 0, pickups: 0 })
        };
      })
    );

    // Calculate aggregated stats
    const weeklyStats = aggregateWeeklyStats(dailyStats);
    weeklyStats.dailyStats = dailyStats;

    // Store current week data for re-rendering
    currentWeekDailyStats = dailyStats;

    const categoriesResponse = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    const categoriesInfo = categoriesResponse.data;

    displayWeekChart(weeklyStats.dailyStats, selectedWeekDate, categoriesInfo);
    displayWeekStats(weeklyStats);

    // Calculate and display productivity score for the week with last week comparison
    const weekProductivityStats = calculateProductivityStats(weeklyStats.weeklyCategories);

    // Get last week's productivity score for comparison
    let lastWeekScore = null;
    try {
      const lastWeekOffset = weekOffset - 1;
      const lastWeekInfo = getWeekDates(weekType, lastWeekOffset);
      const lastWeekDailyStats = await Promise.all(
        lastWeekInfo.dates.map(async (date) => {
          const response = await chrome.runtime.sendMessage({
            type: 'GET_DATE_STATS',
            date
          });
          return {
            date,
            ...(response.data?.stats || {}),
            categories: response.data?.stats?.categories || {}
          };
        })
      );
      const lastWeekAggregated = aggregateWeeklyStats(lastWeekDailyStats);
      const lastWeekProductivity = calculateProductivityStats(lastWeekAggregated.weeklyCategories);
      lastWeekScore = lastWeekProductivity.score;
    } catch (e) {
      console.error('Error getting last week stats:', e);
    }

    // Extract topSites from weekly categories for tooltip display
    const weekTopSites = extractTopSitesFromCategories(weeklyStats.weeklyCategories, weeklyStats.weeklyDomains);

    displayProductivityScore(weekProductivityStats, 'week', lastWeekScore, weekTopSites);

    displayWeekCategories(weeklyStats.weeklyCategories, categoriesInfo, weeklyStats.weeklyTotal, weeklyStats.weeklyDomains);
    displayWeekMostUsed(weeklyStats.weeklyDomains, categoriesInfo, weeklyStats.weeklyTotal, weeklyStats.weeklyCategories);

    // Display week usage stats with comparison to last week
    displayWeekUsageStats(weeklyStats, dailyStats);

    // Update goals display
    updateDashboardGoals();

  } catch (error) {
    console.error('Error loading week data:', error);
  }
}

/**
 * Display week usage stats with comparison to last week
 */
async function displayWeekUsageStats(weeklyStats, dailyStats) {
  const totalTime = weeklyStats.weeklyTotal || 0;
  const todayDate = getTodayDate();

  // Count sessions from daily stats
  let sessionCount = 0;
  dailyStats.forEach(day => {
    if (day.date <= todayDate) {
      sessionCount += day.pickups || 0;
    }
  });

  // Calculate daily average for current week
  const daysWithData = dailyStats.filter(d => d.date <= todayDate && d.totalTime > 0).length;
  const dailyAvg = daysWithData > 0 ? totalTime / daysWithData : 0;

  // Calculate productivity for the week
  const weekProductivity = calculateProductivityStats(weeklyStats.weeklyCategories || {});

  // Display values
  const totalTimeEl = document.getElementById('weekTotalTime');
  if (totalTimeEl) {
    totalTimeEl.textContent = formatTime(totalTime);
  }

  const sessionsEl = document.getElementById('weekSessions');
  if (sessionsEl) {
    sessionsEl.textContent = sessionCount;
  }

  const dailyAvgEl = document.getElementById('weekDailyAvg');
  if (dailyAvgEl) {
    dailyAvgEl.textContent = formatTime(dailyAvg);
  }

  const productivityEl = document.getElementById('weekProductivityStat');
  if (productivityEl) {
    productivityEl.textContent = weekProductivity.score + '%';
  }

  // Get last week's data for comparison
  try {
    const lastWeekStats = await getLastWeekStats(dailyStats);

    displayComparison('weekTotalCompare', totalTime, lastWeekStats.totalTime, true);
    displayComparison('weekSessionsCompare', sessionCount, lastWeekStats.sessions, false);
    displayComparison('weekDailyAvgCompare', dailyAvg, lastWeekStats.dailyAvg, true);
    displayProductivityComparison('weekProductivityCompare', weekProductivity.score, lastWeekStats.productivity || 0);

  } catch (error) {
    console.error('Error getting last week comparison:', error);
  }
}

/**
 * Get last week's stats for comparison
 */
async function getLastWeekStats(currentWeekStats) {
  // Get the first date of current week and go back 7 days
  const firstDay = currentWeekStats[0]?.date;
  if (!firstDay) return { totalTime: 0, sessions: 0, dailyAvg: 0, productivity: 0 };

  const firstDate = new Date(firstDay);
  const todayDate = getTodayDate();

  let totalTime = 0;
  let sessions = 0;
  let daysWithData = 0;
  const aggregatedCategories = {};

  for (let i = 1; i <= 7; i++) {
    const date = new Date(firstDate);
    date.setDate(firstDate.getDate() - i);
    const dateStr = formatDateLocal(date);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date: dateStr
      });
      const stats = response.data.stats || {};
      const time = stats.totalTime || 0;

      if (time > 0) {
        totalTime += time;
        daysWithData++;
      }
      sessions += stats.pickups || 0;

      // Aggregate categories for productivity calculation
      Object.entries(stats.categories || {}).forEach(([cat, data]) => {
        if (!aggregatedCategories[cat]) {
          aggregatedCategories[cat] = { time: 0 };
        }
        aggregatedCategories[cat].time += data.time || 0;
      });
    } catch (e) {}
  }

  const productivityStats = calculateProductivityStats(aggregatedCategories);

  return {
    totalTime,
    sessions,
    dailyAvg: daysWithData > 0 ? totalTime / daysWithData : 0,
    productivity: productivityStats.score
  };
}

/**
 * Get week dates for a specific week type and offset
 * @param {string} type - 'week' or 'weekend'
 * @param {number} offset - Week offset (0 = this week, -1 = last week, etc.)
 * @returns {Object} - { dates: string[], title: string }
 */
function getWeekDates(type, offset) {
  const today = new Date();
  const dates = [];
  let title = '';

  // Find this week's start based on weekStartDay setting
  const thisWeekStart = getWeekStart(today);

  // Calculate target week start based on offset
  const targetWeekStart = new Date(thisWeekStart);
  targetWeekStart.setDate(thisWeekStart.getDate() + (offset * 7));

  // Get full week (7 days from week start)
  for (let i = 0; i < 7; i++) {
    const date = new Date(targetWeekStart);
    date.setDate(targetWeekStart.getDate() + i);
    dates.push(formatDateLocal(date));
  }

  // Format title based on type and offset
  if (type === 'weekend') {
    if (offset === -1) {
      title = 'Last Weekend';
    } else if (offset === 0) {
      title = 'This Weekend';
    } else {
      const day5 = new Date(targetWeekStart);
      day5.setDate(targetWeekStart.getDate() + 5);
      const day6 = new Date(targetWeekStart);
      day6.setDate(targetWeekStart.getDate() + 6);
      title = formatWeekendTitle(day5, day6);
    }
  } else {
    if (offset === -1) {
      title = 'Last Week';
    } else if (offset === 0) {
      title = 'This Week';
    } else {
      const lastDay = new Date(targetWeekStart);
      lastDay.setDate(targetWeekStart.getDate() + 6);
      title = formatWeekTitle(targetWeekStart, lastDay);
    }
  }

  return { dates, title };
}

/**
 * Get date range based on current weekType and weekOffset
 */
function getDateRange() {
  const today = new Date();
  const dates = [];
  let title = '';

  // Find this week's start based on weekStartDay setting
  const thisWeekStart = getWeekStart(today);

  // Calculate target week start based on offset
  const targetWeekStart = new Date(thisWeekStart);
  targetWeekStart.setDate(thisWeekStart.getDate() + (weekOffset * 7));

  // Get full week (7 days from week start)
  for (let i = 0; i < 7; i++) {
    const date = new Date(targetWeekStart);
    date.setDate(targetWeekStart.getDate() + i);
    dates.push(formatDateLocal(date));
  }

  // Format title based on type and offset
  if (weekType === 'weekend') {
    if (weekOffset === -1) {
      title = 'Last Weekend';
    } else if (weekOffset === 0) {
      title = 'This Weekend';
    } else {
      // Format as date range for the weekend (5th and 6th day of week)
      const day5 = new Date(targetWeekStart);
      day5.setDate(targetWeekStart.getDate() + 5);
      const day6 = new Date(targetWeekStart);
      day6.setDate(targetWeekStart.getDate() + 6);
      title = formatWeekendTitle(day5, day6);
    }
  } else { // weekType === 'week'
    if (weekOffset === -1) {
      title = 'Last Week';
    } else if (weekOffset === 0) {
      title = 'This Week';
    } else {
      // Format as date range (first day - last day)
      const lastDay = new Date(targetWeekStart);
      lastDay.setDate(targetWeekStart.getDate() + 6);
      title = formatWeekTitle(targetWeekStart, lastDay);
    }
  }

  return { dates, title };
}

/**
 * Format weekend title (Sat-Sun)
 */
function formatWeekendTitle(saturday, sunday) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const satMonth = saturday.getMonth();
  const satDate = saturday.getDate();
  const sunMonth = sunday.getMonth();
  const sunDate = sunday.getDate();

  if (satMonth === sunMonth) {
    // Same month: "Dec 14-15"
    return `${monthNames[satMonth]} ${satDate}-${sunDate}`;
  } else {
    // Different months: "Dec 30 - Jan 1"
    return `${monthNames[satMonth]} ${satDate} - ${monthNames[sunMonth]} ${sunDate}`;
  }
}

/**
 * Format week title (Mon-Sun)
 */
function formatWeekTitle(monday, sunday) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const monMonth = monday.getMonth();
  const monDate = monday.getDate();
  const sunMonth = sunday.getMonth();
  const sunDate = sunday.getDate();

  if (monMonth === sunMonth) {
    // Same month: "Dec 9-15"
    return `${monthNames[monMonth]} ${monDate}-${sunDate}`;
  } else {
    // Different months: "Nov 30 - Dec 6"
    return `${monthNames[monMonth]} ${monDate} - ${monthNames[sunMonth]} ${sunDate}`;
  }
}

/**
 * Aggregate daily stats into weekly stats
 */
function aggregateWeeklyStats(dailyStats) {
  const weeklyCategories = {};
  const weeklyDomains = {};
  let weeklyTotal = 0;
  let weeklyPickups = 0;

  dailyStats.forEach(day => {
    weeklyTotal += day.totalTime || 0;
    weeklyPickups += day.pickups || 0;

    // Aggregate categories
    Object.entries(day.categories || {}).forEach(([category, data]) => {
      if (!weeklyCategories[category]) {
        weeklyCategories[category] = {
          time: 0,
          sessionCount: 0,
          topSitesMap: {}
        };
      }
      weeklyCategories[category].time += data.time || 0;
      weeklyCategories[category].sessionCount += data.sessionCount || 0;

      // Aggregate top sites with time
      const topSites = data.topSites || [];
      topSites.forEach(site => {
        const rawDomain = typeof site === 'string' ? site : site.domain;
        if (!rawDomain) return;
        const domain = normalizeDomain(rawDomain);

        if (!weeklyCategories[category].topSitesMap[domain]) {
          weeklyCategories[category].topSitesMap[domain] = 0;
        }
        // Get time from day.domains if available (try both raw and normalized)
        const domainData = day.domains?.[domain] || day.domains?.[rawDomain];
        weeklyCategories[category].topSitesMap[domain] += domainData?.time || site.time || 0;
      });
    });

    // Aggregate domains (normalize to merge m.youtube.com with youtube.com etc.)
    Object.entries(day.domains || {}).forEach(([rawDomain, data]) => {
      const domain = normalizeDomain(rawDomain);
      if (!weeklyDomains[domain]) {
        weeklyDomains[domain] = { time: 0, sessions: 0, category: data.category };
      }
      weeklyDomains[domain].time += data.time || 0;
      weeklyDomains[domain].sessions += data.sessions || 0;
    });
  });

  // Convert topSitesMap to sorted array with time
  Object.keys(weeklyCategories).forEach(category => {
    const sitesMap = weeklyCategories[category].topSitesMap;
    weeklyCategories[category].topSites = Object.entries(sitesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, time]) => ({ domain, time }));
    delete weeklyCategories[category].topSitesMap;
  });

  // Find most used category
  const mostUsedCategory = Object.entries(weeklyCategories)
    .sort((a, b) => b[1].time - a[1].time)[0]?.[0] || null;

  // Find highest and lowest days
  const sortedDays = [...dailyStats].sort((a, b) => (b.totalTime || 0) - (a.totalTime || 0));
  const highest = sortedDays[0];
  const lowest = sortedDays[sortedDays.length - 1];

  return {
    weeklyTotal,
    weeklyPickups,
    weeklyCategories,
    weeklyDomains,
    mostUsedCategory,
    dailyAverage: dailyStats.length > 0 ? weeklyTotal / dailyStats.length : 0,
    highest,
    lowest
  };
}

/**
 * Display week chart with stacked category bars
 */
function displayWeekChart(dailyStats, selectedDate = null, categoriesInfo = {}) {
  const canvas = document.getElementById('weekChart');

  // Chart size
  const container = canvas.parentElement;
  const containerWidth = container.offsetWidth || 500;
  const ctx = setupCanvas(canvas, containerWidth, CHART_WEEK_HEIGHT);

  // Use CSS dimensions for calculations
  const canvasWidth = containerWidth;
  const canvasHeight = CHART_WEEK_HEIGHT;
  const todayDateForMax = getTodayDate();

  // Round max time up to nearest hour (exclude future dates)
  const rawMaxTime = Math.max(...dailyStats.filter(d => d.date <= todayDateForMax).map(d => d.totalTime || 0), 1);
  const maxTime = Math.ceil(rawMaxTime / 3600000) * 3600000;

  // Chart dimensions
  const chartLeft = 10;
  const chartRight = 35;
  const chartTop = 8;
  const chartBottom = 24;
  const totalWidth = canvasWidth - chartLeft - chartRight;
  const barWidth = (totalWidth / 7) * 0.75;  // 75% (reduced from 85%)
  const barGap = (totalWidth - (barWidth * 7)) / 6;
  const maxHeight = canvasHeight - chartTop - chartBottom;

  // Calculate weekly total and average (only count days with data or days that have passed)
  const today = getTodayDate();
  const daysWithDataOrPassed = dailyStats.filter(d => d.totalTime > 0 || d.date <= today).length;
  const weeklyTotal = dailyStats.reduce((sum, d) => sum + (d.totalTime || 0), 0);
  const avgTime = daysWithDataOrPassed > 0 ? weeklyTotal / daysWithDataOrPassed : 0;

  // Update chart header stats (Daily Average)
  const weekChartAvg = document.getElementById('weekChartAvg');
  if (weekChartAvg) weekChartAvg.textContent = formatTime(avgTime);

  // Clear canvas and draw background
  const themeColors = getChartColors();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.fillStyle = isDark ? '#1C1C1E' : '#F2F2F7';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid lines - 4 lines, only label 50% and 100%
  ctx.strokeStyle = themeColors.border;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const labelLevels = [0.5, 1.0];
  ctx.fillStyle = themeColors.chartText;
  ctx.font = '10px -apple-system';
  ctx.textAlign = 'left';

  gridLevels.forEach(level => {
    const y = chartTop + maxHeight - (maxHeight * level);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth - chartRight, y);
    ctx.stroke();

    // Time label only for 50% and 100%
    if (labelLevels.includes(level)) {
      const timeAtLevel = maxTime * level;
      const hours = timeAtLevel / 3600000;
      const label = hours >= 1 ? `${hours}h` : `${Math.round(hours * 60)}m`;
      ctx.fillText(label, canvasWidth - chartRight + 5, y + 4);
    }
  });
  ctx.setLineDash([]);

  // Draw vertical lines between days (including start and end)
  ctx.strokeStyle = themeColors.border;
  ctx.setLineDash([4, 4]);
  // Start line
  ctx.beginPath();
  ctx.moveTo(chartLeft - 2, chartTop);
  ctx.lineTo(chartLeft - 2, chartTop + maxHeight);
  ctx.stroke();
  // Lines between bars
  for (let i = 1; i < 7; i++) {
    const x = chartLeft + i * (barWidth + barGap) - barGap / 2;
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartTop + maxHeight);
    ctx.stroke();
  }
  // End line (positioned to not overlap with labels)
  const chartEndXLine = chartLeft + 6 * (barWidth + barGap) + barWidth + 2;
  ctx.beginPath();
  ctx.moveTo(chartEndXLine, chartTop);
  ctx.lineTo(chartEndXLine, chartTop + maxHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Helper to get category color from categoriesInfo
  const getCategoryColor = (category) => {
    return categoriesInfo[category]?.color || '#8E8E93';
  };

  // Calculate weekly category totals to determine consistent top3 across all days
  const weeklyCategoryTotals = {};
  dailyStats.forEach(day => {
    if (day.categories) {
      Object.entries(day.categories).forEach(([category, data]) => {
        if (!weeklyCategoryTotals[category]) {
          weeklyCategoryTotals[category] = 0;
        }
        weeklyCategoryTotals[category] += data.time || 0;
      });
    }
  });

  // Sort by weekly total to get consistent top3 categories
  const weeklyTop3Categories = Object.entries(weeklyCategoryTotals)
    .filter(([cat, time]) => time > 0 && cat !== 'other' && cat !== 'undefined')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // Fixed colors for top 3: Blue, Tiffany Blue, Orange
  const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const grayColor = isDarkMode ? '#555555' : '#C8C8C8';

  // Create a map of category to color based on weekly ranking
  const categoryColorMap = {};
  weeklyTop3Categories.forEach((cat, index) => {
    categoryColorMap[cat] = top3Colors[index];
  });

  // Store bar positions for click handling
  canvas.barPositions = [];
  canvas.weeklyTop3Categories = weeklyTop3Categories; // Store for hover handler
  canvas.categoryColorMap = categoryColorMap;
  const todayDate = getTodayDate();

  // Draw bars
  dailyStats.forEach((day, index) => {
    const date = new Date(day.date);
    const isFuture = day.date > todayDate;
    const isSelected = day.date === todayDate; // Today is selected in week view
    const x = chartLeft + index * (barWidth + barGap);

    // Future dates have no data
    const effectiveTime = isFuture ? 0 : (day.totalTime || 0);
    const totalHeight = maxTime > 0 ? (effectiveTime / maxTime) * maxHeight : 0;

    // Store full bar area for click handling (exclude future dates)
    if (!isFuture) {
      canvas.barPositions.push({
        x,
        y: chartTop + maxHeight - totalHeight,
        width: barWidth,
        height: totalHeight,
        date: day.date
      });
    }

    if (isFuture) {
      // Future date: show empty placeholder (very light, no bar)
      ctx.fillStyle = themeColors.border;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, chartTop + maxHeight - 4, barWidth, 4);
      ctx.globalAlpha = 1.0;
    } else {
      // Draw day bar using weekly-consistent top3 colors
      const categories = day.categories || {};
      const totalTime = day.totalTime || 0;

      let currentY = chartTop + maxHeight;

      if (totalTime === 0) {
        // No data - show small gray bar
        ctx.fillStyle = themeColors.border;
        ctx.fillRect(x, chartTop + maxHeight - 10, barWidth, 10);
      } else if (chartColorMode === 'productivity') {
        // Productivity mode: draw each category with productivity colors
        let sortedCategories = Object.entries(categories)
          .filter(([_, data]) => data.time > 0);
        sortedCategories.sort((a, b) => getProductivityGroup(a[0]) - getProductivityGroup(b[0]));
        sortedCategories.forEach(([category, data]) => {
          const segmentHeight = (data.time / maxTime) * maxHeight;
          const segmentY = currentY - segmentHeight;
          ctx.fillStyle = getProductivityColor(category);
          ctx.fillRect(x, segmentY, barWidth, segmentHeight);
          currentY = segmentY;
        });
      } else if (chartColorMode === 'subcategories') {
        // Subcategories mode: group by subcategory and show top 3
        const subcatData = {};

        // Group by subcategory from categories[category].subcategories
        Object.entries(categories).forEach(([category, data]) => {
          if (data.time <= 0) return;

          const subcategories = data.subcategories || {};

          // If no subcategories data, use category time as 'general'
          if (Object.keys(subcategories).length === 0) {
            const key = `${category}:general`;
            subcatData[key] = {
              time: data.time,
              category: category,
              subcategory: 'general'
            };
          } else {
            // Add each subcategory
            Object.entries(subcategories).forEach(([subcategory, subcatInfo]) => {
              const key = `${category}:${subcategory}`;
              if (!subcatData[key]) {
                subcatData[key] = {
                  time: 0,
                  category: category,
                  subcategory: subcategory
                };
              }
              subcatData[key].time += subcatInfo.time || 0;
            });
          }
        });

        // Sort by time and get top 3
        const sortedSubcats = Object.entries(subcatData)
          .sort((a, b) => b[1].time - a[1].time);

        const top3Subcats = sortedSubcats.slice(0, 3);
        let restTime = totalTime;

        // Draw top 3 subcategories
        for (let i = 0; i < top3Subcats.length; i++) {
          const [key, data] = top3Subcats[i];
          const segmentHeight = (data.time / maxTime) * maxHeight;
          const segmentY = currentY - segmentHeight;
          ctx.fillStyle = top3Colors[i];
          ctx.fillRect(x, segmentY, barWidth, segmentHeight);
          currentY = segmentY;
          restTime -= data.time;
        }

        // Draw rest (gray) at top
        if (restTime > 0) {
          const restHeight = (restTime / maxTime) * maxHeight;
          const restY = currentY - restHeight;
          ctx.fillStyle = grayColor;
          ctx.fillRect(x, restY, barWidth, restHeight);
          currentY = restY;
        }
      } else {
        // Categories mode: use weekly-consistent top3 colors
        // Draw segments in order: top1 (Blue) -> top2 (Tiffany) -> top3 (Orange) -> rest (Gray)

        // Calculate time for each weekly top3 category in this day
        let restTime = totalTime;

        // Draw weekly top3 categories in order (bottom to top)
        weeklyTop3Categories.forEach((cat, idx) => {
          const catData = categories[cat];
          if (catData && catData.time > 0) {
            const segmentHeight = (catData.time / maxTime) * maxHeight;
            const segmentY = currentY - segmentHeight;
            ctx.fillStyle = top3Colors[idx];
            ctx.fillRect(x, segmentY, barWidth, segmentHeight);
            currentY = segmentY;
            restTime -= catData.time;
          }
        });

        // Draw rest (gray) at top - includes all non-top3 categories
        if (restTime > 0) {
          const restHeight = (restTime / maxTime) * maxHeight;
          const restY = currentY - restHeight;
          ctx.fillStyle = grayColor;
          ctx.fillRect(x, restY, barWidth, restHeight);
          currentY = restY;
        }
      }
    }

    // Draw day label
    const isDarkModeLabel = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isSelected ? (isDarkModeLabel ? '#FFFFFF' : '#000000') : (isDarkModeLabel ? '#AAAAAA' : '#666666');
    ctx.font = isSelected ? 'bold 12px -apple-system' : '12px -apple-system';
    ctx.textAlign = 'center';
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    ctx.fillText(dayName, x + barWidth / 2, chartTop + maxHeight + 20);
  });

  // Draw average line (dotted, with "Average" label outside graph)
  if (avgTime > 0) {
    const avgY = chartTop + maxHeight - (avgTime / maxTime) * maxHeight;
    const chartEndX = chartLeft + 7 * (barWidth + barGap) - barGap;
    ctx.strokeStyle = themeColors.textSecondary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, avgY);
    ctx.lineTo(chartEndX, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw "Average" label completely outside graph area
    ctx.fillStyle = themeColors.textSecondary;
    ctx.font = '10px -apple-system';
    ctx.textAlign = 'left';
    ctx.fillText('Avg', chartEndX + 5, avgY + 3);
  }

  // Add click handler - navigate to day tab on click
  canvas.onclick = function(event) {
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Find which bar was clicked (allow clicking anywhere in the column)
    const clickedBar = canvas.barPositions.find(bar => {
      return clickX >= bar.x && clickX <= bar.x + bar.width;
    });

    if (clickedBar) {
      // Navigate to today tab with this date
      currentTodayDate = clickedBar.date;
      updateTodayTitle();
      updateTodayNextButton();

      // Copy week's productivity score to today for smooth transition
      const weekScoreEl = document.getElementById('weekProductivityScore');
      const todayScoreEl = document.getElementById('todayProductivityScore');
      if (weekScoreEl && todayScoreEl) {
        todayScoreEl.textContent = weekScoreEl.textContent;
      }

      // Copy donut chart values and immediately redraw today's chart with week's values
      const weekValues = previousDonutValues['week'];
      previousDonutValues['today'] = { ...weekValues };
      const todayCanvas = document.getElementById('todayProductivityChart');
      if (todayCanvas && weekValues) {
        drawDonutChartStatic(todayCanvas, weekValues);
      }

      // Switch to today tab
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.querySelector('[data-tab="today"]').classList.add('active');
      document.getElementById('today').classList.add('active');

      // Load data for that date
      loadTodayData(clickedBar.date);
    }
  };

  // Store daily stats and categories info for tooltip
  canvas.dailyStats = dailyStats;
  canvas.categoriesInfo = categoriesInfo;

  // Change cursor on hover and show tooltip with segment detection
  canvas.onmousemove = function(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const containerRect = canvas.parentElement.getBoundingClientRect();

    const hoveredBar = canvas.barPositions.find(bar => {
      return mouseX >= bar.x && mouseX <= bar.x + bar.width;
    });

    if (hoveredBar) {
      canvas.style.cursor = 'pointer';

      // Find day data
      const dayData = canvas.dailyStats.find(d => d.date === hoveredBar.date);
      if (dayData) {
        const date = new Date(dayData.date);
        const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const categories = dayData.categories || {};
        const catInfo = canvas.categoriesInfo;

        // Detect which segment is being hovered (use weekly top3 colors for categories mode)
        let segmentInfo = findHoveredSegment(mouseY, categories, dayData.totalTime || 0, maxTime, chartTop, maxHeight, chartColorMode, catInfo, true, canvas.weeklyTop3Categories);

        // Hide tooltip if hovering over gray (rest) segment
        if (!segmentInfo && chartColorMode !== 'productivity') {
          hideGraphTooltip('weekChartTooltip');
          return;
        }

        // Get top sites for this day's segment
        let topSites = [];
        if (segmentInfo && categories) {
          const segmentCategories = getSegmentCategories(segmentInfo.name, chartColorMode);
          topSites = getTopSitesForCategories(segmentCategories, categories, catInfo);
        }

        showGraphTooltip('weekChartTooltip', {
          label: label,
          time: dayData.totalTime || 0,
          segmentName: segmentInfo?.name,
          segmentColor: segmentInfo?.color,
          segmentTime: segmentInfo?.time,
          topSites: topSites
        }, hoveredBar.x + hoveredBar.width, mouseY, { width: containerRect.width, height: containerRect.height }, chartColorMode, catInfo);
      }
    } else {
      canvas.style.cursor = 'default';
      hideGraphTooltip('weekChartTooltip');
    }
  };

  canvas.onmouseleave = function() {
    hideGraphTooltip('weekChartTooltip');
  };
}

/**
 * Display week stats
 */
function displayWeekStats(weeklyStats) {
  // Stats are now displayed in the chart header by displayWeekChart
}

/**
 * Display week categories (simple, compact view)
 */
function displayWeekCategories(categories, categoriesInfo, totalTime, domains = {}) {
  const container = document.getElementById('weekCategories');

  // Filter out 'other' and 'undefined', sort by time
  let sortedCategories = Object.entries(categories)
    .filter(([category, data]) => data.time > 0 && category !== 'other' && category !== 'undefined')
    .sort((a, b) => b[1].time - a[1].time);

  if (sortedCategories.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No activity this week</div>';
    return;
  }

  // Limit to max 5 categories for week view
  let filteredCategories = sortedCategories.slice(0, 5);

  // Find max time for relative bar sizing
  const maxCategoryTime = filteredCategories.length > 0 ? filteredCategories[0][1].time : 1;

  // Build category to top sites map
  const categoryTopSites = {};
  Object.entries(domains).forEach(([domain, data]) => {
    const cat = data.category || 'other';
    if (!categoryTopSites[cat]) categoryTopSites[cat] = [];
    categoryTopSites[cat].push({ domain, time: data.time });
  });
  // Sort each category's sites by time
  Object.keys(categoryTopSites).forEach(cat => {
    categoryTopSites[cat].sort((a, b) => b.time - a.time);
  });

  // Fixed colors for top 3: Blue, Tiffany Blue, Orange
  const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];

  container.innerHTML = filteredCategories.map(([category, data], index) => {
    const info = categoriesInfo[category] || { name: category, color: '#8E8E93' };
    const barWidth = Math.round((data.time / maxCategoryTime) * 100);
    const percentage = totalTime > 0 ? Math.round((data.time / totalTime) * 100) : 0;
    const topSites = categoryTopSites[category] || [];
    const topSitesJson = JSON.stringify(topSites.slice(0, 5)).replace(/"/g, '&quot;');
    // Use fixed colors for top 3, original category colors for rest
    const barColor = index < 3 ? top3Colors[index] : info.color;

    return `
      <div class="category-item-compact" data-category="${category}" data-color="${barColor}" data-time="${data.time}" data-topsites="${topSitesJson}">
        <div class="category-info-row">
          <span class="category-name-small">${info.name}</span>
          <span class="category-time-small">(${percentage}%) ${formatDecimalHours(data.time)}</span>
        </div>
        <div class="category-bar-small">
          <div class="category-bar-fill-small" style="width: ${barWidth}%; background-color: ${barColor};"></div>
        </div>
      </div>
    `;
  }).join('');

  // Add tooltip element if not exists
  if (!document.getElementById('weekCategoryTooltip')) {
    const tooltip = document.createElement('div');
    tooltip.id = 'weekCategoryTooltip';
    tooltip.className = 'graph-tooltip';
    container.style.position = 'relative';
    container.appendChild(tooltip);
  }

  // Setup hover events for week categories
  setupCategoryHoverEvents(container, categoriesInfo, 'weekCategoryTooltip');
}

/**
 * Display week most used sites
 */
function displayWeekMostUsed(weeklyDomains, categoriesInfo, weeklyTotal, weeklyCategories = {}) {
  const container = document.getElementById('weekMostUsed');

  // Calculate top3 categories based on weekly totals for consistent colors
  const top3Colors = ['#8BAF5B', '#40E0D0', '#FF9500'];
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const grayColor = isDarkMode ? '#555555' : '#C8C8C8';

  const weeklyTop3Categories = Object.entries(weeklyCategories)
    .filter(([cat, data]) => data.time > 0 && cat !== 'other' && cat !== 'undefined')
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 3)
    .map(([cat]) => cat);

  // Create color map for categories
  const categoryColorMap = {};
  weeklyTop3Categories.forEach((cat, index) => {
    categoryColorMap[cat] = top3Colors[index];
  });

  // Convert domains to array and sort by time
  const sites = Object.entries(weeklyDomains || {}).map(([domain, data]) => {
    const info = categoriesInfo[data.category] || { name: data.category, color: '#8E8E93' };
    // Use weekly-consistent color if category is in top3, otherwise original category color
    const color = categoryColorMap[data.category] || info.color;
    return {
      name: domain,
      time: data.time,
      category: data.category,
      categoryName: info.name,
      color: color
    };
  });

  const allSites = sites.sort((a, b) => b.time - a.time);

  if (allSites.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No sites tracked yet</div>';
    return;
  }

  // Store data for expansion
  container.allSites = allSites;
  // Only set visibleCount if not already set (preserve user's "Show More" clicks)
  if (!container.visibleCount) {
    container.visibleCount = 10;
  }
  container.totalDayTime = weeklyTotal || 1;

  renderMostUsedItems(container, 'week');
}

// Refresh data every 30 seconds if on today tab (only refresh if viewing actual today)
setInterval(() => {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  const today = getTodayDate();
  // Only auto-refresh if viewing today's data (not past dates)
  if (activeTab === 'today' && currentTodayDate === today) {
    loadTodayData(currentTodayDate);
  }
}, 30000);

// ============================================
// Detail Modal for Most Used Items
// ============================================

const detailModalOverlay = document.getElementById('detailModalOverlay');
const detailModalClose = document.getElementById('detailModalClose');

// Close modal on close button click
detailModalClose.addEventListener('click', hideDetailModal);

// Close modal on overlay click
detailModalOverlay.addEventListener('click', (e) => {
  if (e.target === detailModalOverlay) {
    hideDetailModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detailModalOverlay.classList.contains('active')) {
    hideDetailModal();
  }
});

function hideDetailModal() {
  detailModalOverlay.classList.remove('active');
}

/**
 * Show detail modal for a most-used item
 * @param {Object} site - Site data object
 * @param {Object} categoriesInfo - Categories information
 */
async function showDetailModal(site, categoriesInfo) {
  // Set title
  document.getElementById('detailModalTitle').textContent = site.name;

  // Set category badge with hierarchy
  const categoryInfo = categoriesInfo[site.category] || { name: 'Other', icon: '➕', color: '#8E8E93' };
  const categoryBadge = document.getElementById('detailModalCategory');
  categoryBadge.style.backgroundColor = categoryInfo.color + '20';
  categoryBadge.style.color = categoryInfo.color;
  document.getElementById('detailModalCategoryIcon').textContent = categoryInfo.icon;

  // Build category hierarchy: Group > Category (> Subcategory if exists)
  let categoryHierarchy = '';

  // Find productivity group
  let groupName = '';
  for (const [groupKey, groupInfo] of Object.entries(PRODUCTIVITY_GROUPS)) {
    if (groupInfo.categories.includes(site.category)) {
      groupName = groupInfo.name;
      break;
    }
  }

  // Build hierarchy string
  if (groupName) {
    categoryHierarchy = `${groupName} > ${categoryInfo.name}`;
  } else {
    categoryHierarchy = categoryInfo.name;
  }

  // Add subcategory if available
  if (site.subcategory && site.subcategory !== 'general') {
    const subcategoryName = getSubcategoryName(site.subcategory);
    categoryHierarchy += ` > ${subcategoryName}`;
  }

  document.getElementById('detailModalCategoryName').textContent = categoryHierarchy;

  // Set time
  document.getElementById('detailModalTime').textContent = formatTime(site.time);

  // Calculate classification scores
  const scores = await calculateClassificationScores(site.name);

  // Display scores
  const scoresContainer = document.getElementById('detailModalScores');
  let scoresHtml = '';

  if (scores.domainMatch) {
    const sourceLabel = scores.matchSource === 'server' ? 'Server Classified' : 'Domain Match';
    scoresHtml += `
      <div class="detail-score-item">
        <span class="detail-score-label">${sourceLabel} (${scores.matchedCategory})</span>
        <span class="detail-score-value">+100</span>
      </div>
    `;
  }

  if (scores.urlKeywords.length > 0) {
    scoresHtml += `
      <div class="detail-score-item">
        <span class="detail-score-label">URL Keywords: ${scores.urlKeywords.join(', ')}</span>
        <span class="detail-score-value">+${scores.urlKeywords.length * 10}</span>
      </div>
    `;
  }

  if (scores.titleKeywords.length > 0) {
    scoresHtml += `
      <div class="detail-score-item">
        <span class="detail-score-label">Title Keywords: ${scores.titleKeywords.join(', ')}</span>
        <span class="detail-score-value">+${scores.titleKeywords.length * 5}</span>
      </div>
    `;
  }

  if (scoresHtml === '') {
    // No domain match - classification was based on URL/title keywords
    scoresHtml = `
      <div class="detail-score-item">
        <span class="detail-score-label">URL/Title Keyword Analysis</span>
        <span class="detail-score-value">At tracking time</span>
      </div>
    `;
  }

  scoresContainer.innerHTML = scoresHtml;

  // Set note based on classification
  const noteEl = document.getElementById('detailModalNote');
  if (scores.isMultipurpose) {
    noteEl.innerHTML = `<strong>Multipurpose Site:</strong> "${site.name}" can belong to different categories based on content. Each page visit is classified by analyzing the page title and URL keywords.`;
  } else if (scores.domainMatch) {
    noteEl.textContent = `This site is classified as "${categoryInfo.name}" because the domain "${site.name}" is in the ${categoryInfo.name} category list.`;
  } else if (site.category === 'other') {
    noteEl.textContent = `This site is classified as "Other" because no matching domains or keywords were found.`;
  } else {
    noteEl.innerHTML = `This site was classified as "${categoryInfo.name}" based on <strong>URL path or page title keywords</strong> at the time of tracking (e.g., keywords like "docs", "code", "learn", etc. in the URL or title).`;
  }

  // Show modal
  detailModalOverlay.classList.add('active');
}

// Multipurpose domains list (same as in category-detector.js)
const MULTIPURPOSE_DOMAINS = [
  'youtube.com', 'youtu.be', 'music.youtube.com',
  'twitch.tv', 'reddit.com', 'bilibili.com',
  'naver.com', 'blog.naver.com', 'daum.net', 'tistory.com'
];

/**
 * Check if a domain is multipurpose
 * @param {string} domain - Domain name
 * @returns {boolean} True if multipurpose
 */
function isMultipurposeDomain(domain) {
  return MULTIPURPOSE_DOMAINS.some(d => domain.includes(d) || d.includes(domain));
}

/**
 * Calculate classification scores for a domain
 * @param {string} domain - Domain name
 * @returns {Object} Score breakdown
 */
async function calculateClassificationScores(domain) {
  // Get categories from extension
  const response = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
  const categories = response.data;

  const result = {
    domainMatch: false,
    matchedCategory: null,
    matchSource: null,
    urlKeywords: [],
    titleKeywords: [],
    isMultipurpose: isMultipurposeDomain(domain)
  };

  // Check each category for domain match (local category list)
  for (const [key, category] of Object.entries(categories)) {
    if (category.domains) {
      const domainMatch = category.domains.some(d =>
        domain.includes(d) || d.includes(domain)
      );
      if (domainMatch) {
        result.domainMatch = true;
        result.matchedCategory = category.name;
        result.matchSource = 'local';
        break;
      }
    }
  }

  // If no local match, check server domain cache
  if (!result.domainMatch) {
    try {
      const cacheResponse = await chrome.runtime.sendMessage({
        type: 'GET_DOMAIN_CATEGORY', domain
      });
      if (cacheResponse?.success && cacheResponse.data?.category &&
          cacheResponse.data.category !== 'other' && cacheResponse.data.category !== 'uncategorized') {
        const cat = cacheResponse.data.category;
        const categoryInfo = categories[cat];
        result.domainMatch = true;
        result.matchedCategory = categoryInfo?.name || cat;
        result.matchSource = 'server';
      }
    } catch (e) {
      // Ignore - cache lookup failed
    }
  }

  return result;
}

// ============================================
// Add Limit Modal (Single Page Design)
// ============================================

const addLimitModal = document.getElementById('addLimitModal');
const addLimitModalClose = document.getElementById('addLimitModalClose');
const addLimitBtn = document.getElementById('addLimitBtn');
const limitSelectionList = document.getElementById('limitSelectionList');
const limitTimeSection = document.getElementById('limitTimeSection');
const limitSelectedTarget = document.getElementById('limitSelectedTarget');
const limitSaveBtn = document.getElementById('limitSaveBtn');

// Current selection state: { type: 'category' | 'domains', category: string, domains?: string[] }
let currentLimitSelection = null;
let editingLimitCategory = null; // Track if we're editing an existing limit

// Open modal
addLimitBtn?.addEventListener('click', () => {
  openAddLimitModal();
});

// Close modal
addLimitModalClose?.addEventListener('click', () => {
  closeAddLimitModal();
});

// Close on overlay click
addLimitModal?.addEventListener('click', (e) => {
  if (e.target === addLimitModal) {
    closeAddLimitModal();
  }
});

/**
 * Generate a unique limit ID based on selection
 * - Domain-specific: "site:domain.com" or "sites:domain1,domain2"
 * - Category-specific: "category" or "cats:cat1,cat2"
 * - Mixed: "mixed:cat1,cat2:domain1,domain2"
 */
function generateLimitId(categories, domains) {
  // If only domains (no categories), use site: prefix
  if ((!categories || categories.length === 0) && domains && domains.length > 0) {
    if (domains.length === 1) {
      return `site:${domains[0]}`;
    }
    return `sites:${domains.sort().join(',')}`;
  }
  
  // If only categories (no domains), use category name or cats: prefix
  if ((!domains || domains.length === 0) && categories && categories.length > 0) {
    if (categories.length === 1) {
      return categories[0];
    }
    return `cats:${categories.sort().join(',')}`;
  }
  
  // If both categories and domains, use mixed: prefix
  if (categories && categories.length > 0 && domains && domains.length > 0) {
    return `mixed:${categories.sort().join(',')}:${domains.sort().join(',')}`;
  }
  
  // Fallback
  return 'other';
}

// Save button - save the limit
limitSaveBtn?.addEventListener('click', async () => {
  if (!currentLimitSelection) return;

  const hours = parseInt(document.getElementById('limitHours').value) || 0;
  const minutes = parseInt(document.getElementById('limitMinutes').value) || 0;
  const dailyLimit = (hours * 3600000) + (minutes * 60000);

  if (dailyLimit === 0) {
    alert('Please set a time limit greater than 0');
    return;
  }

  try {
    // Handle mixed selection type
    let includeSites = [];
    let includeCategories = [];

    if (currentLimitSelection.type === 'mixed') {
      includeCategories = currentLimitSelection.categories || [];
      includeSites = currentLimitSelection.domains || [];
    } else if (currentLimitSelection.type === 'domains') {
      includeSites = currentLimitSelection.domains || [];
    } else if (currentLimitSelection.type === 'category') {
      includeCategories = [currentLimitSelection.category];
    }
    
    // Generate unique limit ID
    let category = editingLimitCategory || generateLimitId(includeCategories, includeSites);

    // Preserve enabled state when editing
    let enabled = true;
    if (editingLimitCategory && categoryLimits[editingLimitCategory]) {
      enabled = categoryLimits[editingLimitCategory].enabled;
    }

    // Get blocking options
    const blockEnabled = document.getElementById('limitBlockEnabled')?.checked ?? true;
    const alertEnabled = document.getElementById('limitAlertEnabled')?.checked ?? true;

    const limit = {
      dailyLimit,
      enabled,
      alertMinutesBefore: alertEnabled ? 5 : 0,
      blockWhenLimitReached: blockEnabled,
      includeSites,
      includeCategories,
      excludeSites: []
    };

    await chrome.runtime.sendMessage({
      type: 'SET_LIMIT',
      category,
      limit
    });

    categoryLimits[category] = limit;
    renderActiveLimits();
    closeAddLimitModal();
  } catch (error) {
    console.error('Error saving limit:', error);
  }
});

function openAddLimitModal() {
  currentLimitSelection = null;
  editingLimitCategory = null;

  // Reset time inputs
  setLimitTime(1, 0);

  // Reset blocking options to defaults
  const blockEnabledCheckbox = document.getElementById('limitBlockEnabled');
  const alertEnabledCheckbox = document.getElementById('limitAlertEnabled');
  if (blockEnabledCheckbox) blockEnabledCheckbox.checked = true;
  if (alertEnabledCheckbox) alertEnabledCheckbox.checked = true;

  // Update modal title
  const modalTitle = addLimitModal?.querySelector('.modal-header h3');
  if (modalTitle) modalTitle.textContent = 'Add Usage Limit';

  // Hide time section and disable save button
  limitTimeSection?.classList.add('hidden');
  if (limitSaveBtn) limitSaveBtn.disabled = true;

  // Populate selection list
  populateLimitSelectionList();

  // Show modal
  addLimitModal.classList.add('active');
}

// Limit time helper functions
function setLimitTime(hours, minutes) {
  document.getElementById('limitHours').value = hours;
  document.getElementById('limitMinutes').value = minutes;
  updateLimitTimeDisplay();
  updateLimitTimePresets();
}

function updateLimitTimeDisplay() {
  const hours = parseInt(document.getElementById('limitHours').value) || 0;
  const minutes = parseInt(document.getElementById('limitMinutes').value) || 0;
  const display = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  const displayEl = document.getElementById('limitTimeDisplay');
  if (displayEl) displayEl.textContent = display;
}

function updateLimitTimePresets() {
  const hours = parseInt(document.getElementById('limitHours').value) || 0;
  const minutes = parseInt(document.getElementById('limitMinutes').value) || 0;
  const totalMinutes = hours * 60 + minutes;
  
  document.querySelectorAll('#limitTimePresets .preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.minutes) === totalMinutes);
  });
}

// Limit Time Presets
document.getElementById('limitTimePresets')?.addEventListener('click', (e) => {
  const preset = e.target.closest('.preset-btn');
  if (preset) {
    const totalMinutes = parseInt(preset.dataset.minutes);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    setLimitTime(hours, minutes);
  }
});

// Limit Time Adjust Buttons
document.getElementById('limitTimeDecrease')?.addEventListener('click', () => {
  let hours = parseInt(document.getElementById('limitHours').value) || 0;
  let minutes = parseInt(document.getElementById('limitMinutes').value) || 0;
  let totalMinutes = hours * 60 + minutes - 15;
  if (totalMinutes < 15) totalMinutes = 15;
  setLimitTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
});

document.getElementById('limitTimeIncrease')?.addEventListener('click', () => {
  let hours = parseInt(document.getElementById('limitHours').value) || 0;
  let minutes = parseInt(document.getElementById('limitMinutes').value) || 0;
  let totalMinutes = hours * 60 + minutes + 15;
  if (totalMinutes > 720) totalMinutes = 720; // Max 12 hours
  setLimitTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
});

function openEditLimitModal(category) {
  const limit = categoryLimits[category];
  if (!limit) return;

  editingLimitCategory = category;

  // Calculate hours and minutes from dailyLimit
  const hours = Math.floor(limit.dailyLimit / 3600000);
  const minutes = Math.floor((limit.dailyLimit % 3600000) / 60000);

  // Set time inputs with new UI
  setLimitTime(hours, minutes);

  // Update modal title
  const modalTitle = addLimitModal?.querySelector('.modal-header h3');
  if (modalTitle) modalTitle.textContent = 'Edit Usage Limit';

  // Populate selection list first (like adding new limit)
  populateLimitSelectionList();

  // Pre-select the category
  const categoryCheckbox = limitSelectionList?.querySelector(`.limit-category-checkbox[data-category="${category}"]`);
  if (categoryCheckbox) {
    categoryCheckbox.classList.add('checked');
  }

  // Pre-select included domains if any
  const includedDomains = limit.includeSites || [];
  includedDomains.forEach(domain => {
    const domainCheckbox = limitSelectionList?.querySelector(`.limit-domain-checkbox[data-domain="${domain}"]`);
    if (domainCheckbox) {
      domainCheckbox.classList.add('checked');
      // Expand the category's domain list
      const domainList = domainCheckbox.closest('.limit-domain-list');
      if (domainList) {
        domainList.classList.add('expanded');
        const expandBtn = domainList.previousElementSibling?.querySelector('.limit-expand-btn');
        if (expandBtn) expandBtn.classList.add('expanded');
      }
    }
  });

  // Pre-select included categories if any
  const includedCategories = limit.includeCategories || [];
  includedCategories.forEach(cat => {
    if (cat !== category) {
      const catCheckbox = limitSelectionList?.querySelector(`.limit-category-checkbox[data-category="${cat}"]`);
      if (catCheckbox) {
        catCheckbox.classList.add('checked');
      }
    }
  });

  // Set blocking options from existing limit
  const blockEnabledCheckbox = document.getElementById('limitBlockEnabled');
  const alertEnabledCheckbox = document.getElementById('limitAlertEnabled');
  if (blockEnabledCheckbox) {
    blockEnabledCheckbox.checked = limit.blockWhenLimitReached !== false;
  }
  if (alertEnabledCheckbox) {
    alertEnabledCheckbox.checked = (limit.alertMinutesBefore || 0) > 0;
  }

  // Update selection state and counts
  updateSelectionCounts();
  updateLimitSelection();

  // Show modal
  addLimitModal.classList.add('active');
}

function closeAddLimitModal() {
  addLimitModal.classList.remove('active');
  currentLimitSelection = null;
  editingLimitCategory = null;
}

function populateLimitSelectionList() {
  if (!limitSelectionList) return;

  const categoryList = Object.entries(categoriesInfo)
    .filter(([key]) => key !== 'other' && key !== 'undefined')
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  limitSelectionList.innerHTML = categoryList.map(([key, info]) => {
    // Get domains for this category
    const domains = categoryDomainUsage[key] || {};
    const sortedDomains = Object.entries(domains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const hasDomains = sortedDomains.length > 0;

    return `
      <div class="limit-category-item" data-category="${key}">
        <div class="limit-category-row">
          <div class="custom-checkbox limit-category-checkbox" data-category="${key}"></div>
          <span class="limit-category-icon">${info.icon}</span>
          <span class="limit-category-name">${info.name}</span>
          ${hasDomains ? `
            <span class="selection-count" data-category="${key}"></span>
            <button class="limit-expand-btn" data-category="${key}">▶</button>
          ` : ''}
        </div>
        ${hasDomains ? `
          <div class="limit-domain-list" data-category="${key}">
            ${sortedDomains.map(([domain, time]) => `
              <div class="limit-domain-item" data-domain="${domain}" data-category="${key}">
                <div class="custom-checkbox custom-checkbox-sm limit-domain-checkbox" data-category="${key}" data-domain="${domain}"></div>
                <img class="limit-domain-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="">
                <span class="limit-domain-name">${domain}</span>
                <span class="limit-domain-time">${formatTime(time)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Setup event listeners
  setupLimitSelectionListeners();
}

function setupLimitSelectionListeners() {
  // Category checkbox - can be combined with domain selections
  limitSelectionList.querySelectorAll('.limit-category-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const isChecked = checkbox.classList.contains('checked');

      // Toggle this category
      if (isChecked) {
        checkbox.classList.remove('checked');
      } else {
        checkbox.classList.add('checked');
      }

      updateSelectionCounts();
      updateLimitSelection();
    });
  });

  // Domain checkbox - allows multiple selection across categories
  limitSelectionList.querySelectorAll('.limit-domain-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const isChecked = checkbox.classList.contains('checked');

      // Toggle this domain
      if (isChecked) {
        checkbox.classList.remove('checked');
      } else {
        checkbox.classList.add('checked');
      }

      updateSelectionCounts();
      updateLimitSelection();
    });
  });

  // Make domain item row clickable
  limitSelectionList.querySelectorAll('.limit-domain-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('custom-checkbox')) return;
      const checkbox = item.querySelector('.limit-domain-checkbox');
      if (checkbox) checkbox.click();
    });
  });

  // Expand button
  limitSelectionList.querySelectorAll('.limit-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = e.target.dataset.category;
      const domainList = limitSelectionList.querySelector(`.limit-domain-list[data-category="${category}"]`);
      const isExpanded = domainList?.classList.contains('expanded');

      // Close all other domain lists
      limitSelectionList.querySelectorAll('.limit-domain-list').forEach(dl => dl.classList.remove('expanded'));
      limitSelectionList.querySelectorAll('.limit-expand-btn').forEach(b => b.classList.remove('expanded'));

      if (!isExpanded && domainList) {
        domainList.classList.add('expanded');
        e.target.classList.add('expanded');
      }
    });
  });
}

function updateLimitSelection() {
  // Gather all checked categories
  const checkedCategories = [];
  limitSelectionList.querySelectorAll('.limit-category-checkbox.checked').forEach(cb => {
    checkedCategories.push(cb.dataset.category);
  });

  // Gather all checked domains
  const checkedDomains = [];
  limitSelectionList.querySelectorAll('.limit-domain-checkbox.checked').forEach(cb => {
    checkedDomains.push(cb.dataset.domain);
  });

  if (checkedCategories.length === 0 && checkedDomains.length === 0) {
    resetLimitSelection();
    return;
  }

  // Build selection object
  const selection = {
    type: 'mixed',
    categories: checkedCategories,
    domains: checkedDomains
  };

  setLimitSelection(selection);
}

function updateSelectionCounts() {
  // Update count for each category
  const categories = limitSelectionList.querySelectorAll('.limit-category-item');
  categories.forEach(catItem => {
    const category = catItem.dataset.category;
    const countEl = catItem.querySelector('.selection-count');
    if (!countEl) return;

    const checkedInCategory = catItem.querySelectorAll('.limit-domain-checkbox.checked').length;
    if (checkedInCategory > 0) {
      countEl.textContent = `${checkedInCategory} selected`;
    } else {
      countEl.textContent = '';
    }
  });
}

function setLimitSelection(selection) {
  currentLimitSelection = selection;
  limitTimeSection?.classList.remove('hidden');
  if (limitSaveBtn) limitSaveBtn.disabled = false;

  // Build display text from categories and domains
  const displayParts = [];

  // Add category names
  if (selection.categories && selection.categories.length > 0) {
    selection.categories.forEach(cat => {
      const info = categoriesInfo[cat] || { icon: '📱', name: cat };
      displayParts.push(`${info.icon} ${info.name}`);
    });
  }

  // Add domain names
  if (selection.domains && selection.domains.length > 0) {
    selection.domains.forEach(domain => {
      displayParts.push(domain);
    });
  }

  // Format display text
  let displayText;
  if (displayParts.length === 1) {
    displayText = displayParts[0];
  } else if (displayParts.length === 2) {
    displayText = `${displayParts[0]}, ${displayParts[1]}`;
  } else {
    displayText = `${displayParts[0]}, ${displayParts[1]} <span class="active-limit-more">+${displayParts.length - 2} more</span>`;
  }

  limitSelectedTarget.innerHTML = `Limit for <strong>${displayText}</strong>`;
}

function resetLimitSelection() {
  currentLimitSelection = null;
  limitTimeSection?.classList.add('hidden');
  if (limitSaveBtn) limitSaveBtn.disabled = true;
  limitSelectionList.querySelectorAll('.custom-checkbox').forEach(cb => cb.classList.remove('checked'));
  updateSelectionCounts();
}

// Delete limit function
window.deleteLimit = async function(category) {
  try {
    await chrome.runtime.sendMessage({
      type: 'SET_LIMIT',
      category,
      limit: null
    });

    delete categoryLimits[category];
    renderActiveLimits();
  } catch (error) {
    console.error('Error deleting limit:', error);
  }
};

// ============================================
// Flow Chart
// ============================================
let flowchartDateOffset = 0;
let flowchartMode = 'categories';
let flowchartDeviceFilter = 'all';
let flowchartData = null;
let flowchartTooltip = null;
let flowchartAllSessions = []; // Store all sessions for device filtering

function initFlowChart() {
  // Date navigation
  const prevBtn = document.getElementById('flowchartPrevBtn');
  const nextBtn = document.getElementById('flowchartNextBtn');

  prevBtn?.addEventListener('click', () => {
    flowchartDateOffset--;
    loadFlowChart();
  });

  nextBtn?.addEventListener('click', () => {
    if (flowchartDateOffset < 0) {
      flowchartDateOffset++;
      loadFlowChart();
    }
  });

  // Mode toggle
  const toggleBtns = document.querySelectorAll('#flowchartToggle .chart-color-toggle');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      flowchartMode = btn.dataset.mode;
      renderFlowChartGrid();
      renderFlowChartLegend();
    });
  });

  // Device filter dropdown
  const deviceFilter = document.getElementById('flowchartDeviceFilter');
  deviceFilter?.addEventListener('change', (e) => {
    flowchartDeviceFilter = e.target.value;
    // Re-process sessions with new filter
    const filteredSessions = filterSessionsByDevice(flowchartAllSessions, flowchartDeviceFilter);
    flowchartData = processSessionsToMinutes(filteredSessions, categoriesInfo);
    renderFlowChartGrid();
    renderFlowChartLegend();
    calculateFocusStats(filteredSessions, categoriesInfo);
  });

  // Populate device dropdown on load
  populateDeviceFilter();

  // Create tooltip
  if (!flowchartTooltip) {
    flowchartTooltip = document.createElement('div');
    flowchartTooltip.className = 'flowchart-tooltip';
    flowchartTooltip.innerHTML = `
      <div class="flowchart-tooltip-time"></div>
      <div class="flowchart-tooltip-category"></div>
      <div class="flowchart-tooltip-domain"></div>
      <div class="flowchart-tooltip-device"></div>
    `;
    document.body.appendChild(flowchartTooltip);
  }
}

/**
 * Populate device filter dropdown with connected devices
 */
async function populateDeviceFilter() {
  const select = document.getElementById('flowchartDeviceFilter');
  if (!select) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTED_DEVICES' });
    const devices = response?.data || [];

    // Reset options: always show All / This PC / Other Devices
    select.innerHTML = `
      <option value="all">All Devices</option>
      <option value="local">This PC</option>
      <option value="remote">Other Devices</option>
    `;

    // Only show individual device names when exactly 1 other device (2-device setup)
    if (devices.length === 1) {
      const option = document.createElement('option');
      option.value = devices[0].deviceName;
      option.textContent = `📱 ${devices[0].deviceName}`;
      select.appendChild(option);
    }

    // Restore previous selection (fallback to 'all' if previous selection no longer exists)
    const exists = Array.from(select.options).some(opt => opt.value === flowchartDeviceFilter);
    select.value = exists ? flowchartDeviceFilter : 'all';
    if (!exists) flowchartDeviceFilter = 'all';
  } catch (e) {
    console.debug('[Dashboard] Error populating device filter:', e);
  }
}

/**
 * Filter sessions by device
 */
function filterSessionsByDevice(sessions, deviceFilter) {
  if (!deviceFilter || deviceFilter === 'all') {
    return sessions;
  }
  if (deviceFilter === 'local') {
    return sessions.filter(s => !s.deviceSource || s.deviceSource === 'local');
  }
  if (deviceFilter === 'remote') {
    return sessions.filter(s => s.deviceSource && s.deviceSource !== 'local');
  }
  // Specific device name
  return sessions.filter(s => s.deviceSource === deviceFilter);
}

async function loadFlowChart() {
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + flowchartDateOffset);
    const dateStr = formatDateLocal(targetDate);

    // Update title
    const titleEl = document.getElementById('flowchartTitle');
    if (titleEl) {
      if (flowchartDateOffset === 0) {
        titleEl.textContent = 'Today';
      } else if (flowchartDateOffset === -1) {
        titleEl.textContent = 'Yesterday';
      } else {
        titleEl.textContent = targetDate.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric'
        });
      }
    }

    // Get sessions for the date
    const response = await chrome.runtime.sendMessage({
      type: 'GET_DATE_STATS',
      date: dateStr
    });

    const allSessions = response.data?.sessions || [];
    flowchartAllSessions = allSessions;

    const categoriesResponse = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    categoriesInfo = categoriesResponse.data;

    // Update device filter dropdown (might have new device names)
    populateDeviceFilter();

    // Filter sessions by selected device
    const filteredSessions = filterSessionsByDevice(allSessions, flowchartDeviceFilter);

    // Process sessions into minute-by-minute data
    flowchartData = processSessionsToMinutes(filteredSessions, categoriesInfo);

    // Render components
    renderFlowChartMinutesHeader();
    renderFlowChartHoursColumn();
    renderFlowChartGrid();
    renderFlowChartLegend();

    // Calculate and display focus stats
    calculateFocusStats(filteredSessions, categoriesInfo);

  } catch (error) {
    console.error('Error loading flow chart:', error);
  }
}

function processSessionsToMinutes(sessions, categoriesInfo) {
  // Create 24x60 grid (hours x minutes)
  const grid = Array.from({ length: 24 }, () =>
    Array.from({ length: 60 }, () => null)
  );

  sessions.forEach(session => {
    const productivityType = getProductivityType(session.category);
    const isRemote = session.deviceSource && session.deviceSource !== 'local';
    const deviceSource = session.deviceSource || 'local';

    // If session has visits, use them to calculate time ranges
    if (session.visits && session.visits.length > 0) {
      const visits = session.visits;

      for (let i = 0; i < visits.length; i++) {
        const visit = visits[i];
        const visitStart = new Date(visit.timestamp);

        // End time is next visit's timestamp or session's endTime
        let visitEnd;
        if (i < visits.length - 1) {
          visitEnd = new Date(visits[i + 1].timestamp);
        } else {
          visitEnd = session.endTime ? new Date(session.endTime) : new Date();
        }

        // Extract domain from URL
        let domain = '';
        try {
          domain = new URL(visit.url).hostname;
        } catch (e) {}

        // Fill grid for this visit's duration
        let current = new Date(visitStart);
        while (current < visitEnd) {
          const hour = current.getHours();
          const minute = current.getMinutes();

          if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
            grid[hour][minute] = {
              category: session.category,
              domain: domain,
              productivityType,
              isRemote,
              deviceSource
            };
          }

          current = new Date(current.getTime() + 60000); // +1 minute
        }
      }
    } else {
      // Fallback: use session's startTime and endTime
      const startTime = new Date(session.startTime);
      const endTime = session.endTime ? new Date(session.endTime) : new Date();

      let current = new Date(startTime);
      while (current < endTime) {
        const hour = current.getHours();
        const minute = current.getMinutes();

        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          grid[hour][minute] = {
            category: session.category,
            domain: session.domain || '',
            productivityType,
            isRemote,
            deviceSource
          };
        }

        current = new Date(current.getTime() + 60000); // +1 minute
      }
    }
  });

  return grid;
}

function getProductivityType(category) {
  const productiveCategories = ['productivity', 'education'];
  const unproductiveCategories = ['social', 'entertainment', 'games', 'adult'];

  if (productiveCategories.includes(category)) return 'productive';
  if (unproductiveCategories.includes(category)) return 'unproductive';
  return 'neutral';
}

function renderFlowChartMinutesHeader() {
  const container = document.getElementById('flowchartMinutesHeader');
  if (!container) return;

  container.innerHTML = '';
  for (let m = 0; m < 60; m++) {
    const label = document.createElement('div');
    label.className = 'flowchart-minute-label';
    label.textContent = m % 5 === 0 ? m : '';
    container.appendChild(label);
  }
}

function renderFlowChartHoursColumn() {
  const container = document.getElementById('flowchartHoursColumn');
  if (!container) return;

  container.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const label = document.createElement('div');
    label.className = 'flowchart-hour-label';
    label.textContent = `${h.toString().padStart(2, '0')}:00`;
    container.appendChild(label);
  }
}

function renderFlowChartGrid() {
  const container = document.getElementById('flowchartGrid');
  if (!container || !flowchartData) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  container.innerHTML = '';

  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'flowchart-row';

    for (let m = 0; m < 60; m++) {
      const cell = document.createElement('div');
      cell.className = 'flowchart-cell';

      const data = flowchartData[h][m];

      if (data) {
        const color = getCellColor(data, isDark);
        cell.style.backgroundColor = color;

        // Remote sessions: show with reduced opacity
        if (data.isRemote) {
          cell.style.opacity = '0.55';
          cell.classList.add('remote-cell');
        }

        // Add hover events
        cell.addEventListener('mouseenter', (e) => showFlowchartTooltip(e, h, m, data));
        cell.addEventListener('mouseleave', hideFlowchartTooltip);
        cell.addEventListener('mousemove', (e) => moveFlowchartTooltip(e));
      } else {
        cell.classList.add('empty');
      }

      row.appendChild(cell);
    }

    container.appendChild(row);
  }
}

function getCellColor(data, isDark) {
  if (flowchartMode === 'productivity') {
    switch (data.productivityType) {
      case 'productive': return '#34C759';
      case 'unproductive': return '#FF3B30';
      default: return isDark ? '#555555' : '#A0A0A0';
    }
  } else {
    // Category mode - use category colors
    const categoryColors = {
      social: '#8BAF5B',
      entertainment: '#FF9500',
      productivity: '#34C759',
      shopping: '#FF2D55',
      news: '#5856D6',
      games: '#AF52DE',
      education: '#00C7BE',
      adult: '#FF3B30',
      other: isDark ? '#555555' : '#A0A0A0'
    };
    return categoryColors[data.category] || categoryColors.other;
  }
}

function showFlowchartTooltip(e, hour, minute, data) {
  if (!flowchartTooltip) return;

  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  flowchartTooltip.querySelector('.flowchart-tooltip-time').textContent = timeStr;

  const categoryText = flowchartMode === 'productivity'
    ? (data.productivityType || 'unknown')
    : (data.category || 'unknown');
  flowchartTooltip.querySelector('.flowchart-tooltip-category').textContent =
    categoryText.charAt(0).toUpperCase() + categoryText.slice(1);
  flowchartTooltip.querySelector('.flowchart-tooltip-domain').textContent = data.domain || '';

  // Show device source
  const deviceEl = flowchartTooltip.querySelector('.flowchart-tooltip-device');
  if (deviceEl) {
    if (data.isRemote) {
      deviceEl.textContent = `📱 ${data.deviceSource || 'Other Devices'}`;
      deviceEl.style.display = 'block';
    } else {
      deviceEl.textContent = '';
      deviceEl.style.display = 'none';
    }
  }

  flowchartTooltip.classList.add('visible');
  moveFlowchartTooltip(e);
}

function moveFlowchartTooltip(e) {
  if (!flowchartTooltip) return;
  flowchartTooltip.style.left = (e.clientX + 10) + 'px';
  flowchartTooltip.style.top = (e.clientY + 10) + 'px';
}

function hideFlowchartTooltip() {
  if (flowchartTooltip) {
    flowchartTooltip.classList.remove('visible');
  }
}

function renderFlowChartLegend() {
  const container = document.getElementById('flowchartLegend');
  if (!container) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Check if there are any remote sessions in the current data
  let hasRemoteSessions = false;
  if (flowchartData) {
    for (let h = 0; h < 24 && !hasRemoteSessions; h++) {
      for (let m = 0; m < 60 && !hasRemoteSessions; m++) {
        if (flowchartData[h][m]?.isRemote) {
          hasRemoteSessions = true;
        }
      }
    }
  }

  let legendHtml = '';

  if (flowchartMode === 'productivity') {
    legendHtml = `
      <div class="flowchart-legend-item">
        <div class="flowchart-legend-color" style="background: #34C759;"></div>
        <span>Productive</span>
      </div>
      <div class="flowchart-legend-item">
        <div class="flowchart-legend-color" style="background: #FF3B30;"></div>
        <span>Unproductive</span>
      </div>
      <div class="flowchart-legend-item">
        <div class="flowchart-legend-color" style="background: ${isDark ? '#555555' : '#A0A0A0'};"></div>
        <span>Neutral</span>
      </div>
    `;
  } else {
    const categoryColors = {
      social: ['#8BAF5B', 'Social'],
      entertainment: ['#FF9500', 'Entertainment'],
      productivity: ['#34C759', 'Productivity'],
      shopping: ['#FF2D55', 'Shopping'],
      news: ['#5856D6', 'News'],
      games: ['#AF52DE', 'Games'],
      education: ['#00C7BE', 'Education']
    };

    legendHtml = Object.entries(categoryColors).map(([key, [color, label]]) => `
      <div class="flowchart-legend-item">
        <div class="flowchart-legend-color" style="background: ${color};"></div>
        <span>${label}</span>
      </div>
    `).join('');
  }

  // Add remote device indicator to legend
  if (hasRemoteSessions) {
    legendHtml += `
      <div class="flowchart-legend-item flowchart-legend-divider">|</div>
      <div class="flowchart-legend-item">
        <div class="flowchart-legend-color" style="background: #888; opacity: 0.55;"></div>
        <span>📱 Other Device</span>
      </div>
    `;
  }

  container.innerHTML = legendHtml;
}

function calculateFocusStats(sessions, categoriesInfo) {
  // Use flowchartData to calculate based on 2-minute intervals
  if (!flowchartData) return;

  let longestFocus = { duration: 0, startHour: null, startMin: null };
  let longestDistraction = { duration: 0, startHour: null, startMin: null };

  let currentFocusStart = null;
  let currentFocusCount = 0;
  let currentDistractionStart = null;
  let currentDistractionCount = 0;

  // Iterate through 2-minute intervals
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 2) {
      // Check what's in this 2-minute block
      const data1 = flowchartData[h][m];
      const data2 = flowchartData[h][m + 1];

      // Determine dominant productivity type in this 2-min block
      let blockType = null;
      if (data1 || data2) {
        const types = [data1?.productivityType, data2?.productivityType].filter(Boolean);
        if (types.length > 0) {
          const productive = types.filter(t => t === 'productive').length;
          const unproductive = types.filter(t => t === 'unproductive').length;
          if (productive >= unproductive && productive > 0) {
            blockType = 'productive';
          } else if (unproductive > 0) {
            blockType = 'unproductive';
          }
        }
      }

      if (blockType === 'productive') {
        // End distraction streak
        if (currentDistractionCount > 0 && currentDistractionCount * 2 > longestDistraction.duration) {
          longestDistraction.duration = currentDistractionCount * 2;
          longestDistraction.startHour = currentDistractionStart.h;
          longestDistraction.startMin = currentDistractionStart.m;
        }
        currentDistractionCount = 0;
        currentDistractionStart = null;

        // Continue focus streak
        if (!currentFocusStart) currentFocusStart = { h, m };
        currentFocusCount++;
      } else if (blockType === 'unproductive') {
        // End focus streak
        if (currentFocusCount > 0 && currentFocusCount * 2 > longestFocus.duration) {
          longestFocus.duration = currentFocusCount * 2;
          longestFocus.startHour = currentFocusStart.h;
          longestFocus.startMin = currentFocusStart.m;
        }
        currentFocusCount = 0;
        currentFocusStart = null;

        // Continue distraction streak
        if (!currentDistractionStart) currentDistractionStart = { h, m };
        currentDistractionCount++;
      } else {
        // Neutral or empty - end both streaks
        if (currentFocusCount > 0 && currentFocusCount * 2 > longestFocus.duration) {
          longestFocus.duration = currentFocusCount * 2;
          longestFocus.startHour = currentFocusStart.h;
          longestFocus.startMin = currentFocusStart.m;
        }
        if (currentDistractionCount > 0 && currentDistractionCount * 2 > longestDistraction.duration) {
          longestDistraction.duration = currentDistractionCount * 2;
          longestDistraction.startHour = currentDistractionStart.h;
          longestDistraction.startMin = currentDistractionStart.m;
        }
        currentFocusCount = 0;
        currentFocusStart = null;
        currentDistractionCount = 0;
        currentDistractionStart = null;
      }
    }
  }

  // Check final streaks
  if (currentFocusCount > 0 && currentFocusCount * 2 > longestFocus.duration) {
    longestFocus.duration = currentFocusCount * 2;
    longestFocus.startHour = currentFocusStart.h;
    longestFocus.startMin = currentFocusStart.m;
  }
  if (currentDistractionCount > 0 && currentDistractionCount * 2 > longestDistraction.duration) {
    longestDistraction.duration = currentDistractionCount * 2;
    longestDistraction.startHour = currentDistractionStart.h;
    longestDistraction.startMin = currentDistractionStart.m;
  }

  // Update UI (duration is in minutes, convert to ms for formatTime)
  const focusValueEl = document.getElementById('flowchartLongestFocus');
  const focusTimeEl = document.getElementById('flowchartLongestFocusTime');
  const distractionValueEl = document.getElementById('flowchartLongestDistraction');
  const distractionTimeEl = document.getElementById('flowchartLongestDistractionTime');

  if (focusValueEl) {
    focusValueEl.textContent = longestFocus.duration > 0 ? `${longestFocus.duration}m` : '0m';
  }
  if (focusTimeEl && longestFocus.startHour !== null) {
    focusTimeEl.textContent = `at ${longestFocus.startHour.toString().padStart(2, '0')}:${longestFocus.startMin.toString().padStart(2, '0')}`;
  } else if (focusTimeEl) {
    focusTimeEl.textContent = '--';
  }

  if (distractionValueEl) {
    distractionValueEl.textContent = longestDistraction.duration > 0 ? `${longestDistraction.duration}m` : '0m';
  }
  if (distractionTimeEl && longestDistraction.startHour !== null) {
    distractionTimeEl.textContent = `at ${longestDistraction.startHour.toString().padStart(2, '0')}:${longestDistraction.startMin.toString().padStart(2, '0')}`;
  } else if (distractionTimeEl) {
    distractionTimeEl.textContent = '--';
  }
}

// Initialize flow chart on page load
document.addEventListener('DOMContentLoaded', initFlowChart);


// ============================================
// Flow Chart Improvements
// ============================================
let flowchartGroupSize = 2;
let flowchartDetailData = null;

function initFlowChartImprovements() {
  // Group size buttons
  const groupBtns = document.querySelectorAll('#flowchartGroupBtns .flowchart-group-btn');
  groupBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      groupBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      flowchartGroupSize = parseInt(btn.dataset.group);
      renderFlowChartGrid();
      renderFlowChartMinutesHeader();
    });
  });

  // Detail modal close
  const detailModal = document.getElementById('flowchartDetailModal');
  const detailClose = document.getElementById('flowchartDetailClose');

  detailClose?.addEventListener('click', () => {
    detailModal.classList.remove('visible');
  });

  detailModal?.addEventListener('click', (e) => {
    if (e.target === detailModal) {
      detailModal.classList.remove('visible');
    }
  });
}

function updateCurrentTimeLine() {
  const line = document.getElementById('flowchartCurrentTimeLine');
  const grid = document.getElementById('flowchartGrid');

  if (!line || !grid || flowchartDateOffset !== 0) {
    if (line) line.style.display = 'none';
    return;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const cellsPerRow = Math.ceil(60 / flowchartGroupSize);
  const cellWidth = grid.offsetWidth / cellsPerRow;
  const cellIndex = Math.floor(currentMinute / flowchartGroupSize);
  const cellProgress = (currentMinute % flowchartGroupSize) / flowchartGroupSize;

  const leftPos = (cellIndex + cellProgress) * cellWidth + 50; // 50px for hours column
  const topPos = currentHour * 18; // 18px per row
  const height = grid.offsetHeight - topPos;

  line.style.display = 'block';
  line.style.left = leftPos + 'px';
  line.style.top = topPos + 'px';
  line.style.height = height + 'px';
}

function showFlowchartDetailModal(hour, minute, data) {
  const modal = document.getElementById('flowchartDetailModal');

  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  document.getElementById('flowchartDetailTime').textContent = timeStr;
  document.getElementById('flowchartDetailUrl').textContent = data.domain || 'Unknown';
  document.getElementById('flowchartDetailTitle').textContent = data.title || '';

  const favicon = document.getElementById('flowchartDetailFavicon');
  if (data.domain) {
    favicon.src = `https://www.google.com/s2/favicons?domain=${data.domain}&sz=32`;
    favicon.style.display = 'block';
  } else {
    favicon.style.display = 'none';
  }

  const categoryColors = {
    social: '#8BAF5B', entertainment: '#FF9500', productivity: '#34C759',
    shopping: '#FF2D55', news: '#5856D6', games: '#AF52DE',
    education: '#00C7BE', adult: '#FF3B30', other: '#8E8E93'
  };

  const dot = document.getElementById('flowchartDetailCategoryDot');
  dot.style.background = categoryColors[data.category] || categoryColors.other;
  document.getElementById('flowchartDetailCategory').textContent =
    (data.category || 'other').charAt(0).toUpperCase() + (data.category || 'other').slice(1);

  const prodEl = document.getElementById('flowchartDetailProductivity');
  const prodType = data.productivityType || 'neutral';
  prodEl.textContent = prodType.charAt(0).toUpperCase() + prodType.slice(1);
  prodEl.style.color = prodType === 'productive' ? '#34C759' :
                       prodType === 'unproductive' ? '#FF3B30' : '#8E8E93';

  modal.classList.add('visible');
}

// Override renderFlowChartGrid to support grouping and click
const originalRenderFlowChartGrid = renderFlowChartGrid;
renderFlowChartGrid = function() {
  const container = document.getElementById('flowchartGrid');
  if (!container || !flowchartData) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const cellsPerRow = Math.ceil(60 / flowchartGroupSize);

  container.innerHTML = '';

  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'flowchart-row';

    for (let c = 0; c < cellsPerRow; c++) {
      const startMin = c * flowchartGroupSize;
      const endMin = Math.min(startMin + flowchartGroupSize, 60);

      const cell = document.createElement('div');
      cell.className = 'flowchart-cell';

      // Find dominant category in this group
      const categoryCount = {};
      let hasData = false;
      let firstData = null;

      for (let m = startMin; m < endMin; m++) {
        const data = flowchartData[h][m];
        if (data) {
          hasData = true;
          if (!firstData) firstData = { ...data, minute: m };
          const key = flowchartMode === 'productivity' ? data.productivityType : data.category;
          categoryCount[key] = (categoryCount[key] || 0) + 1;
        }
      }

      if (hasData) {
        // Get dominant category
        const dominant = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0][0];
        const color = getCellColor({ category: dominant, productivityType: dominant }, isDark);
        cell.style.backgroundColor = color;

        // Click handler
        cell.addEventListener('click', () => {
          if (firstData) {
            showFlowchartDetailModal(h, firstData.minute, firstData);
          }
        });

        // Hover
        cell.addEventListener('mouseenter', (e) => showFlowchartTooltip(e, h, startMin, firstData));
        cell.addEventListener('mouseleave', hideFlowchartTooltip);
        cell.addEventListener('mousemove', moveFlowchartTooltip);
      } else {
        cell.classList.add('empty');
      }

      row.appendChild(cell);
    }

    container.appendChild(row);
  }

  // Update current time line
  updateCurrentTimeLine();
};

// Override renderFlowChartMinutesHeader to support grouping
const originalRenderMinutesHeader = renderFlowChartMinutesHeader;
renderFlowChartMinutesHeader = function() {
  const container = document.getElementById('flowchartMinutesHeader');
  if (!container) return;

  const cellsPerRow = Math.ceil(60 / flowchartGroupSize);
  container.innerHTML = '';

  for (let c = 0; c < cellsPerRow; c++) {
    const minute = c * flowchartGroupSize;
    const label = document.createElement('div');
    label.className = 'flowchart-minute-label';
    label.textContent = minute;
    container.appendChild(label);
  }
};

document.addEventListener('DOMContentLoaded', initFlowChartImprovements);

// Update current time line every minute
setInterval(updateCurrentTimeLine, 60000);

// ============================================
// Site Analysis Modal
// ============================================
let currentSiteAnalysisData = null;

function initSiteAnalysisModal() {
  const modal = document.getElementById('siteAnalysisModal');
  const closeBtn = document.getElementById('siteAnalysisClose');

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('visible');
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible');
    }
  });
}

function openSiteAnalysisModal(category, categoryData, domains, color) {
  const modal = document.getElementById('siteAnalysisModal');

  // Set header
  document.getElementById('siteAnalysisDot').style.background = color;
  document.getElementById('siteAnalysisCategory').textContent =
    category.charAt(0).toUpperCase() + category.slice(1);

  // Set total
  const totalTime = categoryData.time || 0;
  document.getElementById('siteAnalysisTotal').textContent = formatTime(totalTime);

  // Build site list from domains
  const sitesInCategory = [];
  if (domains) {
    Object.entries(domains).forEach(([domain, data]) => {
      if (data.category === category) {
        sitesInCategory.push({ domain, time: data.time || 0 });
      }
    });
  }

  sitesInCategory.sort((a, b) => b.time - a.time);
  const maxTime = sitesInCategory[0]?.time || 1;

  const listEl = document.getElementById('siteAnalysisList');
  listEl.innerHTML = sitesInCategory.slice(0, 10).map(site => `
    <div class="site-analysis-item">
      <img src="https://www.google.com/s2/favicons?domain=${site.domain}&sz=32" alt="">
      <div class="site-analysis-item-info">
        <div class="site-analysis-item-domain">${site.domain}</div>
        <div class="site-analysis-item-bar">
          <div class="site-analysis-item-bar-fill" style="width: ${(site.time / maxTime) * 100}%; background: ${color};"></div>
        </div>
      </div>
      <span class="site-analysis-item-time">${formatTime(site.time)}</span>
    </div>
  `).join('');

  // Pattern chart (simplified - just show placeholder bars)
  const patternChart = document.getElementById('siteAnalysisPatternChart');
  patternChart.innerHTML = Array.from({ length: 24 }, (_, i) => {
    const height = Math.random() * 80 + 10;
    return `<div class="site-analysis-pattern-bar" style="height: ${height}%; background: ${color};"></div>`;
  }).join('');

  // Insight
  const topSite = sitesInCategory[0];
  const insightEl = document.getElementById('siteAnalysisInsight');
  if (topSite) {
    insightEl.innerHTML = `💡 <strong>${topSite.domain}</strong> accounts for ${Math.round((topSite.time / totalTime) * 100)}% of your ${category} usage.`;
  } else {
    insightEl.innerHTML = 'No site data available.';
  }

  modal.classList.add('visible');
}

document.addEventListener('DOMContentLoaded', initSiteAnalysisModal);

// ============================================
// Focus Mode
// ============================================
let focusState = {
  isRunning: false,
  isPaused: false,
  isBreak: false,
  timeRemaining: 25 * 60,
  sessionsCompleted: 0,
  totalFocusTime: 0,
  blockedAttempts: 0,
  intervalId: null
};

let focusSettings = {
  focusDuration: 25,
  shortBreak: 5,
  longBreak: 15,
  blockedCategories: ['social', 'entertainment', 'games']
};

function loadFocusMode() {
  loadFocusSettings();
  loadFocusStats();
  updateFocusUI();
  renderFocusHistory();
}

function loadFocusSettings() {
  const saved = localStorage.getItem('focusSettings');
  if (saved) {
    focusSettings = JSON.parse(saved);
  }

  document.getElementById('focusDuration').value = focusSettings.focusDuration;
  document.getElementById('focusShortBreak').value = focusSettings.shortBreak;
  document.getElementById('focusLongBreak').value = focusSettings.longBreak;

  // Update blocked categories
  document.querySelectorAll('.focus-block-tag').forEach(tag => {
    tag.classList.toggle('active', focusSettings.blockedCategories.includes(tag.dataset.category));
  });
}

function loadFocusStats() {
  const today = getTodayDate();
  const saved = localStorage.getItem(`focusStats_${today}`);
  if (saved) {
    const stats = JSON.parse(saved);
    focusState.sessionsCompleted = stats.sessions || 0;
    focusState.totalFocusTime = stats.totalTime || 0;
    focusState.blockedAttempts = stats.blocked || 0;
  } else {
    focusState.sessionsCompleted = 0;
    focusState.totalFocusTime = 0;
    focusState.blockedAttempts = 0;
  }
}

function saveFocusStats() {
  const today = getTodayDate();
  localStorage.setItem(`focusStats_${today}`, JSON.stringify({
    sessions: focusState.sessionsCompleted,
    totalTime: focusState.totalFocusTime,
    blocked: focusState.blockedAttempts
  }));
}

function saveFocusSettings() {
  focusSettings.focusDuration = parseInt(document.getElementById('focusDuration').value) || 25;
  focusSettings.shortBreak = parseInt(document.getElementById('focusShortBreak').value) || 5;
  focusSettings.longBreak = parseInt(document.getElementById('focusLongBreak').value) || 15;

  focusSettings.blockedCategories = [];
  document.querySelectorAll('.focus-block-tag.active').forEach(tag => {
    focusSettings.blockedCategories.push(tag.dataset.category);
  });

  localStorage.setItem('focusSettings', JSON.stringify(focusSettings));
}

function updateFocusUI() {
  const minutes = Math.floor(focusState.timeRemaining / 60);
  const seconds = focusState.timeRemaining % 60;

  document.getElementById('focusTimerTime').textContent =
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  document.getElementById('focusTimerLabel').textContent =
    focusState.isBreak ? 'Break' : 'Focus';

  // Update progress circle
  const totalTime = focusState.isBreak
    ? (focusState.sessionsCompleted % 4 === 0 ? focusSettings.longBreak : focusSettings.shortBreak) * 60
    : focusSettings.focusDuration * 60;

  const progress = 1 - (focusState.timeRemaining / totalTime);
  const circumference = 2 * Math.PI * 90;
  const offset = circumference * (1 - progress);

  const circle = document.getElementById('focusProgressCircle');
  circle.style.strokeDashoffset = offset;

  const progressEl = document.getElementById('focusTimerProgress');
  progressEl.classList.toggle('break', focusState.isBreak);

  // Update button
  const startBtn = document.getElementById('focusStartBtn');
  startBtn.textContent = focusState.isRunning ? '⏸' : '▶';

  // Update stats
  document.getElementById('focusCompletedSessions').textContent = focusState.sessionsCompleted;
  document.getElementById('focusTotalTime').textContent = formatTime(focusState.totalFocusTime * 1000);
  document.getElementById('focusBlockedCount').textContent = focusState.blockedAttempts;

  // Update tomatoes
  const tomatoesEl = document.getElementById('focusTomatoes');
  tomatoesEl.innerHTML = Array.from({ length: 4 }, (_, i) =>
    `<span class="focus-tomato ${i < focusState.sessionsCompleted % 4 ? 'completed' : ''}">🍅</span>`
  ).join('');
}

/**
 * Sync focus mode state with chrome.storage for blocking
 */
async function syncFocusModeToStorage() {
  const isActive = focusState.isRunning && !focusState.isBreak;
  await chrome.storage.local.set({
    focusMode: {
      isActive,
      blockedCategories: focusSettings.blockedCategories,
      startTime: isActive ? Date.now() : null,
      duration: isActive ? focusSettings.focusDuration * 60 * 1000 : null, // Duration in ms
      allowedSites: [] // Sites allowed during this session
    }
  });
}

function startFocusTimer() {
  if (focusState.isRunning) {
    // Pause
    focusState.isRunning = false;
    clearInterval(focusState.intervalId);
    syncFocusModeToStorage(); // Update storage when paused
  } else {
    // Start
    focusState.isRunning = true;
    saveFocusSettings();
    syncFocusModeToStorage(); // Update storage when started

    focusState.intervalId = setInterval(() => {
      focusState.timeRemaining--;

      if (focusState.timeRemaining <= 0) {
        handleTimerComplete();
      }

      updateFocusUI();
    }, 1000);
  }

  updateFocusUI();
}

function handleTimerComplete() {
  clearInterval(focusState.intervalId);
  focusState.isRunning = false;

  if (!focusState.isBreak) {
    // Focus session completed
    focusState.sessionsCompleted++;
    focusState.totalFocusTime += focusSettings.focusDuration * 60;
    saveFocusStats();
    saveFocusSessionToDb(); // Save to IndexedDB

    // Start break
    focusState.isBreak = true;
    syncFocusModeToStorage(); // Blocking disabled during break

    const breakTime = focusState.sessionsCompleted % 4 === 0
      ? focusSettings.longBreak
      : focusSettings.shortBreak;
    focusState.timeRemaining = breakTime * 60;

    // Notification
    if (Notification.permission === 'granted') {
      new Notification('🍅 Focus session complete!', {
        body: `Time for a ${breakTime} minute break.`
      });
    }
  } else {
    // Break completed
    focusState.isBreak = false;
    focusState.timeRemaining = focusSettings.focusDuration * 60;

    if (Notification.permission === 'granted') {
      new Notification('⏰ Break over!', {
        body: 'Ready for another focus session?'
      });
    }
  }

  updateFocusUI();
}

function resetFocusTimer() {
  clearInterval(focusState.intervalId);
  focusState.isRunning = false;
  focusState.isBreak = false;
  focusState.timeRemaining = focusSettings.focusDuration * 60;
  syncFocusModeToStorage(); // Clear blocking state
  updateFocusUI();
}

/**
 * Save focus session to IndexedDB for persistence
 */
async function saveFocusSessionToDb() {
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_FOCUS_SESSION',
      session: {
        date: getTodayDate(),
        duration: focusSettings.focusDuration * 60 * 1000, // Convert to ms
        completedAt: Date.now()
      }
    });
  } catch (error) {
    console.error('Error saving focus session to DB:', error);
  }
}

function skipFocusTimer() {
  handleTimerComplete();
}

function renderFocusHistory() {
  const container = document.getElementById('focusHistoryWeek');
  if (!container) return;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  container.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    const dateStr = formatDateLocal(date);
    const saved = localStorage.getItem(`focusStats_${dateStr}`);
    const sessions = saved ? JSON.parse(saved).sessions || 0 : 0;

    return `
      <div class="focus-history-day">
        <div class="focus-history-day-label">${days[date.getDay()]}</div>
        <div class="focus-history-day-tomatoes">
          ${Array.from({ length: Math.min(sessions, 4) }, () =>
            '<span class="focus-tomato completed">🍅</span>'
          ).join('') || '<span style="color: var(--text-tertiary);">-</span>'}
        </div>
      </div>
    `;
  }).join('');
}

function initFocusMode() {
  // Start/Pause button
  document.getElementById('focusStartBtn')?.addEventListener('click', startFocusTimer);

  // Reset button
  document.getElementById('focusResetBtn')?.addEventListener('click', resetFocusTimer);

  // Skip button
  document.getElementById('focusSkipBtn')?.addEventListener('click', skipFocusTimer);

  // Settings inputs
  ['focusDuration', 'focusShortBreak', 'focusLongBreak'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveFocusSettings();
      if (!focusState.isRunning && !focusState.isBreak) {
        focusState.timeRemaining = focusSettings.focusDuration * 60;
        updateFocusUI();
      }
    });
  });

  // Block category toggles
  document.querySelectorAll('.focus-block-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      tag.classList.toggle('active');
      saveFocusSettings();
    });
  });

  // Request notification permission
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

document.addEventListener('DOMContentLoaded', initFocusMode);

// ============================================
// Reports Page
// ============================================
let currentReportPeriod = 'week';
let reportData = null;

/**
 * Load reports page
 */
async function loadReports() {
  try {
    await loadReportData();
    renderReportSummary();
    renderReportComparison();
    renderProductivityHeatmap();
    renderCategoryTrends();
    renderReportTopSites();
  } catch (error) {
    console.error('Error loading reports:', error);
  }
}

/**
 * Load report data based on current period
 */
async function loadReportData() {
  const today = new Date();
  let startDate, endDate, prevStartDate, prevEndDate;
  
  if (currentReportPeriod === 'week') {
    // This week (Sun-Sat)
    const dayOfWeek = today.getDay();
    startDate = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek);
    endDate = new Date(today);
    
    // Last week
    prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - 7);
    prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
  } else {
    // This month
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today);
    
    // Last month
    prevStartDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    prevEndDate = new Date(today.getFullYear(), today.getMonth(), 0);
  }
  
  // Fetch data for current and previous periods
  const [currentData, prevData, goalsData] = await Promise.all([
    fetchPeriodData(startDate, endDate),
    fetchPeriodData(prevStartDate, prevEndDate),
    chrome.runtime.sendMessage({ type: 'GET_GOALS' })
  ]);
  
  reportData = {
    current: currentData,
    previous: prevData,
    goals: goalsData.data || [],
    period: currentReportPeriod,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate
  };
}

/**
 * Fetch stats for a date range
 */
async function fetchPeriodData(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(formatDateLocal(current));
    current.setDate(current.getDate() + 1);
  }
  
  const dailyStats = await Promise.all(
    dates.map(async date => {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DATE_STATS',
        date
      });
      // Handle both formats: { stats, sessions } or direct stats object
      const statsData = response.data?.stats || response.data || { totalTime: 0, categories: {}, domains: {} };
      const sessions = response.data?.sessions || [];
      return { date, stats: statsData, sessions };
    })
  );
  
  // Aggregate data
  let totalTime = 0;
  const categories = {};
  const hourlyData = Array(24).fill(0);
  const dailyData = {};
  const domains = {};
  // Track hourly data by day of week for heatmap
  const hourlyByDay = {}; // { 'Sun': { 0: time, 1: time, ... }, ... }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(day => {
    hourlyByDay[day] = {};
    for (let h = 0; h < 24; h++) {
      hourlyByDay[day][h] = 0;
    }
  });
  
  dailyStats.forEach(({ date, stats, sessions }) => {
    totalTime += stats.totalTime || 0;
    dailyData[date] = stats.totalTime || 0;
    
    // Calculate hourly data from actual sessions
    const dateObj = new Date(date);
    const dayOfWeek = days[dateObj.getDay()];
    
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        if (session.startTime && session.duration) {
          const startHour = new Date(session.startTime).getHours();
          // Distribute session duration across hours it spans
          const durationMs = session.duration;
          const durationHours = durationMs / (60 * 60 * 1000);
          
          if (durationHours < 1) {
            // Session fits in one hour
            hourlyByDay[dayOfWeek][startHour] += durationMs;
          } else {
            // Session spans multiple hours - distribute proportionally
            const hoursSpanned = Math.min(Math.ceil(durationHours), 24 - startHour);
            const perHour = durationMs / hoursSpanned;
            for (let h = 0; h < hoursSpanned; h++) {
              const hour = (startHour + h) % 24;
              hourlyByDay[dayOfWeek][hour] += perHour;
            }
          }
        }
      });
    } else if (stats.totalTime > 0) {
      // Fallback: if no sessions but have totalTime, distribute across typical hours
      for (let h = 9; h < 18; h++) {
        hourlyByDay[dayOfWeek][h] += stats.totalTime / 9;
      }
    }
    
    Object.entries(stats.categories || {}).forEach(([cat, data]) => {
      if (!categories[cat]) {
        categories[cat] = { time: 0, topSites: [] };
      }
      categories[cat].time += data.time || 0;
      
      // Aggregate top sites
      if (data.topSites) {
        data.topSites.forEach(site => {
          const siteName = typeof site === 'string' ? site : site.domain;
          const siteTime = typeof site === 'object' ? site.time : 0;
          if (!domains[siteName]) {
            domains[siteName] = { time: 0, category: cat };
          }
          domains[siteName].time += siteTime || (data.time / (data.topSites.length || 1));
        });
      }
    });
  });
  
  // Calculate productivity
  let productive = 0, unproductive = 0, neutral = 0;
  Object.entries(categories).forEach(([cat, data]) => {
    if (PRODUCTIVITY_GROUPS.productive.categories.includes(cat)) {
      productive += data.time;
    } else if (PRODUCTIVITY_GROUPS.unproductive.categories.includes(cat)) {
      unproductive += data.time;
    } else {
      neutral += data.time;
    }
  });
  
  const relevantTotal = productive + unproductive;
  const productivity = relevantTotal > 0 ? Math.round((productive / relevantTotal) * 100) : 0;
  
  return {
    totalTime,
    categories,
    domains,
    dailyData,
    hourlyByDay,
    productivity,
    productive,
    unproductive,
    neutral,
    dayCount: dates.length
  };
}

/**
 * Render summary stats
 */
function renderReportSummary() {
  if (!reportData) return;
  
  const { current } = reportData;
  const avgTime = current.dayCount > 0 ? current.totalTime / current.dayCount : 0;
  
  // Count completed goals
  let goalsCompleted = 0;
  let totalGoals = reportData.goals.length;
  
  document.getElementById('reportTotalTime').textContent = formatTime(current.totalTime);
  document.getElementById('reportAvgTime').textContent = formatTime(avgTime);
  document.getElementById('reportProductivity').textContent = `${current.productivity}%`;
  document.getElementById('reportGoalsCompleted').textContent = `${goalsCompleted}/${totalGoals}`;
}

/**
 * Render comparison section
 */
function renderReportComparison() {
  if (!reportData) return;
  
  const { current, previous, period } = reportData;
  
  // Update period label
  const periodLabel = period === 'week' ? 'This week vs Last week' : 'This month vs Last month';
  document.getElementById('reportComparisonPeriod').textContent = periodLabel;
  
  // Time comparison
  const timeChange = previous.totalTime > 0 
    ? Math.round((current.totalTime - previous.totalTime) / previous.totalTime * 100)
    : 0;
  
  document.getElementById('compCurrentTime').textContent = formatTime(current.totalTime);
  document.getElementById('compPrevTime').textContent = `vs ${formatTime(previous.totalTime)}`;
  
  const timeChangeEl = document.getElementById('compTimeChange');
  timeChangeEl.textContent = `${timeChange >= 0 ? '+' : ''}${timeChange}%`;
  timeChangeEl.className = `comparison-change ${timeChange > 0 ? 'positive' : timeChange < 0 ? 'negative' : 'neutral'}`;
  
  // Productivity comparison
  const prodChange = previous.productivity > 0
    ? current.productivity - previous.productivity
    : 0;
  
  document.getElementById('compCurrentProd').textContent = `${current.productivity}%`;
  document.getElementById('compPrevProd').textContent = `vs ${previous.productivity}%`;
  
  const prodChangeEl = document.getElementById('compProdChange');
  prodChangeEl.textContent = `${prodChange >= 0 ? '+' : ''}${prodChange}%`;
  prodChangeEl.className = `comparison-change ${prodChange > 0 ? 'positive' : prodChange < 0 ? 'negative' : 'neutral'}`;
  
  // Most productive day
  let mostProdDay = '-';
  let maxTime = 0;
  Object.entries(current.dailyData).forEach(([date, time]) => {
    if (time > maxTime) {
      maxTime = time;
      const d = new Date(date);
      mostProdDay = d.toLocaleDateString('en-US', { weekday: 'long' });
    }
  });
  document.getElementById('compMostProdDay').textContent = mostProdDay;
}

/**
 * Render productivity heatmap (day x hour)
 */
async function renderProductivityHeatmap() {
  const container = document.getElementById('productivityHeatmap');
  if (!container || !reportData) return;
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // Use actual hourly data from sessions
  const heatmapData = reportData.current.hourlyByDay || {};
  
  // Ensure all days/hours exist
  days.forEach(day => {
    if (!heatmapData[day]) {
      heatmapData[day] = {};
    }
    hours.forEach(hour => {
      if (heatmapData[day][hour] === undefined) {
        heatmapData[day][hour] = 0;
      }
    });
  });
  
  // Find max for scaling
  let maxVal = 0;
  days.forEach(day => {
    hours.forEach(hour => {
      maxVal = Math.max(maxVal, heatmapData[day][hour]);
    });
  });
  
  // Build HTML
  let html = '';
  
  // Hour labels row
  html += '<div class="heatmap-row-label"></div>';
  hours.forEach(h => {
    if (h % 3 === 0) {
      html += `<div class="heatmap-col-label">${h}:00</div>`;
    } else {
      html += '<div class="heatmap-col-label"></div>';
    }
  });
  
  // Data rows
  days.forEach(day => {
    html += `<div class="heatmap-row-label">${day}</div>`;
    hours.forEach(hour => {
      const val = heatmapData[day][hour];
      const level = maxVal > 0 ? Math.min(4, Math.floor((val / maxVal) * 5)) : 0;
      html += `<div class="heatmap-cell level-${level}" title="${day} ${hour}:00 - ${formatTime(val)}"></div>`;
    });
  });
  
  container.innerHTML = html;
}

/**
 * Render category trends chart
 */
async function renderCategoryTrends() {
  const canvas = document.getElementById('categoryTrendsChart');
  const legendContainer = document.getElementById('trendsLegend');
  if (!canvas || !reportData) return;
  
  const ctx = canvas.getContext('2d');
  const { current } = reportData;
  
  // Get top 5 categories
  const topCategories = Object.entries(current.categories)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 5);
  
  if (topCategories.length === 0) {
    ctx.fillStyle = getChartColors().textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8BAF5B';
  const colors = [accentColor, '#34C759', '#FF9500', '#FF3B30', '#AF52DE'];
  const dates = Object.keys(current.dailyData).sort();
  
  // Set canvas size
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = 250;
  
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = canvas.width - padding.left - padding.right;
  const chartHeight = canvas.height - padding.top - padding.bottom;
  
  // Find max value for scaling
  let maxVal = 0;
  dates.forEach(date => {
    topCategories.forEach(([cat]) => {
      // This would need per-day category data, simplified for now
      maxVal = Math.max(maxVal, current.categories[cat]?.time / dates.length || 0);
    });
  });
  
  if (maxVal === 0) maxVal = 1;
  
  const themeColors = getChartColors();
  
  // Draw axes
  ctx.strokeStyle = themeColors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, canvas.height - padding.bottom);
  ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
  ctx.stroke();
  
  // Draw category lines (simplified - just show proportion)
  const barWidth = chartWidth / topCategories.length - 10;
  
  topCategories.forEach(([cat, data], i) => {
    const x = padding.left + (i + 0.5) * (chartWidth / topCategories.length);
    const barHeight = (data.time / (current.totalTime || 1)) * chartHeight;
    const y = canvas.height - padding.bottom - barHeight;
    
    ctx.fillStyle = colors[i];
    ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
    
    // Category label
    ctx.fillStyle = themeColors.text;
    ctx.font = '11px -apple-system';
    ctx.textAlign = 'center';
    const catName = categoriesInfo[cat]?.name || cat;
    ctx.fillText(catName.substring(0, 10), x, canvas.height - padding.bottom + 20);
  });
  
  // Render legend
  legendContainer.innerHTML = topCategories.map(([cat], i) => {
    const catName = categoriesInfo[cat]?.name || cat;
    return `
      <div class="trends-legend-item">
        <span class="trends-legend-dot" style="background: ${colors[i]}"></span>
        <span>${catName}</span>
      </div>
    `;
  }).join('');
}

/**
 * Render top sites for the period
 */
function renderReportTopSites() {
  const container = document.getElementById('reportTopSites');
  if (!container || !reportData) return;
  
  const { current } = reportData;
  const totalTime = current.totalTime || 1;
  
  const sortedSites = Object.entries(current.domains)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 10);
  
  if (sortedSites.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No sites tracked yet</div>';
    return;
  }
  
  container.innerHTML = sortedSites.map(([domain, data], i) => {
    const percent = Math.round((data.time / totalTime) * 100);
    const catName = categoriesInfo[data.category]?.name || data.category || 'Other';
    const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    
    return `
      <div class="report-site-item">
        <span class="report-site-rank">${i + 1}</span>
        <img class="report-site-favicon" src="${faviconUrl}" alt="" onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=64'">
        <div class="report-site-info">
          <div class="report-site-name">${domain}</div>
          <div class="report-site-category">${catName}</div>
        </div>
        <div>
          <span class="report-site-time">${formatTime(data.time)}</span>
          <span class="report-site-percent">(${percent}%)</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Initialize reports page
 */
function initReports() {
  // Period toggle buttons
  document.querySelectorAll('.report-period-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.report-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentReportPeriod = btn.dataset.period;
      await loadReports();
    });
  });
}

document.addEventListener('DOMContentLoaded', initReports);

// ============================================
// Category Management
// ============================================
let siteOverrides = [];
let customCategories = [];

/**
 * Load site overrides and custom categories for settings page
 */
async function loadCategoryManagement() {
  try {
    // Load site overrides
    const overridesResponse = await chrome.runtime.sendMessage({ type: 'GET_SITE_OVERRIDES' });
    siteOverrides = overridesResponse.data || [];
    renderSiteOverrides();

    // Load custom categories
    const customCatsResponse = await chrome.runtime.sendMessage({ type: 'GET_CUSTOM_CATEGORIES' });
    customCategories = customCatsResponse.data || [];
    renderCustomCategories();

    // Populate category dropdown
    populateOverrideCategoryDropdown();
  } catch (error) {
    console.error('Error loading category management:', error);
  }
}

/**
 * Populate the category dropdown for site overrides
 */
function populateOverrideCategoryDropdown() {
  const dropdown = document.getElementById('newOverrideCategory');
  if (!dropdown) return;

  dropdown.innerHTML = Object.entries(categoriesInfo)
    .filter(([key]) => key !== 'adult')
    .map(([key, info]) => `<option value="${key}">${info.icon} ${info.name}</option>`)
    .join('');
}

/**
 * Render site overrides list
 */
function renderSiteOverrides() {
  const container = document.getElementById('siteOverridesList');
  if (!container) return;

  if (siteOverrides.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No site overrides yet</div>';
    return;
  }

  container.innerHTML = siteOverrides.map(override => {
    const catInfo = categoriesInfo[override.category] || { name: override.category, icon: '📱' };
    return `
      <div class="override-item" data-domain="${override.domain}">
        <span class="override-domain">${override.domain}</span>
        <span class="override-arrow">→</span>
        <span class="override-category">${catInfo.icon} ${catInfo.name}</span>
        <button class="btn-icon override-delete-btn" data-domain="${override.domain}" title="Delete">×</button>
      </div>
    `;
  }).join('');

  // Add delete handlers
  container.querySelectorAll('.override-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      await deleteSiteOverride(domain);
    });
  });
}

/**
 * Add a new site override
 */
async function addSiteOverride() {
  const domainInput = document.getElementById('newOverrideDomain');
  const categorySelect = document.getElementById('newOverrideCategory');

  const domain = domainInput.value.trim().toLowerCase().replace('www.', '');
  const category = categorySelect.value;

  if (!domain) {
    alert('Please enter a domain');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SITE_OVERRIDE',
      override: { domain, category }
    });

    // Update local list and re-render
    const existingIndex = siteOverrides.findIndex(o => o.domain === domain);
    if (existingIndex >= 0) {
      siteOverrides[existingIndex].category = category;
    } else {
      siteOverrides.push({ domain, category });
    }

    renderSiteOverrides();
    domainInput.value = '';
  } catch (error) {
    console.error('Error adding site override:', error);
  }
}

/**
 * Delete a site override
 */
async function deleteSiteOverride(domain) {
  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_SITE_OVERRIDE',
      domain
    });

    siteOverrides = siteOverrides.filter(o => o.domain !== domain);
    renderSiteOverrides();
  } catch (error) {
    console.error('Error deleting site override:', error);
  }
}

/**
 * Render custom categories list
 */
function renderCustomCategories() {
  const container = document.getElementById('customCategoriesList');
  if (!container) return;

  if (customCategories.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No custom categories yet</div>';
    return;
  }

  container.innerHTML = customCategories.map(cat => {
    const domainsCount = cat.domains?.length || 0;
    const keywordsCount = cat.keywords?.length || 0;
    return `
      <div class="custom-category-item" data-id="${cat.id}">
        <div class="custom-category-header">
          <span class="custom-category-icon" style="background-color: ${cat.color}20; color: ${cat.color};">${cat.icon}</span>
          <span class="custom-category-name">${cat.name}</span>
          <span class="custom-category-count">${domainsCount} domains, ${keywordsCount} keywords</span>
        </div>
        <div class="custom-category-actions">
          <button class="btn-icon custom-category-edit-btn" data-id="${cat.id}" title="Edit">✎</button>
          <button class="btn-icon custom-category-delete-btn" data-id="${cat.id}" title="Delete">×</button>
        </div>
      </div>
    `;
  }).join('');

  // Add delete handlers
  container.querySelectorAll('.custom-category-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Delete this custom category?')) {
        await deleteCustomCategory(id);
      }
    });
  });
}

/**
 * Delete a custom category
 */
async function deleteCustomCategory(id) {
  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_CUSTOM_CATEGORY',
      id
    });

    customCategories = customCategories.filter(c => c.id !== id);
    renderCustomCategories();
  } catch (error) {
    console.error('Error deleting custom category:', error);
  }
}

// Initialize category management when settings page loads
document.getElementById('addOverrideBtn')?.addEventListener('click', addSiteOverride);

document.getElementById('newOverrideDomain')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addSiteOverride();
  }
});

// ============================================
// Custom Category Modal
// ============================================
let editingCustomCategoryId = null;
let selectedCategoryIcon = '📁';
let selectedCategoryColor = '#4ECDC4';

const customCategoryModal = document.getElementById('customCategoryModal');
const customCategoryModalClose = document.getElementById('customCategoryModalClose');
const customCategoryCancelBtn = document.getElementById('customCategoryCancelBtn');
const customCategorySaveBtn = document.getElementById('customCategorySaveBtn');

function openCustomCategoryModal(category = null) {
  if (!customCategoryModal) return;
  
  // Reset form
  document.getElementById('customCategoryName').value = '';
  document.getElementById('customCategoryDomains').value = '';
  document.getElementById('customCategoryKeywords').value = '';
  selectedCategoryIcon = '📁';
  selectedCategoryColor = '#4ECDC4';
  editingCustomCategoryId = null;
  
  // If editing existing category
  if (category) {
    editingCustomCategoryId = category.id;
    document.getElementById('customCategoryModalTitle').textContent = 'Edit Custom Category';
    document.getElementById('customCategoryName').value = category.name || '';
    document.getElementById('customCategoryDomains').value = (category.domains || []).join('\n');
    document.getElementById('customCategoryKeywords').value = (category.keywords || []).join(', ');
    selectedCategoryIcon = category.icon || '📁';
    selectedCategoryColor = category.color || '#4ECDC4';
  } else {
    document.getElementById('customCategoryModalTitle').textContent = 'Add Custom Category';
  }
  
  // Update icon selection UI
  document.querySelectorAll('#customCategoryIconPicker .icon-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.icon === selectedCategoryIcon);
  });
  
  // Update color selection UI
  document.querySelectorAll('#customCategoryColorPicker .color-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === selectedCategoryColor);
  });
  
  customCategoryModal.classList.add('active');
}

function closeCustomCategoryModal() {
  if (customCategoryModal) {
    customCategoryModal.classList.remove('active');
  }
  editingCustomCategoryId = null;
}

// Icon picker handlers
document.querySelectorAll('#customCategoryIconPicker .icon-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#customCategoryIconPicker .icon-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCategoryIcon = btn.dataset.icon;
  });
});

// Color picker handlers
document.querySelectorAll('#customCategoryColorPicker .color-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#customCategoryColorPicker .color-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCategoryColor = btn.dataset.color;
  });
});

// Save custom category
async function saveCustomCategory() {
  const name = document.getElementById('customCategoryName').value.trim();
  const domainsText = document.getElementById('customCategoryDomains').value.trim();
  const keywordsText = document.getElementById('customCategoryKeywords').value.trim();
  
  if (!name) {
    alert('Please enter a category name');
    return;
  }
  
  // Parse domains (one per line)
  const domains = domainsText
    .split('\n')
    .map(d => d.trim().toLowerCase().replace('www.', ''))
    .filter(d => d.length > 0);
  
  // Parse keywords (comma-separated)
  const keywords = keywordsText
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
  
  // Generate ID from name (or use existing ID if editing)
  const id = editingCustomCategoryId || `custom_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  
  const category = {
    id,
    name,
    icon: selectedCategoryIcon,
    color: selectedCategoryColor,
    domains,
    keywords
  };
  
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_CUSTOM_CATEGORY',
      category
    });
    
    // Update local list
    const existingIndex = customCategories.findIndex(c => c.id === id);
    if (existingIndex >= 0) {
      customCategories[existingIndex] = category;
    } else {
      customCategories.push(category);
    }
    
    renderCustomCategories();
    closeCustomCategoryModal();
  } catch (error) {
    console.error('Error saving custom category:', error);
    alert('Failed to save category. Please try again.');
  }
}

// Modal event handlers
document.getElementById('addCustomCategoryBtn')?.addEventListener('click', () => openCustomCategoryModal());
customCategoryModalClose?.addEventListener('click', closeCustomCategoryModal);
customCategoryCancelBtn?.addEventListener('click', closeCustomCategoryModal);
customCategorySaveBtn?.addEventListener('click', saveCustomCategory);

// Close modal on backdrop click
customCategoryModal?.addEventListener('click', (e) => {
  if (e.target === customCategoryModal) {
    closeCustomCategoryModal();
  }
});

// Add edit functionality to custom categories
function attachCustomCategoryEditHandlers() {
  document.querySelectorAll('.custom-category-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const category = customCategories.find(c => c.id === id);
      if (category) {
        openCustomCategoryModal(category);
      }
    });
  });
}

// Override renderCustomCategories to add edit handlers
const originalRenderCustomCategories = renderCustomCategories;
renderCustomCategories = function() {
  originalRenderCustomCategories();
  attachCustomCategoryEditHandlers();
};

// ============================================
// Achievements System
// ============================================

const ACHIEVEMENTS = [
  {
    id: 'first_goal',
    name: 'First Step',
    desc: 'Set your first goal',
    icon: '🎯',
    check: (data) => data.goals.length > 0
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    desc: '7-day goal streak',
    icon: '🔥',
    check: (data) => data.maxStreak >= 7
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    desc: '30-day goal streak',
    icon: '⚡',
    check: (data) => data.maxStreak >= 30
  },
  {
    id: 'productive_10h',
    name: 'Getting Started',
    desc: '10 hours productive',
    icon: '📈',
    check: (data) => data.totalProductive >= 10 * 60 * 60 * 1000
  },
  {
    id: 'productive_100h',
    name: 'Productivity Pro',
    desc: '100 hours productive',
    icon: '🚀',
    check: (data) => data.totalProductive >= 100 * 60 * 60 * 1000
  },
  {
    id: 'focus_10',
    name: 'Focus Beginner',
    desc: '10 focus sessions',
    icon: '🍅',
    check: (data) => data.focusSessions >= 10
  },
  {
    id: 'focus_50',
    name: 'Focus Master',
    desc: '50 focus sessions',
    icon: '🏆',
    check: (data) => data.focusSessions >= 50
  },
  {
    id: 'limit_keeper',
    name: 'Self Control',
    desc: 'Stay under limits for 7 days',
    icon: '🛡️',
    check: (data) => data.limitStreak >= 7
  }
];

async function loadAchievements() {
  const container = document.getElementById('achievementsGrid');
  if (!container) return;
  
  // Gather achievement data
  const data = await gatherAchievementData();
  
  // Load unlocked achievements from storage
  const storage = await chrome.storage.local.get('achievements');
  const unlockedAchievements = storage.achievements || {};
  
  // Check and update achievements
  for (const achievement of ACHIEVEMENTS) {
    if (!unlockedAchievements[achievement.id] && achievement.check(data)) {
      unlockedAchievements[achievement.id] = {
        unlockedAt: Date.now()
      };
    }
  }
  
  // Save updated achievements
  await chrome.storage.local.set({ achievements: unlockedAchievements });
  
  // Render achievements
  container.innerHTML = ACHIEVEMENTS.map(achievement => {
    const unlocked = unlockedAchievements[achievement.id];
    const unlockedDate = unlocked ? new Date(unlocked.unlockedAt).toLocaleDateString() : null;
    
    return `
      <div class="achievement-item ${unlocked ? 'unlocked' : 'locked'}">
        <span class="achievement-icon">${achievement.icon}</span>
        <span class="achievement-name">${achievement.name}</span>
        <span class="achievement-desc">${achievement.desc}</span>
        ${unlockedDate ? `<span class="achievement-date">Unlocked ${unlockedDate}</span>` : ''}
      </div>
    `;
  }).join('');
}

async function gatherAchievementData() {
  // Get goals and calculate max streak
  const storage = await chrome.storage.local.get('settings');
  const goals = storage.settings?.goals || [];
  
  let maxStreak = 0;
  goals.forEach(goal => {
    const streak = calculateGoalStreak(goal, getGoalTypeInfo(goal.type));
    if (streak > maxStreak) maxStreak = streak;
  });
  
  // Get focus sessions count
  let focusSessions = 0;
  try {
    const focusResponse = await chrome.runtime.sendMessage({ type: 'GET_FOCUS_SESSIONS' });
    focusSessions = focusResponse.data?.length || 0;
  } catch (e) {}
  
  // Calculate total productive time (simplified - would need historical data)
  let totalProductive = 0;
  try {
    const todayStats = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
    const categories = todayStats.data?.categories || {};
    Object.entries(categories).forEach(([cat, data]) => {
      if (PRODUCTIVITY_GROUPS.productive.categories.includes(cat)) {
        totalProductive += data.time || 0;
      }
    });
  } catch (e) {}
  
  return {
    goals,
    maxStreak,
    focusSessions,
    totalProductive,
    limitStreak: 0 // Would need to track this
  };
}

// Update loadSettingsUI to also load category management, achievements, color palette, downtime, and whitelist
const originalLoadSettingsUI = loadSettingsUI;
loadSettingsUI = async function() {
  await originalLoadSettingsUI();
  await loadCategories(); // Ensure categoriesInfo is loaded
  await loadCategoryManagement();
  initColorPalette(); // Initialize accent color palette
  initDowntime(); // Initialize downtime settings
  initWhitelist(); // Initialize whitelist settings
};

// ============================================
// Downtime / Scheduled Blocking
// ============================================

/**
 * Initialize downtime settings UI
 */
async function initDowntime() {
  const enabledToggle = document.getElementById('downtimeEnabled');
  const optionsContainer = document.getElementById('downtimeOptions');
  const startInput = document.getElementById('downtimeStart');
  const endInput = document.getElementById('downtimeEnd');
  const daysContainer = document.getElementById('downtimeDays');
  const categoriesContainer = document.getElementById('downtimeCategories');
  
  if (!enabledToggle || !optionsContainer) return;
  
  // Load saved downtime settings
  const settings = await loadDowntimeSettings();
  
  // Set initial state
  enabledToggle.checked = settings.enabled;
  optionsContainer.style.display = settings.enabled ? 'block' : 'none';
  
  if (startInput) startInput.value = settings.startTime;
  if (endInput) endInput.value = settings.endTime;
  
  // Initialize day buttons
  if (daysContainer) {
    const dayBtns = daysContainer.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
      const day = parseInt(btn.dataset.day);
      if (settings.activeDays.includes(day)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        saveDowntimeSettings();
      });
    });
  }
  
  // Populate categories
  if (categoriesContainer) {
    populateDowntimeCategories(categoriesContainer, settings.blockedCategories);
  }
  
  // Event listeners
  enabledToggle.addEventListener('change', () => {
    optionsContainer.style.display = enabledToggle.checked ? 'block' : 'none';
    saveDowntimeSettings();
  });
  
  startInput?.addEventListener('change', saveDowntimeSettings);
  endInput?.addEventListener('change', saveDowntimeSettings);
}

/**
 * Load downtime settings from storage
 */
async function loadDowntimeSettings() {
  try {
    const result = await chrome.storage.local.get('downtimeSettings');
    return result.downtimeSettings || {
      enabled: false,
      startTime: '22:00',
      endTime: '07:00',
      activeDays: [0, 1, 2, 3, 4, 5, 6], // All days
      blockedCategories: ['social', 'entertainment', 'games']
    };
  } catch (error) {
    console.error('Error loading downtime settings:', error);
    return {
      enabled: false,
      startTime: '22:00',
      endTime: '07:00',
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      blockedCategories: ['social', 'entertainment', 'games']
    };
  }
}

/**
 * Save downtime settings to storage
 */
async function saveDowntimeSettings() {
  const enabledToggle = document.getElementById('downtimeEnabled');
  const startInput = document.getElementById('downtimeStart');
  const endInput = document.getElementById('downtimeEnd');
  const daysContainer = document.getElementById('downtimeDays');
  const categoriesContainer = document.getElementById('downtimeCategories');
  
  const activeDays = [];
  if (daysContainer) {
    daysContainer.querySelectorAll('.day-btn.active').forEach(btn => {
      activeDays.push(parseInt(btn.dataset.day));
    });
  }
  
  const blockedCategories = [];
  if (categoriesContainer) {
    categoriesContainer.querySelectorAll('.downtime-category-chip.selected').forEach(chip => {
      blockedCategories.push(chip.dataset.category);
    });
  }
  
  const settings = {
    enabled: enabledToggle?.checked || false,
    startTime: startInput?.value || '22:00',
    endTime: endInput?.value || '07:00',
    activeDays: activeDays,
    blockedCategories: blockedCategories
  };
  
  try {
    await chrome.storage.local.set({ downtimeSettings: settings });
    console.log('Downtime settings saved:', settings);
  } catch (error) {
    console.error('Error saving downtime settings:', error);
  }
}

/**
 * Populate downtime categories selection
 */
function populateDowntimeCategories(container, selectedCategories) {
  // Categories that make sense to block during downtime
  const blockableCategories = [
    { id: 'social', icon: '💬', name: 'Social Media' },
    { id: 'entertainment', icon: '🎬', name: 'Entertainment' },
    { id: 'games', icon: '🎮', name: 'Games' },
    { id: 'news', icon: '📰', name: 'News' },
    { id: 'shopping', icon: '🛒', name: 'Shopping' },
    { id: 'adult', icon: '🔞', name: 'Adult' }
  ];
  
  container.innerHTML = blockableCategories.map(cat => {
    const isSelected = selectedCategories.includes(cat.id);
    return `
      <div class="downtime-category-chip ${isSelected ? 'selected' : ''}" data-category="${cat.id}">
        <span class="chip-icon">${cat.icon}</span>
        <span class="chip-name">${cat.name}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.downtime-category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      saveDowntimeSettings();
    });
  });
}

// ============================================
// Whitelist Mode
// ============================================

/**
 * Initialize whitelist settings UI
 */
async function initWhitelist() {
  const enabledToggle = document.getElementById('whitelistEnabled');
  const optionsContainer = document.getElementById('whitelistOptions');
  const sitesContainer = document.getElementById('whitelistSites');
  const categoriesContainer = document.getElementById('whitelistCategories');
  const addBtn = document.getElementById('addWhitelistBtn');
  const domainInput = document.getElementById('newWhitelistDomain');
  
  if (!enabledToggle || !optionsContainer) return;
  
  // Load saved whitelist settings
  const settings = await loadWhitelistSettings();
  
  // Set initial state
  enabledToggle.checked = settings.enabled;
  optionsContainer.style.display = settings.enabled ? 'block' : 'none';
  
  // Render sites list
  renderWhitelistSites(sitesContainer, settings.sites);
  
  // Render category chips
  renderWhitelistCategories(categoriesContainer, settings.allowedCategories);
  
  // Event listeners
  enabledToggle.addEventListener('change', () => {
    optionsContainer.style.display = enabledToggle.checked ? 'block' : 'none';
    saveWhitelistSettings();
  });
  
  addBtn?.addEventListener('click', async () => {
    const domain = domainInput.value.trim().toLowerCase();
    if (!domain) return;
    
    // Validate domain
    if (!isValidDomain(domain)) {
      alert('Please enter a valid domain (e.g., example.com)');
      return;
    }
    
    const settings = await loadWhitelistSettings();
    if (!settings.sites.includes(domain)) {
      settings.sites.push(domain);
      await chrome.storage.local.set({ whitelistSettings: settings });
      renderWhitelistSites(sitesContainer, settings.sites);
    }
    
    domainInput.value = '';
  });
  
  domainInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addBtn?.click();
    }
  });
}

/**
 * Validate domain format
 */
function isValidDomain(domain) {
  // Simple domain validation
  const pattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return pattern.test(domain);
}

/**
 * Load whitelist settings from storage
 */
async function loadWhitelistSettings() {
  try {
    const result = await chrome.storage.local.get('whitelistSettings');
    return result.whitelistSettings || {
      enabled: false,
      sites: [],
      allowedCategories: ['productivity', 'education']
    };
  } catch (error) {
    console.error('Error loading whitelist settings:', error);
    return {
      enabled: false,
      sites: [],
      allowedCategories: ['productivity', 'education']
    };
  }
}

/**
 * Save whitelist settings to storage
 */
async function saveWhitelistSettings() {
  const enabledToggle = document.getElementById('whitelistEnabled');
  const categoriesContainer = document.getElementById('whitelistCategories');
  const sitesContainer = document.getElementById('whitelistSites');
  
  const allowedCategories = [];
  if (categoriesContainer) {
    categoriesContainer.querySelectorAll('.whitelist-category-chip.selected').forEach(chip => {
      allowedCategories.push(chip.dataset.category);
    });
  }
  
  const sites = [];
  if (sitesContainer) {
    sitesContainer.querySelectorAll('.whitelist-site-item').forEach(item => {
      sites.push(item.dataset.domain);
    });
  }
  
  const settings = {
    enabled: enabledToggle?.checked || false,
    sites: sites,
    allowedCategories: allowedCategories
  };
  
  try {
    await chrome.storage.local.set({ whitelistSettings: settings });
    console.log('Whitelist settings saved:', settings);
  } catch (error) {
    console.error('Error saving whitelist settings:', error);
  }
}

/**
 * Render whitelist sites list
 */
function renderWhitelistSites(container, sites) {
  if (!container) return;
  
  if (!sites || sites.length === 0) {
    container.innerHTML = '<div class="whitelist-empty">No sites added yet</div>';
    return;
  }
  
  container.innerHTML = sites.map(domain => `
    <div class="whitelist-site-item" data-domain="${domain}">
      <div class="whitelist-site-domain">
        <img src="https://icons.duckduckgo.com/ip3/${domain}.ico" alt="" onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=32'">
        <span>${domain}</span>
      </div>
      <button class="whitelist-site-delete" data-domain="${domain}">✕</button>
    </div>
  `).join('');
  
  // Add delete handlers
  container.querySelectorAll('.whitelist-site-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      const settings = await loadWhitelistSettings();
      settings.sites = settings.sites.filter(s => s !== domain);
      await chrome.storage.local.set({ whitelistSettings: settings });
      renderWhitelistSites(container, settings.sites);
    });
  });
}

/**
 * Render whitelist category chips
 */
function renderWhitelistCategories(container, selectedCategories) {
  if (!container) return;
  
  const categories = [
    { id: 'productivity', icon: '💼', name: 'Productivity' },
    { id: 'education', icon: '📚', name: 'Education' },
    { id: 'news', icon: '📰', name: 'News' },
    { id: 'shopping', icon: '🛒', name: 'Shopping' },
    { id: 'other', icon: '📱', name: 'Other' }
  ];
  
  container.innerHTML = categories.map(cat => {
    const isSelected = selectedCategories.includes(cat.id);
    return `
      <div class="whitelist-category-chip ${isSelected ? 'selected' : ''}" data-category="${cat.id}">
        <span class="chip-icon">${cat.icon}</span>
        <span class="chip-name">${cat.name}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.whitelist-category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      saveWhitelistSettings();
    });
  });
}

// ============================================
// Downtime Page (Separate from Settings)
// ============================================

/**
 * Load Downtime page with both Downtime and Whitelist settings
 */
async function loadDowntimePage() {
  // Load Downtime settings
  const downtimeSettings = await loadDowntimeSettings();
  
  // Downtime toggle
  const enabledToggle = document.getElementById('downtimeEnabledPage');
  const settingsCard = document.getElementById('downtimeSettingsCard');
  if (enabledToggle) {
    enabledToggle.checked = downtimeSettings.enabled;
    settingsCard.style.opacity = downtimeSettings.enabled ? '1' : '0.6';
    
    enabledToggle.addEventListener('change', async () => {
      const settings = await loadDowntimeSettings();
      settings.enabled = enabledToggle.checked;
      await chrome.storage.local.set({ downtimeSettings: settings });
      settingsCard.style.opacity = enabledToggle.checked ? '1' : '0.6';
    });
  }
  
  // Start/End time
  const startInput = document.getElementById('downtimeStartPage');
  const endInput = document.getElementById('downtimeEndPage');
  if (startInput) startInput.value = downtimeSettings.startTime;
  if (endInput) endInput.value = downtimeSettings.endTime;
  
  startInput?.addEventListener('change', saveDowntimePageSettings);
  endInput?.addEventListener('change', saveDowntimePageSettings);
  
  // Day buttons
  const daysContainer = document.getElementById('downtimeDaysPage');
  if (daysContainer) {
    const dayBtns = daysContainer.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
      const day = parseInt(btn.dataset.day);
      if (downtimeSettings.activeDays.includes(day)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        saveDowntimePageSettings();
      });
    });
  }
  
  // Categories
  const categoriesContainer = document.getElementById('downtimeCategoriesPage');
  if (categoriesContainer) {
    populateDowntimeCategories(categoriesContainer, downtimeSettings.blockedCategories);
    // Re-bind save handler for page version
    categoriesContainer.querySelectorAll('.downtime-category-chip').forEach(chip => {
      chip.addEventListener('click', saveDowntimePageSettings);
    });
  }
  
  // Load Whitelist settings
  const whitelistSettings = await loadWhitelistSettings();
  
  const whitelistToggle = document.getElementById('whitelistEnabledPage');
  const whitelistOptions = document.getElementById('whitelistOptionsPage');
  if (whitelistToggle) {
    whitelistToggle.checked = whitelistSettings.enabled;
    whitelistOptions.style.opacity = whitelistSettings.enabled ? '1' : '0.6';
    
    whitelistToggle.addEventListener('change', async () => {
      const settings = await loadWhitelistSettings();
      settings.enabled = whitelistToggle.checked;
      await chrome.storage.local.set({ whitelistSettings: settings });
      whitelistOptions.style.opacity = whitelistToggle.checked ? '1' : '0.6';
    });
  }
  
  // Whitelist sites
  const sitesContainer = document.getElementById('whitelistSitesPage');
  renderWhitelistSitesPage(sitesContainer, whitelistSettings.sites);
  
  // Whitelist categories
  const whitelistCatsContainer = document.getElementById('whitelistCategoriesPage');
  renderWhitelistCategoriesPage(whitelistCatsContainer, whitelistSettings.allowedCategories);
  
  // Add site button
  const addBtn = document.getElementById('addWhitelistBtnPage');
  const domainInput = document.getElementById('newWhitelistDomainPage');
  
  addBtn?.addEventListener('click', async () => {
    const domain = domainInput.value.trim().toLowerCase();
    if (!domain) return;
    
    if (!isValidDomain(domain)) {
      alert('Please enter a valid domain (e.g., example.com)');
      return;
    }
    
    const settings = await loadWhitelistSettings();
    if (!settings.sites.includes(domain)) {
      settings.sites.push(domain);
      await chrome.storage.local.set({ whitelistSettings: settings });
      renderWhitelistSitesPage(sitesContainer, settings.sites);
    }
    
    domainInput.value = '';
  });
  
  domainInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBtn?.click();
  });
}

/**
 * Save downtime settings from page inputs
 */
async function saveDowntimePageSettings() {
  const enabledToggle = document.getElementById('downtimeEnabledPage');
  const startInput = document.getElementById('downtimeStartPage');
  const endInput = document.getElementById('downtimeEndPage');
  const daysContainer = document.getElementById('downtimeDaysPage');
  const categoriesContainer = document.getElementById('downtimeCategoriesPage');
  
  const activeDays = [];
  if (daysContainer) {
    daysContainer.querySelectorAll('.day-btn.active').forEach(btn => {
      activeDays.push(parseInt(btn.dataset.day));
    });
  }
  
  const blockedCategories = [];
  if (categoriesContainer) {
    categoriesContainer.querySelectorAll('.downtime-category-chip.selected').forEach(chip => {
      blockedCategories.push(chip.dataset.category);
    });
  }
  
  const settings = {
    enabled: enabledToggle?.checked || false,
    startTime: startInput?.value || '22:00',
    endTime: endInput?.value || '07:00',
    activeDays: activeDays,
    blockedCategories: blockedCategories
  };
  
  await chrome.storage.local.set({ downtimeSettings: settings });
}

/**
 * Render whitelist sites for page
 */
function renderWhitelistSitesPage(container, sites) {
  if (!container) return;
  
  if (!sites || sites.length === 0) {
    container.innerHTML = '<div class="whitelist-empty">No sites added yet. Add domains below.</div>';
    return;
  }
  
  container.innerHTML = sites.map(domain => `
    <div class="whitelist-site-item" data-domain="${domain}">
      <div class="whitelist-site-domain">
        <img src="https://icons.duckduckgo.com/ip3/${domain}.ico" alt="" onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=32'">
        <span>${domain}</span>
      </div>
      <button class="whitelist-site-delete" data-domain="${domain}">✕</button>
    </div>
  `).join('');
  
  // Add delete handlers
  container.querySelectorAll('.whitelist-site-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      const settings = await loadWhitelistSettings();
      settings.sites = settings.sites.filter(s => s !== domain);
      await chrome.storage.local.set({ whitelistSettings: settings });
      renderWhitelistSitesPage(container, settings.sites);
    });
  });
}

/**
 * Render whitelist categories for page
 */
function renderWhitelistCategoriesPage(container, selectedCategories) {
  if (!container) return;
  
  const categories = [
    { id: 'productivity', icon: '💼', name: 'Productivity' },
    { id: 'education', icon: '📚', name: 'Education' },
    { id: 'news', icon: '📰', name: 'News' },
    { id: 'shopping', icon: '🛒', name: 'Shopping' },
    { id: 'other', icon: '📱', name: 'Other' }
  ];
  
  container.innerHTML = categories.map(cat => {
    const isSelected = selectedCategories.includes(cat.id);
    return `
      <div class="whitelist-category-chip ${isSelected ? 'selected' : ''}" data-category="${cat.id}">
        <span class="chip-icon">${cat.icon}</span>
        <span class="chip-name">${cat.name}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.whitelist-category-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      chip.classList.toggle('selected');

      const settings = await loadWhitelistSettings();
      const category = chip.dataset.category;

      if (chip.classList.contains('selected')) {
        if (!settings.allowedCategories.includes(category)) {
          settings.allowedCategories.push(category);
        }
      } else {
        settings.allowedCategories = settings.allowedCategories.filter(c => c !== category);
      }

      await chrome.storage.local.set({ whitelistSettings: settings });
    });
  });
}

// ============================================
// Server Status Checker
// ============================================

/**
 * Check server connection status
 */
async function checkServerStatus() {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusDetail = document.getElementById('serverStatusDetail');

  if (!statusIndicator || !statusDetail) return;

  try {
    // Check health endpoint
    const healthPromise = fetch(`${SERVER_CONFIG.BASE_URL.replace('/api', '')}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    // Check categories version endpoint
    const versionPromise = fetch(`${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.CATEGORIES_VERSION}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    const [healthResponse, versionResponse] = await Promise.all([healthPromise, versionPromise]);

    // Check if both endpoints responded successfully
    if (healthResponse.ok && versionResponse.ok) {
      const versionData = await versionResponse.json();

      // Update status to connected (green)
      statusIndicator.setAttribute('data-status', 'connected');
      statusIndicator.querySelector('.status-text').textContent = 'Connected';

      // Format last updated time and next sync
      if (versionData.lastUpdated) {
        const lastUpdate = new Date(versionData.lastUpdated);
        const now = new Date();
        const diffHours = Math.floor((now - lastUpdate) / (1000 * 60 * 60));

        let timeAgo;
        if (diffHours < 1) {
          timeAgo = 'Just now';
        } else if (diffHours < 24) {
          timeAgo = `${diffHours}h ago`;
        } else {
          const diffDays = Math.floor(diffHours / 24);
          timeAgo = `${diffDays}d ago`;
        }

        // Get next scheduled sync time from background
        let nextSyncText = '';
        try {
          const syncResponse = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' });
          const nextSyncMs = syncResponse?.data?.nextSyncTime;
          if (syncResponse?.success && nextSyncMs) {
            const diffMs = nextSyncMs - now.getTime();
            if (diffMs > 0) {
              const diffMin = Math.floor(diffMs / 60000);
              if (diffMin < 1) {
                nextSyncText = ' · Next: <1m';
              } else if (diffMin < 60) {
                nextSyncText = ` · Next: ${diffMin}m`;
              } else {
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                nextSyncText = ` · Next: ${h}h ${m}m`;
              }
            }
          }
        } catch (e) {
          console.warn('[ServerStatus] Failed to get sync status:', e);
        }

        statusDetail.textContent = `Last update: ${timeAgo}${nextSyncText}`;
      } else {
        statusDetail.textContent = 'Connected';
      }
    } else if (healthResponse.ok || versionResponse.ok) {
      // One endpoint worked, one failed (yellow)
      statusIndicator.setAttribute('data-status', 'warning');
      statusIndicator.querySelector('.status-text').textContent = 'Partial';
      statusDetail.textContent = 'Some services unavailable';
    } else {
      // Both failed (red)
      statusIndicator.setAttribute('data-status', 'disconnected');
      statusIndicator.querySelector('.status-text').textContent = 'Disconnected';
      statusDetail.textContent = 'Server unavailable';
    }
  } catch (error) {
    console.error('[ServerStatus] Connection failed:', error);

    // Connection failed (red)
    statusIndicator.setAttribute('data-status', 'disconnected');
    statusIndicator.querySelector('.status-text').textContent = 'Disconnected';

    if (error.name === 'TimeoutError') {
      statusDetail.textContent = 'Connection timeout';
    } else if (error.name === 'TypeError') {
      statusDetail.textContent = 'Network error';
    } else {
      statusDetail.textContent = 'Server unavailable';
    }
  }
}

/**
 * Start periodic server status checks
 */
function startServerStatusMonitoring() {
  // Check immediately
  checkServerStatus();

  // Check every 30 seconds
  setInterval(checkServerStatus, 30000);

  console.log('[ServerStatus] Monitoring started');
}

// Start monitoring when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startServerStatusMonitoring);
} else {
  startServerStatusMonitoring();
}
