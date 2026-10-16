import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

_hits = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rule(method: str, path: str):
    """Returns (bucket, max requests, window in seconds)."""
    if method == "POST":
        if path == "/makers/apply":
            return "apply", 5, 3600
        if path == "/makers/recover":
            return "recover", 5, 3600
        if path.startswith("/circle/"):
            return "circle", 40, 3600
        if path == "/persons":
            return "create-person", 30, 3600
    return "general", 300, 60


def install_guard(app: FastAPI):
    @app.middleware("http")
    async def guard(request: Request, call_next):
        bucket, limit, window = _rule(request.method, request.url.path)
        hits = _hits[(_client_ip(request), bucket)]
        now = time.monotonic()
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return JSONResponse(
                {"detail": "Too many requests. Please slow down and try again shortly."},
                status_code=429,
                headers={"Retry-After": str(window)},
            )
        hits.append(now)
        response = await call_next(request)
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response