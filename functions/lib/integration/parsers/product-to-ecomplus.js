const ecomUtils = require('@ecomplus/utils')
const axios = require('axios')
const { logger } = require('../../../context')
const FormData = require('form-data')

const removeAccents = str => str.replace(/áàãâÁÀÃÂ/g, 'a')
  .replace(/éêÉÊ/g, 'e')
  .replace(/óõôÓÕÔ/g, 'o')
  .replace(/íÍ/g, 'e')
  .replace(/úÚ/g, 'u')
  .replace(/çÇ/g, 'c')

const hexaColors = color => {
  const lowerCaseColor = removeAccents(color.toLowerCase())

  switch (lowerCaseColor) {
    case 'azulclaro':
      return '#add8e6'
    case 'branco':
    case 'branca':
      return '#ffffff'
    case 'cinza':
      return '#808080'
    case 'vermelho':
    case 'vermelha':
      return '#ff0000'
    case 'amarelo':
    case 'amarela':
      return '#ffff00'
    case 'verde':
      return '#008000'
    case 'preto':
    case 'preta':
      return '#000000'
    case 'azul':
      return '#0000ff'
    case 'petroleo':
      return '#006666'
    case 'verde limao':
      return '#32cd32'
    case 'rosa':
    case 'pink':
      return '#ffc0cb'
    case 'roxo':
      return '#800080'
    case 'laranja':
    case 'laranjao':
      return '#ffa500'
    case 'muffin':
      return '#d6a78a'
    case 'off':
    case 'offwhite':
    case 'off-white':
    case 'off white':
      return '#fffafa'
    case 'marrom':
      return '#a52a2a'
    case 'areia':
      return '#f0e68c'
    case 'vinho':
    case 'vinha':
      return '#800000'
    case 'ciano':
      return '#00ffff'
    case 'prata':
      return '#c0c0c0'
    case 'grafite':
      return '#808080'
    case 'magento':
      return '#ff00ff'
    case 'dourado':
      return '#ffd700'
    case 'turquesa':
      return '#40e0d0'
    case 'chocolatebranco':
      return '#d2691e'
    case 'verde oliva':
      return '#6b8e23'
    case 'caqui':
      return '#f0e68c'
    case 'pessego':
      return '#ffe5b4'
    case 'indigo':
      return '#4b0082'
    default:
      return '#ffffff' // White (default)
  }
}

const tryImageUpload = (storeId, auth, originImgUrl, product) => new Promise(resolve => {
  axios.get(originImgUrl, {
    responseType: 'arraybuffer'
  })
    .then(({ data }) => {
      const form = new FormData()
      let filename = originImgUrl.replace(/.*\/([^/]+)$/, '$1')
      if (!/\.[a-z]+$/i.test(filename)) {
        filename += '.jpg'
      }
      form.append('file', Buffer.from(data), filename)

      return axios.post(`https://apx-storage.e-com.plus/${storeId}/api/v1/upload.json`, form, {
        headers: {
          ...form.getHeaders(),
          'X-Store-ID': storeId,
          'X-My-ID': auth.myId,
          'X-Access-Token': auth.accessToken
        }
      })

        .then(({ data, status }) => {
          if (data.picture) {
            for (const imgSize in data.picture) {
              if (data.picture[imgSize]) {
                if (!data.picture[imgSize].url) {
                  delete data.picture[imgSize]
                  continue
                }
                if (data.picture[imgSize].size !== undefined) {
                  delete data.picture[imgSize].size
                }
                data.picture[imgSize].alt = `${product.name} (${imgSize})`
              }
            }
            if (Object.keys(data.picture).length) {
              return resolve({
                _id: ecomUtils.randomObjectId(),
                normal: data.picture.zoom,
                ...data.picture
              })
            }
          }
          const err = new Error('Unexpected Storage API response')
          err.response = { data, status }
          throw err
        })
    })

    .catch(_err => {
      resolve({
        _id: ecomUtils.randomObjectId(),
        normal: {
          url: originImgUrl,
          alt: product.name
        }
      })
    })
}).then(picture => {
  if (product && product.pictures) {
    product.pictures.push(picture)
  }
  return picture
})

module.exports = (blingProduct, variations, storeId, auth, isNew = true, appData) => new Promise((resolve, reject) => {
  try {
    const sku = blingProduct.codigo || String(blingProduct.id)
    const name = (blingProduct.nome || sku).trim()

    const product = {
      available: blingProduct.situacao === 'A',
      sku,
      name,
      quantity: 0
    }

    const isDisableDescription = appData && appData.non_update_description
    if (!isDisableDescription) {
      if (blingProduct.descricaoComplementar) {
        product.body_html = String(blingProduct.descricaoComplementar)
      } else if (blingProduct.descricaoCurta) {
        product.body_html = String(blingProduct.descricaoCurta)
      }
    }

    if (blingProduct.preco) {
      if (blingProduct.precoPromocional) {
        product.price = Number(blingProduct.precoPromocional)
        product.base_price = Number(blingProduct.preco)
      } else {
        product.price = Number(blingProduct.preco)
      }
    } else {
      product.price = Number(blingProduct.preco)
    }

    if (blingProduct.itensPorCaixa) {
      product.min_quantity = Number(blingProduct.itensPorCaixa)
    }
    if (blingProduct.tributacao && blingProduct.tributacao.ncm) {
      product.mpn = [String(blingProduct.tributacao.ncm)]
    }
    const validateGtin = gtin => typeof gtin === 'string' && /^([0-9]{8}|[0-9]{12,14})$/.test(gtin)
    if (validateGtin(blingProduct.gtin)) {
      product.gtin = [blingProduct.gtin]
      if (validateGtin(blingProduct.gtinEmbalagem)) {
        product.gtin.push(blingProduct.gtinEmbalagem)
      }
    }

    if (isNew) {
      product.slug = removeAccents(name.toLowerCase())
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_./]/g, '')
    }

    if (blingProduct.media && blingProduct.media.video && blingProduct.media.video.url) {
      product.videos = [{
        url: blingProduct.media.video.url
      }]
    }

    const weight = parseFloat(blingProduct.pesoBruto || blingProduct.pesoLiq)
    if (weight > 0) {
      product.weight = {
        unit: 'kg',
        value: weight
      }
    }

    [
      ['largura', 'width'],
      ['altura', 'height'],
      ['profundidade', 'length']
    ].forEach(([lado, side]) => {
      const dimension = parseFloat(blingProduct.dimensoes && blingProduct.dimensoes[lado])
      if (dimension > 0) {
        if (!product.dimensions) {
          product.dimensions = {}
        }
        product.dimensions[side] = {
          unit: 'cm',
          value: dimension
        }
      }
    })

    if (Array.isArray(blingProduct.variacoes) && blingProduct.variacoes.length) {
      product.variations = variations || []
      blingProduct.variacoes.forEach(variacao => {
        if (variacao && variacao.nome) {
          const gridsAndValues = variacao.variacao.nome.split(';')
          if (gridsAndValues.length) {
            const specifications = {}
            const specTexts = []
            gridsAndValues.forEach(gridAndValue => {
              const [gridName, text] = gridAndValue.trim().split(':')
              if (gridName && text) {
                const gridId = gridName.toLowerCase() === 'cor'
                  ? 'colors'
                  : removeAccents(gridName.toLowerCase())
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '')
                    .substring(0, 30)
                    .padStart(2, 'i')
                const spec = { text }
                specTexts.push(text)
                if (gridId !== 'colors') {
                  spec.value = removeAccents(text.toLowerCase()).substring(0, 100)
                } else if (gridId === 'colors') {
                  spec.value = hexaColors(text)
                }
                if (!specifications[gridId]) {
                  specifications[gridId] = [spec]
                } else {
                  specifications[gridId].push(spec)
                }
              }
            })

            // Helper function to extract base URL (ignoring query parameters)
            function getBaseUrl (url) {
              const urlObj = new URL(url)
              return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`
            }

            // Helper function to update externas while avoiding duplicates
            function updateExternas (newMedia) {
              const existingLinks = new Set(blingProduct.midia.imagens.externas.map(item => getBaseUrl(item.link)))

              // newMedia.midia.imagens?.externas?.forEach(({ link }) => {
              const baseUrl = getBaseUrl(newMedia.link)
              if (!existingLinks.has(baseUrl)) {
                blingProduct.midia.imagens.externas.push({ link: newMedia.link })
                existingLinks.add(baseUrl) // Add base URL to set to keep track of what has been added
              }
              // })
            }

            if (specTexts.length) {
              const { midia, codigo, preco, gtin, gtinEmbalagem, dimensoes, pesoBruto, pesoLiq, tributacao, id } = variacao
              let pictureId = 0
              if (midia && midia.imagens && Array.isArray(midia.imagens.externas) && midia.imagens.externas.length) {
                midia.imagens?.externas.forEach(({ link }) => updateExternas({ link }))
                pictureId = midia.imagens.externas.length - 1
              }
              let variation
              if (variations && variations.length) {
                const variationIndex = variations.findIndex(({ sku }) => sku === codigo)
                if (variationIndex > -1) {
                  variation = variations[variationIndex]
                }
              }
              if (!variation) {
                variation = {
                  _id: ecomUtils.randomObjectId()
                }
                product.variations.push(variation)
              }
              variation.name = `${name} / ${specTexts.join(' / ')}`.substring(0, 100)
              variation.sku = codigo || String(id)
              variation.specifications = specifications
              variation.quantity = variacao.estoqueAtual >= 0 ? variacao.estoqueAtual : 0

              // logger.warn(`BlingV: ${JSON.stringify(variacao)} v:${JSON.stringify(variation)}`)

              if (pictureId > 0) {
                variation.picture_id = pictureId
              }
              const price = parseFloat(preco)
              if (price && preco !== blingProduct.preco) {
                variation.price = price
              }
              if (validateGtin(gtin)) {
                variacao.gtin = [gtin]
                if (validateGtin(gtinEmbalagem)) {
                  variacao.gtin.push(gtinEmbalagem)
                }
              }
              if (dimensoes && dimensoes.largura) {
                [
                  ['largura', 'width'],
                  ['altura', 'height'],
                  ['profundidade', 'length']
                ].forEach(([lado, side]) => {
                  const dimensionVariation = parseFloat(dimensoes && dimensoes[lado])
                  if (dimensionVariation > 0) {
                    if (!variation.dimensions) {
                      variation.dimensions = {}
                    }
                    variation.dimensions[side] = {
                      unit: 'cm',
                      value: dimensionVariation
                    }
                  }
                })
              }
              const weightVariation = parseFloat(pesoBruto || pesoLiq)
              if (weightVariation > 0) {
                variation.weight = {
                  unit: 'kg',
                  value: weightVariation
                }
              }
              if (tributacao && tributacao.ncm) {
                variation.mpn = String(tributacao.ncm)
              }
            }
          }
        }
      })
    }

    if (isNew && blingProduct.midia?.imagens) {
      if (!product.pictures) {
        product.pictures = []
      }
      const promises = []
      try {
        ;[
          ...blingProduct.midia.imagens.externas,
          ...blingProduct.midia.imagens.internas
        ].forEach(({ link }) => {
          if (typeof link === 'string' && link.startsWith('http')) {
            promises.push(tryImageUpload(storeId, auth, link, product))
          }
        })
      } catch (err) {
        logger.warn(err)
      }
      return Promise.all(promises).then((images) => {
        if (Array.isArray(product.variations) && product.variations.length) {
          product.variations.forEach(variation => {
            if (variation.picture_id || variation.picture_id === 0) {
              const variationImage = images[variation.picture_id]
              if (variationImage?._id) {
                variation.picture_id = variationImage._id
              } else {
                delete variation.picture_id
              }
            }
          })
        }
        return resolve(product)
      })
    }
    resolve(product)
  } catch (err) {
    reject(err)
  }
})
