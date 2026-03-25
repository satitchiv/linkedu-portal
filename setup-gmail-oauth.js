// setup-gmail-oauth.js
// Run ONCE locally to get a Gmail refresh token.
// Usage: node setup-gmail-oauth.js
// Prerequisites: npm install googleapis (or it's already in node_modules)
//
// After running, copy the printed refresh token into your .env:
//   GMAIL_REFRESH_TOKEN=<token>

const { google } = require('googleapis')
const readline = require('readline')

// Fill these in from your downloaded OAuth2 JSON, or set env vars before running:
//   GMAIL_CLIENT_ID=...
//   GMAIL_CLIENT_SECRET=...
const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     || 'PASTE_YOUR_CLIENT_ID_HERE'
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'PASTE_YOUR_CLIENT_SECRET_HERE'
const REDIRECT_URI  = 'urn:ietf:wg:oauth:2.0:oob'   // Desktop app — no redirect server needed

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Forces refresh_token to be returned every time
})

console.log('\n─────────────────────────────────────────────────────────')
console.log('Gmail OAuth Setup')
console.log('─────────────────────────────────────────────────────────')
console.log('\n1. Open this URL in your browser (sign in as satit@linkedu.hk):')
console.log('\n' + authUrl + '\n')
console.log('2. Grant Gmail read permission')
console.log('3. Copy the authorization code shown on screen')
console.log('─────────────────────────────────────────────────────────\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close()
  try {
    const { tokens } = await oauth2Client.getToken(code.trim())
    console.log('\n─────────────────────────────────────────────────────────')
    console.log('SUCCESS — Add these to your .env and Netlify dashboard:')
    console.log('─────────────────────────────────────────────────────────')
    console.log(`\nGMAIL_CLIENT_ID=${CLIENT_ID}`)
    console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`)
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log('\n─────────────────────────────────────────────────────────')
    if (!tokens.refresh_token) {
      console.log('\nWARNING: No refresh token returned.')
      console.log('This usually means you already granted access without prompt:consent.')
      console.log('Go to https://myaccount.google.com/permissions, revoke the app, and run this script again.\n')
    }
  } catch (err) {
    console.error('\nERROR getting tokens:', err.message)
    console.error('Make sure CLIENT_ID and CLIENT_SECRET are correct.')
  }
})
