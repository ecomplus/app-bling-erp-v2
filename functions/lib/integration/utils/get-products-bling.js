const { logger } = require('../../../context')

module.exports = async (blingAxios, order) => {
  let url = ''
  order.items.forEach((item) => {
    if (!item.sku) return
    if (!url) url = `/produtos?codigo[]=${item.sku}`
    else url += `&codigo[]=${item.sku}`
  })
  if (!url) return []
  try {
    const { data } = await blingAxios.get(url)
    if (data.data && data.data.length) {
      return data.data
    }
  } catch (err) {
    if (err.response) {
      logger.error(JSON.stringify(err.response.data))
    } else {
      logger.error(err)
    }
  }
  return []
}
