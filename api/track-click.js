import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { campaign_id, subscription_id } = req.body;

    // Registrar click
    await supabase
      .from('push_clicks')
      .insert([{
        campaign_id,
        subscription_id,
        clicked_at: new Date().toISOString()
      }]);

    // Incrementar contador en la campaña
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