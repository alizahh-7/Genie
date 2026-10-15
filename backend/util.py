import hashlib
import secrets


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clean_list(values, max_items, max_len, label="item"):
    out, seen = [], set()
    for v in values or []:
        v = " ".join(str(v).split())
        if not v:
            continue
        if len(v) > max_len:
            raise ValueError(f"Each {label} must be under {max_len} characters")
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    if len(out) > max_items:
        raise ValueError(f"Please give at most {max_items} {label}s")
    return out