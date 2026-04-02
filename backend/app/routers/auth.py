from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import jwt
from datetime import datetime, timedelta, timezone
import secrets
import os

from app.database import get_db
from app.models import User, UserRole

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


class LoginRequest(BaseModel):
    pid: str
    access_code: str


class LoginResponse(BaseModel):
    token: str
    user_id: int
    name: str
    role: str


class CreateUserRequest(BaseModel):
    pid: str
    name: str
    email: str | None = None
    role: UserRole


class CreateUserResponse(BaseModel):
    id: int
    pid: str
    name: str
    role: str
    access_code: str


class UserResponse(BaseModel):
    id: int
    pid: str
    name: str
    email: str | None
    role: str
    access_code: str


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    role: UserRole | None = None


class BatchCreateRequest(BaseModel):
    students: list[CreateUserRequest]


def create_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    authorization: str = Header(default=""),
    token: str = Query(default=""),
    db: Session = Depends(get_db),
) -> User:
    # Support both: Authorization header ("Bearer <token>") and ?token= query param
    auth_token = ""
    if authorization.startswith("Bearer "):
        auth_token = authorization[7:]
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(status_code=401, detail="No token provided")

    try:
        payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: UserRole):
    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return dependency


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.pid == req.pid,
        User.access_code == req.access_code
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid PID or access code")
    token = create_token(user.id, user.role.value)
    return LoginResponse(token=token, user_id=user.id, name=user.name, role=user.role.value)


@router.post("/users", response_model=CreateUserResponse)
def create_user(req: CreateUserRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.pid == req.pid).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this PID already exists")
    access_code = secrets.token_urlsafe(16)
    user = User(
        pid=req.pid,
        name=req.name,
        email=req.email,
        role=req.role,
        access_code=access_code,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return CreateUserResponse(
        id=user.id, pid=user.pid, name=user.name,
        role=user.role.value, access_code=user.access_code,
    )


@router.post("/users/batch", response_model=list[CreateUserResponse])
def batch_create_users(req: BatchCreateRequest, db: Session = Depends(get_db)):
    created = []
    for student_req in req.students:
        existing = db.query(User).filter(User.pid == student_req.pid).first()
        if existing:
            continue
        access_code = secrets.token_urlsafe(16)
        user = User(
            pid=student_req.pid,
            name=student_req.name,
            email=student_req.email,
            role=student_req.role,
            access_code=access_code,
        )
        db.add(user)
        db.flush()
        created.append(CreateUserResponse(
            id=user.id, pid=user.pid, name=user.name,
            role=user.role.value, access_code=user.access_code,
        ))
    db.commit()
    return created


@router.get("/users", response_model=list[UserResponse])
def list_users(
    role: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    users = query.order_by(User.id).all()
    return [
        UserResponse(
            id=u.id, pid=u.pid, name=u.name, email=u.email,
            role=u.role.value, access_code=u.access_code,
        )
        for u in users
    ]


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    req: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.name is not None:
        user.name = req.name
    if req.email is not None:
        user.email = req.email
    if req.role is not None:
        user.role = req.role

    db.commit()
    db.refresh(user)
    return UserResponse(
        id=user.id, pid=user.pid, name=user.name, email=user.email,
        role=user.role.value, access_code=user.access_code,
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reset-code")
def reset_user_code(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.access_code = secrets.token_urlsafe(16)
    db.commit()
    db.refresh(user)
    return {"access_code": user.access_code}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "pid": current_user.pid,
            "name": current_user.name, "role": current_user.role.value}
