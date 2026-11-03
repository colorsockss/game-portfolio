"""UI 틀 그림(9-slice와 게이지, 점, 체크)을 그린다.

사용: python draw.py <출력 폴더>
첨부 레퍼런스의 그림체: 짙은 남보라 외곽선, 위가 밝고 아래가 어두운 두 단, 버튼의 아래 턱.
회색조 그림은 테마 색이 곱해져 입혀지고(Image.color), 크림색 판과 칸, 막대 바탕은 색을 넣어 그린다.
4배로 그린 뒤 줄여 가장자리를 부드럽게 한다. 9-slice 테두리는 BORDERS이고 Unity의 .meta에 같은 값을 적는다.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

SCALE = 4
OUTLINE = (43, 34, 54)

# 그림마다 9-slice 테두리(왼쪽, 아래, 오른쪽, 위). Unity의 spriteBorder {x, y, z, w} 순서다.
BORDERS = {
    "button": (36, 44, 36, 36),
    "tile": (36, 40, 36, 36),
    "slot": (30, 30, 30, 36),
    "chip": (26, 26, 26, 26),
    "panel": (40, 44, 40, 40),
    "cell": (28, 28, 28, 28),
    "band": (0, 10, 0, 10),
    "track": (18, 14, 18, 14),
    "input": (32, 32, 32, 32),
}


def grey(value, alpha=255):
    v = round(value * 255)
    return (v, v, v, alpha)


def canvas(width, height):
    return Image.new("RGBA", (width * SCALE, height * SCALE), (0, 0, 0, 0))


def box(x0, y0, x1, y1):
    return [round(x0 * SCALE), round(y0 * SCALE), round(x1 * SCALE) - 1, round(y1 * SCALE) - 1]


def rounded(size, rect, radius):
    """rect(1배 좌표) 안을 채운 둥근 사각형의 마스크."""
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box(*rect), radius=radius * SCALE, fill=255)
    return mask


def fill(image, mask, color):
    image.paste(Image.new("RGBA", image.size, color), (0, 0), mask)


def bands(image, mask, stops):
    """mask 안을 위에서부터 (끝 y, 색) 단으로 칠한다. y는 1배 좌표다."""
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    top = 0
    for end, color in stops:
        draw.rectangle([0, round(top * SCALE), image.size[0], round(end * SCALE)], fill=color)
        top = end
    image.paste(layer, (0, 0), mask)


def finish(image):
    w, h = image.size
    return image.resize((w // SCALE, h // SCALE), Image.LANCZOS)


def button():
    """버튼·탭·제목 꼬리표: 위 밝은 단과 광택 줄, 아래 어두운 단, 아래 턱(12픽셀)."""
    w = h = 128
    line, radius, lip = 7, 30, 12
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), OUTLINE + (255,))
    inner = rounded(image.size, (line, line, w - line, h - line), radius - line)
    bands(image, inner, [(h * 0.5, grey(0.96)), (h - line - lip, grey(0.84)), (h, grey(0.6))])
    # 위쪽 안의 광택 줄.
    gloss = rounded(image.size, (line + 14, line + 5, w - line - 14, line + 10), 2.5)
    fill(image, gloss, grey(1.0))
    return finish(image)


def tile():
    """등급 칸·아이콘 칸: 위 58%는 밝고 아래는 어둡다. 테마가 등급 색을 입힌다."""
    w = h = 128
    line, radius = 7, 26
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), OUTLINE + (255,))
    inner = rounded(image.size, (line, line, w - line, h - line), radius - line)
    bands(image, inner, [(h * 0.58, grey(1.0)), (h, grey(0.8))])
    return finish(image)


def slot():
    """보기만 하는 칸(강화·스킬 줄의 아이콘, 스킬 바, 가방): 위쪽 안에 그림자가 진 오목한 칸. 볼록한 버튼·칸과 구별된다."""
    w = h = 128
    line, radius, shade = 5, 24, 10
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), OUTLINE + (255,))
    fill(image, rounded(image.size, (line, line, w - line, h - line), radius - line), grey(0.68))
    fill(image, rounded(image.size, (line, line + shade, w - line, h - line), radius - line), grey(0.92))
    return finish(image)


def chip():
    """세그먼트 탭의 고른 칸: 아래 턱 없이 납작한 둥근 칸. 테마가 주황을 입히고, 고르지 않은 칸은 투명하게 둔다."""
    w = h = 96
    line, radius = 5, 22
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), OUTLINE + (255,))
    fill(image, rounded(image.size, (line, line, w - line, h - line), radius - line), grey(1.0))
    return finish(image)


def rays():
    """활성 효과의 빛살: 가운데에서 퍼지는 열두 갈래. 가장자리로 갈수록 투명해지고 돌려도 이음매가 없다."""
    s = 256
    image = canvas(s, s)
    import math
    c = s * SCALE / 2
    layer = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(layer)
    for i in range(12):
        a = math.tau * i / 12
        half = math.tau / 48
        draw.polygon([(c, c), (c + c * math.cos(a - half), c + c * math.sin(a - half)),
                      (c + c * math.cos(a + half), c + c * math.sin(a + half))], fill=255)
    fade = Image.radial_gradient("L").resize(image.size).point(lambda v: 255 - v)
    alpha = ImageChops.multiply(layer, fade)
    image.paste(Image.new("RGBA", image.size, grey(1.0)), (0, 0), alpha)
    return finish(image)


def panel():
    """크림색 판(팝업, 아래 판): 외곽선 안쪽의 밝은 테두리. 색을 넣어 그리므로 테마는 흰색을 곱한다."""
    w = h = 128
    line, rim, radius, shadow = 7, 5, 30, 6
    image = canvas(w, h)
    # 아래 그림자는 테두리 안에 있어 판이 늘어나도 두께가 같다.
    fill(image, rounded(image.size, (0, shadow, w, h), radius), (0, 0, 0, 90))
    body = h - shadow
    fill(image, rounded(image.size, (0, 0, w, body), radius), OUTLINE + (255,))
    fill(image, rounded(image.size, (line, line, w - line, body - line), radius - line), (255, 250, 236, 255))
    fill(image, rounded(image.size, (line + rim, line + rim, w - line - rim, body - line - rim), radius - line - rim),
         (246, 234, 210, 255))
    return finish(image)


def cell():
    """판 안의 줄과 칸: 연한 갈색 테두리의 밝은 크림색."""
    w = h = 96
    line, radius = 4, 22
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), (217, 195, 160, 255))
    fill(image, rounded(image.size, (line, line, w - line, h - line), radius - line), (255, 250, 238, 255))
    return finish(image)


def band():
    """위쪽 HUD, 아래 탭 막대, 영웅 띠: 위아래 외곽선과 두 단. 테마가 남색이나 나무색을 입힌다."""
    w, h = 32, 64
    line = 5
    image = canvas(w, h)
    full = rounded(image.size, (0, 0, w, h), 0)
    fill(image, full, OUTLINE + (255,))
    bands(image, rounded(image.size, (0, line, w, h - line), 0), [(h * 0.5, grey(1.0)), (h, grey(0.86))])
    return finish(image)


def track():
    """막대 바탕과 재화·능력치 알약: 어두운 보라 알약. 위쪽 안에 그림자 줄."""
    w, h = 64, 32
    line, radius = 4, 16
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), OUTLINE + (255,))
    inner = rounded(image.size, (line, line, w - line, h - line), radius - line)
    bands(image, inner, [(line + 3, (37, 30, 52, 255)), (h, (58, 49, 80, 255))])
    return finish(image)


def gauge():
    """게이지의 채움: 위 40%가 밝은 두 단 알약. Filled라 늘어나므로 9-slice가 아니다."""
    w, h = 256, 32
    image = canvas(w, h)
    bands(image, rounded(image.size, (0, 0, w, h), h / 2), [(h * 0.4, grey(1.0)), (h, grey(0.78))])
    return finish(image)


def dot():
    """알림 뱃지와 슬라이더 손잡이, 스테이지 진행 점: 외곽선이 있는 동그라미."""
    s = 64
    line = 6
    image = canvas(s, s)
    draw = ImageDraw.Draw(image)
    draw.ellipse(box(0, 0, s, s), fill=OUTLINE + (255,))
    inner = Image.new("L", image.size, 0)
    ImageDraw.Draw(inner).ellipse(box(line, line, s - line, s - line), fill=255)
    bands(image, inner, [(s * 0.55, grey(1.0)), (s, grey(0.82))])
    return finish(image)


def check():
    """토글의 체크: 외곽선을 두른 흰 획."""
    s = 64
    image = canvas(s, s)
    draw = ImageDraw.Draw(image)
    points = [(14 * SCALE, 33 * SCALE), (27 * SCALE, 46 * SCALE), (51 * SCALE, 19 * SCALE)]
    for width, color in ((17, OUTLINE + (255,)), (8, (255, 255, 255, 255))):
        draw.line(points, fill=color, width=width * SCALE, joint="curve")
        for x, y in (points[0], points[-1]):
            r = width * SCALE / 2
            draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
    return finish(image)


def input_box():
    """입력란: 흰 바탕, 위쪽 안의 옅은 그림자."""
    w = h = 128
    line, radius = 6, 26
    image = canvas(w, h)
    fill(image, rounded(image.size, (0, 0, w, h), radius), OUTLINE + (255,))
    inner = rounded(image.size, (line, line, w - line, h - line), radius - line)
    bands(image, inner, [(line + 6, grey(0.88)), (h, grey(1.0))])
    return finish(image)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, draw in [("button", button), ("tile", tile), ("slot", slot), ("chip", chip), ("rays", rays), ("panel", panel), ("cell", cell), ("band", band),
                       ("track", track), ("gauge", gauge), ("dot", dot), ("check", check), ("input", input_box)]:
        draw().save(out / f"{name}.png", optimize=True)
        print(name, BORDERS.get(name, "-"))


if __name__ == "__main__":
    main()
