from __future__ import annotations

import pytest

from app.domain import DomainError
from app.production import CognitoTokenVerifier


class FakeSigningKey:
    key = object()


class FakeJWKClient:
    def get_signing_key_from_jwt(self, _token):
        return FakeSigningKey()


@pytest.fixture
def verifier(monkeypatch):
    instance = object.__new__(CognitoTokenVerifier)
    instance.issuer = "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example"
    instance.client_id = "familyos-public-client"
    instance._jwks = FakeJWKClient()
    claims = {
        "sub": "cognito-user-123",
        "email": "parent@example.test",
        "email_verified": True,
        "token_use": "id",
    }

    def decode(_token, _key, **_kwargs):
        return claims.copy()

    monkeypatch.setattr("app.production.jwt.decode", decode)
    return instance, claims


def test_cognito_accepts_only_verified_id_tokens(verifier):
    instance, _claims = verifier
    result = instance.verify_id_token("signed-token")
    assert result["sub"] == "cognito-user-123"
    assert result["email_verified"] is True


@pytest.mark.parametrize(
    "claim_updates",
    [
        {"token_use": "access"},
        {"email_verified": False},
        {"sub": ""},
        {"email": ""},
    ],
)
def test_cognito_rejects_wrong_token_or_unverified_identity(verifier, claim_updates):
    instance, claims = verifier
    claims.update(claim_updates)
    with pytest.raises(DomainError):
        instance.verify_id_token("signed-token")


def test_cognito_rejects_oversized_tokens(verifier):
    instance, _claims = verifier
    with pytest.raises(DomainError):
        instance.verify_id_token("x" * 16_385)
