function requiredEnv(name: string) {
  const v = String(process.env[name] ?? '').trim();
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function quickbooksEnv(): 'sandbox' | 'production' {
  const raw = String(process.env.QUICKBOOKS_ENV ?? '').trim().toLowerCase();
  return raw === 'production' ? 'production' : 'sandbox';
}

function base64Basic(user: string, pass: string) {
  return Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

function buildAuthorizeUrl() {
  const clientId = requiredEnv('QUICKBOOKS_CLIENT_ID');
  const redirectUri = requiredEnv('QUICKBOOKS_REDIRECT_URI');

  const qs = new URLSearchParams();
  qs.set('client_id', clientId);
  qs.set('scope', 'com.intuit.quickbooks.accounting');
  qs.set('redirect_uri', redirectUri);
  qs.set('response_type', 'code');
  qs.set('state', String(Date.now()));

  // Intuit uses the same authorize host for sandbox/production;
  // the environment is determined by the app credentials.
  return `https://appcenter.intuit.com/connect/oauth2?${qs.toString()}`;
}

// Use runtime express import (project has a minimal express.d.ts)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
export const quickbooksRouter = express.Router();

// GET /api/quickbooks/connect
quickbooksRouter.get('/connect', async (_req: any, res: any) => {
  try {
    const env = quickbooksEnv();
    const authUrl = buildAuthorizeUrl();
    console.log(`QuickBooks connect: env=${env}`);
    return res.redirect(authUrl);
  } catch (e) {
    console.error('QuickBooks connect error:', e);
    return res.status(500).json({ message: 'QuickBooks connect failed' });
  }
});

// GET /api/quickbooks/callback
quickbooksRouter.get('/callback', async (req: any, res: any) => {
  try {
    const code = String(req?.query?.code ?? '').trim();
    const realmId = String(req?.query?.realmId ?? '').trim();
    const err = String(req?.query?.error ?? '').trim();
    const errDesc = String(req?.query?.error_description ?? '').trim();

    // User cancelled/denied or Intuit returned an error
    if (err) {
      console.error('QuickBooks OAuth returned error:', { error: err, error_description: errDesc });
      return res
        .status(400)
        .send(
          [
            '<html><head><title>QuickBooks Connection Failed</title></head><body style="font-family: Arial, sans-serif;">',
            '<h2>QuickBooks connection failed.</h2>',
            `<p>Error: ${err}</p>`,
            errDesc ? `<p>${errDesc}</p>` : '',
            '</body></html>',
          ].join(''),
        );
    }

    if (!code) {
      console.error('QuickBooks callback missing code parameter');
      return res.status(400).send('QuickBooks OAuth failed: missing authorization code.');
    }

    const clientId = requiredEnv('QUICKBOOKS_CLIENT_ID');
    const clientSecret = requiredEnv('QUICKBOOKS_CLIENT_SECRET');
    const redirectUri = requiredEnv('QUICKBOOKS_REDIRECT_URI');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', redirectUri);

    const tokenRes = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      body.toString(),
      {
        headers: {
          Authorization: `Basic ${base64Basic(clientId, clientSecret)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 20000,
      },
    );

    const token = tokenRes?.data ?? {};

    // realmId is needed for QBO API calls later
    if (realmId) {
      console.log('QuickBooks realmId:', realmId);
    }

    console.log('QuickBooks OAuth token:', JSON.stringify(token, null, 2));

    return res
      .status(200)
      .send(
        [
          '<html><head><title>QuickBooks Connected</title></head><body style="font-family: Arial, sans-serif;">',
          '<h2>QuickBooks connected successfully.</h2>',
          '<p>You can close this window.</p>',
          '</body></html>',
        ].join(''),
      );
  } catch (e: any) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    console.error('QuickBooks callback error:', status || e?.message || e);
    if (data) console.error('QuickBooks token error response:', data);
    return res.status(500).send('QuickBooks OAuth failed. Check server logs.');
  }
});

