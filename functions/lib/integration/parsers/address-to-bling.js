module.exports = (address, blingAddress, blingCityField = 'municipio') => {
  if (address) {
    ;[
      ['name', 'nome', 120],
      ['street', 'endereco', 50],
      ['number', 'numero', 10],
      ['complement', 'complemento', 50],
      ['borough', 'bairro', 30],
      ['zip', 'cep', 10],
      ['city', blingCityField, 30],
      ['province_code', 'uf', 30]
    ].forEach(([addressField, blingAddressField, maxLength]) => {
      if (address[addressField] && !blingAddress[blingAddressField]) {
        blingAddress[blingAddressField] = String(address[addressField]).trim().substring(0, maxLength)
      }
    })
    if (blingAddress.cep && /[0-9]{7,8}/.test(blingAddress.cep)) {
      blingAddress.cep = blingAddress.cep.padStart(8, '0')
        .replace(/^([\d]{2})([\d]{3})([\d]{3})$/, '$1.$2-$3')
    }
  }
}
