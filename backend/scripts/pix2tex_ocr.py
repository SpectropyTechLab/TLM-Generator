import json
import os
import sys

try:
    import cv2
    import numpy as np
    from pdf2image import convert_from_path
    from pix2tex.cli import LatexOCR
except Exception as exc:
    sys.stderr.write(f"Missing dependencies: {exc}\n")
    sys.exit(1)


def compute_iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area == 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter_area
    return inter_area / union if union > 0 else 0.0


def non_max_suppression(boxes, iou_threshold=0.4):
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: (b[1], b[0]))
    kept = []
    for box in boxes:
        if all(compute_iou(box, kept_box) < iou_threshold for kept_box in kept):
            kept.append(box)
    return kept


def detect_equation_regions(pil_image, min_area_ratio, max_regions, pad_px):
    image = np.array(pil_image)
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 15
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 3))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape[:2]
    min_area = int(w * h * min_area_ratio)
    boxes = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        area = bw * bh
        if area < min_area:
            continue
        # Skip full-page or nearly full-page boxes
        if bw > 0.95 * w and bh > 0.95 * h:
            continue
        x1 = max(0, x - pad_px)
        y1 = max(0, y - pad_px)
        x2 = min(w, x + bw + pad_px)
        y2 = min(h, y + bh + pad_px)
        boxes.append((x1, y1, x2, y2))

    boxes = non_max_suppression(boxes, iou_threshold=0.4)
    boxes = sorted(boxes, key=lambda b: (b[1], b[0]))
    return boxes[:max_regions]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    if len(sys.argv) < 2:
        sys.stderr.write("Usage: pix2tex_ocr.py <pdf_path>\n")
        sys.exit(1)

    pdf_path = sys.argv[1]
    max_pages = int(os.getenv("PIX2TEX_MAX_PAGES", "5"))
    dpi = int(os.getenv("PIX2TEX_DPI", "200"))
    min_area_ratio = float(os.getenv("PIX2TEX_MIN_AREA_RATIO", "0.002"))
    max_regions = int(os.getenv("PIX2TEX_MAX_REGIONS", "20"))
    pad_px = int(os.getenv("PIX2TEX_PAD_PX", "6"))

    poppler_path = os.getenv("PIX2TEX_POPPLER_PATH")
    try:
        pages = convert_from_path(
            pdf_path,
            dpi=dpi,
            first_page=1,
            last_page=max_pages,
            poppler_path=poppler_path if poppler_path else None,
        )
    except Exception as exc:
        sys.stderr.write(f"pdf2image failed: {exc}\n")
        sys.exit(1)

    ocr = LatexOCR()
    equations = []
    for page in pages:
        try:
            regions = detect_equation_regions(
                page, min_area_ratio=min_area_ratio, max_regions=max_regions, pad_px=pad_px
            )
            if not regions:
                latex = ocr(page)
                if latex:
                    equations.append(latex)
                continue

            for box in regions:
                x1, y1, x2, y2 = box
                crop = page.crop((x1, y1, x2, y2))
                latex = ocr(crop)
                if latex:
                    equations.append(latex)
        except Exception:
            continue

    print(json.dumps({"equations": equations}, ensure_ascii=False))


if __name__ == "__main__":
    main()
