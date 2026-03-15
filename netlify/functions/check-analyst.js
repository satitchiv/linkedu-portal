// GET /api/check-analyst
// Returns { isAnalyst: bool } for the given Bearer JWT
// Uses service role to bypass the broken RLS policy on user_profiles

const { isAuthorizedAnalyst } = require('./utils/auth')

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    const isAnalyst = await isAuthorizedAnalyst(event)
    return { statusCode: 200, headers, body: JSON.stringify({ isAnalyst: !!isAnalyst }) }
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ isAnalyst: false }) }
  }
}
