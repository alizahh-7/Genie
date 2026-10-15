import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv
from fastapi import HTTPException
from psycopg.rows import dict_row

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")


@contextmanager
def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    with psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=10,
    ) as conn:
        yield conn


def require_person(conn, person_id):
    row = conn.execute("select 1 from person where id = %s", (person_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Person not found")