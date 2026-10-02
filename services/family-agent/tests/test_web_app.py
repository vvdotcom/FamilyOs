from __future__ import annotations

import importlib

from fastapi.testclient import TestClient


def test_web_app_responses_carry_a_strict_content_security_policy(api):
    reply = api.client.get("/app/does-not-exist.js")
    policy = reply.headers["Content-Security-Policy"]
    assert "script-src 'self'" in policy and "'unsafe-eval'" not in policy
    assert "frame-ancestors 'none'" in policy
    assert "connect-src 'self' https://cognito-idp." in policy
    assert reply.headers["X-Content-Type-Options"] == "nosniff"
    assert reply.headers["Cache-Control"] == "no-cache"
    # API routes are unaffected.
    assert "Content-Security-Policy" not in api.client.get("/health").headers


def test_built_web_app_is_served_at_app_with_fresh_html_and_cached_bundles(tmp_path, monkeypatch, api):
    site = tmp_path / "webapp"
    (site / "_expo" / "static" / "js" / "web").mkdir(parents=True)
    (site / "index.html").write_text("<!doctype html><div id=root></div>")
    (site / "_expo" / "static" / "js" / "web" / "entry-abc123.js").write_text("console.log(1)")
    main = api.main
    monkeypatch.setattr(main, "WEB_APP_DIR", site)
    from fastapi.staticfiles import StaticFiles
    from starlette.routing import Mount

    # Put the test site first: a real build in app/webapp is already mounted at /app.
    mount = Mount("/app", app=StaticFiles(directory=site, html=True), name="web-app-test")
    monkeypatch.setattr(main.app.router, "routes", [mount, *main.app.router.routes])
    client = TestClient(main.app)
    page = client.get("/app/")
    assert page.status_code == 200 and "id=root" in page.text
    assert page.headers["Cache-Control"] == "no-cache"
    bundle = client.get("/app/_expo/static/js/web/entry-abc123.js")
    assert bundle.status_code == 200
    assert "immutable" in bundle.headers["Cache-Control"]
