const fs = require('fs');

const workflow = {
    "name": "VexiumDB Unified API (Router)",
    "nodes": [
        {
            "parameters": {
                "path": "vexium-api",
                "responseMode": "responseNode",
                "options": {
                    "responseHeaders": {
                        "entries": [
                            { "name": "Access-Control-Allow-Origin", "value": "*" },
                            { "name": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
                            { "name": "Access-Control-Allow-Headers", "value": "Content-Type" }
                        ]
                    }
                }
            },
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [0, 0],
            "id": "webhook-trigger",
            "name": "Webhook Gateway",
            "webhookId": "vexium-api"
        },
        {
            "parameters": {
                "dataType": "string",
                "value1": "={{ $json.query.action || $json.body.action }}",
                "rules": {
                    "parameters": [
                        { "value2": "stats", "output": 0 },
                        { "value2": "tables", "output": 1 },
                        { "value2": "columns", "output": 2 },
                        { "value2": "data", "output": 3 },
                        { "value2": "schema", "output": 4 },
                        { "value2": "query", "output": 5 },
                        { "value2": "create_table", "output": 6 },
                        { "value2": "insert", "output": 7 },
                        { "value2": "update", "output": 8 },
                        { "value2": "delete", "output": 9 },
                        { "value2": "drop_table", "output": 10 },
                        { "value2": "add_column", "output": 11 }
                    ]
                }
            },
            "type": "n8n-nodes-base.switch",
            "typeVersion": 3,
            "position": [250, 0],
            "id": "action-router",
            "name": "Action Router"
        },
        {
            // RESPONSE NODE
            "parameters": {
                "respondWith": "allIncomingItems",
                "options": {
                    "responseHeaders": {
                        "entries": [
                            { "name": "Access-Control-Allow-Origin", "value": "*" },
                            { "name": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
                            { "name": "Access-Control-Allow-Headers", "value": "Content-Type" }
                        ]
                    }
                }
            },
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1,
            "position": [1000, 0],
            "id": "response-node",
            "name": "Respond API"
        }
    ],
    "connections": {
        "Webhook Gateway": { "main": [[{ "node": "Action Router", "type": "main", "index": 0 }]] }
    }
};

// Helper to create Postgres Node
function createPgNode(name, query, outputIndex) {
    const id = `pg-${name.toLowerCase().replace(/\s+/g, '-')}`;
    return {
        node: {
            "parameters": {
                "operation": "executeQuery",
                "query": query,
                "options": {}
            },
            "type": "n8n-nodes-base.postgres",
            "typeVersion": 2.5,
            "position": [600, (outputIndex * 100) - 400],
            "id": id,
            "name": name,
            "credentials": { "postgres": { "id": "SA63uR9JlxfgsmMU", "name": "Postgres account 2" } }
        },
        outputIndex: outputIndex
    };
}

const queries = [
    { name: "Get Stats", index: 0, query: "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public') as total_tables, (SELECT SUM(n_live_tup) FROM pg_stat_user_tables) as total_rows, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public') as total_columns, pg_size_pretty(pg_database_size(current_database())) as db_size;" },

    { name: "Get Tables", index: 1, query: "SELECT t.table_name, (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count, COALESCE(s.n_live_tup, 0) as row_count FROM information_schema.tables t LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname WHERE t.table_schema = 'public' ORDER BY t.table_name;" },

    { name: "Get Columns", index: 2, query: "=SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{{ $json.query.table || $json.body.table }}' ORDER BY ordinal_position;" },

    { name: "Get Data", index: 3, query: "=SELECT * FROM {{ $json.query.table || $json.body.table }} ORDER BY 1 DESC LIMIT 200;" },

    { name: "Get Schema", index: 4, query: "SELECT t.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default FROM information_schema.tables t JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE t.table_schema = 'public' ORDER BY t.table_name, c.ordinal_position;" },

    { name: "Run Query", index: 5, query: "={{ $json.body.query }}" },

    { name: "Create Table", index: 6, query: "={{ 'CREATE TABLE IF NOT EXISTS ' + $json.body.table_name + ' (' + $json.body.columns.map(c => c.name + ' ' + c.type).join(', ') + ');' }}" },

    { name: "Insert Row", index: 7, query: "={{ (() => { const d = $json.body.data; const keys = Object.keys(d); const vals = keys.map(k => \"'\" + String(d[k]).replace(/'/g, \"''\") + \"'\"); return 'INSERT INTO ' + $json.body.table_name + ' (' + keys.join(', ') + ') VALUES (' + vals.join(', ') + ');'; })() }}" },

    { name: "Update Row", index: 8, query: "={{ (() => { const d = $json.body.data; const w = $json.body.where; const sets = Object.keys(d).filter(k => k !== w.column).map(k => k + \" = '\" + String(d[k]).replace(/'/g, \"''\") + \"'\"); return 'UPDATE ' + $json.body.table_name + ' SET ' + sets.join(', ') + \" WHERE \" + w.column + \" = '\" + String(w.value).replace(/'/g, \"''\") + \"';\"; })() }}" },

    { name: "Delete Row", index: 9, query: "={{ 'DELETE FROM ' + $json.body.table_name + \" WHERE \" + $json.body.where.column + \" = '\" + String($json.body.where.value).replace(/'/g, \"''\") + \"';\" }}" },

    { name: "Drop Table", index: 10, query: "={{ 'DROP TABLE IF EXISTS ' + $json.body.table_name + ';' }}" },

    { name: "Add Column", index: 11, query: "={{ 'ALTER TABLE ' + $json.body.table_name + ' ADD COLUMN ' + $json.body.column_name + ' ' + $json.body.column_type + ';' }}" }
];

const connections = workflow.connections;
connections["Action Router"] = { main: [] };

queries.forEach(q => {
    const nodeObj = createPgNode(q.name, q.query, q.index);
    workflow.nodes.push(nodeObj.node);

    // Conectar Router -> Postgres
    if (!connections["Action Router"].main[q.index]) connections["Action Router"].main[q.index] = [];
    connections["Action Router"].main[q.index].push({ node: q.name, type: "main", index: 0 });

    // Conectar Postgres -> Respond
    connections[q.name] = { main: [[{ node: "Respond API", type: "main", index: 0 }]] };
});

fs.writeFileSync('VexiumDB_Unified_API.json', JSON.stringify(workflow, null, 4));
console.log('Unified Workflow Generated!');
