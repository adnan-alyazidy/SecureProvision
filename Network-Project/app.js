/* =========================================================
   SecureProvision — app.js
   1. vis.js network topology canvas (native shapes, dark theme)
   2. "Add Node" button — dynamically inserts devices
   3. chat interface
   ========================================================= */
 
(function () {
  'use strict';
 
  // Single source of truth for the backend's origin. To let someone on
  // another device (e.g. a friend on the same network) reach this app,
  // swap 'localhost' for this machine's IPv4 address (e.g.
  // 'http://192.168.1.42:8080') — every fetch call below is built from
  // this constant, so nothing else needs to change.
  //
  // Resolved dynamically so the same file works locally and through a
  // VS Code Dev Tunnel:
  //   - localhost / 127.0.0.1  -> http://localhost:8080
  //   - https://<id>-5500.<region>.devtunnels.ms -> same host with the
  //     port segment swapped to 8080 (Dev Tunnels encode the port in the
  //     hostname, so the backend tunnel must forward port 8080 too)
  //   - anything else (LAN IP etc.) -> same host, port 8080
  function resolveApiBaseUrl() {
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:') {
      return 'http://localhost:8080';
    }
    if (hostname.endsWith('.devtunnels.ms')) {
      return `${protocol}//${hostname.replace(/-\d+(?=\.)/, '-8080')}`;
    }
    return `${protocol}//${hostname}:8080`;
  }
  const API_BASE_URL = resolveApiBaseUrl();
  // Declared up here (not next to the lab code) because the logged-in
  // startup path calls into the lab functions before that section runs.
  const LABS_API_BASE = `${API_BASE_URL}/api/labs`;
 
  // Dev Tunnels show an HTML "are you sure?" interstitial for browser
  // requests unless this header is present. Shadowing fetch inside this
  // IIFE guarantees it is attached to EVERY request in this file without
  // touching each call site.
  const nativeFetch = window.fetch.bind(window);
  function fetch(url, options) {
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({}, opts.headers, { 'bypass-tunnel-reminder': 'true' });
    return nativeFetch(url, opts);
  }
 
  // Builds the auth headers the backend's interceptor checks for on
  // protected endpoints (/api/chat/**, /api/labs/upload, /api/labs/{id}
  // DELETE — see AuthHeaderInterceptor.java). Returns {} if not logged
  // in, so spreading it into a fetch's headers is always safe even for
  // a guest — the request will just get a 401 from the backend for any
  // endpoint that actually requires them.
  function getAuthHeaders() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    if (!username || !role) return {};
    return { 'X-User-Username': username, 'X-User-Role': role };
  }
 
  /* ----------------------------------------------------
     1. NETWORK TOPOLOGY CANVAS (vis.js)
  ---------------------------------------------------- */
  const container = document.getElementById('network-container');
 
  // Device styling — native vis.js shapes only (box/ellipse), explicit
  // solid fill colors, white font. No external images or icon fonts —
  // L2 vs L3 switches are distinguished by color, not iconography, to
  // stay consistent with the rest of the palette.
  const DEVICE_STYLES = {
    router:   { shape: 'box',     color: '#1e3a8a', label: 'Router' },        // dark blue
    switchL2: { shape: 'box',     color: '#14532d', label: 'Switch - L2' },   // dark green
    switchL3: { shape: 'box',     color: '#115e59', label: 'Switch - L3' },   // dark teal (routing-capable)
    pc:       { shape: 'ellipse', color: '#4b5563', label: 'PC' },            // grey
    server:   { shape: 'box',     color: '#92400e', label: 'Server' },        // amber/brown
    ap:       { shape: 'ellipse', color: '#0e7490', label: 'Access Point' },  // teal
    firewall: { shape: 'box',     color: '#7f1d1d', label: 'Firewall' },      // dark red
  };
 
  // Tracks how many of each device type exist so new nodes auto-label
  // as "Router 1", "Switch - L2 2", "PC 1", etc.
  const deviceCounts = {
    router: 1, switchL2: 1, switchL3: 0,
    pc: 0, server: 0, ap: 0, firewall: 0,
  };
 
  function makeNode(id, label, deviceTypeKey, extra) {
    const style = DEVICE_STYLES[deviceTypeKey] || DEVICE_STYLES.pc;
    return Object.assign(
      {
        id,
        label,
        // Explicit, human-readable device type (e.g. "Router", "Switch",
        // "Firewall") stored directly on the node — so any backend
        // consuming the topology can identify device roles reliably,
        // independent of whatever label text the user gives it.
        deviceType: style.label,
        // The editable display name — starts equal to the auto-generated
        // label (e.g. "Router 1") and is overwritten if the user renames
        // the device via double-click.
        customName: label,
        shape: style.shape,
        color: {
          background: style.color,
          border: '#ffffff',
          highlight: { background: style.color, border: '#21e6a8' },
          hover: { background: style.color, border: '#3e9dff' },
        },
        font: {
          color: '#ffffff',
          face: 'JetBrains Mono, monospace',
          size: 14,
        },
        borderWidth: 1.5,
        margin: 10,
      },
      extra || {}
    );
  }
 
  // Default starting topology: Node 1 = Router 1, Node 2 = an L2 Switch, connected.
  const nodes = new vis.DataSet([
    makeNode(1, 'Router 1', 'router', { x: -100, y: 0 }),
    makeNode(2, 'Switch - L2 1', 'switchL2', { x: 100, y: 0 }),
  ]);
 
  // Edges carry optional fromPort / toPort strings (e.g. "Gig0/0/1") set
  // by clicking the port indicator dots — see the "INTERACTIVE PORT
  // LABELS" section below. Both start unset on the default edge.
  const edges = new vis.DataSet([
    { id: 1, from: 1, to: 2, fromPort: null, toPort: null },
  ]);
 
  const data = { nodes, edges };
 
  const options = {
    autoResize: true,
    height: '100%',
    width: '100%',
    nodes: {
      shapeProperties: { borderRadius: 4 },
    },
    edges: {
      color: { color: '#3e9dff', highlight: '#21e6a8', hover: '#3e9dff' },
      width: 2,
      smooth: { type: 'cubicBezier', roundness: 0.4 },
      arrows: { to: { enabled: false } },
    },
    // Physics disabled — this is a provisioning tool, not a force-directed
    // graph. Nodes stay exactly where they're placed or dragged; no
    // spring/bounce auto-layout after interaction.
    physics: {
      enabled: false,
    },
    interaction: {
      hover: true,
      dragView: true,
      dragNodes: true,
      zoomView: true,
    },
    // manipulation stays enabled:false so vis.js's default floating
    // toolbar never renders — we drive edge creation entirely through
    // our own "Connect Devices" button and the addEdge hook below.
    manipulation: {
      enabled: false,
      addEdge: function (edgeData, callback) {
        // Prevent a device from being cabled to itself.
        if (edgeData.from === edgeData.to) {
          callback(null);
        } else {
          edgeData.fromPort = null;
          edgeData.toPort = null;
          edges.add(edgeData);
          callback(edgeData);
        }
        // One cable per click of "Connect Devices" — drop back into
        // normal select/drag mode immediately after.
        network.disableEditMode();
        connectBtn.classList.remove('active');
      },
    },
  };
 
  const network = new vis.Network(container, data, options);
 
  // Double-click a node to rename it. The visual label becomes two
  // lines — the custom name on top, the device type underneath in
  // parentheses — so the device's role is never lost even after a
  // rename. The clean custom name is also stored separately in
  // `customName` so the backend can read it directly without having
  // to parse the multi-line display label.
  network.on('doubleClick', (params) => {
    if (params.nodes.length === 0) return;
 
    const nodeId = params.nodes[0];
    const node = nodes.get(nodeId);
    if (!node) return;
 
    const newName = prompt('Enter custom name for this device:', node.customName || '');
    if (newName === null) return; // user hit Cancel
 
    const trimmedName = newName.trim();
    if (!trimmedName) return; // ignore empty input
 
    nodes.update({
      id: nodeId,
      customName: trimmedName,
      label: `${trimmedName}\n(${node.deviceType})`,
    });
  });
 
  // One-time fit on initial load only (handles late web-font sizing).
  // Not re-run afterward so it never disturbs positions the user has
  // dragged nodes to.
  window.addEventListener('load', () => {
    network.redraw();
    network.fit();
  }, { once: true });
 
  const nodeCountEl = document.getElementById('nodeCount');
  const edgeCountEl = document.getElementById('edgeCount');
 
  function updateCounts() {
    nodeCountEl.textContent = `${nodes.length} node${nodes.length === 1 ? '' : 's'}`;
    edgeCountEl.textContent = `${edges.length} link${edges.length === 1 ? '' : 's'}`;
  }
 
  nodes.on('*', updateCounts);
  edges.on('*', updateCounts);
  updateCounts();
 
  /* ----------------------------------------------------
     2. ADD DEVICE / DELETE SELECTED CONTROLS
  ---------------------------------------------------- */
  const deviceTypeSelect = document.getElementById('device-type');
  const addDeviceBtn = document.getElementById('addDeviceBtn');
  const connectBtn = document.getElementById('connectBtn');
  const deleteBtn = document.getElementById('deleteBtn');
 
  // Persistent global ID counter — independent of the DataSet's current
  // contents, so it keeps working correctly even after every node has
  // been deleted (nodes.getIds() would otherwise return an empty array,
  // and Math.max() on nothing returns -Infinity).
  let nextNodeId = 100;
 
  function getNextId() {
    return nextNodeId++;
  }
 
  function addDevice(deviceType) {
    const style = DEVICE_STYLES[deviceType] || DEVICE_STYLES.pc;
    const id = getNextId();
 
    deviceCounts[deviceType] = (deviceCounts[deviceType] || 0) + 1;
    const label = `${style.label} ${deviceCounts[deviceType]}`;
 
    let x, y, anchorId = null;
    const selectedNodeIds = network.getSelectedNodes();
 
    if (selectedNodeIds.length > 0) {
      // A node is selected — spawn the new device just offset from it,
      // and auto-cable the two together.
      anchorId = selectedNodeIds[0];
      const anchorPos = network.getPositions([anchorId])[anchorId];
      x = anchorPos.x + 80;
      y = anchorPos.y + 80;
    } else {
      // Nothing selected — drop it near canvas center with a small
      // random offset so successive additions don't stack exactly.
      x = Math.floor(Math.random() * 201) - 100; // -100..100
      y = Math.floor(Math.random() * 201) - 100; // -100..100
      const existingIds = nodes.getIds();
      anchorId = existingIds.length ? Math.max(...existingIds) : null;
    }
 
    nodes.add(makeNode(id, label, deviceType, { x, y }));
    if (anchorId !== null) {
      edges.add({ from: id, to: anchorId, fromPort: null, toPort: null });
    }
    network.selectNodes([id]);
  }
 
  addDeviceBtn.addEventListener('click', () => {
    addDevice(deviceTypeSelect.value);
  });
 
  // "Connect Devices" toggles vis.js's built-in edge-drawing interaction
  // mode: click it, then click-drag from one node to another to cable
  // them. The addEdge hook in `options.manipulation` above handles
  // actually committing the edge and auto-exits the mode afterward.
  // Clicking the button again while active cancels drawing.
  connectBtn.addEventListener('click', () => {
    if (connectBtn.classList.contains('active')) {
      network.disableEditMode();
      connectBtn.classList.remove('active');
    } else {
      network.addEdgeMode();
      connectBtn.classList.add('active');
    }
  });
 
  deleteBtn.addEventListener('click', () => {
    // Removes whatever is currently selected — nodes and/or edges —
    // directly from the underlying DataSets, so the counters and any
    // connected edges stay in sync automatically.
    network.deleteSelected();
  });
 
  /* ----------------------------------------------------
     3. "NEW PROJECT" — wipes the canvas, the chat, and
        the AI's server-side conversation memory
  ---------------------------------------------------- */
  const newProjectBtn = document.getElementById('newProjectBtn');
  const CHAT_RESET_URL = `${API_BASE_URL}/api/chat/reset`;
 
  newProjectBtn.addEventListener('click', async () => {
    const confirmed = confirm(
      'Start a new project? This clears the canvas, the chat, and the AI\'s memory of this conversation.'
    );
    if (!confirmed) return;
 
    // a) Clear the canvas
    nodes.clear();
    edges.clear();
    Object.keys(deviceCounts).forEach((key) => { deviceCounts[key] = 0; });
    nextNodeId = 100;
    setCurrentProject(null);
 
    // b) Clear the chat UI
    chatMessages.innerHTML = '';
    addMessage(
      'Ready when you are. I can scaffold a topology, suggest firewall rules, or flag risky exposures on the canvas.',
      'assistant'
    );
 
    // c) Clear the AI's backend memory — protected endpoint, needs auth headers
    try {
      const res = await fetch(CHAT_RESET_URL, { method: 'GET', headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }
      console.log('[SecureProvision] AI conversation memory cleared on the backend.');
    } catch (err) {
      console.error('[SecureProvision] Failed to reset backend chat memory:', err);
      addMessage(
        'Note: the canvas and chat were reset locally, but I couldn\'t confirm the AI backend cleared its memory. Is it running at ' + CHAT_RESET_URL + '?',
        'assistant'
      );
    }
  });
 
 
  /* ----------------------------------------------------
     3b. PROJECT PERSISTENCE — Save Project / My Projects
         Stored per-user in the backend DB (/api/projects),
         so projects follow the user across devices.
  ---------------------------------------------------- */
  const PROJECTS_API_BASE = `${API_BASE_URL}/api/projects`;
 
  const saveProjectBtn = document.getElementById('saveProjectBtn');
  const myProjectsBtn = document.getElementById('myProjectsBtn');
  const currentProjectChip = document.getElementById('currentProjectChip');
 
  const saveProjectModal = document.getElementById('saveProjectModal');
  const saveProjectForm = document.getElementById('saveProjectForm');
  const saveProjectNameInput = document.getElementById('saveProjectNameInput');
  const saveProjectStatus = document.getElementById('saveProjectStatus');
  const saveProjectCancelBtn = document.getElementById('saveProjectCancelBtn');
  const saveProjectSubmitBtn = document.getElementById('saveProjectSubmitBtn');
 
  const projectsModal = document.getElementById('projectsModal');
  const projectsList = document.getElementById('projectsList');
  const projectsStatus = document.getElementById('projectsStatus');
  const projectsCloseBtn = document.getElementById('projectsCloseBtn');
 
  // Name of the project currently on the canvas (set on save / load,
  // cleared on New Project) — used to pre-fill the save dialog.
  let currentProjectName = null;
  let pendingOverwrite = false;
 
  function setCurrentProject(name) {
    currentProjectName = name || null;
    if (currentProjectChip) {
      currentProjectChip.textContent = currentProjectName ? `Project: ${currentProjectName}` : '';
      currentProjectChip.style.display = currentProjectName ? '' : 'none';
    }
  }
 
  // Everything needed to rebuild the canvas exactly: full node objects
  // (label, customName, deviceType, shape, colours), their live x/y
  // (physics is off, so positions only exist in the network), every
  // edge with its port labels, plus the numbering counters so new
  // devices continue "Router 3", "Router 4"... instead of restarting.
  function serializeProject() {
    const positions = network.getPositions();
    return {
      version: 1,
      nodes: nodes.get().map((n) => {
        const pos = positions[n.id];
        return pos ? Object.assign({}, n, { x: pos.x, y: pos.y }) : Object.assign({}, n);
      }),
      edges: edges.get(),
      deviceCounts: Object.assign({}, deviceCounts),
      nextNodeId,
    };
  }
 
  function loadProjectState(state) {
    if (!state || !Array.isArray(state.nodes) || !Array.isArray(state.edges)) {
      throw new Error('Project data is missing nodes or edges.');
    }
    network.disableEditMode();
    connectBtn.classList.remove('active');
 
    nodes.clear();
    edges.clear();
    nodes.add(state.nodes);
    edges.add(state.edges);
 
    Object.keys(deviceCounts).forEach((key) => { deviceCounts[key] = 0; });
    Object.assign(deviceCounts, state.deviceCounts || {});
 
    // Never let the counter fall at or below an existing id.
    const maxId = state.nodes.reduce((m, n) => (typeof n.id === 'number' && n.id > m ? n.id : m), 0);
    nextNodeId = Math.max(Number(state.nextNodeId) || 100, maxId + 1, 100);
 
    network.unselectAll();
    network.fit({ animation: false });
    network.redraw();
  }
 
  function openModal(el) { el.style.display = 'flex'; }
  function closeModal(el) { el.style.display = 'none'; }
 
  function formatTimestamp(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
 
  async function readError(res) {
    if (res.status === 401) return 'Please log in to manage projects.';
    try {
      const body = await res.json();
      return body.message || body.error || `Server responded with status ${res.status}`;
    } catch (e) {
      return `Server responded with status ${res.status}`;
    }
  }
 
  // --- Save ---
  saveProjectBtn.addEventListener('click', () => {
    if (!isLoggedIn()) {
      alert('Please log in to save projects.');
      return;
    }
    pendingOverwrite = false;
    saveProjectNameInput.value = currentProjectName || '';
    saveProjectStatus.textContent = '';
    saveProjectStatus.className = 'auth-toggle-text';
    saveProjectSubmitBtn.textContent = 'Save';
    openModal(saveProjectModal);
    saveProjectNameInput.focus();
    saveProjectNameInput.select();
  });
 
  saveProjectNameInput.addEventListener('input', () => {
    // Editing the name invalidates a pending "overwrite?" confirmation.
    if (pendingOverwrite) {
      pendingOverwrite = false;
      saveProjectSubmitBtn.textContent = 'Save';
      saveProjectStatus.textContent = '';
    }
  });
 
  saveProjectCancelBtn.addEventListener('click', () => closeModal(saveProjectModal));
 
  saveProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = saveProjectNameInput.value.trim();
    if (!name) return;
 
    saveProjectSubmitBtn.disabled = true;
    saveProjectStatus.className = 'auth-toggle-text';
    saveProjectStatus.textContent = 'Saving...';
 
    try {
      const res = await fetch(PROJECTS_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name,
          data: JSON.stringify(serializeProject()),
          overwrite: pendingOverwrite,
        }),
      });
 
      if (res.status === 409) {
        // Name already used — ask before replacing.
        pendingOverwrite = true;
        saveProjectSubmitBtn.textContent = 'Overwrite';
        saveProjectStatus.className = 'auth-toggle-text grant-status-error';
        saveProjectStatus.textContent = `"${name}" already exists. Click Overwrite to replace it, or change the name.`;
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
 
      setCurrentProject(name);
      pendingOverwrite = false;
      closeModal(saveProjectModal);
      addMessage(`Project "${name}" saved.`, 'assistant');
    } catch (err) {
      console.error('[SecureProvision] Failed to save project:', err);
      saveProjectStatus.className = 'auth-toggle-text grant-status-error';
      saveProjectStatus.textContent = err.message || 'Could not reach the server.';
    } finally {
      saveProjectSubmitBtn.disabled = false;
    }
  });
 
  // --- List / Load / Delete ---
  async function refreshProjectsList() {
    projectsList.innerHTML = '<li class="lab-list-empty">Loading projects...</li>';
    projectsStatus.textContent = '';
    try {
      const res = await fetch(PROJECTS_API_BASE, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readError(res));
      const projects = await res.json();
 
      projectsList.innerHTML = '';
      if (!projects.length) {
        projectsList.innerHTML = '<li class="lab-list-empty">No saved projects yet. Use "Save Project" to create one.</li>';
        return;
      }
 
      projects.forEach((p) => {
        const li = document.createElement('li');
        li.className = 'project-item';
 
        const info = document.createElement('div');
        info.className = 'project-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'project-name';
        nameEl.textContent = p.name; // textContent: names are user input
        const timeEl = document.createElement('span');
        timeEl.className = 'project-time';
        timeEl.textContent = `Saved ${formatTimestamp(p.updatedAt)}`;
        info.append(nameEl, timeEl);
 
        const actions = document.createElement('div');
        actions.className = 'project-actions';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'auth-login-btn';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', () => loadProjectById(p.id, p.name));
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteProjectById(p.id, p.name));
        actions.append(loadBtn, delBtn);
 
        li.append(info, actions);
        projectsList.appendChild(li);
      });
    } catch (err) {
      console.error('[SecureProvision] Failed to list projects:', err);
      projectsList.innerHTML = '';
      projectsStatus.className = 'auth-toggle-text grant-status-error';
      projectsStatus.textContent = err.message || 'Could not reach the server.';
    }
  }
 
  async function loadProjectById(id, name) {
    if (nodes.length > 0 &&
        !confirm(`Load "${name}"? The current canvas will be replaced (unsaved changes are lost).`)) {
      return;
    }
    projectsStatus.className = 'auth-toggle-text';
    projectsStatus.textContent = 'Loading...';
    try {
      const res = await fetch(`${PROJECTS_API_BASE}/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readError(res));
      const project = await res.json();
      loadProjectState(JSON.parse(project.data));
      setCurrentProject(project.name);
      closeModal(projectsModal);
      addMessage(`Loaded project "${project.name}".`, 'assistant');
    } catch (err) {
      console.error('[SecureProvision] Failed to load project:', err);
      projectsStatus.className = 'auth-toggle-text grant-status-error';
      projectsStatus.textContent = err.message || 'Could not load this project.';
    }
  }
 
  async function deleteProjectById(id, name) {
    if (!confirm(`Delete "${name}" permanently?`)) return;
    try {
      const res = await fetch(`${PROJECTS_API_BASE}/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readError(res));
      if (currentProjectName === name) setCurrentProject(null);
      await refreshProjectsList();
    } catch (err) {
      console.error('[SecureProvision] Failed to delete project:', err);
      projectsStatus.className = 'auth-toggle-text grant-status-error';
      projectsStatus.textContent = err.message || 'Could not delete this project.';
    }
  }
 
  myProjectsBtn.addEventListener('click', () => {
    if (!isLoggedIn()) {
      alert('Please log in to view your saved projects.');
      return;
    }
    openModal(projectsModal);
    refreshProjectsList();
  });
 
  projectsCloseBtn.addEventListener('click', () => closeModal(projectsModal));
 
  // Click on the dark backdrop closes either dialog.
  [saveProjectModal, projectsModal].forEach((m) => {
    m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(m); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(saveProjectModal); closeModal(projectsModal); }
  });
 
  /* ----------------------------------------------------
     4. RESIZABLE ASSISTANT SIDEBAR
  ---------------------------------------------------- */
  const resizer = document.getElementById('resizer');
  const assistantPanelEl = document.querySelector('.assistant-panel');
 
  const MIN_SIDEBAR_WIDTH = 300;
  const MAX_SIDEBAR_WIDTH = 800;
 
  // CSS no longer sets a fixed width on .assistant-panel (see style.css) —
  // set the starting width here instead, so it's still adjustable by drag.
  assistantPanelEl.style.width = '360px';
 
  let isResizingSidebar = false;
 
  resizer.addEventListener('mousedown', () => {
    isResizingSidebar = true;
    resizer.classList.add('dragging');
    // Prevent text selection and show the resize cursor everywhere
    // while dragging, not just over the thin handle itself.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });
 
  document.addEventListener('mousemove', (e) => {
    if (!isResizingSidebar) return;
 
    // The sidebar sits on the right edge, so its width is the distance
    // from the cursor to the right edge of the viewport.
    const proposedWidth = window.innerWidth - e.clientX;
    const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, proposedWidth));
    assistantPanelEl.style.width = `${clampedWidth}px`;
  });
 
  document.addEventListener('mouseup', () => {
    if (!isResizingSidebar) return;
    isResizingSidebar = false;
    resizer.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
 
  /* ----------------------------------------------------
     5. INTERACTIVE PORT LABELS ON EDGES
  ---------------------------------------------------- */
  // Draws a small dot near each end of every edge, positioned exactly at
  // the boundary of the connected device's shape (not floating at an
  // arbitrary point along the line) — clicking a dot sets a port/
  // interface name for that end (e.g. "Gig0/0/1"), drawn as a small
  // label beside it. Implemented with canvas drawing + manual hit-testing
  // rather than DOM overlays, since overlay positions would otherwise
  // need constant re-syncing on every pan/zoom/drag.
  let edgePortHitTargets = []; // recomputed every redraw: {edgeId, end, x, y}
 
  const PORT_DOT_PADDING = 10; // px beyond the node's edge, so the dot clears the shape
 
  // Finds the point where a ray from nodeId's center toward `towardPos`
  // exits nodeId's own bounding box — i.e. exactly where the edge line
  // touches that device's shape — then nudges it outward by a small
  // padding so the dot/label sits just outside the shape rather than
  // sitting on its border. Works for both box and ellipse shapes since
  // vis.js's bounding box is an axis-aligned rectangle either way.
  function getNodeBoundaryPoint(nodeId, towardPos) {
    const box = network.getBoundingBox(nodeId); // { top, left, right, bottom }
    const center = network.getPositions([nodeId])[nodeId];
 
    const halfWidth = (box.right - box.left) / 2;
    const halfHeight = (box.bottom - box.top) / 2;
 
    const dx = towardPos.x - center.x;
    const dy = towardPos.y - center.y;
 
    if (dx === 0 && dy === 0) {
      return { x: center.x, y: center.y };
    }
 
    // Distance (as a multiple of the dx/dy vector) to reach the
    // rectangle's right/left edge or top/bottom edge — whichever the
    // ray hits first is the actual exit point.
    let t = Infinity;
    if (dx !== 0) t = Math.min(t, halfWidth / Math.abs(dx));
    if (dy !== 0) t = Math.min(t, halfHeight / Math.abs(dy));
 
    const length = Math.sqrt(dx * dx + dy * dy);
    const normX = dx / length;
    const normY = dy / length;
 
    return {
      x: center.x + dx * t + normX * PORT_DOT_PADDING,
      y: center.y + dy * t + normY * PORT_DOT_PADDING,
    };
  }
 
  function drawPortDot(ctx, x, y, portName) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = portName ? '#21e6a8' : 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#080b10';
    ctx.stroke();
 
    if (portName) {
      ctx.font = '11px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(portName).width;
      const paddingX = 4;
 
      // Small dark chip behind the text so it stays legible over the
      // canvas grid/edges regardless of what's underneath.
      ctx.fillStyle = 'rgba(8, 11, 16, 0.85)';
      ctx.fillRect(x - textWidth / 2 - paddingX, y + 8, textWidth + paddingX * 2, 15);
 
      ctx.fillStyle = '#e7edf3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(portName, x, y + 16);
    }
  }
 
  network.on('afterDrawing', (ctx) => {
    edgePortHitTargets = [];
    const allEdges = edges.get();
 
    allEdges.forEach((edge) => {
      const positions = network.getPositions([edge.from, edge.to]);
      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return; // endpoint was deleted mid-frame
 
      // Anchored to each device's actual shape boundary — this recalculates
      // every frame from current node positions, so if a node is dragged
      // (physics itself is disabled — see options.physics above — but
      // manual dragging still moves nodes) the dot/label follows the
      // device precisely instead of floating at a fixed percentage along
      // the line.
      const fromDot = getNodeBoundaryPoint(edge.from, toPos);
      const toDot = getNodeBoundaryPoint(edge.to, fromPos);
 
      drawPortDot(ctx, fromDot.x, fromDot.y, edge.fromPort);
      drawPortDot(ctx, toDot.x, toDot.y, edge.toPort);
 
      edgePortHitTargets.push({ edgeId: edge.id, end: 'from', x: fromDot.x, y: fromDot.y });
      edgePortHitTargets.push({ edgeId: edge.id, end: 'to', x: toDot.x, y: toDot.y });
    });
  });
 
  function findPortHit(canvasPos) {
    const hitRadius = 10;
    return (
      edgePortHitTargets.find((t) => {
        const dx = t.x - canvasPos.x;
        const dy = t.y - canvasPos.y;
        return Math.sqrt(dx * dx + dy * dy) <= hitRadius;
      }) || null
    );
  }
 
  // Pointer cursor feedback when hovering directly over a port dot.
  container.addEventListener('mousemove', (domEvent) => {
    const rect = container.getBoundingClientRect();
    const canvasPos = network.DOMtoCanvas({
      x: domEvent.clientX - rect.left,
      y: domEvent.clientY - rect.top,
    });
    container.style.cursor = findPortHit(canvasPos) ? 'pointer' : '';
  });
 
  // Click a port dot to name that end's interface. Node clicks are left
  // alone (handled separately by vis's own selection + the doubleClick
  // rename handler above).
  network.on('click', (params) => {
    if (params.nodes.length > 0) return;
 
    const hit = findPortHit(params.pointer.canvas);
    if (!hit) return;
 
    const edge = edges.get(hit.edgeId);
    if (!edge) return;
 
    const sideLabel = hit.end === 'from' ? 'source' : 'destination';
    const currentValue = hit.end === 'from' ? edge.fromPort : edge.toPort;
 
    const portName = prompt(
      `Enter the port/interface name for the ${sideLabel} side of this link (e.g. GigabitEthernet0/0/1):`,
      currentValue || ''
    );
    if (portName === null) return; // Cancel
 
    const trimmed = portName.trim();
    const update = { id: hit.edgeId };
    if (hit.end === 'from') {
      update.fromPort = trimmed || null;
    } else {
      update.toPort = trimmed || null;
    }
    edges.update(update);
  });
 
  /* ----------------------------------------------------
     6. TOPOLOGY EXTRACTION
  ---------------------------------------------------- */
  // Reads the current state of the vis.js DataSets and formats it into
  // a clean, backend-friendly JSON structure. Each device explicitly
  // carries its id, customName (clean editable display name — never the
  // raw multi-line canvas label), and deviceType, so the AI always gets
  // an unambiguous name + role for every device regardless of how it's
  // rendered on screen. Connections carry device IDs plus each end's
  // port/interface name (or null if not yet set), so the AI has full
  // cabling context.
  function getTopologyData() {
    const allNodes = nodes.get();
    const allEdges = edges.get();
 
    const devices = allNodes.map((n) => ({
      id: n.id,
      // The Java DTO expects the JSON key "label" — populate it from
      // customName (the clean, user-editable name) when present, and
      // fall back to the node's original default label otherwise, so
      // this is never sent as null.
      label: n.customName || n.label,
      deviceType: n.deviceType,
    }));
 
    const connections = allEdges.map((e) => ({
      from: e.from, // device id
      to: e.to,     // device id
      fromPort: e.fromPort || null,
      toPort: e.toPort || null,
    }));
 
    return {
      deviceCount: devices.length,
      connectionCount: connections.length,
      devices,
      connections,
    };
  }
 
  /* ----------------------------------------------------
     7. CHAT INTERFACE
  ---------------------------------------------------- */
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
 
  function addMessage(text, role) {
    const row = document.createElement('div');
    row.className = `msg msg-${role}`;
 
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? 'YOU' : 'AI';
 
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
 
    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
 
    return row; // returned so callers can update/remove it later (loading states)
  }
 
  function updateMessageBubble(row, text) {
    const bubble = row.querySelector('.msg-bubble');
    bubble.textContent = text;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
 
  const CHAT_API_URL = `${API_BASE_URL}/api/chat`;
 
  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;
 
    addMessage(text, 'user');
    chatInput.value = '';
    autoGrow();
 
    // Build the payload to match the Java ChatRequest DTO exactly:
    // { message, deviceCount, connectionCount, devices[], connections[] }
    const topology = getTopologyData();
    const payload = {
      message: text,
      deviceCount: topology.deviceCount,
      connectionCount: topology.connectionCount,
      devices: topology.devices,
      connections: topology.connections,
    };
 
    // Show a temporary "..." bubble immediately, then update or replace
    // it once the real response (or an error) comes back.
    const loadingRow = addMessage('...', 'assistant');
    loadingRow.classList.add('msg-loading');
 
    sendBtn.disabled = true;
    chatInput.disabled = true;
 
    try {
      const res = await fetch(CHAT_API_URL, {
        method: 'POST',
        // Protected endpoint — merge in the auth headers alongside the
        // usual Content-Type.
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
 
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }
 
      const data = await res.json();
      updateMessageBubble(loadingRow, data.reply || 'The server responded with no reply text.');
      loadingRow.classList.remove('msg-loading');
    } catch (err) {
      console.error('[SecureProvision] Chat request failed:', err);
      updateMessageBubble(
        loadingRow,
        'Could not reach the AI backend. Is it running at ' + CHAT_API_URL + '?'
      );
      loadingRow.classList.remove('msg-loading');
      loadingRow.classList.add('msg-error');
    } finally {
      sendBtn.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  }
 
  function autoGrow() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  }
 
  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('input', autoGrow);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
 
  /* ----------------------------------------------------
     8. EXPORT TO TXT
  ---------------------------------------------------- */
  const exportBtn = document.getElementById('exportBtn');
 
  exportBtn.addEventListener('click', () => {
    const aiBubbles = document.querySelectorAll('.msg-assistant .msg-bubble');
 
    if (aiBubbles.length <= 1) {
      alert('No AI configurations to export yet.');
      return;
    }
 
    let output =
      '=================================================\n' +
      ' SecureProvision - Network Configurations Export \n' +
      '=================================================\n\n';
 
    // Skip index 0 — that's always the default welcome message, not an
    // actual AI response worth exporting.
    for (let i = 1; i < aiBubbles.length; i++) {
      output += `--- AI Response ${i} ---\n`;
      output += aiBubbles[i].textContent.trim() + '\n\n';
    }
 
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
 
    const link = document.createElement('a');
    link.href = url;
    link.download = 'SecureProvision_Configs.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
 
  /* ----------------------------------------------------
     9. MULTI-VIEW NAVIGATION (landing page / view switching)
     Purely additive — reuses the existing `network`, `nodes`, `edges`,
     etc. via closure. Nothing above this section was modified.
  ---------------------------------------------------- */
  const VIEW_IDS = ['landing-page', 'ai-assistance-view', 'training-view', 'troubleshooting-view', 'admin-view'];
  const authSidebar = document.querySelector('.auth-sidebar');
 
  function setSidebarVisible(visible) {
    if (authSidebar) authSidebar.style.display = visible ? 'flex' : 'none';
  }
 
  function isLoggedIn() {
    return !!localStorage.getItem('username');
  }
 
  // OWNER is a super-admin: anywhere a DEVELOPER has access, OWNER must
  // too. Centralized here so every DEVELOPER-gated feature (Admin Panel,
  // "Add New Lab", anything added later) checks role through this one
  // function instead of duplicating the OR-check in multiple places.
  function hasDeveloperAccess() {
    const role = localStorage.getItem('role');
    return role === 'DEVELOPER' || role === 'OWNER';
  }
 
  function showView(viewId) {
    VIEW_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = id === viewId ? 'flex' : 'none';
    });
 
    // The vis.js network was initialized at page load, while its
    // container may have been hidden (display:none) since the AI
    // Assistance view isn't shown by default. A canvas sized while
    // hidden can end up at 0x0. Forcing a resize/redraw right after
    // this view becomes visible fixes that without touching any of
    // the original network setup above.
    if (viewId === 'ai-assistance-view') {
      requestAnimationFrame(() => {
        network.redraw();
        network.fit();
      });
    }
  }
 
  // Both the landing-page cards and every "Back to Home" button use a
  // shared data-view attribute, so one listener handles all of them.
  // Navigating to any of the 3 workspace views always hides the sidebar
  // so the view takes the full width. Navigating back to the landing
  // page only re-reveals the sidebar if the user is NOT logged in —
  // once logged in, the sidebar stays hidden until manually toggled
  // via #sidebarToggleBtn (see section 11).
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.dataset.view;
      showView(target);
      setSidebarVisible(target === 'landing-page' && !isLoggedIn());
    });
  });
 
  /* ----------------------------------------------------
     10. SIDEBAR AUTH — Login / Sign Up, wired to the backend
  ---------------------------------------------------- */
  const AUTH_API_BASE = `${API_BASE_URL}/api/auth`;
 
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const showSignupLink = document.getElementById('showSignupLink');
  const showLoginLink = document.getElementById('showLoginLink');
  const sendVerificationBtn = document.getElementById('sendVerificationBtn');
  const verificationCodeGroup = document.getElementById('verificationCodeGroup');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const signupUsername = document.getElementById('signupUsername');
  const signupEmail = document.getElementById('signupEmail');
  const signupPassword = document.getElementById('signupPassword');
  const verificationCodeInput = document.getElementById('verificationCodeInput');
 
  const userRoleLabel = document.getElementById('userRoleLabel');
  const adminPanelCard = document.getElementById('adminPanelCard');
  const logoutBtn = document.getElementById('logoutBtn');
  const authFormsWrapper = document.getElementById('authFormsWrapper');
  const accountPanel = document.getElementById('accountPanel');
  const accountUsernameLabel = document.getElementById('accountUsernameLabel');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
 
  if (showSignupLink && showLoginLink && loginForm && signupForm) {
    showSignupLink.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.style.display = 'none';
      signupForm.style.display = 'flex';
    });
 
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      signupForm.style.display = 'none';
      loginForm.style.display = 'flex';
    });
  }
 
  // "Send Verification Code" creates the (unverified) account and
  // triggers the backend to email a 4-digit code, then reveals the
  // code input.
  if (sendVerificationBtn && verificationCodeGroup) {
    sendVerificationBtn.addEventListener('click', async () => {
      const username = signupUsername.value.trim();
      const email = signupEmail.value.trim();
      const password = signupPassword.value;
 
      if (!username || !email || !password) {
        alert('Please fill in username, email, and password first.');
        return;
      }
 
      try {
        const res = await fetch(`${AUTH_API_BASE}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        alert(data.message);
        if (data.status === 'success') {
          verificationCodeGroup.style.display = 'flex';
        }
      } catch (err) {
        console.error('[SecureProvision] Sign up request failed:', err);
        alert('Could not reach the auth backend. Is it running at ' + AUTH_API_BASE + '?');
      }
    });
  }
 
  // Submitting the sign-up form (after the code field is showing)
  // verifies the code and, on success, flips back to the login form.
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
 
      const email = signupEmail.value.trim();
      const code = verificationCodeInput.value.trim();
      if (!code) {
        alert('Enter the verification code sent to your email first.');
        return;
      }
 
      try {
        const res = await fetch(`${AUTH_API_BASE}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });
        const data = await res.json();
        alert(data.message);
 
        if (data.status === 'success') {
          signupForm.reset();
          verificationCodeGroup.style.display = 'none';
          signupForm.style.display = 'none';
          loginForm.style.display = 'flex';
        }
      } catch (err) {
        console.error('[SecureProvision] Verify request failed:', err);
        alert('Could not reach the auth backend. Is it running at ' + AUTH_API_BASE + '?');
      }
    });
  }
 
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
 
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
 
      try {
        const res = await fetch(`${AUTH_API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
 
        if (data.status === 'success') {
          localStorage.setItem('username', data.username);
          localStorage.setItem('role', data.role);
          applyLoggedInState(data.username, data.role);
        } else {
          alert(data.message || 'Login failed.');
        }
      } catch (err) {
        console.error('[SecureProvision] Login request failed:', err);
        alert('Could not reach the auth backend. Is it running at ' + AUTH_API_BASE + '?');
      }
    });
  }
 
  /* ----------------------------------------------------
     11. LOGIN STATE — swap forms/account panel, reveal Admin Panel
         for OWNER, sidebar toggle button, restore session, logout
  ---------------------------------------------------- */
  function applyLoggedInState(username, role) {
    if (userRoleLabel) userRoleLabel.textContent = role;
    if (accountUsernameLabel) accountUsernameLabel.textContent = username;
    if (adminPanelCard) adminPanelCard.style.display = role === 'OWNER' ? 'flex' : 'none';
 
    // Swap the sidebar's content: hide the login/signup forms, show the
    // account info + logout panel instead.
    if (authFormsWrapper) authFormsWrapper.style.display = 'none';
    if (accountPanel) accountPanel.style.display = 'flex';
 
    // The sidebar starts hidden once logged in; the toggle button on
    // the landing page is how it's brought back manually from here on.
    if (sidebarToggleBtn) sidebarToggleBtn.style.display = 'flex';
    setSidebarVisible(false);
    showView('landing-page');
 
    // "Add New Lab" buttons and each lab's delete button depend on
    // role, so refresh both once role is known. Both functions are
    // defined below (section 12) but are safe to call here since
    // they're hoisted function declarations that only touch the DOM
    // directly — they don't reference anything not yet initialized.
    updateAddLabButtonsVisibility();
    fetchLabs('TRAINING');
    fetchLabs('TROUBLESHOOTING');
  }
 
  function applyLoggedOutState() {
    if (userRoleLabel) userRoleLabel.textContent = 'User';
    if (accountUsernameLabel) accountUsernameLabel.textContent = '';
    if (adminPanelCard) adminPanelCard.style.display = 'none';
 
    if (authFormsWrapper) authFormsWrapper.style.display = 'flex';
    if (accountPanel) accountPanel.style.display = 'none';
 
    if (sidebarToggleBtn) sidebarToggleBtn.style.display = 'none';
    setSidebarVisible(true);
    showView('landing-page');
 
    updateAddLabButtonsVisibility();
    fetchLabs('TRAINING');
    fetchLabs('TROUBLESHOOTING');
  }
 
  // Manual sidebar toggle for logged-in users — only relevant once
  // logged in, since the button itself is hidden otherwise.
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
      const currentlyVisible = authSidebar && authSidebar.style.display !== 'none';
      setSidebarVisible(!currentlyVisible);
    });
  }
 
  // Restore a previous session on page load, if one exists.
  const savedUsername = localStorage.getItem('username');
  const savedRole = localStorage.getItem('role');
  if (savedUsername && savedRole) {
    applyLoggedInState(savedUsername, savedRole);
  }
 
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('username');
      localStorage.removeItem('role');
      applyLoggedOutState();
    });
  }
 
  /* ----------------------------------------------------
     12. ADMIN PANEL — grant / revoke DEVELOPER role
  ---------------------------------------------------- */
  const grantDeveloperBtn = document.getElementById('grantDeveloperBtn');
  const revokeDeveloperBtn = document.getElementById('revokeDeveloperBtn');
  const targetUsernameInput = document.getElementById('targetUsernameInput');
  const grantDeveloperStatus = document.getElementById('grantDeveloperStatus');
 
  // Shared by both buttons — same input, same status line, same
  // ownerUsername-from-localStorage pattern, just a different endpoint.
  async function callRoleEndpoint(endpoint) {
    const ownerUsername = localStorage.getItem('username');
    const targetUsername = targetUsernameInput.value.trim();
 
    if (!targetUsername) {
      grantDeveloperStatus.textContent = 'Enter a username first.';
      grantDeveloperStatus.className = 'auth-toggle-text grant-status-error';
      return;
    }
 
    try {
      const res = await fetch(`${AUTH_API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUsername, targetUsername }),
      });
      const data = await res.json();
      grantDeveloperStatus.textContent = data.message;
      grantDeveloperStatus.className =
        'auth-toggle-text ' + (data.status === 'success' ? 'grant-status-success' : 'grant-status-error');
 
      if (data.status === 'success') {
        targetUsernameInput.value = '';
      }
    } catch (err) {
      console.error(`[SecureProvision] ${endpoint} request failed:`, err);
      grantDeveloperStatus.textContent = 'Could not reach the auth backend at ' + AUTH_API_BASE + '.';
      grantDeveloperStatus.className = 'auth-toggle-text grant-status-error';
    }
  }
 
  if (grantDeveloperBtn) {
    grantDeveloperBtn.addEventListener('click', () => callRoleEndpoint('grant-developer'));
  }
 
  if (revokeDeveloperBtn) {
    revokeDeveloperBtn.addEventListener('click', () => callRoleEndpoint('revoke-developer'));
  }
 
  /* ----------------------------------------------------
     12. PACKET TRACER LAB MANAGEMENT (upload / fetch / delete)
  ---------------------------------------------------- */
 
  const labUploadModal = document.getElementById('labUploadModal');
  const labUploadModalTitle = document.getElementById('labUploadModalTitle');
  const labUploadForm = document.getElementById('labUploadForm');
  const labTitleInput = document.getElementById('labTitleInput');
  const labFileInput = document.getElementById('labFileInput');
  const labUploadStatus = document.getElementById('labUploadStatus');
  const labUploadCancelBtn = document.getElementById('labUploadCancelBtn');
 
  let currentLabCategory = null;
 
  // Shows/hides every "Add New Lab" button based on role. OWNER
  // automatically qualifies via hasDeveloperAccess() (section 9).
  function updateAddLabButtonsVisibility() {
    const visible = hasDeveloperAccess();
    document.querySelectorAll('.add-lab-btn').forEach((btn) => {
      btn.style.display = visible ? 'inline-flex' : 'none';
    });
  }
 
  function getLabListElement(category) {
    return category === 'TRAINING'
      ? document.getElementById('labListTraining')
      : document.getElementById('labListTroubleshooting');
  }
 
  function renderLabList(category, labs) {
    const listEl = getLabListElement(category);
    if (!listEl) return;
    listEl.innerHTML = '';
 
    if (!labs || labs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'lab-list-empty';
      empty.textContent = 'No labs uploaded yet.';
      listEl.appendChild(empty);
      return;
    }
 
    labs.forEach((lab) => {
      const item = document.createElement('li');
      item.className = 'lab-list-item';
 
      const info = document.createElement('div');
      const titleEl = document.createElement('span');
      titleEl.className = 'lab-list-item-title';
      titleEl.textContent = lab.title;
      const fileEl = document.createElement('span');
      fileEl.className = 'lab-list-item-file';
      fileEl.textContent = lab.fileName;
      info.appendChild(titleEl);
      info.appendChild(fileEl);
      item.appendChild(info);
 
      // Delete button only for DEVELOPER/OWNER — same rule as the
      // "Add New Lab" buttons, via the same hasDeveloperAccess() check.
      if (hasDeveloperAccess()) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'lab-delete-btn';
        deleteBtn.setAttribute('aria-label', 'Delete lab');
        deleteBtn.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        deleteBtn.addEventListener('click', () => deleteLab(lab.id, category));
        item.appendChild(deleteBtn);
      }
 
      listEl.appendChild(item);
    });
  }
 
  async function fetchLabs(category) {
    const listEl = getLabListElement(category);
    if (listEl) {
      listEl.innerHTML = '<li class="lab-list-empty">Loading labs...</li>';
    }
 
    try {
      const res = await fetch(`${LABS_API_BASE}/${category}`);
      const data = await res.json();
 
      if (data.status === 'success') {
        renderLabList(category, data.labs);
      } else if (listEl) {
        listEl.innerHTML = `<li class="lab-list-empty">${data.message || 'Could not load labs.'}</li>`;
      }
    } catch (err) {
      console.error('[SecureProvision] Failed to fetch labs:', err);
      if (listEl) {
        listEl.innerHTML = `<li class="lab-list-empty">Could not reach the backend at ${LABS_API_BASE}.</li>`;
      }
    }
  }
 
  async function deleteLab(id, category) {
    const confirmed = confirm('Delete this lab? This cannot be undone.');
    if (!confirmed) return;
 
    try {
      // Protected endpoint — requires auth headers.
      const res = await fetch(`${LABS_API_BASE}/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
 
      if (data.status === 'success') {
        fetchLabs(category);
      } else {
        alert(data.message || 'Could not delete this lab.');
      }
    } catch (err) {
      console.error('[SecureProvision] Failed to delete lab:', err);
      alert('Could not reach the backend at ' + LABS_API_BASE + '.');
    }
  }
 
  // "Add New Lab" buttons open the shared upload modal, remembering
  // which category (Training/Troubleshooting) triggered it.
  document.querySelectorAll('.add-lab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLabCategory = btn.dataset.category;
      if (labUploadModalTitle) {
        labUploadModalTitle.textContent =
          'Add New Lab — ' + (currentLabCategory === 'TRAINING' ? 'Training' : 'Troubleshooting');
      }
      if (labUploadForm) labUploadForm.reset();
      if (labUploadStatus) {
        labUploadStatus.textContent = '';
        labUploadStatus.className = 'auth-toggle-text';
      }
      if (labUploadModal) labUploadModal.style.display = 'flex';
    });
  });
 
  if (labUploadCancelBtn) {
    labUploadCancelBtn.addEventListener('click', () => {
      if (labUploadModal) labUploadModal.style.display = 'none';
    });
  }
 
  if (labUploadForm) {
    labUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
 
      const title = labTitleInput.value.trim();
      const file = labFileInput.files[0];
 
      if (!title || !file) {
        labUploadStatus.textContent = 'Title and file are required.';
        labUploadStatus.className = 'auth-toggle-text grant-status-error';
        return;
      }
 
      // FormData for multipart upload — never set a Content-Type header
      // manually here; the browser generates the correct multipart
      // boundary automatically when the body is a FormData instance.
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', currentLabCategory);
      formData.append('file', file);
 
      labUploadStatus.textContent = 'Uploading...';
      labUploadStatus.className = 'auth-toggle-text';
 
      try {
        // Protected endpoint — merge in auth headers, but still no
        // Content-Type: the browser must set the multipart boundary itself.
        const res = await fetch(`${LABS_API_BASE}/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        const data = await res.json();
 
        labUploadStatus.textContent = data.message;
        labUploadStatus.className =
          'auth-toggle-text ' + (data.status === 'success' ? 'grant-status-success' : 'grant-status-error');
 
        if (data.status === 'success') {
          fetchLabs(currentLabCategory);
          setTimeout(() => {
            if (labUploadModal) labUploadModal.style.display = 'none';
          }, 1000);
        }
      } catch (err) {
        console.error('[SecureProvision] Lab upload failed:', err);
        labUploadStatus.textContent = 'Could not reach the backend at ' + LABS_API_BASE + '.';
        labUploadStatus.className = 'auth-toggle-text grant-status-error';
      }
    });
  }
 
  // Initial load — populate both lists and set correct button
  // visibility for whatever login state (if any) was just restored
  // above in section 11.
  updateAddLabButtonsVisibility();
  fetchLabs('TRAINING');
  fetchLabs('TROUBLESHOOTING');
})();
 
