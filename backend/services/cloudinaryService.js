const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary with environment variables
const configureCloudinary = () => {
  if (process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && 
      process.env.CLOUDINARY_API_SECRET) {
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
    
    console.log('✅ Cloudinary configured successfully');
    return true;
  } else {
    console.log('⚠️ Cloudinary not configured - missing environment variables');
    return false;
  }
};

class CloudinaryService {
  constructor() {
    this.configured = configureCloudinary();
  }

  isReady() {
    return this.configured;
  }

  getStatus() {
    return {
      configured: this.configured,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ? '***configured***' : 'missing',
      apiKey: process.env.CLOUDINARY_API_KEY ? '***configured***' : 'missing',
      apiSecret: process.env.CLOUDINARY_API_SECRET ? '***configured***' : 'missing'
    };
  }

  async uploadFile(filePath, options = {}) {
    try {
      if (!this.configured) {
        return {
          success: false,
          error: 'Cloudinary not configured'
        };
      }

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      const defaultOptions = {
        folder: 'dandiya-platform',
        resource_type: 'auto',
        use_filename: true,
        unique_filename: false,
        overwrite: true
      };

      const uploadOptions = { ...defaultOptions, ...options };
      
      console.log(`📤 Uploading ${filePath} to Cloudinary...`);
      const result = await cloudinary.uploader.upload(filePath, uploadOptions);
      
      console.log('✅ Cloudinary upload successful:', result.public_id);
      
      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format,
        width: result.width,
        height: result.height,
        resourceType: result.resource_type
      };
    } catch (error) {
      console.error('❌ Cloudinary upload failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async uploadBuffer(buffer, filename, options = {}) {
    try {
      if (!this.configured) {
        return {
          success: false,
          error: 'Cloudinary not configured'
        };
      }

      return new Promise((resolve, reject) => {
        const defaultOptions = {
          folder: 'dandiya-platform',
          resource_type: 'auto',
          public_id: filename.split('.')[0],
          use_filename: true,
          unique_filename: false,
          overwrite: true
        };

        const uploadOptions = { ...defaultOptions, ...options };

        cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              console.error('❌ Cloudinary buffer upload failed:', error.message);
              resolve({
                success: false,
                error: error.message
              });
            } else {
              console.log('✅ Cloudinary buffer upload successful:', result.public_id);
              resolve({
                success: true,
                url: result.secure_url,
                publicId: result.public_id,
                bytes: result.bytes,
                format: result.format,
                width: result.width,
                height: result.height,
                resourceType: result.resource_type
              });
            }
          }
        ).end(buffer);
      });
    } catch (error) {
      console.error('❌ Cloudinary buffer upload failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteFile(publicId) {
    try {
      if (!this.configured) {
        return {
          success: false,
          error: 'Cloudinary not configured'
        };
      }

      console.log(`🗑️ Deleting ${publicId} from Cloudinary...`);
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        console.log('✅ Cloudinary deletion successful');
        return {
          success: true,
          result: result.result
        };
      } else {
        console.log('⚠️ Cloudinary deletion failed:', result.result);
        return {
          success: false,
          error: result.result
        };
      }
    } catch (error) {
      console.error('❌ Cloudinary deletion failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUploadSignature(paramsToSign) {
    try {
      if (!this.configured) {
        return {
          success: false,
          error: 'Cloudinary not configured'
        };
      }

      const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        process.env.CLOUDINARY_API_SECRET
      );

      return {
        success: true,
        signature,
        timestamp: paramsToSign.timestamp,
        apiKey: process.env.CLOUDINARY_API_KEY
      };
    } catch (error) {
      console.error('❌ Cloudinary signature generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create a singleton instance
const cloudinaryService = new CloudinaryService();

module.exports = cloudinaryService;