exports.handler = async (event, context) => {
  console.log('Test function called');
  console.log('Origin:', event.headers.origin);
  console.log('Method:', event.httpMethod);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://malangevents.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  };
  
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  // Regular response
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ 
      message: 'Test CORS function working',
      origin: event.headers.origin,
      timestamp: new Date().toISOString()
    })
  };
};