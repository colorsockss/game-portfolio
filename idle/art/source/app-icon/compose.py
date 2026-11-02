"""앱 아이콘을 게임 그림(초원 배경 색, 영웅, 몬스터)으로 합성한다.

사용: python compose.py <idle/art/source/actors 경로> <출력 폴더>
좌표는 보이는 아이콘의 한 변을 1로 둔 단위(u)다. 적응형 아이콘(108dp)은 가운데 72dp가
보이므로 [-0.25, 1.25] 범위를 그린다.
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

# Backgrounds.cs의 meadow 색.
SKY_TOP = (0.42, 0.62, 0.85)
SKY_BOTTOM = (0.7, 0.82, 0.92)
FAR = (0.32, 0.5, 0.32)
GROUND = (0.36, 0.52, 0.3)
MARK = (0.28, 0.42, 0.24)
HORIZON = 0.66


def rgb(color, alpha=255):
    return tuple(round(c * 255) for c in color) + (alpha,)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def frame(sheet: Path, index: int, flip: bool) -> Image.Image:
    image = Image.open(sheet).convert("RGBA")
    side = image.height
    cell = image.crop((index * side, 0, (index + 1) * side, side))
    cell = cell.crop(cell.getbbox())
    return cell.transpose(Image.FLIP_LEFT_RIGHT) if flip else cell


def background(size: int, lo: float, hi: float) -> Image.Image:
    scale = 2
    big = size * scale
    image = Image.new("RGBA", (big, big))
    draw = ImageDraw.Draw(image)
    span = hi - lo

    def px(u: float) -> float:
        return (u - lo) / span * big

    for y in range(big):
        u = lo + y / big * span
        t = min(max((u - lo) / (HORIZON - lo), 0), 1)
        draw.line([(0, y), (big, y)], fill=rgb(lerp(SKY_TOP, SKY_BOTTOM, t)))
    hills = [(0, big)]
    for x in range(0, big + 1, 4):
        u = lo + x / big * span
        top = 0.6 - 0.045 * math.sin(u * 7.5 + 0.6) - 0.025 * math.sin(u * 15 + 1.3)
        hills.append((x, px(top)))
    hills.append((big, big))
    draw.polygon(hills, fill=rgb(FAR))
    draw.rectangle([0, px(0.72), big, big], fill=rgb(GROUND))
    ground = [(0, big)]
    for x in range(0, big + 1, 4):
        u = lo + x / big * span
        ground.append((x, px(0.72 - 0.012 * math.sin(u * 9 + 2))))
    ground.append((big, big))
    draw.polygon(ground, fill=rgb(GROUND))
    # 풀 무늬: 작은 V자 묶음.
    for i in range(-6, 16):
        u = i * 0.13 + 0.03
        v = 0.86 + 0.06 * ((i * 37) % 5) / 4
        x, y, w = px(u), px(v), 0.018 / span * big
        draw.line([(x - w, y - w * 1.6), (x, y), (x + w, y - w * 1.6)], fill=rgb(MARK), width=max(2, round(w * 0.45)))
    return image.resize((size, size), Image.LANCZOS)


def place(canvas: Image.Image, sprite: Image.Image, cx: float, foot: float, height: float, lo: float, hi: float):
    span = hi - lo
    size = canvas.width
    h = round(height / span * size)
    w = round(sprite.width * h / sprite.height)
    sprite = sprite.resize((w, h), Image.LANCZOS)
    x = round((cx - lo) / span * size - w / 2)
    y = round((foot - lo) / span * size - h)
    canvas.alpha_composite(sprite, (x, y))


def shadow(canvas: Image.Image, cx: float, foot: float, width: float, lo: float, hi: float):
    span = hi - lo
    size = canvas.width
    layer = Image.new("RGBA", canvas.size)
    draw = ImageDraw.Draw(layer)
    x, y, w = (cx - lo) / span * size, (foot - lo) / span * size, width / span * size
    draw.ellipse([x - w / 2, y - w * 0.12, x + w / 2, y + w * 0.06], fill=(30, 45, 25, 90))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(size * 0.006)))


def characters(actors: Path):
    hero = frame(actors / "hero/flat/idle.png", 0, False)
    slime = Image.open(actors / "green_slime/flat-master.png").convert("RGBA")
    slime = slime.crop(slime.getbbox())
    dragon = frame(actors / "fire_dragon/flat/idle.png", 0, True)
    return [
        (dragon, 0.72, 0.42, 0.27, 0),
        (slime, 0.76, 0.84, 0.2, 0.2),
        (hero, 0.40, 0.84, 0.66, 0.3),
    ]


def render(actors: Path, size: int, lo: float, hi: float, layer: str) -> Image.Image:
    canvas = background(size, lo, hi) if layer != "foreground" else Image.new("RGBA", (size, size))
    if layer == "background":
        return canvas
    for sprite, cx, foot, height, shadow_width in characters(actors):
        if shadow_width:
            shadow(canvas, cx, foot, shadow_width, lo, hi)
        place(canvas, sprite, cx, foot, height, lo, hi)
    return canvas


def main():
    actors, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    render(actors, 1024, 0, 1, "full").convert("RGB").save(out / "icon.png")
    render(actors, 432, -0.25, 1.25, "background").convert("RGB").save(out / "background.png")
    render(actors, 432, -0.25, 1.25, "foreground").save(out / "foreground.png")


if __name__ == "__main__":
    main()
