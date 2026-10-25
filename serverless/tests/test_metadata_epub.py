import io
import zipfile

import pytest
from epub_factory import build_epub

from metadata import epub
from metadata.epub import Cover, EpubError, parse


def test_reads_title_authors_and_year():
    result = parse(
        build_epub(
            "<dc:title> Ficciones </dc:title>"
            "<dc:creator>Jorge Luis Borges</dc:creator>"
            "<dc:creator>Adolfo  Bioy Casares</dc:creator>"
            "<dc:creator> </dc:creator>"
            "<dc:date>1944-01-01</dc:date>"
        )
    )

    assert result.title == "Ficciones"
    assert result.authors == ["Jorge Luis Borges", "Adolfo Bioy Casares"]
    assert result.year == 1944
    assert result.cover is None


def test_reads_the_epub3_cover_image():
    result = parse(
        build_epub(
            "<dc:title>A</dc:title>",
            '<item id="c" href="images/cover%20front.png" media-type="image/png"'
            ' properties="cover-image"/>',
            {"OEBPS/images/cover front.png": b"png"},
        )
    )

    assert result.cover == Cover(data=b"png", extension="png", media_type="image/png")


def test_reads_the_epub2_cover_meta():
    result = parse(
        build_epub(
            '<dc:title>A</dc:title><meta name="cover" content="cov"/>',
            '<item id="cov" href="../cover.jpg" media-type="image/jpeg"/>',
            {"cover.jpg": b"jpg"},
        )
    )

    assert result.cover == Cover(data=b"jpg", extension="jpg", media_type="image/jpeg")


@pytest.mark.parametrize(
    ("manifest", "files"),
    [
        ('<item id="c" href="c.svg" media-type="image/svg+xml" properties="cover-image"/>', {}),
        ('<item id="c" href="missing.jpg" media-type="image/jpeg" properties="cover-image"/>', {}),
        ('<item id="c" href="c.jpg" media-type="image/jpeg"/>', {"OEBPS/c.jpg": b"jpg"}),
    ],
)
def test_ignores_unusable_covers(manifest, files):
    assert parse(build_epub("<dc:title>A</dc:title>", manifest, files)).cover is None


def test_allows_missing_title_and_authors():
    result = parse(build_epub())

    assert result.title is None
    assert result.authors == []


@pytest.mark.parametrize("date", ["circa 1900", "", "19-05"])
def test_drops_malformed_years(date):
    assert parse(build_epub(f"<dc:date>{date}</dc:date>")).year is None


def test_finds_the_opf_at_the_root():
    assert parse(build_epub("<dc:title>A</dc:title>", opf_path="content.opf")).title == "A"


def _zip(files: dict) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as epub:
        for path, data in files.items():
            epub.writestr(path, data)
    return buffer.getvalue()


ROOTFILE_A = (
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    '<rootfiles><rootfile full-path="a.opf"/></rootfiles></container>'
)


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"not a zip", "not a zip file"),
        (_zip({"mimetype": "application/epub+zip"}), "missing META-INF/container.xml"),
        (_zip({"META-INF/container.xml": "<container"}), "invalid XML"),
        (_zip({"META-INF/container.xml": "<container/>"}), "missing OPF rootfile"),
        (_zip({"META-INF/container.xml": ROOTFILE_A}), "missing OPF"),
        (
            _zip(
                {
                    "META-INF/container.xml": ROOTFILE_A,
                    "a.opf": '<package xmlns="http://www.idpf.org/2007/opf"/>',
                }
            ),
            "missing OPF metadata",
        ),
    ],
)
def test_rejects_invalid_epubs(data, message):
    with pytest.raises(EpubError, match=f"^{message}$"):
        parse(data)


def test_rejects_oversized_metadata_files(monkeypatch):
    monkeypatch.setattr(epub, "MAX_XML_SIZE", 10)

    with pytest.raises(EpubError, match="^metadata file too large$"):
        parse(build_epub())


def test_ignores_oversized_covers(monkeypatch):
    monkeypatch.setattr(epub, "MAX_COVER_SIZE", 2)
    data = build_epub(
        "<dc:title>A</dc:title>",
        '<item id="c" href="c.jpg" media-type="image/jpeg" properties="cover-image"/>',
        {"OEBPS/c.jpg": b"jpg"},
    )

    assert parse(data).cover is None


def test_rejects_unreadable_entries():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as corrupt:
        corrupt.writestr("META-INF/container.xml", "<container/>" * 10)
        info = corrupt.getinfo("META-INF/container.xml")
    data = bytearray(buffer.getvalue())
    start = info.header_offset + 30 + len(info.filename)
    data[start : start + 4] = b"\xff" * 4

    with pytest.raises(EpubError, match="^unreadable zip entry$"):
        parse(bytes(data))
