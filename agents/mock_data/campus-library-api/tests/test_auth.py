from app.auth import create_token, hash_password


def test_signup(client):
    assert client.post('/signup', params={'username': 'a', 'password': 'pw'}).status_code == 200


def test_login_returns_token(client):
    client.post('/signup', params={'username': 'b', 'password': 'pw'})
    assert 'access_token' in client.post('/login', params={'username': 'b', 'password': 'pw'}).json()


def test_protected_route_requires_token(client):
    assert client.post('/borrow/1').status_code == 401
