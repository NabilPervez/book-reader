#!/usr/bin/env python3
"""
Turn books (PDF, EPUB, DOCX, HTML, TXT, Markdown) into the reader's JSON format.

    python3 scripts/import_books.py                 # import every new file in books/
    python3 scripts/import_books.py books/x.pdf     # import one file
    python3 scripts/import_books.py --force         # re-import everything
    python3 scripts/import_books.py --list          # show the library
    python3 scripts/import_books.py --remove <id>   # remove a book from the library

Options for a single import:
    --title "..." --author "..."    override the detected metadata
    --ocr auto|always|never         OCR scanned PDFs (needs: brew install tesseract)
    --lang eng                      OCR language, e.g. eng+fra
    --split auto|toc|headings|words:N
                                    how to cut the book into chapters (default auto)

Output (served by the app):
    public/library/index.json              list of books
    public/library/<book>/book.json        metadata + table of contents
    public/library/<book>/<chapter>.json   {id, title, blocks: [{t, text, page?}]}

Block types: p, h2, h3, quote, li (numbered, has n), bullet.
Inline: *italic* and **bold** are kept as Markdown-style markers.

Only PDF needs an extra package:  pip3 install pymupdf
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import statistics
import sys
import time
import unicodedata
import zipfile
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from posixpath import dirname as zdirname, join as zjoin, normpath as znormpath
from urllib.parse import unquote
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "books"
LIB_DIR = ROOT / "public" / "library"
INDEX = LIB_DIR / "index.json"
FORMATS = {".pdf", ".epub", ".docx", ".html", ".htm", ".xhtml", ".txt", ".md", ".markdown"}
MIN_CHAPTER_WORDS = 40      # smaller sections are merged into a neighbour
WORDS_PER_CHUNK = 3500      # fallback chapter size when a book has no structure


# ── text helpers ────────────────────────────────────────────────────────────────
LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st"}


def clean(s: str) -> str:
    for k, v in LIGATURES.items():
        s = s.replace(k, v)
    s = s.replace("­", "").replace("​", "").replace("﻿", "").replace("\xa0", " ")
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    return s.strip()


def slugify(s: str, fallback: str = "item", maxlen: int = 60) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return (s[:maxlen].rstrip("-") or fallback)


def words(s: str) -> int:
    return len(s.split())


def same_title(a: str, b: str) -> bool:
    """A heading that repeats (or is part of) the chapter title, e.g. 'Chapter 3' vs 'Chapter 3: Rain'."""
    a, b = slugify(a, ""), slugify(b, "")
    return bool(a and b) and (a in b or b in a)


def title_case_if_shouting(s: str) -> str:
    letters = [c for c in s if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.8 and len(letters) > 3:
        small = {"a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "at", "by", "with"}
        out = []
        for i, w in enumerate(s.split()):
            if re.fullmatch(r"[IVXLC]+[.:]?", w):
                out.append(w)                      # roman numerals
            else:
                w = w.lower()
                out.append(w if i and w in small else w[:1].upper() + w[1:])
        s = " ".join(out)
    return s


CHAPTER_RE = re.compile(
    r"^(chapter|part|book|section|prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix)\b"
    r"|^(\d{1,3}|[ivxlc]{1,7})[.:)]?\s+[A-Z]",
    re.I,
)


# ── the book model ─────────────────────────────────────────────────────────────
class Book:
    def __init__(self, title="", author=""):
        self.title = title
        self.author = author
        self.chapters: list[dict] = []   # {title, blocks}

    def start(self, title):
        title = re.sub(r"(?<![.])\.$", "", clean(title).replace("*", ""))
        title = re.sub(r"^(CHAPTER|PART|BOOK|SECTION)\b", lambda m: m[1].title(), title)
        self.chapters.append({"title": title or f"Section {len(self.chapters) + 1}", "blocks": []})

    def add(self, block):
        text = clean(block.get("text", ""))
        if not text:
            return
        block["text"] = text
        if not self.chapters:
            self.start("Opening")
        self.chapters[-1]["blocks"].append(block)

    def tidy(self):
        """Drop empty chapters and fold tiny ones (title pages, dedications) into the next."""
        out = []
        carry = []
        for ch in self.chapters:
            n = sum(words(b["text"]) for b in ch["blocks"])
            t = ch["title"].strip().lower()
            if n == 0 or re.fullmatch(r"(table of )?contents", t) or re.search(r"project gutenberg.*licen[cs]e", t):
                continue
            if n < MIN_CHAPTER_WORDS and ch is not self.chapters[-1]:
                carry.extend(ch["blocks"])
                continue
            ch["blocks"] = carry + ch["blocks"]
            carry = []
            out.append(ch)
        if carry:
            if out:
                out[-1]["blocks"].extend(carry)
            else:
                out.append({"title": "Opening", "blocks": carry})
        self.chapters = out

    def chunk_if_flat(self):
        """A book with one giant chapter is hard to navigate: cut it at paragraph boundaries."""
        if len(self.chapters) != 1:
            return
        blocks = self.chapters[0]["blocks"]
        if sum(words(b["text"]) for b in blocks) < WORDS_PER_CHUNK * 1.5:
            return
        self.chapters = []
        cur, n = [], 0
        for b in blocks:
            cur.append(b)
            n += words(b["text"])
            if n >= WORDS_PER_CHUNK and b["t"] in ("p", "quote"):
                self.chapters.append({"title": f"Part {len(self.chapters) + 1}", "blocks": cur})
                cur, n = [], 0
        if cur:
            self.chapters.append({"title": f"Part {len(self.chapters) + 1}", "blocks": cur})


# ── HTML → blocks (used by EPUB and HTML) ──────────────────────────────────────
class HtmlBlocks(HTMLParser):
    """Collects block-level text from (X)HTML, keeping italics/bold as *markers*."""
    BLOCKS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "dd", "dt", "td", "figcaption", "section", "article"}
    SKIP = {"script", "style", "head", "title", "nav", "svg", "math", "sup"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.buf = []
        self.kind = "p"
        self.skip = 0
        self.quote = 0
        self.lists = []   # stack of ["ol"|"ul", counter]
        self.ids = []     # anchors seen since the last block (for TOC fragment links)

    def flush(self):
        text = clean("".join(self.buf))
        text = re.sub(r"\*\s*\*", "", text).strip()
        if text:
            kind = self.kind
            if kind == "p" and self.quote:
                kind = "quote"
            block = {"t": kind, "text": text}
            if kind == "li":
                block["n"] = self.lists[-1][1] if self.lists else 1
            if self.ids:
                block["ids"] = self.ids
                self.ids = []
            self.blocks.append(block)
        self.buf = []
        self.kind = "p"

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        if tag in self.SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "br":
            self.buf.append(" ")
        elif tag in ("em", "i", "cite"):
            self.buf.append("*")
        elif tag in ("strong", "b"):
            self.buf.append("**")
        elif tag in ("ol", "ul"):
            self.flush()
            start = int(a.get("start", "1")) if str(a.get("start", "1")).isdigit() else 1
            self.lists.append([tag, start - 1])
        elif tag in self.BLOCKS:
            self.flush()
            if tag == "blockquote":
                self.quote += 1
            elif tag[0] == "h" and tag[1:].isdigit():
                self.kind = {"1": "h1", "2": "h2"}.get(tag[1], "h3")
            elif tag == "li":
                if self.lists:
                    self.lists[-1][1] += 1
                self.kind = "li" if self.lists and self.lists[-1][0] == "ol" else "bullet"

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ("em", "i", "cite"):
            self.buf.append("*")
        elif tag in ("strong", "b"):
            self.buf.append("**")
        elif tag in ("ol", "ul"):
            self.flush()
            if self.lists:
                self.lists.pop()
        elif tag in self.BLOCKS:
            self.flush()
            if tag == "blockquote":
                self.quote = max(0, self.quote - 1)

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data.replace("\n", " "))

    def close(self):
        super().close()
        self.flush()
        return self.blocks


def html_to_blocks(markup: str) -> list[dict]:
    p = HtmlBlocks()
    p.feed(markup)
    return p.close()


def blocks_into_book(book: Book, blocks: list[dict], heading_levels=("h1",)):
    """Headings at `heading_levels` start chapters, other headings stay inside."""
    for b in blocks:
        if b["t"] in heading_levels:
            book.start(title_case_if_shouting(b["text"]))
        else:
            b.pop("ids", None)
            book.add(b)


def pick_chapter_level(blocks: list[dict]) -> tuple[str, ...]:
    for lvl in ("h1", "h2"):
        if sum(b["t"] == lvl for b in blocks) >= 2:
            return (lvl,)
    return ("h1",)


# ── TXT / Markdown ─────────────────────────────────────────────────────────────
def read_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def parse_markdown(src: str) -> list[dict]:
    blocks, cur = [], None

    def flush():
        nonlocal cur
        if cur:
            blocks.append(cur)
        cur = None

    for raw in src.splitlines():
        line = raw.strip()
        if not line or re.fullmatch(r"[-*_=]{3,}", line):
            flush()
            continue
        if m := re.match(r"^(#{1,6})\s+(.*?)\s*#*$", line):
            flush()
            blocks.append({"t": {1: "h1", 2: "h2"}.get(len(m[1]), "h3"), "text": m[2]})
        elif m := re.match(r"^(\d+)[.)]\s+(.*)$", line):
            flush()
            blocks.append({"t": "li", "n": int(m[1]), "text": m[2]})
        elif m := re.match(r"^[-*+•]\s+(.*)$", line):
            flush()
            blocks.append({"t": "bullet", "text": m[1]})
        elif m := re.match(r"^>\s?(.*)$", line):
            if cur and cur["t"] == "quote":
                cur["text"] += " " + m[1]
            else:
                flush()
                cur = {"t": "quote", "text": m[1]}
        elif cur and cur["t"] == "p":
            cur["text"] += " " + line
        else:
            flush()
            cur = {"t": "p", "text": line}
    flush()
    for b in blocks:  # strip links/images, keep their text
        b["text"] = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", b["text"])
        b["text"] = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", b["text"])
        b["text"] = b["text"].replace("__", "**")
    return blocks


def plain_text_to_markdown(src: str) -> str:
    """Plain .txt: mark likely chapter headings (short lines like 'CHAPTER IV' or 'Part Two')."""
    out = []
    lines = src.splitlines()
    for i, raw in enumerate(lines):
        line = raw.strip()
        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i + 1 >= len(lines) or not lines[i + 1].strip()
        looks_like_heading = not line.endswith(",") and (not line.endswith(".") or words(line) <= 4)
        if line and prev_blank and next_blank and len(line) < 80 and CHAPTER_RE.match(line) and looks_like_heading:
            out.append("# " + line)
        else:
            out.append(raw)
    return "\n".join(out)


def import_text(path: Path, split: str) -> Book:
    src = read_text_file(path).replace("\r\n", "\n")
    # Project Gutenberg boilerplate and illustration markers
    if m := re.search(r"^\*\*\* ?START OF.*?\*\*\*$(.*?)^\*\*\* ?END OF", src, re.S | re.M):
        src = m[1]
    src = re.sub(r"\[Illustration[^\]]*\]", "", src)
    if path.suffix.lower() == ".txt":
        src = plain_text_to_markdown(src)
    blocks = parse_markdown(src)
    book = Book()
    if blocks and blocks[0]["t"] == "h1" and sum(b["t"] == "h1" for b in blocks) == 1 and any(b["t"] == "h2" for b in blocks):
        book.title = blocks.pop(0)["text"]   # a single H1 is the book title
    blocks_into_book(book, blocks, pick_chapter_level(blocks))
    return book


# ── HTML ───────────────────────────────────────────────────────────────────────
def import_html(path: Path, split: str) -> Book:
    markup = read_text_file(path)
    book = Book()
    if m := re.search(r"<title[^>]*>(.*?)</title>", markup, re.S | re.I):
        book.title = clean(html.unescape(re.sub(r"<[^>]+>", "", m[1])))
    blocks = html_to_blocks(markup)
    blocks_into_book(book, blocks, pick_chapter_level(blocks))
    return book


# ── EPUB ───────────────────────────────────────────────────────────────────────
def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find_all(root, name):
    return [el for el in root.iter() if _local(el.tag) == name]


def import_epub(path: Path, split: str) -> Book:
    z = zipfile.ZipFile(path)
    names = set(z.namelist())
    container = ET.fromstring(z.read("META-INF/container.xml"))
    opf_path = next(el.get("full-path") for el in _find_all(container, "rootfile"))
    opf_dir = zdirname(opf_path)
    opf = ET.fromstring(z.read(opf_path))

    def resolve(base_dir, href):
        return znormpath(zjoin(base_dir, unquote(href.split("#")[0]))) if href else ""

    book = Book()
    for el in opf.iter():
        tag = _local(el.tag)
        if tag == "title" and not book.title and el.text:
            book.title = clean(el.text)
        elif tag == "creator" and not book.author and el.text:
            book.author = clean(el.text)

    manifest = {}
    nav_href = ncx_href = None
    for item in _find_all(opf, "item"):
        manifest[item.get("id")] = item
        if "nav" in (item.get("properties") or "").split():
            nav_href = resolve(opf_dir, item.get("href"))
        if item.get("media-type") == "application/x-dtbncx+xml":
            ncx_href = resolve(opf_dir, item.get("href"))
    spine = []
    for ref in _find_all(opf, "itemref"):
        item = manifest.get(ref.get("idref"))
        if item is not None and ref.get("linear") != "no" and "html" in (item.get("media-type") or ""):
            spine.append(resolve(opf_dir, item.get("href")))

    # Table of contents: (file, fragment) -> label, in reading order
    toc: list[tuple[str, str, str]] = []
    if nav_href and nav_href in names:
        nav = z.read(nav_href).decode("utf-8", "replace")
        m = re.search(r'<nav[^>]*epub:type="toc"[^>]*>(.*?)</nav>', nav, re.S) or re.search(r"<nav[^>]*>(.*?)</nav>", nav, re.S)
        if m:
            for href, label in re.findall(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', m[1], re.S):
                label = clean(html.unescape(re.sub(r"<[^>]+>", " ", label)))
                toc.append((resolve(zdirname(nav_href), href), href.split("#")[1] if "#" in href else "", label))
    if not toc and ncx_href and ncx_href in names:
        ncx = ET.fromstring(z.read(ncx_href))
        for np in _find_all(ncx, "navPoint"):
            label_el = next(iter(_find_all(np, "text")), None)
            content = next(iter(_find_all(np, "content")), None)
            if content is not None:
                src = content.get("src", "")
                toc.append((resolve(zdirname(ncx_href), src), src.split("#")[1] if "#" in src else "", clean(label_el.text or "") if label_el is not None else ""))

    starts: dict[str, list[tuple[str, str]]] = {}
    for f, frag, label in toc:
        if label:
            starts.setdefault(f, []).append((frag, label))

    use_toc = split in ("auto", "toc") and len(toc) >= 2
    for href in spine:
        if href not in names:
            continue
        blocks = html_to_blocks(z.read(href).decode("utf-8", "replace"))
        if not blocks:
            continue
        if use_toc:
            entries = starts.get(href, [])
            whole_file = [lbl for frag, lbl in entries if not frag]
            frag_map = {frag: lbl for frag, lbl in entries if frag}
            if whole_file:
                book.start(whole_file[0])
            elif not book.chapters:
                book.start("Opening")
            for b in blocks:
                hit = next((frag_map.pop(i) for i in b.get("ids", []) if i in frag_map), None)
                if hit:
                    book.start(hit)
                b.pop("ids", None)
                # the chapter's own heading duplicates its title
                if b["t"] in ("h1", "h2") and book.chapters and not book.chapters[-1]["blocks"] \
                        and same_title(b["text"], book.chapters[-1]["title"]):
                    continue
                if b["t"] == "h1":
                    b["t"] = "h2"
                book.add(b)
        else:
            heading = next((b for b in blocks[:4] if b["t"] in ("h1", "h2")), None)
            book.start(heading["text"] if heading else f"Section {len(book.chapters) + 1}")
            for b in blocks:
                b.pop("ids", None)
                if b is heading:
                    continue
                if b["t"] == "h1":
                    b["t"] = "h2"
                book.add(b)
    return book


# ── DOCX ───────────────────────────────────────────────────────────────────────
def import_docx(path: Path, split: str) -> Book:
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    z = zipfile.ZipFile(path)
    doc = ET.fromstring(z.read("word/document.xml"))
    book = Book()
    try:
        core = ET.fromstring(z.read("docProps/core.xml"))
        for el in core.iter():
            if _local(el.tag) == "title" and el.text:
                book.title = clean(el.text)
            if _local(el.tag) == "creator" and el.text:
                book.author = clean(el.text)
    except KeyError:
        pass
    blocks = []
    counters = Counter()
    for p in doc.iter(W + "p"):
        style_el = p.find(f"{W}pPr/{W}pStyle")
        style = (style_el.get(W + "val") if style_el is not None else "") or ""
        numbered = p.find(f"{W}pPr/{W}numPr") is not None
        parts = []
        for r in p.iter(W + "r"):
            t = "".join(x.text or "" for x in r.iter(W + "t"))
            if not t:
                if r.find(W + "tab") is not None:
                    parts.append(" ")
                continue
            rpr = r.find(W + "rPr")
            ital = rpr is not None and rpr.find(W + "i") is not None
            bold = rpr is not None and rpr.find(W + "b") is not None
            if ital and t.strip():
                t = f"*{t}*"
            elif bold and t.strip():
                t = f"**{t}**"
            parts.append(t)
        text = clean("".join(parts))
        if not text:
            continue
        s = style.lower()
        if s in ("title",) and not book.title:
            book.title = text.replace("*", "")
            continue
        if m := re.match(r"heading\s*(\d)", s.replace("berschrift", "heading")):
            blocks.append({"t": {1: "h1", 2: "h2"}.get(int(m[1]), "h3"), "text": text.replace("*", "")})
        elif "quote" in s:
            blocks.append({"t": "quote", "text": text})
        elif numbered or "list" in s:
            if "bullet" in s or not numbered:
                blocks.append({"t": "bullet", "text": text})
            else:
                counters[s] += 1
                blocks.append({"t": "li", "n": counters[s], "text": text})
        else:
            counters.clear()
            blocks.append({"t": "p", "text": text})
    blocks_into_book(book, blocks, pick_chapter_level(blocks))
    return book


# ── PDF ────────────────────────────────────────────────────────────────────────
def text_quality(sample: str) -> float:
    """Share of word-like tokens; garbage OCR layers score low."""
    toks = sample.split()
    if len(toks) < 50:
        return 0.0
    good = sum(1 for t in toks if re.fullmatch(r"[\"'“‘(\[]*[A-Za-z\u00C0-\u024F\u0600-\u06FF][\w'’\-]*[.,;:!?\"'”’)\]]*", t))
    return good / len(toks)


ocr = "auto"        # auto | always | never   (set from --ocr)
ocr_lang = "eng"


def import_pdf(path: Path, split: str) -> Book:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        sys.exit("PDF support needs PyMuPDF:  pip3 install pymupdf")

    doc = fitz.open(path)
    meta = doc.metadata or {}
    book = Book(clean(meta.get("title") or ""), clean(meta.get("author") or ""))
    n_pages = len(doc)

    # Scanned books often have no text layer, or a garbage one from a bad OCR pass.
    sample = "".join(doc[i].get_text() for i in range(0, n_pages, max(1, n_pages // 25)))
    use_ocr = ocr == "always" or (ocr == "auto" and text_quality(sample) < 0.75)
    if use_ocr:
        if not shutil.which("tesseract"):
            print("  ! This PDF looks scanned (little or unreadable text). Install OCR and re-run:")
            print("      brew install tesseract")
            use_ocr = False
        else:
            print(f"  scanned PDF — running OCR on {n_pages} pages (this takes a while)…")

    # 1. Lines with their font size / position
    pages = []   # per page: list of line dicts
    for pno in range(n_pages):
        page = doc[pno]
        height, width = page.rect.height, page.rect.width
        lines = []
        tp = None
        if use_ocr:
            tp = page.get_textpage_ocr(flags=fitz.TEXT_PRESERVE_WHITESPACE, language=ocr_lang, dpi=300, full=True)
            if (pno + 1) % 25 == 0:
                print(f"    OCR {pno + 1}/{n_pages}")
        for blk in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE, textpage=tp)["blocks"]:
            if blk.get("type") != 0:
                continue
            for ln in blk["lines"]:
                if abs(ln.get("dir", (1, 0))[1]) > 0.1:   # rotated text (margins, watermarks)
                    continue
                spans = [s for s in ln["spans"] if s["text"].strip()]
                if not spans:
                    continue
                text = ""
                for s in spans:
                    t = s["text"]
                    is_italic = bool(s["flags"] & 2) or "italic" in s["font"].lower() or "oblique" in s["font"].lower()
                    if is_italic and t.strip() and len(spans) > 1:
                        lead, core, trail = re.match(r"^(\s*)(.*?)(\s*)$", t, re.S).groups()
                        t = f"{lead}*{core}*{trail}"
                    text += t
                text = clean(text).replace("* *", " ")
                if not text:
                    continue
                size = max(spans, key=lambda s: len(s["text"]))["size"]
                bold = all((s["flags"] & 16) or "bold" in s["font"].lower() for s in spans)
                x0, y0, x1, y1 = ln["bbox"]
                lines.append({"text": text, "size": round(size, 1), "bold": bold, "x0": x0, "x1": x1,
                              "y0": y0, "y1": y1, "page": pno + 1, "h": height, "w": width})
        lines.sort(key=lambda l: (round(l["y0"] / 3), l["x0"]))
        pages.append(lines)

    if not any(pages):
        return book

    # 2. Running headers / footers / page numbers
    edge = Counter()
    for p in pages:
        seen = set()
        for l in p:
            if l["y0"] < l["h"] * 0.09 or l["y1"] > l["h"] * 0.91:
                key = re.sub(r"\d+", "#", l["text"].lower()).strip()
                if key not in seen:
                    edge[key] += 1
                    seen.add(key)
    repeat_limit = max(3, n_pages * 0.2)

    def is_furniture(l):
        if re.fullmatch(r"[\divxlcIVXLC\s.\-–—|/]*(page\s*\d+)?[\s.\-–—]*", l["text"], re.I) and len(l["text"]) < 12:
            return True
        if l["y0"] < l["h"] * 0.09 or l["y1"] > l["h"] * 0.91:
            return edge[re.sub(r"\d+", "#", l["text"].lower()).strip()] >= repeat_limit
        return False

    body = [l for p in pages for l in p if not is_furniture(l)]
    if not body:
        return book
    size_weight = Counter()
    for l in body:
        size_weight[l["size"]] += len(l["text"])
    body_size = size_weight.most_common(1)[0][0]
    left_margin = statistics.median(l["x0"] for l in body if l["size"] == body_size)
    right_edge = statistics.median(l["x1"] for l in body if l["size"] == body_size)
    col_width = max(1.0, right_edge - left_margin)
    gaps = [b["y0"] - a["y1"] for a, b in zip(body, body[1:])
            if a["page"] == b["page"] and a["size"] == body_size == b["size"] and 0 <= b["y0"] - a["y1"] < body_size * 2]
    line_gap = statistics.median(gaps) if gaps else body_size * 0.3

    def heading_level(l):
        t = l["text"]
        if len(t) > 140 or t.endswith((",", ";")) or words(t) > 20:
            return None
        if l["size"] >= body_size * 1.45:
            return "h1"
        if l["size"] >= body_size * 1.15:
            return "h2"
        if l["bold"] and l["size"] >= body_size * 0.98 and words(t) <= 12 and not t.endswith("."):
            return "h3"
        return None

    # 3. Lines -> blocks
    blocks: list[dict] = []
    cur = None
    prev = None

    def flush():
        nonlocal cur
        if cur:
            blocks.append(cur)
        cur = None

    for l in body:
        if l["size"] < body_size * 0.72:     # footnote markers, tiny captions
            continue
        lvl = heading_level(l)
        text = l["text"]
        if lvl:
            if cur and cur["t"] == lvl and prev and prev["page"] == l["page"] and l["y0"] - prev["y1"] < l["size"]:
                cur["text"] += " " + text      # heading wrapped over two lines
            else:
                flush()
                cur = {"t": lvl, "text": text, "page": l["page"], "size": l["size"]}
            prev = l
            continue

        bullet = re.match(r"^([•▪●◦‣∙·–-]|\d{1,3}[.)])\s+(.*)$", text)
        indented = l["x0"] - left_margin
        new_para = (
            cur is None
            or cur["t"] in ("h1", "h2", "h3")
            or bullet is not None
            or prev is None
            or (prev["page"] == l["page"] and l["y0"] - prev["y1"] > line_gap + body_size * 0.6)
            or (indented > body_size * 0.8 and indented < col_width * 0.3 and cur["t"] == "p" and prev["x0"] - left_margin < body_size * 0.5)
            or (prev["x1"] < left_margin + col_width * 0.78 and re.search(r"[.!?:\"”’)]$", prev["text"]))
        )
        is_quote = indented > body_size * 1.5 and l["x1"] < right_edge - body_size * 1.5 and not bullet
        if cur and cur["t"] == "quote" and is_quote and not bullet and not (prev and prev["page"] == l["page"] and l["y0"] - prev["y1"] > line_gap + body_size * 0.6):
            new_para = False
        if new_para:
            flush()
            if bullet:
                mark, rest = bullet.groups()
                cur = ({"t": "li", "n": int(mark[:-1]), "text": rest, "page": l["page"]} if mark[0].isdigit()
                       else {"t": "bullet", "text": rest, "page": l["page"]})
            else:
                cur = {"t": "quote" if is_quote else "p", "text": text, "page": l["page"]}
        else:
            if cur["text"].endswith("-") and not cur["text"].endswith(" -") and text[:1].islower():
                cur["text"] = cur["text"][:-1] + text      # de-hyphenate
            else:
                cur["text"] += " " + text
        prev = l
    flush()

    # Paragraphs that run across a page break
    merged = []
    for b in blocks:
        last = merged[-1] if merged else None
        if (last and b["t"] == "p" and last["t"] == "p" and b["page"] == last["page"] + 1
                and not re.search(r"[.!?\"”’:]\*?$", last["text"]) and b["text"][:1].islower()):
            if last["text"].endswith("-"):
                last["text"] = last["text"][:-1] + b["text"]
            else:
                last["text"] += " " + b["text"]
        else:
            merged.append(b)
    blocks = merged

    # 4. Chapters: the PDF outline if it has one, otherwise big headings
    toc = doc.get_toc(simple=True) if split in ("auto", "toc") else []
    chosen = []
    if toc:
        by_level = Counter(lvl for lvl, _, _ in toc)
        level = min(by_level)
        if by_level[level] < 3 and len(by_level) > 1:
            level = sorted(by_level)[1]
        chosen = [(clean(t), p) for lvl, t, p in toc if lvl == level and p >= 1 and clean(t)]
    if len(chosen) >= 2:
        print(f"  using the PDF outline ({len(chosen)} chapters)")
        chosen.sort(key=lambda x: x[1])
        ci = -1
        for b in blocks:
            while ci + 1 < len(chosen) and b["page"] >= chosen[ci + 1][1]:
                ci += 1
                book.start(chosen[ci][0])
            if ci < 0 and not book.chapters:
                book.start("Front matter")
            if b["t"] in ("h1", "h2") and book.chapters and not book.chapters[-1]["blocks"] \
                    and same_title(b["text"], book.chapters[-1]["title"]):
                continue    # the printed chapter heading repeats the outline title
            b.pop("size", None)
            if b["t"] == "h1":
                b["t"] = "h2"
            book.add(b)
    else:
        h1s = [b for b in blocks if b["t"] == "h1"]
        pattern_hits = [b for b in blocks if b["t"] in ("h1", "h2") and CHAPTER_RE.match(b["text"])]
        if len(pattern_hits) >= 3:
            starts = {id(b) for b in pattern_hits}
        elif len(h1s) >= 2:
            starts = {id(b) for b in h1s}
        else:
            starts = {id(b) for b in blocks if b["t"] == "h2"} if sum(b["t"] == "h2" for b in blocks) >= 3 else set()
        print(f"  no PDF outline — found {len(starts)} chapter headings")
        pending_title = None
        for b in blocks:
            if id(b) in starts:
                book.start(title_case_if_shouting(b["text"]))
                pending_title = b["text"] if re.fullmatch(r"(chapter|part)\s+\S+", b["text"], re.I) else None
                continue
            if pending_title and b["t"] in ("h1", "h2") and not book.chapters[-1]["blocks"]:
                book.chapters[-1]["title"] = f"{title_case_if_shouting(pending_title)}: {title_case_if_shouting(b['text'])}"
                pending_title = None
                continue
            pending_title = None
            b.pop("size", None)
            if b["t"] == "h1":
                b["t"] = "h2"
            book.add(b)
    return book


IMPORTERS = {
    ".pdf": import_pdf, ".epub": import_epub, ".docx": import_docx,
    ".html": import_html, ".htm": import_html, ".xhtml": import_html,
    ".txt": import_text, ".md": import_text, ".markdown": import_text,
}


# ── library ────────────────────────────────────────────────────────────────────
def load_index() -> list[dict]:
    try:
        return json.loads(INDEX.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_index(index: list[dict]):
    LIB_DIR.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")


def file_hash(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def guess_from_filename(path: Path) -> tuple[str, str]:
    """'Author Name - Book Title.pdf' or 'Book_Title.pdf'."""
    stem = re.sub(r"[_]+", " ", path.stem).strip()
    stem = re.sub(r"\s*[\(\[].*?(z-lib|libgen|ebook|pdf|epub).*?[\)\]]", "", stem, flags=re.I)
    if " - " in stem:
        a, b = stem.split(" - ", 1)
        return b.strip(), a.strip()
    return stem, ""


BAD_TITLES = re.compile(r"^(untitled|microsoft word|document\d*|book\d*|unknown|title)\b|\.(docx?|pdf|indd|qxd)$", re.I)


def import_file(path: Path, split="auto", title=None, author=None) -> dict | None:
    ext = path.suffix.lower()
    print(f"→ {path.name}")
    book = IMPORTERS[ext](path, split)
    book.tidy()
    if split.startswith("words:") or (split == "auto" and len(book.chapters) == 1):
        global WORDS_PER_CHUNK
        if split.startswith("words:"):
            WORDS_PER_CHUNK = int(split.split(":")[1])
            book.chapters = [{"title": "All", "blocks": [b for c in book.chapters for b in c["blocks"]]}]
        book.chunk_if_flat()
    if not book.chapters:
        print("  ✗ no readable text found — skipped")
        return None

    fn_title, fn_author = guess_from_filename(path)
    if not book.title or BAD_TITLES.search(book.title) or len(book.title) < 2:
        book.title = fn_title
    if not book.author:
        book.author = fn_author
    book.title = title or title_case_if_shouting(book.title)
    book.author = author if author is not None else book.author

    book_id = slugify(book.title, "book", 50)
    index = load_index()
    existing = next((b for b in index if b.get("source") == path.name), None)
    if existing:
        book_id = existing["id"]
    elif any(b["id"] == book_id for b in index):
        book_id = f"{book_id}-{file_hash(path)[:6]}"

    out = LIB_DIR / book_id
    if out.exists():
        for f in out.glob("*.json"):
            f.unlink()
    out.mkdir(parents=True, exist_ok=True)

    toc, used, total_words = [], set(), 0
    for i, ch in enumerate(book.chapters, 1):
        cid = f"{i:03d}-{slugify(ch['title'], 'chapter', 40)}"
        while cid in used:
            cid += "-x"
        used.add(cid)
        n = sum(words(b["text"]) for b in ch["blocks"])
        total_words += n
        blocks = [{k: v for k, v in b.items() if k in ("t", "text", "n", "page")} for b in ch["blocks"]]
        (out / f"{cid}.json").write_text(json.dumps({"id": cid, "title": ch["title"], "blocks": blocks}, ensure_ascii=False))
        toc.append({"id": cid, "number": i, "title": ch["title"], "words": n})

    entry = {
        "id": book_id,
        "title": book.title,
        "author": book.author,
        "format": ext.lstrip("."),
        "source": path.name,
        "hash": file_hash(path),
        "chapters": len(toc),
        "words": total_words,
        "addedAt": existing.get("addedAt") if existing else datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out / "book.json").write_text(json.dumps({**entry, "toc": toc}, ensure_ascii=False, indent=1))
    index = [b for b in index if b["id"] != book_id] + [entry]
    save_index(index)
    mins = round(total_words / 230)
    print(f"  ✓ “{book.title}”{' by ' + book.author if book.author else ''}: {len(toc)} chapters, {total_words:,} words (~{mins // 60}h {mins % 60}m)")
    print(f"    → public/library/{book_id}/")
    return entry


def remove_book(book_id: str):
    index = load_index()
    if not any(b["id"] == book_id for b in index):
        sys.exit(f"No book with id {book_id!r}. Try --list.")
    out = LIB_DIR / book_id
    if out.exists():
        for f in out.glob("*.json"):
            f.unlink()
        out.rmdir()
    save_index([b for b in index if b["id"] != book_id])
    print(f"Removed {book_id}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--force", action="store_true", help="re-import files that are already in the library")
    ap.add_argument("--title")
    ap.add_argument("--author")
    ap.add_argument("--split", default="auto", help="auto | toc | headings | words:N")
    ap.add_argument("--ocr", default="auto", choices=["auto", "always", "never"], help="OCR scanned PDFs (needs tesseract)")
    ap.add_argument("--lang", default="eng", help="OCR language(s), e.g. eng or eng+ara")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--remove", metavar="ID")
    args = ap.parse_args()
    global ocr, ocr_lang
    ocr, ocr_lang = args.ocr, args.lang

    if args.list:
        for b in load_index():
            print(f"{b['id']:<45} {b['chapters']:>4} ch  {b['words']:>8,} words  {b['format']:<5} {b['source']}")
        return
    if args.remove:
        return remove_book(args.remove)

    files = args.files or sorted(p for p in BOOKS_DIR.iterdir() if p.suffix.lower() in FORMATS) if (args.files or BOOKS_DIR.exists()) else []
    if not files:
        print(f"No books found. Put a PDF/EPUB/DOCX/TXT/MD/HTML file in {BOOKS_DIR.relative_to(ROOT)}/ and run again.")
        return
    if (args.title or args.author) and len(files) > 1:
        sys.exit("--title/--author only work when importing a single file.")

    index = {b.get("source"): b for b in load_index()}
    done = 0
    t0 = time.time()
    for f in files:
        if not f.exists():
            print(f"✗ {f} not found")
            continue
        if f.suffix.lower() not in FORMATS:
            print(f"✗ {f.name}: unsupported format (supported: {', '.join(sorted(FORMATS))})")
            continue
        prev = index.get(f.name)
        if prev and prev.get("hash") == file_hash(f) and not args.force and not args.files:
            print(f"· {f.name} already imported (use --force to redo)")
            continue
        if import_file(f, args.split, args.title, args.author):
            done += 1
    if done:
        print(f"\nImported {done} book{'s' if done != 1 else ''} in {time.time() - t0:.1f}s. Run `npm run dev` to read.")


if __name__ == "__main__":
    main()
