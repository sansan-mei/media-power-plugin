const requestHapi = "request-hapi";
const requestHapiElement = "request-hapi-element";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: requestHapi,
    title: "搜集视频",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: requestHapiElement,
    title: "搜集该视频",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === requestHapi) {
    requestHapiHandle();
  }
  if (info.menuItemId === requestHapiElement) {
    requestHapiHandle(info);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DY_TRIGGER_REQUEST") {
    requestHapiHandle();
    if (typeof sendResponse === "function") {
      sendResponse({ success: true });
    }
  }
});

/**
 * 请求Hapi服务
 * @param {chrome.contextMenus.OnClickData} [info]
 */
function requestHapiHandle(info) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // 优先使用右键点击的链接URL，否则使用当前页面URL
    const url = info?.linkUrl || tabs[0].url;
    console.log("目标URL:", url);
    const allowedDomains = [
      "bilibili",
      "youtube",
      "douyin",
      "xiaohongshu",
      "xhslink",
    ];

    if (!allowedDomains.some((domain) => url.includes(domain))) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "错误",
        message: "此功能在当前页面不可用",
      });
      return;
    }

    // 确定平台：优先匹配更具体的域名
    let platform = null;
    if (url.includes("xiaohongshu") || url.includes("xhslink")) {
      platform = "xhs";
    } else {
      platform = allowedDomains.find((domain) => url.includes(domain));
    }

    const apiUrl = new URL(
      `http://127.0.0.1:39002/start-crawl/${platform}/${encodeURIComponent(
        url
      )}`
    );

    const tabId = tabs[0].id;

    // 根据平台获取token：抖音需要从localStorage获取，小红书暂时不需要
    const tokenPromise =
      platform === "douyin"
        ? getDouyinTokens(tabId, platform)
        : platform === "xhs"
        ? getXhsTokens(tabId, platform)
        : Promise.resolve({});

    // 收集 cookies: 统一改为使用 domain 属性，更全面
    const domainToCollect = [];
    if (platform === "douyin") {
      domainToCollect.push(".douyin.com"); // 顶级域名，捕获所有子域
    } else if (platform === "xhs") {
      // 使用 .xiaohongshu.com 捕获所有子域名 cookies
      domainToCollect.push(".xiaohongshu.com");
    } else if (platform === "youtube") {
      domainToCollect.push(".youtube.com");
    } else if (platform === "bilibili") {
      domainToCollect.push(".bilibili.com");
    }

    // 始终包含当前页面 URL 的 cookies，以防有特定 path 或 host 的 cookie
    const currentUrlCookiePromise = chrome.cookies.getAll({ url: tabs[0].url });

    // 收集所有指定域名的 cookies
    const domainCookiesPromises = domainToCollect.map((d) =>
      chrome.cookies.getAll({ domain: d })
    );

    const contentCookiesPromise = getCookiesFromContentScript(tabId);

    const cookiesPromise = Promise.all([
      contentCookiesPromise,
      currentUrlCookiePromise,
      ...domainCookiesPromises,
    ]).then((results) => {
      // 去重：按顺序优先保留前面来源（当前页优先）
      const nameToValue = new Map();
      results.forEach((list) => {
        list.forEach((c) => {
          if (!nameToValue.has(c.name)) {
            nameToValue.set(c.name, decodeURIComponent(c.value));
          }
        });
      });
      return Array.from(nameToValue, ([name, value]) => ({ name, value }));
    });

    cookiesPromise.then((baseCookiePairs) => {
      return tokenPromise.then((tokens) => {
        const cookiePairs = [...baseCookiePairs];

        console.log("转换后的cookies:", cookiePairs);

        if (!cookiePairs || cookiePairs.length === 0) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "错误",
            message: "未能获取到任何cookie",
          });
          return;
        }

        const postData = {
          cookies: cookiePairs,
          userAgent: navigator.userAgent,
          xmst: platform === "douyin" ? tokens?.xmst || null : null,
          aweme_id: platform === "douyin" ? tokens?.aweme_id || null : null,
          // 小红书相关参数
          url: platform === "xhs" ? url : null,
          b1: platform === "xhs" ? tokens?.b1 || null : null,
        };

        postRequest(apiUrl, postData);
      });
    });
  });
}
/**
 *
 * @param {number} tabId
 * @param {string} platform
 * @returns
 */
function getDouyinTokens(tabId, platform) {
  return new Promise((resolve) => {
    if (platform !== "douyin") {
      resolve({});
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: "DY_GET_TOKENS" }, (resp) =>
      resolve(resp || {})
    );
  });
}

/**
 * 获取小红书相关token（如果需要的话）
 * @param {number} tabId
 * @param {string} platform
 * @returns {Promise<any>}
 */
function getXhsTokens(tabId, platform) {
  return new Promise((resolve) => {
    if (platform !== "xhs") {
      resolve({});
      return;
    }
    // 小红书目前不需要从页面提取特殊token，URL中已包含所需参数
    // 如果需要从localStorage提取b1等值，可以在这里添加
    chrome.tabs.sendMessage(tabId, { type: "XHS_GET_TOKENS" }, (resp) =>
      resolve(resp || {})
    );
  });
}

/**
 *
 * @param {URL} url
 * @param {Object} data
 * @returns
 */
function postRequest(url, data) {
  fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
    mode: "cors",
  })
    .then(async (response) => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      const errorMessage =
        error.message || "无法连接到本地服务器，请确保服务器已启动";
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "请求失败",
        message: errorMessage,
      });
    });
}

/**
 * 新增：从 Content Script 获取 document.cookie
 * @param {number} tabId
 */
function getCookiesFromContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_COOKIES" }, (response) => {
      // 如果连接失败（比如页面没加载完）或者返回错误，返回空数组，不要卡死流程
      if (chrome.runtime.lastError) {
        console.log(
          "Content Script cookie fetch ignored:",
          chrome.runtime.lastError.message
        );
        resolve([]);
        return;
      }
      if (response && response.success && Array.isArray(response.cookies)) {
        resolve(response.cookies);
      } else {
        resolve([]);
      }
    });
  });
}
