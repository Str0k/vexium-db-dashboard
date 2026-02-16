/* ========================================
   VexiumAI Database Dashboard — Application Logic
   Connects to n8n webhook API endpoints
   ======================================== */

// ==========================================
// AUTHENTICATION
// ==========================================
function getAuthToken() {
    return sessionStorage.getItem('vexium_auth_token');
}

function setAuthToken(token) {
    sessionStorage.setItem('vexium_auth_token', token);
}

function clearAuthToken() {
    sessionStorage.removeItem('vexium_auth_token');
}

function isAuthenticated() {
    return !!getAuthToken();
}

function showLogin() {
    document.getElementById('loginOverlay').classList.remove('hidden');
}

function hideLogin() {
    document.getElementById('loginOverlay').classList.add('hidden');
}

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errorDiv = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    const btnText = btn.querySelector('.login-btn-text');
    const spinner = btn.querySelector('.login-spinner');

    // UI loading state
    errorDiv.style.display = 'none';
    btn.disabled = true;
    btnText.textContent = 'Verificando...';
    spinner.style.display = 'block';

    try {
        const baseUrl = getApiBase().split('?')[0];
        const url = new URL(baseUrl);
        url.searchParams.set('action', 'login');

        const res = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password }),
        });

        const data = await res.json();
        // Handle both array and object responses from n8n
        const result = Array.isArray(data) ? data[0] : data;

        if (result && result.success && result.token) {
            setAuthToken(result.token);
            hideLogin();
            showToast(`¡Bienvenido, ${result.user || username}! 🎉`, 'success');
            refreshDashboard();
        } else {
            errorDiv.textContent = result?.message || 'Credenciales incorrectas';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.textContent = 'Error de conexión. Verifica la URL del API.';
        errorDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Iniciar Sesión';
        spinner.style.display = 'none';
    }
}

function handleLogout() {
    if (!confirm('¿Seguro que quieres cerrar sesión?')) return;
    clearAuthToken();
    showLogin();
    showToast('Sesión cerrada', 'info');
}

// ==========================================
// CONFIG & STATE
// ==========================================
const state = {
    tables: [],
    schema: {},
    currentTable: null,
    currentData: [],
    currentColumns: [],
    filteredData: null,
    activePlatform: 'all',
    contactsMap: {},
    viewMode: 'conversations',
};

function getApiBase() {
    return document.getElementById('apiUrl').value.replace(/\/+$/, '');
}

// ==========================================
// API LAYER
// ==========================================
// ==========================================
// API LAYER
// ==========================================
async function apiCall(action, method = 'POST', body = {}) {
    // Si el usuario pone la URL completa con parámetros, la limpiamos
    let baseUrl = getApiBase().split('?')[0];

    // Construimos la URL unificada — siempre POST para compatibilidad con n8n multi-method webhook
    const url = new URL(baseUrl);
    url.searchParams.set('action', action);

    // Enviamos también los params en la URL por si acaso
    if (body && typeof body === 'object') {
        Object.keys(body).forEach(key => url.searchParams.set(key, body[key]));
    }

    const headers = { 'Content-Type': 'application/json' };

    // Add auth token to every request
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Siempre POST para que n8n lo procese por la misma salida del webhook
    body.action = action;
    const opts = {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    };

    try {
        const res = await fetch(url.toString(), opts);

        // If 401/403, session expired — redirect to login
        if (res.status === 401 || res.status === 403) {
            clearAuthToken();
            showLogin();
            showToast('Sesión expirada. Inicia sesión de nuevo.', 'error');
            throw new Error('No autorizado');
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const data = await res.json();

        // Check if the API returned an auth error in the body
        const result = Array.isArray(data) ? data[0] : data;
        if (result && result.error === 'unauthorized') {
            clearAuthToken();
            showLogin();
            showToast('Sesión expirada. Inicia sesión de nuevo.', 'error');
            throw new Error('No autorizado');
        }

        updateConnectionStatus(true);
        return data;
    } catch (err) {
        console.error(`API Error [${action}]:`, err);
        updateConnectionStatus(false);
        throw err;
    }
}

function updateConnectionStatus(connected) {
    const dot = document.querySelector('.status-dot');
    const label = document.querySelector('.connection-status span');
    if (connected) {
        dot.classList.add('connected');
        label.textContent = 'Connected';
    } else {
        dot.classList.remove('connected');
        label.textContent = 'Disconnected';
    }
}

// ==========================================
// NAVIGATION
// ==========================================
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    const titles = { dashboard: 'Dashboard', tables: 'Tables', query: 'Query Editor', schema: 'Schema Manager' };
    document.getElementById('pageTitle').textContent = titles[view] || 'Dashboard';

    if (view === 'dashboard') refreshDashboard();
    if (view === 'tables') loadTablesList();
    if (view === 'query') loadTableBrowser();
    if (view === 'schema') loadSchema();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ==========================================
// DASHBOARD
// ==========================================
async function refreshDashboard() {
    try {
        const data = await apiCall('stats');
        if (Array.isArray(data)) {
            const stats = data[0] || data;
            document.getElementById('totalTables').textContent = stats.total_tables || '0';
            document.getElementById('totalRows').textContent = formatNumber(stats.total_rows || 0);
            document.getElementById('totalColumns').textContent = stats.total_columns || '0';
            document.getElementById('dbSize').textContent = stats.db_size || '—';
        } else {
            document.getElementById('totalTables').textContent = data.total_tables || '0';
            document.getElementById('totalRows').textContent = formatNumber(data.total_rows || 0);
            document.getElementById('totalColumns').textContent = data.total_columns || '0';
            document.getElementById('dbSize').textContent = data.db_size || '—';
        }

        await loadTablesOverview();
        showToast('Dashboard actualizado', 'success');
    } catch (err) {
        showToast('Error al cargar dashboard: ' + err.message, 'error');
    }
}

async function loadTablesOverview() {
    try {
        const data = await apiCall('tables');
        const tables = Array.isArray(data) ? data : [data];
        state.tables = tables;

        const container = document.getElementById('tablesOverview');
        if (!tables.length) {
            container.innerHTML = '<div class="empty-state">No tables found</div>';
            return;
        }

        container.innerHTML = tables.map(t => `
            <div class="table-row">
                <div class="table-row-info">
                    <div class="table-icon">${t.table_name?.charAt(0)?.toUpperCase() || 'T'}</div>
                    <div>
                        <div class="table-name">${t.table_name}</div>
                        <div class="table-meta">${t.row_count || 0} rows · ${t.column_count || '?'} columns</div>
                    </div>
                </div>
                <div class="table-row-actions">
                    <button class="btn-icon" title="View Data" onclick="viewTable('${t.table_name}')">👁</button>
                    <button class="btn-icon" title="Edit Schema" onclick="editTableSchema('${t.table_name}')">✏️</button>
                    <button class="btn-icon danger" title="Drop Table" onclick="confirmDropTable('${t.table_name}')">🗑</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        document.getElementById('tablesOverview').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
}

function viewTable(name) {
    switchView('tables');
    document.getElementById('tableSelect').value = name;
    loadTableData(name);
}

// ==========================================
// TABLES VIEW
// ==========================================
async function loadTablesList() {
    try {
        const data = await apiCall('tables');
        const tables = Array.isArray(data) ? data : [data];
        state.tables = tables;

        const select = document.getElementById('tableSelect');
        const current = select.value;
        select.innerHTML = '<option value="">— Choose a table —</option>';
        tables.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.table_name;
            opt.textContent = `${t.table_name} (${t.row_count || 0} rows)`;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    } catch (err) {
        showToast('Error loading tables: ' + err.message, 'error');
    }
}

async function loadTableData(tableName) {
    if (!tableName) {
        document.getElementById('schemaInfoPanel').style.display = 'none';
        document.getElementById('dataGridHead').innerHTML = '';
        document.getElementById('dataGridBody').innerHTML = '<tr><td class="empty-state" colspan="100">Select a table to view data</td></tr>';
        document.getElementById('btnInsertRow').disabled = true;
        document.getElementById('btnRefresh').disabled = true;
        document.getElementById('btnExport').disabled = true;
        return;
    }

    state.currentTable = tableName;
    document.getElementById('btnInsertRow').disabled = false;
    document.getElementById('btnRefresh').disabled = false;
    document.getElementById('btnExport').disabled = false;

    try {
        // Load columns
        const colData = await apiCall('columns', 'GET', { table: tableName });
        const columns = Array.isArray(colData) ? colData : [colData];
        state.currentColumns = columns;

        // Show schema info
        const schemaPanel = document.getElementById('schemaInfoPanel');
        schemaPanel.style.display = 'block';
        document.getElementById('selectedTableName').textContent = `📐 ${tableName}`;
        document.getElementById('schemaBadges').innerHTML = `
            <span class="badge badge-cyan">${columns.length} columns</span>
        `;
        document.getElementById('columnsGrid').innerHTML = columns.map(c => `
            <div class="column-chip">
                <span class="col-name">${c.column_name}</span>
                <span class="col-type">${c.data_type}</span>
            </div>
        `).join('');

        // Load data
        const rowData = await apiCall('data', 'GET', { table: tableName });
        const rows = Array.isArray(rowData) ? rowData : [rowData];
        state.currentData = rows;
        state.filteredData = null;
        state.activePlatform = 'all';

        // Load contacts map for name display (if viewing chat histories)
        if (tableName === 'n8n_chat_histories') {
            try {
                const contactsData = await apiCall('data', 'GET', { table: 'contacts' });
                const contacts = Array.isArray(contactsData) ? contactsData : [contactsData];
                state.contactsMap = {};
                contacts.forEach(c => {
                    if (c.session_id && c.display_name && c.display_name !== 'Cliente') {
                        state.contactsMap[c.session_id] = c.display_name;
                    }
                });
            } catch (e) {
                // contacts table may not exist yet, that's OK
                state.contactsMap = {};
            }
        }

        // Show/hide view toggle for chat histories
        const viewToggle = document.getElementById('viewToggle');
        if (tableName === 'n8n_chat_histories') {
            viewToggle.style.display = 'flex';
            state.viewMode = 'conversations';
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.view-btn[data-view="conversations"]').classList.add('active');
            // Apply conversations view
            const dedupedRows = getDeduplicatedRows(rows);
            renderDataGrid(columns, dedupedRows);
            document.getElementById('rowCount').textContent = `${dedupedRows.length} contacts`;
        } else {
            viewToggle.style.display = 'none';
            state.viewMode = 'all';
            renderDataGrid(columns, rows);
            document.getElementById('rowCount').textContent = `${rows.length} rows`;
        }

        // Show filter bar and populate column select
        document.getElementById('filterBar').style.display = 'block';
        const filterCol = document.getElementById('filterColumn');
        filterCol.innerHTML = '<option value="__all__">All Columns</option>';
        columns.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.column_name;
            opt.textContent = c.column_name;
            filterCol.appendChild(opt);
        });
        // Default to session_id if available
        if (columns.some(c => c.column_name === 'session_id')) {
            filterCol.value = 'session_id';
        }
        // Reset filter UI
        document.getElementById('filterSearch').value = '';
        document.getElementById('filterClearBtn').style.display = 'none';
        document.getElementById('filterResultCount').textContent = '';
        document.querySelectorAll('.filter-chip').forEach(ch => ch.classList.remove('active'));
        document.querySelector('.filter-chip[data-platform="all"]').classList.add('active');

    } catch (err) {
        showToast('Error loading table data: ' + err.message, 'error');
    }
}

function renderDataGrid(columns, rows) {
    const colNames = columns.map(c => c.column_name);

    const thead = document.getElementById('dataGridHead');
    thead.innerHTML = `<tr>
        ${colNames.map(c => `<th>${c}</th>`).join('')}
        <th>Actions</th>
    </tr>`;

    const tbody = document.getElementById('dataGridBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td class="empty-state" colspan="100">No data in this table</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row, idx) => `
        <tr>
            ${colNames.map(c => {
        const raw = row[c];
        const display = formatCellValue(raw, c);
        const tooltip = escapeHtml(typeof raw === 'object' && raw !== null ? JSON.stringify(raw) : String(raw ?? ''));
        return `<td title="${tooltip}">${display}</td>`;
    }).join('')}
            <td class="actions-cell">
                <button class="btn-icon" title="Edit" onclick="editRow(${idx})">✏️</button>
                <button class="btn-icon danger" title="Delete" onclick="deleteRow(${idx})">🗑</button>
            </td>
        </tr>
    `).join('');
}

function refreshTableData() {
    if (state.currentTable) loadTableData(state.currentTable);
}

// ==========================================
// SEARCH & FILTER
// ==========================================
let filterDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('filterSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(filterDebounce);
            filterDebounce = setTimeout(applyFilter, 200);
            document.getElementById('filterClearBtn').style.display = searchInput.value ? 'flex' : 'none';
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearFilter();
            }
        });
    }
    const filterCol = document.getElementById('filterColumn');
    if (filterCol) {
        filterCol.addEventListener('change', applyFilter);
    }
});

function applyFilter() {
    const searchTerm = document.getElementById('filterSearch').value.toLowerCase().trim();
    const column = document.getElementById('filterColumn').value;
    const platform = state.activePlatform;

    if (!state.currentData.length || !state.currentColumns.length) return;

    let rows = state.currentData;

    // Apply conversations dedup first (if in conversations mode)
    if (state.viewMode === 'conversations' && state.currentTable === 'n8n_chat_histories') {
        rows = getDeduplicatedRows(rows);
    }

    // Platform filter (based on session_id patterns)
    if (platform !== 'all') {
        rows = rows.filter(row => {
            const sessionId = String(row.session_id || '').toLowerCase();
            if (platform === 'whatsapp') return sessionId.startsWith('+');
            if (platform === 'messenger') return sessionId.startsWith('messenger_');
            if (platform === 'instagram') return sessionId.startsWith('instagram_');
            return true;
        });
    }

    // Text search filter (also search by contact name)
    if (searchTerm) {
        rows = rows.filter(row => {
            // Also check contactsMap for name search
            const contactName = state.contactsMap[row.session_id] || '';
            if (contactName.toLowerCase().includes(searchTerm)) return true;

            if (column === '__all__') {
                return Object.values(row).some(val =>
                    String(val ?? '').toLowerCase().includes(searchTerm)
                );
            } else {
                return String(row[column] ?? '').toLowerCase().includes(searchTerm);
            }
        });
    }

    state.filteredData = rows;
    renderDataGrid(state.currentColumns, rows);

    // Update counts
    const baseRows = state.viewMode === 'conversations' ? getDeduplicatedRows(state.currentData) : state.currentData;
    const total = baseRows.length;
    const shown = rows.length;
    const label = state.viewMode === 'conversations' ? 'contacts' : 'rows';
    if (searchTerm || platform !== 'all') {
        document.getElementById('filterResultCount').textContent = `${shown} of ${total}`;
        document.getElementById('rowCount').textContent = `${shown} ${label} (filtered)`;
    } else {
        document.getElementById('filterResultCount').textContent = '';
        document.getElementById('rowCount').textContent = `${total} ${label}`;
    }
}

function filterByPlatform(platform) {
    state.activePlatform = platform;
    document.querySelectorAll('.filter-chip').forEach(ch => ch.classList.remove('active'));
    document.querySelector(`.filter-chip[data-platform="${platform}"]`).classList.add('active');
    applyFilter();
}

function clearFilter() {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterClearBtn').style.display = 'none';
    state.activePlatform = 'all';
    document.querySelectorAll('.filter-chip').forEach(ch => ch.classList.remove('active'));
    document.querySelector('.filter-chip[data-platform="all"]').classList.add('active');
    state.filteredData = null;

    const rows = state.viewMode === 'conversations' ? getDeduplicatedRows(state.currentData) : state.currentData;
    renderDataGrid(state.currentColumns, rows);
    document.getElementById('filterResultCount').textContent = '';
    const label = state.viewMode === 'conversations' ? 'contacts' : 'rows';
    document.getElementById('rowCount').textContent = `${rows.length} ${label}`;
}

// --- View Mode (Conversations / All) ---
function getDeduplicatedRows(rows) {
    // Group by session_id, keep the row with the highest id (most recent)
    const map = {};
    rows.forEach(row => {
        const sid = row.session_id;
        if (!sid) return;
        if (!map[sid] || (row.id && row.id > map[sid].id)) {
            map[sid] = row;
        }
    });
    // Sort by id descending (most recent first)
    return Object.values(map).sort((a, b) => (b.id || 0) - (a.id || 0));
}

function setViewMode(mode) {
    state.viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.view-btn[data-view="${mode}"]`).classList.add('active');

    // Re-apply current filters with new view mode
    const searchTerm = document.getElementById('filterSearch').value.trim();
    if (searchTerm || state.activePlatform !== 'all') {
        applyFilter();
    } else {
        const rows = mode === 'conversations' ? getDeduplicatedRows(state.currentData) : state.currentData;
        renderDataGrid(state.currentColumns, rows);
        const label = mode === 'conversations' ? 'contacts' : 'rows';
        document.getElementById('rowCount').textContent = `${rows.length} ${label}`;
    }
}


// ==========================================
// QUERY EDITOR
// ==========================================
async function executeQuery() {
    const sql = document.getElementById('sqlEditor').value.trim();
    if (!sql) { showToast('Write a SQL query first', 'info'); return; }

    document.getElementById('queryStatus').textContent = 'Executing...';
    document.getElementById('queryTime').textContent = '';
    document.getElementById('btnRunQuery').disabled = true;

    const startTime = performance.now();

    try {
        const data = await apiCall('query', 'POST', { query: sql });
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);

        const rows = Array.isArray(data) ? data : [data];

        document.getElementById('queryStatus').textContent = 'Success';
        document.getElementById('queryTime').textContent = `${elapsed}s`;

        if (rows.length && typeof rows[0] === 'object') {
            const colNames = Object.keys(rows[0]);
            document.getElementById('resultsHead').innerHTML = `<tr>${colNames.map(c => `<th>${c}</th>`).join('')}</tr>`;
            document.getElementById('resultsBody').innerHTML = rows.map(row => `
                <tr>${colNames.map(c => `<td title="${escapeHtml(String(row[c] ?? ''))}">${escapeHtml(truncate(String(row[c] ?? ''), 80))}</td>`).join('')}</tr>
            `).join('');
            document.getElementById('resultCount').textContent = `${rows.length} rows`;
        } else {
            document.getElementById('resultsHead').innerHTML = '';
            document.getElementById('resultsBody').innerHTML = `<tr><td class="empty-state">Query executed successfully. ${JSON.stringify(data)}</td></tr>`;
            document.getElementById('resultCount').textContent = '';
        }

        showToast(`Query executed in ${elapsed}s`, 'success');
    } catch (err) {
        document.getElementById('queryStatus').textContent = 'Error';
        document.getElementById('resultsBody').innerHTML = `<tr><td class="empty-state" style="color:var(--red)">Error: ${escapeHtml(err.message)}</td></tr>`;
        showToast('Query error: ' + err.message, 'error');
    } finally {
        document.getElementById('btnRunQuery').disabled = false;
    }
}

function formatSQL() {
    const editor = document.getElementById('sqlEditor');
    let sql = editor.value;
    const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON'];
    keywords.forEach(kw => {
        sql = sql.replace(new RegExp(`\\b${kw}\\b`, 'gi'), `\n${kw}`);
    });
    editor.value = sql.trim();
    updateLineNumbers();
}

function clearEditor() {
    document.getElementById('sqlEditor').value = '';
    updateLineNumbers();
}

function updateLineNumbers() {
    const editor = document.getElementById('sqlEditor');
    const lines = editor.value.split('\n').length;
    document.getElementById('lineNumbers').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

// Line numbers sync
document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('sqlEditor');
    if (editor) {
        editor.addEventListener('input', updateLineNumbers);
        editor.addEventListener('scroll', () => {
            document.getElementById('lineNumbers').scrollTop = editor.scrollTop;
        });
        // Tab support
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(editor.selectionEnd);
                editor.selectionStart = editor.selectionEnd = start + 2;
            }
            // Ctrl+Enter to run
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                executeQuery();
            }
        });
        updateLineNumbers();
    }
});

// ==========================================
// TABLE BROWSER (Query sidebar)
// ==========================================
async function loadTableBrowser() {
    try {
        const data = await apiCall('schema');
        const schema = Array.isArray(data) ? data : [data];

        // Group by table
        const grouped = {};
        schema.forEach(row => {
            if (!grouped[row.table_name]) grouped[row.table_name] = [];
            grouped[row.table_name].push(row);
        });

        state.schema = grouped;

        const container = document.getElementById('tableBrowser');
        container.innerHTML = Object.keys(grouped).map(tableName => `
            <div class="browser-table">
                <button class="browser-table-name" onclick="toggleBrowserTable(this)">
                    <span class="arrow">▸</span>
                    <span>${tableName}</span>
                </button>
                <div class="browser-columns">
                    ${grouped[tableName].map(col => `
                        <div class="browser-col" onclick="insertColumnToEditor('${tableName}', '${col.column_name}')">
                            ${col.column_name} <span class="browser-col-type">${col.data_type}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (err) {
        document.getElementById('tableBrowser').innerHTML = `<div class="empty-state">Error loading schema</div>`;
    }
}

function toggleBrowserTable(btn) {
    const arrow = btn.querySelector('.arrow');
    const cols = btn.nextElementSibling;
    arrow.classList.toggle('open');
    cols.classList.toggle('open');
}

function insertColumnToEditor(table, column) {
    const editor = document.getElementById('sqlEditor');
    const pos = editor.selectionStart;
    const text = `${table}.${column}`;
    editor.value = editor.value.substring(0, pos) + text + editor.value.substring(editor.selectionEnd);
    editor.focus();
    editor.selectionStart = editor.selectionEnd = pos + text.length;
    updateLineNumbers();
}

// ==========================================
// SCHEMA VIEW
// ==========================================
async function loadSchema() {
    try {
        const data = await apiCall('schema');
        const schema = Array.isArray(data) ? data : [data];

        const grouped = {};
        schema.forEach(row => {
            if (!grouped[row.table_name]) grouped[row.table_name] = [];
            grouped[row.table_name].push(row);
        });

        state.schema = grouped;

        const container = document.getElementById('schemaGrid');
        container.innerHTML = Object.keys(grouped).map(tableName => `
            <div class="schema-card">
                <div class="schema-card-header">
                    <span class="schema-card-title">${tableName}</span>
                    <div class="schema-card-actions">
                        <button class="btn-icon" title="Add Column" onclick="openModal('addColumn', '${tableName}')">＋</button>
                        <button class="btn-icon" title="View Data" onclick="viewTable('${tableName}')">👁</button>
                        <button class="btn-icon danger" title="Drop Table" onclick="confirmDropTable('${tableName}')">🗑</button>
                    </div>
                </div>
                <div class="schema-col-list">
                    ${grouped[tableName].map(col => `
                        <div class="schema-col-item">
                            <span class="schema-col-name">${col.column_name}</span>
                            <div class="schema-col-meta">
                                <span class="badge badge-purple">${col.data_type}</span>
                                ${col.is_nullable === 'NO' ? '<span class="badge badge-cyan">NOT NULL</span>' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (err) {
        document.getElementById('schemaGrid').innerHTML = `<div class="empty-state">Error loading schema: ${err.message}</div>`;
    }
}

// ==========================================
// MODALS
// ==========================================
function openModal(type, extra = '') {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    overlay.classList.add('active');

    switch (type) {
        case 'createTable':
            title.textContent = 'Create New Table';
            body.innerHTML = `
                <div class="form-group">
                    <label>Table Name</label>
                    <input class="form-input" id="newTableName" placeholder="my_new_table">
                </div>
                <div class="form-group">
                    <label>Columns</label>
                    <div id="columnDefs">
                        <div class="column-def-row">
                            <input class="form-input" placeholder="Column name" value="id">
                            <select class="form-select">
                                <option value="SERIAL PRIMARY KEY" selected>SERIAL PK</option>
                                <option value="INTEGER">INTEGER</option>
                                <option value="VARCHAR(255)">VARCHAR(255)</option>
                                <option value="TEXT">TEXT</option>
                                <option value="BOOLEAN">BOOLEAN</option>
                                <option value="TIMESTAMP">TIMESTAMP</option>
                                <option value="JSONB">JSONB</option>
                                <option value="NUMERIC">NUMERIC</option>
                            </select>
                            <button class="btn-icon danger" onclick="this.parentElement.remove()">✕</button>
                        </div>
                    </div>
                    <button class="btn-outline btn-sm" onclick="addColumnDef()" style="margin-top:8px">+ Add Column</button>
                </div>
                <div class="form-actions">
                    <button class="btn-outline" onclick="closeModal()">Cancel</button>
                    <button class="btn-glow" onclick="createTable()">Create Table</button>
                </div>
            `;
            break;

        case 'insertRow':
            title.textContent = `Insert Row — ${state.currentTable}`;
            body.innerHTML = `
                ${state.currentColumns.filter(c => !isAutoColumn(c)).map(c => `
                    <div class="form-group">
                        <label>${c.column_name} <span style="color:var(--purple);font-size:0.7rem">${c.data_type}</span></label>
                        <input class="form-input" id="insert-${c.column_name}" placeholder="${c.data_type}" ${c.is_nullable === 'YES' ? '' : 'required'}>
                    </div>
                `).join('')}
                <div class="form-actions">
                    <button class="btn-outline" onclick="closeModal()">Cancel</button>
                    <button class="btn-glow" onclick="insertRow()">Insert Row</button>
                </div>
            `;
            break;

        case 'editRow':
            const row = state.currentData[parseInt(extra)];
            title.textContent = `Edit Row — ${state.currentTable}`;
            body.innerHTML = `
                <input type="hidden" id="editRowIndex" value="${extra}">
                ${state.currentColumns.map(c => `
                    <div class="form-group">
                        <label>${c.column_name} <span style="color:var(--purple);font-size:0.7rem">${c.data_type}</span></label>
                        <input class="form-input" id="edit-${c.column_name}" value="${escapeHtml(String(row[c.column_name] ?? ''))}" ${c.column_name === 'id' ? 'readonly' : ''}>
                    </div>
                `).join('')}
                <div class="form-actions">
                    <button class="btn-outline" onclick="closeModal()">Cancel</button>
                    <button class="btn-glow" onclick="updateRow()">Update Row</button>
                </div>
            `;
            break;

        case 'addColumn':
            title.textContent = `Add Column — ${extra}`;
            body.innerHTML = `
                <input type="hidden" id="addColTable" value="${extra}">
                <div class="form-group">
                    <label>Column Name</label>
                    <input class="form-input" id="newColName" placeholder="new_column">
                </div>
                <div class="form-group">
                    <label>Data Type</label>
                    <select class="form-select" id="newColType">
                        <option value="VARCHAR(255)">VARCHAR(255)</option>
                        <option value="TEXT">TEXT</option>
                        <option value="INTEGER">INTEGER</option>
                        <option value="BOOLEAN">BOOLEAN</option>
                        <option value="TIMESTAMP">TIMESTAMP</option>
                        <option value="JSONB">JSONB</option>
                        <option value="NUMERIC">NUMERIC</option>
                        <option value="SERIAL">SERIAL</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button class="btn-outline" onclick="closeModal()">Cancel</button>
                    <button class="btn-glow" onclick="addColumn()">Add Column</button>
                </div>
            `;
            break;
    }
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function addColumnDef() {
    const container = document.getElementById('columnDefs');
    const row = document.createElement('div');
    row.className = 'column-def-row';
    row.innerHTML = `
        <input class="form-input" placeholder="Column name">
        <select class="form-select">
            <option value="VARCHAR(255)">VARCHAR(255)</option>
            <option value="TEXT">TEXT</option>
            <option value="INTEGER">INTEGER</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="TIMESTAMP">TIMESTAMP</option>
            <option value="TIMESTAMP DEFAULT NOW()">TIMESTAMP DEFAULT NOW()</option>
            <option value="JSONB">JSONB</option>
            <option value="NUMERIC">NUMERIC</option>
            <option value="SERIAL PRIMARY KEY">SERIAL PK</option>
        </select>
        <button class="btn-icon danger" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(row);
}

function isAutoColumn(col) {
    return col.data_type === 'integer' && col.column_name === 'id';
}

// ==========================================
// CRUD OPERATIONS
// ==========================================
async function createTable() {
    const name = document.getElementById('newTableName').value.trim();
    if (!name) { showToast('Enter a table name', 'error'); return; }

    const rows = document.querySelectorAll('#columnDefs .column-def-row');
    const columns = [];
    rows.forEach(row => {
        const colName = row.querySelector('input').value.trim();
        const colType = row.querySelector('select').value;
        if (colName) columns.push({ name: colName, type: colType });
    });

    if (!columns.length) { showToast('Add at least one column', 'error'); return; }

    try {
        await apiCall('create_table', 'POST', { table_name: name, columns });
        showToast(`Table "${name}" created!`, 'success');
        closeModal();
        refreshDashboard();
    } catch (err) {
        showToast('Error creating table: ' + err.message, 'error');
    }
}

async function insertRow() {
    const data = {};
    state.currentColumns.filter(c => !isAutoColumn(c)).forEach(c => {
        const val = document.getElementById(`insert-${c.column_name}`).value;
        if (val !== '') data[c.column_name] = val;
    });

    try {
        await apiCall('insert', 'POST', { table_name: state.currentTable, data });
        showToast('Row inserted!', 'success');
        closeModal();
        loadTableData(state.currentTable);
    } catch (err) {
        showToast('Error inserting row: ' + err.message, 'error');
    }
}

function editRow(idx) {
    openModal('editRow', idx);
}

async function updateRow() {
    const idx = parseInt(document.getElementById('editRowIndex').value);
    const oldRow = state.currentData[idx];
    const data = {};
    state.currentColumns.forEach(c => {
        data[c.column_name] = document.getElementById(`edit-${c.column_name}`).value;
    });

    const idCol = state.currentColumns.find(c => c.column_name === 'id');
    const whereId = oldRow.id ?? oldRow[state.currentColumns[0].column_name];

    try {
        await apiCall('update', 'POST', {
            table_name: state.currentTable,
            data,
            where: { column: idCol ? 'id' : state.currentColumns[0].column_name, value: whereId }
        });
        showToast('Row updated!', 'success');
        closeModal();
        loadTableData(state.currentTable);
    } catch (err) {
        showToast('Error updating row: ' + err.message, 'error');
    }
}

async function deleteRow(idx) {
    const row = state.currentData[idx];
    const idCol = state.currentColumns.find(c => c.column_name === 'id');
    const whereVal = row.id ?? row[state.currentColumns[0].column_name];

    if (!confirm(`Are you sure you want to delete this row (${idCol ? 'id' : state.currentColumns[0].column_name}=${whereVal})?`)) return;

    try {
        await apiCall('delete', 'POST', {
            table_name: state.currentTable,
            where: { column: idCol ? 'id' : state.currentColumns[0].column_name, value: whereVal }
        });
        showToast('Row deleted!', 'success');
        loadTableData(state.currentTable);
    } catch (err) {
        showToast('Error deleting row: ' + err.message, 'error');
    }
}

function confirmDropTable(name) {
    if (!confirm(`⚠️ DANGER: Are you sure you want to DROP the table "${name}"? This action cannot be undone!`)) return;
    if (!confirm(`FINAL CONFIRMATION: Type of table "${name}" will be PERMANENTLY DELETED. Proceed?`)) return;
    dropTable(name);
}

async function dropTable(name) {
    try {
        await apiCall('drop_table', 'POST', { table_name: name });
        showToast(`Table "${name}" dropped!`, 'success');
        refreshDashboard();
        loadSchema();
    } catch (err) {
        showToast('Error dropping table: ' + err.message, 'error');
    }
}

async function addColumn() {
    const table = document.getElementById('addColTable').value;
    const colName = document.getElementById('newColName').value.trim();
    const colType = document.getElementById('newColType').value;

    if (!colName) { showToast('Enter column name', 'error'); return; }

    try {
        await apiCall('add_column', 'POST', { table_name: table, column_name: colName, column_type: colType });
        showToast(`Column "${colName}" added to "${table}"!`, 'success');
        closeModal();
        loadSchema();
    } catch (err) {
        showToast('Error adding column: ' + err.message, 'error');
    }
}

function editTableSchema(name) {
    switchView('schema');
}

// ==========================================
// EXPORT
// ==========================================
function exportTableCSV() {
    if (!state.currentData.length) return;
    const colNames = state.currentColumns.map(c => c.column_name);
    let csv = colNames.join(',') + '\n';
    state.currentData.forEach(row => {
        csv += colNames.map(c => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    downloadFile(`${state.currentTable}.csv`, csv, 'text/csv');
    showToast('CSV exported!', 'success');
}

function exportAllData() {
    showToast('Exporting all tables...', 'info');
    // Just open query editor with export query
    switchView('query');
    document.getElementById('sqlEditor').value = `-- Export all tables info\nSELECT table_name, \n  (SELECT count(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name AND table_schema='public') as column_count\nFROM information_schema.tables \nWHERE table_schema = 'public'\nORDER BY table_name;`;
    updateLineNumbers();
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ==========================================
// TOASTS
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ==========================================
// UTILS
// ==========================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatNumber(n) {
    return new Intl.NumberFormat().format(n);
}

// --- Smart Cell Formatting ---
function formatCellValue(value, columnName) {
    if (value === null || value === undefined) return '<span style="color:var(--text-muted)">null</span>';

    // Format dates
    if (isDateColumn(columnName, value)) {
        return formatFriendlyDate(value);
    }

    // Format session_id
    if (columnName === 'session_id') {
        return formatSessionId(String(value));
    }

    // Format JSON objects (like message column)
    if (typeof value === 'object' && value !== null) {
        return formatMessageObject(value);
    }

    return escapeHtml(truncate(String(value), 80));
}

function isDateColumn(colName, value) {
    const dateColumns = ['created_at', 'updated_at', 'deleted_at', 'timestamp', 'date', 'last_message_at', 'fecha'];
    if (dateColumns.some(d => colName.toLowerCase().includes(d))) return true;
    // Also detect ISO date strings
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return true;
    return false;
}

function formatFriendlyDate(value) {
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return escapeHtml(String(value));

        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;

        const dateStr = `${day} ${month} ${year}`;
        const timeStr = `${hours}:${minutes} ${ampm}`;

        return `<span class="cell-date">${dateStr}, <span class="cell-time">${timeStr}</span></span>`;
    } catch {
        return escapeHtml(String(value));
    }
}

function formatSessionId(sid) {
    const name = state.contactsMap[sid];

    if (sid.startsWith('+')) {
        // WhatsApp — format phone number
        const formatted = formatPhoneNumber(sid);
        return `<span class="session-badge session-wa">🟢</span> ${escapeHtml(formatted)}`;
    }
    if (sid.startsWith('messenger_')) {
        const id = sid.replace('messenger_', '');
        if (name) {
            return `<span class="session-badge session-msg">🔵</span> ${escapeHtml(name)} <span class="session-id-num">#${escapeHtml(id)}</span>`;
        }
        return `<span class="session-badge session-msg">🔵</span> Messenger <span class="session-id-num">#${escapeHtml(id)}</span>`;
    }
    if (sid.startsWith('instagram_')) {
        const id = sid.replace('instagram_', '');
        if (name) {
            return `<span class="session-badge session-ig">🟣</span> ${escapeHtml(name)} <span class="session-id-num">#${escapeHtml(id)}</span>`;
        }
        return `<span class="session-badge session-ig">🟣</span> Instagram <span class="session-id-num">#${escapeHtml(id)}</span>`;
    }
    return escapeHtml(sid);
}

function formatPhoneNumber(phone) {
    // Format Mexican numbers: +529982404479 -> +52 998 240 4479
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+52') && cleaned.length >= 13) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
    }
    // Generic formatting for other numbers
    if (cleaned.length > 8) {
        return `${cleaned.slice(0, -10)} ${cleaned.slice(-10, -7)} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
    }
    return phone;
}

function formatMessageObject(obj) {
    // n8n chat memory stores messages as {type, data: {content, ...}}
    if (obj.data && obj.data.content) {
        const isHuman = obj.type === 'human';
        const badgeClass = isHuman ? 'badge-sender badge-cliente' : 'badge-sender badge-agente';
        const badgeLabel = isHuman ? 'Cliente' : 'Agente';
        const emoji = isHuman ? '👤' : '🤖';
        const content = truncate(String(obj.data.content), 60);
        return `<span class="${badgeClass}">${emoji} ${badgeLabel}</span> ${escapeHtml(content)}`;
    }
    // If it's an object with content directly
    if (obj.content) {
        return escapeHtml(truncate(String(obj.content), 70));
    }
    // Fallback: show first meaningful value
    const keys = Object.keys(obj);
    if (keys.length <= 3) {
        return escapeHtml(truncate(JSON.stringify(obj), 80));
    }
    return `<span style="color:var(--text-muted)">{${keys.length} fields}</span>`;
}

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Load API URL from localStorage, but fix stale URLs missing the webhook path
    const defaultUrl = document.getElementById('apiUrl').defaultValue;
    const saved = localStorage.getItem('vexium_api_url');
    if (saved && saved.endsWith('/webhook/vexium-api')) {
        document.getElementById('apiUrl').value = saved;
    } else {
        localStorage.removeItem('vexium_api_url');
        document.getElementById('apiUrl').value = defaultUrl;
    }

    document.getElementById('apiUrl').addEventListener('change', (e) => {
        localStorage.setItem('vexium_api_url', e.target.value);
        showToast('API URL updated', 'info');
    });

    // AUTH CHECK: If user has a valid token, go to dashboard; otherwise show login
    if (isAuthenticated()) {
        hideLogin();
        refreshDashboard();
    } else {
        showLogin();
    }
});

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
