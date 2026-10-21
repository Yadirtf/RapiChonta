"""Genera el ícono pequeño de los avisos push (E06): un chontaduro con su cáliz y dos líneas de velocidad.

Uso (desde la raíz del repo):  python3 -m pip install pillow
                               python3 Docs/marca/generar_icono_aviso.py

Android pinta este ícono solo con su forma (blanco sobre transparente) en la barra de estado, así que no
puede ser la mascota a color. Salen dos archivos, con el mismo trazo que ChontaGlyph en la app
(app/lib/features/notifications/presentation/widgets/chonta_glyph.dart):
- drawable/ic_stat_rapichonta.xml: vector para FCM (android.notification.icon = "ic_stat_rapichonta").
- raw/ic_stat_rapichonta.png: Huawei Push Kit solo acepta íconos en res/raw ("/raw/ic_stat_rapichonta").
El workflow del APK copia app/branding/android/res al proyecto Android.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "app/branding/android/res"

# Trazos en una cuadrícula de 24 × 24. "M x,y C ... Z" con curvas cúbicas.
FRUIT = "M12,6.6 C15.8,6.6 17.6,10.2 17.6,13.9 C17.6,18.1 15.2,21.6 12,21.8 C8.8,21.6 6.4,18.1 6.4,13.9 C6.4,10.2 8.2,6.6 12,6.6 Z"
SHINE = "M9.3,12.8 C9.4,11.2 10.2,9.9 11.4,9.3 C10.8,10.4 10.4,11.6 10.3,13 C10.25,13.6 9.25,13.5 9.3,12.8 Z"
CALYX = [
    "M11.6,7.6 C10.9,5.9 9.4,4.9 7.6,5 C8.9,5.7 9.9,6.7 10.5,7.9 Z",
    "M12.4,7.6 C13.1,5.9 14.6,4.9 16.4,5 C15.1,5.7 14.1,6.7 13.5,7.9 Z",
    "M11.25,7.4 L12,2.8 L12.75,7.4 Z",
]
# Líneas de velocidad: rectángulos de puntas redondas (x0, y0, x1, y1).
SPEED = [(1.2, 11.2, 5.4, 12.8), (2.2, 15.0, 5.2, 16.6)]


def rounded_bar(x0: float, y0: float, x1: float, y1: float) -> str:
    r = (y1 - y0) / 2
    return f"M{x0 + r},{y0} H{x1 - r} A{r},{r} 0 0 1 {x1 - r},{y1} H{x0 + r} A{r},{r} 0 0 1 {x0 + r},{y0} Z"


def vector() -> str:
    paths = [f'    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="{FRUIT} {SHINE}"/>']
    paths += [f'    <path android:fillColor="#FFFFFFFF" android:pathData="{d}"/>' for d in CALYX]
    paths += [f'    <path android:fillColor="#FFFFFFFF" android:pathData="{rounded_bar(*bar)}"/>' for bar in SPEED]
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- Generado por Docs/marca/generar_icono_aviso.py: no editar a mano. -->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n'
        + "\n".join(paths)
        + "\n</vector>\n"
    )


def polygon(d: str, scale: float, steps: int = 24) -> list[tuple[float, float]]:
    """Convierte un trazo M/C/L/Z en puntos (las curvas se muestrean)."""
    tokens = d.replace(",", " ").split()
    points: list[tuple[float, float]] = []
    i, cur = 0, (0.0, 0.0)
    while i < len(tokens):
        t = tokens[i]
        cmd, rest = t[0], t[1:]
        nums: list[float] = []
        if rest:
            nums.append(float(rest))
        i += 1
        while i < len(tokens) and not tokens[i][0].isalpha():
            nums.append(float(tokens[i]))
            i += 1
        if cmd in "ML":
            cur = (nums[0], nums[1])
            points.append(cur)
        elif cmd == "C":
            (x1, y1, x2, y2, x3, y3) = nums
            x0, y0 = cur
            for s in range(1, steps + 1):
                u = s / steps
                a, b, c, e = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u**2, u**3
                points.append((a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3))
            cur = (x3, y3)
    return [(x * scale, y * scale) for x, y in points]


def raster(size: int = 96) -> Image.Image:
    big = size * 4
    scale = big / 24
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(polygon(FRUIT, scale), fill=255)
    draw.polygon(polygon(SHINE, scale), fill=0)
    for d in CALYX:
        draw.polygon(polygon(d, scale), fill=255)
    for x0, y0, x1, y1 in SPEED:
        draw.rounded_rectangle((x0 * scale, y0 * scale, x1 * scale, y1 * scale), radius=(y1 - y0) / 2 * scale, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(mask)
    return out


if __name__ == "__main__":
    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    (RES / "raw").mkdir(parents=True, exist_ok=True)
    (RES / "drawable/ic_stat_rapichonta.xml").write_text(vector())
    raster().save(RES / "raw/ic_stat_rapichonta.png", optimize=True)
    print("Ícono de avisos generado en", RES)
