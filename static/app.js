const DEFAULT_BASE_URL = "https://node2.field.dalux.com/service/api";

const elements = {
  form: document.querySelector("#connection-form"),
  baseUrl: document.querySelector("#base-url"),
  apiKey: document.querySelector("#api-key"),
  connectButton: document.querySelector("#connect-button"),
  connectionState: document.querySelector("#connection-state"),
  projectSelect: document.querySelector("#project-select"),
  projectCount: document.querySelector("#project-count"),
  areaTabs: document.querySelector("#area-tabs"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  search: document.querySelector("#file-search"),
  rows: document.querySelector("#file-rows"),
  notice: document.querySelector("#notice"),
  visibleCount: document.querySelector("#visible-count"),
  areaSummary: document.querySelector("#area-summary"),
  details: document.querySelector("#details-panel"),
  refresh: document.querySelector("#refresh-button"),
};

const state = {
  credentials: null,
  projects: [],
  project: null,
  areas: [],
  area: null,
  folders: [],
  files: [],
  folderId: "",
  selectedFileId: "",
};

elements.baseUrl.value = DEFAULT_BASE_URL;

function record(item) {
  return item?.data && typeof item.data === "object" ? item.data : item;
}

function listFrom(payload) {
  if (Array.isArray(payload)) return payload.map(record);
  if (Array.isArray(payload?.items)) return payload.items.map(record);
  if (Array.isArray(payload?.data)) return payload.data.map(record);
  return [];
}

function displayName(item, candidates, fallback = "Unnamed") {
  for (const key of candidates) {
    if (item?.[key] !== undefined && item[key] !== null && String(item[key]).trim()) {
      return String(item[key]);
    }
  }
  return fallback;
}

function idOf(item, key) {
  return item?.[key] == null ? "" : String(item[key]);
}

function escapePath(value) {
  return encodeURIComponent(value);
}

async function api(path, extra = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...state.credentials, ...extra }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Request failed (HTTP ${response.status}).`);
  return body;
}

function setConnection(label, status = "") {
  elements.connectionState.className = `connection-state${status ? ` is-${status}` : ""}`;
  elements.connectionState.lastChild.textContent = ` ${label}`;
}

function showNotice(message = "") {
  elements.notice.textContent = message;
  elements.notice.hidden = !message;
}

function setPlaceholder(message) {
  const row = document.createElement("tr");
  row.className = "placeholder-row";
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.textContent = message;
  row.append(cell);
  elements.rows.replaceChildren(row);
}

function setBusy(busy) {
  elements.connectButton.disabled = busy;
  elements.connectButton.textContent = busy ? "Connecting..." : "Connect to Dalux";
  setConnection(busy ? "Connecting" : state.credentials ? "Connected" : "Not connected", busy ? "busy" : state.credentials ? "connected" : "");
}

function updateCounters() {
  elements.projectCount.textContent = state.projects.length
    ? `${state.projects.length} project${state.projects.length === 1 ? "" : "s"}`
    : "No projects loaded";
  elements.areaSummary.textContent = state.area ? displayName(state.area, ["fileAreaName", "name"]) : "";
}

function renderProjects() {
  const options = [new Option("Select a project", "")];
  for (const project of state.projects) {
    const id = idOf(project, "projectId");
    const name = displayName(project, ["projectName", "name"], id || "Unnamed project");
    options.push(new Option(name, id));
  }
  elements.projectSelect.replaceChildren(...options);
  elements.projectSelect.disabled = !state.projects.length;
  updateCounters();
}

function renderAreas() {
  elements.areaTabs.replaceChildren();
  if (!state.areas.length) {
    const empty = document.createElement("span");
    empty.className = "area-empty";
    empty.textContent = "No file areas available";
    elements.areaTabs.append(empty);
    return;
  }
  for (const area of state.areas) {
    const id = idOf(area, "fileAreaId");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "area-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(id === idOf(state.area, "fileAreaId")));
    button.textContent = displayName(area, ["fileAreaName", "name", "fileAreaType"], "File area");
    button.addEventListener("click", () => selectArea(area));
    elements.areaTabs.append(button);
  }
}

function currentFolder() {
  return state.folders.find((folder) => idOf(folder, "folderId") === state.folderId) || null;
}

function folderAncestors(folder) {
  const result = [];
  const visited = new Set();
  let current = folder;
  while (current) {
    const id = idOf(current, "folderId");
    if (!id || visited.has(id)) break;
    visited.add(id);
    result.unshift(current);
    const parentId = idOf(current, "parentFolderId");
    current = state.folders.find((candidate) => idOf(candidate, "folderId") === parentId);
  }
  return result;
}

function renderBreadcrumbs() {
  elements.breadcrumbs.replaceChildren();
  if (!state.area) {
    const muted = document.createElement("span");
    muted.className = "crumb-muted";
    muted.textContent = "No folder selected";
    elements.breadcrumbs.append(muted);
    return;
  }
  const root = document.createElement("button");
  root.type = "button";
  root.className = `crumb${state.folderId ? "" : " crumb-current"}`;
  root.textContent = displayName(state.area, ["fileAreaName", "name", "fileAreaType"], "File area");
  root.addEventListener("click", () => openFolder(""));
  elements.breadcrumbs.append(root);
  const ancestors = folderAncestors(currentFolder());
  ancestors.forEach((folder, index) => {
    const separator = document.createElement("span");
    separator.className = "crumb-separator";
    separator.textContent = "/";
    const crumb = document.createElement("button");
    crumb.type = "button";
    crumb.className = `crumb${index === ancestors.length - 1 ? " crumb-current" : ""}`;
    crumb.textContent = displayName(folder, ["folderName", "name"]);
    const folderId = idOf(folder, "folderId");
    crumb.addEventListener("click", () => openFolder(folderId));
    elements.breadcrumbs.append(separator, crumb);
  });
}

function formatSize(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function visibleEntries() {
  const folderId = state.folderId;
  const folders = state.folders.filter((folder) => idOf(folder, "parentFolderId") === folderId);
  const files = state.files.filter((file) => idOf(file, "folderId") === folderId);
  const query = elements.search.value.trim().toLocaleLowerCase();
  return [
    ...folders.map((folder) => ({ kind: "folder", item: folder })),
    ...files.map((file) => ({ kind: "file", item: file })),
  ].filter(({ kind, item }) => {
    const name = kind === "folder"
      ? displayName(item, ["folderName", "name"])
      : displayName(item, ["fileName", "name"]);
    return !query || name.toLocaleLowerCase().includes(query);
  }).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    const leftName = displayName(left.item, left.kind === "folder" ? ["folderName", "name"] : ["fileName", "name"]);
    const rightName = displayName(right.item, right.kind === "folder" ? ["folderName", "name"] : ["fileName", "name"]);
    return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
  });
}

function renderFiles() {
  const entries = visibleEntries();
  if (!state.area) {
    setPlaceholder(state.project ? "Choose a file area to view its contents." : "Connect to Dalux to browse project files.");
    elements.visibleCount.textContent = state.project ? "Choose a file area" : "Waiting for connection";
    return;
  }
  if (!entries.length) {
    setPlaceholder(elements.search.value.trim() ? "No matching files or folders." : "This folder is empty.");
    elements.visibleCount.textContent = elements.search.value.trim() ? "No matches" : "0 items";
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const { kind, item } of entries) {
    const isFolder = kind === "folder";
    const id = idOf(item, isFolder ? "folderId" : "fileId");
    const name = displayName(item, isFolder ? ["folderName", "name"] : ["fileName", "name"], id || "Unnamed");
    const row = document.createElement("tr");
    if (id && id === state.selectedFileId) row.className = "is-selected";

    const nameCell = document.createElement("td");
    nameCell.className = "file-name-cell";
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "name-button";
    const icon = document.createElement("span");
    icon.className = `type-icon ${isFolder ? "folder" : typeClass(item.fileType)}`;
    icon.setAttribute("aria-hidden", "true");
    const nameSpan = document.createElement("span");
    nameSpan.className = "item-name";
    nameSpan.textContent = name;
    nameButton.append(icon, nameSpan);
    nameButton.addEventListener("click", () => isFolder ? openFolder(id) : selectFile(item));
    nameCell.append(nameButton);

    const typeCell = document.createElement("td");
    typeCell.className = "kind-label";
    typeCell.textContent = isFolder ? "Folder" : displayName(item, ["fileType"], "File");
    const modifiedCell = document.createElement("td");
    modifiedCell.className = "date-label";
    modifiedCell.textContent = isFolder ? "-" : displayName(item, ["lastModified", "uploaded"], "-");
    const sizeCell = document.createElement("td");
    sizeCell.className = "size-cell";
    sizeCell.textContent = isFolder ? "-" : formatSize(item.fileSize);
    row.append(nameCell, typeCell, modifiedCell, sizeCell);
    fragment.append(row);
  }
  elements.rows.replaceChildren(fragment);
  elements.visibleCount.textContent = `${entries.length} item${entries.length === 1 ? "" : "s"}`;
}

function typeClass(type = "") {
  const normalized = String(type).toLowerCase();
  return normalized === "drawing" || normalized === "model" ? normalized : "document";
}

function valueText(value) {
  if (value == null) return "-";
  if (typeof value !== "object") return String(value);
  return Object.values(value).map((part) => typeof part === "object" ? valueText(part) : String(part ?? "")).filter(Boolean).join(" · ") || "-";
}

function metadataEntries(file) {
  const properties = Array.isArray(file.properties) ? file.properties : [];
  return properties.map((property) => ({
    name: displayName(property, ["name", "key"], "Property"),
    value: Array.isArray(property.values) ? property.values.map(valueText).join(", ") : valueText(property.value),
  }));
}

function renderDetails(file, loading = false) {
  if (!file) {
    elements.details.innerHTML = "<div class=\"details-empty\"><span class=\"detail-rule\"></span><span class=\"eyebrow\">File details</span><h2>Select a file</h2><p>File IDs and available metadata will appear here.</p></div>";
    return;
  }
  const id = idOf(file, "fileId");
  const name = displayName(file, ["fileName", "name"], id || "Unnamed file");
  const properties = metadataEntries(file);
  const details = document.createElement("div");
  details.className = "details-content";
  const rule = document.createElement("span");
  rule.className = "detail-rule";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "File details";
  const heading = document.createElement("div");
  heading.className = "detail-heading";
  const title = document.createElement("h2");
  title.textContent = name;
  const type = document.createElement("span");
  type.className = "detail-type";
  type.textContent = displayName(file, ["fileType"], "File");
  heading.append(title, type);
  const idLabel = document.createElement("span");
  idLabel.className = "detail-id-label";
  idLabel.textContent = "File ID";
  const idValue = document.createElement("code");
  idValue.className = "detail-id";
  idValue.textContent = id || "Not provided";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-button";
  copy.textContent = "Copy file ID";
  copy.disabled = !id;
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(id);
    copy.textContent = "Copied";
    window.setTimeout(() => { copy.textContent = "Copy file ID"; }, 1300);
  });
  details.append(rule, eyebrow, heading, idLabel, idValue, copy);

  const core = [
    ["Revision ID", file.fileRevisionId],
    ["Folder ID", file.folderId],
    ["File area ID", file.fileAreaId],
    ["Version", file.version],
    ["Last modified", file.lastModified],
    ["File size", formatSize(file.fileSize)],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (core.length || properties.length) {
    const section = document.createElement("h3");
    section.className = "metadata-heading";
    section.textContent = "Metadata";
    const list = document.createElement("dl");
    list.className = "metadata-list";
    for (const [label, value] of core) appendMetadata(list, label, valueText(value));
    for (const property of properties) appendMetadata(list, property.name, property.value);
    details.append(section, list);
  }
  if (loading) {
    const note = document.createElement("p");
    note.className = "loading-line";
    note.textContent = "Loading latest details from Dalux...";
    details.append(note);
  }
  elements.details.replaceChildren(details);
}

function appendMetadata(list, label, value) {
  const entry = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  entry.append(term, description);
  list.append(entry);
}

async function selectFile(file) {
  state.selectedFileId = idOf(file, "fileId");
  renderFiles();
  renderDetails(file, true);
  if (!state.project || !state.area || !state.selectedFileId) return;
  try {
    const detail = record(await api(
      `/api/projects/${escapePath(idOf(state.project, "projectId"))}/file-areas/${escapePath(idOf(state.area, "fileAreaId"))}/files/${escapePath(state.selectedFileId)}`,
    ));
    renderDetails(detail);
  } catch (error) {
    renderDetails(file);
    showNotice(error.message);
  }
}

async function loadAreaContents() {
  if (!state.project || !state.area) return;
  state.folderId = "";
  state.selectedFileId = "";
  elements.search.value = "";
  elements.search.disabled = false;
  showNotice();
  setPlaceholder("Loading folders and files...");
  elements.visibleCount.textContent = "Loading...";
  renderDetails(null);
  renderBreadcrumbs();
  const projectId = escapePath(idOf(state.project, "projectId"));
  const areaId = escapePath(idOf(state.area, "fileAreaId"));
  try {
    const [folders, files] = await Promise.all([
      api(`/api/projects/${projectId}/file-areas/${areaId}/folders`),
      api(`/api/projects/${projectId}/file-areas/${areaId}/files`),
    ]);
    state.folders = listFrom(folders);
    state.files = listFrom(files);
    renderBreadcrumbs();
    renderFiles();
    elements.refresh.disabled = false;
    updateCounters();
  } catch (error) {
    state.folders = [];
    state.files = [];
    setPlaceholder("Could not load this file area.");
    elements.visibleCount.textContent = "Load failed";
    showNotice(error.message);
  }
}

function openFolder(folderId) {
  state.folderId = folderId;
  state.selectedFileId = "";
  renderBreadcrumbs();
  renderFiles();
  renderDetails(null);
}

async function selectArea(area) {
  state.area = area;
  renderAreas();
  await loadAreaContents();
}

async function selectProject(projectId) {
  state.project = state.projects.find((project) => idOf(project, "projectId") === projectId) || null;
  state.areas = [];
  state.area = null;
  state.folders = [];
  state.files = [];
  state.folderId = "";
  state.selectedFileId = "";
  elements.refresh.disabled = true;
  elements.search.disabled = true;
  renderAreas();
  renderBreadcrumbs();
  renderFiles();
  renderDetails(null);
  updateCounters();
  if (!state.project) return;
  showNotice();
  setPlaceholder("Loading file areas...");
  elements.visibleCount.textContent = "Loading...";
  try {
    state.areas = listFrom(await api(`/api/projects/${escapePath(projectId)}/file-areas`));
    renderAreas();
    if (state.areas.length) await selectArea(state.areas[0]);
    else renderFiles();
  } catch (error) {
    showNotice(error.message);
    setPlaceholder("Could not load file areas.");
    elements.visibleCount.textContent = "Load failed";
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.credentials = {
    baseUrl: elements.baseUrl.value.trim(),
    apiKey: elements.apiKey.value,
  };
  setBusy(true);
  showNotice();
  try {
    state.projects = listFrom(await api("/api/projects"));
    renderProjects();
    setConnection("Connected", "connected");
    elements.apiKey.value = "";
    if (state.projects.length) {
      const firstId = idOf(state.projects[0], "projectId");
      elements.projectSelect.value = firstId;
      await selectProject(firstId);
    } else {
      setPlaceholder("No projects are available to this API identity.");
      elements.visibleCount.textContent = "0 projects";
    }
  } catch (error) {
    state.credentials = null;
    state.projects = [];
    renderProjects();
    setConnection("Not connected");
    showNotice(error.message);
    setPlaceholder("Could not connect to Dalux.");
    elements.visibleCount.textContent = "Connection failed";
  } finally {
    setBusy(false);
  }
});

elements.projectSelect.addEventListener("change", () => selectProject(elements.projectSelect.value));
elements.search.addEventListener("input", renderFiles);
elements.refresh.addEventListener("click", loadAreaContents);

renderBreadcrumbs();
renderFiles();