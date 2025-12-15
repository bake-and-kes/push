import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
  'mailto:tu@email.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
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
    const { title, body, icon, url, campaign_name, store_id, user_id } = req.body;

    // Validar datos requeridos
    if (!title || !body || !store_id || !user_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan datos requeridos' 
      });
    }

    console.log('📤 Enviando notificación para tienda:', store_id);

    // Crear campaña
    const { data: campaign, error: campaignError } = await supabase
      .from('push_campaigns')
      .insert([{
        store_id,
        user_id,
        name: campaign_name || 'Campaña sin nombre',
        title,
        body,
        icon: icon || null,
        url: url || null,
        status: 'sent',
        sent_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (campaignError) {
      console.error('❌ Error creando campaña:', campaignError);
      throw campaignError;
    }

    console.log('✅ Campaña creada:', campaign.id);

    // Obtener suscriptores ACTIVOS de esta tienda
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('store_id', store_id)
      .eq('is_active', true);

    if (subError) {
      console.error('❌ Error obteniendo suscriptores:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('⚠️ No hay suscriptores activos para esta tienda');
      
      await supabase
        .from('push_campaigns')
        .update({ sent_count: 0, failed_count: 0 })
        .eq('id', campaign.id);

      return res.status(200).json({
        success: true,
        campaign_id: campaign.id,
        sent: 0,
        failed: 0,
        message: 'No hay suscriptores activos'
      });
    }

    console.log(`📧 Enviando a ${subscriptions.length} suscriptores`);

    // Preparar notificación
    const notification = {
      title,
      body,
      icon: icon || '/tls/ico.png',
      badge: '/tls/ico.png',
      data: {
        url: url || '/',
        campaign_id: campaign.id,
        store_id: store_id
      },
      actions: [
        { action: 'open', title: '👀 Ver' },
        { action: 'close', title: '✖️ Cerrar' }
      ],
      requireInteraction: false,
      vibrate: [200, 100, 200]
    };

    // Enviar a todos los suscriptores
    let sentCount = 0;
    let failedCount = 0;

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          JSON.stringify(notification)
        );
        
        // Registrar envío exitoso
        await supabase
          .from('push_sends')
          .insert([{
            campaign_id: campaign.id,
            subscription_id: sub.id,
            status: 'sent',
            sent_at: new Date().toISOString()
          }]);

        sentCount++;
        console.log(`✅ Enviado a suscriptor ${sub.id}`);
        
      } catch (error) {
        console.error(`❌ Error enviando a ${sub.id}:`, error.message);
        
        // Si el endpoint ya no es válido (410 Gone), desactivar suscripción
        if (error.statusCode === 410 || error.statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
          
          console.log(`🔕 Suscripción ${sub.id} desactivada (endpoint inválido)`);
        }
        
        // Registrar envío fallido
        await supabase
          .from('push_sends')
          .insert([{
            campaign_id: campaign.id,
            subscription_id: sub.id,
            status: 'failed',
            error_message: error.message,
            sent_at: new Date().toISOString()
          }]);
        
        failedCount++;
      }
    });

    await Promise.all(sendPromises);

    // Actualizar estadísticas de la campaña
    await supabase
      .from('push_campaigns')
      .update({
        sent_count: sentCount,
        failed_count: failedCount
      })
      .eq('id', campaign.id);

    console.log(`✅ Campaña completada - Enviados: ${sentCount}, Fallidos: ${failedCount}`);

    return res.status(200).json({
      success: true,
      campaign_id: campaign.id,
      sent: sentCount,
      failed: failedCount
    });

  } catch (error) {
    console.error('❌ Error general:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Error interno del servidor' 
    });
  }
}
