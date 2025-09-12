const { createClient } = require('@supabase/supabase-js');

// Mock Prisma client for compatibility with existing code
class MockPrismaClient {
  constructor() {
    this._hasRealDatabase = false;
    this.supabase = null;
    
    // Initialize Supabase if credentials are available
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        this.supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_ANON_KEY
        );
        this._hasRealDatabase = true;
        console.log('✅ Supabase client initialized');
      } catch (error) {
        console.log('⚠️ Failed to initialize Supabase:', error.message);
        this._hasRealDatabase = false;
      }
    } else {
      console.log('⚠️ Supabase credentials not found');
    }

    // Mock Prisma model objects
    this.booking = {
      count: async (options = {}) => {
        if (!this.supabase) return 0;
        try {
          const { count } = await this.supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true });
          return count || 0;
        } catch (error) {
          console.error('Error counting bookings:', error);
          return 0;
        }
      },

      findMany: async (options = {}) => {
        if (!this.supabase) return [];
        try {
          let query = this.supabase.from('bookings').select('*');
          
          if (options.take) {
            query = query.limit(options.take);
          }
          
          if (options.orderBy) {
            // Simple orderBy implementation
            const field = Object.keys(options.orderBy)[0];
            const direction = options.orderBy[field] === 'desc' ? false : true;
            query = query.order(field, { ascending: direction });
          }

          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        } catch (error) {
          console.error('Error fetching bookings:', error);
          return [];
        }
      },

      aggregate: async (options = {}) => {
        if (!this.supabase) return { _sum: { final_amount: null } };
        try {
          // This is a simplified implementation
          // Real implementation would need proper aggregation
          const { data } = await this.supabase
            .from('bookings')
            .select('final_amount');
          
          const sum = data?.reduce((total, item) => total + (item.final_amount || 0), 0) || 0;
          return { _sum: { final_amount: sum } };
        } catch (error) {
          console.error('Error aggregating bookings:', error);
          return { _sum: { final_amount: null } };
        }
      },

      groupBy: async (options = {}) => {
        if (!this.supabase) return [];
        // Simplified groupBy - would need proper implementation for production
        return [];
      }
    };

    this.qrCode = {
      count: async (options = {}) => {
        if (!this.supabase) return 0;
        try {
          let query = this.supabase.from('qr_codes').select('*', { count: 'exact', head: true });
          
          if (options.where?.is_used) {
            query = query.eq('is_used', options.where.is_used);
          }

          const { count } = await query;
          return count || 0;
        } catch (error) {
          console.error('Error counting QR codes:', error);
          return 0;
        }
      },

      findMany: async (options = {}) => {
        if (!this.supabase) return [];
        try {
          let query = this.supabase.from('qr_codes').select('*');
          
          if (options.where?.is_used !== undefined) {
            query = query.eq('is_used', options.where.is_used);
          }
          
          if (options.take) {
            query = query.limit(options.take);
          }
          
          if (options.orderBy) {
            const field = Object.keys(options.orderBy)[0];
            const direction = options.orderBy[field] === 'desc' ? false : true;
            query = query.order(field, { ascending: direction });
          }

          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        } catch (error) {
          console.error('Error fetching QR codes:', error);
          return [];
        }
      }
    };

    this.user = {
      findMany: async (options = {}) => {
        if (!this.supabase) return [];
        try {
          const { data, error } = await this.supabase.from('users').select('*');
          if (error) throw error;
          return data || [];
        } catch (error) {
          console.error('Error fetching users:', error);
          return [];
        }
      }
    };

    this.payment = {
      findMany: async (options = {}) => {
        if (!this.supabase) return [];
        try {
          const { data, error } = await this.supabase.from('payments').select('*');
          if (error) throw error;
          return data || [];
        } catch (error) {
          console.error('Error fetching payments:', error);
          return [];
        }
      }
    };
  }

  async $connect() {
    // No-op for compatibility
    return Promise.resolve();
  }

  async $disconnect() {
    // No-op for compatibility
    return Promise.resolve();
  }
}

// Create and export the mock prisma client
const prisma = new MockPrismaClient();

module.exports = prisma;