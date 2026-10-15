import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import get_conn
from routers import makers, persons, wishes

load_dotenv()

origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app = FastAPI(title="Genie API")
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