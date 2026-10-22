"""Genera los recursos de marca de web y app a partir de Docs/marca/logo-original.jpeg.

Uso (desde la raíz del repo):  python3 -m pip install rembg onnxruntime pillow numpy
                               python3 Docs/marca/generar_marca.py

- Emblema sin fondo: rembg (modelo isnet-general-use) separa la insignia del paisaje.
- Marca pequeña: la mascota en un medallón crema; el emblema completo no se lee por debajo de ~64 px.
- Paisaje del menú lateral: atardecer y montañas (lado izquierdo de la foto) unidos por la selva con
  el mercado y los chontaduros (lado derecho), en vertical para un panel alto. Va desenfocado: encima
  lleva el vidrio oscuro definido en código (web: globals.css .sidebar-glass; app: side_menu.dart).
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
SRC = Image.open(ROOT / "Docs/marca/logo-original.jpeg").convert("RGB")
WEB = ROOT / "web"
APP = ROOT / "app"
CREAM = (255, 247, 226, 255)

# Centro y radio de la cara de la mascota dentro del emblema recortado (px del emblema).
HEAD = (226, 152, 84)


def emblem() -> Image.Image:
    cut = remove(SRC, session=new_session("isnet-general-use"))
    return cut.crop(cut.getchannel("A").getbbox())


def disc(size: int, inset: int = 0) -> Image.Image:
    """Círculo suavizado (supermuestreo 4x) como máscara L."""
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((inset * 4, inset * 4, (size - inset) * 4 - 1, (size - inset) * 4 - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def mark(em: Image.Image, size: int = 512) -> Image.Image:
    """Mascota en medallón con borde crema (transparente fuera del círculo)."""
    cx, cy, r = HEAD
    face = em.crop((cx - r, cy - r, cx + r, cy + r)).resize((size, size), Image.LANCZOS)
    inner = Image.new("RGBA", (size, size), CREAM)
    inner.alpha_composite(face)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (size, size), CREAM), (0, 0), disc(size))
    out.paste(inner, (0, 0), disc(size, round(size * 0.045)))
    return out


def adaptive_foreground(em: Image.Image, size: int = 432) -> Image.Image:
    """Capa frontal del ícono adaptable de Android (108 dp): la cara ocupa la zona segura de 66 dp."""
    cx, cy, r = HEAD
    r = r * 0.92 * 108 / 66
    crop = em.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), CREAM)
    out.alpha_composite(crop)
    return out


def ios_icon(em: Image.Image, size: int = 1024) -> Image.Image:
    """Ícono de iOS: cuadrado opaco (sin alfa, iOS recorta las esquinas) con la cara a sangre sobre crema."""
    cx, cy, r = HEAD
    r = r * 1.12
    crop = em.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), CREAM)
    out.alpha_composite(crop)
    return out.convert("RGB")


def scene() -> Image.Image:
    src = np.asarray(SRC).astype(np.float32)
    w = 296
    top = src[0:230, 0:w]  # atardecer, montañas y selva
    bottom = src[120:559, 1024 - w : 1024]  # selva, techos del mercado, puestos y chontaduros
    overlap = 70  # la unión cae en la selva de ambos lados
    t = np.linspace(0, 1, overlap)[:, None, None]
    t = t * t * (3 - 2 * t)
    seam = top[-overlap:] * (1 - t) + bottom[:overlap] * t
    img = Image.fromarray(np.concatenate([top[:-overlap], seam, bottom[overlap:]]).clip(0, 255).astype(np.uint8))
    return img.resize((img.width * 2, img.height * 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))


def square_on_cream(img: Image.Image, size: int, scale: float) -> Image.Image:
    out = Image.new("RGBA", (size, size), CREAM)
    s = round(size * scale)
    out.alpha_composite(img.resize((s, s), Image.LANCZOS), ((size - s) // 2, (size - s) // 2))
    return out


def main() -> None:
    em = emblem()
    mk = mark(em)
    bg = scene()

    brand = WEB / "src/assets/brand"
    brand.mkdir(parents=True, exist_ok=True)
    em.save(brand / "emblem.webp", quality=92, method=6)
    mk.resize((192, 192), Image.LANCZOS).save(brand / "mark.webp", quality=92, method=6)
    bg.save(brand / "sidebar-scene.webp", quality=78, method=6)
    mk.resize((96, 96), Image.LANCZOS).save(WEB / "src/app/icon.png", optimize=True)
    square_on_cream(mk, 180, 0.94).convert("RGB").save(WEB / "src/app/apple-icon.png", optimize=True)

    assets = APP / "assets/brand"
    assets.mkdir(parents=True, exist_ok=True)
    em.save(assets / "emblem.webp", quality=92, method=6)
    mk.resize((256, 256), Image.LANCZOS).save(assets / "mark.webp", quality=92, method=6)
    bg.save(assets / "sidebar_scene.jpg", quality=80, optimize=True, progressive=True)

    # Ícono del lanzador de Android (android/ se genera en CI; ver .github/workflows/app-android.yml).
    res = APP / "branding/android/res"
    fg = adaptive_foreground(em)
    for density, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        mk.resize((px, px), Image.LANCZOS).save(folder / "ic_launcher.png", optimize=True)
        fg.resize((px * 9 // 4, px * 9 // 4), Image.LANCZOS).save(folder / "ic_launcher_foreground.webp", quality=88, method=6)

    # Ícono de iOS (ios/ se genera en CI; ver .github/workflows/app-ios.yml): un solo PNG de 1024 px.
    ios = APP / "branding/ios"
    ios.mkdir(parents=True, exist_ok=True)
    ios_icon(em).save(ios / "AppIcon-1024.png", optimize=True)


if __name__ == "__main__":
    main()
