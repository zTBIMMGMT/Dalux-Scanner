# Dalux Scanner

A small, read-only browser for projects and files exposed by the Dalux Build API. It shows project, file-area, folder, and file IDs alongside file metadata.

## Requirements

- Python 3.10 or newer
- A Dalux API identity key with access to the projects you want to browse
- The API base URL provided for your Dalux environment

The supplied base URL is prefilled in the app: `https://node2.field.dalux.com/service/api`.

## Run locally

From this repository directory, create and activate a virtual environment, install dependencies, then start the server:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload
```

Open <http://127.0.0.1:8000> in a browser. Paste the API identity key into the connection form. The key is held in page memory only, sent to the local backend in request bodies, and forwarded to Dalux using `X-API-KEY`; it is not written to disk or browser storage.

## API coverage

The browser uses read-only operations from the current Dalux Build API specification (4.15):

- `GET /5.1/projects`
- `GET /5.1/projects/{projectId}/file_areas`
- `GET /5.1/projects/{projectId}/file_areas/{fileAreaId}/folders`
- `GET /6.1/projects/{projectId}/file_areas/{fileAreaId}/files?includeProperties=true`
- `GET /5.0/projects/{projectId}/file_areas/{fileAreaId}/files/{fileId}`

The API base URL is company/environment specific. This app does not attempt to guess or discover it. It presents the latest file version and metadata returned by Dalux; it does not upload, change, or delete project content.

## GitHub repository

The project is ready to initialize and publish as `Dalux-Scanner`. Create a repository with that name in your GitHub account, then add it as the `origin` remote and push the `main` branch. Git and GitHub CLI are not currently installed in the workspace environment.