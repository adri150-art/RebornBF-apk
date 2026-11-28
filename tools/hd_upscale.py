"""Remaster HD de l'interface de combat : agrandissement x4 par IA (Real-ESRGAN, modèle « anime »),
puis réduction propre à x2 de la taille d'origine. Le dessin reste celui du jeu, en net."""
import io, os, sys, urllib.request
import numpy as np, torch
from PIL import Image, ImageFilter
from spandrel import ModelLoader

LIST, OUT = sys.argv[1], sys.argv[2]
BASE = 'https://assets.rebornbf.com/assets/original/'
UA = {'User-Agent': 'Mozilla/5.0'}
model = ModelLoader().load_from_file('model.pth').eval()
torch.set_num_threads(os.cpu_count() or 2)

def up(rgb):
    t = torch.from_numpy(np.asarray(rgb, dtype=np.float32) / 255.).permute(2, 0, 1)[None]
    with torch.no_grad():
        o = model(t)[0].clamp(0, 1).permute(1, 2, 0).numpy()
    return Image.fromarray((o * 255 + .5).astype(np.uint8))

done = 0
for path in [l.strip() for l in open(LIST) if l.strip()]:
    try:
        src = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=30).read())).convert('RGBA')
    except Exception as e:
        print('absent', path, e); continue
    w, h = src.size
    # Bords transparents : on étale la couleur sous l'alpha pour éviter les halos sombres
    rgb = Image.new('RGB', src.size, (0, 0, 0)); rgb.paste(src.convert('RGB'), mask=src.split()[3])
    big = up(rgb) if w * h <= 700 * 700 else rgb.resize((w * 4, h * 4), Image.LANCZOS)
    alpha = src.split()[3].resize(big.size, Image.LANCZOS)
    hd = big.convert('RGBA'); hd.putalpha(alpha)
    hd = hd.resize((w * 2, h * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    dst = os.path.join(OUT, path); os.makedirs(os.path.dirname(dst), exist_ok=True)
    hd.save(dst, optimize=True)
    src.save(dst.replace('.png', '.orig.png')) if os.environ.get('KEEP_ORIG') else None
    done += 1
    print('ok', path, (w, h), '->', hd.size)
print('total', done)
