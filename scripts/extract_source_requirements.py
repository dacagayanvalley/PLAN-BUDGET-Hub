from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pandas as pd
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-files"
OUT_DIR = ROOT / "docs" / "source-analysis"
OUT_FILE = OUT_DIR / "source-requirements.json"
MD_FILE = OUT_DIR / "source-requirements.md"

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}

PHASE_KEYWORDS = {
    "Proposal": ["proposal", "tier 1", "tier 2", "pip", "rdc", "cso", "convergence", "budget call"],
    "NEP": ["nep", "national expenditure program"],
    "GAA": ["gaa", "general appropriations act"],
    "BED": ["bed no. 2", "bed", "physical plan"],
    "Implementation": ["implementation", "procurement", "schedule"],
    "Monitoring": ["monitoring", "accomplishment", "mov", "performance"],
    "Reporting": ["form", "report", "annex", "matrix", "submission", "calendar"],
}

MODULE_KEYWORDS = {
    "Dashboard": ["dashboard", "summary", "performance", "target", "amount", "physical"],
    "Proposal Intake": ["proposal", "project", "activity", "municipality", "district", "commodity"],
    "Master Data Management": ["uacs", "pap", "office", "municipality", "object code", "indicator"],
    "Validation Engine": ["required", "validation", "readiness", "justification", "eligibility"],
    "Consolidation Engine": ["summary", "consolidated", "matrix", "province", "district", "program"],
    "Phase Tracking": ["nep", "gaa", "bed", "phase", "submission", "history"],
    "Form and Report Generator": ["bp form", "form", "annex", "export", "report"],
    "Attachments and MOV Repository": ["attachment", "endorsement", "minutes", "photo", "mov", "document"],
    "User Manual, Training and Help": ["guide", "training", "workflow", "instruction"],
}


def clean_text(value: object) -> str:
    text = "" if value is None else str(value)
    return re.sub(r"\s+", " ", text).strip()


def infer_phase(text: str) -> list[str]:
    low = text.lower()
    phases = [phase for phase, words in PHASE_KEYWORDS.items() if any(word in low for word in words)]
    return phases or ["Reporting"]


def infer_modules(text: str) -> list[str]:
    low = text.lower()
    modules = [module for module, words in MODULE_KEYWORDS.items() if any(word in low for word in words)]
    return modules or ["Form and Report Generator"]


def summarize_excel(path: Path) -> dict:
    xls = pd.ExcelFile(path)
    sheets = []
    all_text = [path.name]
    for sheet_name in xls.sheet_names[:12]:
        try:
            df = pd.read_excel(path, sheet_name=sheet_name, header=None, nrows=40)
        except Exception as exc:
            sheets.append({"name": sheet_name, "error": str(exc)})
            continue
        rows = []
        for row in df.fillna("").astype(str).values.tolist():
            cleaned = [clean_text(v) for v in row]
            if any(cleaned):
                rows.append(cleaned)
                all_text.extend(cleaned)
        likely_headers = []
        for row in rows[:15]:
            filled = [v for v in row if v]
            if len(filled) >= 3:
                likely_headers = filled[:30]
                break
        sheets.append(
            {
                "name": sheet_name,
                "rows_scanned": int(df.shape[0]),
                "columns_scanned": int(df.shape[1]),
                "likely_headers": likely_headers,
                "sample_rows": rows[:5],
            }
        )
    joined = " ".join(all_text)
    return {
        "file": str(path.relative_to(ROOT)),
        "type": "excel",
        "purpose": infer_purpose(path, joined),
        "phases": infer_phase(joined),
        "modules": infer_modules(joined),
        "sheets": sheets,
    }


def summarize_pdf(path: Path) -> dict:
    reader = PdfReader(str(path))
    page_texts = []
    for page in reader.pages[:10]:
        try:
            page_texts.append(clean_text(page.extract_text() or ""))
        except Exception:
            page_texts.append("")
    text = " ".join([path.name, *page_texts])
    fields = extract_terms(text)
    return {
        "file": str(path.relative_to(ROOT)),
        "type": "pdf",
        "purpose": infer_purpose(path, text),
        "phases": infer_phase(text),
        "modules": infer_modules(text),
        "pages": len(reader.pages),
        "key_terms": fields,
        "sample_text": page_texts[:3],
    }


def pptx_text(path: Path) -> list[dict]:
    slides = []
    with zipfile.ZipFile(path) as zf:
        slide_names = sorted(
            [n for n in zf.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")],
            key=lambda n: int(re.search(r"slide(\d+)\.xml", n).group(1)),
        )
        for slide_name in slide_names[:30]:
            root = ET.fromstring(zf.read(slide_name))
            texts = [clean_text(t.text) for t in root.findall(".//a:t", NS) if clean_text(t.text)]
            if texts:
                slides.append({"slide": slide_name, "text": texts[:40]})
    return slides


def summarize_pptx(path: Path) -> dict:
    slides = pptx_text(path)
    text = " ".join([path.name, json.dumps(slides, ensure_ascii=False)])
    return {
        "file": str(path.relative_to(ROOT)),
        "type": "powerpoint",
        "purpose": infer_purpose(path, text),
        "phases": infer_phase(text),
        "modules": infer_modules(text),
        "slides_scanned": len(slides),
        "sample_slides": slides[:8],
    }


def docx_text(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read("word/document.xml"))
    return [clean_text(t.text) for t in root.findall(".//w:t", NS) if clean_text(t.text)]


def summarize_docx(path: Path) -> dict:
    texts = docx_text(path)
    text = " ".join([path.name, *texts])
    return {
        "file": str(path.relative_to(ROOT)),
        "type": "word",
        "purpose": infer_purpose(path, text),
        "phases": infer_phase(text),
        "modules": infer_modules(text),
        "paragraphs_scanned": len(texts),
        "key_terms": extract_terms(text),
        "sample_text": texts[:80],
    }


def extract_terms(text: str) -> list[str]:
    patterns = [
        r"BP Form\s*\d+[A-Z]?",
        r"BED No\.\s*\d+",
        r"Tier\s*[12]",
        r"UACS",
        r"PAP",
        r"NEP",
        r"GAA",
        r"RDC",
        r"CSO",
        r"Climate",
        r"GEDSI",
        r"Program Convergence Budget",
        r"Public Investment Program",
    ]
    found = []
    for pattern in patterns:
        found.extend(re.findall(pattern, text, flags=re.I))
    return sorted(set(clean_text(v) for v in found))


def infer_purpose(path: Path, text: str) -> str:
    low_name = path.name.lower()
    low_text = text.lower()
    if "bed" in low_name:
        return "BED physical and financial planning template for GAA-stage targets."
    if "bp form 202" in low_name or "tier 2" in low_text:
        return "Tier 2 profile and NEP-stage support form/reference."
    if "endorsement" in low_name:
        return "Endorsement/MOV reference for proposal readiness and submission evidence."
    if "submission" in low_name or "calendar" in low_text:
        return "Submission requirements, budget preparation calendar, and routing reference."
    if "spatial" in low_name:
        return "Spatial budget detail table for municipality/district map-ready reporting."
    if "district" in low_name or "proposal" in low_name:
        return "District or provincial FY 2027 proposal intake workbook."
    if "guidelines" in low_name or "budget call" in low_text:
        return "Budget preparation policy, forms, validation, and process guidance."
    if "annex" in low_name:
        return "Annex/form template reference for report generation."
    if "fmr" in low_name:
        return "Farm-to-Market Road program budget proposal reference."
    return "Reference source for requirements, forms, or reporting structure."


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for path in sorted(SOURCE_DIR.rglob("*")):
        if not path.is_file() or path.name.startswith("~$"):
            continue
        suffix = path.suffix.lower()
        try:
            if suffix in {".xlsx", ".xls"}:
                records.append(summarize_excel(path))
            elif suffix == ".pdf":
                records.append(summarize_pdf(path))
            elif suffix == ".pptx":
                records.append(summarize_pptx(path))
            elif suffix == ".docx":
                records.append(summarize_docx(path))
            else:
                records.append({"file": str(path.relative_to(ROOT)), "type": suffix, "purpose": "Unparsed source file."})
        except Exception as exc:
            records.append({"file": str(path.relative_to(ROOT)), "type": suffix, "error": str(exc)})

    OUT_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = ["# Source Requirements Inventory", ""]
    for record in records:
        lines.append(f"## {record['file']}")
        lines.append(f"- Type: {record.get('type', 'unknown')}")
        lines.append(f"- Purpose: {record.get('purpose', 'Review source file')}")
        if record.get("phases"):
            lines.append(f"- Phases: {', '.join(record['phases'])}")
        if record.get("modules"):
            lines.append(f"- Modules: {', '.join(record['modules'])}")
        if record.get("key_terms"):
            lines.append(f"- Key terms: {', '.join(record['key_terms'])}")
        if record.get("sheets"):
            lines.append("- Extracted sheets/headers:")
            for sheet in record["sheets"][:8]:
                headers = ", ".join(sheet.get("likely_headers") or [])
                lines.append(f"  - {sheet.get('name')}: {headers or 'no clear header in first 40 rows'}")
        if record.get("sample_slides"):
            first = record["sample_slides"][0]
            lines.append(f"- Sample slide text: {' | '.join(first.get('text', [])[:8])}")
        if record.get("sample_text"):
            lines.append(f"- Sample text: {clean_text(' '.join(record['sample_text'])[:500])}")
        if record.get("error"):
            lines.append(f"- Extraction error: {record['error']}")
        lines.append("")
    MD_FILE.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
