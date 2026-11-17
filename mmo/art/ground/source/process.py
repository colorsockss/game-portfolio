# Codex image_gen으로 뽑은 땅 텍스처(mmo/art/ground/source/)를 최종본(mmo/art/ground/)으로 만든다(backlog 103).
#   - <이름>.png: 이음매를 지운 512×512 색 텍스처. 반 칸 민 그림을 가장자리 쪽에 섞어(가운데는 원본) 네 변이 이어진다.
#   - <이름>_n.png: 돌길과 그을린 땅만(무늬의 높낮이가 보이는 둘. 모바일의 텍스처 수를 아낌). 밝기를 높이로 본 노멀 맵(DirectX 방식:
#     초록이 아래쪽 +V)이고 둘레를 감아 계산해 이음매가 없다.
#   - noise.png: 땅 머티리얼이 큰 얼룩과 구름 그림자에 쓰는 256×256 타일 노이즈(R, G, B가 서로 다른 씨앗). 생성기 없이 여기서 만든다.
# 저장소에 의존성을 더하지 않으려고 저장소 밖 가상환경의 Pillow로 돌린다(python3 -m venv ~/.venvs/art; ~/.venvs/art/bin/pip install pillow).
#
#   ~/.venvs/art/bin/python -I mmo/art/ground/source/process.py
import math
import os
import random

from PIL import Image, ImageChops, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
NAMES = ["grass", "forest", "dirt", "cobble", "scorched"]
NORMALS = ["cobble", "scorched"]
WORK = 1024
SIZE = 512
NORMAL_STRENGTH = 3.0


def seamless(image):
    offset = ImageChops.offset(image, WORK // 2, WORK // 2)
    # 가운데는 원본(1), 가장자리로 갈수록 반 칸 민 그림(0). 섞는 띠는 한 변의 1/4이다.
    band = WORK * 0.25
    mask = Image.new("L", (WORK, WORK))
    mask.putdata([
        round(255 * min(1.0, min(x, WORK - 1 - x, y, WORK - 1 - y) / band))
        for y in range(WORK) for x in range(WORK)
    ])
    return Image.composite(image, offset, mask)


def normal_map(image):
    height = image.convert("L").filter(ImageFilter.GaussianBlur(1.2))
    w, h = height.size
    values = list(height.getdata())
    out = []
    for y in range(h):
        up, down = ((y - 1) % h) * w, ((y + 1) % h) * w
        row = y * w
        for x in range(w):
            left, right = (x - 1) % w, (x + 1) % w
            du = (values[row + right] - values[row + left]) / 510.0
            dv = (values[down + x] - values[up + x]) / 510.0
            nx, ny, nz = -du * NORMAL_STRENGTH, -dv * NORMAL_STRENGTH, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            out.append(tuple(round((c / length * 0.5 + 0.5) * 255) for c in (nx, ny, nz)))
    result = Image.new("RGB", (w, h))
    result.putdata(out)
    return result


def value_noise(size, cells, seed):
    """size 픽셀에 cells×cells 칸의 타일 값 노이즈(0–1)를 세 옥타브로."""
    total = [0.0] * (size * size)
    for octave, weight in ((1, 0.55), (2, 0.3), (4, 0.15)):
        rng = random.Random(seed * 10 + octave)
        n = cells * octave
        grid = [[rng.random() for _ in range(n)] for _ in range(n)]
        for y in range(size):
            fy = y / size * n
            iy, ty = int(fy), fy - int(fy)
            ty = ty * ty * (3 - 2 * ty)
            for x in range(size):
                fx = x / size * n
                ix, tx = int(fx), fx - int(fx)
                tx = tx * tx * (3 - 2 * tx)
                a = grid[iy % n][ix % n] * (1 - tx) + grid[iy % n][(ix + 1) % n] * tx
                b = grid[(iy + 1) % n][ix % n] * (1 - tx) + grid[(iy + 1) % n][(ix + 1) % n] * tx
                total[y * size + x] += weight * (a * (1 - ty) + b * ty)
    return total


for name in NAMES:
    source = Image.open(os.path.join(HERE, f"{name}.png")).convert("RGB").resize((WORK, WORK), Image.LANCZOS)
    tile = seamless(source).resize((SIZE, SIZE), Image.LANCZOS)
    tile.save(os.path.join(OUT, f"{name}.png"))
    if name in NORMALS:
        normal_map(tile).save(os.path.join(OUT, f"{name}_n.png"))
    print(name)

channels = [value_noise(256, 4, seed) for seed in (1, 2, 3)]
noise = Image.new("RGB", (256, 256))
noise.putdata([tuple(round(c[i] * 255) for c in channels) for i in range(256 * 256)])
noise.save(os.path.join(OUT, "noise.png"))
print("noise")
