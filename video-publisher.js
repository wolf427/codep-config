// ==UserScript==
// @name         视频发布助手
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  纯原生DOM+DOM加载完成执行+全量判空，解决TrustedHTML/appendChild所有报错
// @author       You
// @match        *://*.youtube.com/*
// @match        *://channels.weixin.qq.com/*
// @match        *://*.creator.douyin.com/*
// @match        https://*.bilibili.com/platform/upload/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end  // 强制DOM加载完成后执行，核心修复！
// @sandbox      DOM
// ==/UserScript==

(function () {
  "use strict";

  // ########### 核心保障1：等待页面DOM完全加载后再执行所有逻辑 ###########
  if (document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', initScript);
    window.addEventListener('load', initScript);
    return;
  } else {
    initScript();
  }

  // 脚本主入口（所有逻辑包裹在此，确保DOM加载完成）
  function initScript() {
    // 防止重复执行
    if (window.videoPublishHelperInited) return;
    window.videoPublishHelperInited = true;

    // 轻量封装选择器（无innerHTML，带判空）
    const $ = (selector, context = document) => {
      if (!selector || !context) return { length: 0, [0]: null };
      const nodes = context.querySelectorAll(selector);
      return {
        length: nodes.length,
        [0]: nodes[0] || null,
        find: (s) => $(s, nodes[0]),
        is: (s) => s === ":visible" ? (nodes[0] && nodes[0].offsetParent !== null) : false,
        parent: () => nodes[0] ? $(nodes[0].parentNode) : { length: 0 },
        after: (elem) => { if (nodes[0] && elem) nodes[0].after(elem); },
        click: (cb) => { if (nodes[0]) nodes[0].addEventListener('click', cb); },
        val: (v) => { if (!nodes[0]) return ''; return v === undefined ? nodes[0].value : (nodes[0].value = v); },
        attr: (k, v) => { if (!nodes[0]) return ''; return v === undefined ? nodes[0].getAttribute(k) : nodes[0].setAttribute(k, v); }
      };
    };

    // 禁止在iframe中执行
    if (window.self !== window.top) return;

    // 通用工具方法（带判空）
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (elem) => elem && elem.offsetParent !== null;
    const isDomElement = (elem) => elem && elem.nodeType === 1; // 校验是否为有效DOM元素

    // ########### 核心保障2：安全DOM操作封装，所有appendChild/removeChild带判空 ###########
    // 安全添加子元素（避免null调用appendChild）
    const safeAppend = (parent, child) => {
      if (isDomElement(parent) && isDomElement(child)) {
        try {
          parent.appendChild(child);
        } catch (e) {
          console.error("安全添加子元素失败：", e);
        }
      }
    };
    // 安全清空元素（替代innerHTML，带判空）
    const clearElement = (elem) => {
      if (!isDomElement(elem)) return;
      while (elem.firstChild) {
        try {
          elem.removeChild(elem.firstChild);
        } catch (e) {
          break; // 防止删除异常死循环
        }
      }
    };

    // 等待元素可见（原生DOM版，带判空）
    const waitUntil = (cssSelector, shadowRoot) => {
      let timeout = 0;
      return new Promise((resolve, reject) => {
        const check = () => {
          timeout += 100;
          if (timeout > 10000) {
            showToast("等待超时:" + cssSelector);
            reject();
            return;
          }
          const elem = shadowRoot ? shadowRoot.querySelector(cssSelector) : document.querySelector(cssSelector);
          if (elem && isVisible(elem)) resolve(elem); // 直接返回元素，减少重复查询
          else setTimeout(check, 100);
        };
        check();
      });
    };

    // 复制到剪贴板（带判空）
    function copyToClipboard(text) {
      if (!text || typeof text !== 'string') return;
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(`已复制：${text.substring(0, 20)}${text.length>20?'...':''}`))
        .catch((error) => console.error("复制失败", error));
    }

    // 原生DOM创建Toast（安全挂载，带判空）
    function showToast(message) {
      if (!message) return;
      const toast = document.createElement('div');
      toast.textContent = message;
      Object.assign(toast.style, {
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "rgba(0,0,0,0.8)",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: "4px",
        zIndex: "999999",
        pointerEvents: "none",
        fontSize: "14px",
        minWidth: "200px",
        textAlign: "center"
      });
      // 安全挂载到body（核心：先判空body）
      const body = document.body;
      if (isDomElement(body)) {
        safeAppend(body, toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.5s ease';
          setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, 500);
        }, 2000);
      }
    }

    // 接口请求（带异常捕获，保留原逻辑）
    const gmPost = (url, data) => {
      return new Promise((resolve, reject) => {
        if (!url) return reject(new Error("接口URL为空"));
        GM_xmlhttpRequest({
          url: `http://localhost:8888/external${url}`,
          method: "POST",
          data: JSON.stringify(data || {}),
          onload: function (xhr) {
            try {
              const res = JSON.parse(xhr.responseText || '{}');
              res.success ? resolve(res.result) : (alert(res.message || "接口请求失败"), reject(res));
            } catch (e) {
              alert("接口返回格式错误");
              reject(e);
            }
          },
          onerror: (err) => {
            showToast("网络请求失败，请检查本地服务");
            reject(err);
          },
          headers: { "Content-Type": "application/json" },
        });
      });
    };

    // 平台判断（简化逻辑，带判空）
    let platformName = "";
    let currentVideo = null;
    const host = window.location.host || "";
    if (host.includes("youtube")) platformName = "youtube";
    else if (host.includes("channels.weixin.qq")) platformName = "weixin";
    else if (host.includes("douyin")) platformName = "douyin";
    else if (host.includes("bilibili")) platformName = "bilibili";

    // --------------核心业务逻辑（全量判空，安全DOM操作）--------------
    const getTaskList = async () => {
      try {
        showToast("正在加载视频列表...");
        const resultList = await gmPost("/publishVideo/findPublishList", {
          platformName,
          type: "VIDEO",
        });
        renderVideoList(resultList || []);
      } catch (e) {
        showToast("加载视频列表失败");
        console.error("加载列表失败：", e);
      }
    };

    // 原生DOM渲染视频列表（全程安全操作，无任何报错）
    function renderVideoList(videos) {
      // 核心：先判空容器，避免null调用clearElement
      const videoList = document.getElementById('videoList');
      if (!isDomElement(videoList)) {
        showToast("未找到视频列表容器");
        return;
      }
      clearElement(videoList); // 安全清空

      // 无数据提示
      if (!Array.isArray(videos) || videos.length === 0) {
        const emptyTip = document.createElement('div');
        emptyTip.textContent = "暂无视频任务";
        emptyTip.style.padding = "30px 10px";
        emptyTip.style.textAlign = "center";
        emptyTip.style.color = "#999";
        safeAppend(videoList, emptyTip);
        return;
      }

      // 渲染视频项
      videos.forEach(video => {
        if (!video) return;
        // 视频项容器
        const videoItem = document.createElement('div');
        Object.assign(videoItem.style, {
          padding: "10px",
          borderBottom: "1px solid #eee",
          marginBottom: "10px",
          borderRadius: "4px",
          backgroundColor: "#f9f9f9"
        });

        // 标题输入框（带判空）
        if (video.title) {
          const titleInput = document.createElement('input');
          titleInput.readOnly = true;
          titleInput.value = video.title;
          Object.assign(titleInput.style, {
            width: "100%",
            marginBottom: "10px",
            padding: "6px",
            boxSizing: "border-box",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "13px"
          });
          titleInput.addEventListener('click', () => copyToClipboard(titleInput.value));
          safeAppend(videoItem, titleInput);
        }

        // 视频路径输入框（带判空，去重）
        const paths = (video.videoAbsolutePath || "").split(",").filter(p => p && p.trim());
        paths.forEach(path => {
          const pathInput = document.createElement('input');
          pathInput.readOnly = true;
          pathInput.value = path.trim();
          Object.assign(pathInput.style, {
            width: "100%",
            marginBottom: "6px",
            padding: "6px",
            boxSizing: "border-box",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#666"
          });
          pathInput.addEventListener('click', () => copyToClipboard(pathInput.value));
          safeAppend(videoItem, pathInput);
        });

        // 按钮容器
        const btnWrap = document.createElement('div');
        Object.assign(btnWrap.style, {
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
          gap: "6px"
        });

        // 按钮创建封装（带判空）
        const createBtn = (text, clickCb, style = {}) => {
          const btn = document.createElement('button');
          btn.textContent = text;
          Object.assign(btn.style, {
            padding: "4px 8px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor: "#1677ff",
            color: "#fff",
            fontSize: "12px",
            flex: "1",
            textAlign: "center"
          }, style);
          btn.addEventListener('click', clickCb);
          return btn;
        };

        // 功能按钮（带视频判空）
        btnWrap.appendChild(createBtn('上传视频', () => {
          currentVideo = video;
          autoUpload(video);
        }));
        btnWrap.appendChild(createBtn('自动完成', () => {
          currentVideo = video;
          autoUpload(video);
          init();
        }, { backgroundColor: "#52c41a" }));
        btnWrap.appendChild(createBtn('选定当前', () => {
          currentVideo = video;
          init();
          showToast(`已选定：${video.title?.substring(0,15)}...`);
        }, { backgroundColor: "#faad14" }));

        safeAppend(videoItem, btnWrap);
        safeAppend(videoList, videoItem);
      });
    }

    // 原生DOM创建展开/收起按钮（安全挂载到body，带判空）
    const createToggleButton = () => {
      const body = document.body;
      if (!isDomElement(body)) return; // 判空body，避免挂载失败

      const btn = document.createElement('button');
      btn.id = 'toggleButton';
      btn.textContent = '收起告示板';
      Object.assign(btn.style, {
        position: "fixed",
        top: "110px",
        right: "0px",
        width: "300px",
        padding: "10px 0",
        border: "none",
        backgroundColor: "#1677ff",
        color: "#fff",
        cursor: "pointer",
        zIndex: "999999",
        fontSize: "14px",
        fontWeight: "500",
        borderTopLeftRadius: "4px",
        borderBottomLeftRadius: "4px",
        boxShadow: "-2px 0 8px rgba(22,119,255,0.3)"
      });
      btn.addEventListener('click', () => {
        const videoList = document.getElementById('videoList');
        if (!isDomElement(videoList)) return;

        if (videoList.style.display !== 'none') {
          videoList.style.display = 'none';
          btn.textContent = '展开告示板';
          clearElement(videoList);
        } else {
          videoList.style.display = 'block';
          btn.textContent = '收起告示板';
          getTaskList();
        }
      });
      safeAppend(body, btn);
    };

    // 原生DOM创建视频列表容器（安全挂载到body，带判空）
    const createVideoList = () => {
      const body = document.body;
      if (!isDomElement(body)) return; // 判空body，避免挂载失败

      // 避免重复创建
      if (document.getElementById('videoList')) return;

      const list = document.createElement('div');
      list.id = 'videoList';
      Object.assign(list.style, {
        position: "fixed",
        top: "140px",
        right: "0px",
        width: "300px",
        backgroundColor: "#fff",
        overflowY: "scroll",
        maxHeight: "calc(100vh - 150px)",
        zIndex: "99999",
        padding: "10px",
        boxSizing: "border-box",
        borderTopLeftRadius: "4px",
        borderBottomLeftRadius: "4px",
        boxShadow: "-3px 0 15px rgba(0,0,0,0.08)",
        display: "block"
      });
      safeAppend(body, list);
    };

    // 初始化页面控件（先创建容器，再加载列表，顺序保障）
    createVideoList();
    createToggleButton();

    // 元素坐标获取（原生DOM，带判空）
    const getElementCoordinates = (cssSelector) => {
      const element = document.querySelector(cssSelector);
      if (!isDomElement(element)) return { x: 0, y: 0 };
      const rect = element.getBoundingClientRect();
      return {
        x: window.screenX + rect.left + rect.width / 2,
        y: window.screenY + rect.top + rect.height / 2,
      };
    };

    // 鼠标模拟相关方法（带判空，保留原逻辑）
    let offsetY = 116;
    const moveMouse = async (x, y) => {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      console.log(`move mouse: ${x}:${y}`);
      await gmPost("/robot/moveMouseWithJitter", {
        destX: x,
        destY: y + offsetY,
        dpi: 91,
      });
    };
    const moveToElement = async (cssSelector) => {
      const coordinate = getElementCoordinates(cssSelector);
      await moveMouse(coordinate.x, coordinate.y);
      await delay(500);
    };
    const moveMouseRelativeWithJitter = async (x, y, step = 20) => {
      await gmPost("/robot/moveMouseRelativeWithJitter", { destX: x, destY: y, dpi: 91, step });
    };
    const mouseClick = async () => {
      await gmPost("/robot/clickMouse", {});
      showToast("执行鼠标点击");
    };
    const chooseFile = async (path) => {
      if (!path) return showToast("文件路径为空");
      await gmPost("/robot/chooseFile", { text: path });
    };
    const mouseScroll = async (scrollAmount) => await gmPost("/robot/scrollMouse", { scrollAmount });
    const simulateInputByPaste = async (text) => {
      if (!text) return showToast("填充内容为空");
      await gmPost("/robot/paste", { text });
    };

    // 自动上传主方法（带视频判空）
    const autoUpload = (video) => {
      if (!video) {
        showToast("请先选定有效视频");
        return;
      }
      try {
        showToast(`开始${platformName === 'youtube'?'YouTube':platformName === 'weixin'?'微信视频号':platformName === 'douyin'?'抖音':'B站'}上传...`);
        if (platformName === "youtube") autoUpload4Youtube(video);
        else if (platformName === "weixin") autoUpload4Weixin(video);
        else if (platformName === "douyin") autoUpload4Douyin(video);
        else if (platformName === "bilibili") autoUpload4Bilibili(video);
      } catch (e) {
        showToast("自动上传初始化失败");
        console.error("自动上传失败：", e);
      }
    };

    // 各平台初始化（原生DOM，全量判空，安全创建按钮）
    const initWeixin = async () => {
      try {
        showToast("初始化微信视频号适配...");
        const wujieApp = await waitUntil("wujie-app");
        const shadowRoot = wujieApp.shadowRoot;
        if (!shadowRoot) throw new Error("未找到微信视频号shadowRoot");
        await waitUntil(".upload-content", shadowRoot);

        // 微信按钮创建封装（带父元素判空）
        const createWeixinBtn = (parentSelector, text, clickCb) => {
          const parent = shadowRoot.querySelector(parentSelector);
          if (!isDomElement(parent)) return;
          const btn = document.createElement('button');
          btn.textContent = text;
          Object.assign(btn.style, {
            padding: "4px 8px",
            marginLeft: "10px",
            cursor: "pointer",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#1677ff",
            color: "#fff",
            fontSize: "12px",
            verticalAlign: "middle"
          });
          btn.addEventListener('click', clickCb);
          parent.after(btn);
        };

        // 创建填充按钮（带currentVideo判空）
        createWeixinBtn(".post-desc-box", "填充标题", async () => simulateInputAtLeft(currentVideo?.title || ""));
        createWeixinBtn(".short-title-wrap", "填充短标题", async () => simulateInputAtLeft(currentVideo?.pureTitle?.replace(/,/g, "") || ""));
        createWeixinBtn(".post-album-wrap", "选择专辑", simulateChooseAlbum4Weixin);
        showToast("微信视频号适配初始化完成");
      } catch (e) {
        console.error("微信视频号初始化失败：", e);
      }
    };

    const initDouyin = async () => {
      try {
        showToast("初始化抖音创作者后台适配...");
        // 等待发布按钮加载
        if (!document.querySelector('button:contains("发布")')) {
          console.log('抖音发布按钮未加载，延迟初始化');
          await delay(2000);
        }
        await waitUntil("span:contains('作品描述')");

        // 标题填充按钮（带输入框判空）
        const titleInput = document.querySelector("input[placeholder='填写作品标题，为作品获得更多流量']");
        if (isDomElement(titleInput)) {
          const titleParent = titleInput.parentNode;
          if (isDomElement(titleParent)) titleParent.style.position = "relative";
          const titleBtn = document.createElement('button');
          titleBtn.textContent = '填充';
          Object.assign(titleBtn.style, {
            position: "absolute",
            right: "-35px",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "4px 6px",
            cursor: "pointer",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#1677ff",
            color: "#fff",
            fontSize: "12px"
          });
          titleBtn.addEventListener('click', async () => simulateInputAtLeft(currentVideo?.pureTitle || ""));
          safeAppend(titleParent, titleBtn);
        }

        // 简介填充按钮（带容器判空）
        const descBox = document.querySelector("div[data-placeholder='添加作品简介']");
        if (isDomElement(descBox)) {
          const descParent = descBox.parentNode;
          if (isDomElement(descParent)) descParent.style.position = "relative";
          const descBtn = document.createElement('button');
          descBtn.textContent = '填充';
          Object.assign(descBtn.style, {
            position: "absolute",
            right: "-35px",
            top: "60px",
            padding: "4px 6px",
            cursor: "pointer",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#1677ff",
            color: "#fff",
            fontSize: "12px"
          });
          descBtn.addEventListener('click', async () => simulateInputAtLeft(currentVideo?.tagList?.join(" ") || ""));
          safeAppend(descParent, descBtn);
        }
        showToast("抖音创作者后台适配初始化完成");
      } catch (e) {
        console.error("抖音初始化失败：", e);
      }
    };

    const initBilibili = async () => {
      try {
        showToast("初始化B站上传页适配...");
        showToast("B站上传页适配初始化完成");
      } catch (e) {
        console.error("B站初始化失败：", e);
      }
    };

    // 平台初始化主方法（带平台判空）
    const init = async () => {
      if (!platformName) return showToast("未识别当前平台");
      if (platformName === "weixin") await initWeixin();
      if (platformName === "douyin") await initDouyin();
      if (platformName === "bilibili") await initBilibili();
    };

    // 模拟输入和选择专辑（带全量判空）
    const simulateInputAtLeft = async (text) => {
      if (!text || !currentVideo) {
        showToast(!currentVideo ? "无选中视频" : "无填充内容");
        return;
      }
      try {
        await moveMouseRelativeWithJitter(-150, 0, 10);
        await mouseClick();
        await delay(200);
        await simulateInputByPaste(text);
        showToast("内容填充完成");
      } catch (e) {
        showToast("内容填充失败");
        console.error(e);
      }
    };

    const simulateChooseAlbum4Weixin = async () => {
      if (!currentVideo) {
        showToast("无选中视频");
        return;
      }
      try {
        await moveMouseRelativeWithJitter(-150, 0, 10);
        await mouseClick();
        await delay(200);
        await waitUntil('div.option-list-wrap:contains("德云社")');
        await moveMouseRelativeWithJitter(0, 50, 10);
        await mouseClick();
        showToast("专辑选择完成");
      } catch (e) {
        showToast("专辑选择失败");
        console.error(e);
      }
    };

    // 视频URL上传（原生DOM，全量判空，安全操作）
    async function autoUploadVideoByUrl(cssSelector, videoUrl) {
      try {
        if (!cssSelector || !videoUrl) throw new Error("参数为空：选择器/视频URL");
        const inputElem = document.querySelector(cssSelector);
        await doAutoUploadVideoByUrl(inputElem, videoUrl)
      } catch (error) {
        showToast("视频上传失败：" + error.message);
        console.error("自动上传失败：", error.message);
        throw error;
      }
    }

      // 视频URL上传（原生DOM，全量判空，安全操作）
    async function doAutoUploadVideoByUrl(inputElem, videoUrl) {
      try {
        if (!isDomElement(inputElem)) throw new Error("未找到文件上传框");
        if (typeof videoUrl !== "string") throw new Error("视频URL必须为字符串");

        showToast("正在下载视频并填充上传框...");
        console.log(`开始下载视频：${videoUrl}`);
        const response = await fetch(videoUrl, { method: "GET", mode: "cors", cache: "no-cache" });
        if (!response.ok) throw new Error(`视频下载失败：HTTP ${response.status}`);

        const blob = await response.blob();
        let fileName = "auto-upload-" + Date.now() + ".mp4";
        try {
          const pureUrl = videoUrl.split(/[?#]/)[0];
          const encodedFileName = pureUrl.split("/").pop() || "";
          if (encodedFileName) {
            fileName = decodeURIComponent(encodedFileName);
            if (!/\.[a-zA-Z0-9]+$/.test(fileName)) fileName += "." + (blob.type.split("/")[1] || "mp4");
          }
        } catch (e) {
          console.warn("文件名解码失败，使用默认文件名：", e.message);
        }

        // 构造文件并填充（带判空）
        const videoFile = new File([blob], fileName, { type: blob.type || "video/mp4" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(videoFile);
        inputElem.files = dataTransfer.files;

        // 触发上传事件（带判空）
        ["change", "input", "propertychange"].forEach(type => {
          inputElem.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        });
        showToast("视频文件已填充到上传框");
        console.log("文件已填充到上传框，文件名：", fileName);
      } catch (error) {
        showToast("视频上传失败：" + error.message);
        console.error("自动上传失败：", error.message);
        throw error;
      }
    }

    // 各平台自动上传实现（全量判空，安全操作）
    const autoUpload4Youtube = async (video) => {
      try {
//         let uploadDialog = document.querySelector("ytcp-uploads-dialog");
//         if (!uploadDialog || !isVisible(uploadDialog)) {
//           showToast("打开YouTube上传窗口...");
//           await moveToElement("#create-icon");
//           await mouseClick();
//           uploadDialog = await waitUntil("#select-files-button");
//         }
//         await moveToElement("#select-files-button");
//         await mouseClick();
//         await delay(1000);
//         await chooseFile(video.videoAbsolutePath);
        await autoUploadVideoByUrl('div.ytcp-uploads-file-picker input[type="file"]', video.videoUrl);
        currentVideo = video;

        // 分步完成上传（等待+点击，带判空）
        showToast("填写YouTube视频信息...");
        await waitUntil('span:contains("标题（必填）")');
        await moveToElement("#next-button");
        await mouseClick();

        await waitUntil('h1:contains("视频元素")');
        await moveToElement("#next-button");
        await mouseClick();

        await waitUntil('h1:contains("检查")');
        await moveToElement("#next-button");
        await mouseClick();

        await waitUntil('h1:contains("公开范围")');
        await moveToElement("#done-button");
        await mouseClick();

        showToast("YouTube上传流程已触发，等待完成");
      } catch (e) {
        console.error("YouTube上传失败：", e);
        showToast("YouTube上传失败");
      }
    };

    const autoUpload4Weixin = async (video) => {
//       try {
//         const uploadTip = document.querySelector("div.upload-tip");
//         if (isDomElement(uploadTip)) {
//           uploadTip.click();
//           showToast("打开微信视频号上传窗口...");
//         } else {
//           showToast("未找到上传入口，手动点击后重试");
//           return;
//         }
//         await delay(1000);
//         await chooseFile(video.videoAbsolutePath);
//         currentVideo = video;
//         showToast("微信视频号上传已触发，等待文件解析");
//       } catch (e) {
//         console.error("微信视频号上传失败：", e);
//         showToast("微信视频号上传失败");
//       }
        const wujieApp = await waitUntil("wujie-app");
        const shadowRoot = wujieApp.shadowRoot;
        const inputElem = shadowRoot.querySelector('div.ant-upload input[type="file"]');
        await doAutoUploadVideoByUrl(inputElem, video.videoUrl);
        currentVideo = video;
    };

    const autoUpload4Douyin = async (video) => {
      try {
        await autoUploadVideoByUrl('div.semi-tabs-pane-motion-overlay input[type="file"]', video.videoUrl);
        currentVideo = video;
        await waitUntil("div[class^='publish-mention-wrapper']");
        showToast("抖音视频已填充，可继续编辑发布");
      } catch (e) {
        console.error("抖音上传失败：", e);
      }
    };

    const autoUpload4Bilibili = async (video) => {
      try {
        await autoUploadVideoByUrl('div.bcc-upload input[type="file"]', video.videoUrl);
        currentVideo = video;
        showToast("B站上传文件已填充，等待解析完成");
      } catch (e) {
        console.error("B站上传失败：", e);
        showToast("B站上传失败");
      }
    };

    // 初始化加载视频列表（最终执行）
    getTaskList();
  }
})();
