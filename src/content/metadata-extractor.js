(() => {
  if (window.__driftyMetadataExtractorInjected) {
    return;
  }

  window.__driftyMetadataExtractorInjected = true;

  function currentMetadata() {
    return {
      url: window.location.href,
      title: document.title || '',
      domain: window.location.hostname.replace(/^www\./, '').toLowerCase(),
      timestamp: Date.now()
    };
  }

  function sendMetadata() {
    if (!chrome.runtime?.sendMessage) {
      return;
    }

    chrome.runtime.sendMessage({
      type: 'RECORD_PAGE_METADATA',
      ...currentMetadata()
    }, () => {
      void chrome.runtime.lastError;
    });
  }

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'REQUEST_PAGE_METADATA') {
      return false;
    }

    sendMetadata();
    sendResponse?.({ success: true });
    return false;
  });

  sendMetadata();

  let lastTitle = document.title;
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    if (document.title === lastTitle) {
      return;
    }

    lastTitle = document.title;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendMetadata, 300);
  });

  const titleElement = document.querySelector('head > title');
  if (titleElement) {
    observer.observe(titleElement, { childList: true });
  } else if (document.head) {
    observer.observe(document.head, { childList: true, subtree: true });
  }
})();
