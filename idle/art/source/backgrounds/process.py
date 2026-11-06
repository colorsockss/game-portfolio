# 숲·야영지·요새·고개·용암의 원경·근경 후처리(2026-11-04). 저장소 밖 Pillow 환경에서 스테이지마다 실행한다:
#   ~/.venvs/art/bin/python idle/art/source/backgrounds/process.py forest
# 원본 세 장(<key>_scene·far·near.png)을 읽어 idle/art/backgrounds/<key>_far·near.png를 쓰고, 미리보기는 임시 폴더에 둔다.
# 이음매는 4:7로 자르고 줄인 그림의 왼쪽 절반과 그 거울상을 잇는다(요새는 기둥 중심 x 66–412를 늘려 쓴다). 그래서 겹마다 좌우가 대칭이다.
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat,ImageOps
import json,os,sys,tempfile
ROOT=Path(__file__).resolve().parents[4]
WORK=Path(tempfile.gettempdir())/'backgrounds-preview'
W,H=768,1344

def save(im,path):
    t=path.with_name(path.name+'.tmp');im.save(t,format='PNG');os.replace(t,path)

def resize(im):
    width,height=im.size;cw=height*4/7
    return im.resize((W,H),Image.Resampling.LANCZOS,box=((width-cw)/2,0,(width+cw)/2,height))

def mirror_join(im,side='left'):
    # 같은 절단면을 거울로 잇기 때문에 윤곽을 중첩하거나 흐리지 않는다.
    if key=='fortress':
        # 반복되는 두 기둥의 중심을 잘라 아치와 횃불을 이어 준다.
        half=im.crop((66,0,412,H)).resize((W//2,H),Image.Resampling.LANCZOS)
    else:
        half=im.crop((0,0,W//2,H)) if side=='left' else im.crop((W//2,0,W,H))
    out=Image.new('RGBA',(W,H));out.paste(half,(0,0));out.paste(ImageOps.mirror(half),(W//2,0))
    return out

def three(im):
    out=Image.new('RGBA',(W*3,H))
    for i in range(3):out.paste(im,(W*i,0))
    return out

def checker(size):
    out=Image.new('RGBA',size,'#eeeeee');d=ImageDraw.Draw(out)
    for y in range(0,size[1],24):
        for x in range(0,size[0],24):
            if (x//24+y//24)%2:d.rectangle((x,y,x+23,y+23),fill='#bdbdbd')
    return out

key=sys.argv[1];assert key in {'forest','camp','fortress','snow','lava'}
source=ROOT/'idle/art/source/backgrounds';target=ROOT/'idle/art/backgrounds';preview=WORK/key
preview.mkdir(parents=True,exist_ok=True)
scene=Image.open(source/f'{key}_scene.png').convert('RGBA')
far=Image.open(source/f'{key}_far.png').convert('RGBA')
near=Image.open(source/f'{key}_near.png').convert('RGBA')
assert scene.size==far.size==near.size==(1024,1536)
rows=[(sum(ImageStat.Stat(far.crop((0,y,1024,y+1))).mean[:3]),y) for y in range(540,710)]
horizon=min(rows)[1]
while horizon>530 and sum(ImageStat.Stat(far.crop((0,horizon-1,1024,horizon))).mean[:3])<110:horizon-=1
if key=='snow':horizon=681
raw_alpha=near.getchannel('A').getextrema()
source_horizon=horizon
if horizon>615:
    # 두 겹과 복원 원본에 같은 세로 변환을 적용해 지평선 높이를 맞춘다.
    def align_floor(im):
        out=Image.new('RGBA',im.size)
        out.paste(im.crop((0,0,1024,horizon)).resize((1024,590),Image.Resampling.LANCZOS),(0,0))
        out.paste(im.crop((0,horizon,1024,1536)).resize((1024,946),Image.Resampling.LANCZOS),(0,590))
        return out
    scene,far,near=map(align_floor,[scene,far,near])
    horizon=590
# 투명 추출로 뚫린 바닥을 원래 장면의 같은 위치에서 복원한다.
near.paste(scene.crop((0,horizon,1024,1536)),(0,horizon))
near.putalpha(near.getchannel('A').point(lambda a:0 if a<=8 else (255 if a>=250 else a)))
# 원경의 가려질 바닥은 단색으로 정리한다.
ground=tuple(round(c) for c in ImageStat.Stat(scene.crop((430,700,594,715))).median[:3])+(255,)
ImageDraw.Draw(far).rectangle((0,horizon+8,1023,1535),fill=ground)
# 배우 영역을 비우되 포석은 길의 재질이므로 보존한다.
if key!='fortress':
    start=horizon+8 if key=='forest' else 700
    ImageDraw.Draw(near).rectangle((0,start,1023,1535),fill=ground)
far=mirror_join(resize(far));near=mirror_join(resize(near))
save(far,target/f'{key}_far.png');save(near,target/f'{key}_near.png')
overlay=Image.alpha_composite(far,near)
save(three(far),preview/'far-three.png')
save(Image.alpha_composite(checker((W*3,H)),three(near)),preview/'near-three.png')
save(overlay,preview/'overlay.png');save(three(overlay),preview/'overlay-three.png')
save(Image.alpha_composite(Image.new('RGBA',(W,H),'#ff00ff'),near),preview/'near-magenta.png')
offsets=Image.new('RGBA',(W*3,1080))
for row,shift in enumerate((0,193,389)):
    combined=Image.alpha_composite(far,ImageChops.offset(near,shift,0))
    offsets.paste(three(combined).crop((0,350,W*3,710)),(0,row*360))
save(offsets,preview/'parallax-offsets.png')
report={'key':key,'horizon':horizon,'source_horizon':source_horizon,'ground':ground,'raw_near_alpha':raw_alpha,'seam':'중앙 크롭·축소 후 반쪽을 거울상으로 연결','layers':{}}
for name,im in [('far',far),('near',near)]:
    alpha=im.getchannel('A');edge=ImageChops.difference(im.crop((0,0,1,H)),im.crop((W-1,0,W,H)))
    report['layers'][name]={'size':im.size,'alpha':alpha.getextrema(),'edge':edge.getextrema(),'ground_alpha':alpha.crop((0,round((horizon+10)*H/1536),W,H)).getextrema()}
    assert im.size==(W,H) and all(v==(0,0) for v in edge.getextrema())
    assert report['layers'][name]['ground_alpha']==(255,255)
assert far.getchannel('A').getextrema()==(255,255)
assert near.getchannel('A').getextrema()==(0,255)
(preview/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
