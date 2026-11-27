"""Icône de la version publique : l'icône du site (celle de l'onglet), dans toutes les tailles Android."""
import io, re, sys, urllib.request
from PIL import Image

R = 'public/src/main/res'
req = urllib.request.Request('https://rebornbf.com/icons/icon-512.png', headers={'User-Agent': 'Mozilla/5.0'})
img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert('RGBA')

for d, n in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    img.resize((n, n), Image.LANCZOS).save(f'{R}/mipmap-{d}/ic_launcher.png')

# Icône adaptative : l'image entière dans la zone visible, fond de la couleur de son bord
fg = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
inner = img.resize((300, 300), Image.LANCZOS)
fg.paste(inner, (66, 66), inner)
fg.save(f'{R}/drawable-nodpi/ic_fg.png')
r, g, b, _ = img.getpixel((4, img.height // 2))
xml = open(f'{R}/values/res.xml', encoding='utf-8').read()
xml = re.sub(r'<color name="ic_bg">#[0-9A-Fa-f]+</color>', f'<color name="ic_bg">#{r:02X}{g:02X}{b:02X}</color>', xml)
open(f'{R}/values/res.xml', 'w', encoding='utf-8').write(xml)
print('icône OK', img.size, f'fond #{r:02X}{g:02X}{b:02X}')
