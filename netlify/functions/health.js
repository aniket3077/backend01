exports.handler = async (event, context) => {
  console.log('=== HEALTH CORS TEST ===');
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
    console.log('OPTIONS request - returning CORS headers');
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  // Regular health check response
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      status: 'healthy',
      message: 'Direct health check working',
      timestamp: new Date().toISOString(),
      origin: event.headers.origin
    })
  };
};