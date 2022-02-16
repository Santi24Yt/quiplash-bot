const FormData = require('form-data')
const c = require('centra')

const apiVersion = process.env.DISCORD_API_VERSION || 9
const base = `https://discord.com/api/v${apiVersion}`

/**
 * @param {any} reply
 * @param {import('discord-api-types').APIBaseInteraction} interaction
 * @param {import('express').Response} res
 * */
function reply(reply, interaction, res) {
  if(typeof reply === 'string') return res.status(200).json({
    type: 4,
    data: {
      content: reply
    }
  })
  if(reply.files?.length)
  {
    let form = new FormData()
    reply.files.forEach((f, i) => {
      form.append(i, f.buffer, {filename: f.name})
    })
    form.append('payload-json', JSON.stringify(reply.data))
    return res.header(form.getHeaders()).send(form)
  }
  res.status(200).json({
    type: 4,
    data: reply.data ?? reply
  })
}

/**
 * @param {any} message
 * @param {import('discord-api-types').APIBaseInteraction} interaction
 * @returns {Promise<import('./typings').Res>}
 * */
async function followUp(message, interaction) {
  if(typeof message === 'string') {
    let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}`, 'POST')
      .header('Content-Type', 'application/json')
      .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
      .body({content: message})
      .send()
    r['rawBody'] = r.body
    r.body = await r.json()
    return r
  }
  if(message.files?.length)
  {
    let form = new FormData()
    message.files.forEach((f, i) => {
      form.append(i, f.buffer, {filename: f.name})
    })
    form.append('payload-json', JSON.stringify(message.data))
    let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}`, 'POST')
      .header(form.getHeaders())
      .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
      .body(form)
      .send()
    r['rawBody'] = r.body
    r.body = await r.json()
    return r
  }
  let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}`, 'POST')
    .header('Content-Type', 'application/json')
    .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
    .body(message.data ?? message)
    .send()
  r['rawBody'] = r.body
  r.body = await r.json()
  return r
}

/**
 * @param {any} message
 * @param {import('discord-api-types').APIBaseInteraction} interaction
 * @param {import('express').Response} res
 * */
function update(message, interaction, res) {
  if(typeof message === 'string') return res.status(200).json({
    type: 7,
    data: {
      content: message
    }
  })
  if(message.files?.length)
  {
    let form = new FormData()
    message.files.forEach((f, i) => {
      form.append(i, f.buffer, {filename: f.name})
    })
    form.append('payload-json', JSON.stringify(message.data))
    return res.header(form.getHeaders()).send(form)
  }
  res.status(200).json({
    type: 7,
    data: message.data ?? message
  })
}

/**
 * @param {any} message
 * @param {import('discord-api-types').APIBaseInteraction} interaction
 * */
async function editReply(message, interaction) {
  if(typeof message === 'string') {
    let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`, 'PATCH')
      .header('Content-Type', 'application/json')
      .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
      .body({content: message})
      .send()
    r['rawBody'] = r.body
    r.body = await r.json()
    return r
  }
  if(message.files?.length)
  {
    let form = new FormData()
    message.files.forEach((f, i) => {
      form.append(i, f.buffer, {filename: f.name})
    })
    form.append('payload-json', JSON.stringify(message.data))
    let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`, 'PATCH')
      .header(form.getHeaders())
      .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
      .body(form)
      .send()
    r['rawBody'] = r.body
    r.body = await r.json()
    return r
  }
  let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`, 'PATCH')
    .header('Content-Type', 'application/json')
    .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
    .body(message.data ?? message)
    .send()
  r['rawBody'] = r.body
  r.body = await r.json()
  return r
}

function modal(modal, interaction, res) {
  res.status(200).json({
    type: 9,
    data: modal
  })
}

/**
 * @param {any} message
 * @param {import('discord-api-types').APIBaseInteraction} interaction
 * */
async function deleteMsg(message, interaction) {
  let r = await c(`${base}/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/${message.id ?? '@original'}`, 'DELETE')
    .header('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
    .send()
  let data = await r.json()
  if(data?.retry_after)
  {
    setTimeout(() => {
      deleteMsg(message, interaction)
    }, (data.retry_after*1000)+10)
  }
}

module.exports = {
  reply,
  followUp,
  deleteMsg,
  update,
  editReply,
  modal
}