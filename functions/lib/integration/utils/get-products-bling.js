const { logger } = require('../../../context')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const fetchWithRetry = async (blingAxios, url, retries = 3, baseDelay = 1000) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await blingAxios.get(url)
      if (data.data && data.data.length) {
        return data.data[0]
      }
      return null
    } catch (err) {
      if (err.response?.status === 429) {
        // Rate limit hit - wait longer for each retry
        const waitTime = baseDelay * Math.pow(2, attempt)
        logger.warn(`Rate limit hit, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`)
        await delay(waitTime)
        continue
      }
      
      if (err.response) {
        logger.error(`Error fetching product: ${url}`, JSON.stringify(err.response.data))
      } else {
        logger.error(`Network error fetching product: ${url}`, err.message)
      }
      
      if (attempt === retries - 1) {
        throw err
      }
      
      await delay(baseDelay * Math.pow(2, attempt))
    }
  }
  return null
}

const processBatch = async (blingAxios, urls, batchSize = 3) => {
  const results = []
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)
    logger.info(`Processing batch ${i / batchSize + 1}, items ${i + 1}-${Math.min(i + batchSize, urls.length)}`)
    
    // Process batch with small delay between each request
    const batchResults = await Promise.all(
      batch.map(async (url, index) => {
        if (index > 0) {
          // Add small delay between requests within batch
          await delay(300)
        }
        return fetchWithRetry(blingAxios, url)
      })
    )
    
    results.push(...batchResults.filter(Boolean))
    
    // Add delay between batches if there are more to process
    if (i + batchSize < urls.length) {
      await delay(1000)
    }
  }
  
  return results
}

module.exports = async (blingAxios, order) => {
  try {
    if (!order.items?.length) {
      logger.warn('No items found in order')
      return []
    }

    const productUrls = order.items.map(item => `/produtos?codigo=${item.sku}`)
    logger.info(`Fetching ${productUrls.length} products from Bling`)

    const products = await processBatch(blingAxios, productUrls)
    
    // Validate results
    const missingProducts = order.items.filter(item => 
      !products.some(product => product.codigo === item.sku)
    )
    
    if (missingProducts.length) {
      logger.warn(`Missing products after fetch: ${missingProducts.map(item => item.sku).join(', ')}`)
    }

    return products
  } catch (err) {
    logger.error('Error in getProductsBling:', err)
    throw err
  }
}
