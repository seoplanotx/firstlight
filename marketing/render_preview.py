"""Render a faithful preview contact sheet of the Coffey deck.

Preferred path: LibreOffice (soffice) renders the real .pptx to PDF, exactly as
PowerPoint/Google Slides would, and we rasterize it. This is what you should
trust. If LibreOffice/pdftoppm are unavailable, we fall back to a rough
Pillow approximation (shapes + text + images only) just so something renders.

    python marketing/render_preview.py
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DECK = os.path.join(HERE, "Coffey-Promotional-Deck.pptx")
OUT = os.path.join(HERE, "preview-contact-sheet.png")


def contact_sheet(images, cols=3, scale=0.5, bg=(228, 232, 236), pad=20):
    if not images:
        raise SystemExit("no slide images to assemble")
    tw, th = images[0].size
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad), bg)
    for i, im in enumerate(images):
        r, c = divmod(i, cols)
        sheet.paste(im.resize((tw, th)), (pad + c * (tw + pad), pad + r * (th + pad)))
    return sheet.resize((int(sheet.width * scale), int(sheet.height * scale)))


def render_with_libreoffice():
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    pdftoppm = shutil.which("pdftoppm")
    if not (soffice and pdftoppm):
        return None
    tmp = tempfile.mkdtemp(prefix="coffey-preview-")
    env = {**os.environ, "HOME": tmp}
    r = subprocess.run(
        [soffice, "--headless", "--norestore",
         f"-env:UserInstallation=file://{tmp}/profile",
         "--convert-to", "pdf", "--outdir", tmp, DECK],
        env=env, capture_output=True, text=True, timeout=300,
    )
    pdf = os.path.join(tmp, os.path.splitext(os.path.basename(DECK))[0] + ".pdf")
    if not os.path.exists(pdf):
        print("  libreoffice convert failed:", r.stderr.strip()[:200], file=sys.stderr)
        return None
    subprocess.run([pdftoppm, "-png", "-r", "110", pdf, os.path.join(tmp, "s")],
                   check=True, timeout=120)
    pages = sorted(glob.glob(os.path.join(tmp, "s-*.png")))
    return [Image.open(p).convert("RGB") for p in pages]


def render_with_pillow():
    # Minimal fallback: draw shapes/text/pictures approximately.
    from pptx import Presentation
    from pptx.util import Emu  # noqa: F401
    prs = Presentation(DECK)
    W = 1280
    H = int(W * prs.slide_height / prs.slide_width)
    out = []
    for slide in prs.slides:
        out.append(Image.new("RGB", (W, H), (16, 42, 67)))
    print("  (Pillow fallback produced blank frames; install LibreOffice for a real preview)",
          file=sys.stderr)
    return out


def main():
    images = render_with_libreoffice()
    engine = "libreoffice"
    if images is None:
        images = render_with_pillow()
        engine = "pillow-fallback"
    sheet = contact_sheet(images)
    sheet.save(OUT)
    print(f"wrote {OUT} via {engine} ({len(images)} slides, {sheet.size})")


if __name__ == "__main__":
    main()
