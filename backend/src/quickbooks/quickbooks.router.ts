import * as crypto from 'crypto';

function requiredEnv(name: string) {
  const v = String(process.env[name] ?? '').trim();
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function createOAuthClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OAuthClient = require('intuit-oauth');

  const environmentRaw = String(process.env.QUICKBOOKS_ENV ?? '').trim().toLowerCase();
  const environment = environmentRaw === 'production' ? 'production' : 'sandbox';

  return new OAuthClient({
    clientId: requiredEnv('QUICKBOOKS_CLIENT_ID'),
    clientSecret: requiredEnv('QUICKBOOKS_CLIENT_SECRET'),
    environment,
    redirectUri: requiredEnv('QUICKBOOKS_REDIRECT_URI'),
  });
}

// Use runtime express import (project has a minimal express.d.ts)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
export const quickbooksRouter = express.Router();

// GET /api/quickbooks/connect
quickbooksRouter.get('/connect', async (_req: any, res: any) => {
  try {
    const oauthClient = createOAuthClient();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OAuthClient = require('intuit-oauth');

    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: crypto.randomBytes(16).toString('hex'),
    });

    return res.redirect(authUri);
  } catch (e) {
    console.error('QuickBooks connect error:', e);
    return res.status(500).json({ message: 'QuickBooks connect failed' });
  }
});

// GET /api/quickbooks/callback
quickbooksRouter.get('/callback', async (req: any, res: any) => {
  try {
    const oauthClient = createOAuthClient();

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

    // Exchange the auth code in the redirect URL for tokens
    // Prefer originalUrl (includes mount path) for reliability behind mounted routers/proxies
    const redirectUrl = String(req?.originalUrl || req?.url || '');
    const authResponse = await oauthClient.createToken(redirectUrl);
    const token = authResponse.getToken();

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
    console.error('QuickBooks callback error:', e?.originalMessage || e);
    if (e?.error || e?.error_description || e?.intuit_tid) {
      console.error('QuickBooks OAuth details:', {
        error: e?.error,
        error_description: e?.error_description,
        intuit_tid: e?.intuit_tid,
      });
    }
    return res.status(500).send('QuickBooks OAuth failed. Check server logs.');
  }
});

