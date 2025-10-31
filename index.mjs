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
 * Extract aweme_id from active video element
 * 优先使用 data-e2e="feed-active-video" 选择器，直接获取当前播放的视频ID
 */
function extractAwemeId() {
  try {
    // 1. 查找当前在滑块列表中被标记为"活动视频"的元素
    const activeVideoElement = document.querySelector(
      '[data-e2e="feed-active-video"]'
    );

    if (activeVideoElement) {
      // 直接从 data-e2e-vid 属性获取 aweme_id
      const awemeId = activeVideoElement.getAttribute("data-e2e-vid");
      console.log("研究小助手，已获取到抖音视频ID:", awemeId);
      if (awemeId) {
        return awemeId;
      }
    }

    // 2. 备用方案：从类名中提取（兼容旧版本）
    const elements = document.querySelectorAll(
      '[class*="xgplayer-playclarity-setting-unique-"]'
    );

    if (elements.length === 0) {
      return null;
    }

    // 收集所有匹配的 aweme_id
    const candidates = [];
    for (const element of elements) {
      const className = element.className;
      const match = className.match(
        /xgplayer-playclarity-setting-unique-(\d+)-\d+/
      );
      if (match && match[1]) {
        const rect = element.getBoundingClientRect();
        const isVisible =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;

        candidates.push({
          awemeId: match[1],
          element,
          isVisible,
          centerY: rect.top + rect.height / 2,
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // 优先选择在视口中可见的元素
    const visibleCandidates = candidates.filter((c) => c.isVisible);
    if (visibleCandidates.length > 0) {
      const viewportCenter = window.innerHeight / 2;
      visibleCandidates.sort(
        (a, b) =>
          Math.abs(a.centerY - viewportCenter) -
          Math.abs(b.centerY - viewportCenter)
      );
      return visibleCandidates[0].awemeId;
    }

    // 如果没有完全可见的元素，选择中间位置的元素
    if (candidates.length >= 2) {
      candidates.sort((a, b) => a.centerY - b.centerY);
      const middleIndex = Math.floor(candidates.length / 2);
      return candidates[middleIndex].awemeId;
    }

    return candidates[0].awemeId;
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

// 注册全局快捷键：Mac 使用 Option+A，Windows 使用 Alt+A
window.addEventListener("keydown", (event) => {
  const isTriggerKey = event.code === "KeyA";
  if (!isTriggerKey || !event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (event.repeat) {
    return;
  }
  event.preventDefault();
  chrome.runtime.sendMessage({ type: "DY_TRIGGER_REQUEST" });
});
