require('dotenv').config()

const c = require('centra')
const fs = require('fs')

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'))
const commands = []
const apiVersion = process.env.DISCORD_API_VERSION || 9

for (const file of commandFiles)
{
  const command = require(`./commands/${file}`)
  commands.push(command.data)
}

console.log('Iniciando la actualización de (/) comandos de aplicación')

c(`https://discord.com/api/v${apiVersion}/applications/${process.env.CLIENT_ID}/commands`, 'PUT')
  .body(commands)
  .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
  .header('Content-Type', 'application/json')
  .send()
  .then(() => {
    console.log('(/) Comandos de aplicación recargados con éxito')
  })
  .catch(err => console.error(err))