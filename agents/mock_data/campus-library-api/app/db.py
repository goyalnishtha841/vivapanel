import sqlite3

DB_PATH = 'library.db'


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.executescript(open('schema.sql').read())
    conn.commit()
