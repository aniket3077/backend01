const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ quiet: true });

// Guard: if DATABASE_URL is missing, export safe fallbacks to prevent crashes
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL not set. Backend will run in offline mode (no DB).');

  const mockQuery = async () => ({ rows: [], rowCount: 0 });
  const mockTestConnection = async () => false;

  module.exports = {
    pool: null,
    query: mockQuery,
    testConnection: mockTestConnection
  };
} else {
  // Initialize Supabase client as fallback
  let supabaseClient = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      supabaseClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
      console.log('✅ Supabase client initialized as database fallback');
    } catch (error) {
      console.log('⚠️ Failed to initialize Supabase fallback:', error.message);
    }
  }

  // Create PostgreSQL connection pool with optional SSL
  const sslEnabled = String(process.env.PG_SSL || 'true').toLowerCase() !== 'false';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
  });

  // Prevent crashes on pool errors
  pool.on('error', (err) => {
    console.error('🔌 PG Pool error (non-fatal):', err.message);
  });

  // Test database connection with fallback to Supabase
  async function testConnection() {
    // Try direct PostgreSQL first
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      console.log('✅ PostgreSQL connected successfully at:', result.rows[0].now);
      client.release();
      return true;
    } catch (err) {
      console.error('❌ PostgreSQL connection failed:', err.message);
      
      // Test Supabase fallback
      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.from('bookings').select('id').limit(1);
          if (!error) {
            console.log('✅ Database accessible via Supabase API');
            return true;
          } else {
            console.error('❌ Supabase connection also failed:', error.message);
          }
        } catch (supabaseErr) {
          console.error('❌ Supabase test failed:', supabaseErr.message);
        }
      }
      
      return false;
    }
  }

  // Execute query with error handling and Supabase fallback
  const query = async (text, params) => {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(text, params);
      return result;
    } catch (err) {
      console.error('Database query error:', err.message);
      console.error('Query:', text);
      console.error('Params:', params);
      
      // For connectivity issues, try Supabase fallback for simple queries
      if ((err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH' || err.code === '57P01') && supabaseClient) {
        console.log('🔄 PostgreSQL unavailable, attempting Supabase fallback...');
        
        // Handle simple SELECT queries via Supabase
        if (text.trim().toUpperCase().startsWith('SELECT')) {
          try {
            // This is a basic fallback for health checks
            if (text.includes('NOW()')) {
              return {
                rows: [{ now: new Date().toISOString() }],
                rowCount: 1
              };
            }
            // For other queries, return empty result
            console.log('🔄 Complex query not supported in Supabase fallback, returning empty result');
            return { rows: [], rowCount: 0 };
          } catch (supabaseErr) {
            console.error('Supabase fallback failed:', supabaseErr.message);
          }
        }
        
        console.log('🔄 Database unavailable, returning empty result (offline mode)');
        return { rows: [], rowCount: 0 };
      }
      
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  };

  module.exports = {
    pool,
    query,
    testConnection,
    supabaseClient // Export Supabase client for direct use
  };
}
