from auth.models import UserRole
from pydantic import BaseModel


class RoleUpdate(BaseModel):
    role: UserRole
