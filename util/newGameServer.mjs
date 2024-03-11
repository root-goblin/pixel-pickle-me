import { readFile, readdir, writeFile } from 'fs/promises';
import { stat } from 'fs';
import * as os from 'os';
import * as Path from 'path';
import { URL } from 'node:url';

import * as chokidar from 'chokidar';
import Fastify from 'fastify';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }
})

const Log = fastify.log

const p = new URL(import.meta.url)
const root = Path.join(p.pathname, '../..')
const dataPath = Path.join(root, 'data')
const gamesPath = Path.join(dataPath, 'games')
const backupPath = Path.join(root, '.data_backup')
const indexPath = Path.join(p.pathname, '..', 'index.html')
const editorPath = Path.join(p.pathname, '..', 'data-editor.js')

let index = await readFile(indexPath)
let editor = await readFile(editorPath)
let platformEnum = await readFile(Path.join(dataPath, 'platforms.json'))

let gameFiles = await readdir(gamesPath)
let gamesDb = {}
for (let idx = 0; idx < gameFiles.length; idx++) {
  let data = {}
  let fileName = "" + gameFiles[idx]
  let gameName = fileName.split('.')[0]

  try {
    data = await readFile(Path.join(dataPath, 'games', fileName))
    data = JSON.parse(data)
  } catch (e) { console.error(e) }

  gamesDb[gameName] = {
    name: gameName,
    data: data
  }
}

const watchers = {}

console.log(root)
console.log(dataPath)
console.log(backupPath)
console.log(indexPath)
console.log(gameFiles)

// Declare GET routes
fastify.get('/', async function handler(request, reply) {
  reply
    .code(200)
    .type('text/html')
    .send(index)
})

fastify.get('/data-editor', async function handler(request, reply) {
  reply
    .code(200)
    .type('application/javascript')
    .send(editor)
})

fastify.get('/data/game/:gameName', async function handler(request, reply) {
  const { gameName } = request.params
  let body = {}

  if (gamesDb[gameName]) {
    body = { ...gamesDb[gameName] }
    body.error = 0
  } else {
    body = {
      error: `Could not find ${gameName} in database`,
      gameFiles: [...Object.keys(gamesDb)]
    }
  }

  reply
    .code(200)
    .type('application/json')
    .send(body)
})

// Declare PUT routes
fastify.put('/data/game/:gameName', async function handler(request, reply) {
  const { gameName } = request.params
  const gameData = request.body
  // console.dir(gameData, {depth:1})
  console.dir(request.body)
  const writePath = Path.join(gamesPath, gameName + '.json')

  await writeFile(writePath, JSON.stringify(gameData))
  reply
    .code(200)
    .type('application/json')
    .send({
      filePath: writePath
    })
})

// Detect changes in files
setupWatchers()

// Run the server!
try {
  await fastify.listen({ port: 6969 })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

// Helper Functions
function setupWatchers() {
  console.log('watching index')
  watchers.index = chokidar.watch(indexPath)
    .on('change', async (path) => {
      index = await readFile(indexPath)
      console.log('index updated')
    })

  watchers.editor = chokidar.watch(editorPath)
    .on('change', async (path) => {
      editor = await readFile(editorPath)
      console.log('editor updated')
    })

  watchers.games = chokidar.watch(gamesPath)
    .on('add', async (path) => {
      await loadGameFromPath(path)
      const gameName = gameFilePathToName(path)
      Log.info(`Found new game '${gameName}' at path ${path}`)
    }).on('change', async (path) => {
      await loadGameFromPath(path)
      const gameName = gameFilePathToName(path)
      Log.info(`Updated game '${gameName}' at path ${path}`)
    })
}

function gameFilePathToName(path) {
  return Path.basename(path).split('.')[0]
}

async function loadGameFromPath(path){
      console.log(`File ${path} has been changed.`)
      let gameName = gameFilePathToName(path)
      try {
        const gameFileBuf = await readFile(path)
        const gameData = JSON.parse(gameFileBuf)
        gamesDb[gameName] = {
          name: gameName,
          data: gameData
        }
        Log.info(gamesDb[gameName])
      } catch (e) { Log.error(e) }
}
