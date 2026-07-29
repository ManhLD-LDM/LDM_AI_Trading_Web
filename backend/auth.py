import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field

# Configuration
import secrets as _secrets

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
_PLACEHOLDER = "generate_a_secure_random_key_here"

if not SECRET_KEY or SECRET_KEY == _PLACEHOLDER:
    _env = os.getenv("ENVIRONMENT", "development").lower()
    if _env == "production":
        raise RuntimeError(
            "FATAL: JWT_SECRET_KEY must be set in production!\n"
            "Generate: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    SECRET_KEY = _secrets.token_hex(32)
    print("[WARNING] JWT_SECRET_KEY not set. Using ephemeral random key (dev only). Sessions lost on restart.")

ALGORITHM = "HS256"
try:
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
except ValueError:
    ACCESS_TOKEN_EXPIRE_MINUTES = 60

# passlib removed
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UserInDB(BaseModel):
    email: str
    hashed_password: str
    preferences: dict = {}

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)

import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    # We will return the email, and the route can query the DB if needed
    return token_data.email
