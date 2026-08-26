export type BrowserSyncSettings = {
  cloudSyncEnabled: boolean;
  remoteCategorySyncEnabled: boolean;
  rawHistorySyncEnabled: boolean;
  rawSessionSyncEnabled: boolean;
};

export type BrowserPrivacySettings = {
  preserveRawBrowsingLocalOnly: boolean;
  preserveRawSessionsLocalOnly: boolean;
};

export type StartOfWeek = 'sunday' | 'monday';

export type BrowserPreferenceSettings = {
  startOfDayMinutes: number;
  startOfWeek: StartOfWeek;
};

export type DriftyBrowserSettings = {
  trackingEnabled: boolean;
  preferences: BrowserPreferenceSettings;
  sync: BrowserSyncSettings;
  privacy: BrowserPrivacySettings;
};

export const DRIFTY_BROWSER_SETTINGS_DEFAULTS: DriftyBrowserSettings = {
  trackingEnabled: true,
  preferences: {
    startOfDayMinutes: 240,
    startOfWeek: 'sunday'
  },
  sync: {
    cloudSyncEnabled: false,
    remoteCategorySyncEnabled: false,
    rawHistorySyncEnabled: false,
    rawSessionSyncEnabled: false
  },
  privacy: {
    preserveRawBrowsingLocalOnly: true,
    preserveRawSessionsLocalOnly: true
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function booleanSetting(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = settings[key];
  return typeof value === 'boolean' ? value : fallback;
}

function numberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function mergeBrowserSettings(legacySettings: unknown): DriftyBrowserSettings & { legacy: unknown } {
  const settings = isRecord(legacySettings) ? legacySettings : {};
  const preferences = isRecord(settings.preferences) ? settings.preferences : {};
  const sync = isRecord(settings.sync) ? settings.sync : {};
  const privacy = isRecord(settings.privacy) ? settings.privacy : {};

  return {
    trackingEnabled: booleanSetting(settings, 'trackingEnabled', DRIFTY_BROWSER_SETTINGS_DEFAULTS.trackingEnabled),
    preferences: {
      startOfDayMinutes: numberSetting(preferences, 'startOfDayMinutes', DRIFTY_BROWSER_SETTINGS_DEFAULTS.preferences.startOfDayMinutes),
      startOfWeek: preferences.startOfWeek === 'monday' ? 'monday' : 'sunday'
    },
    sync: {
      cloudSyncEnabled: booleanSetting(sync, 'cloudSyncEnabled', DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.cloudSyncEnabled),
      remoteCategorySyncEnabled: booleanSetting(sync, 'remoteCategorySyncEnabled', DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.remoteCategorySyncEnabled),
      rawHistorySyncEnabled: booleanSetting(sync, 'rawHistorySyncEnabled', DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.rawHistorySyncEnabled),
      rawSessionSyncEnabled: booleanSetting(sync, 'rawSessionSyncEnabled', DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.rawSessionSyncEnabled)
    },
    privacy: {
      preserveRawBrowsingLocalOnly: booleanSetting(privacy, 'preserveRawBrowsingLocalOnly', DRIFTY_BROWSER_SETTINGS_DEFAULTS.privacy.preserveRawBrowsingLocalOnly),
      preserveRawSessionsLocalOnly: booleanSetting(privacy, 'preserveRawSessionsLocalOnly', DRIFTY_BROWSER_SETTINGS_DEFAULTS.privacy.preserveRawSessionsLocalOnly)
    },
    legacy: legacySettings
  };
}
