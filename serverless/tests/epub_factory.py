import io
import zipfile

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="{opf_path}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""

OPF = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">{metadata}</metadata>
  <manifest>{manifest}</manifest>
</package>"""


def build_epub(
    metadata: str = "",
    manifest: str = "",
    files: dict | None = None,
    opf_path: str = "OEBPS/content.opf",
) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as epub:
        epub.writestr("mimetype", "application/epub+zip")
        epub.writestr("META-INF/container.xml", CONTAINER.format(opf_path=opf_path))
        epub.writestr(opf_path, OPF.format(metadata=metadata, manifest=manifest))
        for path, data in (files or {}).items():
            epub.writestr(path, data)
    return buffer.getvalue()
