#!/usr/bin/env python3
"""生成 docsify-fpk 应用图标（docsify 绿 + 白色文档 + 折角）。

产物：
  fpk/ICON.PNG                  64x64
  fpk/ICON_256.PNG              256x256
  fpk/app/ui/images/icon_64.png   64x64
  fpk/app/ui/images/icon_256.png  256x256
"""
import os
from PIL import Image, ImageDraw

GREEN = (66, 185, 131, 255)        # #42b983 docsify 绿
GREEN_LIGHT = (200, 240, 225, 255) # 折角浅绿
WHITE = (255, 255, 255, 255)


def make_icon(size: int, path: str) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.22)

    # 背景圆角方块 + 顶部高光
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=GREEN)
    d.rounded_rectangle([0, 0, size - 1, int(size * 0.45)], radius=r, fill=(84, 205, 155, 255))

    # 白色文档（上圆角矩形）
    m = size * 0.24
    w = size * 0.52
    h = size * 0.62
    x0 = (size - w) / 2
    y0 = size * 0.2
    dr = size * 0.05
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=dr, fill=WHITE)

    # 右下折角
    fold_x = x0 + w
    fold_y = y0 + h * 0.45
    d.polygon(
        [(fold_x, fold_y), (fold_x, y0 + h), (fold_x - (h - (fold_y - y0)), y0 + h)],
        fill=GREEN_LIGHT,
    )
    d.polygon(
        [(fold_x, fold_y), (fold_x, y0 + h), (fold_x - size * 0.03, y0 + h - size * 0.03)],
        fill=(230, 248, 240, 255),
    )

    # 文档内绿色文本行
    lx = x0 + size * 0.09
    ly = y0 + size * 0.1
    lw = size * 0.055
    for _ in range(4):
        d.rounded_rectangle(
            [lx, ly, lx + w * 0.7, ly + lw], radius=size * 0.02, fill=GREEN
        )
        ly += size * 0.09

    img.save(path)
    print(f"  {path}  {size}x{size}")


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)  # 项目根
    out = [
        (64, os.path.join(root, "fpk", "ICON.PNG")),
        (256, os.path.join(root, "fpk", "ICON_256.PNG")),
        (64, os.path.join(root, "fpk", "app", "ui", "images", "icon_64.png")),
        (256, os.path.join(root, "fpk", "app", "ui", "images", "icon_256.png")),
    ]
    for size, path in out:
        make_icon(size, path)


if __name__ == "__main__":
    main()
