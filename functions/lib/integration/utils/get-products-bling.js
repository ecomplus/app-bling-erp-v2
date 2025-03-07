const { logger } = require('../../../context')

module.exports = async (blingAxios, order) => {
  const promise = []
  const codItems = order.items?.reduce((acc, item) => {
    acc.push(`/produtos?codigo=${item.sku}`)
    return acc
  }, [])

  const list = []
  // Process URLs sequentially with delay
  for (const url of codItems) {
    try {
      // Add 1 second delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const { data } = await blingAxios.get(url)
      if (data.data && data.data.length) {
        list.push(data.data[0])
      }
    } catch (err) {
      if (err.response) {
        logger.error(JSON.stringify(err.response.data))
      } else {
        logger.error(err)
      }
    }
  }

  return list
}
