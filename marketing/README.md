# Coffey — Promotional Deck

A 12-slide promotional presentation for **Coffey** (*formerly OncoWatch*), built
to be edited in **Google Slides** or PowerPoint/Keynote.

Coffey is named for **Judy Coffey**. The deck closes on a dedication to her.

## Files

| File | Purpose |
| --- | --- |
| `Coffey-Promotional-Deck.pptx` | The deck. Import this into Google Slides. |
| `preview-contact-sheet.png` | Quick visual overview of all 12 slides. |
| `build_deck.py` | Regenerates the `.pptx` from code. |
| `render_preview.py` | Regenerates the preview contact sheet (QA only). |

## Open it in Google Slides

1. Go to [slides.google.com](https://slides.google.com) (or Google Drive).
2. **Drive:** click **New → File upload** and choose `Coffey-Promotional-Deck.pptx`.
3. Right-click the uploaded file → **Open with → Google Slides**.
4. *(Optional)* **File → Save as Google Slides** to convert it to a native,
   fully editable Google Slides document.

Fonts map to Arial (Georgia on the dedication slide); colors, layout, and
shapes import cleanly.

## Slide order

1. Hero — *"Never miss what might matter."*
2. The problem — families can't keep up with fast-moving research
3. Meet Coffey — Watches · Understands · Explains · Prepares
4. How it works — the four-step flow
5. **See it in action — real Dashboard screenshot**
6. **A guided tour — real screenshots of all six core screens**
7. Evidence you can trust — source-backed findings
8. Private by design — Mode 1 (local-only) & Mode 2 (de-identified AI assist)
9. Reports — what you bring to your oncology team
10. Honest scope — what Coffey is, and is not
11. Who it's for — patients, caregivers, care teams
12. Where it's going — roadmap
13. Why it's called Coffey — dedication to Judy Coffey
14. Call to action

Slides 5–6 use **actual product screenshots** (see `screenshots/`), not mockups.

## Personalize the dedication (slide 11)

Slide 11 honors Judy Coffey. To make it even more personal, open it in Google
Slides and consider:

- Adding a **photo** of her.
- Adjusting the wording to sound like you.
- Adding dates or a favorite saying of hers.

## Regenerate

```bash
pip install python-pptx Pillow
python marketing/build_deck.py        # rebuilds the .pptx
python marketing/render_preview.py    # rebuilds the preview PNG
```

> Coffey is an information and summarization tool, not medical advice.
> Every finding requires clinician review. The deck's claims are intentionally
> scoped to what the product actually does today.
