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
    const { title, body, icon, url, campaign_name, store_id, user_id, scheduled_for } = req.body;

    // Validar datos requeridos
    if (!title || !body || !store_id || !user_id || !scheduled_for) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan datos requeridos' 
      });
    }

    // Validar que la fecha sea futura
    const scheduledDate = new Date(scheduled_for);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ 
        success: false, 
        error: 'La fecha debe ser futura' 
      });
    }

    console.log('📅 Programando notificación para:', scheduledDate.toISOString());

    // Crear campaña programada
    const { data, error } = await supabase
      .from('push_campaigns')
      .insert([{
        store_id,
        user_id,
        name: campaign_name || 'Campaña programada',
        title,
        body,
        icon: icon || null,
        url: url || null,
        status: 'scheduled',
        scheduled_for: scheduledDate.toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creando campaña programada:', error);
      throw error;
    }

    console.log('✅ Campaña programada exitosamente:', data.id);

    return res.status(200).json({
      success: true,
      campaign_id: data.id,
      scheduled_for: scheduledDate.toISOString()
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Error interno del servidor' 
    });
  }
}
