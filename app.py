from __future__ import annotations

from urllib.parse import quote, urlsplit

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


app = FastAPI(title="Dalux Scanner", docs_url=None, redoc_url=None)


class DaluxCredentials(BaseModel):
    base_url: str = Field(alias="baseUrl", min_length=8, max_length=2048)
    api_key: str = Field(alias="apiKey", min_length=1, max_length=4096)


def validate_base_url(base_url: str) -> str:
    base_url = base_url.strip()
    parsed = urlsplit(base_url)
    local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    if (
        (parsed.scheme != "https" and not local_http)
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise HTTPException(
            status_code=422,
            detail="Enter a Dalux API base URL using HTTPS (HTTP is allowed for localhost).",
        )
    return base_url.rstrip("/")


async def dalux_get(credentials: DaluxCredentials, path: str, params: dict | None = None):
    base_url = validate_base_url(credentials.base_url)
    try:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=False) as client:
            response = await client.get(
                f"{base_url}/{path.lstrip('/')}",
                headers={"X-API-KEY": credentials.api_key},
                params=params,
            )
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Dalux API request timed out.") from error
    except httpx.RequestError as error:
        raise HTTPException(status_code=502, detail="Could not reach the configured Dalux API base URL.") from error

    if response.is_error:
        raise HTTPException(
            status_code=response.status_code if response.status_code < 500 else 502,
            detail=f"Dalux returned HTTP {response.status_code}.",
        )
    try:
        return response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Dalux returned an unexpected non-JSON response.") from error


def path_id(value: str) -> str:
    if not value.strip() or value in {".", ".."}:
        raise HTTPException(status_code=422, detail="A valid Dalux ID is required.")
    return quote(value, safe="")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/projects")
async def list_projects(credentials: DaluxCredentials):
    return await dalux_get(credentials, "5.1/projects")


@app.post("/api/projects/{project_id}/file-areas")
async def list_file_areas(project_id: str, credentials: DaluxCredentials):
    return await dalux_get(credentials, f"5.1/projects/{path_id(project_id)}/file_areas")


@app.post("/api/projects/{project_id}/file-areas/{file_area_id}/folders")
async def list_folders(project_id: str, file_area_id: str, credentials: DaluxCredentials):
    path = f"5.1/projects/{path_id(project_id)}/file_areas/{path_id(file_area_id)}/folders"
    return await dalux_get(credentials, path)


@app.post("/api/projects/{project_id}/file-areas/{file_area_id}/files")
async def list_files(project_id: str, file_area_id: str, credentials: DaluxCredentials):
    path = f"6.1/projects/{path_id(project_id)}/file_areas/{path_id(file_area_id)}/files"
    return await dalux_get(credentials, path, {"includeProperties": "true"})


@app.post("/api/projects/{project_id}/file-areas/{file_area_id}/files/{file_id}")
async def get_file(project_id: str, file_area_id: str, file_id: str, credentials: DaluxCredentials):
    path = (
        f"5.0/projects/{path_id(project_id)}/file_areas/{path_id(file_area_id)}"
        f"/files/{path_id(file_id)}"
    )
    return await dalux_get(credentials, path)


@app.get("/")
async def index():
    return FileResponse("static/index.html")


app.mount("/static", StaticFiles(directory="static"), name="static")