# Codex image_gen으로 뽑은 아이콘(mmo/art/icons/source/)을 최종본(mmo/art/icons/, 256×256)으로 만든다(backlog 100).
#   - 아이템·효과·메뉴(투명 배경): 투명 여백을 잘라 정사각형 가운데에 두고(가장자리 6%를 비움) 줄인다. 칸마다 물건의 크기가 고르다.
#   - 스킬(skill_*. 꽉 찬 정사각형): 가운데의 정사각형을 잘라 줄인다.
# 저장소에 의존성을 더하지 않으려고 저장소 밖 가상환경의 Pillow로 돌린다(python3 -m venv ~/.venvs/art; ~/.venvs/art/bin/pip install pillow).
#
#   ~/.venvs/art/bin/python -I mmo/art/icons/source/process.py
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
SIZE = 256
MARGIN = 0.06


def fit_transparent(image):
    alpha = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    box = alpha.getbbox()
    if box is None:
        raise SystemExit("the image is fully transparent")
    image = image.crop(box)
    inner = round(SIZE * (1 - 2 * MARGIN))
    scale = inner / max(image.size)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(image, ((SIZE - image.width) // 2, (SIZE - image.height) // 2), image)
    return canvas


def fit_square(image):
    side = min(image.size)
    left, top = (image.width - side) // 2, (image.height - side) // 2
    return image.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)


count = 0
for source in sorted(glob.glob(os.path.join(HERE, "*.png"))):
    name = os.path.basename(source)
    image = Image.open(source).convert("RGBA")
    final = fit_square(image).convert("RGB") if name.startswith("skill_") else fit_transparent(image)
    final.save(os.path.join(OUT, name), optimize=True)
    count += 1
print(f"{count} icons -> {OUT}")
