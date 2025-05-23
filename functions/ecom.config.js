/* eslint-disable comma-dangle, no-multi-spaces, key-spacing */

/**
 * Edit base E-Com Plus Application object here.
 * Ref.: https://developers.e-com.plus/docs/api/#/store/applications/
 */

const app = {
  app_id: 102418,
  title: 'Bling ERP V2 - BETA',
  slug: 'bling-erp-v2',
  type: 'external',
  state: 'active',
  authentication: true,

  /**
   * Uncomment modules above to work with E-Com Plus Mods API on Storefront.
   * Ref.: https://developers.e-com.plus/modules-api/
   */
  modules: {
    /**
     * Triggered to calculate shipping options, must return values and deadlines.
     * Start editing `routes/ecom/modules/calculate-shipping.js`
     */
    // calculate_shipping:   { enabled: true },

    /**
     * Triggered to validate and apply discount value, must return discount and conditions.
     * Start editing `routes/ecom/modules/apply-discount.js`
     */
    // apply_discount:       { enabled: true },

    /**
     * Triggered when listing payments, must return available payment methods.
     * Start editing `routes/ecom/modules/list-payments.js`
     */
    // list_payments:        { enabled: true },

    /**
     * Triggered when order is being closed, must create payment transaction and return info.
     * Start editing `routes/ecom/modules/create-transaction.js`
     */
    // create_transaction:   { enabled: true },
  },

  /**
   * Uncomment only the resources/methods your app may need to consume through Store API.
   */
  auth_scope: {
    'stores/me': [
      'GET'            // Read store info
    ],
    procedures: [
      'POST'           // Create procedures to receive webhooks
    ],
    products: [
      'GET',           // Read products with public and private fields
      'POST',          // Create products
      'PATCH',         // Edit products
      // 'PUT',           // Overwrite products
      // 'DELETE',        // Delete products
    ],
    brands: [
      'GET',           // List/read brands with public and private fields
      'POST',          // Create brands
      'PATCH',         // Edit brands
      // 'PUT',           // Overwrite brands
      // 'DELETE',        // Delete brands
    ],
    categories: [
      'GET',           // List/read categories with public and private fields
      'POST',          // Create categories
      'PATCH',         // Edit categories
      // 'PUT',           // Overwrite categories
      // 'DELETE',        // Delete categories
    ],
    customers: [
      'GET',           // List/read customers
      'POST',          // Create customers
      'PATCH',         // Edit customers
      // 'PUT',           // Overwrite customers
      // 'DELETE',        // Delete customers
    ],
    orders: [
      'GET',           // List/read orders with public and private fields
      'POST',          // Create orders
      'PATCH',         // Edit orders
      // 'PUT',           // Overwrite orders
      // 'DELETE',        // Delete orders
    ],
    carts: [
      'GET',           // List all carts (no auth needed to read specific cart only)
      'POST',          // Create carts
      'PATCH',         // Edit carts
      // 'PUT',           // Overwrite carts
      // 'DELETE',        // Delete carts
    ],

    /**
     * Prefer using 'fulfillments' and 'payment_history' subresources to manipulate update order status.
     */
    'orders/fulfillments': [
      'GET',           // List/read order fulfillment and tracking events
      'POST',          // Create fulfillment event with new status
      // 'DELETE',        // Delete fulfillment event
    ],
    'orders/payments_history': [
      'GET',           // List/read order payments history events
      'POST',          // Create payments history entry with new status
      // 'DELETE',        // Delete payments history entry
    ],

    /**
     * Set above 'quantity' and 'price' subresources if you don't need access for full product document.
     * Stock and price management only.
     */
    'products/quantity': [
      // 'GET',           // Read product available quantity
      'PUT',           // Set product stock quantity
    ],
    'products/variations/quantity': [
      // 'GET',           // Read variaton available quantity
      'PUT',           // Set variation stock quantity
    ],
    'products/price': [
      // 'GET',           // Read product current sale price
      // 'PUT',           // Set product sale price
    ],
    'products/variations/price': [
      // 'GET',           // Read variation current sale price
      // 'PUT',           // Set variation sale price
    ],

    /**
     * You can also set any other valid resource/subresource combination.
     * Ref.: https://developers.e-com.plus/docs/api/#/store/
     */
  },

  admin_settings: {
    client_id: {
      schema: {
        type: 'string',
        maxLength: 255,
        title: 'Client id',
        description: 'Client id gerado logo após a criação do aplicativo'
      },
      hide: true
    },
    client_secret: {
      schema: {
        type: 'string',
        maxLength: 255,
        title: 'Client secret',
        description: 'Client secret gerado logo após a criação do aplicativo'
      },
      hide: true
    },
    bling_store: {
      schema: {
        type: 'string',
        maxLength: 255,
        title: 'Código da loja no Bling',
        description: 'Opcional para multiloja no Bling'
      },
      hide: true
    },
    bling_deposit: {
      schema: {
        type: 'string',
        maxLength: 255,
        title: 'ID do depósito no Bling',
        description: 'Opcional para multi CD no Bling'
      },
      hide: true
    },
    new_orders: {
      schema: {
        type: 'boolean',
        default: true,
        title: 'Exportar novos pedidos',
        description: 'Criar novos pedidos no Bling automaticamente'
      },
      hide: true
    },
    approved_orders_only: {
      schema: {
        type: 'boolean',
        default: true,
        title: 'Apenas pedidos aprovados',
        description: 'Criar pedido no Bling após aprovação'
      },
      hide: true
    },
    random_order_number: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Randomizar número dos pedidos',
        description: 'Evita repetir número de pedidos de outros canais de venda integrados'
      },
      hide: true
    },
    disable_order_number: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Desabilitar envio de número do pedido',
        description: 'Número do pedido loja virtual pode ser repetido.'
      },
      hide: true
    },
    has_stock_reserve: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Ativou reserva de estoque no Bling?',
        description: 'Ativar, caso a opção considerar situações de vendas para obter o saldo atual estiver habilitada'
      },
      hide: true
    },
    new_products: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Exportar novos produtos',
        description: 'Criar novos produtos no Bling automaticamente'
      },
      hide: true
    },
    update_product: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Sobrescrever produtos',
        description: 'Atualizar cadastro (não apenas estoque) de produtos importados já existentes na plataforma'
      },
      hide: true
    },
    update_product_auto: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Sobrescrever produtos quando houver mudança de estoque',
        description: 'Atualizar cadastro (não apenas estoque) de produtos importados já existentes na plataforma quando for enviado alteração de estoque'
      },
      hide: true
    },
    non_update_description: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Desabilitar envio de descrição'
      },
      hide: true
    },
    import_product: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Importar produto',
        description: 'Ao receber callback de estoque, se o produto não existir na loja, criar'
      },
      hide: true
    },
    import_quantity: {
      schema: {
        type: 'boolean',
        default: true,
        title: 'Importar estoques',
        description: 'Atualizar estoques na plataforma, necessário cadastrar o "Callback de estoque" no Bling'
      },
      hide: true
    },
    export_quantity: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Exportar estoques',
        description: 'ATENÇÃO: ative apenas se o controle de estoque for centralizado na plataforma'
      },
      hide: true
    },
    export_price: {
      schema: {
        type: 'boolean',
        default: false,
        title: 'Exportar preços',
        description: 'Atualizar preços no Bling automaticamente'
      },
      hide: true
    },
    exportation: {
      schema: {
        title: 'Exportação manual',
        description: 'Fila a exportar para o Bling, serão removidos automaticamente após exportação',
        type: 'object',
        properties: {
          product_ids: {
            title: 'Produtos a exportar',
            type: 'array',
            items: {
              type: 'string',
              pattern: '^[a-f0-9]{24}$',
              title: 'ID do produto'
            }
          },
          order_ids: {
            title: 'Pedidos a exportar',
            type: 'array',
            items: {
              type: 'string',
              pattern: '^[a-f0-9]{24}$',
              title: 'ID do pedido'
            }
          }
        }
      },
      hide: false
    },
    importation: {
      schema: {
        title: 'Importação manual',
        description: 'Fila a importar do Bling, serão removidos automaticamente após importação',
        type: 'object',
        properties: {
          skus: {
            title: 'Produtos a importar',
            type: 'array',
            items: {
              type: 'string',
              title: 'SKU do produto ou variação',
              description: 'O estoque do produto será atualizado na plataforma se já existir com o mesmo SKU'
            }
          },
          order_numbers: {
            title: 'Pedidos a importar',
            type: 'array',
            items: {
              type: 'string',
              title: 'Número do pedido no Bling',
              description: 'Número único do pedido de venda no Bling'
            }
          }
        }
      },
      hide: false
    },
    bling_order_data: {
      schema: {
        title: 'Configuração para novos pedidos no Bling',
        description: 'Predefinições opcionais para pedidos exportados da plataforma para o Bling',
        type: 'object',
        properties: {
          nat_operacao: {
            type: 'string',
            maxLength: 60,
            title: 'Natureza da operação'
          },
          vendedor: {
            type: 'string',
            maxLength: 100,
            title: 'Nome do vendedor'
          },
          vlr_frete: {
            type: 'number',
            minimum: 0,
            maximum: 999999,
            title: 'Fixar valor do frete',
            description: 'Por padrão será enviado o frete original de cada pedido'
          },
          vlr_desconto: {
            type: 'number',
            minimum: 0,
            maximum: 999999,
            title: 'Fixar valor do desconto',
            description: 'Por padrão será enviado o desconto original de cada pedido'
          },
          outrasDespesas: {
            type: 'number',
            minimum: 0,
            maximum: 999999,
            title: 'Outras despesas da venda'
          }
        }
      },
      hide: true
    },
    parse_status: {
      schema: {
        type: 'array',
        title: 'Correspondência de atualização de status',
        description: 'Poderá criar correspondências exatas de status de acordo com a sua necessidade',
        uniqueItems: true,
        items: {
          type: 'object',
          properties: {
            status_ecom: {
              title: 'Status e-com.plus',
              type: 'string',
              enum: [
                'Pendente',
                'Em análise',
                'Autorizado',
                'Não autorizado',
                'Parte pago',
                'Pago',
                'Disputa',
                'Parte devolvido',
                'Devolvido',
                'Cancelado',
                'Em produção',
                'Em separação',
                'Pronto para envio',
                'NF emitida',
                'Enviado',
                'Parte enviado',
                'Parte entregue',
                'Entregue',
                'Retorno e troca',
                'Aguardando troca'
              ],
            },
            status_bling: {
              type: 'string',
              title: 'Nome do status Bling',
              description: 'Informe o nome do status correspondente no bling'
            }
          }
        }
      },
      hide: false
    },
    parse_payment: {
      schema: {
        type: 'array',
        title: 'Correspondência de formas de pagamento',
        description: 'Poderá criar correspondências exatas entre formas de pagamento da plataforma e Bling',
        uniqueItems: true,
        items: {
          type: 'object',
          properties: {
            ecom_payment: {
              title: 'Nome do método de pagamento na E-Com Plus. (Ex: Boleto Bancário - Braspag)',
              type: 'string'
            },
            bling_payment: {
              type: 'number',
              title: 'Id da forma de pagamento correspondente no Bling'
            }
          }
        }
      },
      hide: false
    },
    parse_shipping: {
      schema: {
        type: 'array',
        title: 'Correspondência de formas de envio',
        description: 'Poderá criar correspondências exatas entre formas de envio da plataforma e Bling',
        uniqueItems: true,
        items: {
          type: 'object',
          properties: {
            ecom_shipping: {
              title: 'Rótulo da forma de envio na E-Com Plus',
              type: 'string'
            },
            bling_shipping: {
              type: 'string',
              title: 'Id da forma de envio correspondente no Bling'
            }
          }
        }
      },
      hide: false
    },
    logs: {
      schema: {
        title: 'Logs',
        type: 'array',
        maxItems: 300,
        items: {
          title: 'Registro de log',
          type: 'object',
          properties: {
            resource: {
              type: 'string',
              maxLength: 255,
              title: 'Recurso'
            },
            resource_id: {
              type: 'string',
              pattern: '^[a-f0-9]{24}$',
              title: 'ID do recurso'
            },
            bling_id: {
              type: 'string',
              maxLength: 255,
              title: 'ID do recurso no Bling'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              title: 'Horário'
            },
            success: {
              type: 'boolean',
              default: true,
              title: 'Sucesso'
            },
            notes: {
              type: 'string',
              maxLength: 5000,
              title: 'Notas'
            }
          }
        }
      },
      hide: true
    }
  }
}

/**
 * List of Procedures to be created on each store after app installation.
 * Ref.: https://developers.e-com.plus/docs/api/#/store/procedures/
 */

const procedures = []

/**
 * Uncomment and edit code above to configure `triggers` and receive respective `webhooks`:
 */

const { baseUri } = require('./__env')

procedures.push({
  title: app.title,

  triggers: [
    // Receive notifications when order financial/fulfillment status changes:
    {
      resource: 'orders',
      field: 'financial_status',
    },
    {
      resource: 'orders',
      field: 'fulfillment_status',
    },

    // Receive notifications when products/variations prices or quantities changes:
    {
      resource: 'products',
      field: 'price',
    },
    {
      resource: 'products',
      subresource: 'variations',
      field: 'price',
    },
    {
      resource: 'products',
      field: 'quantity',
    },

    // Receive notifications when new product is created:
    {
      resource: 'products',
      action: 'create',
    },

    /* Receive notifications when cart is edited:
    {
      resource: 'carts',
      action: 'change',
    },

    // Receive notifications when customer is deleted:
    {
      resource: 'customers',
      action: 'delete',
    },

    // Feel free to create custom combinations with any Store API resource, subresource, action and field.
    */
  ],

  webhooks: [
    {
      api: {
        external_api: {
          uri: `${baseUri}/ecom/webhook`
        }
      },
      method: 'POST'
    }
  ]
})

/*
 * You may also edit `routes/ecom/webhook.js` to treat notifications properly.
 */

exports.app = app

exports.procedures = procedures
