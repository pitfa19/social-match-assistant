"""Folding, conservative stemming and synonym expansion for Croatian text (retrieval only)."""
import re
import unicodedata

STOP = {"i", "u", "na", "za", "je", "se", "sam", "smo", "su", "da", "ne", "li", "od", "do", "po", "s", "sa", "te",
        "ili", "ali", "to", "ovo", "koji", "koja", "koje", "kao", "iz", "pa", "bi", "mi", "me", "moj", "moja",
        "nam", "vam", "imam", "trazim", "nudim", "treba", "tko", "ima", "ako", "bih", "malo", "vrlo", "puno", "trebam", "eura", "eur", "bitna", "bitno", "moze", "mozda", "ne"}
# Conservative groups: every member is a near-exact synonym or inflected stem in this domain.
SYNONYMS = [
    {"stan", "apartman", "garsonijera", "garsonijeru", "garsonjera", "apartmana", "stana"},
    {"najam", "najmu", "iznajmljujem", "iznajmljuje", "iznajmljivanje", "unajmiti", "podstanar"},
    {"bicikl", "bicikla", "biciklu", "bike", "bicikal"},
    {"sofa", "sofu", "sofe", "sofi", "kauc", "kauč", "garnitura", "trosjed"},
    {"instrukcije", "poduka", "instruktor", "instruktora", "podučavanje", "poducavanje"},
    {"selidba", "selidbu", "preseljenje", "prijevoz", "kombi"},
    {"laptop", "prijenosnik", "racunalo", "notebook"},
]
_SYN_FOLDED: list[set[str]] = []


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower().replace("đ", "d"))
    return "".join(c for c in s if not unicodedata.combining(c))


_SYN_FOLDED = [{fold(w) for w in g} for g in SYNONYMS]
_WORD = re.compile(r"[a-z0-9]+")


def tokens(s: str) -> list[str]:
    return _WORD.findall(fold(s))


def stem(w: str) -> str:
    """Prefix stem tolerant to declension. Short words stay exact."""
    return w if len(w) <= 4 else w[: max(4, len(w) - 2)]


def expand(words: list[str]) -> list[str]:
    out, seen = [], set()
    for w in words:
        if w in STOP or len(w) < 2 or w.isdigit():
            continue
        group = {w}
        for g in _SYN_FOLDED:
            if w in g or stem(w) in {stem(x) for x in g}:
                group |= g
        for x in sorted(group):
            if x not in seen:
                seen.add(x)
                out.append(x)
    return out


def build_tsquery(text: str) -> tuple[str | None, list[str]]:
    """OR-query of prefix stems (tsquery syntax). Returns (query or None, expanded terms)."""
    terms = expand(tokens(text))
    stems = sorted({stem(t) for t in terms if t.isalnum()})
    if not stems:
        return None, terms
    return " | ".join(f"{s}:*" for s in stems), terms
