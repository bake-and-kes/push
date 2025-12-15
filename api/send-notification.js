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

export default async function handler(req, res) {
  // ✅ AGREGAR ESTOS HEADERS CORS
   res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://dokuthub.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  // Manejar preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { title, body, icon, url, campaign_name, store_id, user_id } = req.body;

    // Validar autorización
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Crear campaña
    const { data: campaign, error: campaignError } = await supabase
      .from('push_campaigns')
      .insert([{
        store_id,
        user_id,
        name: campaign_name,
        title,
        body,
        icon,
        url,
        status: 'sent',
        sent_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (campaignError) throw campaignError;

    // Obtener suscriptores de esta tienda
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('store_id', store_id)
      .eq('is_active', true);

    if (subError) throw subError;

    // Preparar notificación
    const notification = {
      title,
      body,
      icon: icon || '/tls/ico.png',
      badge: '/tls/ico.png',
      data: {
        url: url || '/',
        campaign_id: campaign.id
      },
      actions: [
        { action: 'open', title: '👀 Ver' },
        { action: 'close', title: '✖️ Cerrar' }
      ]
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
        
        await supabase
          .from('push_sends')
          .insert([{
            campaign_id: campaign.id,
            subscription_id: sub.id,
            status: 'sent',
            sent_at: new Date().toISOString()
          }]);

        sentCount++;
      } catch (error) {
        console.error('Error enviando a:', sub.id, error);
        
        if (error.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        }
        
        failedCount++;
      }
    });

    await Promise.all(sendPromises);

    await supabase
      .from('push_campaigns')
      .update({
        sent_count: sentCount,
        failed_count: failedCount
      })
      .eq('id', campaign.id);

    res.status(200).json({
      success: true,
      campaign_id: campaign.id,
      sent: sentCount,
      failed: failedCount
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}

