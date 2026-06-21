export const driftyManifest = {
  manifest_version: 3,
  name: 'Drifty',
  version: '1.0.0',
  description: 'Drifty MV3 extension scaffold built with Vite, React, and TypeScript.',
  permissions: [
    'tabs',
    'storage',
    'alarms',
    'webNavigation',
    'unlimitedStorage',
    'history',
    'notifications',
    'idle',
    'sessions',
    'favicon'
  ],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'background/service-worker.js',
    type: 'module'
  },
  action: {
    default_popup: 'popup/index.html',
    default_icon: {
      '16': 'icons/drifty-icon.png',
      '48': 'icons/drifty-icon.png',
      '128': 'icons/drifty-icon.png'
    }
  },
  options_page: 'dashboard/index.html',
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content/block-overlay.js'],
      run_at: 'document_start',
      all_frames: false
    },
    {
      matches: ['<all_urls>'],
      js: ['content/metadata-extractor.js'],
      run_at: 'document_idle',
      all_frames: false
    }
  ],
  icons: {
    '16': 'icons/drifty-icon.png',
    '48': 'icons/drifty-icon.png',
    '128': 'icons/drifty-icon.png'
  }
} as const;
