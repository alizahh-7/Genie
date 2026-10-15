import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import get_conn
from maintenance import purge_expired
from routers import circle, makers, persons, portrait, privacy, wishes

load_dotenv()

origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]


async def purge_loop():
    while True:
        try:
            removed = await asyncio.to_thread(purge_expired)
            if removed:
                print(f"Purged {removed} expired people")
        except Exception as exc:
            print("Purge failed:", exc)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(purge_loop())
    yield
    task.cancel()


app = FastAPI(title="Genie API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    try:
        with get_conn() as conn:
            conn.execute("select 1")
    except Exception:
        raise HTTPException(503, "Database unreachable")
    return {"status": "ok", "database": "connected"}


app.include_router(persons.router)
app.include_router(makers.router)
app.include_router(wishes.router)
app.include_router(portrait.router)
app.include_router(privacy.router)
app.include_router(circle.owner)
app.include_router(circle.public)