import hashlib
from datetime import datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from app.db import get_connection

SECRET_KEY = 'library-secret-123'
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/login')
router = APIRouter()


def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def verify_password(pw: str, hashed: str) -> bool:
    return hash_password(pw) == hashed


def create_token(user_id: int, role: str) -> str:
    payload = {'sub': user_id, 'role': role, 'exp': datetime.utcnow() + timedelta(days=30)}
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def get_current_user(token: str = Depends(oauth2_scheme)):
    data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    return data


@router.post('/signup')
def signup(username: str, password: str):
    conn = get_connection()
    conn.execute('INSERT INTO users(username, password, role) VALUES (?,?,?)',
                 (username, hash_password(password), 'student'))
    conn.commit()
    return {'status': 'created'}


@router.post('/login')
def login(username: str, password: str):
    row = get_connection().execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
    if not row or not verify_password(password, row['password']):
        raise HTTPException(401, 'Bad credentials')
    return {'access_token': create_token(row['id'], row['role'])}
