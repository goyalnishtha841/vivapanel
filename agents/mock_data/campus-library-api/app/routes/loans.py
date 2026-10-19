from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db import get_connection
from app.services.fines import calculate_fine

router = APIRouter()


def due_date() -> date:
    return date.today() + timedelta(days=14)


@router.post('/borrow/{copy_id}')
def borrow_book(copy_id: int, user=Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute('SELECT available FROM copies WHERE id=?', (copy_id,)).fetchone()
    if not row['available']:
        raise HTTPException(409, 'Already borrowed')
    conn.execute('UPDATE copies SET available=0 WHERE id=?', (copy_id,))
    conn.execute('INSERT INTO loans(user_id, copy_id, due) VALUES (?,?,?)', (user['sub'], copy_id, due_date()))
    conn.commit()
    return {'status': 'borrowed'}


@router.post('/return/{copy_id}')
def return_book(copy_id: int, user=Depends(get_current_user)):
    conn = get_connection()
    loan = conn.execute('SELECT * FROM loans WHERE copy_id=? AND returned IS NULL', (copy_id,)).fetchone()
    fine = calculate_fine(date.fromisoformat(loan['due']), date.today())
    conn.execute('UPDATE loans SET returned=?, fine=? WHERE id=?', (date.today(), fine, loan['id']))
    conn.execute('UPDATE copies SET available=1 WHERE id=?', (copy_id,))
    conn.commit()
    return {'status': 'returned', 'fine': fine}
