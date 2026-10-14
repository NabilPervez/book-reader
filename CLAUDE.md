# Book Reader — instructions for Claude Code

This repo is a focus-first reading app (React + Vite PWA). Books are converted ahead of time
into JSON by a Python script and served as static files.

## "Add this book" workflow

When the user drops a file into `books/` (or asks to import a book):

1. Make sure dependencies exist: `npm install` (once) and `pip3 install -r requirements.txt` (PDF support).
2. Run `npm run import` — it imports every new file in `books/`.
   - One file with better metadata: `python3 scripts/import_books.py books/<file> --title "…" --author "…"`
   - Re-import after changing the script: add `--force`.
3. **Check the result before calling it done.** Read `public/library/<book-id>/book.json` and
   confirm the table of contents makes sense:
   - Chapter titles should be real chapter names, not junk like "m" or "CONTENTS".
   - There shouldn't be one giant chapter or hundreds of tiny ones.
   - Open two or three chapter JSON files and skim the paragraphs: no running headers or
     page numbers mixed into the text, no words broken by hyphens, paragraphs not cut mid-sentence.
   If it looks wrong, try `--split toc`, `--split headings` or `--split words:3000`, or improve
   `scripts/import_books.py` for that book's layout (keep fixes general so other books still work).
4. Scanned PDFs (images, no real text) need OCR: `brew install tesseract`, then the import runs OCR
   automatically. Use `--lang eng+ara` (etc.) for other languages. OCR is slow (several seconds a page).
5. Start the app with `npm run dev` and open the book to confirm it reads well.
6. If the user wants it on their phone, commit `public/library/` and push. The site deploys from the repo.

Remove a book: `python3 scripts/import_books.py --remove <book-id>` (see ids with `npm run books`).

## Layout

- `scripts/import_books.py`: converts PDF, EPUB, DOCX, HTML, TXT and Markdown into the library format
- `public/library/index.json`: list of books
- `public/library/<book>/book.json`: metadata and table of contents
- `public/library/<book>/<chapter>.json`: `{id, title, blocks: [{t, text, page?, n?}]}`.
  `t` is one of `p`, `h2`, `h3`, `quote`, `li`, `bullet`. Text may contain `*italic*` and `**bold**`.
- `src/components/TextBody.jsx`: the reader (Focus mode shows one passage at a time; Page mode scrolls)
- `src/lib/library.js`: loads books and chapters, tracks reading progress
- `src/lib/db.js`: notes and favourites in IndexedDB, keyed by `"<bookId>:<chapterId>"`

## Conventions

- Notes stay on the device: no backend, no analytics.
- Book files in `books/` are git-ignored (they're often large or copyrighted). The converted
  `public/library/` is committed so the deployed site has the books.
