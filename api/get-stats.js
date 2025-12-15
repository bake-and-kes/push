import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { store_id } = req.query;

    // Obtener campañas
    const { data: campaigns, error } = await supabase
      .from('push_campaigns')
      .select('*')
      .eq('store_id', store_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({ campaigns });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}