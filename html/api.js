(function (global) {
  "use strict";

  const CANVAS_W = 300, CANVAS_H = 226;
  const AVATAR_SIZE = 80;
  const AVATAR_POS_X = Math.floor((CANVAS_W - AVATAR_SIZE) / 2);
  const AVATAR_POS_Y = Math.floor((CANVAS_H - AVATAR_SIZE) / 2);
  const PNG_SCALE = 0.8;

  const HOLD_AVATAR_MS     = 1000;
  const OVERLAY_TRIGGER_MS = 3000;
  const TAIL_MS            = 3000;
  const STEP_MS            = 100;

  const BG_COLOR = "#ffffff";
  const DATA_DIR = "./data";

  const tick = () => new Promise(r => setTimeout(r, 0));

  function newCanvas(w, h, willReadFrequently = false) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d", willReadFrequently ? { willReadFrequently: true } : undefined);
    return c;
  }

  function makeCircle(src, size) {
    const c = newCanvas(size, size);
    const ctx = c.getContext("2d");
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(src, 0, 0, size, size);
    ctx.restore();
    return c;
  }

  const HIST_SIZE = 32768;
  const HIST = new Uint32Array(HIST_SIZE);

  function canvasToBuckets(canvas) {
    const data = canvas.getContext("2d").getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    const n = CANVAS_W * CANVAS_H;
    const out = new Uint16Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const v = ((data[p] >> 3) << 10) | ((data[p + 1] >> 3) << 5) | (data[p + 2] >> 3);
      out[i] = v;
      HIST[v]++;
    }
    return out;
  }

  function buildPalette(hist, maxColors) {
    const items = [];
    for (let v = 0; v < HIST_SIZE; v++) if (hist[v]) items.push(v);
    if (!items.length) return [[255, 255, 255]];
    if (items.length <= maxColors) {
      return items.map(v => [
        ((v >> 10) & 31) << 3, ((v >> 5) & 31) << 3, (v & 31) << 3
      ]);
    }

    let boxes = [items];
    while (boxes.length < maxColors) {
      let bestIdx = -1, bestScore = -1, bestAxis = 0;
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (box.length < 2) continue;
        let rmin = 31, rmax = 0, gmin = 31, gmax = 0, bmin = 31, bmax = 0, cnt = 0;
        for (let j = 0; j < box.length; j++) {
          const v = box[j];
          const r = (v >> 10) & 31, g = (v >> 5) & 31, b = v & 31;
          if (r < rmin) rmin = r; if (r > rmax) rmax = r;
          if (g < gmin) gmin = g; if (g > gmax) gmax = g;
          if (b < bmin) bmin = b; if (b > bmax) bmax = b;
          cnt += hist[v];
        }
        const dr = rmax - rmin, dg = gmax - gmin, db = bmax - bmin;
        const maxd = Math.max(dr, dg, db);
        if (maxd === 0) continue;
        const score = maxd * Math.log(cnt + 1);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
          bestAxis = (maxd === dr) ? 0 : (maxd === dg ? 1 : 2);
        }
      }
      if (bestIdx < 0) break;
      const box = boxes[bestIdx];
      const shift = bestAxis === 0 ? 10 : (bestAxis === 1 ? 5 : 0);
      box.sort((a, b) => (((a >> shift) & 31) - ((b >> shift) & 31)));
      const mid = box.length >> 1;
      boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
    }

    return boxes.map(box => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < box.length; i++) {
        const v = box[i], c = hist[v];
        r += ((((v >> 10) & 31) << 3) | 4) * c;
        g += ((((v >> 5) & 31) << 3) | 4) * c;
        b += (((v & 31) << 3) | 4) * c;
        n += c;
      }
      if (!n) return [0, 0, 0];
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
  }

  function buildLUT(palette) {
    const P = palette.length;
    const pr = new Int32Array(P), pg = new Int32Array(P), pb = new Int32Array(P);
    for (let i = 0; i < P; i++) {
      pr[i] = palette[i][0]; pg[i] = palette[i][1]; pb[i] = palette[i][2];
    }
    const lut = new Uint8Array(HIST_SIZE);
    for (let v = 0; v < HIST_SIZE; v++) {
      const r = (((v >> 10) & 31) << 3) | 4;
      const g = (((v >> 5) & 31) << 3) | 4;
      const b = ((v & 31) << 3) | 4;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < P; i++) {
        const dr = r - pr[i], dg = g - pg[i], db = b - pb[i];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
      lut[v] = best;
    }
    return lut;
  }

  class ByteWriter {
    constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; }
    _ensure(n) {
      if (this.len + n <= this.buf.length) return;
      let cap = this.buf.length * 2;
      while (cap < this.len + n) cap *= 2;
      const nb = new Uint8Array(cap);
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
    }
    byte(b) { this._ensure(1); this.buf[this.len++] = b & 0xff; }
    bytes(a) { this._ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
    short(v) {
      this._ensure(2);
      this.buf[this.len++] = v & 0xff;
      this.buf[this.len++] = (v >> 8) & 0xff;
    }
    result() { return this.buf.subarray(0, this.len); }
  }

  function lzwEncode(minCodeSize, pixels) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    const out = [];
    let cur = 0, nbits = 0;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    let dict = new Map();

    function emit(code) {
      cur |= code << nbits;
      nbits += codeSize;
      while (nbits >= 8) {
        out.push(cur & 0xff);
        cur >>>= 8;
        nbits -= 8;
      }
    }

    emit(clearCode);

    if (!pixels.length) {
      emit(eoiCode);
      if (nbits > 0) out.push(cur & 0xff);
      return new Uint8Array(out);
    }

    let prefix = pixels[0];

    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (prefix << 8) | k;
      const found = dict.get(key);

      if (found !== undefined) {
        prefix = found;
      } else {
        emit(prefix);

        if (nextCode < 4096) {
          dict.set(key, nextCode);
          if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
          nextCode++;
        } else {
          emit(clearCode);
          dict = new Map();
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }

    emit(prefix);
    emit(eoiCode);
    if (nbits > 0) out.push(cur & 0xff);
    return new Uint8Array(out);
  }

  function encodeGif(indexFrames, durations, palette, width, height) {
    const w = new ByteWriter();
    const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
    const gctSize = 1 << bits;

    w.bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    w.short(width); w.short(height);
    w.byte(0x80 | ((bits - 1) << 4) | (bits - 1));
    w.byte(0x00);
    w.byte(0x00);

    for (let i = 0; i < gctSize; i++) {
      const c = palette[i] || [0, 0, 0];
      w.byte(c[0]); w.byte(c[1]); w.byte(c[2]);
    }

    w.bytes([0x21, 0xFF, 0x0B]);
    for (const ch of "NETSCAPE2.0") w.byte(ch.charCodeAt(0));
    w.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

    const minCodeSize = Math.max(2, bits);

    for (let f = 0; f < indexFrames.length; f++) {
      w.bytes([0x21, 0xF9, 0x04]);
      w.byte(0x04);
      w.short(Math.max(1, Math.round((durations[f] || 80) / 10)));
      w.byte(0x00);
      w.byte(0x00);

      w.byte(0x2C);
      w.short(0); w.short(0);
      w.short(width); w.short(height);
      w.byte(0x00);

      w.byte(minCodeSize);
      const data = lzwEncode(minCodeSize, indexFrames[f]);
      for (let i = 0; i < data.length; i += 255) {
        const end = Math.min(i + 255, data.length);
        w.byte(end - i);
        w.bytes(data.subarray(i, end));
      }
      w.byte(0x00);
    }

    w.byte(0x3B);
    return w.result();
  }

  async function loadBitmap(url) {
    const resp = await fetch(url, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`加载失败 ${url} (${resp.status})`);
    const blob = await resp.blob();
    return createImageBitmap(blob);
  }

  async function decodeGifBuffer(buf) {
    if (typeof ImageDecoder !== "undefined") {
      try {
        const dec = new ImageDecoder({ data: buf, type: "image/gif" });

        await dec.tracks.ready;
        await dec.completed;

        const track = dec.tracks.selectedTrack;
        if (!track || !track.frameCount) throw new Error("ImageDecoder 无有效轨道");

        const count = track.frameCount;
        const frames = [], durations = [];

        for (let i = 0; i < count; i++) {
          const { image } = await dec.decode({ frameIndex: i });
          const c = newCanvas(image.displayWidth, image.displayHeight);
          c.getContext("2d").drawImage(image, 0, 0);
          const dUs = image.duration;
          durations.push(dUs ? Math.max(1, Math.round(dUs / 1000)) : 80);
          image.close();
          frames.push(c);
        }
        if (frames.length) return { frames, durations };
      } catch (e) {
        console.warn("ImageDecoder 解码失败，回退首帧：", e);
      }
    }

    const bmp = await createImageBitmap(new Blob([buf], { type: "image/gif" }));
    const c = newCanvas(bmp.width, bmp.height);
    c.getContext("2d").drawImage(bmp, 0, 0);
    return { frames: [c], durations: [80] };
  }

  async function loadGif(url) {
    const resp = await fetch(url, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`加载失败 ${url} (${resp.status})`);
    const buf = await resp.arrayBuffer();
    return decodeGifBuffer(buf);
  }

  async function loadDefaultAssets(onLog = () => {}) {
    const out = { base: null, overlay: null, gifFrames: [], gifDurations: [] };

    try { out.base = await loadBitmap(`${DATA_DIR}/2.png`); }
    catch (e) { onLog("默认底图 data/2.png 加载失败"); }

    try { out.overlay = await loadBitmap(`${DATA_DIR}/1.png`); }
    catch (e) { onLog("默认叠加图 data/1.png 加载失败"); }

    try {
      const g = await loadGif(`${DATA_DIR}/0.gif`);
      out.gifFrames = g.frames;
      out.gifDurations = g.durations;
    } catch (e) { onLog("默认动画 data/0.gif 加载失败"); }

    return out;
  }

  async function buildGif(opts) {
    const {
      avatarBitmap = null,
      baseBitmap = null,
      overlayBitmap = null,
      gifFrames = [],
      gifDurations = [],
      onProgress = () => {},
    } = opts || {};

    HIST.fill(0);

    const avatarCanvas = avatarBitmap
      ? makeCircle(avatarBitmap, AVATAR_SIZE)
      : newCanvas(AVATAR_SIZE, AVATAR_SIZE);

    const baseAvatar = newCanvas(CANVAS_W, CANVAS_H, true);
    {
      const ctx = baseAvatar.getContext("2d");
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (baseBitmap) ctx.drawImage(baseBitmap, 0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(avatarCanvas, AVATAR_POS_X, AVATAR_POS_Y);
    }

    const baseWithPng = newCanvas(CANVAS_W, CANVAS_H, true);
    {
      const ctx = baseWithPng.getContext("2d");
      ctx.drawImage(baseAvatar, 0, 0);
      if (overlayBitmap) {
        const pw = Math.round(overlayBitmap.width * PNG_SCALE);
        const ph = Math.round(overlayBitmap.height * PNG_SCALE);
        ctx.drawImage(
          overlayBitmap,
          Math.floor((CANVAS_W - pw) / 2),
          Math.floor((CANVAS_H - ph) / 2),
          pw, ph
        );
      }
    }

    const buckets = [];
    const durations = [];

    for (let t = 0; t < HOLD_AVATAR_MS; t += STEP_MS) {
      buckets.push(canvasToBuckets(baseAvatar));
      durations.push(Math.min(STEP_MS, HOLD_AVATAR_MS - t));
    }

    let gifTime = 0;
    for (let i = 0; i < gifFrames.length; i++) {
      const d = gifDurations[i] || 80;
      const src = gifTime >= OVERLAY_TRIGGER_MS ? baseWithPng : baseAvatar;
      const cur = newCanvas(CANVAS_W, CANVAS_H, true);
      const ctx = cur.getContext("2d");
      ctx.drawImage(src, 0, 0);
      ctx.drawImage(gifFrames[i], 0, 0);
      buckets.push(canvasToBuckets(cur));
      durations.push(d);
      gifTime += d;

      if (i % 5 === 0) {
        onProgress({ phase: "compose", current: i + 1, total: gifFrames.length });
        await tick();
      }
    }

    for (let t = 0; t < TAIL_MS; t += STEP_MS) {
      buckets.push(canvasToBuckets(baseWithPng));
      durations.push(Math.min(STEP_MS, TAIL_MS - t));
    }

    onProgress({ phase: "palette", total: buckets.length });
    await tick();
    const palette = buildPalette(HIST, 256);
    const lut = buildLUT(palette);

    onProgress({ phase: "index", total: buckets.length });
    await tick();
    const indexFrames = new Array(buckets.length);
    for (let f = 0; f < buckets.length; f++) {
      const b = buckets[f];
      const a = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) a[i] = lut[b[i]];
      indexFrames[f] = a;
    }
    buckets.length = 0;

    onProgress({ phase: "encode", total: indexFrames.length });
    await tick();
    const bytes = encodeGif(indexFrames, durations, palette, CANVAS_W, CANVAS_H);
    return new Blob([bytes], { type: "image/gif" });
  }

  global.SnowgraveAPI = {
    CANVAS_W, CANVAS_H, AVATAR_SIZE,
    HOLD_AVATAR_MS, OVERLAY_TRIGGER_MS, TAIL_MS, STEP_MS, PNG_SCALE, DATA_DIR,

    loadBitmap,
    loadGif,
    decodeGifBuffer,
    loadDefaultAssets,
    buildGif,

    _internal: { makeCircle, canvasToBuckets, buildPalette, buildLUT, encodeGif, lzwEncode },
  };
})(window);