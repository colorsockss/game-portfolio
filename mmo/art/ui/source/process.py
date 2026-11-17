# Codex image_gen으로 뽑은 UI 그림(mmo/art/ui/source/)을 최종본(mmo/art/ui/)으로 만든다(backlog 99). 투명 여백을 잘라 내고 최종 크기로 줄인다.
# 둥근 것(조이스틱)은 정사각형으로 맞춘 뒤 줄인다. 9-slice 그림은 가운데의 밝기 흩어짐을 찍어 무늬가 남았는지 본다(늘리면 무늬가 늘어남).
# 저장소에 의존성을 더하지 않으려고 저장소 밖 가상환경의 Pillow로 돌린다(python3 -m venv ~/.venvs/art; ~/.venvs/art/bin/pip install pillow).
#
#   ~/.venvs/art/bin/python -I mmo/art/ui/source/process.py
import os
import statistics
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
# 파일 → (최종 크기, 9-slice의 가운데(가로·세로 비율, 그 안의 밝기 흩어짐을 잼), 둥근 것인지). 크기는 prompts.md의 표와 같다.
ASSETS = {
    "bar_fill.png": ((512, 64), None, False),
    "joystick_base.png": ((512, 512), None, True),
    "joystick_thumb.png": ((256, 256), None, True),
}
# 9-slice의 가운데가 이보다 흩어지면(밝기 0–255의 표준 편차) 알린다.
FLAT_LIMIT = 12.0


def crop_to_alpha(image):
    alpha = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    box = alpha.getbbox()
    if box is None:
        raise SystemExit("the image is fully transparent")
    return image.crop(box)


def square(image):
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def center_spread(image, inset):
    """가운데(가장자리에서 inset 비율만큼 들어간 곳)의 밝기 표준 편차."""
    w, h = image.size
    box = (int(w * inset[0]), int(h * inset[1]), int(w * (1 - inset[0])), int(h * (1 - inset[1])))
    gray = image.crop(box).convert("L")
    return statistics.pstdev(gray.getdata())


failed = []
for name, (size, inset, round_) in ASSETS.items():
    source = os.path.join(HERE, name)
    if not os.path.isfile(source):
        failed.append(f"{name}: missing")
        continue
    image = crop_to_alpha(Image.open(source).convert("RGBA"))
    if round_:
        image = square(image)
    final = image.resize(size, Image.LANCZOS)
    final.save(os.path.join(OUT, name), optimize=True)
    note = ""
    if inset:
        spread = center_spread(final, inset)
        note = f", center spread {spread:.1f}"
        if spread > FLAT_LIMIT:
            failed.append(f"{name}: the center is not flat ({spread:.1f})")
    print(f"{name}: cropped {image.size} -> {size}{note}")

if failed:
    print("\n".join(failed))
    sys.exit(1)
