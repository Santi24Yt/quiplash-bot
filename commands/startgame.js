const { reply, followUp, deleteMsg, update, editReply, modal, deferMsg } = require('../utils')
const GameModel = require('../schemas/game')
const ReplayModel = require('../schemas/replay')
const { content: questions } = require('../assets/QuiplashQuestion.json')
const fs = require('fs')
const { Image } = require('imagescript')
const centra = require('centra')
let usersCache = new Map()

/**
 * @typedef {import('../typings').Command}
 */
let c = {
  data: {
    name: 'startgame',
    description: 'Empezar un juego en el canal actual',
    options: [
      {
        type: 3,
        name: 'name',
        required: true,
        description: 'Nombre de la partida',
      },
      {
        type: 5,
        name: 'family-friendly',
        description: 'Contenido apto para toda la familia'
      },
      {
        type: 4,
        name: 'max-members',
        description: 'Cantidad máxima de jugadores'
      },
      {
        type: 4,
        name: 'rounds',
        description: 'Cantidad de rondas'
      },
      {
        type: 5,
        name: 'spectators',
        description: 'Permitir espectadores'
      },
    ],
    default_permission: true,
    type: 1
  },
  /**
  * @param {import('discord-api-types').APIBaseInteraction} interaction
  * @param {import('express').Response} res
  * */
  async execute(interaction, res) {
    if (!interaction.member) return reply('Los comandos del bot solo se pueden usar en servidores. 🥑', interaction, res)

    let game = await GameModel.findById(interaction.channel_id).lean()
    if (game) return reply({ content: 'Ya hay un juego en curso', flags: 1 << 6 }, interaction, res)

    deferMsg(res)

    let user_id = interaction.user?.id ?? interaction.member?.user.id
    game = await new GameModel({
      _id: interaction.channel_id,
      name: interaction.data.options.find(o => o.name == 'name').value,
      players: [user_id],
      familyFriendly: interaction.data.options.find(o => o.name == 'family-friendly')?.value ?? false,
      maxMembers: interaction.data.options.find(o => o.name == 'max-members')?.value ?? 8,
      rounds: interaction.data.options.find(o => o.name == 'rounds')?.value ?? 1,
      spectatorsEnabled: interaction.data.options.find(o => o.name == 'spectators')?.value ?? false,
      spectators: []
    }).save()

    usersCache.set(interaction.channel_id, new Map())
    let avatar = (interaction.user ?? interaction.member).avatar || interaction.member?.user.avatar
    if(avatar && user_id)
    {
      usersCache.get(interaction.channel_id).set(user_id, {avatar: avatar, avatar_url: `https://cdn.discordapp.com/avatars/${user_id}/${avatar}.png?size=64` , name: interaction.member?.nick ?? interaction.user?.username ?? interaction.member?.user.username})
    }

    editReply({
      ...createGameEmbed(game),
      files: [{
        name: 'menu.png',
        buffer: await menu(interaction, game.name, game.players, game.familyFriendly, game.maxMembers, game.spectators)
      }]
    }, interaction)
  },
  components: [
    {
      name: 'startgame_startGame',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if (game.players[0] !== (interaction.user?.id ?? interaction.member?.user.id)) return reply({ content: 'Solo el anfitrión de la partida puede iniciar el juego', flags: 1 << 6 }, interaction, res)
        if (game.players.length < 3) return reply({ content: 'Debe haber mínimo 3 jugadores para iniciar', flags: 1 << 6 }, interaction, res)
        game.phase = 'answers'
        genQuestions(game)
        await game.save()
        let t = 80 * 1000
        update({
          ...createGameEmbed(game),
          content: 'Responde a las preguntas\nTiempo restante: <t:' + Math.floor((Date.now() + t) / 1000) + ':R>',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: 'startgame_showQuestion',
                  label: 'Mostrar pregunta',
                  style: 1
                }
              ]
            }
          ]
        }, interaction, res)
        let m = await followUp('Iniciando juego', interaction)
        setTimeout(() => deleteMsg(m.body, interaction), 5000)
        for (let i = 5; i >= 0; i--) {
          setTimeout(async () => {
            let m = await followUp({
              content: i == 0 ? 'Se acabó el tiempo' : `${i}`
            }, interaction)
            if (i > 0) {
              setTimeout(() => {
                deleteMsg(m.body, interaction)
              }, i * 1000)
            } else {
              setTimeout(() => {
                deleteMsg(m.body, interaction)
              }, 5000)
            }
          }, t - 1000 * i)
        }
        setTimeout(() => { votingPhase(interaction, game) }, t)
      }
    },
    {
      name: 'startgame_joinGame',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        let user_id = interaction.user?.id ?? interaction.member?.user.id
        if (game.players.includes(user_id)) return reply({ content: 'Ya estas participando en la partida', flags: 1 << 6 }, interaction, res)
        game.players.push(user_id)
        await game.save()

        let avatar = (interaction.user ?? interaction.member).avatar || interaction.member?.user.avatar
        if(avatar && user_id)
        {
          usersCache.get(interaction.channel_id).set(user_id, {avatar: avatar, avatar_url: `https://cdn.discordapp.com/avatars/${user_id}/${avatar}.png?size=64` , name: interaction.member?.nick ?? interaction.user?.username ?? interaction.member?.user.username})
        }

        update({
          ...createGameEmbed(game),
          files: [{
            name: 'menu.png',
            buffer: await menu(interaction, game.name, game.players, game.familyFriendly, game.maxMembers, game.spectators)
          }]
        }, interaction, res)
      }
    },
    {
      name: 'startgame_leaveGame',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        let user_id = interaction.user?.id ?? interaction.member?.user.id
        if (!game.players.includes(user_id)) return reply({ content: 'No estas participando en la partida', flags: 1 << 6 }, interaction, res)
        game.players = game.players.filter(p => p !== user_id)
        await game.save()

        usersCache.get(interaction.channel_id).delete(user_id)

        update({
          ...createGameEmbed(game),
          files: [{
            name: 'menu.png',
            buffer: await menu(interaction, game.name, game.players, game.familyFriendly, game.maxMembers, game.spectators)
          }]
        }, interaction, res)
      }
    },
    {
      name: 'startgame_stopGame',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if (game.players[0] !== (interaction.user?.id ?? interaction.member?.user.id)) return reply({ content: 'Solo el anfitrión de la partida puede terminar el juego', flags: 1 << 6 }, interaction, res)
        await GameModel.deleteOne({ _id: interaction.channel_id })
        
        usersCache.delete(interaction.channel_id)

        update({
          content: 'No pos, ya no vamo\' a jugar',
          embeds: [],
          components: [],
          attachments: []
        }, interaction, res)
      }
    },
    {
      name: 'startgame_showQuestion',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if (!game.players.includes((interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'No estas participando en esta partida', flags: 1 << 6 }, interaction, res)
        const question = game.questions.find(q => q.users.includes((interaction.user?.id ?? interaction.member?.user.id)) && !q.answers.find(a => a.user == (interaction.user?.id ?? interaction.member?.user.id)))
        if (question) {
          reply({
            content: question.prompt,
            flags: 1 << 6,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: 'startgame_answerQuestion',
                    label: 'Responder',
                    style: 1
                  }
                ]
              }
            ]
          }, interaction, res)
        } else {
          reply({
            content: 'Ya respondiste a todas tus preguntas\n' + game.questions.filter(q => q.users.includes((interaction.user?.id ?? interaction.member?.user.id))).map(q => q.prompt + '\n> ' + q.answers.find(a => a.user == (interaction.user?.id ?? interaction.member?.user.id)).a).join('\n'),
            flags: 1 << 6
          }, interaction, res)
        }
      }
    },
    {
      name: 'startgame_vote1',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if (!game.players.includes((interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'No estas participando en esta partida', flags: 1 << 6 }, interaction, res)
        let q = game.questions.find(q => q.prompt == interaction.message.embeds[0].description)
        if (q?.votes.find(v => v.user == (interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'Ya votaste', flags: 1 << 6 }, interaction, res)
        if (q.users.includes((interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'No puedes votar en la ronda en la que se incluye tu respuesta', flags: 1 << 6 }, interaction, res)
        game.questions.find(q => q.prompt == interaction.message.embeds[0].description)?.votes.push({ answer: 0, user: (interaction.user?.id ?? interaction.member?.user.id) })
        await game.save()

        reply({
          content: 'Votaste por la respuesta no. 1',
          flags: 1 << 6
        }, interaction, res)
      }
    },
    {
      name: 'startgame_vote2',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if (!game.players.includes((interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'No estas participando en esta partida', flags: 1 << 6 }, interaction, res)
        let q = game.questions.find(q => q.prompt == interaction.message.embeds[0].description)
        if (q?.votes.find(v => v.user == (interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'Ya votaste', flags: 1 << 6 }, interaction, res)
        if (q.users.includes((interaction.user?.id ?? interaction.member?.user.id))) return reply({ content: 'No puedes votar en la ronda en la que se incluye tu respuesta', flags: 1 << 6 }, interaction, res)
        game.questions.find(q => q.prompt == interaction.message.embeds[0].description)?.votes.push({ answer: 1, user: (interaction.user?.id ?? interaction.member?.user.id) })
        await game.save()

        reply({
          content: 'Votaste por la respuesta no. 2',
          flags: 1 << 6
        }, interaction, res)
      }
    },
    {
      name: 'startgame_answerQuestion',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if(!game) return reply({ content: 'No hay un juego activo en este canal', flags: 1 << 6 }, interaction, res)
        if(game.phase !== 'answers') return reply({content: 'Te tardaste demasiado, las ya no puedes responder a las preguntas', flags: 1 << 6}, interaction, res)
        const question = game.questions.find(q => q.users.includes((interaction.user?.id ?? interaction.member?.user.id)) && !q.answers.find(a => a.user == (interaction.user?.id ?? interaction.member?.user.id)))
        if(!question) return reply({
          content: 'Ya respondiste a todas tus preguntas\n' + game.questions.filter(q => q.users.includes((interaction.user?.id ?? interaction.member?.user.id))).map(q => q.prompt + '\n> ' + q.answers.find(a => a.user == (interaction.user?.id ?? interaction.member?.user.id)).a).join('\n'),
          flags: 1 << 6
        }, interaction, res)
        modal({
          custom_id: 'startgame_submitQuestion',
          title: question.prompt.slice(0, 25),
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  label: question.prompt.slice(25, 70),
                  placeholder: question.prompt.length > 70 ? question.prompt.slice(70) : 'Respuesta',
                  style: 1,
                  custom_id: 'xd'
                }
              ]
            }
          ]
        }, interaction, res)
      }
    }
  ],
  modals: [
    {
      name: 'startgame_submitQuestion',
      /**
      * @param {import('discord-api-types').APIBaseInteraction} interaction
      * @param {import('express').Response} res
      * */
      async execute(interaction, res) {
        const game = await GameModel.findById(interaction.channel_id)
        if(!game) return reply({ content: 'No hay un juego activo en este canal', flags: 1 << 6 }, interaction, res)
        if(game.phase !== 'answers') return reply({content: 'Te tardaste demasiado, las ya no puedes responder a las preguntas', flags: 1 << 6}, interaction, res)
        const question = game.questions.find(q => q.users.includes((interaction.user?.id ?? interaction.member?.user.id)) && !q.answers.find(a => a.user == (interaction.user?.id ?? interaction.member?.user.id)))
        game.questions[game.questions.indexOf(question)].answers.push({a: interaction.data.components[0].components[0].value, user: (interaction.user?.id ?? interaction.member?.user.id)})
        await game.save()
        reply({
          content: 'Respuesta registrada correctamente',
          flags: 1 << 6,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: 'startgame_showQuestion',
                  label: 'Mostrar pregunta',
                  style: 1,
                  disabled: !(game.questions.find(q => q.users.includes((interaction.user?.id ?? interaction.member?.user.id)) && !q.answers.find(a => a.user == (interaction.user?.id ?? interaction.member?.user.id))))
                }
              ]
            }
          ]
        }, interaction, res)
      }
    }
  ]
}

module.exports = c


function createGameEmbed(game) {
  return {
    content: `Esperando a más jugadores...\n${game.players.map(p => `<@${p}>`).join('')}`,
    embeds: [
      {
        type: 'rich',
        color: parseInt(0x0f5c842.toString()),
        author: {
          name: game.name
        },
        description: `Jugadores:\n${game.players.map(p => `> - <@${p}>`).join('\n')}`
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'startgame_startGame',
            label: 'Iniciar',
            style: 3
          },
          {
            type: 2,
            custom_id: 'startgame_joinGame',
            label: 'Unirse',
            style: 1
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'startgame_leaveGame',
            label: 'Salir',
            style: 4
          },
          {
            type: 2,
            custom_id: 'startgame_stopGame',
            label: 'Terminar',
            style: 4
          }
        ]
      }
    ]
  }
}

function genQuestions(game) {
  let players = game.players
  let genQuestion = () => questions[Math.floor(Math.random() * questions.length)]
  for (let player of players) {
    if (game.questions.filter(q => q.users.includes(player)).length >= 2) continue
    let avPlayers = players.filter(p => p != player)
    let question1 = genQuestion()
    while (game.questions.find(q => q.id == question1.id)) {
      question1 = genQuestion()
    }
    let rival1N = Math.floor(Math.random() * avPlayers.length)
    let rival1 = avPlayers[rival1N]
    avPlayers.splice(rival1N, 1)
    let question2 = genQuestion()
    while (game.questions.find(q => q.id == question2.id)) {
      question2 = genQuestion()
    }
    let rival2N = Math.floor(Math.random() * avPlayers.length)
    let rival2 = avPlayers[rival2N]
    avPlayers.splice(rival2N, 1)
    game.questions.push({ ...question1, users: [player, rival1] }, { ...question2, users: [player, rival2] })
  }
}

function createVoteEmbed(game, question, finished) {
  let a1 = question.answers[0]
  let a2 = question.answers[1]
  let va1 = question.votes.filter(v => v.answer == 0)
  let va2 = question.votes.filter(v => v.answer == 1)
  let u1 = a1?.user || question.users.find(u => u != a2?.user)
  let u2 = a2?.user || question.users.find(u => u != u1)
  console.log(game.points)
  if (finished) {
    let p1 = game.points.find(p => p._id == u1)
    let p2 = game.points.find(p => p._id == u2)
    if (va1.length > va2.length) {
      if (p1) {
        game.points.push({_id: u1, points: p1 + Math.floor((5000 / game.players.length) * va1.length)})
      } else {
        game.points.push({_id: u1, points: Math.floor((5000 / game.players.length) * va1.length)})
      }
    } else if (va2.length > va1.length) {
      if (p2) {
        game.points.push({_id: u2, points: p2 + Math.floor((5000 / game.players.length) * va2.length)})
      } else {
        game.points.push({_id: u2, points: Math.floor((5000 / game.players.length) * va2.length)})
      }
    } else if (va1 == va2) {
      if (p1) {
        game.points.push({_id: u1, points: p1 + Math.floor((5000 / game.players.length) * va1.length)})
      } else {
        game.points.push({_id: u1, points: Math.floor((5000 / game.players.length) * va1.length)})
      }
      if (p2) {
        game.points.push({_id: u2, points: p2 + Math.floor((5000 / game.players.length) * va2.length)})
      } else {
        game.points.push({_id: u2, points: Math.floor((5000 / game.players.length) * va2.length)})
      }
      game.markModified('points')
      game.save()
    }
  }
  let embed =
  {
    type: 'rich',
    color: parseInt(0x0f5c842.toString()),
    author: {
      name: game.name
    },
    description: `${question.prompt}`,
    fields: [
      {
        name: '1.- ' + (a1?.a || 'Sin respuesta'),
        value: finished ? `<@${u1}>\nVotes: ${va1.length}${va1.length > va2.length ? '  **Ganador**' : ''}\n${va1.map(v => '<@' + v.user + '>')}${finished ? '\nPuntos: ' + (game.points[u1] ?? 0) : ''}` : '\u200b'
      },
      {
        name: '2.- ' + (a2?.a || 'Sin respuesta'),
        value: finished ? `<@${u2}>\nVotes: ${va2.length}${va2.length > va1.length ? '  **Ganador**' : ''}\n${va2.map(v => '<@' + v.user + '>')}${finished ? '\nPuntos: ' + (game.points[u2] ?? 0) : ''}` : '\u200b'
      }
    ]
  }
  if (va1 == va2 && finished) {
    embed.fields.push({name: 'Empate!', value: '\u200b'})
  }
  return embed
}

/**
 * 
 * @param {import('discord-api-types').APIBaseInteraction} interaction 
 * @param {*} game 
 * @returns 
 */
function votingPhase(interaction, game) {
  game.phase = 'vote'
  game.save()
  for (let i = 0; i <= game.questions.length * 2; i++) {
    let question = game.questions[Math.floor(i / 2)]
    if (!question) {
      setTimeout(async () => {
        console.log(game.points.sort((a, b) => b.points - a.points))
        editReply({
          content: 'Juego finalizado',
          embeds: [
            {
              type: 'rich',
              color: parseInt(0xf5c842.toString()),
              author: {
                name: game.name
              },
              description: game.points.sort((a, b) => b.points - a.points).map(p => `<@${p[0]}> - ${p[1]}`).join('\n')
            }
          ]
        }, interaction)
        let m = await followUp('Juego finalizado', interaction)
        setTimeout(() => deleteMsg(m.body, interaction), 5000)
        game.phase = 'ended'
        new ReplayModel({ ...game._doc, _id: interaction.message.id }).save()
        game.deleteOne()
        GameModel.deleteOne({ _id: interaction.channel_id })
      }, i * 30 * 1000)
      return 'xd'
    }
    setTimeout(async () => {
      game = await GameModel.findById(interaction.channel_id)
      editReply({
        content: 'Fase de votación, vota por la frase que te parezca más graciosa',
        embeds: [createVoteEmbed(game, game.questions[Math.floor(i / 2)], i % 2 == 1)],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'startgame_vote1',
                label: 'Votar 1',
                style: 1,
                disabled: i % 2 == 1
              },
              {
                type: 2,
                custom_id: 'startgame_vote2',
                label: 'Votar 2',
                style: 1,
                disabled: i % 2 == 1
              }
            ]
          }
        ]
      }, interaction)
      if (i % 2 == 1) {
        let m = await followUp({
          content: 'Resultados de las votaciones, tienen 30 segundos'
        }, interaction)
        setTimeout(() => deleteMsg(m.body, interaction), 10000)
      } else {
        let m = await followUp({
          content: 'Hora de votar, tienen 30 segundos'
        }, interaction)
        setTimeout(() => deleteMsg(m.body, interaction), 10000)
      }
    }, i * 30 * 1000)
  }
  return 'xd'
}

let bgRaw = fs.readFileSync('./assets/bg.jpeg')
/** @type {Image} */
let bg;
(async () => bg = await Image.decode(bgRaw))()

const { sin, cos, floor, min } = Math
const rad = (d) => (d*Math.PI)/180.0

async function menu(interaction, title, players, familyFriendly, maxMembers=8, spectators=0, extra={}) {
  const elements = new Image(bg.width, bg.height)
  const offset_x = extra.offset_x ?? 70, offset_y = extra.offset_y ?? 10
  const ref_x = bg.width/2 + offset_x, ref_y = bg.height/2 + offset_y
  const ref_radius = extra.ref_radius ?? bg.width/6
  const angle = 360/maxMembers, offset_angle = extra.offset_angle ?? -90
  const radius = floor(min((extra.radius ?? 30), sin(rad(angle/2))*ref_radius))
  const font = fs.readFileSync('./assets/font.ttf')
  const name = await Image.renderText(font, 36, title, Image.rgbToColor(0, 0, 0))
  const avatars = []
  for(const player of players)
  {
    const avatar = usersCache.get(interaction.channel_id).get(player)?.avatar
    avatars.push( (await centra(`https://cdn.discordapp.com/avatars/${player}/${avatar}.png?size=64`).send()).body)
  }
  elements.composite(bg)
  for(let i = 0; i < maxMembers; i++)
  {
    const x = ref_radius+ref_x+ref_radius*cos(rad(angle*i+offset_angle))
    const y = ref_y+ref_radius*sin(rad(angle*i+offset_angle))
    elements.drawCircle(floor(x), floor(y), radius, Image.rgbToColor(217, 135, 0))
    if(avatars[i] && avatars[i][0]) elements.composite((await Image.decode(avatars[i])).resize(floor(radius*2)-4,  floor(radius*2)-4).cropCircle(), floor(x)-radius+1, floor(y)-radius+1)
    if(maxMembers <= 8)
    {
      const username = usersCache.get(interaction.channel_id).get(players[i])?.username
      let userText = await Image.renderText(font, 8, username || 'Player '+i, Image.rgbToColor(0, 0, 0))
      elements.composite(userText, floor(x-userText.width/2), floor(y+radius))
    }
  }
  elements.composite(name, bg.width/2-name.width/2, -5)
  const rulesTitle = await Image.renderText(font, 24, 'Rules', Image.rgbToColor(0, 0 ,0))
  const rules = await Image.renderText(font, 20, `  Family Friendly: ${familyFriendly}\n${Object.entries(extra).map(e => `  ${e[0]}: ${e[1]}`).join('\n')}`, Image.rgbToColor(0, 0 ,0))
  const spectatorsN = await Image.renderText(font, 14, `Spectators: ${spectators}`, Image.rgbToColor(0, 0 ,0))
  elements.composite(spectatorsN, 20, bg.height-20)
  elements.composite(rulesTitle, 20, 40)
  elements.composite(rules, 20, 40+rulesTitle.height)
  return elements.encode()
}