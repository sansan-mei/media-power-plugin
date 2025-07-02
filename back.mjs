const requestHapi = "request-hapi";
chrome.runtime.onInstalled.addListener(() => {
  // 请求Hapi服务,仅在bilibili.com下有效
  chrome.contextMenus.create({
    id: requestHapi,
    title: "请求Hapi服务",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === requestHapi) {
    requestHapiHandle();
  }
});

function requestHapiHandle() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    console.log("当前页面URL:", url);
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

    chrome.cookies.getAll({ url }).then((cookies) => {
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
