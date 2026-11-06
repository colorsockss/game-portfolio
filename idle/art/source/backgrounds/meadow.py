# 초원의 원경·근경 후처리(2026-11-04). 저장소 밖 Pillow 환경에서 실행한다:
#   ~/.venvs/art/bin/python idle/art/source/backgrounds/meadow.py
# 하늘과 구름은 원본을 살리고, 언덕 띠만 x 384–768의 절반과 그 거울상으로 잇는다. 근경은 양 끝을 섞어 잇는다.
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps
import json
import os
import tempfile

ROOT = Path(__file__).resolve().parents[4]
PREVIEW = Path(tempfile.gettempdir()) / 'backgrounds-preview' / 'meadow'
SOURCE = ROOT / 'idle/art/source/backgrounds'
OUTPUT = ROOT / 'idle/art/backgrounds'
W, H = 768, 1344


def save_atomic(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    image.save(temporary, format='PNG')
    os.replace(temporary, path)


def resize(image):
    width, height = image.size
    crop_width = height * 4 / 7
    box = ((width - crop_width) / 2, 0, (width + crop_width) / 2, height)
    return image.resize((W, H), Image.Resampling.LANCZOS, box=box)


def three(image):
    result = Image.new('RGBA', (W * 3, H))
    for n in range(3):
        result.paste(image, (W * n, 0))
    return result


def checker(size):
    result = Image.new('RGBA', size, '#eeeeee')
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], 24):
        for x in range(0, size[0], 24):
            if (x // 24 + y // 24) % 2:
                draw.rectangle((x, y, x + 23, y + 23), fill='#c6c6c6')
    return result


def smooth(t):
    return t * t * (3 - 2 * t)


scene_source = Image.open(SOURCE / 'meadow_scene.png').convert('RGBA')
far_source = Image.open(SOURCE / 'meadow_far.png').convert('RGBA')
near_source = Image.open(SOURCE / 'meadow_near.png').convert('RGBA')

# 생성된 근경의 상단 투명을 보존하고 잘못 지워진 땅만 장면 원본으로 복원한다.
near_repaired = near_source.copy()
near_pixels = near_repaired.load()
source_pixels = scene_source.load()
generated_pixels = near_source.load()
for y in range(1536):
    for x in range(1024):
        if y < 593:
            r, g, b, a = generated_pixels[x, y]
            near_pixels[x, y] = (r, g, b, 0 if a <= 4 else a)
        elif y < 700:
            r, g, b, a = generated_pixels[x, y]
            original = source_pixels[x, y]
            near_pixels[x, y] = tuple(round((c * a + original[i] * (255 - a)) / 255) for i, c in enumerate((r, g, b))) + (255,)
        elif y < 748:
            weight = smooth((y - 700) / 47)
            original = source_pixels[x, y]
            generated = generated_pixels[x, y]
            near_pixels[x, y] = tuple(round(generated[i] * (1 - weight) + original[i] * weight) for i in range(3)) + (255,)
        else:
            near_pixels[x, y] = source_pixels[x, y]

far = resize(far_source)
near = resize(near_repaired)
save_atomic(three(far), PREVIEW / 'far-three-before.png')
save_atomic(three(near), PREVIEW / 'near-three-before.png')

# 잘려 반복 경계에 걸리는 큰 구름 둘은 같은 원본의 완전한 구름으로 옮긴다.
# 하늘의 빈 부분에서 색을 가져와 자르기 전 구름 크기와 윤곽을 유지한다.
sky = (91, 188, 253, 255)
draw = ImageDraw.Draw(far)
draw.rectangle((0, 0, W - 1, 266), fill=sky)
for bounds, destination, scale in [
    ((30, 78, 395, 269), (46, 68), 0.78),
    ((720, 157, 995, 298), (505, 137), 0.78),
]:
    cloud = far_source.crop(bounds)
    pixels = cloud.load()
    for y in range(cloud.height):
        for x in range(cloud.width):
            r, g, b, a = pixels[x, y]
            if b - r > 80 and b - g > 35 and r < 160:
                pixels[x, y] = (0, 0, 0, 0)
    cloud = cloud.resize((round(cloud.width * scale), round(cloud.height * scale)), Image.Resampling.LANCZOS)
    far.alpha_composite(cloud, destination)

# 언덕과 수풀 윤곽의 높이를 양 끝에서 맞춘 뒤 색만 섞어 이중 윤곽을 막는다.
def contours(image, x):
    groups = []
    for y in range(350, 518):
        r, g, b, a = image.getpixel((x, y))
        if r < 80 and g < 140 and b < 180:
            if not groups or y > groups[-1][-1] + 1:
                groups.append([y])
            else:
                groups[-1].append(y)
    return [(group[0] + group[-1]) / 2 for group in groups[:2]]


original_far = far.copy()
edge_width = 64
left_contours = contours(original_far, 0)
right_contours = contours(original_far, W - 1)
target = [(a + b) / 2 for a, b in zip(left_contours, right_contours)]
original_pixels = original_far.load()
far_pixels = far.load()
for x in list(range(edge_width)) + list(range(W - edge_width, W)):
    distance = min(x, W - 1 - x)
    weight = 1 - smooth(distance / edge_width)
    old = contours(original_far, x)
    if len(old) != 2:
        raise RuntimeError(f'Unexpected edge contour count at {x}: {old}')
    new = [a * (1 - weight) + b * weight for a, b in zip(old, target)]
    knots_old = [340, *old, 518]
    knots_new = [340, *new, 518]
    for y in range(340, 518):
        for i in range(3):
            if knots_new[i] <= y <= knots_new[i + 1]:
                ratio = (y - knots_new[i]) / (knots_new[i + 1] - knots_new[i])
                sample_y = knots_old[i] + ratio * (knots_old[i + 1] - knots_old[i])
                low = int(sample_y)
                fraction = sample_y - low
                a, b = original_pixels[x, low], original_pixels[x, low + 1]
                far_pixels[x, y] = tuple(round(a[c] * (1 - fraction) + b[c] * fraction) for c in range(4))
                break


def blend_edges(image, width):
    original = image.copy().convert('RGBa')
    result = original.copy()
    src, dst = original.load(), result.load()
    for distance in range(width):
        weight = 1 - smooth(distance / (width - 1))
        left, right = distance, W - 1 - distance
        for y in range(H):
            a, b = src[left, y], src[right, y]
            average = [(a[c] + b[c]) / 2 for c in range(4)]
            dst[left, y] = tuple(round(a[c] * (1 - weight) + average[c] * weight) for c in range(4))
            dst[right, y] = tuple(round(b[c] * (1 - weight) + average[c] * weight) for c in range(4))
    return result.convert('RGBA')


far = blend_edges(far, 24)
near = blend_edges(near, 44)

# 연결부의 잘린 하이라이트와 수풀 내부 잔선을 정리한다.
pixels = far.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = pixels[x, y]
        if b > 210 and r < 140 and g > 150:
            pixels[x, y] = sky
        if y >= 521:
            pixels[x, y] = (139, 198, 92, 255)
        if 395 < y < 475 and (x < 125 or x > 610) and r > 153 and g > 206 and b < 150:
            pixels[x, y] = (146, 205, 106, 255)
for x in list(range(32)) + list(range(W - 32, W)):
    distance = min(x, W - 1 - x)
    weight = 1 - smooth(max(0, distance - 8) / 24)
    boundaries = contours(far, x)
    lower = round(boundaries[1] + 4)
    for y in range(lower, 518):
        old = pixels[x, y]
        color = (76, 158, 125, 255)
        pixels[x, y] = tuple(round(a * (1 - weight) + b * weight) for a, b in zip(old, color))

# 경계에서 잘린 풀밭 무늬를 비우고 가운데의 작은 두 무늬만 보존한다.
pixels = near.load()
ground = (139, 198, 92, 255)
for y in range(610, H):
    for x in range(W):
        keep_patch = (15 <= x <= 150 and 940 <= y <= 977) or (580 <= x <= 725 and 1000 <= y <= 1035)
        r, g, b, a = pixels[x, y]
        if keep_patch and r < 128 and g < 187:
            pixels[x, y] = (119, 177, 82, 255)
        else:
            pixels[x, y] = ground

# 마지막 연결 띠는 원본 윤곽의 양 끝을 보간해 한 줄로 이어 이중 윤곽을 없앤다.
span = 64
start_x, end_x = W - span, span - 1
start = contours(original_far, start_x)
end = contours(original_far, end_x)
start_prev = contours(original_far, start_x - 3)
end_next = contours(original_far, end_x + 3)
factor = 4
strip = Image.new('RGBA', (span * 2 * factor, H * factor), sky)
draw = ImageDraw.Draw(strip)
top_points, bush_points = [], []


def hermite(a, b, m0, m1, t):
    return (2*t**3 - 3*t**2 + 1)*a + (t**3 - 2*t**2 + t)*m0 + (-2*t**3 + 3*t**2)*b + (t**3 - t**2)*m1


for sx in range(span * 2 * factor):
    t = sx / (span * 2 * factor - 1)
    top = hermite(start[0], end[0], (start[0]-start_prev[0])/3*span*2, (end_next[0]-end[0])/3*span*2, t)
    bush = hermite(start[1], end[1], 0, 0, t) - 6 * 4 * t * (1-t)
    top_points.append((sx, round(top * factor)))
    bush_points.append((sx, round(bush * factor)))
bottom = H * factor - 1
draw.polygon(top_points + [(span*2*factor-1, bottom), (0, bottom)], fill=(143,203,106,255))
shadow_points = []
for i, (sx, by) in enumerate(bush_points):
    t = i / (len(bush_points)-1)
    shadow_points.append((sx, by - round(21 * smooth(t) * factor)))
draw.polygon(shadow_points + [(span*2*factor-1, bottom), (0, bottom)], fill=(114,187,120,255))
draw.polygon(bush_points + [(span*2*factor-1, bottom), (0, bottom)], fill=(76,158,125,255))
draw.line(top_points, fill=(35,104,120,255), width=4*factor)
draw.line(bush_points, fill=(35,104,120,255), width=3*factor)
strip = strip.resize((span*2,H), Image.Resampling.LANCZOS)
pixels, strip_pixels = far.load(), strip.load()
for sx in range(span*2):
    x = (W-span+sx) % W
    weight = smooth(min(1, min(sx,span*2-1-sx)/12))
    for y in range(350,518):
        old, new = pixels[x,y], strip_pixels[sx,y]
        pixels[x,y] = tuple(round(a*(1-weight)+b*weight) for a,b in zip(old,new))
far = blend_edges(far, 2)

# 원경 지형의 단일 반폭과 그 반사본을 연결해 윤곽이 정확히 이어지게 한다.
# 하늘과 구름은 그대로 두어 구름의 광원 방향과 원래 모양을 유지한다.
terrain = original_far.crop((384, 350, W, 519))
far.paste(terrain, (0,350))
far.paste(ImageOps.mirror(terrain), (384,350))
pixels = far.load()
for y in range(350,519):
    for x in range(W):
        r,g,b,a = pixels[x,y]
        if b > 210 and r < 140 and g > 150:
            pixels[x,y] = sky

save_atomic(far, OUTPUT / 'meadow_far.png')
save_atomic(near, OUTPUT / 'meadow_near.png')
overlay = Image.alpha_composite(far, near)
save_atomic(three(far), PREVIEW / 'far-three.png')
save_atomic(Image.alpha_composite(checker((W * 3, H)), three(near)), PREVIEW / 'near-three.png')
save_atomic(overlay, PREVIEW / 'overlay.png')
save_atomic(three(overlay), PREVIEW / 'overlay-three.png')
save_atomic(Image.alpha_composite(Image.new('RGBA', (W, H), '#ff00ff'), near), PREVIEW / 'near-magenta.png')
strip = Image.new('RGBA', (W * 3, 360 * 3))
for index, shift in enumerate((0, 193, 389)):
    shifted = ImageChops.offset(near, shift, 0)
    composite = Image.alpha_composite(far, shifted)
    strip.paste(three(composite).crop((0, 350, W * 3, 710)), (0, index * 360))
save_atomic(strip, PREVIEW / 'parallax-offsets.png')
report = {}
for key, image in [('far', far), ('near', near)]:
    alpha = image.getchannel('A')
    delta = ImageChops.difference(image.crop((0, 0, 1, H)), image.crop((W - 1, 0, W, H)))
    report[key] = {
        'size': image.size,
        'mode': image.mode,
        'alpha_extrema': alpha.getextrema(),
        'edge_difference': delta.getextrema(),
        'ground_alpha_from_y_521': alpha.crop((0, 521, W, H)).getextrema(),
        'transparent_top': alpha.crop((0, 0, W, 510)).getextrema(),
    }
print(json.dumps(report, indent=2))
(PREVIEW / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
