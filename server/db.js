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
  database: process.env.DB_NAME || 'eles_lms',
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

export default pool
