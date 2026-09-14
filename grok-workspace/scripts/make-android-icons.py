#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path("/workspace/android/app/src/main/res")
PLAY = Path("/workspace/artifacts/lumen-android")
PLAY.mkdir(parents=True, exist_ok=True)

BG = (9, 9, 11, 255)
PAPER = (243, 239, 230, 255)
BAR = (200, 204, 212, 255)


def draw_icon(size: int, round_mask: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)
    pad_x = int(size * 0.25)
    pad_y = int(size * 0.16)
    paper = [pad_x, pad_y, size - pad_x, size - pad_y]
    d.rounded_rectangle(paper, radius=max(2, size // 16), fill=PAPER)
    bar_h = max(3, size // 10)
    bar_y = size // 2 - bar_h // 2
    d.rounded_rectangle(
        (int(size * 0.1), bar_y, int(size * 0.9), bar_y + bar_h),
        radius=bar_h // 2,
        fill=BAR,
    )
    if round_mask:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

for folder, size in DENSITIES.items():
    dest = OUT / folder
    dest.mkdir(parents=True, exist_ok=True)
    draw_icon(size, False).save(dest / "ic_launcher.png")
    draw_icon(size, True).save(dest / "ic_launcher_round.png")

play = draw_icon(512, False)
play.save(PLAY / "play-icon-512.png")
print("icons written")
