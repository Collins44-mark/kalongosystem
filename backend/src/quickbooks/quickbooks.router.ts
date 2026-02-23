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

    // Exchange the auth code in the redirect URL for tokens
    const authResponse = await oauthClient.createToken(req.url);
    const token = authResponse.getToken();

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

