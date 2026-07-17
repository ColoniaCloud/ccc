// Los módulos de billing validan sus env vars al importarse. En CI no hay
// credenciales reales, así que les damos valores dummy — los tests solo
// ejercitan lógica pura (parsing, firma), nunca llaman a las APIs reales.
process.env.DATABASE_URL          ??= 'postgresql://user:pass@localhost:5432/test'
process.env.BETTER_AUTH_SECRET    ??= 'dummy-auth-secret'
process.env.MERCADOPAGO_ACCESS_TOKEN ??= 'TEST-dummy-access-token'
process.env.MERCADOPAGO_WEBHOOK_SECRET ??= 'dummy-webhook-secret'
process.env.NOWPAYMENTS_API_KEY   ??= 'dummy-api-key'
process.env.NOWPAYMENTS_EMAIL     ??= 'test@example.com'
process.env.NOWPAYMENTS_PASSWORD  ??= 'dummy-password'
process.env.NOWPAYMENTS_IPN_SECRET ??= 'dummy-ipn-secret'
