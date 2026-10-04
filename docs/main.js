(function () {
  "use strict";

  console.log("[main] 脚本已加载");

  const API = window.SnowgraveAPI;
  if (!API) {
    console.error("[main] SnowgraveAPI 未找到，api.js 可能没加载成功");
    alert("api.js 未加载，检查 html 里 <script src='./api.js'> 路径");
    return;
  }
  console.log("[main] SnowgraveAPI 可用");

  const $ = id => document.getElementById(id);

  const fileInput = $("file-input");
  const btnGen    = $("gen");
  const outImg    = $("out");
  const emptyTip  = $("empty-tip");
  const btnDl     = $("dl");

  console.log("[main] DOM:", {
    fileInput: !!fileInput,
    btnGen: !!btnGen,
    outImg: !!outImg,
    emptyTip: !!emptyTip,
    btnDl: !!btnDl,
  });

  if (!btnGen) {
    console.error("[main] 找不到生成按钮 #gen");
    return;
  }

  let lastUrl = null;
  let defaults = null;

  function setStatus(msg) {
    console.log("[status]", msg);
    const el = $("status");
    if (el) el.textContent = msg || "";
  }

  async function ensureDefaults() {
    if (defaults) return defaults;
    setStatus("加载素材…");
    defaults = await API.loadDefaultAssets(msg => console.warn("[素材]", msg));
    console.log("[main] 默认素材:", {
      base: !!defaults.base,
      overlay: !!defaults.overlay,
      gifFrames: defaults.gifFrames.length,
      gifDurations: defaults.gifDurations.length,
    });
    return defaults;
  }

  async function resolveAvatar() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) throw new Error("请先选择一张头像图片");
    setStatus("读取图片…");
    const bmp = await API.loadBitmap(URL.createObjectURL(file));
    console.log("[main] 头像已读:", bmp.width, "x", bmp.height);
    return bmp;
  }

  async function generate() {
    console.log("[main] === generate 触发 ===");
    btnGen.disabled = true;
    btnDl.style.display = "none";
    outImg.style.display = "none";
    emptyTip.style.display = "block";
    emptyTip.textContent = "处理中…";
    setStatus("开始…");

    try {
      const avatar = await resolveAvatar();
      console.log("[main] 头像 OK");
      const d = await ensureDefaults();
      console.log("[main] 素材 OK");

      setStatus("合成中…");
      await new Promise(r => setTimeout(r, 0));

      const blob = await API.buildGif({
        avatarBitmap: avatar,
        baseBitmap:   d.base,
        overlayBitmap:d.overlay,
        gifFrames:    d.gifFrames,
        gifDurations: d.gifDurations,
        onProgress: p => {
          console.log("[progress]", p);
          const map = {
            compose: "合成动画帧…",
            palette: "量化调色板…",
            index:   "生成索引帧…",
            encode:  "编码 GIF…",
          };
          setStatus(map[p.phase] || "处理中…");
        },
      });

      console.log("[main] GIF 生成完成:", blob.size, "bytes");

      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);

      outImg.src = lastUrl;
      outImg.style.display = "block";
      emptyTip.style.display = "none";

      btnDl.href = lastUrl;
      btnDl.style.display = "block";

      setStatus(`完成 · ${(blob.size / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.error("[main] 生成失败:", e);
      emptyTip.textContent = "生成失败：" + (e.message || e);
      setStatus("错误 " + (e && e.message ? e.message : e));
    } finally {
      btnGen.disabled = false;
    }
  }

  btnGen.addEventListener("click", generate);
  console.log("[main] 按钮已绑定");

  setStatus("选择图片后点击「生成 GIF」");
})();
