import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // ✅ AGREGAR CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { title, body, icon, url, campaign_name, store_id, user_id, scheduled_for } = req.body;

    const scheduledDate = new Date(scheduled_for);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'La fecha debe ser futura' });
    }

    const { data, error } = await supabase
      .from('push_campaigns')
      .insert([{
        store_id,
        user_id,
        name: campaign_name,
        title,
        body,
        icon,
        url,
        status: 'scheduled',
        scheduled_for: scheduledDate.toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      campaign_id: data.id,
      scheduled_for: scheduledDate.toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
