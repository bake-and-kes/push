import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper para configurar CORS
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
};

export default async function handler(req, res) {
  // Configurar CORS
  setCorsHeaders(res);
  
  // Manejar preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  try {
    const { campaign_id, subscription_id } = req.body;

    // Validar datos requeridos
    if (!campaign_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere campaign_id' 
      });
    }

    console.log('👆 Registrando click para campaña:', campaign_id);

    // Registrar el click
    const { error: clickError } = await supabase
      .from('push_clicks')
      .insert([{
        campaign_id,
        subscription_id: subscription_id || null,
        clicked_at: new Date().toISOString()
      }]);

    if (clickError) {
      console.error('❌ Error registrando click:', clickError);
      // No lanzar error, solo logear
    }

    // Obtener el conteo actual de clicks
    const { data: campaign, error: campaignError } = await supabase
      .from('push_campaigns')
      .select('click_count')
      .eq('id', campaign_id)
      .single();

    if (campaignError) {
      console.error('❌ Error obteniendo campaña:', campaignError);
      throw campaignError;
    }

    // Incrementar el contador de clicks
    const newClickCount = (campaign?.click_count || 0) + 1;

    const { error: updateError } = await supabase
      .from('push_campaigns')
      .update({ click_count: newClickCount })
      .eq('id', campaign_id);

    if (updateError) {
      console.error('❌ Error actualizando clicks:', updateError);
      throw updateError;
    }

    console.log(`✅ Click registrado. Total: ${newClickCount}`);

    return res.status(200).json({ 
      success: true,
      click_count: newClickCount
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Error interno del servidor' 
    });
  }
}
