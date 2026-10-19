from fastapi import FastAPI

from app.db import init_db
from app.routes import books, loans
from app import auth

app = FastAPI(title="Campus Library API")


@app.on_event("startup")
def startup():
    init_db()


app.include_router(auth.router)
app.include_router(books.router)
app.include_router(loans.router)
