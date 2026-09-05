import { queryNamed } from '../db/database';

export class PlanService {
  public static async listPlans(activeOnly = false) {
    let sql = 'SELECT * FROM subscription_plans';
    if (activeOnly) {
      sql += ' WHERE is_active = TRUE';
    }
    sql += ' ORDER BY duration_months ASC, price ASC';
    const res = await queryNamed(sql, {});
    return res.rows;
  }

  public static async getPlanById(id: string) {
    const res = await queryNamed('SELECT * FROM subscription_plans WHERE id = @id', { id });
    if (res.rows.length === 0) throw new Error('Subscription plan not found');
    return res.rows[0];
  }

  public static async createPlan(data: {
    name: string;
    description?: string;
    duration_months: number;
    price: number;
    max_branches?: number;
    is_active?: boolean;
  }) {
    if (!data.name || !data.duration_months) {
      throw new Error('Plan name and duration in months are required');
    }

    const res = await queryNamed(
      `INSERT INTO subscription_plans (name, description, duration_months, price, max_branches, is_active)
       VALUES (@name, @description, @durationMonths, @price, @maxBranches, @isActive)
       RETURNING *`,
      {
        name: data.name,
        description: data.description || null,
        durationMonths: parseInt(String(data.duration_months)),
        price: parseFloat(String(data.price || 0)),
        maxBranches: parseInt(String(data.max_branches || 1)),
        isActive: data.is_active !== undefined ? Boolean(data.is_active) : true,
      }
    );
    return res.rows[0];
  }

  public static async updatePlan(id: string, data: {
    name?: string;
    description?: string;
    duration_months?: number;
    price?: number;
    max_branches?: number;
    is_active?: boolean;
  }) {
    const res = await queryNamed(
      `UPDATE subscription_plans
       SET name = COALESCE(@name, name),
           description = COALESCE(@description, description),
           duration_months = COALESCE(@durationMonths, duration_months),
           price = COALESCE(@price, price),
           max_branches = COALESCE(@maxBranches, max_branches),
           is_active = COALESCE(@isActive, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = @id
       RETURNING *`,
      {
        id,
        name: data.name || null,
        description: data.description !== undefined ? data.description : null,
        durationMonths: data.duration_months !== undefined ? parseInt(String(data.duration_months)) : null,
        price: data.price !== undefined ? parseFloat(String(data.price)) : null,
        maxBranches: data.max_branches !== undefined ? parseInt(String(data.max_branches)) : null,
        isActive: data.is_active !== undefined ? Boolean(data.is_active) : null,
      }
    );
    if (res.rows.length === 0) throw new Error('Plan not found or could not be updated');
    return res.rows[0];
  }

  public static async deletePlan(id: string) {
    // Soft delete by deactivating plan to avoid cascading errors on existing subscriptions
    const res = await queryNamed(
      `UPDATE subscription_plans SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = @id RETURNING *`,
      { id }
    );
    if (res.rows.length === 0) throw new Error('Plan not found');
    return res.rows[0];
  }
}
