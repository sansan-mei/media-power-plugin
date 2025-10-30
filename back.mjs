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

/**
 * 请求Hapi服务
 * @param {chrome.contextMenus.OnClickData} [info]
 */
function requestHapiHandle(info) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // 优先使用右键点击的链接URL，否则使用当前页面URL
    const url = info?.linkUrl || tabs[0].url;
    console.log("目标URL:", url);
    const allowedDomains = ["bilibili", "youtube", "douyin"];

    if (!allowedDomains.some((domain) => url.includes(domain))) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "错误",
        message: "此功能在当前页面不可用",
      });
      return;
    }
    const platform = allowedDomains.find((domain) => url.includes(domain));

    const apiUrl = new URL(
      `http://127.0.0.1:39002/start-crawl/${platform}/${encodeURIComponent(
        url
      )}`
    );

    const tabId = tabs[0].id;

    // 如果是抖音，尝试从内容脚本获取本地存储中的 token
    const tokenPromise = getDouyinTokens(tabId, platform);

    // 收集多域 cookies：优先当前页，其次平台常用域
    const urlsToCollect = [tabs[0].url];
    if (platform === "douyin") {
      urlsToCollect.push("https://www.douyin.com", "https://live.douyin.com");
    }

    const cookiesPromise = Promise.all(
      urlsToCollect.map((u) => chrome.cookies.getAll({ url: u }))
    ).then((results) => {
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
