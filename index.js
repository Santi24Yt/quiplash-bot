require('dotenv').config()

const express = require('express')
const nacl = require('tweetnacl')
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

mongoose.connect(process.env.MONGO_URI, {})

/**
 * @type {Map<string, import('./typings').Command>}
 */
const commands = new Map()
/**
 * @type {Map<string, import('./typings').Component>}
 */
const components = new Map()
/**
 * @type {Map<string, import('./typings').Modal>}
 */
const modals = new Map()
const files = (str) => fs.readdirSync(str).filter(file => file.endsWith('.js'))

files('./commands').forEach(c => {
  const p = path.basename(c, '.js')
  try {
    const command = require(`./commands/${c}`)
    commands.set(p, command)
    if (command.components?.length) command.components.forEach(co => {
      components.set(co.name, co)
    })
    if (command.modals?.length) command.modals.forEach(mo => {
      modals.set(mo.name, mo)
    })
  } catch (err) {
    console.error(`Comando ${p} no funciona:`)
    console.error(err)
  }
})

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

app.post('/api/interactions', (req, res) => {
  const PUBLIC_KEY = process.env.PUBLIC_KEY
  const signature = req.get('X-Signature-Ed25519')
  const timestamp = req.get('X-Signature-Timestamp')

  if (!signature || !timestamp) return res.status(401).end('Invalid request')

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + JSON.stringify(req.body)),
    Buffer.from(signature, 'hex'),
    Buffer.from(PUBLIC_KEY, 'hex')
  )

  if (!isVerified) return res.status(401).end('Invalid request signature')

  switch (req.body.type) {
  //Ping
  case 1:
    res.status(200).json({ type: 1 })
    break

    //Application Command
  case 2:
    commands.get(req.body.data.name).execute(req.body, res)
    break

    //Message Component
  case 3:
    components.get(req.body.data.custom_id).execute(req.body, res)
    break

    //Application Command Autocomplete
  case 4:
    break

    //Modal Submit
  case 5:
    modals.get(req.body.data.custom_id).execute(req.body, res)
    break

  default:
    res.status(400).json({ error: 'Invalid interaction type' })
  }
})

app.listen(port)