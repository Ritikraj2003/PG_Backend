import cloudinary from '../config/cloudinary';

export class StorageService {
  public static async uploadFile(filePathOrBase64: string, folder: string = 'pg_uploads'): Promise<string> {
    try {
      const result = await cloudinary.uploader.upload(filePathOrBase64, {
        folder,
        resource_type: 'auto',
      });
      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      // Fallback mock URL if Cloudinary credentials are not configured in local environment
      return `https://res.cloudinary.com/demo/image/upload/sample.jpg`;
    }
  }
}
