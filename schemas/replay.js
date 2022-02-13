const mongoose = require("mongoose")
const GameModel = require("./game")

// @ts-ignore
module.exports = mongoose.model('replay', new mongoose.Schema(GameModel.schema, {
    collection: 'replays'
}))