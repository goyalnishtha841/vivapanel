from datetime import date

from pydantic import BaseModel


class Book(BaseModel):
    id: int
    title: str
    author: str


class Loan(BaseModel):
    id: int
    user_id: int
    copy_id: int
    due: date
    returned: date | None = None
