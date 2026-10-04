import io
import os
import aiohttp
import uvicorn
from fastapi import FastAPI
from fastapi.responses import Response
from PIL import Image, ImageDraw, ImageSequence

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GIF_PATH = os.path.join(BASE_DIR, "data", "0.gif")
PNG_PATH = os.path.join(BASE_DIR, "data", "1.png")
BASE_PNG_PATH = os.path.join(BASE_DIR, "data", "2.png")

AVATAR_URL = "https://q1.qlogo.cn/g?b=qq&nk={qq}&s=640"
CANVAS_W, CANVAS_H = 300, 226
AVATAR_SIZE = 80
AVATAR_POS = ((CANVAS_W - AVATAR_SIZE) // 2,
              (CANVAS_H - AVATAR_SIZE) // 2)
AVATAR_ROUND = True

PNG_SCALE = 0.8

HOLD_AVATAR_MS = 1000
OVERLAY_TRIGGER_MS = 3000
TAIL_MS = 3000
STEP_MS = 100

BG_COLOR = (255, 255, 255)

USE_TRANSPARENT_BG = False


def make_circle(img, size):
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def flatten(img, bg):
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    canvas = Image.new("RGBA", img.size, bg + (255,))
    canvas.alpha_composite(img)
    return canvas.convert("RGB")


async def fetch_avatar(qq):
    url = AVATAR_URL.format(qq=qq)
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url) as resp:
            data = await resp.read()
    return Image.open(io.BytesIO(data))


def load_gif_frames(path):
    img = Image.open(path)
    frames = []
    durations = []
    try:
        while True:
            frame = img.convert("RGBA")
            frames.append(frame.copy())
            durations.append(int(img.info.get("duration", 80)))
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    if not frames:
        raise ValueError("GIF 无帧 " + path)
    return frames, durations


def build_shared_palette_p_frames(rgb_frames):
    if not rgb_frames:
        return []

    total_w = sum(f.width for f in rgb_frames)
    max_h = max(f.height for f in rgb_frames)
    combined = Image.new("RGB", (total_w, max_h), BG_COLOR)
    x = 0
    for f in rgb_frames:
        combined.paste(f, (x, 0))
        x += f.width

    pal_img = combined.quantize(colors=256, method=Image.Quantize.MEDIANCUT)

    p_frames = [
        f.quantize(palette=pal_img, dither=Image.Dither.NONE)
        for f in rgb_frames
    ]
    return p_frames


async def build_gif(qq):
    avatar = await fetch_avatar(qq)
    if AVATAR_ROUND:
        avatar = make_circle(avatar, AVATAR_SIZE)
    else:
        avatar = avatar.convert("RGBA").resize(
            (AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS
        )

    gif_frames, gif_durations = load_gif_frames(GIF_PATH)

    png_overlay = Image.open(PNG_PATH).convert("RGBA")
    if PNG_SCALE != 1.0:
        pw = int(png_overlay.width * PNG_SCALE)
        ph = int(png_overlay.height * PNG_SCALE)
        png_overlay = png_overlay.resize((pw, ph), Image.LANCZOS)
    png_pos = ((CANVAS_W - png_overlay.width) // 2,
               (CANVAS_H - png_overlay.height) // 2)

    bg_base = Image.open(BASE_PNG_PATH).convert("RGBA")
    if bg_base.size != (CANVAS_W, CANVAS_H):
        bg_base = bg_base.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)

    under = Image.new("RGBA", (CANVAS_W, CANVAS_H), BG_COLOR + (255,))
    under = Image.alpha_composite(under, bg_base)

    avatar_layer = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    avatar_layer.paste(avatar, AVATAR_POS, avatar)
    base_avatar = Image.alpha_composite(under, avatar_layer)

    png_layer = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    png_layer.paste(png_overlay, png_pos, png_overlay)
    base_with_png = Image.alpha_composite(base_avatar, png_layer)

    rgb_frames = []
    out_durations = []

    t = 0
    while t < HOLD_AVATAR_MS:
        d = min(STEP_MS, HOLD_AVATAR_MS - t)
        rgb_frames.append(flatten(base_avatar, BG_COLOR))
        out_durations.append(d)
        t += d

    gif_time = 0
    for frame, dur in zip(gif_frames, gif_durations):
        cur = base_with_png.copy() if gif_time >= OVERLAY_TRIGGER_MS else base_avatar.copy()
        cur.alpha_composite(frame, (0, 0))
        rgb_frames.append(flatten(cur, BG_COLOR))
        out_durations.append(dur)
        gif_time += dur

    t = 0
    while t < TAIL_MS:
        d = min(STEP_MS, TAIL_MS - t)
        rgb_frames.append(flatten(base_with_png, BG_COLOR))
        out_durations.append(d)
        t += d

    p_frames = build_shared_palette_p_frames(rgb_frames)

    buf = io.BytesIO()
    if USE_TRANSPARENT_BG:
        p_frames[0].save(
            buf,
            format="GIF",
            save_all=True,
            append_images=p_frames[1:],
            duration=out_durations,
            loop=0,
            transparency=0,
            disposal=2,
            optimize=False,
        )
    else:
        p_frames[0].save(
            buf,
            format="GIF",
            save_all=True,
            append_images=p_frames[1:],
            duration=out_durations,
            loop=0,
            disposal=2,
            optimize=False,
        )
    return buf.getvalue()


@app.get("/qq/v1/img/dr/snowgrave")
async def spawn(qq: str = ""):
    if not qq or not qq.isdigit():
        return Response(content="bad qq", status_code=400, media_type="text/plain")
    try:
        gif_bytes = await build_gif(qq)
        return Response(content=gif_bytes, media_type="image/gif")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(content="error: " + str(e), status_code=500, media_type="text/plain")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=1225)
