import pytest

from metadata.slug import slugify


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Jorge Luis Borges", "jorge-luis-borges"),
        ("jorge  luis borges", "jorge-luis-borges"),
        ("Gabriel García Márquez", "gabriel-garcia-marquez"),
        ("Ñuñoa Ödön", "nunoa-odon"),
        ("  J. R. R. Tolkien!  ", "j-r-r-tolkien"),
        ("ﬁ Ⅳ", "fi-iv"),
        ("--- ¿? ---", ""),
        ("村上春樹", ""),
    ],
)
def test_slugify(name, slug):
    assert slugify(name) == slug
