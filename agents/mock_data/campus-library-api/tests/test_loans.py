def auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_borrow_available_copy(client, token):
    r = client.post('/borrow/1', headers=auth(token))
    assert r.status_code == 200


def test_borrow_twice_returns_409(client, token):
    client.post('/borrow/1', headers=auth(token))
    r = client.post('/borrow/1', headers=auth(token))
    assert r.status_code == 409
