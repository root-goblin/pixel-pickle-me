import * as Path from 'path'
import * as util from 'util'
import { readFile, readdir } from 'fs/promises'

import Handlebars from 'handlebars'

const Q = (obj, depth = 2) => {
  return util.inspect(obj, { depth: depth, colors: true })
}

Handlebars.registerHelper('slug', function (context) {
  return context.toLowerCase().replace(/ /g, '-')
})

export default async function routePage(pageApi, options) {
  const {
    platformsJSON,
    gamesDb,
    getTemplates
  } = options
  const Log = pageApi.log
  const baseUrl = '/page'

  Log.info(baseUrl)

  const templates = {}
  const sectionData = {}
  let targetGameName = ''

  sectionData.platforms = platformsJSON.PlatformEnum.map((plat) => {
    return {
      ...plat,
      featureList: platformsJSON.PlatformFeatures[plat.platformID].featureList
    }
  })

  let templatesRaw = await getTemplates()
  for(const name in templatesRaw){
    templates[name] = Handlebars.compile(templatesRaw[name])
  }

  Log.debug(`Built template:`)
  Log.debug(templates['game-select']({ gamesList: Object.keys(gamesDb) }))
  Log.debug(`sectionData: ${Q(sectionData)}`)
  // Log.info(platformDataList)

  pageApi.get(baseUrl + '/game-select', async function handler(request, reply) {
    const gamesList = Object.keys(gamesDb).map((key) => {
      return {
        name: key,
        title: gamesDb[key].data.title
      }
    })
    reply
      .code(200)
      .type('text/html')
      .send(templates['game-select']({ gamesList: gamesList }))
  })

  pageApi.get(baseUrl + '/:gameName/:section', (request, reply) => {
    const { gameName, section } = request.params

    Log.debug(`gameName: ${gameName}`)
    Log.debug(`section: ${section}`)

    const htmlRender = templates[section]({
      gameName: gameName,
      sectionData:
          customizeSectionDataForGame[section](
            sectionData[section],
            gamesDb[gameName].data
          ),
      })

    Log.debug(`htmlRender: ${htmlRender}`)
    reply
      .code(200)
      .type('text/html')
      .send(htmlRender)
  })
  pageApi.post(baseUrl + '/game-data', async function handler(request, reply) {
    Log.debug(`gameName: ${Q(request.body)}`)
    targetGameName = request.body.gameName
    Log.debug(`targetGameName: ${Q(gamesDb[targetGameName].data)}`)
    reply
      .code(200)
      .type('text/html')
      .send(templates['game-data']({
        name: targetGameName,
        ...gamesDb[targetGameName].data,
      }))
  })
}

const customizeSectionDataForGame = {
  platforms: (sectionData, gameData) => {
    console.log(gameData)
    console.log(sectionData)
    const platforms = sectionData.map((plat) => {
      console.log(plat)
      plat.active = gameData.platforms.includes(plat.platformID)
      if (plat.active) {
        console.log(gameData.platformFeatures.find((pf) => pf.platformId === plat.platformID).featuresActive)
        const featuresActive = gameData.platformFeatures.find((pf) => {
          return pf.platformId === plat.platformID
        }).featuresActive

        plat.featureList = plat.featureList.map((feature) => {
          feature.active = featuresActive.includes(feature.name)
          return feature
        })
      }
      return plat
    })
    console.dir(platforms, {depth: 5})
    return platforms
  }
}
