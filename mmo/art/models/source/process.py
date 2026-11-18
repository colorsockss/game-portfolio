# 어라운드 시트(source/<키>_sheet.png)를 Tripo의 multi-view 입력 네 장(source/views/<키>_<방향>.png)으로 자른다.
#   - 시트의 네 모습을 왼쪽부터 front, left, back, right로 본다(prompts.md의 명세와 같은 차례).
#   - 모습 사이의 흰 세로 띠로 나누고, 네 장 모두 시트 전체의 같은 위아래 범위를 같은 배율로 옮긴다
#     (Tripo는 네 장의 크기와 발 높이가 같아야 함). 모습의 키가 그림의 85%인 1024×1024 흰 바탕이다.
# 저장소에 의존성을 더하지 않으려고 저장소 밖 가상환경의 Pillow로 돌린다(mmo/art/ground/source/process.py와 같음).
#
#   ~/.venvs/art/bin/python -I mmo/art/models/source/process.py knight
#   ~/.venvs/art/bin/python -I mmo/art/models/source/process.py --self-test
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
VIEWS = ["front", "left", "back", "right"]
SIZE = 1024
FILL = 0.85
WHITE = 240  # 세 채널이 모두 이 값 이상이면 바탕
MIN_PIXELS = 3  # 세로줄에 바탕 아닌 픽셀이 이보다 적으면 빈 줄(가장자리의 잡티)


def split(sheet):
    sheet = sheet.convert("RGB")
    w, h = sheet.size
    px = sheet.load()
    filled = [[min(px[x, y]) < WHITE for y in range(h)] for x in range(w)]
    columns = [sum(c) >= MIN_PIXELS for c in filled]
    runs, start = [], None
    for x, on in enumerate(columns + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x))
            start = None
    if len(runs) != len(VIEWS):
        raise SystemExit(f"expected {len(VIEWS)} figures separated by white gaps, found {len(runs)}: {runs}")
    rows = [y for y in range(h) if any(filled[x][y] for x in range(w))]
    top, bottom = rows[0], rows[-1] + 1
    side = round((bottom - top) / FILL)
    out = []
    for x0, x1 in runs:
        if x1 - x0 > side:
            raise SystemExit(f"figure at x {x0}-{x1} is wider than the square ({side} px)")
        canvas = Image.new("RGB", (side, side), (255, 255, 255))
        canvas.paste(sheet.crop((x0, top, x1, bottom)), ((side - (x1 - x0)) // 2, (side - (bottom - top)) // 2))
        out.append(canvas.resize((SIZE, SIZE), Image.LANCZOS))
    return out


def self_test():
    # 키가 같고 너비가 다른 네 모습: 네 장이 나오고 모두 같은 위아래 자리에 있어야 한다.
    sheet = Image.new("RGB", (1536, 1024), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for i, width in enumerate((300, 120, 300, 120)):
        cx = 192 + i * 384
        draw.rectangle((cx - width // 2, 100, cx + width // 2, 900), fill=(80, 40, 40))
    views = split(sheet)
    assert len(views) == 4
    for v in views:
        rows = [y for y in range(SIZE) if min(v.getpixel((SIZE // 2, y))) < WHITE]
        assert abs(rows[0] - round(SIZE * (1 - FILL) / 2)) <= 2 and abs(rows[-1] - round(SIZE * (1 + FILL) / 2)) <= 2, (rows[0], rows[-1])
    print("self-test ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        sys.exit(0)
    key = sys.argv[1]
    os.makedirs(os.path.join(HERE, "views"), exist_ok=True)
    for name, image in zip(VIEWS, split(Image.open(os.path.join(HERE, f"{key}_sheet.png")))):
        image.save(os.path.join(HERE, "views", f"{key}_{name}.png"))
        print(f"{key}_{name}")
