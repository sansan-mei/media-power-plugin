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
 * Extract aweme_id from HTML class names
 * Looks for class names like "xgplayer-playclarity-setting-unique-{aweme_id}-{timestamp}"
 */
function extractAwemeId() {
  try {
    // 查找包含特定类名模式的元素
    const elements = document.querySelectorAll(
      '[class*="xgplayer-playclarity-setting-unique-"]'
    );

    for (const element of elements) {
      const className = element.className;
      // 匹配模式：xgplayer-playclarity-setting-unique-{数字ID}-{时间戳}
      const match = className.match(
        /xgplayer-playclarity-setting-unique-(\d+)-\d+/
      );
      if (match && match[1]) {
        return match[1]; // 返回提取的数字ID
      }
    }

    return null;
  } catch (e) {
    console.error("Error extracting aweme_id:", e);
    return null;
  }
}

/**
 * Try to read Douyin tokens from page context storages
 * Returns possibly undefined values; background will handle fallbacks
 */
function getDouyinTokens() {
  const xmst = safeReadStorage(window.localStorage, "xmst");
  const aweme_id = extractAwemeId();
  return {
    xmst,
    aweme_id,
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
