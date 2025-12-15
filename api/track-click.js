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
    const { campaign_id, subscription_id } = req.body;

    await supabase
      .from('push_clicks')
      .insert([{
        campaign_id,
        subscription_id,
        clicked_at: new Date().toISOString()
      }]);

    const { data: campaign } = await supabase
      .from('push_campaigns')
      .select('click_count')
      .eq('id', campaign_id)
      .single();

    await supabase
      .from('push_campaigns')
      .update({ click_count: (campaign?.click_count || 0) + 1 })
      .eq('id', campaign_id);

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
