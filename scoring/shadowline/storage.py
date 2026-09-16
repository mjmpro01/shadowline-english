"""Reading audio the API stored, from S3/MinIO or from a directory.

Mirrors ``server/internal/storage``: the worker only ever reads, so this is the
smaller half of that interface.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol


class ObjectMissing(RuntimeError):
    """The key is recorded in the database but nothing is stored under it."""


class Storage(Protocol):
    def get(self, bucket: str, key: str) -> bytes: ...


class DiskStorage:
    """A directory per bucket. Used by tests and by a run with no MinIO."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def get(self, bucket: str, key: str) -> bytes:
        # Keys are written by the API, but a traversal here would be a
        # file-system read primitive, so it is checked rather than assumed.
        path = (self.root / bucket / key).resolve()
        base = (self.root / bucket).resolve()
        if not str(path).startswith(str(base) + os.sep):
            raise ObjectMissing(f"invalid key {key!r}")
        try:
            return path.read_bytes()
        except FileNotFoundError as err:
            raise ObjectMissing(f"{bucket}/{key}") from err


class S3Storage:
    def __init__(self, endpoint: str, access_key: str, secret_key: str, secure: bool,
                 buckets: dict[str, str]) -> None:
        from minio import Minio
        from minio.error import S3Error

        self._error = S3Error
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        self._buckets = buckets

    def get(self, bucket: str, key: str) -> bytes:
        response = None
        try:
            response = self._client.get_object(self._buckets[bucket], key)
            return response.read()
        except self._error as err:
            if err.code in ("NoSuchKey", "NoSuchBucket"):
                raise ObjectMissing(f"{bucket}/{key}") from err
            raise
        finally:
            if response is not None:
                response.close()
                response.release_conn()


def from_env() -> Storage:
    """Picks the backend the API is using, from the same variables it reads."""
    endpoint = os.environ.get("S3_ENDPOINT", "")
    if endpoint:
        return S3Storage(
            endpoint,
            os.environ.get("S3_ACCESS_KEY", ""),
            os.environ.get("S3_SECRET_KEY", ""),
            os.environ.get("S3_USE_SSL", "") == "1",
            {
                "clips": os.environ.get("S3_CLIPS_BUCKET", "clips"),
                "takes": os.environ.get("S3_TAKES_BUCKET", "takes"),
            },
        )
    root = os.environ.get("DISK_ROOT", "")
    if not root:
        raise RuntimeError("set S3_ENDPOINT for object storage, or DISK_ROOT for local disk")
    return DiskStorage(root)
