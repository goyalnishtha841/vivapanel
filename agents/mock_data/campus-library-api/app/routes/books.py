from fastapi import APIRouter

from app.db import get_connection

router = APIRouter()


@router.get('/books/search')
def search_books(q: str):
    conn = get_connection()
    rows = conn.execute(f"SELECT * FROM books WHERE title LIKE '%{q}%'").fetchall()
    return [dict(r) for r in rows]


@router.get('/books')
def list_books():
    return [dict(r) for r in get_connection().execute('SELECT * FROM books').fetchall()]
