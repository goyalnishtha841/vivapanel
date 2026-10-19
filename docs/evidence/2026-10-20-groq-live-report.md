# Viva report — campus-library-api
**26/100 · Not ready** · 12 questions · https://github.com/example-student/campus-library-api

> The student shows a basic grasp of the project but lacks depth in critical security and concurrency aspects.

## Topics
| Topic | Examiner | Confidence | Verdicts | Note |
|---|---|---|---|---|
| Password hashing strategy | Professor | 73 | weak, strong | Student eventually recognized the insecurity of unsalted SHA‑256 and suggested using a salted password‑hashing library. |
| Borrow concurrency safety | Professor | 10 | weak, weak, no_answer | Student could not explain how the SELECT‑then‑UPDATE sequence avoids race conditions and admitted the tests do not prove safety. |
| SQLite scalability limits | Engineer | 22 | weak, strong, weak, weak, weak, no_answer | Student noted SQLite's single‑writer limitation but failed to discuss transaction atomicity or crash implications. |
| SQL injection risk | Engineer | — | — | The topic was not addressed in the transcript, leaving its handling unknown. |
| JWT authentication flow | Junior | 0 | no_answer | Student provided no explanation of JWT decoding or the data returned by get_current_user. |
| Borrow‑return lifecycle | Junior | — | — | No discussion was recorded, so understanding of the full loan process cannot be assessed. |

## Weak spots
### Borrow race condition — `app/routes/loans.py`
Student claims tests cover double‑borrowing but the code lacks atomic transaction protection; they cannot explain how the SELECT‑then‑UPDATE is safe and did not propose a concrete fix.
> **Q9 professor:** In the current `borrow_book` implementation, how is the SELECT‑then‑UPDATE sequence protected against a race condition where two requests read the same copy as available simultaneously?
> **Q9 student:** It's safe, my tests cover double-borrowing: test_borrow_twice_returns_409 passes.
> **Q10 engineer:** The test suite runs two back‑to‑back borrow requests in the same process, which passes, but it does not simulate simultaneous concurrent requests; thus it does not prove protection against race conditions. Can you…
> **Q10 student:** borrow_book reads available, then updates it in a separate statement, so two requests can both see available=1 and both borrow. I'd make it one atomic UPDATE copies SET available=0 WHERE id=? AND available=1 and check…
> **Q11 engineer:** Looking at `borrow_book()` in `app/routes/loans.py`: Given the current implementation, how would you modify the code to ensure the SELECT and UPDATE are executed within a single transaction and that the operation is…
> **Q11 student:** I already explained that part, I am not sure what else to add.

### Missing transaction & crash handling — `app/db.py`
Student repeatedly avoided answering how atomicity is ensured for the borrow operation and what happens to open connections on a crash, showing a gap in understanding of SQLite transaction semantics.
> **Q5 professor:** I’d add a point, Engineer — How does the current design ensure that the borrow operation is atomic, and what happens if a connection is left open during a crash?
> **Q5 student:** I already explained that part, I am not sure what else to add.
> **Q6 professor:** Looking at `app/db.py`: Considering the borrow_book endpoint, does the current code wrap the SELECT and UPDATE/INSERT statements in a transaction, and what would be the effect if the process crashes after the UPDATE…
> **Q6 student:** I already explained that part, I am not sure what else to add.
> **Q7 junior:** I'd add a point, Professor — Could you explain how the borrow_book endpoint ensures atomicity of the SELECT and UPDATE/INSERT, and what happens if the process crashes between those statements?
> **Q7 student:** I already explained that part, I am not sure what else to add.
> **Q8 junior:** Looking at `app/db.py`: Can you walk through each SQL statement in borrow_book and tell me whether they’re wrapped in a single transaction, and what the database state would be if the server crashes after the UPDATE…
> **Q8 student:** I already explained that part, I am not sure what else to add.

### JWT verification missing — `app/auth.py`
Student gave no explanation of how get_current_user decodes the JWT, validates it, or what user information is returned, indicating lack of knowledge of the authentication flow.
> **Q12 junior:** How does get_current_user verify an incoming JWT and what user data does it return to the rest of the app?
> **Q12 student:** I already explained that part, I am not sure what else to add.

### Unsalted SHA‑256 — `app/auth.py`
Initial response showed no awareness of the risks of using plain SHA‑256 without a salt, revealing incomplete security knowledge.
> **Q1 professor:** Looking at `hash_password()` in `app/auth.py`: Can you explain why you chose plain SHA‑256 without a salt for password hashing and what security trade‑offs this entails?
> **Q1 student:** It's secure because we hash passwords and use JWT.

## Test evidence (sandbox)
- **Claim (A9):** My tests cover double‑borrowing: test_borrow_twice_returns_409 passes
  - Ran `pytest -q tests/test_loans.py` → **passed**, 2 passed / 0 failed
  - **INCONCLUSIVE** — The test suite runs two back‑to‑back borrow requests in the same process, which passes, but it does not simulate simultaneous concurrent requests; thus it does not prove protection against race conditions.

## Unanswered questions
- Q8 (Junior, `app/db.py`): Looking at `app/db.py`: Can you walk through each SQL statement in borrow_book and tell me whether they’re wrapped in a single transaction, and what the database state would be if the server crashes after the UPDATE but before the INSERT?
  - Student: _I already explained that part, I am not sure what else to add._
- Q11 (Engineer, `app/routes/loans.py:borrow_book`): Looking at `borrow_book()` in `app/routes/loans.py`: Given the current implementation, how would you modify the code to ensure the SELECT and UPDATE are executed within a single transaction and that the operation is safe from race conditions?
  - Student: _I already explained that part, I am not sure what else to add._
- Q12 (Junior, `app/auth.py:get_current_user`): How does get_current_user verify an incoming JWT and what user data does it return to the rest of the app?
  - Student: _I already explained that part, I am not sure what else to add._

## Study plan
1. **Make borrow atomic** (45 min) — `app/routes/loans.py`: Rewrite borrow_book to perform a single UPDATE with a WHERE clause checking availability, verify rowcount, and return appropriate response.
2. **Add transaction handling** (30 min) — `app/db.py`: Wrap the SELECT, UPDATE, and INSERT statements in a BEGIN...COMMIT transaction using a context manager and ensure connections are closed after each request.
3. **Secure JWT flow** (25 min) — `app/auth.py`: Document the JWT verification process in get_current_user, add error handling, and create a unit test that decodes a token and checks the returned user dict.
4. **Upgrade password hashing** (40 min) — `app/auth.py`: Replace hash_password with pass‑lib's bcrypt/argon2 implementation, store per‑user salts, and move SECRET_KEY to an environment variable via python‑dotenv.
5. **Concurrency test suite** (35 min) — `tests/test_loans.py`: Write a pytest using threading or async client to issue concurrent borrow requests for the same copy and assert only one succeeds, confirming race‑condition safety.

## Summary for recruiters
The student understands the insecurity of an unsalted SHA‑256 password hash and can articulate why a dedicated hashing library is preferable. They recognize SQLite's single‑writer limitation but cannot explain transaction handling, atomicity, or crash behavior. Their explanation of JWT verification and the borrow concurrency safeguards is absent, and the existing tests do not simulate real concurrent requests. Overall, the candidate demonstrates partial technical knowledge but needs significant improvement in secure authentication, database transaction management, and race‑condition mitigation.