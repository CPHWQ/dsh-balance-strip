from PIL import Image, ImageDraw, ImageFont
S = 4
W = 512 * S
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角方底
d.rounded_rectangle([0, 0, W - 1, W - 1], radius=112 * S, fill=(18, 50, 79, 255))

# 中央 ¥
def font(size):
    for p in (r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

f = font(250 * S)
text = "\u00a5"
box = d.textbbox((0, 0), text, font=f)
tw, th = box[2] - box[0], box[3] - box[1]
d.text(((W - tw) / 2 - box[0], (W - th) / 2 - box[1] - 40 * S), text, font=f, fill=(255, 255, 255, 255))

# 底部两段胶囊：谷（绿）/ 峰（红）
bh, bw = 26 * S, 300 * S
x0, y0 = (W - bw) // 2, 372 * S
half = bw // 2
d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=bh // 2, fill=(63, 178, 127, 255))
mask = Image.new("L", (bw, bh), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([half, 0, bw - 1, bh - 1], radius=bh // 2, fill=255)
img.paste((232, 131, 122, 255), (x0, y0, x0 + bw, y0 + bh), mask)

img = img.resize((512, 512), Image.LANCZOS)
out = r"D:\Users\somcn\Documents\deepseek-harness\default-workspace\dsh-balance-strip\icon.png"
img.save(out, "PNG", optimize=True)
print("ok", out)
