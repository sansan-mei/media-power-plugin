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

/**
 * Try to read XHS tokens from page context storages
 * 小红书目前主要从URL中获取参数，但可以提取localStorage中的b1值（用于签名）
 * Returns possibly undefined values; background will handle fallbacks
 */
function getXhsTokens() {
  // 提取localStorage中的b1值（用于API签名）
  const b1 = safeReadStorage(window.localStorage, "b1");
  return {
    b1: b1 || null,
  };
}

/**
 * Try to read Bilibili WBI keys from localStorage
 * B站的WBI签名需要从localStorage中获取密钥
 */
function getBilibiliWbiKeys() {
  const wbi_img_urls = safeReadStorage(window.localStorage, "wbi_img_urls");
  
  // 如果没有 wbi_img_urls，尝试分别获取
  if (!wbi_img_urls) {
    const wbi_img_url = safeReadStorage(window.localStorage, "wbi_img_url");
    const wbi_sub_url = safeReadStorage(window.localStorage, "wbi_sub_url");
    
    if (wbi_img_url && wbi_sub_url) {
      return {
        wbi_img_urls: `${wbi_img_url}-${wbi_sub_url}`,
      };
    }
    return {
      wbi_img_urls: null,
    };
  }
  
  return {
    wbi_img_urls,
  };
}

/**
 * Get all cookies from document.cookie
 * 使用 document.cookie 可以获取到所有 cookies（包括某些扩展 API 无法访问的）
 */
function getAllCookies() {
  try {
    const cookies = document.cookie
      .split(";")
      .map((cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        const value = valueParts.join("="); // 处理值中包含 = 的情况
        return { name: name.trim(), value: value.trim() };
      })
      .filter((c) => c.name); // 过滤掉空值

    console.log("通过 document.cookie 获取到的 cookies 数量:", cookies.length);
    console.log(
      "Cookies 名称列表:",
      cookies.map((c) => c.name)
    );
    return cookies;
  } catch (e) {
    console.error("Error getting cookies from document.cookie:", e);
    return [];
  }
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

  if (message && message.type === "XHS_GET_TOKENS") {
    try {
      const data = getXhsTokens();
      sendResponse({ success: true, ...data });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true; // keep message channel open for async
  }

  if (message && message.type === "BILI_GET_WBI_KEYS") {
    try {
      const data = getBilibiliWbiKeys();
      console.log("研究小助手，已获取到B站WBI密钥:", data);
      sendResponse({ success: true, ...data });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true; // keep message channel open for async
  }

  if (message && message.type === "GET_COOKIES") {
    try {
      const cookies = getAllCookies();
      sendResponse({ success: true, cookies });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true; // keep message channel open for async
  }
});

// 注册全局快捷键：Mac 使用 Option+A，Windows 使用 Alt+A
// 支持所有平台（bilibili、douyin、youtube、xhs、zhihu）
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
