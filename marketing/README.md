# OncoWatch — Promotional Deck

A 12-slide promotional presentation for OncoWatch, built to be edited in
**Google Slides** or PowerPoint/Keynote.

## Files

| File | Purpose |
| --- | --- |
| `OncoWatch-Promotional-Deck.pptx` | The deck. Import this into Google Slides. |
| `preview-contact-sheet.png` | Quick visual overview of all 12 slides. |
| `build_deck.py` | Regenerates the `.pptx` from code. |
| `render_preview.py` | Regenerates the preview contact sheet (QA only). |

## Open it in Google Slides

1. Go to [slides.google.com](https://slides.google.com) (or Google Drive).
2. **Drive:** click **New → File upload** and choose `OncoWatch-Promotional-Deck.pptx`.
3. Right-click the uploaded file → **Open with → Google Slides**.
4. *(Optional)* **File → Save as Google Slides** to convert it to a native,
   fully editable Google Slides document.

Fonts map to Arial (Georgia on the dedication slide); colors, layout, and
shapes import cleanly.

## Slide order

1. Hero — *"Never miss what might matter."*
2. The problem — families can't keep up with fast-moving research
3. Meet OncoWatch — Watches · Understands · Explains · Prepares
4. How it works — the four-step flow
5. Evidence you can trust — source-backed findings
6. Private by design — Mode 1 (local-only) & Mode 2 (de-identified AI assist)
7. Reports — what you bring to your oncology team
8. Honest scope — what OncoWatch is, and is not
9. Who it's for — patients, caregivers, care teams
10. Where it's going — roadmap
11. The story behind OncoWatch — dedication
12. Call to action

## Personalize the dedication (slide 11)

Slide 11 is written from the heart. To make it yours, open it in Google
Slides and consider:

- Adding your mom's **name** and a **photo**.
- Adjusting the wording to sound like you.

## Regenerate

```bash
pip install python-pptx Pillow
python marketing/build_deck.py        # rebuilds the .pptx
python marketing/render_preview.py    # rebuilds the preview PNG
```

> OncoWatch is an information and summarization tool, not medical advice.
> Every finding requires clinician review. The deck's claims are intentionally
> scoped to what the product actually does today.
