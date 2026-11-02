"""The allow-list sanitizer for HTML that leaves the database again (S12, docs/BUSINESS_RULES.md).

Two HTML documents arrive from outside this server: the letter HR sends (`POST /letters`) and the
signed copy a device sends back (`signed_base64`). Both are stored in `ariba_documents` and both are
shown again — in the employee app, in the web viewer, in a downloaded file — so both are cleaned
**before they are written**: what is stored is what came back, minus anything that could run, fetch
or bind. Standard library only (`html.parser`), because the project has no HTML-sanitizing
dependency and a letter needs no DOM.

The rule is an allow-list, never a list of known tricks:

* a tag that is not named in `ALLOWED_TAGS` loses its markup and keeps its text;
* a tag that has no business in a letter (`script`, `iframe`, `form`, `svg`, … — `DROP_WITH_CONTENT`)
  loses its text too, because that text is code, a fallback document or a form;
* an attribute that is not allowed is dropped, and one starting with `on` never survives;
* `<img src>` may only be a **raster `data:` image**, and `href` may only be `http`, `https`,
  `mailto`, `tel` or a `#anchor` — so viewing a letter never calls out to a third party;
* a CSS declaration that can fetch (`url(`, `@import`, `image-set(`) or script (`expression(`,
  `behavior`, `-moz-binding`, `javascript:`) is removed, in `style=""` and inside `<style>`;
* `<!--ARIBA_EN-->` is the one comment kept: it is how the app splits the Arabic sheet from the
  English copy (`frontend/employee-app/app/document/[id].tsx`).

The viewers are the second line, not this one: `html-view.web.tsx` loads a document in an iframe with
no script permission and no same-origin, and `html-view.tsx` disables JavaScript in the phone's web
view. This module is what makes both of those a belt rather than the only strap.

A letter stored **before** this rule existed was never cleaned, so the one route that serves a stored
letter to a browser (`GET /letters/{id}/html`) also sends `DISPLAY_CSP`: a document that was never
sanitized is inert anyway, because the browser refuses to run its script or fetch its images.
"""

from __future__ import annotations

import re
from html import escape
from html.parser import HTMLParser

from app.core.errors import ApiError

#: The ceiling for one document body. A letter with an embedded signature is a few hundred KB at
#: most, so 1 MiB is generous and still keeps a hostile multi-megabyte upload out of the database.
MAX_DOCUMENT_BYTES = 1024 * 1024

#: What a stored letter is allowed to load or run when a browser opens it. It is the header twin of
#: `ALLOWED_TAGS`: no script (there is no `script-src`, so `default-src` refuses it), no remote image,
#: font or frame, no form — and the two things a letter does use are inline CSS and `data:` images.
#: `frame-ancestors 'none'` matches the blanket header `core/security.py` puts on every other answer.
DISPLAY_CSP = ("default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; "
               "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

#: The marker the app splits the bilingual files on. Kept, and the only comment that is.
EN_MARKER = "ARIBA_EN"

#: Tags a letter is made of — a whole sheet, a table, its text, its images and its signature.
ALLOWED_TAGS = frozenset({
    "html", "head", "body", "title", "meta", "style",
    "div", "p", "span", "section", "article", "header", "footer", "main", "aside", "nav",
    "figure", "figcaption", "blockquote", "pre", "code", "address",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "dl", "dt", "dd",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "sub", "sup", "small", "big",
    "mark", "font", "center", "br", "hr", "img", "a",
})

#: Tags with no end tag; emitting `</br>` would be worse than the round trip it saves.
VOID_TAGS = frozenset({"br", "hr", "img", "col"})

#: Elements dropped **with their content**: their text is code, a nested document, a form or a media
#: stream. Nothing a letter needs lives in here.
DROP_WITH_CONTENT = frozenset({
    "script", "iframe", "frame", "frameset", "object", "embed", "applet", "param",
    "form", "input", "button", "select", "option", "optgroup", "textarea", "datalist",
    "output", "progress", "meter", "fieldset",
    "svg", "math", "link", "base", "template", "noscript", "noembed", "noframes",
    "audio", "video", "source", "track", "picture", "canvas", "map", "area", "portal",
})

#: Attributes a letter may carry. `src` and `href` are handled per tag below.
COMMON_ATTRS = frozenset({
    "style", "class", "dir", "lang", "title", "align", "valign", "width", "height",
    "bgcolor", "border", "cellpadding", "cellspacing", "nowrap", "color", "face", "size",
})

#: The URL attributes, and the tags each one is legal on.
TAG_ATTRS = {"img": frozenset({"src", "alt"}), "a": frozenset({"href", "target"}),
             "col": frozenset({"span"}), "colgroup": frozenset({"span"})}

#: Schemes a link may use. A `data:` link is a document, not a link, and is refused.
LINK_SCHEMES = ("http://", "https://", "mailto:", "tel:", "#")

#: Image types that are raster. `svg+xml` is left out on purpose: an SVG image is a document that
#: can carry script, and a letter's only image is the signature the app drew as a PNG.
DATA_IMAGE = re.compile(r"^data:image/(png|jpe?g|gif|webp|bmp)[;,]", re.IGNORECASE)

#: A declaration that can fetch, script or bind. Matched against one declaration at a time.
CSS_FORBIDDEN = re.compile(
    r"url\s*\(|@import|image-set\s*\(|expression\s*\(|behaviou?r\s*:|-moz-binding|javascript\s*:",
    re.IGNORECASE)

#: Control characters a browser strips from a URL, so `java\tscript:` is the same as `javascript:`.
#: Spaces are not in here: a space inside a link is a path character, not a trick.
_URL_NOISE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+")


def sanitize_css(css: str) -> str:
    """One stylesheet or one `style` attribute, minus every declaration that can fetch or run.

    Declarations are separated on the separators themselves (`;`, `{`, `}`) so a `@media` block still
    opens and closes: only the piece that *is* the offending declaration disappears.
    """
    parts = re.split(r"([;{}])", css or "")
    kept: list[str] = []
    for index, part in enumerate(parts):
        if index % 2:  # a separator, always kept
            kept.append(part)
        elif part and not CSS_FORBIDDEN.search(part):
            kept.append(part)
    return "".join(kept)


def _url(value: str) -> str:
    """A URL with the control characters a browser would have stripped anyway."""
    return _URL_NOISE.sub("", value or "").strip()


def _clean_attrs(tag: str, attrs: list[tuple[str, str | None]]) -> str:
    """The allowed attributes of one start tag, escaped, with the URL rules applied."""
    allowed = COMMON_ATTRS | TAG_ATTRS.get(tag, frozenset())
    out: list[str] = []
    seen: set[str] = set()
    for name, value in attrs:
        name = (name or "").lower()
        value = value or ""
        if name in seen or name not in allowed or name.startswith("on"):
            continue
        if name == "style":
            value = sanitize_css(value).strip()
            if not value:
                continue
        elif name == "href":
            value = _url(value)
            if not value.lower().startswith(LINK_SCHEMES):
                continue  # a `javascript:` link keeps its text and loses the href
        elif name == "target":
            value = "_blank"
        elif name == "src":
            value = _url(value)
            if not DATA_IMAGE.match(value):
                continue  # no remote image: viewing a letter never calls out
        seen.add(name)
        out.append(f' {name}="{escape(value, quote=True)}"')
    if tag == "a" and "href" in seen:
        out.append(' rel="noopener noreferrer"')
    return "".join(out)


class _Cleaner(HTMLParser):
    """One pass over one document, writing the allowed subset back out, balanced."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self._open: list[str] = []
        self._suppress: list[str] = []
        self._in_style = False

    # ------------------------------------------------------------------ tags
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._start(tag.lower(), attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._start(tag.lower(), attrs)

    def _start(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._suppress:
            if tag in DROP_WITH_CONTENT and tag not in VOID_TAGS:
                self._suppress.append(tag)
            return
        if tag in DROP_WITH_CONTENT:
            if tag not in VOID_TAGS:
                self._suppress.append(tag)
            return
        if tag not in ALLOWED_TAGS:
            return  # an unknown tag loses its markup and keeps its text
        if tag == "meta":
            charset = next((v for n, v in attrs if (n or "").lower() == "charset"), None)
            if charset:
                self.parts.append(f'<meta charset="{escape(str(charset), quote=True)}">')
            return  # `<meta http-equiv="refresh">` is not a letter's business
        cleaned = _clean_attrs(tag, attrs)
        if tag == "img" and " src=" not in cleaned:
            return  # an image whose source was refused is not an image
        self.parts.append(f"<{tag}{cleaned}>")
        if tag == "style":
            self._in_style = True
        if tag not in VOID_TAGS:
            self._open.append(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._suppress:
            if tag in self._suppress:
                while self._suppress and self._suppress.pop() != tag:
                    pass
            return
        if tag == "style":
            self._in_style = False
        if tag not in self._open:
            return  # a stray end tag, or one for a tag that was never emitted
        while self._open:
            top = self._open.pop()
            self.parts.append(f"</{top}>")
            if top == tag:
                break

    # -------------------------------------------------------------- content
    def handle_data(self, data: str) -> None:
        if self._suppress:
            return  # a script, a nested document or a form: its text is not the letter
        self.parts.append(sanitize_css(data) if self._in_style else data)

    def handle_entityref(self, name: str) -> None:
        if not self._suppress:
            self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if not self._suppress:
            self.parts.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        if not self._suppress and data.strip() == EN_MARKER:
            self.parts.append(f"<!--{EN_MARKER}-->")

    def handle_decl(self, decl: str) -> None:
        if not self._suppress and decl.lower().startswith("doctype"):
            self.parts.append("<!DOCTYPE html>")

    def handle_pi(self, data: str) -> None:
        """`<?xml …?>` and friends: a processing instruction is not content."""

    def unknown_decl(self, data: str) -> None:
        """A CDATA block outside `<svg>`/`<math>`: not content either."""

    # ------------------------------------------------------------------ end
    def close(self) -> None:
        super().close()
        while self._open:  # a document that was cut off still comes back balanced
            self.parts.append(f"</{self._open.pop()}>")

    def html(self) -> str:
        return "".join(self.parts)


def sanitize_document(raw: str | bytes) -> str:
    """The cleaned HTML of one document (S12). Over `MAX_DOCUMENT_BYTES` it is a `413`, not a trim."""
    data = raw.encode("utf-8") if isinstance(raw, str) else bytes(raw)
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ApiError(413, "file_too_large",
                       f"The document is larger than {MAX_DOCUMENT_BYTES // 1024} KB")
    cleaner = _Cleaner()
    cleaner.feed(data.decode("utf-8", errors="replace"))
    cleaner.close()
    return cleaner.html()
