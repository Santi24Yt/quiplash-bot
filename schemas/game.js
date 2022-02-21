const mongoose = require('mongoose')

module.exports = mongoose.model('game', new mongoose.Schema({
  _id: String,
  name: String,
  players: [String],
  familyFriendly: Boolean,
  maxPlayers: Number,
  rounds: Number,
  spectatorsEnabled: Boolean,
  spectators: [String],
  questions: [{
    id: Number,
    x: Boolean,
    prompt: String,
    users: [String],
    answers: [{user: String, a: String}],
    votes: [{answer: Number, user: String}]
  }],
  phase: { type: String, default: 'lobby' },
  points: [new mongoose.Schema({
    _id: String,
    points: Number
  })]
}))