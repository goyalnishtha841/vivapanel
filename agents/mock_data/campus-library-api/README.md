# campus-library-api

A FastAPI + SQLite REST API for a college library.

## Features
- Secure JWT-based authentication
- Scalable to thousands of concurrent students
- Prevents double-borrowing of the same copy
- Fine is calculated automatically for late returns
- 90%+ test coverage

## Run
    pip install -r requirements.txt
    uvicorn app.main:app --reload
    pytest -q
