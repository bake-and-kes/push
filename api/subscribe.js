import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
};

export default async function handler(req, res) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  try {
    const { endpoint, p256dh, auth, store_id, user_agent } = req.body;

    // Validar datos requeridos
    if (!endpoint || !p256dh || !auth || !store_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan datos requeridos (endpoint, p256dh, auth, store_id)' 
      });
    }

    console.log('📝 Guardando suscripción para tienda:', store_id);

    // Verificar si ya existe esta suscripción
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id, is_active')
      .eq('endpoint', endpoint)
      .eq('store_id', store_id)
      .maybeSingle();

    if (existing) {
      // Si existe, reactivarla y actualizar
      const { data, error } = await supabase
        .from('push_subscriptions')
        .update({
          p256dh,
          auth,
          is_active: true,
          last_seen: new Date().toISOString(),
          user_agent: user_agent || null
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Suscripción actualizada:', data.id);
      
      return res.status(200).json({
        success: true,
        subscription_id: data.id,
        message: 'Suscripción actualizada'
      });
    }

    // Si no existe, crear nueva suscripción
    const { data, error } = await supabase
      .from('push_subscriptions')
      .insert([{
        endpoint,
        p256dh,
        auth,
        store_id,
        user_agent: user_agent || null,
        is_active: true,
        last_seen: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Error guardando suscripción:', error);
      throw error;
    }

    console.log('✅ Nueva suscripción creada:', data.id);

    return res.status(200).json({
      success: true,
      subscription_id: data.id,
      message: 'Suscripción guardada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Error interno del servidor' 
    });
  }
}
