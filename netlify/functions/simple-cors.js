// Basic CORS test function - no Express dependencies
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://malangevents.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    'Content-Type': 'application/json'
  };
  
  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      message: 'Simple CORS test',
      method: event.httpMethod,
      origin: event.headers.origin || 'no-origin',
      timestamp: new Date().toISOString()
    })
  };
};