import pool from '../db/database';
import firebaseApp from '../config/firebase';

export class NotificationService {
  public static async registerDeviceToken(userId: string, token: string, platform: string = 'WEB') {
    await pool.query(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3`,
      [userId, token, platform]
    );
  }

  public static async sendPushNotification(userId: string, title: string, message: string, type: string = 'INFO') {
    // 1. Save in database
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [userId, title, message, type]
    );

    // 2. Send via Firebase FCM if initialized
    if (!firebaseApp) return;

    try {
      const tokenRes = await pool.query(
        'SELECT token FROM device_tokens WHERE user_id = $1',
        [userId]
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
