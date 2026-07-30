import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "LDM AI Trading Backend is running"}

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["status"] == "ok"
    assert "database" in res_json
    assert "models" in res_json

def test_websocket():
    with client.websocket_connect("/ws") as websocket:
        # We don't send anything, just connect and verify connection succeeds
        assert websocket is not None
        # Disconnect happens implicitly when block ends
