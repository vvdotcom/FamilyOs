from __future__ import annotations

from conftest import PASSWORD, bearer, parent_token


def test_parent_can_delete_their_account_after_entering_the_password_again(api):
    token = parent_token(api, "delete-me@example.test")
    client = api.client
    assert client.get("/v1/household", headers=bearer(token)).status_code == 200

    wrong = client.post("/v1/account/delete", json={"confirm": "DELETE", "password": "not-the-password"},
                        headers=bearer(token))
    assert wrong.status_code == 401
    unconfirmed = client.post("/v1/account/delete", json={"confirm": "yes", "password": PASSWORD}, headers=bearer(token))
    assert unconfirmed.status_code == 422

    deleted = client.post("/v1/account/delete", json={"confirm": "DELETE", "password": PASSWORD}, headers=bearer(token))
    assert deleted.status_code == 200 and deleted.json()["data"] == {"deleted": True}
    assert deleted.headers["Cache-Control"] == "no-store"

    # The session is gone (a parent-only request is refused; local mode shows unsigned visitors the demo
    # household, so /v1/household itself is not a useful check) and the account cannot sign in again.
    after = client.post("/v1/account/delete", json={"confirm": "DELETE", "password": PASSWORD}, headers=bearer(token))
    assert after.status_code == 401
    again = client.post("/v1/auth/sign-in", json={"email": "delete-me@example.test", "password": PASSWORD})
    assert again.status_code in (401, 404)


def test_account_deletion_requires_a_signed_in_parent(api):
    reply = api.client.post("/v1/account/delete", json={"confirm": "DELETE", "password": PASSWORD})
    assert reply.status_code == 401


def test_public_privacy_and_deletion_pages_are_served(api):
    for path in ("/privacy", "/delete-account"):
        page = api.client.get(path)
        assert page.status_code == 200 and "Hometide" in page.text
    assert "/app/" in api.client.get("/delete-account").text
