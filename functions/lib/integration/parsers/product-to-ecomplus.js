const ecomUtils = require('@ecomplus/utils')
const axios = require('axios')
const FormData = require('form-data')

const removeAccents = str => str.replace(/áàãâÁÀÃÂ/g, 'a')
  .replace(/éêÉÊ/g, 'e')
  .replace(/óõôÓÕÔ/g, 'o')
  .replace(/íÍ/g, 'e')
  .replace(/úÚ/g, 'u')
  .replace(/çÇ/g, 'c')

  const hexaColors = color => {
    const lowerCaseColor = removeAccents(color.toLowerCase());
  
    switch (lowerCaseColor) {
      case 'azulclaro':
        return '#add8e6';
      case 'branco':
      case 'branca':
        return '#ffffff';
      case 'cinza':
        return '#808080';
      case 'vermelho':
      case 'vermelha':
        return '#ff0000';
      case 'amarelo':
      case 'amarela':
        return '#ffff00';
      case 'verde':
        return '#008000';
      case 'preto':
      case 'preta':
        return '#000000';
      case 'azul':
        return '#0000ff';
      case 'petroleo':
        return '#006666';
      case 'verde limao':
        return '#32cd32';
      case 'rosa':
      case 'pink':
        return '#ffc0cb';
      case 'roxo':
        return '#800080';
      case 'laranja':
      case 'laranjao':
        return '#ffa500';
      case 'marrom':
        return '#a52a2a';
      case 'areia':
        return '#f0e68c';
      case 'vinho':
      case 'vinha':
        return '#800000';
      case 'ciano':
        return '#00ffff';
      case 'prata':
        return '#c0c0c0';
      case 'grafite':
        return '#808080';
      case 'magento':
        return '#ff00ff';
      case 'dourado':
        return '#ffd700';
      case 'turquesa':
        return '#40e0d0';
      case 'chocolatebranco':
        return '#d2691e';
      case 'verde oliva':
        return '#6b8e23';
      case 'caqui':
        return '#f0e68c';
      case 'pessego':
        return '#ffe5b4';
      case 'indigo':
        return '#4b0082';
      default:
        return '#ffffff'; // White (default)
    }
  };

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

    .catch(err => {
      console.error(err)
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
  const sku = blingProduct.codigo
  const name = (blingProduct.nome || sku).trim()

  const product = {
    available: blingProduct.situacao === 'A',
    sku,
    name,
    quantity: 0
  }

  const isDisableDescription = appData && appData.non_update_description
  if (!isDisableDescription) {
    if (blingProduct.descricaoComplementar && blingProduct.descricaoCurta) {
      product.short_description = String(blingProduct.descricaoComplementar.slice(0, 255))
      product.body_html = String(blingProduct.descricaoCurta)
    } else if (blingProduct.descricaoComplementar) {
      product.body_html = String(blingProduct.descricaoComplementar)
    } else if (blingProduct.descricaoCurta) {
      product.body_html = String(blingProduct.descricaoCurta)
    }
  }

  const { loja } = blingProduct
  if (loja && blingProduct.preco) {
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
    product.mpn = [blingProduct.tributacao.ncm]
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

  ;[
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
    blingProduct.variacoes.forEach(({ variacao }) => {
      if (variacao.variacao && variacao.variacao.nome) {
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

          if (specTexts.length) {
            let variation
            if (variations) {
              const variationIndex = variations.findIndex(({ sku }) => sku === variacao.codigo)
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
            variation.sku = variacao.codigo
            variation.specifications = specifications
            variation.quantity = 0
            const price = parseFloat(variacao.preco)
            if (price) {
              variation.price = price
            }
            if (validateGtin(variacao.gtin)) {
              variacao.gtin = [variacao.gtin]
              if (validateGtin(variacao.gtinEmbalagem)) {
                variacao.gtin.push(variacao.gtinEmbalagem)
              }
            }
            if (variacao.dimensoes && variacao.dimensoes.largura) {
              ;[
                ['largura', 'width'],
                ['altura', 'height'],
                ['profundidade', 'length']
              ].forEach(([lado, side]) => {
                const dimensionVariation = parseFloat(variacao.dimensoes && variacao.dimensoes[lado])
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
            const weightVariation = parseFloat(variacao.pesoBruto || variacao.pesoLiq)
            if (weightVariation > 0) {
              variation.weight = {
                unit: 'kg',
                value: weightVariation
              }
            }
            if (variacao.tributacao && variacao.tributacao.ncm) {
              variation.mpn = [variacao.tributacao.ncm]
            }
          }
        }
      }
    })
  }

  if (isNew && blingProduct.midia && blingProduct.midia.imagens && Array.isArray(blingProduct.midia.imagens.externas) && blingProduct.midia.imagens.externas.length) {
    if (!product.pictures) {
      product.pictures = []
    }
    const promises = []
    blingProduct.midia.imagens.externas.forEach(({ link }) => {
      if (typeof link === 'string' && link.startsWith('http')) {
        promises.push(tryImageUpload(storeId, auth, link, product))
      }
    })
    return Promise.all(promises).then(() => resolve(product))
  }
  resolve(product)
})
