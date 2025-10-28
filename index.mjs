// Content script: handle token extraction for Douyin pages

/**
 * Safely read a key from a Web Storage object
 * @param {Storage} storage
 * @param {string} key
 */
function safeReadStorage(storage, key) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Try to read Douyin tokens from page context storages
 * Returns possibly undefined values; background will handle fallbacks
 */
function getDouyinTokens() {
  const xmst = safeReadStorage(window.localStorage, "xmst");
  return {
    xmst,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "DY_GET_TOKENS") {
    try {
      const data = getDouyinTokens();
      sendResponse({ success: true, ...data });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true; // keep message channel open for async
  }
});
