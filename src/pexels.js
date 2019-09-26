const sketch = require('sketch')
const { DataSupplier, UI, Settings } = sketch
const { toArray } = require('util')

const SETTING_KEY = 'pexels.photo.id'
const API_KEY = '563492ad6f91700001000001baf1bd40e4ef4d9fbb65204f4377abf9'
const API_ENDPOINT = 'https://api.pexels.com/v1'
const apiOptions = {
  'headers': { 'Authorization': API_KEY }
}

import insertImage, { getImageFromURL } from 'sketch-image-downloader'

// console.oldLog = console.log
// console.log = function(txt){
//   console.oldLog(`${new Date().toISOString()}: ${txt}`)
// }

export function onStartup () {
  DataSupplier.registerDataSupplier('public.image', 'Random Photo', 'SupplyRandomPhoto')
  DataSupplier.registerDataSupplier('public.image', 'Search Photo…', 'SearchPhoto')
}

export function onShutdown () {
  DataSupplier.deregisterDataSuppliers()
  // try {
  //   if (fs.existsSync(FOLDER)) {
  //     fs.rmdirSync(FOLDER)
  //   }
  // } catch (err) {
  //   console.error(err)
  // }
}

export function onSupplyRandomPhoto (context) {
  const dataKey = context.data.key
  const items = toArray(context.data.items).map(sketch.fromNative)

  let action = `/curated?per_page=${items.length}&page=${Math.floor(Math.random()*1000)}`
  let url = API_ENDPOINT + action
  UI.message('🕑 Downloading…')
  fetch(url, apiOptions)
    .then(response => response.json())
    .then(json => {
      if (json.errors) {
        return Promise.reject(json.errors[0])
      }
      json.photos.forEach((photo, index) => {
        let layer = items[index]
        let w = layer.frame.width
        let h = layer.frame.height
        let imageURL = urlParametersFor(photo.src.original, w, h)
        getImageFromURL(imageURL).then(imagePath => {
          DataSupplier.supplyDataAtIndex(dataKey, imagePath, index)
          UI.message('📷 by ' + photo.photographer + ' on Pexels')
          // Store photo ID on layer
          if (layer.type !== 'DataOverride') {
            Settings.setLayerSettingForKey(layer, SETTING_KEY, photo.id)
          }
        })
      })
    })
}

export function onSearchPhoto (context) {
  const dataKey = context.data.key
  const items = toArray(context.data.items).map(sketch.fromNative)

  // 21123: retrieve previous search term. If multiple layers are selected, find the first search term
  // in the group…
  let selectedLayers = sketch.getSelectedDocument().selectedLayers.layers
  let previousTerms = selectedLayers.map(layer => Settings.layerSettingForKey(layer, 'pexels.search.term'))
  let firstPreviousTerm = previousTerms.find(term => term !== undefined)
  let previousTerm = firstPreviousTerm || 'People'
  // TODO: support multiple selected layers with different search terms for each

  let searchTerm
  if (sketch.version.sketch < 53) {
    searchTerm = UI.getStringFromUser('Search Pexels for…', previousTerm).trim()
  } else {
    UI.getInputFromUser('Search Pexels for…',
      { initialValue: previousTerm },
      (err, input) => {
        if (err) { return } // user hit cancel
        searchTerm = input.trim() 
      }
    )
  }
  if (searchTerm !== 'null') {
    console.log(`Searching images for ${searchTerm}`)
    selectedLayers.forEach(layer => {
      Settings.setLayerSettingForKey(layer, 'pexels.search.term', searchTerm)
    })
    searchTerm = searchTerm.replace(/\s+/g, '+').toLowerCase()

    // Do the actual download
    let page = Math.floor(Math.random() * 999)
    let action = `/search?query=${searchTerm}&per_page=${items.length}&page=${page}`
    if (containsPhotoId(searchTerm)) {
      action = `/photos/${extractPhotoId(searchTerm)}`
    }
    let url = API_ENDPOINT + action
    console.log(url)
    UI.message('🕑 Downloading…')
    fetch(url, apiOptions)
      .then(response => response.json())
      .then(json => {
        if (json.errors) {
          return Promise.reject(json.errors[0])
        }
        let photos = containsPhotoId(searchTerm) ? [json] : json.photos
        photos.forEach((photo, index) => {
          let layer = items[index]
          let w = layer.frame.width
          let h = layer.frame.height
          let imageURL = urlParametersFor(photo.src.original, w, h)
          getImageFromURL(imageURL).then(imagePath => {
            DataSupplier.supplyDataAtIndex(dataKey, imagePath, index)
            UI.message('📷 by ' + photo.photographer + ' on Pexels')
            // Store photo ID on layer
            if (layer.type !== 'DataOverride') {
              Settings.setLayerSettingForKey(layer, SETTING_KEY, photo.id)
            }
          })
        })
      })
  }
}

export default function onImageDetails () {
  const selectedDocument = sketch.getSelectedDocument()
  const selection = selectedDocument ? selectedDocument.selectedLayers : []
  if (selection.length > 0) {
    selection.forEach(element => {
      const id = Settings.layerSettingForKey(element, SETTING_KEY) || (
        element.type === 'SymbolInstance' &&
        element.overrides
          .map(o => Settings.layerSettingForKey(o, SETTING_KEY))
          .find(s => !!s)
      )
      if (id) {
        NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(`https://pexels.com/photo/${id}`))
      } else {
        // This layer doesn't have an Pexels photo set, do nothing.
        // Alternatively, show an explanation of what the user needs to do to make this work…
        UI.message(`To get a random photo, click Data › Pexels › Random Photo in the toolbar, or right click the layer › Data Feeds › Pexels › Random Photo`)
      }
    })
  } else {
    UI.message(`Please select at least one layer`)
  }
}

function containsPhotoId (searchTerm) {
  return searchTerm.substr(0, 3) === 'id:' || searchTerm.indexOf('pexels.com/photo/') !== -1
}

function extractPhotoId (searchTerm) {
  if (searchTerm.substr(0, 3) === 'id:') {
    return searchTerm.substr(3)
  } else {
    return searchTerm.match(/([0-9]+)\//g)
  }
}

function urlParametersFor(url, w, h) {
  return `${url}?auto=compress&cs=tinysrgb&dpr=2&w=${w}&h=${h}&fit=min`
}
