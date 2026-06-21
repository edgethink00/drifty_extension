(() => {
  if (window.__driftyBlockOverlayInjected) {
    return;
  }

  window.__driftyBlockOverlayInjected = true;

  function askForBlockingStatus() {
    if (!chrome.runtime?.sendMessage) {
      return;
    }

    chrome.runtime.sendMessage({
      type: 'CHECK_BLOCKING_STATUS',
      url: window.location.href
    }, (response) => {
      void chrome.runtime.lastError;
      if (!response?.success || !response.data?.blocked) {
        return;
      }

      document.documentElement.dataset.driftyBlocked = 'true';
    });
  }

  askForBlockingStatus();
})();
