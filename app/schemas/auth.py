from pydantic import BaseModel, ConfigDict, Field, SecretStr

from app.schemas.booking import to_camel


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=255)
    password: SecretStr = Field(min_length=1)


class LoginResponse(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    student_id: str
    name: str
    faculty: str
