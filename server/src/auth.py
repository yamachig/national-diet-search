import os
from typing import Any, Literal, Union

from fastapi import Header, HTTPException, status
from pydantic import BaseModel, Field, TypeAdapter
from typing_extensions import Annotated


class FireBaseAuthSettings(BaseModel):
    type: Literal["firebase"]
    firebaseConfig: Any


class NoAuthSettings(BaseModel):
    type: Literal["none"]


AuthSettings = Annotated[
    Union[FireBaseAuthSettings, NoAuthSettings], Field(discriminator="type")
]
auth_settings_adapter: TypeAdapter[AuthSettings] = TypeAdapter(AuthSettings)


AUTH_SETTINGS_RAW = os.environ.get("AUTH_SETTINGS", '{"type":"none"}')
AUTH_SETTINGS = auth_settings_adapter.validate_json(AUTH_SETTINGS_RAW)

if AUTH_SETTINGS.type == "firebase":
    from firebase_admin import credentials, initialize_app  # type: ignore

    FIREBASE_CREDENTIALS = os.environ.get("FIREBASE_CREDENTIALS") or None
    cred = FIREBASE_CREDENTIALS and credentials.Certificate(FIREBASE_CREDENTIALS)
    default_app = initialize_app(cred)  # type: ignore


def verify_authorization(authorization: str | None = Header(default=None)):
    if AUTH_SETTINGS.type == "none":
        return
    elif AUTH_SETTINGS.type == "firebase":
        if authorization:
            from firebase_admin import auth as firebase_auth  # type: ignore

            token = authorization.split(" ")[1]
            try:
                decoded_token = firebase_auth.verify_id_token(  # type: ignore
                    token
                )
                user: firebase_auth.UserInfo = (  # type: ignore
                    firebase_auth.get_user(  # type: ignore
                        decoded_token["uid"]  # type: ignore
                    )
                )
                print(f"{user.uid=}, {user.disabled=}")  # type: ignore
            except Exception as e:
                print(f"Error with authentication: {e}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer error='invalid_token'"},
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer realm='token_required'"},
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unknown auth type",
        )
