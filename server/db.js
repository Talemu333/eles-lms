import mysql from 'mysql2/promise'
import fs from 'node:fs'
import 'dotenv/config'

const sslCa = process.env.DB_SSL_CA || (process.env.DB_SSL_CA_PATH
  ? fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8')
  : '')

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'defaultdb',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0
}

if (sslCa) {
  poolConfig.ssl = {
    ca: sslCa,
    rejectUnauthorized: true
  }
}

const pool = mysql.createPool(poolConfig)

// The Aiven database may have been created from an earlier version of the
// schema. The course API reads teaching_manual, so make that column available
// automatically without deleting or changing existing course data.
async function ensureSchemaCompatibility() {
  try {
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'levels'
        AND COLUMN_NAME = 'teaching_manual'
      LIMIT 1
    `)

    if (!columns.length) {
      await pool.query('ALTER TABLE levels ADD COLUMN teaching_manual LONGTEXT NULL')
      console.log('[db] Added missing levels.teaching_manual column')
    }
  } catch (error) {
    // Do not prevent the API from starting. This is only a compatibility
    // migration; the real query errors will still be reported by the route.
    console.error('[db] Schema compatibility check failed:', error.message)
  }
}

await ensureSchemaCompatibility()

export default pool
