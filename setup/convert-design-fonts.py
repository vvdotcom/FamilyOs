"""Generate native-compatible static faces from the design's bundled fonts."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'artifacts/font-tools'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SOURCE = ROOT / 'artifacts/design-reference'
DESTINATIONS = [ROOT / 'packages/shared-ui/src/assets/fonts', ROOT / 'apps/vega/assets/fonts']
for destination in DESTINATIONS:
    destination.mkdir(parents=True, exist_ok=True)

faces = [('Figtree', weight, None) for weight in [400, 500, 600, 700, 800]]
faces += [('Bricolage Grotesque', weight, size) for weight, size in [(800,56),(800,64),(800,68),(800,34),(700,34),(700,38),(700,40),(700,44),(700,96)]]
for family, weight, size in faces:
    original = TTFont(SOURCE / f'{family}-{weight}.woff2')
    axes = {'wght': weight}
    if size is not None:
        axes['opsz'] = size
    font = instantiateVariableFont(original, axes, inplace=False)
    name = f'Figtree-{weight}' if size is None else f'Bricolage-{weight}-{size}'
    for record in font['name'].names:
        if record.nameID in [1, 4, 6, 16]:
            record.string = name.encode(record.getEncoding())
        elif record.nameID in [2, 17]:
            record.string = 'Regular'.encode(record.getEncoding())
    font.flavor = None
    for destination in DESTINATIONS:
        font.save(destination / f'{name}.ttf')
    print(name)
