// ==UserScript==
// @name         视频发布助手
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  try to take over the world!
// @author       You
// @match        *://*.youtube.com/*
// @match        *://channels.weixin.qq.com/*
// @match        *://*.creator.douyin.com/*
// @match        https://*.bilibili.com/platform/upload/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant GM_xmlhttpRequest
// @require      https://cdn.bootcss.com/jquery/3.4.1/jquery.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  "use strict";
  // 判断当前脚本是否在 iframe 中执行
  if (window.self !== window.top) {
    // 在 iframe 中执行的逻辑
    return;
  }
  var jquery = $.noConflict(true);

  const delay = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  const waitUntil = (cssSelector, shadowRoot) => {
    let timeout = 0;
    return new Promise(function (resolve, reject) {
      var checkVisibility = function () {
        timeout += 100;
        if (timeout > 10000) {
          showToast("等待超时:" + cssSelector);
          reject();
        }
        if (!shadowRoot && jquery(cssSelector).is(":visible")) {
          resolve();
        } else if (
          !!shadowRoot &&
          jquery(shadowRoot).find(cssSelector).is(":visible")
        ) {
          resolve();
        } else {
          setTimeout(checkVisibility, 100); // check every 100ms
        }
      };
      checkVisibility();
    });
  };

  // 复制到剪贴板并显示弹窗
  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(function () {
        // 复制成功
        showToast(`已复制：${text}`);
      })
      .catch(function (error) {
        // 复制失败
        console.error("复制失败", error);
      });
  }

  // 显示弹窗
  function showToast(message) {
    var $toast = jquery("<div>")
      .text(message)
      .css({
        position: "fixed",
        top: "0",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#000",
        color: "#fff",
        padding: "10px",
        borderRadius: "5px",
        zIndex: "10000",
      })
      .appendTo("body");

    setTimeout(function () {
      $toast.fadeOut(500, function () {
        $toast.remove();
      });
    }, 2000);
  }

  const gmPost = (url, data) => {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: `http://localhost:8888/external/${url}`,
        method: "POST",
        dataType: "json",
        data: JSON.stringify(data),
        onload: function (xhr) {
          const res = JSON.parse(xhr.responseText);

          if (res.success) {
            resolve(res.result);
          } else {
            alert(res.message);
            console.error(res);
            reject(res);
          }
        },
        onerror: function (res) {
          reject(res);
        },
        headers: { "Content-Type": "application/json" },
      });
    });
  };

  // --------------以上部分为通用方法

  let platformName = "";
  let currentVideo = null;
  if (window.location.host.indexOf("youtube") > -1) {
    platformName = "youtube";
  } else if (window.location.host.indexOf("channels.weixin.qq") > -1) {
    platformName = "weixin";
  } else if (window.location.host.indexOf("douyin") > -1) {
    platformName = "douyin";
  } else if (window.location.host.indexOf("bilibili") > -1) {
    platformName = "bilibili";
  }

  const getTaskList = async () => {
    const resultList = await gmPost("/publishVideo/findPublishList", {
      platformName,
      type: "VIDEO",
    });
    renderVideoList(resultList);
  };

  function renderVideoList(videos) {
    var $videoList = jquery("#videoList");
    jquery.each(videos, function (i, video) {
      var $videoItem = jquery("<div>")
        .css({
          padding: "10px",
        })
        .appendTo($videoList);

      var $titleInput = jquery("<input>")
        .attr("readonly", true)
        .val(video.title)
        .css({
          width: "100%",
          marginBottom: "10px",
        })
        .click(function () {
          copyToClipboard($titleInput.val());
        })
        .appendTo($videoItem);

      video.videoAbsolutePath.split(",").forEach((path) => {
        if (!path || path.length == 0) {
          return;
        }
        jquery("<input>")
          .attr("readonly", true)
          .val(path)
          .css({
            width: "100%",
          })
          .click(function () {
            copyToClipboard(path);
          })
          .appendTo($videoItem);
      });

      var $div = jquery("<div/>", {
        css: {
          display: "flex",
          justifyContent: "space-between",

          marginTop: "8px",
          marginBottom: "10px",
        },
      });

      var $button1 = jquery("<button/>", {
        text: "上传视频",
        click: function () {
          currentVideo = video;
          autoUpload(video);
        },
      });

      var $button2 = jquery("<button/>", {
        text: "自动完成",
        click: function () {
          currentVideo = video;
          autoUpload(video);
          init();
        },
      });

      var $button3 = jquery("<button/>", {
        text: "选定当前",
        click: function () {
          currentVideo = video;
          init();
        },
      });

      $div.append($button1, $button2, $button3);
      $div.appendTo($videoItem);
    });
  }

  // 声明展开/收起按钮
  var $toggleButton = jquery("<button>")
    .attr("id", "toggleButton")
    .css({
      position: "fixed",
      top: "110px",
      right: "0px",
      width: "300px",
      zIndex: "99999",
    })
    .text("收起告示板")
    .appendTo("body")
    .click(function () {
      var $videoList = jquery("#videoList");
      if ($videoList.is(":visible")) {
        $videoList.hide();
        $toggleButton.text("展开告示板");
        // 清除告示板内容
        $videoList.empty();
      } else {
        // 从后台加载新的列表
        getTaskList();
        $videoList.show();
        $toggleButton.text("收起告示板");
      }
    });

  // 初始化告示板
  var $videoList = jquery("<div>")
    .attr("id", "videoList")
    .css({
      position: "fixed",
      top: "140px",
      right: "0px",
      width: "300px",
      backgroundColor: "#f0f0f0",
      overflowY: "scroll",
      maxHeight: "calc(100vh - 30px)",
      zIndex: "9999",
    })
    .appendTo("body");

  const getElementCoordinates = (elementCssSelector) => {
    var element = jquery(elementCssSelector);
    if (element.length == 0) {
      return { x: 0, y: 0 };
    }

    var rect = element[0].getBoundingClientRect();
    return {
      x: window.screenX + rect.left + rect.width / 2,
      y: window.screenY + rect.top + rect.height / 2,
    };
  };

  let offsetY = 116;

  const moveMouse = async (x, y) => {
    console.log(`move monuse: ${x}:${y}`);
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
    await gmPost("/robot/moveMouseRelativeWithJitter", {
      destX: x,
      destY: y,
      dpi: 91,
      step,
    });
  };

  const mouseClick = async () => {
    await gmPost("/robot/clickMouse", {});
    showToast("点击鼠标");
  };

  const autoUpload = (video) => {
    if (platformName === "youtube") {
      autoUpload4Youtube(video);
    } else if (platformName === "weixin") {
      autoUpload4Weixin(video);
    } else if (platformName === "douyin") {
      autoUpload4Douyin(video);
    } else if (platformName === "bilibili") {
      autoUpload4Bilibili(video);
    }
  };

  const chooseFile = async (path) => {
    await gmPost("/robot/chooseFile", { text: path });
  };

  const mouseScroll = async (scrollAmount) => {
    await gmPost("/robot/scrollMouse", { scrollAmount });
  };

  const simulateInputByPaste = async (text) => {
    await gmPost("/robot/paste", { text });
  };

  getTaskList();
  // 上面的部分是通用方法

  const initWeixin = async () => {
    await waitUntil("wujie-app");
    const shadowRoot = jquery("wujie-app")[0].shadowRoot;
    await waitUntil(".upload-content", shadowRoot);
    var $label1 = jquery(shadowRoot).find(".post-desc-box").parent();
    var $button1 = jquery("<button/>", {
      id: "weixin-simulate-button-button",
      text: "填充",
      css: {
        paddingTop: "30px",
      },
      click: async function () {
        simulateInputAtLeft(currentVideo.title);
      },
    });
    $label1.after($button1);

    var $label2 = jquery(shadowRoot).find(".short-title-wrap");
    var $button2 = jquery("<button/>", {
      text: "填充",
      css: {
        paddingTop: "30px",
      },
      click: async function () {
        simulateInputAtLeft(currentVideo.pureTitle.replace(/,/g, ""));
      },
    });
    $label2.after($button2);

    var $label3 = jquery(shadowRoot).find(".post-album-wrap").parent();
    var $button3 = jquery("<button/>", {
      text: "填充",
      css: {
        paddingTop: "30px",
      },
      click: async function () {
        simulateChooseAlbum4Weixin();
      },
    });
    $label3.after($button3);
  };

  const initBilibili = async () => {};

  const initDouyin = async () => {
    if (jquery('button:contains("发布")').length == 0) {
      console.log('发布按钮未加载 button:contains("发布")');
      return;
    }
    await waitUntil("span:contains('作品描述')");
    var $label1 = jquery(
      "input[placeholder='填写作品标题，为作品获得更多流量']"
    ).parent();
    var $button1 = jquery("<button/>", {
      text: "填充",
      css: {
        position: "absolute",
        right: "-30px",
        top: 0,
      },
      click: async function () {
        simulateInputAtLeft(currentVideo.pureTitle);
      },
    });
    $label1.after($button1);

    var $label2 = jquery("div[data-placeholder='添加作品简介']");
    var $button2 = jquery("<button/>", {
      text: "填充",
      css: {
        position: "absolute",
        right: "-30px",
        top: "48px",
      },
      click: async function () {
        simulateInputAtLeft(currentVideo.tagList.join(" "));
      },
    });
    $label2.after($button2);
  };

  const init = async () => {
    if (platformName === "weixin") {
      initWeixin();
    }
    if (platformName === "douyin") {
      initDouyin();
    }
    if (platformName === "bilibili") {
      initBilibili();
    }
  };

  const simulateInputAtLeft = async (text) => {
    if (text == null) {
      showToast(`无选中视频`);
      return;
    }
    await moveMouseRelativeWithJitter(-150, 0, 10);
    mouseClick();
    await delay(200);
    await simulateInputByPaste(text);
  };

  const simulateChooseAlbum4Weixin = async () => {
    if (currentVideo == null) {
      showToast(`无选中视频`);
      return;
    }
    await moveMouseRelativeWithJitter(-150, 0, 10);
    mouseClick();
    await delay(200);
    await waitUntil('div.option-list-wrap:contains("德云社")');
    await moveMouseRelativeWithJitter(0, 50, 10);
    mouseClick();
  };

  async function autoUploadVideoByUrl(cssSelector, videoUrl) {
    try {
        // 1. 处理输入框参数（兼容DOM和jQuery对象）
        const queryResult = jquery(cssSelector);
        if (queryResult.length === 0) {
            throw new Error("未找到输入框");
        }
        const inputElem = queryResult[0];
        
        if (!videoUrl || typeof videoUrl !== "string") {
            throw new Error("第二个参数必须是有效的视频URL");
        }

        console.log(`开始下载视频：${videoUrl}`);

        // 2. 下载视频（处理跨域：本地代理URL无跨域问题，远程URL需支持CORS）
        const response = await fetch(videoUrl, {
            method: "GET",
            mode: "cors",
            cache: "no-cache",
        });

        if (!response.ok) {
            throw new Error(
                `视频下载失败：HTTP ${response.status} ${response.statusText}`
            );
        }

        // 3. 转换为Blob对象（模拟本地文件）
        const blob = await response.blob();

        // 🔥 修复核心：解码URL中的中文文件名（处理编码+参数/锚点）
        let fileName = "auto-upload-" + Date.now() + ".mp4"; // 默认文件名
        try {
            // 步骤1：移除URL中的查询参数（?xxx）和锚点（#xxx）
            const pureUrl = videoUrl.split(/[?#]/)[0]; // 分割后取第一个部分（纯路径）
            // 步骤2：提取最后一个/后的文件名（包含编码的中文）
            const encodedFileName = pureUrl.split("/").pop() || "";
            // 步骤3：URL解码还原中文（关键！）
            if (encodedFileName) {
                fileName = decodeURIComponent(encodedFileName);
                // 可选：如果解码后没有文件后缀，补充默认后缀（防止无后缀文件）
                const hasExtension = /\.[a-zA-Z0-9]+$/.test(fileName);
                if (!hasExtension) {
                    fileName += "." + (blob.type.split("/")[1] || "mp4");
                }
            }
        } catch (e) {
            console.warn("文件名解码失败，使用默认文件名：", e.message);
        }

        // 构造File对象（使用解码后的中文文件名）
        const videoFile = new File([blob], fileName, {
            type: blob.type || "video/mp4",
        });

        console.log(
            `视频下载完成，文件名：${fileName}（原始编码：${encodeURIComponent(fileName)}），大小：${(
                blob.size / 1024 / 1024
            ).toFixed(2)}MB`
        );

        // 4. 填充文件到上传框（核心步骤：绕过浏览器安全限制）
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(videoFile);
        inputElem.files = dataTransfer.files;

        // 5. 触发上传事件（模拟用户手动选择文件）
        const triggerEvents = [
            new Event("change", { bubbles: true, cancelable: true }),
            new Event("input", { bubbles: true, cancelable: true }),
            new Event("propertychange", { bubbles: true }),
        ];
        triggerEvents.forEach((event) => inputElem.dispatchEvent(event));

        console.log("文件已填充到上传框，已触发上传事件");
    } catch (error) {
        console.error("自动上传失败：", error.message);
        throw error;
    }
}

  const autoUpload4Youtube = async (video) => {
    if (!jquery("ytcp-uploads-dialog").is(":visible")) {
      // 如果上传窗口还未打开，则先打开上传窗口
      await moveToElement("#create-icon");
      mouseClick();
      await waitUntil("#select-files-button");
    }

    await moveToElement("#select-files-button");
    mouseClick();
    await delay(1000);
    await chooseFile(video.videoAbsolutePath);

    // 第一步：填标题
    await waitUntil('span:contains("标题（必填）")');
    await moveToElement("#next-button");
    mouseClick();
    // 第二步：视频元素，直接下一步
    await waitUntil('h1:contains("视频元素")');
    await moveToElement("#next-button");
    mouseClick();
    // 第三步：版权检查，直接下一步
    await waitUntil('h1:contains("检查")');
    await moveToElement("#next-button");
    mouseClick();
    // 第四步：版权检查，直接下一步
    await waitUntil('h1:contains("公开范围")');
    await moveToElement("#done-button");
    mouseClick();
  };

  const autoUpload4Weixin = async (video) => {
    //         await moveToElement('div.upload-tip')
    //         mouseClick()
    //         await delay(1000)
    //         await chooseFile(video.videoAbsolutePath)

    //         await moveToElement('div.post-album-wrap')
    //         mouseClick()
    //         await waitUntil('div.option-list-wrap:contains("德云社")')
    //         await moveToElement('div.option-list-wrap:contains("德云社")')
    //         mouseClick()
    //         await delay(1000)
    //         await mouseScroll(20)
    //         await moveToElement('span:contains("视频为原创")')
    //         mouseClick()

    //         await moveToElement('div.post-short-title-wrap')
    //         await simulateInputByPaste(video.pureTitle)

    jquery("div.upload-tip").click();
    await delay(1000);
    await chooseFile(video.videoAbsolutePath);

    currentVideo = video;
  };

  const autoUpload4Douyin = async (video) => {
    // jquery("div.container-drag-icon").click();
    // await delay(1000);
    // await chooseFile(video.videoAbsolutePath);

    autoUploadVideoByUrl(jquery('div.semi-tabs-pane-motion-overlay input[type="file"]'), video.videoUrl)

    currentVideo = video;

    await waitUntil("div[class^='publish-mention-wrapper']");
  };

  const autoUpload4Bilibili = async (video) => {
    autoUploadVideoByUrl(jquery('div.bcc-upload input[type="file"]'), video.videoUrl)

    // jquery('div.upload-area').click()
    // await delay(1000)
    // await chooseFile(video.videoAbsolutePath)

    currentVideo = video;
  };
})();
