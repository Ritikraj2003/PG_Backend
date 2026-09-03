import { queryNamed } from '../db/database';
import firebaseApp from '../config/firebase';

export class NotificationService {
  public static async registerDeviceToken(userId: string, token: string, platform: string = 'WEB') {
    await queryNamed(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES (@userId, @token, @platform)
       ON CONFLICT (token) DO UPDATE SET user_id = @userId, platform = @platform`,
      { userId, token, platform }
    );
  }

  public static async sendPushNotification(userId: string, title: string, message: string, type: string = 'INFO') {
    // 1. Save in database
    await queryNamed(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (@userId, @title, @message, @type)`,
      { userId, title, message, type }
    );

    // 2. Send via Firebase FCM if initialized
    if (!firebaseApp) return;

    try {
      const tokenRes = await queryNamed(
        'SELECT token FROM device_tokens WHERE user_id = @userId',
        { userId }
      );

      const tokens = tokenRes.rows.map(r => r.token);
      if (tokens.length > 0) {
        await firebaseApp.messaging().sendEachForMulticast({
          tokens,
          notification: { title, body: message },
          data: { type },
        });
      }
    } catch (err) {
      console.error('Error sending FCM push notification:', err);
    }
  }
}
