/**
 * Content Script for real-time site blocking
 */

(function() {
  'use strict';

  if (window.__detimeBlockOverlayInjected) return;
  window.__detimeBlockOverlayInjected = true;

  let overlayElement = null;
  let checkInterval = null;
  let isBlocked = false;
  let midnightResetTimer = null;
  let currentBlockInfo = null;

  function checkBlocking() {
    try {
      if (!chrome.runtime?.id) {
        stopChecking();
        return;
      }

      chrome.runtime.sendMessage({
        type: 'CHECK_BLOCKING_STATUS',
        url: window.location.href
      }, handleBlockingResponse);
    } catch (e) {
      stopChecking();
    }
  }

  function handleBlockingResponse(response) {
    if (chrome.runtime.lastError) return;
    
    if (response?.blocked) {
      currentBlockInfo = response;
      showBlockOverlay(response);
      isBlocked = true;
    } else if (isBlocked && overlayElement) {
      hideBlockOverlay();
      isBlocked = false;
      currentBlockInfo = null;
    }
  }

  function stopChecking() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  function formatCountdown(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function formatTime(ms) {
    if (!ms || ms < 0) return '0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function shouldHideMisclassBtn(info) {
    if (info.focusMode) return false;
    if (info.limitId?.startsWith('site:') || info.limitId?.startsWith('sites:') || info.limitId?.startsWith('mixed:')) return true;
    if (info.includeSites?.length > 0 && (!info.includeCategories || info.includeCategories.length === 0)) return true;
    return false;
  }

  function showBlockOverlay(blockInfo) {
    // Remove existing overlay
    hideBlockOverlay();

    const { categoryName, limit, used, focusMode, reason } = blockInfo;
    const showMisclassBtn = !shouldHideMisclassBtn(blockInfo);
    const isDowntime = reason === 'downtime';

    // Create overlay
    overlayElement = document.createElement('div');
    overlayElement.id = 'detime-block-overlay';
    overlayElement.innerHTML = createOverlayHTML(blockInfo, showMisclassBtn);
    
    // Wait for body to exist
    if (document.body) {
      document.body.appendChild(overlayElement);
      document.body.style.overflow = 'hidden';
    } else if (document.documentElement) {
      document.documentElement.appendChild(overlayElement);
    }

    if (!focusMode && !isDowntime) startMidnightCountdown();

    // Attach click handlers directly to buttons after a small delay
    requestAnimationFrame(() => {
      attachButtonHandlers(blockInfo, showMisclassBtn);
    });

    // Re-inject observer
    const obs = new MutationObserver(() => {
      if (!document.getElementById('detime-block-overlay') && isBlocked && overlayElement) {
        if (document.body) {
          document.body.appendChild(overlayElement);
        } else if (document.documentElement) {
          document.documentElement.appendChild(overlayElement);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function attachButtonHandlers(blockInfo, showMisclassBtn) {
    if (!overlayElement) {
      console.log('deTime: No overlay element');
      return;
    }

    const buttons = overlayElement.querySelectorAll('[data-detime-action]');
    console.log('deTime: Found buttons:', buttons.length);

    buttons.forEach(btn => {
      const action = btn.getAttribute('data-detime-action');
      console.log('deTime: Attaching handler for:', action);
      
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('deTime: Click on', action);
        handleAction(action, blockInfo, showMisclassBtn);
      }, true);

      // Also add mousedown for redundancy
      btn.addEventListener('mousedown', function(e) {
        console.log('deTime: Mousedown on', action);
      }, true);
    });
  }

  function getBlockIcon(focusMode, reason) {
    if (focusMode) return '🍅';
    switch (reason) {
      case 'downtime': return '🌙';
      case 'whitelist': return '🔒';
      default: return '⛔';
    }
  }

  function getBlockTitle(focusMode, reason) {
    if (focusMode) return 'Stay Focused!';
    switch (reason) {
      case 'downtime': return 'Time to Rest';
      case 'whitelist': return 'Site Not Allowed';
      default: return 'Time Limit Reached';
    }
  }

  function getBlockSubtitle(focusMode, reason, categoryName, downtimeEnd) {
    if (focusMode) return 'This site is blocked during your focus session';
    switch (reason) {
      case 'downtime': 
        return `<strong>${categoryName || 'This category'}</strong> is blocked during downtime hours`;
      case 'whitelist':
        return 'This site is not on your whitelist';
      default:
        return `You've reached your daily limit for <strong>${categoryName || 'this category'}</strong>`;
    }
  }

  function createOverlayHTML(blockInfo, showMisclassBtn) {
    const { categoryName, limit, used, focusMode, reason, downtimeEnd } = blockInfo;
    
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        
        #detime-block-overlay {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          background: linear-gradient(135deg, rgba(15, 15, 20, 0.98) 0%, rgba(25, 25, 35, 0.98) 100%) !important;
          z-index: 2147483647 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          color: white !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
        }
        #detime-block-overlay * {
          box-sizing: border-box !important;
        }
        .detime-container {
          max-width: 480px !important;
          width: 90% !important;
          text-align: center !important;
        }
        .detime-icon { 
          font-size: 72px !important; 
          margin-bottom: 24px !important;
          animation: detime-pulse 2s ease-in-out infinite !important;
        }
        @keyframes detime-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .detime-badge { 
          display: inline-block !important;
          background: linear-gradient(135deg, #FF6B6B, #FF3B30) !important; 
          padding: 8px 20px !important; 
          border-radius: 24px !important; 
          font-size: 12px !important; 
          font-weight: 600 !important; 
          margin-bottom: 20px !important;
          letter-spacing: 0.5px !important;
          box-shadow: 0 4px 20px rgba(255, 59, 48, 0.3) !important;
        }
        .detime-title { 
          font-size: 32px !important; 
          font-weight: 700 !important; 
          margin-bottom: 12px !important;
          letter-spacing: -0.5px !important;
        }
        .detime-subtitle { 
          font-size: 16px !important; 
          color: rgba(255,255,255,0.6) !important; 
          margin-bottom: 36px !important; 
          line-height: 1.5 !important;
        }
        .detime-stats { 
          display: flex !important; 
          justify-content: center !important;
          gap: 24px !important; 
          margin-bottom: 36px !important;
          background: rgba(255,255,255,0.05) !important;
          border-radius: 20px !important;
          padding: 24px 32px !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .detime-stat { 
          text-align: center !important;
          flex: 1 !important;
        }
        .detime-stat-label { 
          font-size: 11px !important; 
          color: rgba(255,255,255,0.4) !important; 
          text-transform: uppercase !important; 
          letter-spacing: 1px !important;
          margin-bottom: 8px !important;
          font-weight: 600 !important;
        }
        .detime-stat-value { 
          font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace !important;
          font-size: 28px !important; 
          font-weight: 700 !important;
          letter-spacing: -1px !important;
        }
        .detime-red { color: #FF6B6B !important; }
        .detime-green { color: #4CD964 !important; }
        .detime-yellow { color: #FFD60A !important; }
        .detime-hint { 
          font-size: 10px !important; 
          color: rgba(255,255,255,0.3) !important; 
          margin-top: 6px !important;
          font-weight: 500 !important;
        }
        .detime-info { 
          background: rgba(255,255,255,0.08) !important; 
          border-radius: 16px !important; 
          padding: 20px 32px !important; 
          margin-bottom: 32px !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .detime-category { 
          font-size: 14px !important; 
          color: rgba(255,255,255,0.7) !important; 
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          font-weight: 600 !important;
        }
        .detime-actions { 
          display: flex !important; 
          gap: 12px !important; 
          flex-wrap: wrap !important; 
          justify-content: center !important; 
          margin-top: 16px !important; 
        }
        .detime-btn {
          padding: 14px 28px !important;
          border-radius: 12px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          border: none !important;
          user-select: none !important;
          -webkit-user-select: none !important;
          pointer-events: auto !important;
          transition: all 0.2s ease !important;
          letter-spacing: 0.3px !important;
        }
        .detime-btn:hover { 
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important;
        }
        .detime-btn:active { 
          transform: scale(0.97) !important;
        }
        .detime-btn-blue { 
          background: linear-gradient(135deg, #8BAF5B, #6B8F3B) !important;
          color: white !important;
          box-shadow: 0 4px 16px rgba(139, 175, 91, 0.3) !important;
        }
        .detime-btn-gray { 
          background: rgba(255,255,255,0.12) !important; 
          color: white !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
        }
        .detime-btn-gray:hover {
          background: rgba(255,255,255,0.18) !important;
        }
        .detime-btn-warning { 
          background: rgba(255,149,0,0.15) !important; 
          color: #FFB340 !important;
          border: 1px solid rgba(255,149,0,0.3) !important;
        }
        .detime-btn-warning:hover {
          background: rgba(255,149,0,0.25) !important;
        }
        .detime-btn-small { 
          padding: 10px 20px !important; 
          font-size: 12px !important;
        }
        
        /* Ignore Limit Dropdown */
        .detime-ignore-container {
          position: relative !important;
          display: inline-block !important;
        }
        .detime-ignore-dropdown {
          display: none;
          position: absolute !important;
          bottom: 100% !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          margin-bottom: 8px !important;
          background: rgba(30, 30, 40, 0.98) !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
          border-radius: 12px !important;
          padding: 8px !important;
          min-width: 180px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
          backdrop-filter: blur(20px) !important;
          z-index: 10 !important;
        }
        .detime-ignore-dropdown.show {
          display: block !important;
          animation: detime-dropdown-in 0.2s ease !important;
        }
        @keyframes detime-dropdown-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .detime-dropdown-item {
          display: block !important;
          width: 100% !important;
          padding: 12px 16px !important;
          background: transparent !important;
          border: none !important;
          border-radius: 8px !important;
          color: white !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          text-align: left !important;
          transition: background 0.15s !important;
        }
        .detime-dropdown-item:hover {
          background: rgba(255,255,255,0.1) !important;
        }
        .detime-dropdown-item.orange { color: #FFB340 !important; }
        .detime-dropdown-item.red { color: #FF6B6B !important; }
        .detime-dropdown-arrow {
          position: absolute !important;
          bottom: -6px !important;
          left: 50% !important;
          transform: translateX(-50%) rotate(45deg) !important;
          width: 12px !important;
          height: 12px !important;
          background: rgba(30, 30, 40, 0.98) !important;
          border-right: 1px solid rgba(255,255,255,0.15) !important;
          border-bottom: 1px solid rgba(255,255,255,0.15) !important;
        }
      </style>
      
      <div class="detime-container">
        <div class="detime-icon">${getBlockIcon(focusMode, reason)}</div>
        ${focusMode ? '<div class="detime-badge">🎯 Focus Mode Active</div>' : ''}
        ${reason === 'downtime' ? '<div class="detime-badge">😴 Downtime Active</div>' : ''}
        ${reason === 'whitelist' ? '<div class="detime-badge">🔒 Whitelist Mode</div>' : ''}
        <div class="detime-title">${getBlockTitle(focusMode, reason)}</div>
        <div class="detime-subtitle">${getBlockSubtitle(focusMode, reason, categoryName, downtimeEnd)}</div>
        
        ${reason === 'usage_limit' ? `
          <div class="detime-stats">
            <div class="detime-stat">
              <div class="detime-stat-label">Time Used</div>
              <div class="detime-stat-value detime-red" id="detime-used">${formatTime(used)}</div>
            </div>
            <div class="detime-stat">
              <div class="detime-stat-label">Daily Limit</div>
              <div class="detime-stat-value detime-green">${formatTime(limit)}</div>
            </div>
            <div class="detime-stat">
              <div class="detime-stat-label">Resets In</div>
              <div class="detime-stat-value detime-yellow" id="detime-countdown">${formatCountdown(getTimeUntilMidnight())}</div>
              <div class="detime-hint">until midnight</div>
            </div>
          </div>
        ` : reason === 'downtime' ? `
          <div class="detime-info">
            <div class="detime-category">${categoryName || 'Blocked Category'}</div>
            <div class="detime-hint" style="margin-top: 8px;">Downtime ends at ${downtimeEnd || '7:00 AM'}</div>
          </div>
        ` : reason === 'whitelist' ? `
          <div class="detime-info">
            <div class="detime-category">Site not in whitelist</div>
            <div class="detime-hint" style="margin-top: 8px;">Add this site to your whitelist in Settings to access it</div>
          </div>
        ` : `
          <div class="detime-info"><div class="detime-category">${categoryName || 'Blocked Category'}</div></div>
        `}
        
        <div class="detime-actions">
          <button type="button" class="detime-btn detime-btn-blue" data-detime-action="back">← Go Back</button>
          <button type="button" class="detime-btn detime-btn-gray" data-detime-action="close">Close Tab</button>
        </div>
        
        <div class="detime-actions">
          <button type="button" class="detime-btn detime-btn-gray" data-detime-action="dashboard">Dashboard</button>
          ${reason === 'usage_limit' ? `
            <div class="detime-ignore-container">
              <button type="button" class="detime-btn detime-btn-warning" data-detime-action="toggle-ignore">⏱️ Extend Limit</button>
              <div class="detime-ignore-dropdown" id="detime-ignore-dropdown">
                <div class="detime-dropdown-arrow"></div>
                <button type="button" class="detime-dropdown-item orange" data-detime-action="extend">⏱️ +15 Minutes</button>
                <button type="button" class="detime-dropdown-item red" data-detime-action="ignore">🚫 Ignore for Today</button>
              </div>
            </div>
          ` : ''}
        </div>
        
        ${showMisclassBtn && !['downtime', 'whitelist'].includes(reason) ? `
          <div class="detime-actions">
            <button type="button" class="detime-btn detime-btn-gray detime-btn-small" data-detime-action="misclass">🏷️ This isn't ${categoryName}?</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function handleAction(action, blockInfo, showMisclassBtn) {
    console.log('deTime: handleAction called:', action);
    
    const cat = blockInfo.limitId || blockInfo.category;
    const domain = window.location.hostname.replace('www.', '');

    switch(action) {
      case 'toggle-ignore':
        // Toggle the dropdown visibility
        const dropdown = document.getElementById('detime-ignore-dropdown');
        if (dropdown) {
          dropdown.classList.toggle('show');
          
          // Close dropdown when clicking outside
          const closeDropdown = (e) => {
            if (!e.target.closest('.detime-ignore-container')) {
              dropdown.classList.remove('show');
              document.removeEventListener('click', closeDropdown);
            }
          };
          
          if (dropdown.classList.contains('show')) {
            // Delay adding the listener to prevent immediate close
            setTimeout(() => {
              document.addEventListener('click', closeDropdown);
            }, 10);
          }
        }
        break;

      case 'back':
        console.log('deTime: Executing back');
        sendMessage({ type: 'GO_BACK_OR_NEW_TAB' });
        setTimeout(() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = 'about:blank';
          }
        }, 200);
        break;

      case 'close':
        console.log('deTime: Executing close');
        sendMessage({ type: 'CLOSE_CURRENT_TAB' });
        setTimeout(() => {
          window.location.href = 'about:blank';
        }, 200);
        break;

      case 'dashboard':
        console.log('deTime: Executing dashboard');
        sendMessage({ type: 'OPEN_DASHBOARD' });
        break;

      case 'extend':
        console.log('deTime: Executing extend for:', cat);
        sendMessage({ type: 'EXTEND_LIMIT_15MIN', category: cat }, (res) => {
          console.log('deTime: Extend result:', res);
          if (res?.success) {
            hideBlockOverlay();
            isBlocked = false;
            // Use location.replace to avoid beforeunload confirmation dialogs
            location.replace(location.href);
          } else {
            alert('Failed to extend. Please refresh and try again.');
          }
        });
        break;

      case 'ignore':
        console.log('deTime: Executing ignore for:', cat);
        sendMessage({ type: 'IGNORE_LIMIT_TODAY', category: cat }, (res) => {
          console.log('deTime: Ignore result:', res);
          if (res?.success) {
            hideBlockOverlay();
            isBlocked = false;
            // Use location.replace to avoid beforeunload confirmation dialogs
            location.replace(location.href);
          } else {
            alert('Failed to ignore. Please refresh and try again.');
          }
        });
        break;

      case 'misclass':
        if (!showMisclassBtn) return;
        console.log('deTime: Executing misclass');
        
        const msg = blockInfo.focusMode
          ? `Allow "${domain}" for this focus session?`
          : `Mark "${domain}" as not ${blockInfo.categoryName}?\n\nThis will classify this site as "Other" and unblock it.`;
        
        if (confirm(msg)) {
          if (blockInfo.focusMode) {
            sendMessage({ type: 'ALLOW_SITE_IN_FOCUS_MODE', domain }, () => {
              hideBlockOverlay();
              isBlocked = false;
              // Use location.replace to avoid beforeunload confirmation dialogs
              location.replace(location.href);
            });
          } else {
            sendMessage({ type: 'SAVE_SITE_OVERRIDE', override: { domain, category: 'other' } }, () => {
              hideBlockOverlay();
              isBlocked = false;
              // Use location.replace to avoid beforeunload confirmation dialogs
              location.replace(location.href);
            });
          }
        }
        break;
    }
  }

  function sendMessage(msg, callback) {
    try {
      if (!chrome.runtime?.id) {
        console.log('deTime: No runtime ID');
        if (callback) callback({ success: false });
        return;
      }
      
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          console.log('deTime: sendMessage error:', chrome.runtime.lastError.message);
          if (callback) callback({ success: false });
          return;
        }
        if (callback) callback(response);
      });
    } catch(e) {
      console.log('deTime: sendMessage exception:', e);
      if (callback) callback({ success: false });
    }
  }

  function startMidnightCountdown() {
    if (midnightResetTimer) clearInterval(midnightResetTimer);
    midnightResetTimer = setInterval(() => {
      const el = document.getElementById('detime-countdown');
      if (el) el.textContent = formatCountdown(getTimeUntilMidnight());
    }, 1000);
  }

  function hideBlockOverlay() {
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    if (document.body) {
      document.body.style.overflow = '';
    }
    if (midnightResetTimer) {
      clearInterval(midnightResetTimer);
      midnightResetTimer = null;
    }
  }

  // Wait for document to be ready
  function init() {
    setTimeout(checkBlocking, 500);
    checkInterval = setInterval(checkBlocking, 30000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkBlocking();
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'BLOCK_SITE') {
        currentBlockInfo = message;
        showBlockOverlay(message);
        isBlocked = true;
      } else if (message.type === 'UNBLOCK_SITE') {
        hideBlockOverlay();
        isBlocked = false;
        currentBlockInfo = null;
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
