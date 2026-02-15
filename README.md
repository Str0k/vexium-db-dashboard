# 🗄️ VexiumDB Dashboard

Premium database administration dashboard with a futuristic dark glassmorphic design.

## 📁 Project Structure

```
vexium-db-dashboard/
├── index.html                      ← Dashboard frontend
├── style.css                       ← Premium CSS design system
├── app.js                          ← Application logic (API calls, CRUD, etc.)
├── VexiumDB_Dashboard_API.json     ← n8n workflow (import to n8n)
└── README.md                       ← This file
```

## 🚀 Setup

### 1. Import the n8n Workflow

1. Go to your n8n instance
2. Click **Import Workflow** (or Settings → Import from file)
3. Select `VexiumDB_Dashboard_API.json`
4. **IMPORTANT:** Update the PostgreSQL credentials in each Postgres node to match your database
5. **Activate** the workflow

### 2. Configure the Dashboard

1. Open `index.html` in your browser
2. In the top-right corner, set your **API URL** to match your n8n webhook base URL
   - Example: `https://n8n.vexiumai.com/webhook`
   - Or for local: `http://localhost:5678/webhook`
3. The URL is saved in localStorage automatically

### 3. Credential Setup in n8n

The workflow uses a PostgreSQL credential reference. You need to:
1. Open each Postgres node in n8n
2. Select your correct PostgreSQL credentials
3. Save and activate

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/db-stats` | Database statistics (tables, rows, size) |
| GET | `/db-tables` | List all tables with row counts |
| GET | `/db-columns?table=X` | Get columns for a specific table |
| GET | `/db-data?table=X` | Get data from table (limit 200) |
| GET | `/db-schema` | Full database schema |
| POST | `/db-query` | Execute custom SQL query |
| POST | `/db-create-table` | Create a new table |
| POST | `/db-insert` | Insert a row |
| POST | `/db-update` | Update a row |
| POST | `/db-delete` | Delete a row |
| POST | `/db-drop-table` | Drop a table |
| POST | `/db-add-column` | Add column to table |

## ✨ Features

- **Dashboard** — Stats overview, tables list, quick actions
- **Tables** — Browse data, insert/edit/delete rows, view schema
- **Query Editor** — Write SQL, execute, view results, table browser sidebar
- **Schema Manager** — View all tables & columns, add columns, drop tables
- **Export** — CSV export for any table
- **Responsive** — Works on desktop, tablet, mobile

## 🎨 Design

- Dark theme with deep navy background (`#060a14`)
- Neon cyan (`#00f0ff`) and electric purple (`#8b5cf6`) accents
- Glassmorphism panels with frosted glass effects
- Animated grid background with floating glow orbs
- JetBrains Mono for code/data, Inter for UI text
- Smooth micro-animations and hover effects
