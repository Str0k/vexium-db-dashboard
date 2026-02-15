/* ========================================
   VexiumAI Database Dashboard — Application Logic
   Connects to n8n webhook API endpoints
   ======================================== */

// ==========================================
// CONFIG & STATE
// ==========================================
const state = {
    tables: [],
    schema: {},
    currentTable: null,
    currentData: [],
    currentColumns: [],
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
async function apiCall(action, method = 'GET', body = {}) {
    // Si el usuario pone la URL completa con parámetros, la limpiamos
    let baseUrl = getApiBase().split('?')[0];

    // Construimos la URL unificada
    // Siempre usamos la misma URL base, y pasamos 'action' como parámetro query string o body
    const url = new URL(baseUrl);
    url.searchParams.set('action', action);

    // Si es GET, añadimos los params del body a la URL también (para selects simples)
    if (method === 'GET' && body && typeof body === 'object') {
        Object.keys(body).forEach(key => url.searchParams.set(key, body[key]));
    }

    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };

    if (method !== 'GET') {
        // En POST, enviamos la acción también en el body por si acaso
        body.action = action;
        opts.body = JSON.stringify(body);
    }

    try {
        const res = await fetch(url.toString(), opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
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

        renderDataGrid(columns, rows);
        document.getElementById('rowCount').textContent = `${rows.length} rows`;

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
            ${colNames.map(c => `<td title="${escapeHtml(String(row[c] ?? ''))}">${escapeHtml(truncate(String(row[c] ?? ''), 80))}</td>`).join('')}
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
        // Clear stale/incorrect saved URL and use the default
        localStorage.removeItem('vexium_api_url');
        document.getElementById('apiUrl').value = defaultUrl;
    }

    document.getElementById('apiUrl').addEventListener('change', (e) => {
        localStorage.setItem('vexium_api_url', e.target.value);
        showToast('API URL updated', 'info');
    });

    // Auto-load dashboard
    refreshDashboard();
});

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
