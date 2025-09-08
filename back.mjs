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
    const allowedDomains = ["bilibili", "youtube"];

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

    // 使用页面URL获取cookies
    chrome.cookies.getAll({ url: tabs[0].url }).then((cookies) => {
      // 将 cookie 转换为键值对格式
      const cookiePairs = cookies.map((cookie) => {
        return {
          name: cookie.name,
          value: decodeURIComponent(cookie.value),
        };
      });

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

      fetch(apiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cookies: cookiePairs,
        }),
        mode: "cors",
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Network response was not ok");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "请求失败",
            message: "无法连接到本地服务器，请确保服务器已启动",
          });
        });
    });
  });
}
