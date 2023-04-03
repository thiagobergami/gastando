const express = require('express')
const cors = require('cors')

class App {
    constructor() {
        this.express = express()
        this.middlewares()
        //this.routes()
    }

    middlewares() {
        this.express.use(cors())
        this.express.use(express.json())
    }

    /* routes() {
        this.express.use(require('./router'))
    } */
}

module.exports = new App().express