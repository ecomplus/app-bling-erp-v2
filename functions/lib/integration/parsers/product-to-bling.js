const ecomUtils = require('@ecomplus/utils')

module.exports = (product, originalBlingProduct, blingProductCode, blingStore, appData) => {
  const hasVariations = product.variations && product.variations.length

  const blingProduct = {
    nome: product.name || '',
    codigo: product.sku || product._id,
    tipo: 'P',
    situacao: product.available && product.visible ? 'A' : 'I',
    formato: hasVariations ? 'V' : 'S',
    preco: ecomUtils.price(product),
    descricaoCurta: product.body_html || product.short_description || product.body_text,
    descricaoComplementar: product.short_description,
    unidade: originalBlingProduct && originalBlingProduct.unidade
      ? originalBlingProduct.unidade
      : product.measurement && product.measurement.unit !== 'oz' && product.measurement.unit !== 'ct'
        ? product.measurement.unit.substring(0, 6).toUpperCase()
        : 'UN'
  }

  if (originalBlingProduct.id) {
    blingProduct.id = originalBlingProduct.id
  }

  if (product.condition) {
    blingProduct.condicao = 0
    if (product.condition === 'new') {
      blingProduct.condicao = 1
    } else if (product.condition === 'used') {
      blingProduct.condicao = 2
    }
  }
  if (product.min_quantity) {
    blingProduct.itensPorCaixa = product.min_quantity
  }

  if (product.mpn && product.mpn.length) {
    blingProduct.tributacao = {
      ncm: product.mpn[0]
    }
  }

  if (product.gtin && product.gtin.length) {
    blingProduct.gtin = product.gtin[0]
    if (product.gtin[1]) {
      blingProduct.gtinEmbalagem = product.gtin[1]
    }
  }

  if (product.weight && product.weight.value) {
    blingProduct.pesoBruto = product.weight.value
    switch (product.weight.unit) {
      case 'mg':
        blingProduct.pesoBruto /= 1000000
        break
      case 'g':
        blingProduct.pesoBruto /= 1000
    }
    blingProduct.pesoLiquido = blingProduct.pesoBruto
  }
  // let dimensionUnit
  if (product.dimensions) {
    const blingProductDimensoes = {}
    for (const side in product.dimensions) {
      if (product.dimensions[side]) {
        const { value } = product.dimensions[side]
        if (value) {
          // dimensionUnit = product.dimensions[side].unit
          const field = side === 'width'
            ? 'largura'
            : side === 'height' ? 'altura' : 'profundidade'
          blingProductDimensoes[field] = value
        }
      }
    }
    if (Object.keys(blingProductDimensoes).length) {
      blingProductDimensoes.unidadeMedida = 1
      blingProduct.dimensoes = blingProductDimensoes
    }
  }
  blingProduct.midia = {
  }
  if (product.brands && product.brands.length) {
    blingProduct.marca = product.brands[0].name
  }
  if (product.videos && product.videos.length && product.videos[0].url) {
    blingProduct.midia.video = {
      url: product.videos[0].url
    }
  }
  if (product.pictures && product.pictures.length) {
    blingProduct.midia.imagens = {
      externas: [],
      internas: []
    }
    product.pictures.forEach(({ zoom, big, normal }) => {
      const img = (zoom || big || normal)

      if (img) {
        blingProduct.midia.imagens.externas.push({ link: img.url })
      }
    })
  }

  // Stock
  if (!hasVariations) {
    if (
      typeof product.quantity === 'number' &&
      (!originalBlingProduct || appData.export_quantity)
    ) {
      blingProduct.estoque = blingProduct.estoque || {}
      blingProduct.estoque.maximo = product.quantity
    } else if (originalBlingProduct) {
      blingProduct.estoque = blingProduct.estoque || {}
      blingProduct.estoque.maximo = originalBlingProduct.estoque.maximo
    }
  }

  if (hasVariations) {
    blingProduct.variacoes = []

    product.variations.forEach((variation, i) => {
      const codigo = variation.sku || `${product.sku}-${(i + 1)}`
      const blingVariationOriginal = originalBlingProduct?.variacoes?.find(
        variationFind => variationFind.codigo === codigo
      )

      const blingVariation = {
        nome: variation.name,
        tipo: 'P',
        situacao: product.available && product.visible ? 'A' : 'I',
        formato: 'S',
        preco: ecomUtils.price({ ...product, ...variation }),
        codigo
      }

      // Stock Variation
      if (
        typeof variation.quantity === 'number' &&
          (!blingVariationOriginal || appData.export_quantity)
      ) {
        blingVariation.estoque = blingVariation.estoque || {}
        blingVariation.estoque.maximo = variation.quantity
      } else if (blingVariationOriginal) {
        blingVariation.estoque = blingVariation.estoque || {}
        blingProduct.estoque.maximo = blingVariationOriginal.estoque.maximo
      }

      if (variation.mpn && variation.mpn.length) {
        blingVariation.tributacao = {
          ncm: variation.mpn[0]
        }
      }

      if (variation.gtin && variation.gtin.length) {
        blingVariation.gtin = variation.gtin[0]
        if (variation.gtin[1]) {
          blingVariation.gtinEmbalagem = variation.gtin[1]
        }
      }

      if (variation.weight && variation.weight.value) {
        blingVariation.pesoBruto = variation.weight.value
        switch (variation.weight.unit) {
          case 'mg':
            blingVariation.pesoBruto /= 1000000
            break
          case 'g':
            blingVariation.pesoBruto /= 1000
        }
        blingVariation.pesoLiquido = blingVariation
        // blingVariation.pesoBruto
      }

      // let variationDimensionUnit
      if (variation.dimensions) {
        const blingVationDimensoes = {}
        for (const side in variation.dimensions) {
          if (variation.dimensions[side]) {
            const { value } = variation.dimensions[side]
            if (value) {
              // variationDimensionUnit = variation.dimensions[side].unit
              const field = side === 'width'
                ? 'largura'
                : side === 'height' ? 'altura' : 'profundidade'
              blingVationDimensoes[field] = value
            }
          }
        }
        if (Object.keys(blingVationDimensoes).length) {
          blingVationDimensoes.unidadeMedida = 1
          blingVariation.dimensoes = blingVationDimensoes
        }
      }

      const variacao = {
        nome: '',
        ordem: i,
        produtoPai: { cloneInfo: Boolean(!variation.dimensions) }
      }

      for (const gridId in variation.specifications) {
        const gridOptions = variation.specifications[gridId]
        if (gridOptions && gridOptions.length) {
          gridOptions.forEach(({ text }, i) => {
            let gridTitle
            switch (gridId) {
              case 'colors':
                gridTitle = 'Cor'
                break
              case 'size':
                gridTitle = 'Tamanho'
                break
              case 'age_group':
                gridTitle = 'Idade'
                break
              case 'gender':
                gridTitle = 'Gênero'
                break
              default:
                gridTitle = gridId.charAt(0).toUpperCase() + gridId.slice(1).replace('_', ' ')
            }
            if (variacao.nome) {
              variacao.nome += ';'
              variacao.ordem = i + 1
              if (i > 0) {
                gridTitle += i === 1 ? ' secundária' : ` ${(i + 1)}`
              }
            }
            variacao.nome += `${gridTitle}:${text.replace(/[:;]/g, '')}`
          })
        }
      }

      blingVariation.variacao = variacao

      if (blingVariationOriginal) {
        blingVariation.id = blingVariationOriginal.id
      }

      blingProduct.variacoes.push(blingVariation)
    })
  }

  return blingProduct
}
