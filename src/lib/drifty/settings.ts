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

export type DriftyBrowserSettings = {
  sync: BrowserSyncSettings;
  privacy: BrowserPrivacySettings;
};

export const DRIFTY_BROWSER_SETTINGS_DEFAULTS: DriftyBrowserSettings = {
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

export function mergeBrowserSettings(legacySettings: unknown): DriftyBrowserSettings & { legacy: unknown } {
  const settings = isRecord(legacySettings) ? legacySettings : {};
  const sync = isRecord(settings.sync) ? settings.sync : {};
  const privacy = isRecord(settings.privacy) ? settings.privacy : {};

  return {
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
