import io
import posixpath
import re
import zipfile
import zlib
from dataclasses import dataclass, field
from urllib.parse import unquote
from xml.etree import ElementTree

NS = {
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}
COVER_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}
YEAR = re.compile(r"^\d{4}")
MAX_XML_SIZE = 5 * 1024 * 1024
MAX_COVER_SIZE = 10 * 1024 * 1024


class EpubError(Exception):
    pass


@dataclass(frozen=True)
class Cover:
    data: bytes
    extension: str
    media_type: str


@dataclass(frozen=True)
class Metadata:
    title: str | None = None
    authors: list[str] = field(default_factory=list)
    year: int | None = None
    cover: Cover | None = None


def parse(data: bytes) -> Metadata:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as epub:
            return _parse(epub)
    except zipfile.BadZipFile as e:
        raise EpubError("not a zip file") from e
    except ElementTree.ParseError as e:
        raise EpubError("invalid XML") from e
    except (RuntimeError, NotImplementedError, EOFError, zlib.error, UnicodeDecodeError) as e:
        raise EpubError("unreadable zip entry") from e


def _read_xml(epub: zipfile.ZipFile, path: str, missing: str) -> ElementTree.Element:
    try:
        info = epub.getinfo(path)
    except KeyError as e:
        raise EpubError(missing) from e
    if info.file_size > MAX_XML_SIZE:
        raise EpubError("metadata file too large")
    return ElementTree.fromstring(epub.read(info))


def _parse(epub: zipfile.ZipFile) -> Metadata:
    container = _read_xml(epub, "META-INF/container.xml", "missing META-INF/container.xml")
    rootfile = container.find(".//container:rootfile", NS)
    opf_path = rootfile.get("full-path") if rootfile is not None else None
    if not opf_path:
        raise EpubError("missing OPF rootfile")
    opf = _read_xml(epub, opf_path, "missing OPF")
    metadata = opf.find("opf:metadata", NS)
    if metadata is None:
        raise EpubError("missing OPF metadata")
    return Metadata(
        title=_text(metadata.find("dc:title", NS)),
        authors=[name for el in metadata.findall("dc:creator", NS) if (name := _text(el))],
        year=_year(metadata.find("dc:date", NS)),
        cover=_cover(epub, opf, metadata, posixpath.dirname(opf_path)),
    )


def _text(element: ElementTree.Element | None) -> str | None:
    if element is None or element.text is None:
        return None
    return " ".join(element.text.split()) or None


def _year(element: ElementTree.Element | None) -> int | None:
    match = YEAR.match(_text(element) or "")
    return int(match.group()) if match else None


def _cover(
    epub: zipfile.ZipFile,
    opf: ElementTree.Element,
    metadata: ElementTree.Element,
    base: str,
) -> Cover | None:
    items = opf.findall("opf:manifest/opf:item", NS)
    item = next((i for i in items if "cover-image" in i.get("properties", "").split()), None)
    if item is None:
        meta = next((m for m in metadata.findall("opf:meta", NS) if m.get("name") == "cover"), None)
        cover_id = meta.get("content") if meta is not None else None
        item = next((i for i in items if cover_id and i.get("id") == cover_id), None)
    if item is None or not item.get("href"):
        return None
    media_type = item.get("media-type", "")
    extension = COVER_EXTENSIONS.get(media_type)
    if extension is None:
        return None
    path = posixpath.normpath(posixpath.join(base, unquote(item.get("href"))))
    try:
        info = epub.getinfo(path)
    except KeyError:
        return None
    if info.file_size > MAX_COVER_SIZE:
        return None
    return Cover(data=epub.read(info), extension=extension, media_type=media_type)
