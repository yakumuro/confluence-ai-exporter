"""Generate browser and store icons from the vector logo geometry."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
SCALE = 8
SIZE = 128 * SCALE


def rounded_gradient(size):
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    start = (129, 120, 255)
    end = (81, 71, 229)
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x + y) / (2 * size)))
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(start, end)) + (255,)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=30 * SCALE, fill=255)
    image.putalpha(mask)
    return image


def line(draw, points, fill, width):
    scaled = [(x * SCALE, y * SCALE) for x, y in points]
    draw.line(scaled, fill=fill, width=round(width * SCALE), joint="curve")
    radius = width * SCALE / 2
    for x, y in (scaled[0], scaled[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def build():
    OUT.mkdir(exist_ok=True)
    image = rounded_gradient(SIZE)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (28 * SCALE, 24 * SCALE, 100 * SCALE, 112 * SCALE),
        radius=8 * SCALE,
        fill=(255, 255, 255, 250),
    )
    draw.polygon(
        [(76 * SCALE, 24 * SCALE), (100 * SCALE, 48 * SCALE), (84 * SCALE, 48 * SCALE),
         (76 * SCALE, 40 * SCALE)],
        fill=(220, 217, 255, 255),
    )
    line(draw, [(45, 57), (82, 57)], (99, 91, 255, 255), 7)
    line(draw, [(70, 45), (82, 57), (70, 69)], (99, 91, 255, 255), 7)
    line(draw, [(83, 83), (46, 83)], (45, 212, 191, 255), 7)
    line(draw, [(58, 71), (46, 83), (58, 95)], (45, 212, 191, 255), 7)
    for size in (16, 32, 48, 128, 256):
        icon = image.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(OUT / f"icon{size}.png", optimize=True)


if __name__ == "__main__":
    build()
