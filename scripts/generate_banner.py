"""Generate the GitHub README banner using the extension's visual identity."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets"
OUT.mkdir(exist_ok=True)
W, H = 1280, 640


def font(size, bold=False):
    fonts = Path("C:/Windows/Fonts")
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(fonts / name), size)


def pill(draw, box, label, text_color, fill, outline=None, text_size=15):
    draw.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=fill, outline=outline)
    draw.text((box[0] + 16, box[1] + 8), label, font=font(text_size, True), fill=text_color)


image = Image.new("RGB", (W, H))
pixels = image.load()
for y in range(H):
    for x in range(W):
        t = (x / W + y / H) / 2
        violet_glow = max(0, 1 - (((x - 980) / 700) ** 2 + ((y - 60) / 620) ** 2) ** 0.5)
        teal_glow = max(0, 1 - (((x - 1250) / 540) ** 2 + ((y - 650) / 600) ** 2) ** 0.5)
        pixels[x, y] = (
            round(22 + 24 * t + 29 * violet_glow),
            round(23 + 13 * t + 9 * violet_glow + 13 * teal_glow),
            round(47 + 45 * t + 62 * violet_glow + 30 * teal_glow),
        )

draw = ImageDraw.Draw(image)
for x in range(40, W, 48):
    for y in range(36, H, 48):
        draw.ellipse((x, y, x + 2, y + 2), fill=(74, 73, 111))
draw.ellipse((1000, -210, 1420, 210), outline=(92, 83, 167), width=2)
draw.ellipse((1060, -150, 1360, 150), outline=(83, 76, 150), width=2)

logo = Image.open(ROOT / "icons" / "icon128.png").convert("RGBA").resize((82, 82), Image.Resampling.LANCZOS)
image.paste(logo, (72, 58), logo)
draw.text((176, 66), "Confluence AI Exporter", font=font(31, True), fill="#ffffff")
draw.text((178, 108), "для Confluence", font=font(17), fill="#b9b7d5")

pill(draw, (74, 181, 433, 219), "MARKDOWN  +  ASCIIDOC  +  AI", "#dedbff", "#443b78", "#62579b", 13)
draw.multiline_text((70, 249), "Документация без\nлишней рутины", font=font(49, True), fill="#ffffff", spacing=7)
draw.multiline_text(
    (74, 389),
    "Экспорт и импорт страниц Confluence,\nвложения и AI-редактирование в боковой панели Chrome.",
    font=font(19),
    fill="#c5c4da",
    spacing=9,
)
draw.line((74, 495, 628, 495), fill="#504a76", width=2)
draw.text((74, 521), "Локальная конвертация  ·  Предпросмотр AI  ·  Без аналитики", font=font(15), fill="#9e9dbb")

shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((816, 84, 1162, 562), radius=28, fill=(4, 3, 20, 120))
shadow = shadow.filter(ImageFilter.GaussianBlur(24))
image = Image.alpha_composite(image.convert("RGBA"), shadow)
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((814, 66, 1160, 544), radius=26, fill="#f8f8fd", outline="#ffffff", width=2)
draw.rounded_rectangle((814, 66, 1160, 142), radius=26, fill="#ffffff")
draw.rectangle((814, 116, 1160, 142), fill="#ffffff")
small_logo = logo.resize((46, 46), Image.Resampling.LANCZOS)
image.paste(small_logo, (840, 82), small_logo)
draw.text((900, 89), "Confluence AI Exporter", font=font(16, True), fill="#24213b")
draw.text((900, 114), "Confluence", font=font(12), fill="#858198")
for x, color in [(1100, "#ff7a85"), (1122, "#f6c85f"), (1144, "#45c9b6")]:
    draw.ellipse((x - 5, 96, x + 5, 106), fill=color)

draw.text((842, 172), "ФОРМАТ ДОКУМЕНТА", font=font(11, True), fill="#8b86a2")
draw.rounded_rectangle((842, 200, 978, 250), radius=12, fill="#ece9ff")
draw.text((858, 211), ".md", font=font(17, True), fill="#5b50db")
draw.text((908, 215), "Markdown", font=font(12), fill="#56516f")
draw.rounded_rectangle((990, 200, 1132, 250), radius=12, fill="#e2f7f2")
draw.text((1005, 211), ".adoc", font=font(16, True), fill="#168c7c")
draw.text((1060, 215), "AsciiDoc", font=font(11), fill="#47726e")

for y, width in [(286, 248), (312, 274), (338, 204)]:
    draw.rounded_rectangle((842, y, 842 + width, y + 10), radius=5, fill="#dedde8")
draw.rounded_rectangle((842, 380, 1132, 464), radius=15, fill="#efedff")
draw.ellipse((860, 399, 888, 427), fill="#685de7")
draw.text((865, 404), "AI", font=font(10, True), fill="#ffffff")
draw.text((902, 393), "AI-ассистент", font=font(15, True), fill="#393353")
draw.text((902, 421), "Проверка и редактирование текста", font=font(11), fill="#77718e")
draw.rounded_rectangle((842, 491, 1132, 517), radius=13, fill="#e5f7f2")
draw.text((931, 495), "Готово к обмену", font=font(12, True), fill="#278776")

image.convert("RGB").save(OUT / "github-banner.png", optimize=True)
print(OUT / "github-banner.png")
