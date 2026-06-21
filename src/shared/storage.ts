export type OnboardingChoices = {
  historyImport: boolean;
  notifications: boolean;
  cloudSync: false;
  rawSync: false;
  completedAt?: string;
};

const STORAGE_KEY = 'drifty.browser.onboardingChoices';

function chromeStorageAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function readOnboardingChoices(): Promise<OnboardingChoices | null> {
  if (chromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const stored = result[STORAGE_KEY] as OnboardingChoices | undefined;
        resolve(stored ?? null);
      });
    });
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as OnboardingChoices : null;
  } catch {
    return null;
  }
}

export async function saveOnboardingChoices(choices: OnboardingChoices): Promise<void> {
  if (chromeStorageAvailable()) {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: choices }, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    });
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
}
