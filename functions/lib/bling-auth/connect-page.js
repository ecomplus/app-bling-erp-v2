// Página simples devolvida ao lojista no navegador durante a conexão com o Bling.
const escape = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

module.exports = ({ title, message, link, linkLabel }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f6f4f7; color: #2a1a2c; }
  main { max-width: 32rem; margin: 12vh auto; padding: 2rem; background: #fff; border-radius: 12px; }
  h1 { margin-top: 0; font-size: 1.4rem; color: #37003c; }
  p { line-height: 1.5; }
  a { display: inline-block; margin-top: 1rem; padding: .7rem 1.2rem; border-radius: 8px;
      background: #37003c; color: #fff; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>${escape(title)}</h1>
  <p>${escape(message)}</p>
  ${link ? `<a href="${escape(link)}">${escape(linkLabel || 'Continuar')}</a>` : ''}
</main>
</body>
</html>
`
