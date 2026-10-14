# Book Reader

A distraction-free reader built for focus. Drop in a PDF or ebook, convert it once, and read it
**one passage at a time**: no page clutter, no scrolling wall of text. It was built for ADHD brains,
but it works for anyone who wants to stay locked in.

## Features

- **Focus mode** shows one paragraph per screen. Move with swipe, ← →, space, or j / k. Shows time left in the chapter.
- **Page mode** scrolls through the whole chapter, and remembers where you stopped.
- **Imports PDF, EPUB, DOCX, HTML, TXT and Markdown.** Chapters come from the book's own table of
  contents when it has one, otherwise from its headings.
- **OCR for scanned PDFs**, run automatically when tesseract is installed.
- **Notes and favourites on any passage**, plus a per-chapter summary (key takeaways, how you'll use it,
  open questions). Everything is in a **Notes** tab, filtered per book, with export to Markdown or JSON.
- **Bionic reading**: an optional bold on the start of each word to guide the eye.
- **Focus session timer** (10–60 min) that plays a soft chime when you're done.
- Library with progress per book, "continue reading", and reading-time estimates.
- Light, dark and sepia themes, adjustable text size.
- Installable PWA that works offline. All data stays on your device.

## Quick start

```bash
npm run setup          # npm install + pip3 install pymupdf
cp ~/Downloads/some-book.pdf books/
npm run import         # converts everything new in books/
npm run dev            # open http://localhost:5173
```

A public-domain sample (*Alice's Adventures in Wonderland*) is included so the app isn't empty
on first run. Remove it with `python3 scripts/import_books.py --remove alice-s-adventures-in-wonderland`.

### With Claude Code

Clone the repo, put a book in `books/`, and say *"import the new book"*. `CLAUDE.md` tells Claude
how to run the converter, check the chapters and text, and fix anything that came out wrong.

## Import options

```bash
python3 scripts/import_books.py books/x.pdf --title "Real Title" --author "Name"
python3 scripts/import_books.py --force           # redo everything
python3 scripts/import_books.py books/x.pdf --split words:3000   # no usable chapters? cut evenly
python3 scripts/import_books.py books/scan.pdf --ocr always --lang eng+ara
npm run books                                     # list the library
python3 scripts/import_books.py --remove <id>
```

| Format | How chapters are found |
| --- | --- |
| EPUB | the book's table of contents (nav / NCX), otherwise one chapter per file |
| PDF | the PDF outline (bookmarks), otherwise large or "Chapter N" headings, otherwise even chunks |
| DOCX | Heading 1 (or Heading 2) styles |
| HTML / Markdown | `<h1>` / `#` headings (or `<h2>` / `##` if there's only one H1) |
| TXT | lines like `CHAPTER IV` or `Part Two` set apart by blank lines. Project Gutenberg boilerplate is removed |

Scanned PDFs need `brew install tesseract`.

## Deploying

It's a static site. `netlify.toml` is included: connect the repo on Netlify (or any static host;
build `npm run build`, publish `dist/`). Commit `public/library/` so your books ship with it.
Keep the repository **private** if it contains books you don't have the rights to share.
