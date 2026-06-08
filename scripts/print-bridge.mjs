#!/usr/bin/env node
/**
 * CrossxPOS Local Print Bridge
 *
 * A tiny HTTP server that receives ESC/POS bytes from the CrossxPOS web app
 * and forwards them via raw TCP to a LAN/WiFi thermal printer (port 9100).
 *
 * WHY THIS EXISTS:
 *   Browsers cannot open raw TCP sockets. This bridge runs alongside CrossxPOS
 *   on the cashier PC and acts as the TCP transport layer.
 *
 * USAGE:
 *   node scripts/print-bridge.mjs          (default port 6100)
 *   PORT=6200 node scripts/print-bridge.mjs
 *
 * API:
 *   GET  /health  → { ok: true, bridge: "...", port: 6100 }
 *   POST /print   → body: { ip, port, data }
 *                   ip   : printer IP address (e.g. "192.168.1.100")
 *                   port : printer TCP port   (default 9100)
 *                   data : ESC/POS bytes encoded as base64
 *
 * The bridge only listens on 127.0.0.1 — not exposed to the network.
 */

import { createServer } from 'node:http'
import { createConnection } from 'node:net'

const BRIDGE_PORT = parseInt(process.env.PORT ?? '6100', 10)

const CORS_HEADERS = {
  // Allow any localhost origin (any port) — bridge is local-only anyway
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS })
  res.end(JSON.stringify(body))
}

/**
 * Opens a TCP connection to ip:port, writes data, then closes.
 * @param {string} ip
 * @param {number} port
 * @param {Buffer} data
 * @returns {Promise<void>}
 */
function sendToTcpPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: ip, port, timeout: 5000 }, () => {
      socket.write(data, (err) => {
        if (err) { socket.destroy(); reject(err); return }
        socket.end()
      })
    })
    socket.on('close', resolve)
    socket.on('error', reject)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Connection timeout to ${ip}:${port}`))
    })
  })
}

const server = createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, bridge: 'CrossxPOS Print Bridge', port: BRIDGE_PORT })
    return
  }

  // Print
  if (req.method === 'POST' && req.url === '/print') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const { ip, port, data } = JSON.parse(body)
        if (!ip || !port || !data) {
          sendJson(res, 400, { ok: false, error: 'Missing required fields: ip, port, data' })
          return
        }
        const bytes = Buffer.from(data, 'base64')
        await sendToTcpPrinter(ip, parseInt(port, 10), bytes)
        console.log(`[bridge] ${new Date().toLocaleTimeString()} — Sent ${bytes.length} bytes → ${ip}:${port}`)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        console.error(`[bridge] Error: ${err.message}`)
        sendJson(res, 500, { ok: false, error: err.message })
      }
    })
    req.on('error', (err) => sendJson(res, 400, { ok: false, error: err.message }))
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.log('╔════════════════════════════════════════════╗')
  console.log(`║  CrossxPOS Print Bridge                    ║`)
  console.log(`║  http://127.0.0.1:${BRIDGE_PORT}                   ║`)
  console.log('╚════════════════════════════════════════════╝')
  console.log('')
  console.log('Waiting for print jobs from CrossxPOS...')
  console.log('Press Ctrl+C to stop.\n')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${BRIDGE_PORT} already in use. Use PORT=<number> to change.`)
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})
