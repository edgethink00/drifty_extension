// ===== State =====
const userConfig = {
  displayName: '',
  weekStartDay: 1,
  notificationsEnabled: true,
  privacyModeEnabled: false,
  analyzeHistory: true,
  shareAnonymousData: false,
};

const backgroundTasks = {
  domainCache:     { promise: null, status: 'pending' },
  historyAnalysis: { promise: null, status: 'pending' },
  classification:  { promise: null, status: 'pending' },
};

// ===== Screen Navigation =====
const screenIds = ['welcomeScreen', 'nameScreen', 'progressScreen'];
let currentScreenIndex = 0;

function goToStep(index) {
  const currentScreen = document.getElementById(screenIds[currentScreenIndex]);
  const nextScreen = document.getElementById(screenIds[index]);
  if (!currentScreen || !nextScreen) return;

  currentScreen.style.animation = 'screenOut 0.3s ease forwards';
  setTimeout(() => {
    currentScreen.classList.add('hidden');
    currentScreen.style.animation = '';

    nextScreen.classList.remove('hidden');
    nextScreen.style.animation = 'screenIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)';

    currentScreenIndex = index;

    // Init progress screen
    if (index === 2) {
      onProgressScreen();
    }
  }, 250);
}

// ===== Background Tasks =====
function startBackgroundTasks() {
  // 1. Domain cache
  backgroundTasks.domainCache.status = 'running';
  backgroundTasks.domainCache.promise = sendMessageAsync({ type: 'DOWNLOAD_DOMAIN_CACHE' })
    .then(r => {
      backgroundTasks.domainCache.status = r.success ? 'done' : 'error';
      console.log('[Onboarding] Domain cache:', backgroundTasks.domainCache.status);
    })
    .catch(e => {
      backgroundTasks.domainCache.status = 'error';
      console.error('[Onboarding] Domain cache error:', e);
    });

  // 2. History analysis (conditional)
  if (userConfig.analyzeHistory) {
    backgroundTasks.historyAnalysis.status = 'running';
    backgroundTasks.historyAnalysis.promise = sendMessageAsync({ type: 'ANALYZE_HISTORY', days: 14 })
      .then(r => {
        backgroundTasks.historyAnalysis.status = 'done';
        console.log('[Onboarding] History done:', r.data?.sessionsCreated, 'sessions');
        startClassification();
      })
      .catch(e => {
        backgroundTasks.historyAnalysis.status = 'error';
        console.error('[Onboarding] History error:', e);
        startClassification();
      });
  } else {
    backgroundTasks.historyAnalysis.status = 'skipped';
    startClassification();
  }
}

function startClassification() {
  backgroundTasks.classification.status = 'running';
  backgroundTasks.classification.promise = sendMessageAsync({ type: 'PROCESS_RECENT_THEN_BACKGROUND' })
    .then(r => {
      backgroundTasks.classification.status = 'done';
      console.log('[Onboarding] Classification done:', r.data);
    })
    .catch(e => {
      backgroundTasks.classification.status = 'error';
      console.error('[Onboarding] Classification error:', e);
    });
}

// ===== Settings =====
async function saveMinimalSettings() {
  try {
    const response = await sendMessageAsync({ type: 'GET_SETTINGS' });
    const settings = response.success ? response.data : {};

    settings.privacy = {
      dataCollectionConsent: true,
      collectFullData: true,
      excludedDomains: settings.privacy?.excludedDomains || []
    };

    if (!settings.serverSync) settings.serverSync = {};
    settings.serverSync.enabled = true;
    settings.serverSync.shareUsageData = userConfig.shareAnonymousData;

    if (!settings.historyAnalysis) settings.historyAnalysis = {};
    settings.historyAnalysis.showApproximatedData = userConfig.analyzeHistory;

    await sendMessageAsync({ type: 'SAVE_SETTINGS', settings });
    console.log('[Onboarding] Minimal settings saved');
  } catch (error) {
    console.error('[Onboarding] Error saving minimal settings:', error);
  }
}

async function saveFinalSettings() {
  try {
    const response = await sendMessageAsync({ type: 'GET_SETTINGS' });
    const settings = response.success ? response.data : {};

    settings.displayName = userConfig.displayName;
    settings.weekStartDay = userConfig.weekStartDay;

    if (!settings.notifications) settings.notifications = {};
    settings.notifications.enabled = userConfig.notificationsEnabled;

    if (!settings.privacyMode) settings.privacyMode = {};
    settings.privacyMode.enabled = userConfig.privacyModeEnabled;

    settings.privacy = {
      dataCollectionConsent: true,
      collectFullData: true,
      excludedDomains: settings.privacy?.excludedDomains || []
    };

    if (!settings.serverSync) settings.serverSync = {};
    settings.serverSync.enabled = true;
    settings.serverSync.shareUsageData = userConfig.shareAnonymousData;

    if (!settings.historyAnalysis) settings.historyAnalysis = {};
    settings.historyAnalysis.showApproximatedData = userConfig.analyzeHistory;

    settings.onboardingComplete = true;

    await sendMessageAsync({ type: 'SAVE_SETTINGS', settings });
    console.log('[Onboarding] Final settings saved');
  } catch (error) {
    console.error('[Onboarding] Error saving final settings:', error);
  }
}

// ===== Progress + Tips Screen =====
let tipIndex = 0;
let tipInterval = null;

function startTipsSlideshow() {
  const tips = document.querySelectorAll('.tip-card');
  const dots = document.querySelectorAll('.tip-dot');
  if (tips.length === 0) return;

  tipInterval = setInterval(() => {
    tips[tipIndex].classList.remove('active');
    dots[tipIndex].classList.remove('active');

    tipIndex = (tipIndex + 1) % tips.length;

    tips[tipIndex].classList.add('active');
    tips[tipIndex].style.animation = 'none';
    // Force reflow to restart animation
    tips[tipIndex].offsetHeight;
    tips[tipIndex].style.animation = '';

    dots[tipIndex].classList.add('active');
  }, 4000);
}

function updateCompactProgress() {
  const map = {
    cpCache: backgroundTasks.domainCache,
    cpHistory: backgroundTasks.historyAnalysis,
    cpClassify: backgroundTasks.classification,
  };

  for (const [id, task] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.className = 'compact-progress-item';
    if (task.status === 'running') el.classList.add('running');
    else if (task.status === 'done') el.classList.add('done');
    else if (task.status === 'error') el.classList.add('error');
    else if (task.status === 'skipped') el.classList.add('skipped');
  }

  // Check if all done
  const allDone = Object.values(backgroundTasks).every(
    t => t.status === 'done' || t.status === 'skipped' || t.status === 'error'
  );

  if (allDone) {
    const btn = document.getElementById('openDashboardBtn');
    if (btn && btn.disabled) {
      btn.disabled = false;
      btn.textContent = 'Open Dashboard';
    }
  }
}

async function onProgressScreen() {
  // Start tips slideshow
  startTipsSlideshow();

  // Update progress UI periodically
  updateCompactProgress();
  const progressInterval = setInterval(updateCompactProgress, 500);

  // Save final settings
  await saveFinalSettings();

  // Wait for all background tasks
  const allPromises = Object.values(backgroundTasks)
    .map(t => t.promise)
    .filter(Boolean);

  await Promise.allSettled(allPromises);
  clearInterval(progressInterval);
  updateCompactProgress();

  // Success state
  if (tipInterval) clearInterval(tipInterval);

  const icon = document.getElementById('completeIcon');
  icon.textContent = '✅';
  icon.classList.add('success');
  document.getElementById('completeTitle').textContent = "You're All Set!";
  document.getElementById('completeSubtitle').textContent = 'Redirecting to dashboard...';

  const btn = document.getElementById('openDashboardBtn');
  btn.disabled = false;
  btn.textContent = 'Open Dashboard';

  await sleep(1500);
  window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
}

// ===== DOM Setup =====
document.addEventListener('DOMContentLoaded', () => {
  // --- Welcome Screen ---
  document.getElementById('startBtn').addEventListener('click', () => {
    // Read all welcome screen options
    userConfig.analyzeHistory = document.getElementById('analyzeHistory').checked;
    userConfig.shareAnonymousData = document.getElementById('shareStats').checked;

    // Read advanced settings if opened
    const notifToggle = document.getElementById('notificationsToggle');
    const privacyToggle = document.getElementById('privacyModeToggle');
    if (notifToggle) userConfig.notificationsEnabled = notifToggle.checked;
    if (privacyToggle) userConfig.privacyModeEnabled = privacyToggle.checked;

    // Save minimal settings for background tasks
    saveMinimalSettings();

    // Fire background tasks immediately
    startBackgroundTasks();

    // Go to name screen
    goToStep(1);
  });

  // --- Advanced Settings Toggle ---
  document.getElementById('advancedToggle').addEventListener('click', () => {
    const panel = document.getElementById('advancedPanel');
    const arrow = document.getElementById('advancedArrow');
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      arrow.classList.add('open');
    } else {
      panel.classList.add('hidden');
      arrow.classList.remove('open');
    }
  });

  // Segment control (week start day)
  const segmentBtns = document.querySelectorAll('#weekStartControl .segment-btn');
  segmentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      segmentBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      userConfig.weekStartDay = parseInt(btn.dataset.value);
    });
  });

  // --- Name Screen ---
  const nameInput = document.getElementById('nameInput');
  const greetingText = document.getElementById('greetingPreview').querySelector('.greeting-preview-text');

  function getGreetingText() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  greetingText.textContent = getGreetingText();

  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    greetingText.textContent = name
      ? `${getGreetingText()}, ${name}`
      : getGreetingText();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      userConfig.displayName = nameInput.value.trim();
      goToStep(2);
    }
  });

  document.getElementById('nameNextBtn').addEventListener('click', () => {
    userConfig.displayName = nameInput.value.trim();
    goToStep(2);
  });

  document.getElementById('nameSkipBtn').addEventListener('click', () => {
    userConfig.displayName = '';
    goToStep(2);
  });

  // --- Progress Screen ---
  document.getElementById('openDashboardBtn').addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
  });
});

// ===== Utilities =====
function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      // Service worker not ready, retry once
      setTimeout(() => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      }, 500);
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Onboarding] Page loaded');
