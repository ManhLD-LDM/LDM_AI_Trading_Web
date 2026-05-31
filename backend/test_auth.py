import pytest
from datetime import timedelta
from auth import verify_password, get_password_hash, create_access_token
from jose import jwt, JWTError
import auth

def test_password_hashing():
    password = "secret_password"
    hashed = get_password_hash(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_create_access_token():
    data = {"sub": "test@user.com"}
    token = create_access_token(data=data, expires_delta=timedelta(minutes=15))
    
    # Verify token
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        email = payload.get("sub")
        assert email == "test@user.com"
        assert "exp" in payload
    except JWTError:
        pytest.fail("Token decoding failed")
