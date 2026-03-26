// Onboarding flow state
let currentStep = 'welcome';
let userChoices = {
  agreeToDataCollection: false,
  shareAnonymousData: false,
  excludedDomains: [],
  analyzeHistory: true
};

// DOM elements
const welcomeScreen = document.getElementById('welcomeScreen');
const privacyScreen = document.getElementById('privacyScreen');
const statsScreen = document.getElementById('statsScreen');
const setupScreen = document.getElementById('setupScreen');
const completeScreen = document.getElementById('completeScreen');

const getStartedBtn = document.getElementById('getStartedBtn');
const agreeBtn = document.getElementById('agreeBtn');
const declineBtn = document.getElementById('declineBtn');
const skipStatsBtn = document.getElementById('skipStatsBtn');
const continueStatsBtn = document.getElementById('continueStatsBtn');
const skipBtn = document.getElementById('skipBtn');
const finishBtn = document.getElementById('finishBtn');

const excludedDomainsTextarea = document.getElementById('excludedDomains');
const analyzeHistoryCheckbox = document.getElementById('analyzeHistory');

// Event Listeners
getStartedBtn.addEventListener('click', () => {
  showScreen('privacy');
});

agreeBtn.addEventListener('click', () => {
  userChoices.agreeToDataCollection = true;
  showScreen('stats');
});

declineBtn.addEventListener('click', () => {
  userChoices.agreeToDataCollection = false;
  alert('deTime requires data collection to function. The extension will be disabled.');
  window.close();
});

skipStatsBtn.addEventListener('click', async () => {
  userChoices.shareAnonymousData = false;
  await savePrivacySettings();
  showScreen('setup');
});

continueStatsBtn.addEventListener('click', async () => {
  userChoices.shareAnonymousData = true;
  await savePrivacySettings();
  showScreen('setup');
});

skipBtn.addEventListener('click', async () => {
  await completeSetup();
});

finishBtn.addEventListener('click', async () => {
  const domainsText = excludedDomainsTextarea.value.trim();
  if (domainsText) {
    userChoices.excludedDomains = domainsText
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);
  }

  userChoices.analyzeHistory = analyzeHistoryCheckbox.checked;
  await completeSetup();
});

// Functions
function showScreen(screen) {
  welcomeScreen.classList.add('hidden');
  privacyScreen.classList.add('hidden');
  statsScreen.classList.add('hidden');
  setupScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');

  switch(screen) {
    case 'welcome':
      welcomeScreen.classList.remove('hidden');
      break;
    case 'privacy':
      privacyScreen.classList.remove('hidden');
      break;
    case 'stats':
      statsScreen.classList.remove('hidden');
      break;
    case 'setup':
      setupScreen.classList.remove('hidden');
      break;
    case 'complete':
      completeScreen.classList.remove('hidden');
      break;
  }

  currentStep = screen;
}

async function savePrivacySettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.success ? response.data : {};

    settings.privacy = {
      dataCollectionConsent: userChoices.agreeToDataCollection,
      collectFullData: userChoices.agreeToDataCollection,
      excludedDomains: userChoices.excludedDomains
    };

    if (!settings.serverSync) {
      settings.serverSync = {};
    }
    settings.serverSync.enabled = true;
    settings.serverSync.shareUsageData = userChoices.shareAnonymousData;

    settings.onboardingComplete = true;

    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: settings
    });

    console.log('Privacy settings saved:', settings.privacy);
  } catch (error) {
    console.error('Error saving privacy settings:', error);
  }
}

async function completeSetup() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.success ? response.data : {};

    if (userChoices.excludedDomains.length > 0) {
      if (!settings.privacy) {
        settings.privacy = {};
      }
      settings.privacy.excludedDomains = userChoices.excludedDomains;
    }

    if (!settings.historyAnalysis) {
      settings.historyAnalysis = {};
    }
    settings.historyAnalysis.showApproximatedData = userChoices.analyzeHistory;

    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: settings
    });

    console.log('Setup complete. Final settings:', settings);

    showScreen('complete');
    await runSetupTasks();

    window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
  } catch (error) {
    console.error('Error completing setup:', error);
    window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
  }
}

async function runSetupTasks() {
  const stepCache = document.getElementById('stepCache');
  const stepHistory = document.getElementById('stepHistory');
  const stepClassify = document.getElementById('stepClassify');

  try {
    // Step 1: Download domain cache
    updateStepStatus(stepCache, 'running', 'Downloading category database...');
    const cacheResult = await sendMessageAsync({ type: 'DOWNLOAD_DOMAIN_CACHE' });
    console.log('[Onboarding] Domain cache download result:', cacheResult);
    if (cacheResult.success) {
      updateStepStatus(stepCache, 'completed', 'Category database downloaded');
    } else {
      updateStepStatus(stepCache, 'error', 'Failed to download database');
    }
    await sleep(500);

    // Step 2: Analyze history if enabled
    if (userChoices.analyzeHistory) {
      updateStepStatus(stepHistory, 'running', 'Analyzing browsing history...');
      const result = await sendMessageAsync({ type: 'ANALYZE_HISTORY', days: 14 });
      console.log('[Onboarding] History analysis result:', result);
      updateStepStatus(stepHistory, 'completed', `Analyzed ${result.data?.sessionsCreated || 0} sessions`);
      await sleep(500);
    } else {
      updateStepStatus(stepHistory, 'completed', 'History analysis skipped');
      await sleep(500);
    }

    // Step 3: Classify activities with live progress
    updateStepStatus(stepClassify, 'running', 'Classifying activities... (0/0)');

    // Listen for progress updates from background
    const progressListener = (message) => {
      if (message.type === 'CLASSIFY_PROGRESS' && message.progress) {
        const { processed, total } = message.progress;
        updateStepStatus(stepClassify, 'running', `Classifying activities... (${processed}/${total})`);
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    const classifyResult = await sendMessageAsync({ type: 'PROCESS_ALL_BATCHES' });
    chrome.runtime.onMessage.removeListener(progressListener);
    console.log('[Onboarding] All batches classification result:', classifyResult);
    updateStepStatus(stepClassify, 'completed', 'All activities classified');
    await sleep(500);

    // Success state
    const icon = document.getElementById('completeIcon');
    icon.textContent = '✅';
    icon.classList.add('success');
    document.getElementById('completeTitle').textContent = "You're All Set!";
    document.getElementById('completeSubtitle').textContent = 'Redirecting to dashboard...';
    await sleep(1000);

  } catch (error) {
    console.error('Error in setup tasks:', error);
  }
}

function updateStepStatus(element, status, text) {
  const icon = element.querySelector('.p-icon');
  const textEl = element.querySelector('.p-text');

  textEl.textContent = text;
  element.className = `progress-item ${status}`;

  if (status === 'running') {
    icon.textContent = '⏳';
  } else if (status === 'completed') {
    icon.textContent = '✅';
  } else if (status === 'error') {
    icon.textContent = '❌';
  }
}

function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize
console.log('Onboarding page loaded');
