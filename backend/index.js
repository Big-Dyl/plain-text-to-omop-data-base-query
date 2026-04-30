import "dotenv/config";
import sql from "mssql";
import express from "express";
import cors from "cors";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const VALID_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
]);

async function queryDatabase(query, { host, database, user, password, port = 1433 }) {
  const pool = await sql.connect({
    server: host, database, user, password, port,
    options: { encrypt: true, trustServerCertificate: true }
  });
  try {
    const result = await pool.request().query(query);
    return result.recordset;
  } finally {
    await sql.close();
  }
}

async function textToSQL(userQuestion, model = DEFAULT_MODEL) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      tools: [
        {
          name: "generate_sql",
          description: "Generate a SQL query from a plain English question",
          input_schema: {
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "The SQL query"
              },
            },
            required: ["sql"]
          }
        }
      ],
      tool_choice: { type: "tool", name: "generate_sql" },
      system: `You are an OMOP CDM v5.4 SQL expert targeting Microsoft SQL Server.
Output only a single SELECT statement. No comments, no semicolons, no alternatives.
Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any other data-modifying statement.`,
      messages: [
        { role: "user", content: userQuestion }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Anthropic API error ${response.status}`);
  }

  const toolUse = data.content.find(block => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("No SQL was generated");
  }

  const generatedSql = toolUse.input.sql;

  return generatedSql;
}

const app = express();
app.use(cors());
app.use(express.json());

// Stage 1: Generate SQL from natural language, do NOT touch the database
app.post("/generate", async (req, res) => {
  const { query, model } = req.body;

  if (!query) return res.status(400).json({ error: "query is required" });

  const resolvedModel = VALID_MODELS.has(model) ? model : DEFAULT_MODEL;

  console.log(`[model] ${resolvedModel}`);
  console.log(`[query] ${query}`);

  try {
    const sql_msg = await textToSQL(query, resolvedModel);
    console.log(`[sql]   ${sql_msg}`);
    res.json({ sql_msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stage 2: Execute a SQL string the user has explicitly approved
app.post("/execute", async (req, res) => {
  const { sql_msg, host, database, username, password } = req.body;

  if (!sql_msg)   return res.status(400).json({ error: "sql_msg is required" });
  if (!host)      return res.status(400).json({ error: "host is required" });
  if (!database)  return res.status(400).json({ error: "database is required" });

  console.log(`[execute] ${sql_msg}`);

  try {
    const rows = await queryDatabase(sql_msg, { host, database, user: username, password });
    res.json({ sql_msg, response: JSON.stringify(rows, null, 2) });
  } catch (err) {
    res.status(500).json({ sql_msg, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));