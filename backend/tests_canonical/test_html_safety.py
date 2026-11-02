"""`services/html_safety` — the allow-list S12 promises, one case per promise.

The sanitizer is the first line of defence for a signed page (the two viewers are the second), so
these cases are written as attacks and as sheets: what a letter is made of survives, what it is not
made of disappears *with its content*, and the one thing that must never happen — a stored page that
can run or fetch — is asserted four different ways.
"""

from __future__ import annotations

import pytest

from app.core.errors import ApiError
from app.services import html_safety

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="


def test_a_letter_sheet_survives_intact():
    page = ("<html><head><meta charset='utf-8'><style>p{font-family:Arial}</style></head><body>"
            "<table><tr><td style='text-align:center'>مرحبا</td></tr></table>"
            f"<h1>خطاب</h1><p><b>نص</b> الخطاب</p><img src='{PNG}' alt='signature'>"
            "<a href='https://example.sa/x' target='_self'>رابط</a></body></html>")
    out = html_safety.sanitize_document(page)
    for kept in ("<html>", "<head>", "<style>", "<table>", "<td style=\"text-align:center\">",
                 "مرحبا", "خطاب", "<b>نص</b>", PNG, "https://example.sa/x", "</html>"):
        assert kept in out, kept
    assert 'target="_blank"' in out and 'rel="noopener noreferrer"' in out  # a new tab, never this one


def test_code_is_dropped_with_its_content_not_escaped_into_the_page():
    out = html_safety.sanitize_document("<p>حد</p><script>alert('x')</script><iframe src='//x'></iframe>"
                                        "<form><input name='a'></form><svg><script>1</script></svg>"
                                        "<video src='x'></video>")
    for gone in ("alert", "iframe", "<input", "svg", "video"):
        assert gone not in out, gone
    assert "حد" in out  # the letter's own text stays


def test_every_handler_attribute_is_dropped():
    out = html_safety.sanitize_document('<div onclick="x()" onmouseover="y()" ONLOAD="z()">ن</div>')
    assert "onclick" not in out and "onmouseover" not in out and "onload" not in out.lower()


def test_a_link_keeps_its_text_and_loses_a_scheme_that_can_run():
    for href in ("javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>", "vbscript:x"):
        out = html_safety.sanitize_document(f'<a href="{href}">اضغط</a>')
        assert "اضغط" in out and "href" not in out and "script" not in out.lower(), href


def test_an_image_must_be_a_raster_data_uri():
    for src in ("https://example.com/x.png", "//example.com/x.png", "file:///c:/x.png",
                "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PjE8L3NjcmlwdD48L3N2Zz4="):
        out = html_safety.sanitize_document(f"<img src='{src}' alt='صورة'>")
        assert "<img" not in out, src  # an image whose source was refused is not an image
    assert f"<img src=\"{PNG}\"" in html_safety.sanitize_document(f"<img src='{PNG}' alt='signature'>")


def test_css_that_can_fetch_or_bind_is_removed_and_the_rest_is_kept():
    out = html_safety.sanitize_document(
        "<style>@import url(x.css);p{color:red;background:url(http://x/y.png)}</style>"
        "<p style='color:blue;behavior:url(x.htc);font-size:12px'>ن</p>")
    assert "color:red" in out and "color:blue" in out and "font-size:12px" in out
    assert "@import" not in out and "url(" not in out and "behavior" not in out


def test_only_the_english_marker_survives_of_the_comments():
    out = html_safety.sanitize_document("<p>أ</p><!--ARIBA_EN--><p>ب</p><!-- ملاحظة سرية -->")
    assert "<!--ARIBA_EN-->" in out and "ملاحظة سرية" not in out


def test_meta_keeps_its_charset_and_nothing_else():
    out = html_safety.sanitize_document("<meta charset='utf-8'><meta http-equiv='refresh' content='0;url=//x'>")
    assert "charset" in out and "http-equiv" not in out


def test_a_cut_off_document_comes_back_balanced():
    out = html_safety.sanitize_document("<div><p>نص")
    assert out.count("<div>") == out.count("</div>") and out.count("<p>") == out.count("</p>")


def test_an_unknown_tag_loses_its_markup_and_keeps_its_text():
    out = html_safety.sanitize_document("<custom-element>محتوى</custom-element>")
    assert "محتوى" in out and "custom-element" not in out


def test_over_one_mebibyte_is_a_413_not_a_trim():
    with pytest.raises(ApiError) as exc:
        html_safety.sanitize_document(b"<p>" + b"x" * html_safety.MAX_DOCUMENT_BYTES)
    assert (exc.value.status, exc.value.code) == (413, "file_too_large")
