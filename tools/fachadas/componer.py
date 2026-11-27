# Compone los atlas de fachada a partir de los pases horneados (out/<pase>/<id>.png).
import json, sys, os
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'fachadas')
os.makedirs(OUT, exist_ok=True)
tiles = json.load(open(os.path.join(os.path.dirname(__file__), 'piezas.json')))
T, PAD, COLS, SIZE = 256, 8, 7, 2048
CELL = T + 2 * PAD
def pad_edge(im):
    w, h = im.size
    out = Image.new(im.mode, (w + 2 * PAD, h + 2 * PAD))
    out.paste(im, (PAD, PAD))
    # bordes extruidos
    out.paste(im.crop((0, 0, 1, h)).resize((PAD, h)), (0, PAD))
    out.paste(im.crop((w - 1, 0, w, h)).resize((PAD, h)), (w + PAD, PAD))
    top = out.crop((0, PAD, w + 2 * PAD, PAD + 1)).resize((w + 2 * PAD, PAD)); out.paste(top, (0, 0))
    bot = out.crop((0, PAD + h - 1, w + 2 * PAD, PAD + h)).resize((w + 2 * PAD, PAD)); out.paste(bot, (0, PAD + h))
    return out
for p in ['albedo', 'mask', 'normal']:
    atlas = Image.new('RGB', (SIZE, SIZE), (128, 128, 255) if p == 'normal' else (0, 0, 0))
    for i, t in enumerate(tiles):
        im = Image.open(os.path.join(os.path.dirname(__file__), 'salida', p, t['id'] + '.png')).convert('RGB').resize((T, T), Image.LANCZOS)
        col, row = i % COLS, i // COLS
        x0 = col * CELL
        y0 = SIZE - (row * CELL + CELL)   # fila 0 abajo (v crece hacia arriba con flipY)
        atlas.paste(pad_edge(im), (x0, y0))
    if p == 'mask':
        atlas.save(f'{OUT}/fachadas-mascaras.webp', 'WEBP', lossless=True, method=6)
        atlas.save(f'{OUT}/fachadas-mascaras.png', optimize=True)
    else:
        atlas.save(f'{OUT}/fachadas-{p}.webp', 'WEBP', quality=88 if p == 'albedo' else 92, method=6)
        atlas.save(f'{OUT}/fachadas-{p}.jpg', 'JPEG', quality=88 if p == 'albedo' else 93)
print({f: os.path.getsize(f'{OUT}/{f}') for f in sorted(os.listdir(OUT))})
